/**
 * Settings helpers over the D1 `settings` table (migration 0001).
 * All values go through bound parameters; never interpolate into SQL.
 */

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?1")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key, value, new Date().toISOString())
    .run();
}

/* --------------------------------------------------------------------------
 * Phase 2 sources (migration 0002): transcripts and pasted voice samples.
 * ------------------------------------------------------------------------ */

/** Settings key holding the speaker label Fireflies uses for the executive. */
export const SPEAKER_NAME_KEY = "speaker.name";

export type TranscriptRow = {
  id: string;
  title: string;
  meeting_date: string;
  duration_minutes: number;
  speaker_label: string;
  /** Only the executive's own lines, joined by "\n". Never other speakers'. */
  body: string;
  line_count: number;
  imported_at: string;
};

/** List view: everything except the (potentially large) body. */
export type TranscriptSummary = Omit<TranscriptRow, "body">;

export type VoiceSampleRow = {
  id: number;
  body: string;
  created_at: string;
};

/**
 * Insert or replace a transcript. `id` is the Fireflies transcript id, so
 * re-importing the same meeting (for instance with a different speaker label)
 * overwrites the stored row instead of duplicating it.
 */
export async function upsertTranscript(
  db: D1Database,
  row: Omit<TranscriptRow, "imported_at">,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO transcripts " +
        "(id, title, meeting_date, duration_minutes, speaker_label, body, line_count, imported_at) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) " +
        "ON CONFLICT(id) DO UPDATE SET " +
        "title = excluded.title, " +
        "meeting_date = excluded.meeting_date, " +
        "duration_minutes = excluded.duration_minutes, " +
        "speaker_label = excluded.speaker_label, " +
        "body = excluded.body, " +
        "line_count = excluded.line_count, " +
        "imported_at = excluded.imported_at",
    )
    .bind(
      row.id,
      row.title,
      row.meeting_date,
      row.duration_minutes,
      row.speaker_label,
      row.body,
      row.line_count,
      new Date().toISOString(),
    )
    .run();
}

export async function listTranscripts(db: D1Database): Promise<TranscriptSummary[]> {
  const result = await db
    .prepare(
      "SELECT id, title, meeting_date, duration_minutes, speaker_label, line_count, imported_at " +
        "FROM transcripts ORDER BY meeting_date DESC",
    )
    .all<TranscriptSummary>();
  return result.results;
}

export async function getTranscript(db: D1Database, id: string): Promise<TranscriptRow | null> {
  const row = await db
    .prepare(
      "SELECT id, title, meeting_date, duration_minutes, speaker_label, body, line_count, imported_at " +
        "FROM transcripts WHERE id = ?1",
    )
    .bind(id)
    .first<TranscriptRow>();
  return row ?? null;
}

/** Stores a pasted sample and returns its new row id. */
export async function insertVoiceSample(db: D1Database, body: string): Promise<number> {
  const result = await db
    .prepare("INSERT INTO voice_samples (body, created_at) VALUES (?1, ?2)")
    .bind(body, new Date().toISOString())
    .run();
  return Number(result.meta.last_row_id);
}

export async function listVoiceSamples(db: D1Database): Promise<VoiceSampleRow[]> {
  const result = await db
    .prepare("SELECT id, body, created_at FROM voice_samples ORDER BY created_at DESC, id DESC")
    .all<VoiceSampleRow>();
  return result.results;
}

/* --------------------------------------------------------------------------
 * Phase 3 runs (migration 0003): drafting runs and their OpenAI jobs.
 *
 * A run is a job table, not a queue: one OpenAI call per Worker invocation,
 * with all state between calls in D1. Every call is preceded by an atomic
 * claim (`claimNextJob`), so a double-click, a second browser tab or a
 * back-button resubmit can never pay for the same call twice.
 * ------------------------------------------------------------------------ */

/** Run and job lifecycle. Jobs share the run's vocabulary. */
export type JobStatus = "pending" | "running" | "done" | "failed";

/**
 * How long a claimed job may sit in 'running' before another invocation may
 * take it over. Crash recovery: a Worker killed mid-call would otherwise leave
 * the row 'running' forever. Comfortably past the 120s OpenAI abort timeout.
 */
