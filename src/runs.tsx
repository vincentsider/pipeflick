import { Hono } from "hono";
import type { AppEnv } from "./access";
import {
  claimNextJob,
  createRun,
  failJob,
  finishDraft,
  finishOutlier,
  getRunView,
  getSetting,
  getTranscript,
  listApprovedPosts,
  listRuns,
  listTranscripts,
  listVoiceSamples,
  OUTLIER_EXCERPT_CHARS,
  recordDecision,
  recordPush,
  recordPushFailure,
  resetRunJobs,
  setRunStatus,
  STALE_JOB_MS,
  ZERNIO_ACCOUNT_ID_KEY,
  ZERNIO_ACCOUNT_LABEL_KEY,
  type Decision,
  type DraftDecision,
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
  checkGrounding,
  DRAFT_INSTRUCTIONS,
  DRAFT_SCHEMA,
  EXTRACT_INSTRUCTIONS,
  excerptTranscript,
  MAX_APPROVED_POSTS,
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
import { createLinkedInDraft, MAX_LINKEDIN_CHARS, ZernioError } from "./zernio";

/**
 * The three form fields a run is started from. The first two are required; a
 * run needs 2 or 3 outliers (`createRun` throws outside that range, so this
 * route validates before calling it).
 */
/**
 * The `POST /runs` field names and bounds. Exported because `/sources` also
 * starts a run — the design puts the transcript picker, the outliers and the
 * "Draft three posts" button on one screen — and both forms must agree with
 * this handler. One definition, two call sites.
 */
export const OUTLIER_FIELDS = ["outlier1", "outlier2", "outlier3"] as const;
export const MIN_OUTLIERS = 2;
export const MAX_OUTLIERS = OUTLIER_FIELDS.length;

/** Fireflies transcript ids, matching the guard in src/sources.tsx. */
const TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** Run ids are crypto.randomUUID(); reject junk before it reaches D1. */
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Draft ids are AUTOINCREMENT integers, and arrive from the URL. */
const DRAFT_ID_PATTERN = /^\d{1,9}$/;

/**
 * Ceiling on a post submitted through the approval gate. LinkedIn's own limit
 * is 3000 characters, so this is headroom for an executive who pastes a longer
 * version to trim later — not room for a novel.
 */
const MAX_DECISION_BODY_CHARS = 5000;

/**
 * The one Zernio error code worth its own wording. A disconnected account is
 * not a broken push: the text is fine, the key is fine, and the remedy is two
 * clicks in two places — reconnect LinkedIn inside Zernio, then choose the
 * account again on /zernio, because a reconnect changes the account's id.
 */
const ACCOUNT_DISCONNECTED = "ACCOUNT_DISCONNECTED";

/** Synthetic code for a push that never got an answer out of Zernio. */
const PUSH_FAILED = "push_failed";

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

/**
 * Textareas come back CRLF-normalised per the HTML spec; D1 holds LF.
 *
 * This is load-bearing rather than tidiness. Without it, every single accept
 * would differ from the stored `body` on line endings alone, every decision
 * would be recorded as 'edited', and APPR-05's light-edit rate would read 0%
 * forever — a measurement that is wrong in the flattering direction and would
 * never look obviously broken. Both sides of the comparison go through here,
 * and the normalised text is what gets stored.
 */
function normalisePost(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** What each stored decision is called on the page. */
const DECISION_LABEL: Record<Decision, string> = {
  accepted: "Accepted",
  edited: "Accepted with edits",
  rejected: "Rejected",
};

/**
 * What was decided about each draft of one run, per position: "1 accepted · 2
 * edited · 3 —". APPR-06 asks for the decision on each draft rather than a
 * tally, and a tally would hide the case that matters most — two accepted and
 * one rejected reads very differently from "2 of 3".
 *
 * An undecided draft is a dash, never "pending". Pending is the job vocabulary
 * from Phase 3 and it means the OpenAI call has not run; a finished post nobody
 * has looked at yet is a different thing, and borrowing the word would make the
 * run list say the engine is still working when it has long since stopped. A
 * draft whose job never finished is a dash for the same reason, and the row's
 * own progress count already says why.
 */
function decisionCell(decisions: DraftDecision[]): string {
  if (decisions.length === 0) return "—";
  return decisions.map((draft) => `${draft.position} ${draft.decision ?? "—"}`).join(" · ");
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
          <th>Decisions</th>
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
            <td class="hint">{decisionCell(row.decisions)}</td>
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

/**
 * The stored `GroundingRecord`, as this page is willing to believe it. Every
 * field is re-derived from `unknown`: `grounding_json` is D1 text written by a
 * past version of the Worker, and a draft that fails to parse must cost the
 * reader one hint, not the whole run page.
 */
type StoredGrounding = {
  citationsResolved: boolean;
  supported: number;
  checked: number;
  skipped: number;
  unsupported: string[];
  unsupportedTotal: number;
  repeated: string[];
  repeatedTotal: number;
};

/** Returns null for absent or unreadable JSON — both render as "no verdict". */
function parseGrounding(json: string | null): StoredGrounding | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const lines = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const count = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

  const unsupported = lines(record.unsupported);
  const repeated = lines(record.repeated);
  return {
    // Missing or malformed defaults to resolved: this panel never invents a
    // warning it has no evidence for.
    citationsResolved: record.citationsResolved !== false,
    supported: count(record.supported, 0),
    checked: count(record.checked, 0),
    skipped: count(record.skipped, 0),
    unsupported,
    unsupportedTotal: Math.max(count(record.unsupportedTotal, unsupported.length), unsupported.length),
    repeated,
    repeatedTotal: Math.max(count(record.repeatedTotal, repeated.length), repeated.length),
  };
}

/** The flagged lines themselves, quoted back so they can be found in the post. */
function FlaggedLines({ label, lines, total }: { label: string; lines: string[]; total: number }) {
  return (
    <>
      <p class="notice warn">{label}</p>
      <ul class="steps">
        {lines.map((line) => (
          <li class="draft-body">{line}</li>
        ))}
      </ul>
      {total > lines.length ? <p class="hint">{`and ${total - lines.length} more.`}</p> : ""}
    </>
  );
}

/**
 * What the grounding check found, rather than whether it was happy.
 *
 * A tick is not the UI here, deliberately. `grounded` is strict — citations
 * resolve AND nothing unsupported AND nothing repeated — and it is false on all
 * three of production run 1's drafts, correctly so. A boolean that is false on
 * every real draft tells the executive exactly as little as the always-true one
 * it replaced. What earns its place on the page is the report: how much was
 * traced, which lines were not, and how much was never looked at.
 *
 * The last line is not decoration. This check matches WORDS, not meaning: a
 * short invented sentence said once is counted in `skipped`, not caught. Phase 3
 * failed its one criterion by letting a narrow check read as a whole-output
 * guarantee, so the page now says out loud what it did not examine.
 */
function GroundingPanel({ json }: { json: string | null }) {
  const report = parseGrounding(json);
  if (!report) {
    // Not a fallback to the stored `grounded` boolean, on purpose: that is the
    // citation-only proxy 03-07 exists to retire, already known to be wrong in
    // both directions on exactly these drafts.
    return <p class="hint">Written before the current grounding check.</p>;
  }

  const { repeated, repeatedTotal, unsupported, unsupportedTotal, skipped } = report;
  return (
    <>
      {repeated.length > 0 ? (
        <FlaggedLines
          label={
            repeated.length === 1
              ? "This phrase is repeated and appears nowhere in your transcript or voice samples:"
              : "These phrases are repeated and appear nowhere in your transcript or voice samples:"
          }
          lines={repeated}
          total={repeatedTotal}
        />
      ) : (
        ""
      )}
      {unsupported.length > 0 ? (
        <FlaggedLines
          label={
            unsupported.length === 1
              ? "This line could not be traced back to your own words:"
              : "These lines could not be traced back to your own words:"
          }
          lines={unsupported}
          total={unsupportedTotal}
        />
      ) : (
        ""
      )}
      {report.citationsResolved ? (
        ""
      ) : (
        <p class="notice warn">
          The quotes this draft reported building on were not found in your own words.
        </p>
      )}
      {report.checked > 0 ? (
        <p class="hint">
          {`Traced ${report.supported} of ${report.checked} substantive lines back to your own words.`}
        </p>
      ) : (
        ""
      )}
      <p class="hint">
        {skipped === 1
          ? "1 short or connecting line was too generic to check."
          : `${skipped} short or connecting lines were too generic to check.`}
      </p>
    </>
  );
}

/**
 * What was decided about this draft, and when.
 *
 * Undecided renders nothing at all: the empty state is the form sitting below
 * it, and a "not decided yet" banner on every draft of every fresh run is noise
 * on the one page the executive reads most. Amber for a rejection rather than
 * red, matching 03-03's rule — red belongs to a step that failed, and a
 * rejection is a judgement working exactly as intended.
 */
function DecisionRecord({
  decision,
  decidedAt,
}: {
  decision: Decision | null;
  decidedAt: string | null;
}) {
  if (!decision) return <></>;
  return (
    <p class={decision === "rejected" ? "notice warn" : "notice"}>
      {DECISION_LABEL[decision]}
      {decidedAt ? <span class="hint">{` · ${formatDateTime(decidedAt)}`}</span> : ""}
    </p>
  );
}

/**
 * The gate itself: the post, editable, with Accept and Reject.
 *
 * Two submit buttons sharing one name is plain HTML — the browser sends only
 * the one that was pressed — so this needs no client JavaScript, which is the
 * rule everywhere in this app.
 *
 * There is deliberately no third "Accept with edits" button. The route compares
 * the submitted text against the stored original and decides for itself, so
 * APPR-05's light-edit rate is a measurement rather than a survey. Same
 * instinct as 03-05 calibrating the grounding check against real drafts and
 * 03-06 storing the coverage counts: record what happened, not what was
 * reported.
 *
 * The box is prefilled from `final_body` when there is one, so reopening a
 * decided draft shows the text as it now stands rather than reverting to the
 * model's original — which is still in `body`, untouched, and always will be.
 */
function DecisionForm({ runId, draft }: { runId: string; draft: DraftView }) {
  return (
    <form method="post" action={`/runs/${runId}/drafts/${draft.id}/decision`}>
      <p>
        <label for={`decision-body-${draft.id}`}>Accept this, or edit it first</label>
      </p>
      <textarea
        id={`decision-body-${draft.id}`}
        name="body"
        rows={8}
        maxlength={MAX_DECISION_BODY_CHARS}
      >
        {draft.final_body ?? draft.body}
      </textarea>
      <p>
        <button type="submit" name="decision" value="accept">
          Accept
        </button>{" "}
        <button type="submit" name="decision" value="reject">
          Reject
        </button>
      </p>
      <p class="hint">
        Changing the text and pressing Accept records an edit. The post above is kept exactly as it
        was written, which is the only way to tell later how much you had to change.
      </p>
    </form>
  );
}

/**
 * The push control. `target` is the chosen account's label, or null when no
 * account has been chosen yet — in which case this is a link, not a dead
 * button: the route would only answer 400 and the fix is on another page.
 *
 * The button says where the post is going. A push is the one action on this
 * page that leaves the app, and "which account" must never be a guess.
 */
function PushForm({
  runId,
  draft,
  target,
}: {
  runId: string;
  draft: DraftView;
  target: string | null;
}) {
  if (target === null) {
    return (
      <p class="hint">
        <a href="/zernio">Choose your LinkedIn account</a> to push approved drafts to Zernio.
      </p>
    );
  }

  // The route refuses this too; catching it here means the executive reads the
  // two numbers instead of pressing a button that can only ever fail.
  const length = (draft.final_body ?? "").length;
  if (length > MAX_LINKEDIN_CHARS) {
    return (
      <p class="notice warn">
        {`This post is ${length} characters and LinkedIn allows ${MAX_LINKEDIN_CHARS}. Shorten it above and accept it again before pushing.`}
      </p>
    );
  }

  return (
    <form method="post" action={`/runs/${runId}/drafts/${draft.id}/push`}>
      <p>
        <button type="submit">Push to Zernio</button>{" "}
        <span class="hint">
          {`Saved as an unscheduled draft on ${target}. Scheduling and publishing stay manual, in Zernio.`}
        </span>
      </p>
    </form>
  );
}

/**
 * Where this post stands with Zernio: landed, refused, or not sent yet.
 *
 * The pushed notice says "unscheduled" and "not published" in as many words,
 * and that is not padding. The whole product rests on the executive being able
 * to tell at a glance that pressing this button put nothing on LinkedIn; a
 * badge reading only "Pushed" would leave them guessing, and the guess that
 * costs something is the wrong one.
 *
 * A refused push is amber, not red — 03-03's rule. Red belongs to a step that
 * failed inside a run; a push Zernio declined is a thing to try again, so the
 * button comes back with the message.
 *
 * An undecided or rejected draft renders nothing at all. A push control there
 * invites exactly the mistake the route's decision guard exists to stop.
 */
function PushState({
  runId,
  draft,
  target,
}: {
  runId: string;
  draft: DraftView;
  target: string | null;
}) {
  if (draft.zernio_post_id !== null) {
    return (
      <p class="notice">
        In Zernio as an unscheduled LinkedIn draft — not scheduled, and not published.{" "}
        <span class="hint">
          {`Zernio id ${draft.zernio_post_id}${
            draft.zernio_pushed_at ? ` · ${formatDateTime(draft.zernio_pushed_at)}` : ""
          }`}
        </span>
      </p>
    );
  }

  // A code with no post id is a failed push, which is a real state (05-02) and
  // must never render as "not pushed yet".
  if (draft.zernio_error_code !== null) {
    return (
      <>
        <p class="notice warn">
          {draft.zernio_error_message ?? "Zernio did not accept this draft."}
          <span class="hint">{` (${draft.zernio_error_code})`}</span>
        </p>
        <PushForm runId={runId} draft={draft} target={target} />
      </>
    );
  }

  if (draft.decision !== "accepted" && draft.decision !== "edited") {
    return <></>;
  }

  return <PushForm runId={runId} draft={draft} target={target} />;
}

/** One block per draft: the post itself once it exists, its state until then. */
function DraftSection({
  drafts,
  runId,
  interactive,
  pushTarget,
}: {
  drafts: DraftView[];
  runId: string;
  /**
   * False while the page is auto-advancing. The status page resubmits itself
   * every 400ms until the run stops (03-04's engine), and a reload underneath a
   * half-typed edit would throw the edit away. Passed in rather than re-derived
   * here, so there is one definition of "the run has stopped".
   */
  interactive: boolean;
  /**
   * The label of the Zernio account a push would go to, or null when none has
   * been chosen. Read once per page render in the route, never per draft and
   * never from Zernio — 05-03 stores the label beside the id for this.
   */
  pushTarget: string | null;
}) {
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
          {draft.body ? (
            <>
              <p class="draft-body">{draft.body}</p>
              {/* Below the post, not above it: the flagged lines are quotes from
                  a draft the reader has not read yet if they come first, and a
                  block of them would push the post itself off the screen. */}
              <GroundingPanel json={draft.grounding_json} />
              {/* The report stays beside the control, never the bare `grounded`
                  boolean: the approval gate is exactly where a signal known to
                  be wrong in both directions would do the most damage. */}
              <DecisionRecord decision={draft.decision} decidedAt={draft.decided_at} />
              {/* Both the decision and the push are gated on `interactive` for
                  04-02's reason: this page resubmits itself every 400ms while
                  the run is generating, and a control that appears mid-reload
                  is a control that gets mis-clicked. A push is the one click
                  here that reaches an external service. */}
              {interactive ? (
                <>
                  <DecisionForm runId={runId} draft={draft} />
                  <PushState runId={runId} draft={draft} target={pushTarget} />
                </>
              ) : (
                <p class="hint">Decisions open when the run stops generating.</p>
              )}
            </>
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
          {`All ${total} steps are done; the drafts are below.`} Accept each one as it stands, edit
          it first and then accept, or reject it. Nothing is published from here — an accepted post
          can be pushed to Zernio, where it is saved as an unscheduled draft. Scheduling and
          publishing stay manual, in Zernio.
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
    <Layout title="Pipeflick — not configured" path="/runs">
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

/**
 * Same guard for the other key. A push with no token makes no request at all:
 * the check is before the Zernio call, so nothing reaches the network and
 * nothing is recorded against the draft.
 */
function ZernioNotConfigured() {
  return (
    <Layout title="Pipeflick — not configured" path="/runs">
      <h2>Push to Zernio</h2>
      <p class="notice error">
        ZERNIO_USER_TOKEN is not set, so nothing was sent to Zernio and this draft is unchanged.
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
    <Layout title="Pipeflick runs" path="/runs">
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
    <Layout title="Pipeflick — new run" path="/runs">
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

  // The push target, read once for the page rather than once per draft — and
  // from settings, never from Zernio: 05-03 stores the label beside the id so
  // this page can name the destination without spending a request per render.
  // Two reads, and only the id decides whether a push is possible at all.
  const accountId = (await getSetting(c.env.DB, ZERNIO_ACCOUNT_ID_KEY)) ?? "";
  const accountLabel = (await getSetting(c.env.DB, ZERNIO_ACCOUNT_LABEL_KEY)) ?? "";
  const pushTarget = accountId === "" ? null : accountLabel || accountId;

  return c.html(
    <Layout title={`Pipeflick run — ${title}`} path="/runs">
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
      {/* `!advance.auto` is the whole condition: the controls appear the moment
          the page stops resubmitting itself, whether the run finished or
          halted. A halted run's finished drafts are still worth deciding. */}
      <DraftSection
        drafts={view.drafts}
        runId={id}
        interactive={!advance.auto}
        pushTarget={pushTarget}
      />

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
 * Budget: at most 11 D1 queries and 1 subrequest, against a Free-plan ceiling
 * of 50 of each per invocation. The eleventh is 04-03's approved-posts read,
 * which costs no extra subrequest: it rides into the same OpenAI call.
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
        const sampleBodies = samples.map((sample) => sample.body);
        // DRAFT-04, the feedback loop: what the executive accepted or accepted
        // after editing, newest first, as voice input for the next draft.
        // `runId` excludes this run's own drafts — without it a mid-run
        // approval would feed draft 1 back into draft 3, and the cacheable
        // prefix would stop being byte-stable across a run's three calls.
        // The constant lives with the prompt and the query lives with the
        // database; this route is the only place that knows both, which is
        // what keeps src/db.ts free of any prompt import.
        const approvedPosts = await listApprovedPosts(c.env.DB, MAX_APPROVED_POSTS, runId);
        const { value, usage } = await callStructured<DraftOutput>(apiKey, {
          model: MODEL_DRAFT,
          instructions: DRAFT_INSTRUCTIONS,
          // PRIMITIVES ONLY, read out of the row here at the call site. Passing
          // `transcript` itself would send `title`, which routinely names a
          // counterparty — the exact Jersey/JFSC leak this phase exists to
          // prevent. `buildDraftingInput` has no row-taking overload and must
          // never gain one; test/prompts.test.ts asserts both halves.
          input: buildDraftingInput(sampleBodies, approvedPosts, transcript.body, JSON.parse(job.template) as Template),
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
          // The whole post against the executive's own material. The full
          // transcript body, not the excerpt: a superset, so the check is only
          // ever more lenient than what the model was shown. Outlier bodies are
          // deliberately absent — FORMAT carries shape only, so an outlier's
          // phrasing in a draft is a defect, not grounding to be credited.
          //
          // `approvedPosts` is deliberately absent too, and that is not an
          // oversight. Approving a post for publication is not certifying that
          // every claim in it came from the executive's own material. Credit an
          // approved post as grounding and one fabrication launders itself into
          // a permanent source, re-credited in every run after. The prompt says
          // the same thing to the model: take voice from APPROVED POSTS, never
          // a claim.
          checkGrounding(value.post, value.source_lines, [transcript.body, ...sampleBodies]),
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
 * The approval gate: accept a draft as it stands, accept an edited version of
 * it, or reject it. APPR-01 to APPR-04, and the human-in-the-loop step CLAUDE.md
 * calls mandatory — nothing leaves this app without passing through here.
 *
 * Accepted versus edited is MEASURED, never declared. There are two buttons and
 * three outcomes: the route compares the submitted text with the model's stored
 * original and picks 'accepted' or 'edited' itself. A self-reported "I only
 * tweaked it" would turn APPR-05's 80%-with-light-edits target into a survey of
 * the person it is meant to be measuring.
 *
 * Ownership is `recordDecision`'s WHERE clause, not a check here: the UPDATE is
 * scoped by run as well as draft, and a draft belonging to another run changes
 * 0 rows, which becomes the 404.
 */
runs.post("/runs/:id/drafts/:draftId/decision", async (c) => {
  const runId = c.req.param("id");
  if (!RUN_ID_PATTERN.test(runId)) {
    return c.text("Invalid run id", 400);
  }
  const rawDraftId = c.req.param("draftId");
  if (!DRAFT_ID_PATTERN.test(rawDraftId)) {
    return c.text("Invalid draft id", 400);
  }
  const draftId = Number(rawDraftId);

  const form = await c.req.parseBody();

  // Exactly one of the two buttons, or nothing happens. A missing value is a
  // 400 rather than a default: inferring "accept" from an absent field would
  // let a malformed request approve a post.
  const choice = field(form["decision"]);
  if (choice !== "accept" && choice !== "reject") {
    return c.text("Choose Accept or Reject", 400);
  }

  if (choice === "reject") {
    // No final text: a rejected draft has none, and `body` keeps the post so
    // the page can still show what was turned down. A decision is a record,
    // not a delete.
    const written = await recordDecision(c.env.DB, runId, draftId, "rejected", null);
    if (!written) {
      return c.text("Draft not found", 404);
    }
    return c.redirect(`/runs/${runId}`, 303);
  }

  const submitted = normalisePost(field(form["body"]));
  if (submitted.length === 0) {
    return c.text("A post cannot be empty", 400);
  }
  if (submitted.length > MAX_DECISION_BODY_CHARS) {
    return c.text(`A post must be ${MAX_DECISION_BODY_CHARS} characters or fewer`, 400);
  }

  const view = await getRunView(c.env.DB, runId);
  const draft = view?.drafts.find((row) => row.id === draftId) ?? null;
  if (!draft) {
    return c.text("Draft not found", 404);
  }
  if (draft.body === null) {
    return c.text("That draft has no post yet", 400);
  }

  // Both sides normalised: the browser submits CRLF and D1 holds LF, so a
  // straight comparison would call every accept an edit.
  const decision: Decision = submitted === normalisePost(draft.body) ? "accepted" : "edited";
  const written = await recordDecision(c.env.DB, runId, draftId, decision, submitted);
  if (!written) {
    return c.text("Draft not found", 404);
  }

  return c.redirect(`/runs/${runId}`, 303);
});

/**
 * Zernio's own code and a message that is safe to store and to render.
 *
 * A `ZernioError` message is Zernio's own text, already scrubbed of anything
 * key-shaped inside src/zernio.ts, so it is passed through. Anything else is
 * replaced outright: a network failure carries a URL, a stack frame or a header
 * name, and none of those belong on a page or in D1 forever.
 */
/**
 * Zernio's messages arrive without a full stop ("This social account has been
 * disconnected"), and the remedy sentence is appended to them. Without this the
 * two run together into one ungrammatical line on the page.
 */
function endSentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function pushFailure(error: unknown): { code: string; message: string } {
  if (!(error instanceof ZernioError)) {
    // The honest message, not the comforting one. An aborted request may have
    // been processed on Zernio's side after this Worker stopped waiting, so
    // "nothing was saved" would be a guess. Zernio's 24-hour content hash is
    // what makes pressing the button again safe: a second push of the same text
    // comes back 409 with the original post id and is recorded as a success.
    return {
      code: PUSH_FAILED,
      message:
        "The push did not complete, so it is not certain whether Zernio received it. " +
        "Check your Zernio drafts, then press Push to Zernio again — Zernio refuses a " +
        "duplicate of the same text within 24 hours, so this cannot create a second draft.",
    };
  }
  if (error.code === ACCOUNT_DISCONNECTED) {
    return {
      code: error.code,
      message:
        `${endSentence(error.message)} Reconnect LinkedIn in the Zernio dashboard, then choose the account ` +
        "again on /zernio — a reconnect gives the account a new id, so the saved one stops working.",
    };
  }
  if (error.code === "duplicate") {
    // A 409 that carried no `existingPostId`. The post is over there, but there
    // is no receipt to store, and inventing one would be worse than saying so.
    return {
      code: error.code,
      message: `${endSentence(error.message)} Zernio already has this exact text from the last 24 hours but returned no id for it; look for it in your Zernio drafts.`,
    };
  }
  return { code: error.code, message: error.message };
}

/**
 * SCHED-02: one approved post becomes one unscheduled LinkedIn draft in Zernio.
 *
 * This is the only route in the project that can put the executive's words on
 * an external service, and it cannot publish them: `createLinkedInDraft` sends
 * `isDraft: true` and never constructs `publishNow`, `scheduledFor` or
 * `queuedFromProfile`, and `test/zernio.test.ts` pins that by mutation.
 * Scheduling and publishing stay manual, inside Zernio, which is what
 * CLAUDE.md's "no auto-publishing, with or without approval" means in code.
 *
 * Every guard below returns before a request is spent, and the two that carry
 * the product rule rather than mere hygiene are:
 *   - the decision check. SCHED-02 says an ACCEPTED draft. Letting a rejected
 *     or undecided one through would make the approval gate decorative, and the
 *     gate is the trust mechanism this whole pipeline rests on.
 *   - `final_body`, never `body`. `body` is the model's original output, and on
 *     a draft decided 'edited' that is text the executive explicitly changed
 *     and did not approve. Pushing it would publish-adjacent the one version
 *     they rejected.
 *
 * Ownership is `recordPush`/`recordPushFailure`'s WHERE clause, exactly as in
 * the decision route: the UPDATE is scoped by run as well as draft, and 0 rows
 * changed becomes the 404.
 */
runs.post("/runs/:id/drafts/:draftId/push", async (c) => {
  const runId = c.req.param("id");
  if (!RUN_ID_PATTERN.test(runId)) {
    return c.text("Invalid run id", 400);
  }
  const rawDraftId = c.req.param("draftId");
  if (!DRAFT_ID_PATTERN.test(rawDraftId)) {
    return c.text("Invalid draft id", 400);
  }
  const draftId = Number(rawDraftId);

  const apiKey = c.env.ZERNIO_USER_TOKEN;
  if (!apiKey) {
    return c.html(<ZernioNotConfigured />, 500);
  }

  // Setup, not failure: the key can be perfect and no account chosen yet.
  const accountId = (await getSetting(c.env.DB, ZERNIO_ACCOUNT_ID_KEY)) ?? "";
  if (accountId === "") {
    return c.text("No Zernio account chosen yet. Choose your LinkedIn account on /zernio first.", 400);
  }

  // The read the run page already does, widened by 05-02, so the push state
  // arrives with the draft and costs nothing extra.
  const view = await getRunView(c.env.DB, runId);
  const draft = view?.drafts.find((row) => row.id === draftId) ?? null;
  if (!draft) {
    return c.text("Draft not found", 404);
  }

  if (draft.decision !== "accepted" && draft.decision !== "edited") {
    return c.text("Only an accepted draft can go to Zernio. Accept this one first.", 400);
  }

  const post = draft.final_body ?? "";
  if (post.trim() === "") {
    return c.text("That draft has no approved text to push", 400);
  }

  // The button is hidden once a draft has been pushed, and the route refuses
  // anyway: a tab left open from before the push would happily submit again.
  if (draft.zernio_post_id !== null) {
    return c.text(`This draft is already in Zernio as ${draft.zernio_post_id}`, 400);
  }

  // MAX_DECISION_BODY_CHARS is 5000 and LinkedIn's ceiling is 3000, so an
  // accepted draft can legally sit in D1 at a length Zernio will reject.
  // Checking here spends no request and says which number was missed by how
  // much; src/zernio.ts deliberately does not truncate anyone's words.
  if (post.length > MAX_LINKEDIN_CHARS) {
    return c.text(
      `LinkedIn allows ${MAX_LINKEDIN_CHARS} characters and this post is ${post.length}. Shorten it and accept it again.`,
      400,
    );
  }

  try {
    const created = await createLinkedInDraft(apiKey, post, accountId);
    const written = await recordPush(c.env.DB, runId, draftId, created.id);
    if (!written) {
      return c.text("Draft not found", 404);
    }
    return c.redirect(`/runs/${runId}`, 303);
  } catch (error) {
    // A 409 duplicate is a SUCCESS. Zernio hashes (platform, account, content)
    // for 24 hours and answers with the id of the post that already exists —
    // which is precisely the state the user asked for. Recording it as a
    // failure would be a lie that also throws away the receipt, and it would
    // leave the page offering a button that can never do anything but 409.
    if (error instanceof ZernioError && error.code === "duplicate" && error.details?.existingPostId) {
      const written = await recordPush(c.env.DB, runId, draftId, error.details.existingPostId);
      if (!written) {
        return c.text("Draft not found", 404);
      }
      return c.redirect(`/runs/${runId}`, 303);
    }

    // Everything else is recorded against the draft and rendered beside it, not
    // thrown at an error page the user navigates away from and forgets.
    const { code, message } = pushFailure(error);
    const written = await recordPushFailure(c.env.DB, runId, draftId, code, message);
    if (!written) {
      return c.text("Draft not found", 404);
    }
    return c.redirect(`/runs/${runId}`, 303);
  }
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
