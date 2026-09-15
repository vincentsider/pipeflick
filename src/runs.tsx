import { Hono } from "hono";
import type { AppEnv } from "./access";
import {
  createRun,
  getRunView,
  getTranscript,
  listRuns,
  listTranscripts,
  OUTLIER_EXCERPT_CHARS,
  type DraftView,
  type OutlierView,
  type RunSummary,
  type RunView,
  type TranscriptSummary,
} from "./db";
import { Layout } from "./layout";
import { MAX_OUTLIER_CHARS } from "./prompts";

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

function NewRunForm({ transcripts }: { transcripts: TranscriptSummary[] }) {
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
            <option value={row.id}>{`${row.title} — ${formatDate(row.meeting_date)}`}</option>
          ))}
        </select>
      </p>
      <p class="hint">Only your own lines were kept on import; that is all the model sees.</p>

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

  return c.html(
    <Layout title="Pipeflick — new run">
      <h2>New run</h2>
      <NewRunForm transcripts={transcripts} />
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

  const runId = await createRun(c.env.DB, transcriptId, bodies);
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
  const title = view.transcript_title ?? "(transcript deleted)";

  return c.html(
    <Layout title={`Pipeflick run — ${title}`}>
      <h2>Run</h2>
      <p class="hint">{`${title} · started ${formatDateTime(view.run.created_at)}`}</p>
      <p>
        {`${done} of ${total} steps done`} <StepStatus status={view.run.status} />
      </p>
      {done === 0 ? (
        <p class="notice">
          Nothing has run yet. Every step below is waiting; running them is the next piece of the
          build, so for now this page reports state only.
        </p>
      ) : (
        ""
      )}

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