export const STALE_JOB_MS = 180_000;

/** Drafts per run (DRAFT-02). Fixed: three posts from two or three templates. */
export const DRAFTS_PER_RUN = 3;

/** Error text is rendered on the status page; cap it so D1 stays small. */
const MAX_ERROR_MESSAGE = 500;

export type RunRow = {
  id: string;
  transcript_id: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
};

/**
 * The OpenAI `usage` object, typed structurally so the step route can pass
 * what the client returned straight through. Only the three counts below are
 * ever stored — never the response object, which carries reasoning metadata
 * and would inflate D1.
 */
export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number } | null;
};

/** Flatten to {input_tokens, output_tokens, reasoning_tokens} for `usage_json`. */
function toUsageJson(usage: TokenUsage | null | undefined): string | null {
  if (!usage) return null;
  return JSON.stringify({
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
  });
}

/**
 * Outlier progress as the status page needs it. `template_json` is absent by
 * design: OUTL-02 says the extracted format is stored and never shown, and
 * omitting it from the projection makes that structural rather than a
 * rendering discipline. `body` is omitted too — the page shows progress, not
 * the pasted text.
 */
export type OutlierView = {
  id: number;
  position: number;
  status: JobStatus;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
};

/** Draft progress plus the generated post, which is the point of the page. */
export type DraftView = {
  id: number;
  position: number;
  outlier_id: number;
  body: string | null;
  source_lines_json: string | null;
  grounded: boolean | null;
  status: JobStatus;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
};

export type RunView = {
  run: RunRow;
  outliers: OutlierView[];
  drafts: DraftView[];
};

/** List view: counts, no bodies (the `TranscriptSummary` discipline). */
export type RunSummary = {
  id: string;
  transcript_id: string;
  /** NULL when the source transcript has since been deleted. */
  transcript_title: string | null;
  status: JobStatus;
  created_at: string;
  done_jobs: number;
  total_jobs: number;
};

/**
 * The next unit of work, already claimed. `template` is the stored JSON string;
 * parsing it belongs to the caller, which keeps this module free of any prompt
 * or schema import.
 */
export type Job =
  | { kind: "extract"; id: number; position: number; outlierBody: string }
  | { kind: "draft"; id: number; position: number; outlierId: number; template: string };

/**
 * Create a run with one outlier job per pasted body and exactly three draft
 * jobs. Draft N is assigned the outlier at position ((N - 1) mod count) + 1,
 * so two outliers give 1->A, 2->B, 3->A: DRAFT-02 requires each draft to be
 * filled from *one of* the run's templates, not a bijection.
 *
 * One statement per row (6-7 queries) stays well inside D1's Free-plan budget
 * of 50 queries per invocation and its 100-bound-parameter cap per query.
 */
