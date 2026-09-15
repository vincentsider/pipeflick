import { Hono } from "hono";
import type { AppEnv } from "./access";
import {
  claimNextJob,
  createRun,
  failJob,
  finishDraft,
  finishOutlier,
  getRunView,
  getTranscript,
  listRuns,
  listTranscripts,
  listVoiceSamples,
  OUTLIER_EXCERPT_CHARS,
  resetRunJobs,
  setRunStatus,
  STALE_JOB_MS,
  type DraftView,
  type JobStatus,
  type OutlierView,
  type RunSummary,
  type RunView,
  type TranscriptSummary,
} from "./db";
import { Layout } from "./layout";
import { callStructured, OpenAIError } from "./openai";
import {
  buildDraftingInput,
  buildExtractionInput,
  DRAFT_INSTRUCTIONS,
  DRAFT_SCHEMA,
  EXTRACT_INSTRUCTIONS,
  excerptTranscript,
  isGrounded,
  MAX_OUTLIER_CHARS,
  MAX_TRANSCRIPT_CHARS,
  MAX_OUTPUT_DRAFT,
  MAX_OUTPUT_EXTRACT,
  MAX_SAMPLES,
  MODEL_DRAFT,
  MODEL_EXTRACT,
  TEMPLATE_SCHEMA,
  TIMEOUT_DRAFT_MS,
  TIMEOUT_EXTRACT_MS,
  type DraftOutput,
  type Template,
} from "./prompts";

/**
 * The three form fields a run is started from. The first two are required; a
 * run needs 2 or 3 outliers (`createRun` throws outside that range, so this
 * route validates before calling it).
 */
const OUTLIER_FIELDS = ["outlier1", "outlier2", "outlier3"] as const;
const MIN_OUTLIERS = 2;
const MAX_OUTLIERS = OUTLIER_FIELDS.length;

/** Fireflies transcript ids, matching the guard in src/sources.tsx. */
const TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** Run ids are crypto.randomUUID(); reject junk before it reaches D1. */
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recorded against a draft job when delete-on-request has removed the run's
 * source transcript. Not an OpenAI code, and deliberately not retryable: no
 * number of retries brings a deleted transcript back.
 */
const TRANSCRIPT_GONE =
  "The transcript this run was started from has been deleted, so there is nothing to write from.";

/**
 * OpenAI's `invalid_api_key` message quotes the key back, masked to its prefix
 * and last four characters ("Incorrect API key provided: sk-proj-****abcd").
 * That message is otherwise safe to store and render, but CLAUDE.md forbids
 * rendering any part of a secret, so every `sk-` run is removed before the
 * message reaches D1. Matches OpenAI's own mask characters as well as the key
 * alphabet, so a partially starred key is caught too.
 */
const KEY_FRAGMENT = /sk-[A-Za-z0-9_*-]+/g;

function scrubKey(message: string): string {
  return message.replace(KEY_FRAGMENT, "the configured key");
}

/** Pause before the status page submits the next step to itself. */
const AUTO_ADVANCE_DELAY_MS = 400;

/** Ceiling on a Retry-After pause the page will honour, in seconds. */
const MAX_RETRY_AFTER_SECONDS = 60;

/**
 * How many times a single job may be claimed before the run stops and waits
 * for a human. `attempts` lives on the job row, so a page reload cannot reset
 * the counter that keeps a broken step from resubmitting forever.
 */
const MAX_ATTEMPTS = 2;

/**
 * `OpenAIError.retryable` is computed in src/openai.ts but never persisted —
 * only `error_code` reaches the job row — so the auto-advance guard has to map
 * the code back. The table lives in 03-02-SUMMARY.md.
 *
 * Default-deny: anything not listed below halts the run. That is the safe
 * direction. A wrong key (`invalid_api_key`), an exhausted balance
 * (`credit_balance_exhausted`) or a hit spend cap must never keep the page
 * resubmitting and burning the Free plan's daily request budget, and the cost
 * of being wrong the other way is one click on Continue. The four billing 429
 * codes are absent deliberately: they arrive with the same HTTP status as
 * ordinary rate limiting, so status alone cannot tell them apart.
 */