export async function createRun(
  db: D1Database,
  transcriptId: string,
  outlierBodies: string[],
): Promise<string> {
  if (outlierBodies.length < 2 || outlierBodies.length > 3) {
    throw new Error(`A run needs 2 or 3 outliers, got ${outlierBodies.length}`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO runs (id, transcript_id, status, created_at, updated_at) " +
        "VALUES (?1, ?2, 'pending', ?3, ?3)",
    )
    .bind(id, transcriptId, now)
    .run();

  const outlierIds: number[] = [];
  for (const [index, body] of outlierBodies.entries()) {
    const result = await db
      .prepare(
        "INSERT INTO outliers (run_id, position, body, status, attempts, updated_at) " +
          "VALUES (?1, ?2, ?3, 'pending', 0, ?4)",
      )
      .bind(id, index + 1, body, now)
      .run();
    outlierIds.push(Number(result.meta.last_row_id));
  }

  for (let position = 1; position <= DRAFTS_PER_RUN; position++) {
    const outlierId = outlierIds[(position - 1) % outlierIds.length];
    await db
      .prepare(
        "INSERT INTO drafts (run_id, position, outlier_id, status, attempts, updated_at) " +
          "VALUES (?1, ?2, ?3, 'pending', 0, ?4)",
      )
      .bind(id, position, outlierId, now)
      .run();
  }

  return id;
}

type ClaimRow = {
  id: number;
  position: number;
  status: JobStatus;
  started_at: string | null;
};

/**
 * Win an exclusive claim on one job row, or return null.
 *
 * Claim-then-work: SELECT the next candidate, then UPDATE it guarded by the
 * exact (status, started_at) that was read. `meta.changes === 1` means this
 * invocation won; anything else means a concurrent invocation got there first
 * and nothing was changed. `RETURNING` is deliberately unused — D1's support
 * for it is undocumented.
 *
 * `attempts` is incremented inside the same UPDATE, so a page reload cannot
 * reset the loop counter that stops a bad API key retrying forever.
 *
 * Order: every unfinished outlier first (a draft cannot be written before its
 * template exists), then drafts whose outlier has a template.
 */
export async function claimNextJob(db: D1Database, runId: string): Promise<Job | null> {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_JOB_MS).toISOString();

  const outlier = await db
    .prepare(
      "SELECT id, position, body, status, started_at FROM outliers " +
        "WHERE run_id = ?1 AND (status = 'pending' OR (status = 'running' AND started_at < ?2)) " +
        "ORDER BY position LIMIT 1",
    )
    .bind(runId, staleBefore)
    .first<ClaimRow & { body: string }>();

  if (outlier) {
    const won = await claim(db, "outliers", outlier, now);
    if (!won) return null;
    return {
      kind: "extract",
      id: outlier.id,
      position: outlier.position,
      outlierBody: outlier.body,
    };
  }

  const draft = await db
    .prepare(
      "SELECT d.id AS id, d.position AS position, d.status AS status, " +
        "d.started_at AS started_at, d.outlier_id AS outlier_id, o.template_json AS template " +
        "FROM drafts d JOIN outliers o ON o.id = d.outlier_id " +
        "WHERE d.run_id = ?1 AND o.template_json IS NOT NULL " +
        "AND (d.status = 'pending' OR (d.status = 'running' AND d.started_at < ?2)) " +
        "ORDER BY d.position LIMIT 1",
    )
    .bind(runId, staleBefore)
    .first<ClaimRow & { outlier_id: number; template: string }>();

  if (!draft) return null;

  const won = await claim(db, "drafts", draft, now);
  if (!won) return null;
  return {
    kind: "draft",
    id: draft.id,
    position: draft.position,
    outlierId: draft.outlier_id,
    template: draft.template,
  };
}

/**
 * The conditional UPDATE behind every claim. Guarding on the `started_at` that
 * was read as well as the status makes this a compare-and-swap: two
 * invocations that both saw the same stale 'running' row cannot both win.
 * `IS` rather than `=` because a pending row's `started_at` is NULL.
 */
async function claim(
  db: D1Database,
  table: "outliers" | "drafts",
  row: ClaimRow,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE ${table} SET status = 'running', attempts = attempts + 1, ` +
        "started_at = ?1, updated_at = ?1 " +
        "WHERE id = ?2 AND status = ?3 AND started_at IS ?4",
    )
    .bind(now, row.id, row.status, row.started_at)
    .run();
  return result.meta.changes === 1;
}

/** Store the extracted template and the call's token counts. */
export async function finishOutlier(
  db: D1Database,
  id: number,
  template: unknown,
  usage: TokenUsage | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE outliers SET status = 'done', template_json = ?1, usage_json = ?2, " +
        "error_code = NULL, error_message = NULL, updated_at = ?3 WHERE id = ?4",
    )
    .bind(JSON.stringify(template), toUsageJson(usage), new Date().toISOString(), id)
    .run();
}

/**
 * Store the generated post, the lines the model claimed to ground it on, and
 * whether those lines were actually found in the transcript. Parsed values
 * only — never the OpenAI response object.
 */
export async function finishDraft(
  db: D1Database,
  id: number,
  post: string,
  sourceLines: string[],
  grounded: boolean,
  usage: TokenUsage | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE drafts SET status = 'done', body = ?1, source_lines_json = ?2, grounded = ?3, " +
        "usage_json = ?4, error_code = NULL, error_message = NULL, updated_at = ?5 WHERE id = ?6",
    )
    .bind(
      post,
      JSON.stringify(sourceLines),
      grounded ? 1 : 0,
      toUsageJson(usage),
      new Date().toISOString(),
      id,
    )
    .run();
}

/** Record a failure against whichever table the claimed job came from. */
export async function failJob(
  db: D1Database,
  job: Job,
  code: string,
  message: string,
): Promise<void> {
  const table = job.kind === "extract" ? "outliers" : "drafts";
  await db
    .prepare(
      `UPDATE ${table} SET status = 'failed', error_code = ?1, error_message = ?2, ` +
        "updated_at = ?3 WHERE id = ?4",
    )
    .bind(code, message.slice(0, MAX_ERROR_MESSAGE), new Date().toISOString(), job.id)
    .run();
}

/** Move the run itself between states. Job rows are unaffected. */
export async function setRunStatus(
  db: D1Database,
  runId: string,
  status: JobStatus,
): Promise<void> {
  await db
    .prepare("UPDATE runs SET status = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(status, new Date().toISOString(), runId)
    .run();
}

/** The status page in three queries — one per table, never N+1. */
export async function getRunView(db: D1Database, runId: string): Promise<RunView | null> {
  const run = await db
    .prepare("SELECT id, transcript_id, status, created_at, updated_at FROM runs WHERE id = ?1")
    .bind(runId)
    .first<RunRow>();
  if (!run) return null;

  const outliers = await db
    .prepare(
      "SELECT id, position, status, attempts, error_code, error_message " +
        "FROM outliers WHERE run_id = ?1 ORDER BY position",
    )
    .bind(runId)
    .all<OutlierView>();

  const drafts = await db
    .prepare(
      "SELECT id, position, outlier_id, body, source_lines_json, grounded, status, attempts, " +
        "error_code, error_message FROM drafts WHERE run_id = ?1 ORDER BY position",
    )
    .bind(runId)
    .all<Omit<DraftView, "grounded"> & { grounded: number | null }>();

  return {
    run,
    outliers: outliers.results,
    drafts: drafts.results.map((row) => ({ ...row, grounded: row.grounded === null ? null : row.grounded === 1 })),
  };
}

/** Run list: titles and progress counts, no draft or transcript bodies. */
export async function listRuns(db: D1Database): Promise<RunSummary[]> {
  const result = await db
    .prepare(
      "SELECT r.id AS id, r.transcript_id AS transcript_id, t.title AS transcript_title, " +
        "r.status AS status, r.created_at AS created_at, " +
        "(SELECT COUNT(*) FROM outliers o WHERE o.run_id = r.id AND o.status = 'done') + " +
        "(SELECT COUNT(*) FROM drafts d WHERE d.run_id = r.id AND d.status = 'done') AS done_jobs, " +
        "(SELECT COUNT(*) FROM outliers o WHERE o.run_id = r.id) + " +
        "(SELECT COUNT(*) FROM drafts d WHERE d.run_id = r.id) AS total_jobs " +
        "FROM runs r LEFT JOIN transcripts t ON t.id = r.transcript_id " +
        "ORDER BY r.created_at DESC",
    )
    .all<RunSummary>();
  return result.results;
}

/**
 * Retry: make every unfinished job claimable again and put the run back to
 * 'pending'. `status != 'done'` is the whole point — a completed OpenAI call
 * is never re-paid for, however many times the user presses Retry.
 */
export async function resetRunJobs(db: D1Database, runId: string): Promise<void> {
  const now = new Date().toISOString();
  const reset =
    "SET status = 'pending', attempts = 0, error_code = NULL, error_message = NULL, " +
    "started_at = NULL, updated_at = ?1 WHERE run_id = ?2 AND status != 'done'";

  await db.prepare(`UPDATE outliers ${reset}`).bind(now, runId).run();
  await db.prepare(`UPDATE drafts ${reset}`).bind(now, runId).run();
  await db
    .prepare("UPDATE runs SET status = 'pending', updated_at = ?1 WHERE id = ?2")
    .bind(now, runId)
    .run();
}