const RETRYABLE_ERROR_CODES = new Set([
  "timeout", // network failure or AbortSignal.timeout
  "rate_limit_exceeded", // 429 that is genuinely about pace
  "slow_down",
  "http_429", // 429 whose body carried no code
  "server_error", // OpenAI's own code on a 500
  "http_500",
  "http_503",
  "bad_body", // 2xx whose body would not parse
  "bad_json", // valid response, output that was not JSON
  "no_output", // no message item came back
  "failed", // response status "failed" with no code
  "incomplete_max_output_tokens", // truncated: worth exactly one more go
]);

function isRetryableCode(code: string | null): boolean {
  return code !== null && RETRYABLE_ERROR_CODES.has(code);
}

/**
 * Carry OpenAI's own Retry-After through the redirect. It rides on the error
 * object but never reaches the job row, and the status page needs it to set
 * the auto-advance delay. A query parameter costs no schema change and lives
 * exactly as long as it is useful: one redirect.
 */
function pauseQuery(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null || retryAfterSeconds <= 0) return "";
  return `?retry_after=${Math.min(Math.round(retryAfterSeconds), MAX_RETRY_AFTER_SECONDS)}`;
}

/** ISO timestamp to YYYY-MM-DD, falling back to the stored text. */
function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/** ISO timestamp to "YYYY-MM-DD HH:MM", falling back to the stored text. */
function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

/** parseBody gives string | File | arrays; runs only ever want text. */
function field(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function RunTable({ rows }: { rows: RunSummary[] }) {
  if (rows.length === 0) {
    return (
      <p>
        No runs yet. <a href="/runs/new">Start one.</a>
      </p>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Transcript</th>
          <th>Started</th>
          <th>Status</th>
          <th>Progress</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            <td>
              <a href={`/runs/${row.id}`}>{row.transcript_title ?? "(transcript deleted)"}</a>
            </td>
            <td>{formatDate(row.created_at)}</td>
            <td class={`status status-${row.status}`}>{row.status}</td>
            <td>{`${row.done_jobs} of ${row.total_jobs} done`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NewRunForm({
  transcripts,
  sampleCount,
}: {
  transcripts: TranscriptSummary[];
  sampleCount: number;
}) {
  if (transcripts.length === 0) {
    return (
      <p>
        A run needs one of your meeting transcripts to write from.{" "}
        <a href="/fireflies">Import one from Fireflies</a> first.
      </p>
    );
  }

  return (
    <form method="post" action="/runs">
      <p>
        <label for="transcript_id">Write from this transcript</label>
      </p>
      <p>
        <select id="transcript_id" name="transcript_id" required>
          {transcripts.map((row) => (
            <option value={row.id}>
              {`${row.title} — ${formatDate(row.meeting_date)}${
                row.body_chars > MAX_TRANSCRIPT_CHARS ? " (long — only the first part is used)" : ""
              }`}
            </option>
          ))}
        </select>
      </p>
      <p class="hint">Only your own lines were kept on import; that is all the model sees.</p>
      {/*
        Deliberately no number in the option label: the exact figure is
        lines-based and comes from the run page, and quoting characters here
        against lines there is how a user stops trusting both.
      */}
      <p class="hint">
        {`Long meetings are cut to the first ${MAX_TRANSCRIPT_CHARS} characters, on a line boundary. The run page shows exactly how much was used.`}
      </p>

      {/*
        Voice samples are the other half of the drafting input, and a run with
        none of them is the weakest version of what this does — worth saying
        before the run is paid for rather than after the drafts disappoint.
      */}
      {sampleCount === 0 ? (
        <p class="notice warn">
          No voice samples saved yet, so the drafts will have only this transcript to match your
          voice against. <a href="/sources">Paste a post or two you have written</a> first: it is
          the single biggest lever on whether the drafts sound like you.
        </p>
      ) : (
        <p class="hint">
          {`${sampleCount} voice sample${sampleCount === 1 ? "" : "s"} saved; the ${Math.min(sampleCount, MAX_SAMPLES)} most recent go into every draft.`}
        </p>
      )}

      <h3>Outlier posts</h3>
      <p class="hint">
        Paste the full text of two or three posts that performed unusually well in your market.
        Pipeflick breaks each one down into a reusable format, then refills it with your words.
      </p>
      <p class="hint">
        Pasting is the only route in. Fetching posts from LinkedIn by URL is out of scope and not
        compliant, so there is nothing to paste a link into.
      </p>
      {OUTLIER_FIELDS.map((name, index) => (
        <p>
          <label for={name}>
            {`Outlier ${index + 1}${index + 1 > MIN_OUTLIERS ? " (optional)" : ""}`}
          </label>
          <textarea
            id={name}
            name={name}
            rows={6}
            cols={70}
            maxlength={MAX_OUTLIER_CHARS}
            required={index + 1 <= MIN_OUTLIERS}
          ></textarea>
        </p>
      ))}
      <p>
        <button type="submit">Start run</button>
      </p>
    </form>
  );
}

/** Status word plus the attempt count once a job has been tried more than once. */
function StepStatus({ status, attempts = 0 }: { status: string; attempts?: number }) {
  return (
    <span class={`status status-${status}`}>
      {attempts > 1 ? `${status} · attempt ${attempts}` : status}
    </span>
  );
}

/**
 * How much of the transcript actually reached the model, stated exactly.
 *
 * Silence is the correct output for a run created before migration 0004: it
 * has no stored counts, and inventing one would be the over-claiming this
 * whole gap exists to fix. A cut transcript is a warning rather than an error
 * — the run is fine, but the drafts had less to work with than the executive
 * assumes, which is the one thing they cannot see from the output.
 */
function TranscriptCoverage({ used, total }: { used: number | null; total: number | null }) {
  if (used === null || total === null) return <></>;
  if (used >= total) {
    return <p class="hint">{`Using all ${total} lines of your transcript.`}</p>;
  }
  return (
    <p class="notice warn">
      {`Using the first ${used} of ${total} lines of your transcript. The rest was not sent. Shorter meetings, or splitting a long one, give the drafts more to work with.`}
    </p>
  );
}

/** OpenAI's own message and code. Never a stack, never a request body. */
function Failure({ code, message }: { code: string | null; message: string | null }) {
  if (!code && !message) return <p class="notice error">Failed, with no message recorded.</p>;
  return (
    <p class="notice error">
      {message ?? "Failed."}
      {code ? <span class="hint">{` (${code})`}</span> : ""}
    </p>
  );
}

/**
 * One line per pasted outlier: where its extraction got to, and enough of the
 * post to tell it from the others. The extracted template is deliberately
 * absent — OUTL-02, and `getRunView` does not even select the column.
 */
function TemplateSteps({ outliers }: { outliers: OutlierView[] }) {
  return (
    <ul class="steps">
      {outliers.map((outlier) => (
        <li>
          <p>
            <strong>{`Outlier ${outlier.position}`}</strong>{" "}
            <StepStatus status={outlier.status} attempts={outlier.attempts} />
          </p>
          <p class="hint">
            {outlier.excerpt.length >= OUTLIER_EXCERPT_CHARS
              ? `${outlier.excerpt}…`
              : outlier.excerpt}
          </p>
          {outlier.status === "failed" ? (
            <Failure code={outlier.error_code} message={outlier.error_message} />
          ) : (
            ""
          )}
        </li>
      ))}
    </ul>
  );
}

/** One block per draft: the post itself once it exists, its state until then. */
function DraftSection({ drafts }: { drafts: DraftView[] }) {
  return (
    <div>
      {drafts.map((draft) => (
        <div class="draft">
          <h4>
            {`Draft ${draft.position}`} <StepStatus status={draft.status} attempts={draft.attempts} />
          </h4>
          {draft.status === "failed" ? (
            <Failure code={draft.error_code} message={draft.error_message} />
          ) : (
            ""
          )}
          {draft.grounded === false ? (
            <p class="notice warn">
              Could not match this draft's quotes back to the transcript. Read it against your own
              words before approving.
            </p>
          ) : (
            ""
          )}
          {draft.body ? (
            <p class="draft-body">{draft.body}</p>
          ) : (
            <p class="hint">
              {draft.status === "failed" ? "No post was written." : "Not written yet."}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Steps done out of steps total, across both job tables. */
function progress(view: RunView): { done: number; total: number } {
  const jobs = [...view.outliers, ...view.drafts];
  return { done: jobs.filter((job) => job.status === "done").length, total: jobs.length };
}

/** Why the run is not continuing by itself, when it is not. */
type Halt = "permanent" | "attempts";

/** Everything the page needs to decide whether to keep going on its own. */
type Advance = {
  /** A pending job `claimNextJob` would genuinely take. */
  claimable: boolean;
  /** A job is 'running': another tab, or an invocation that never returned. */
  inFlight: boolean;
  /** The failure that halted the run, with the reason it is not retried. */
  stoppedBy: { job: OutlierView | DraftView; reason: Halt } | null;
  /** Render the self-submitting script. */
  auto: boolean;
  /** Anything for Retry to reset: at least one job has been attempted. */
  resettable: boolean;
};

/**
 * The auto-advance guard — the one piece of this phase that decides whether
 * the browser spends more money without being asked.
 *
 * The script is rendered only when ALL of these hold:
 *   1. there is claimable work, defined as exactly what `claimNextJob` will
 *      take rather than "not done": a draft whose outlier failed is pending
 *      forever, and counting it as work would make the page POST in a loop
 *      against a route that can only redirect back;
 *   2. nothing is already 'running', so two open tabs cannot ping-pong on a
 *      claim neither of them can win;
 *   3. the most recent failure, if any, was retryable and had been attempted
 *      fewer than MAX_ATTEMPTS times.
 *
 * Fail any of them and the form still renders, as a plain labelled button with
 * no script. Nothing is ever automatic and unstoppable.
 */
function planAdvance(view: RunView): Advance {
  const jobs: (OutlierView | DraftView)[] = [...view.outliers, ...view.drafts];
  const templated = new Set(
    view.outliers.filter((outlier) => outlier.status === "done").map((outlier) => outlier.id),
  );

  const claimable =
    view.outliers.some((outlier) => outlier.status === "pending") ||
    view.drafts.some((draft) => draft.status === "pending" && templated.has(draft.outlier_id));

  const inFlight = jobs.some((job) => job.status === "running");

  // "Most recent" in claim order — outliers by position, then drafts. The view
  // carries no timestamps, and this is the order the steps actually ran in.
  const lastFailure = jobs.filter((job) => job.status === "failed").at(-1) ?? null;

  let stoppedBy: Advance["stoppedBy"] = null;
  if (lastFailure) {
    if (!isRetryableCode(lastFailure.error_code)) {
      stoppedBy = { job: lastFailure, reason: "permanent" };
    } else if (lastFailure.attempts >= MAX_ATTEMPTS) {
      stoppedBy = { job: lastFailure, reason: "attempts" };
    }
  }

  return {
    claimable,
    inFlight,
    stoppedBy,
    auto: claimable && !inFlight && stoppedBy === null,
    resettable: jobs.some((job) => job.status !== "pending"),
  };
}

/**
 * Retry. `resetRunJobs` only touches rows that are not 'done', so this is
 * always cheap: whatever has already been paid for stays paid for once.
 */
function RetryForm({ runId }: { runId: string }) {
  return (
    <form method="post" action={`/runs/${runId}/retry`}>
      <p>
        <button type="submit">Retry unfinished steps</button>{" "}
        <span class="hint">Steps already finished are never re-run, so nothing is paid for twice.</span>
      </p>
    </form>
  );
}

/**
 * The engine's whole user interface: one POST form that submits itself.
 *
 * POST rather than a meta refresh or a link, for two reasons. A GET that
 * spends money is reachable from an `<img src>` and from a browser prefetch,
 * and only a POST goes through the app-wide `csrf()` Origin check. With
 * JavaScript off this degrades to a labelled button that still works.
 */
function RunControl({
  runId,
  done,
  total,
  advance,
  pauseSeconds,
}: {
  runId: string;
  done: number;
  total: number;
  advance: Advance;
  pauseSeconds: number;
}) {
  const delayMs = pauseSeconds > 0 ? pauseSeconds * 1000 : AUTO_ADVANCE_DELAY_MS;
  const finished = done === total;

  return (
    <div>
      {finished ? (
        <p class="notice">
          {`All ${total} steps are done; the drafts are below.`} Accepting, editing and rejecting
          them is Phase 4, so for now this page is read-only.
        </p>
      ) : (
        ""
      )}

      {!finished && !advance.resettable && advance.auto ? (
        <p class="notice">
          {`Nothing has run yet. This page starts the first step itself and keeps going until all ${total} are done.`}{" "}
          Each step is one OpenAI call, so leave the tab open.
        </p>
      ) : (
        ""
      )}

      {advance.stoppedBy ? (
        <p class="notice error">
          {advance.stoppedBy.reason === "permanent"
            ? "The run stopped here. This failure would return the same answer on a retry, so nothing further was sent."
            : `The run stopped here after ${advance.stoppedBy.job.attempts} attempts.`}{" "}
          <span class="hint">
            {advance.stoppedBy.job.error_code
              ? `Step ${advance.stoppedBy.job.position}, code ${advance.stoppedBy.job.error_code}. The message is beside the step below.`
              : `Step ${advance.stoppedBy.job.position}. The message is beside the step below.`}
          </span>
        </p>
      ) : (
        ""
      )}

      {!finished && !advance.claimable && !advance.inFlight ? (
        <p class="notice warn">
          Nothing left that can run: every remaining step depends on one that failed. Retry re-runs
          only the steps that are not finished.
        </p>
      ) : (
        ""
      )}

      {advance.claimable ? (
        <form method="post" action={`/runs/${runId}/step`} id="step">
          <p>
            <button type="submit">{`Continue (${done} of ${total} done)`}</button>{" "}
            {advance.auto ? (
              <span class="hint">
                {pauseSeconds > 0
                  ? `OpenAI asked for a ${pauseSeconds} second pause; continuing then.`
                  : "Continuing on its own."}
              </span>
            ) : (
              <span class="hint">
                {advance.inFlight
                  ? `A step is already running, in another tab or in an invocation that never returned, so this page is not continuing on its own. Continue takes it over once it has been stuck for ${STALE_JOB_MS / 60_000} minutes.`
                  : "Not continuing on its own after that failure. Press to try the next step anyway."}
              </span>
            )}
          </p>
        </form>
      ) : (
        ""
      )}

      {/*
        The self-submit. `dangerouslySetInnerHTML` is required because hono/jsx
        escapes text children — the same escape hatch 01-01 established for
        <style>. `delayMs` is derived from a clamped integer, never from text.
      */}
      {advance.auto ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){var f=document.getElementById('step');if(f)f.submit()},${delayMs})`,
          }}
        />
      ) : (
        ""
      )}

      {advance.resettable ? <RetryForm runId={runId} /> : ""}
    </div>
  );
}

/**
 * The run's own status, derived from its jobs. `createRun` writes 'pending'
 * once and nothing maintains it afterwards, so every step recomputes it —
 * otherwise a finished run would sit at "pending" on /runs next to "6 of 6
 * done", which reads as broken.
 */
function runStatus(statuses: JobStatus[]): JobStatus {
  if (statuses.every((status) => status === "done")) return "done";
  if (statuses.some((status) => status === "running")) return "running";
  // Nothing left to claim and at least one failure: the run stopped short.
  if (statuses.every((status) => status === "done" || status === "failed")) return "failed";
  // Some work has been attempted, some is still waiting.
  if (statuses.some((status) => status !== "pending")) return "running";
  return "pending";
}

/**
 * Write the derived run status back, using the view read just after the claim.
 * That view shows the claimed job as 'running', so substituting the outcome it
 * actually reached gives the post-step picture without a second read. Nothing
 * is written when the status has not moved.
 */
async function reconcileRunStatus(
  db: D1Database,
  view: RunView,
  job: { kind: "extract" | "draft"; id: number },
  outcome: JobStatus,
): Promise<void> {
  const claimed = job.kind === "extract" ? view.outliers : view.drafts;
  const rest = job.kind === "extract" ? view.drafts : view.outliers;

  const next = runStatus([
    ...claimed.map((row) => (row.id === job.id ? outcome : row.status)),
    ...rest.map((row) => row.status),
  ]);

  if (next !== view.run.status) {
    await setRunStatus(db, view.run.id, next);
  }
}

/** No key, no call. Mirrors the missing-key guard in src/fireflies-routes.tsx. */
function NotConfigured() {
  return (
    <Layout title="Pipeflick — not configured">
      <h2>Run</h2>
      <p class="notice error">
        OPENAI_API_KEY is not set, so this step could not run. Nothing was sent.
      </p>
      <p>
        <a href="/health">Check /health</a>
      </p>
    </Layout>
  );
}

export const runs = new Hono<AppEnv>();

runs.get("/runs", async (c) => {
  const rows = await listRuns(c.env.DB);

  return c.html(
    <Layout title="Pipeflick runs">
      <h2>Runs</h2>
      <p>
        <a href="/runs/new">Start a run</a>
      </p>
      <RunTable rows={rows} />
    </Layout>,
  );
});

runs.get("/runs/new", async (c) => {
  const transcripts = await listTranscripts(c.env.DB);
  const samples = await listVoiceSamples(c.env.DB);

  return c.html(
    <Layout title="Pipeflick — new run">
      <h2>New run</h2>
      <NewRunForm transcripts={transcripts} sampleCount={samples.length} />
      <p>
        <a href="/runs">Back to runs</a>
      </p>
    </Layout>,
  );
});

runs.post("/runs", async (c) => {
  const form = await c.req.parseBody();

  const transcriptId = field(form["transcript_id"]).trim();
  if (!TRANSCRIPT_ID_PATTERN.test(transcriptId)) {
    return c.text("Invalid transcript id", 400);
  }
  const transcript = await getTranscript(c.env.DB, transcriptId);
  if (!transcript) {
    return c.text("Transcript not found", 400);
  }

  const bodies = OUTLIER_FIELDS.map((name) => field(form[name]).trim()).filter(
    (body) => body.length > 0,
  );
  if (bodies.length < MIN_OUTLIERS) {
    return c.text(`Paste at least ${MIN_OUTLIERS} outlier posts`, 400);
  }
  if (bodies.length > MAX_OUTLIERS) {
    return c.text(`Paste at most ${MAX_OUTLIERS} outlier posts`, 400);
  }
  if (bodies.some((body) => body.length > MAX_OUTLIER_CHARS)) {
    return c.text(`Each outlier must be ${MAX_OUTLIER_CHARS} characters or fewer`, 400);
  }

  // The transcript was loaded above to prove the row exists; the same read
  // pays for the coverage counts, which are stored on the run so the page can
  // state exactly how much of the meeting reached the model.
  const { linesUsed, linesTotal } = excerptTranscript(transcript.body);
  const runId = await createRun(c.env.DB, transcriptId, bodies, { linesUsed, linesTotal });
  return c.redirect(`/runs/${runId}`, 303);
});

runs.get("/runs/:id", async (c) => {
  const id = c.req.param("id");
  if (!RUN_ID_PATTERN.test(id)) {
    return c.text("Invalid run id", 400);
  }

  const view = await getRunView(c.env.DB, id);
  if (!view) {
    return c.text("Run not found", 404);
  }

  const { done, total } = progress(view);
  const advance = planAdvance(view);
  const title = view.transcript_title ?? "(transcript deleted)";

  // Set by the step route's redirect after OpenAI sent a Retry-After. Clamped,
  // because it arrives through the URL and is otherwise anyone's to type.
  const rawPause = c.req.query("retry_after") ?? "";
  const pauseSeconds = /^\d{1,3}$/.test(rawPause)
    ? Math.min(Number(rawPause), MAX_RETRY_AFTER_SECONDS)
    : 0;

  return c.html(
    <Layout title={`Pipeflick run — ${title}`}>
      <h2>Run</h2>
      <p class="hint">{`${title} · started ${formatDateTime(view.run.created_at)}`}</p>
      <p>
        {`${done} of ${total} steps done`} <StepStatus status={view.run.status} />
      </p>
      <TranscriptCoverage
        used={view.run.transcript_lines_used}
        total={view.run.transcript_lines_total}
      />
      <RunControl
        runId={id}
        done={done}
        total={total}
        advance={advance}
        pauseSeconds={pauseSeconds}
      />

      <h3>Templates</h3>
      <p class="hint">
        Each pasted outlier is broken down into a reusable format. The format itself is kept for the
        drafts and is not shown.
      </p>
      <TemplateSteps outliers={view.outliers} />

      <h3>Drafts</h3>
      <DraftSection drafts={view.drafts} />

      <p>
        <a href="/runs">Back to runs</a>
      </p>
    </Layout>,
  );
});

/**
 * One step of a run: claim exactly one job, make exactly one OpenAI call,
 * record the result, redirect. The whole engine is this route plus the
 * self-submitting form on the status page.
 *
 * Every line of it is shaped by "one paid call per invocation":
 * - The claim comes first and the call happens only if the claim was won, so a
 *   double-click, a second tab or a back-button resubmit cannot pay twice.
 * - Success and failure both end in 303 to the status page, so a reload re-runs
 *   the GET and never the POST.
 * - Nothing escapes as a raw Error. A stack can quote the prompt, and an
 *   uncaught throw would leave the claimed row 'running' for the full 180s
 *   stale window with nothing recorded against it.
 *
 * Budget: at most 10 D1 queries and 1 subrequest, against a Free-plan ceiling
 * of 50 of each per invocation.
 */
runs.post("/runs/:id/step", async (c) => {
  const runId = c.req.param("id");
  if (!RUN_ID_PATTERN.test(runId)) {
    return c.text("Invalid run id", 400);
  }

  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.html(<NotConfigured />, 500);
  }

  const job = await claimNextJob(c.env.DB, runId);
  if (!job) {
    // The run is finished, everything left has failed, or another invocation
    // holds the only claimable row. All three mean: nothing to do here.
    return c.redirect(`/runs/${runId}`, 303);
  }

  // One read, after the claim. The drafting branch needs the run's transcript
  // id, and both branches need the sibling job states to recompute the run
  // status without a second round trip.
  const view = await getRunView(c.env.DB, runId);
  if (!view) {
    return c.redirect("/runs", 303);
  }

  let outcome: JobStatus = "failed";
  let retryAfterSeconds: number | null = null;

  try {
    if (job.kind === "extract") {
      const { value, usage } = await callStructured<Template>(apiKey, {
        model: MODEL_EXTRACT,
        instructions: EXTRACT_INSTRUCTIONS,
        input: buildExtractionInput(job.outlierBody),
        schemaName: "outlier_template",
        schema: TEMPLATE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_EXTRACT,
        timeoutMs: TIMEOUT_EXTRACT_MS,
      });
      await finishOutlier(c.env.DB, job.id, value, usage);
      outcome = "done";
    } else {
      const transcript = await getTranscript(c.env.DB, view.run.transcript_id);
      if (!transcript) {
        // Delete-on-request can remove the source from under an older run.
        await failJob(c.env.DB, job, "transcript_missing", TRANSCRIPT_GONE);
      } else {
        const samples = await listVoiceSamples(c.env.DB);
        const { value, usage } = await callStructured<DraftOutput>(apiKey, {
          model: MODEL_DRAFT,
          instructions: DRAFT_INSTRUCTIONS,
          // PRIMITIVES ONLY, read out of the row here at the call site. Passing
          // `transcript` itself would send `title`, which routinely names a
          // counterparty — the exact Jersey/JFSC leak this phase exists to
          // prevent. `buildDraftingInput` has no row-taking overload and must
          // never gain one; test/prompts.test.ts asserts both halves.
          input: buildDraftingInput(
            samples.map((sample) => sample.body),
            transcript.body,
            JSON.parse(job.template) as Template,
          ),
          schemaName: "linkedin_draft",
          schema: DRAFT_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_DRAFT,
          timeoutMs: TIMEOUT_DRAFT_MS,
        });
        await finishDraft(
          c.env.DB,
          job.id,
          value.post,
          value.source_lines,
          // The full body, not the excerpt: a superset, so this check is only
          // ever more lenient than what the model was actually shown.
          isGrounded(transcript.body, value.source_lines),
          usage,
        );
        outcome = "done";
      }
    }
  } catch (error) {
    // OpenAIError.message is always OpenAI's own text or a fixed string from
    // src/openai.ts, so it is safe to render. Anything else is anonymised.
    const failure =
      error instanceof OpenAIError
        ? error
        : new OpenAIError("Unexpected failure", "unknown", 0, false);
    retryAfterSeconds = failure.retryAfterSeconds;
    await failJob(c.env.DB, job, failure.code, scrubKey(failure.message));
  }

  await reconcileRunStatus(c.env.DB, view, job, outcome);

  return c.redirect(`/runs/${runId}${pauseQuery(retryAfterSeconds)}`, 303);
});

/**
 * Retry: put every unfinished job back to 'pending' and let the status page
 * pick up where it stopped. Deliberately cheap — `resetRunJobs` skips rows
 * that are 'done', so on a finished run this changes nothing and re-runs
 * nothing, and on a part-failed run it only re-pays for what never completed.
 */
runs.post("/runs/:id/retry", async (c) => {
  const runId = c.req.param("id");
  if (!RUN_ID_PATTERN.test(runId)) {
    return c.text("Invalid run id", 400);
  }

  await resetRunJobs(c.env.DB, runId);

  return c.redirect(`/runs/${runId}`, 303);
});
