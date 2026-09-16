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

/**
 * List view: everything except the (potentially large) body, plus that body's
 * length. The body itself still never leaves D1; only its size does, which is
 * what lets the new-run form warn that a meeting will be cut before the run is
 * paid for.
 */
export type TranscriptSummary = Omit<TranscriptRow, "body"> & { body_chars: number };

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
      // SQLite length() counts characters (not bytes) on a TEXT value, and
      // MAX_TRANSCRIPT_CHARS is compared against JavaScript string.length, so
      // the two agree for ordinary transcript text. The form uses body_chars
      // only as a threshold — never as a figure shown to the user, because the
      // exact statement of what was used is lines-based and comes from the run.
      "SELECT id, title, meeting_date, duration_minutes, speaker_label, line_count, imported_at, " +
        "length(body) AS body_chars " +
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

/**
 * How many flagged lines of each kind survive into `grounding_json`. A reviewer
 * reads five lines and acts on them; fifty is a wall of text they skip, and it
 * is draft prose sitting in D1 for no one. The pre-cap counts are stored
 * alongside, so the page can still say how many were dropped.
 */
export const MAX_GROUNDING_LINES = 5;

/** Each kept line is sliced to this, the way error text is capped. */
export const MAX_GROUNDING_LINE_CHARS = 300;

export type RunRow = {
  id: string;
  transcript_id: string;
  status: JobStatus;
  /**
   * How much of the transcript actually reached the model, counted at run
   * creation (migration 0004). NULL for every run created before that
   * migration — a real state, not a defect: the page must then say nothing
   * rather than claim a coverage it does not have.
   */
  transcript_lines_used: number | null;
  transcript_lines_total: number | null;
  created_at: string;
  updated_at: string;
};

/** The two coverage counts, as `excerptTranscript` returns them. */
export type TranscriptCoverage = {
  linesUsed: number;
  linesTotal: number;
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
  /**
   * Prompt-cache hits. 03-04 found drafts 2 and 3 *eligible* for caching (a
   * byte-stable ~4,700-token prefix, well over the 1,024 minimum) but could not
   * prove a hit, because this count was parsed and thrown away. Stored now so
   * the phase cost estimate can be checked against what was actually billed.
   */
  input_tokens_details?: { cached_tokens?: number } | null;
};

/**
 * Flatten to {input_tokens, cached_tokens, output_tokens, reasoning_tokens} for
 * `usage_json`. Rows written before 03-07 have no `cached_tokens` key; a reader
 * must treat its absence as unknown, not as zero cache hits.
 */
function toUsageJson(usage: TokenUsage | null | undefined): string | null {
  if (!usage) return null;
  return JSON.stringify({
    input_tokens: usage.input_tokens ?? 0,
    cached_tokens: usage.input_tokens_details?.cached_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
  });
}

/**
 * What the grounding check found, typed structurally the way `TokenUsage` is so
 * the step route can pass `checkGrounding`'s report straight through. This
 * module imports nothing from src/prompts.ts (03-02) — that boundary is what
 * keeps the prompt builders provably free of row types, so no code path can
 * send a meeting title to OpenAI. Shape is duplicated here deliberately; an
 * import would be the cheaper line and the wrong one.
 */
export type GroundingRecord = {
  grounded: boolean;
  citationsResolved: boolean;
  supported: number;
  checked: number;
  skipped: number;
  unsupported: string[];
  repeated: string[];
};

/**
 * Cap the report for storage: at most MAX_GROUNDING_LINES entries of each list,
 * each sliced to MAX_GROUNDING_LINE_CHARS, with the pre-cap counts kept so the
 * page can say "and N more" rather than silently showing five of twelve.
 */
function toGroundingJson(grounding: GroundingRecord): string {
  const cap = (lines: string[]) =>
    lines.slice(0, MAX_GROUNDING_LINES).map((line) => line.slice(0, MAX_GROUNDING_LINE_CHARS));
  return JSON.stringify({
    grounded: grounding.grounded,
    citationsResolved: grounding.citationsResolved,
    supported: grounding.supported,
    checked: grounding.checked,
    skipped: grounding.skipped,
    unsupported: cap(grounding.unsupported),
    unsupportedTotal: grounding.unsupported.length,
    repeated: cap(grounding.repeated),
    repeatedTotal: grounding.repeated.length,
  });
}

/** Characters of the pasted outlier shown on the status page. */
export const OUTLIER_EXCERPT_CHARS = 80;

/**
 * Outlier progress as the status page needs it. `template_json` is absent by
 * design: OUTL-02 says the extracted format is stored and never shown, and
 * omitting it from the projection makes that structural rather than a
 * rendering discipline. The full `body` is omitted for the same reason — only
 * `excerpt`, cut to OUTLIER_EXCERPT_CHARS by SQLite so the rest of the pasted
 * text never leaves D1, and only so the reader can tell two outliers apart.
 */
export type OutlierView = {
  id: number;
  position: number;
  excerpt: string;
  status: JobStatus;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
};

/**
 * What the executive did with a draft (migration 0005). NULL — the absence of
 * this value — means undecided, which is a real state: every draft written
 * before that migration, and every draft in a run not reviewed yet.
 *
 * 'edited' is DERIVED BY COMPARISON, never self-reported: the route compares the
 * submitted text with `body` and picks 'accepted' or 'edited' itself (04-02 owns
 * that). A reviewer who retypes the post verbatim has accepted it, and one who
 * changes a line has edited it, whichever button they pressed — otherwise
 * APPR-05's light-edit rate measures what people claim rather than what they did.
 */
export type Decision = "accepted" | "edited" | "rejected";

/** Draft progress plus the generated post, which is the point of the page. */
export type DraftView = {
  id: number;
  position: number;
  outlier_id: number;
  body: string | null;
  source_lines_json: string | null;
  grounded: boolean | null;
  /**
   * The serialised `GroundingRecord`, or NULL for a draft written before 03-07.
   * NULL is a real state: those drafts carry a `grounded` value from the old
   * citation-only check, which production run 1 proved wrong in both
   * directions, so the page must show nothing rather than reprint it.
   */
  grounding_json: string | null;
  status: JobStatus;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  /** NULL means undecided; see `Decision`. */
  decision: Decision | null;
  /**
   * The post as it stands after the decision: a copy of `body` on 'accepted',
   * the executive's text on 'edited', NULL on 'rejected' and while undecided.
   * The run page prefills its edit box from this, falling back to `body`.
   */
  final_body: string | null;
  decided_at: string | null;
  /**
   * Zernio's `_id` for the draft this post became over there, or NULL if it has
   * never reached Zernio (migration 0006). It is a receipt for a draft sitting
   * unscheduled in the executive's Zernio account — never a published post and
   * never a LinkedIn URL.
   */
  zernio_post_id: string | null;
  /** ISO timestamp of the LAST push attempt, successful or not. */
  zernio_pushed_at: string | null;
  /**
   * A NULL `zernio_post_id` beside a NON-NULL `zernio_error_code` is a FAILED
   * PUSH, which is a real state: the page renders the error rather than nothing.
   * A success clears both error fields, so error text can never sit beside a
   * live post id and render as both at once.
   */
  zernio_error_code: string | null;
  zernio_error_message: string | null;
};

export type RunView = {
  run: RunRow;
  /** NULL when the source transcript has since been deleted (delete-on-request). */
  transcript_title: string | null;
  outliers: OutlierView[];
  drafts: DraftView[];
};

/**
 * One draft's decision as the run list needs it (APPR-06): enough to show which
 * runs still have posts waiting, and nothing else. No body, no final text — the
 * list view never carries prose.
 */
export type DraftDecision = {
  position: number;
  decision: Decision | null;
  status: JobStatus;
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
  /** One entry per draft of this run, in position order. */
  decisions: DraftDecision[];
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
 *
 * `coverage` arrives as two primitives, already computed by the caller from
 * `excerptTranscript`. This module deliberately imports nothing from
 * src/prompts.ts (03-02): that boundary is what keeps the prompt builders
 * provably free of row types, so no code path can send a meeting title to
 * OpenAI. The caller computes; this function stores.
 */
export async function createRun(
  db: D1Database,
  transcriptId: string,
  outlierBodies: string[],
  coverage: TranscriptCoverage,
): Promise<string> {
  if (outlierBodies.length < 2 || outlierBodies.length > 3) {
    throw new Error(`A run needs 2 or 3 outliers, got ${outlierBodies.length}`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO runs (id, transcript_id, status, transcript_lines_used, " +
        "transcript_lines_total, created_at, updated_at) " +
        "VALUES (?1, ?2, 'pending', ?4, ?5, ?3, ?3)",
    )
    .bind(id, transcriptId, now, coverage.linesUsed, coverage.linesTotal)
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
 * what the grounding check made of the whole draft. Parsed values only — never
 * the OpenAI response object.
 *
 * Two columns, on purpose. `grounded` stays a plain 1/0 because Phase 4 computes
 * the light-edit rate off it and APPR-05 depends on it being an integer that
 * SQL can count. `grounding_json` carries the counts and the flagged lines,
 * which is what a person actually needs: a boolean that is false on every real
 * draft tells the reviewer no more than one that is true on every real draft.
 */
export async function finishDraft(
  db: D1Database,
  id: number,
  post: string,
  sourceLines: string[],
  grounding: GroundingRecord,
  usage: TokenUsage | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE drafts SET status = 'done', body = ?1, source_lines_json = ?2, grounded = ?3, " +
        "grounding_json = ?4, usage_json = ?5, error_code = NULL, error_message = NULL, " +
        "updated_at = ?6 WHERE id = ?7",
    )
    .bind(
      post,
      JSON.stringify(sourceLines),
      grounding.grounded ? 1 : 0,
      toGroundingJson(grounding),
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
    .prepare(
      "SELECT r.id AS id, r.transcript_id AS transcript_id, r.status AS status, " +
        "r.transcript_lines_used AS transcript_lines_used, " +
        "r.transcript_lines_total AS transcript_lines_total, " +
        "r.created_at AS created_at, r.updated_at AS updated_at, t.title AS transcript_title " +
        "FROM runs r LEFT JOIN transcripts t ON t.id = r.transcript_id WHERE r.id = ?1",
    )
    .bind(runId)
    .first<RunRow & { transcript_title: string | null }>();
  if (!run) return null;
  const { transcript_title, ...runRow } = run;

  const outliers = await db
    .prepare(
      "SELECT id, position, substr(body, 1, ?2) AS excerpt, status, attempts, " +
        "error_code, error_message FROM outliers WHERE run_id = ?1 ORDER BY position",
    )
    .bind(runId, OUTLIER_EXCERPT_CHARS)
    .all<OutlierView>();

  const drafts = await db
    .prepare(
      "SELECT id, position, outlier_id, body, source_lines_json, grounded, grounding_json, " +
        "status, attempts, error_code, error_message, decision, final_body, decided_at, " +
        // Push state rides along in the projection that already runs; SCHED-03
        // does not buy a fourth read of this table.
        "zernio_post_id, zernio_pushed_at, zernio_error_code, zernio_error_message " +
        "FROM drafts WHERE run_id = ?1 ORDER BY position",
    )
    .bind(runId)
    .all<Omit<DraftView, "grounded"> & { grounded: number | null }>();

  return {
    run: runRow,
    transcript_title,
    outliers: outliers.results,
    drafts: drafts.results.map((row) => ({ ...row, grounded: row.grounded === null ? null : row.grounded === 1 })),
  };
}

/**
 * Run list: titles, progress counts and each run's decisions — no draft or
 * transcript bodies.
 *
 * Two queries for the whole page, never N+1. The decisions arrive as one flat
 * read of every draft row and are grouped in JS, rather than as four more
 * correlated subqueries per run or a per-run read inside a loop. When this
 * history grows large enough to need a limit (STATE already records that it
 * would), the second query takes the same `run_id IN (...)` restriction as the
 * first, and the shape here does not change.
 */
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
    .all<Omit<RunSummary, "decisions">>();

  const decisions = await db
    .prepare("SELECT run_id, position, decision, status FROM drafts ORDER BY run_id, position")
    .all<DraftDecision & { run_id: string }>();

  const byRun = new Map<string, DraftDecision[]>();
  for (const { run_id, ...draft } of decisions.results) {
    const list = byRun.get(run_id);
    if (list) list.push(draft);
    else byRun.set(run_id, [draft]);
  }

  return result.results.map((run) => ({ ...run, decisions: byRun.get(run.id) ?? [] }));
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

/* --------------------------------------------------------------------------
 * Phase 4 approval gate (migration 0005): what the executive decided, and the
 * approved posts the next run reads back.
 *
 * The same two rules as everywhere above: bound parameters only, no `RETURNING`
 * (D1's support for it is undocumented), and nothing imported from
 * src/prompts.ts — limits and thresholds arrive as caller-computed primitives,
 * which is what keeps the prompt builders provably free of row types.
 * ------------------------------------------------------------------------ */

/**
 * Record a decision against one draft of one run, and report whether it wrote.
 *
 * Scoped by `run_id` as well as `id` on purpose: the draft id arrives in a URL
 * underneath a run, so a draft belonging to a different run must not be
 * reachable through it. One guarded UPDATE is both the ownership check and the
 * write — a separate SELECT would be a second round trip and a race.
 *
 * `meta.changes === 1` decides the answer, the way `claimNextJob`'s claim does.
 * False means "no such draft in this run", which the caller turns into a 404.
 *
 * `finalBody` is the post as it stands: a copy of `body` on 'accepted', the
 * executive's text on 'edited', NULL on 'rejected'. `body` itself is never
 * touched here — it is the model's original output and half of APPR-05.
 *
 * Deciding twice is allowed and overwrites: the executive may accept a draft,
 * reread it and reject it. `decided_at` is the last decision, not the first.
 */
export async function recordDecision(
  db: D1Database,
  runId: string,
  draftId: number,
  decision: Decision,
  finalBody: string | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE drafts SET decision = ?1, final_body = ?2, decided_at = ?3, updated_at = ?3 " +
        "WHERE id = ?4 AND run_id = ?5",
    )
    .bind(decision, finalBody, now, draftId, runId)
    .run();
  return result.meta.changes === 1;
}

/**
 * The most recently approved posts, newest first, as plain strings.
 *
 * 'accepted' and 'edited' both count: an edited post is one the executive was
 * willing to publish, and its final text is a better sample of their voice than
 * the model's original, which is exactly why `final_body` is read here and
 * `body` is not.
 *
 * `limit` is passed in by the caller, which reads MAX_APPROVED_POSTS from
 * src/prompts.ts; this module must not import it.
 *
 * `excludeRunId` is not defensive padding. It keeps a run's own drafts out of
 * its own prompt, which stops draft 3 echoing draft 1 after a mid-run approval,
 * and keeps the cacheable prompt prefix byte-stable across the three drafting
 * calls of a single run — the prefix would otherwise change underneath them.
 */
export async function listApprovedPosts(
  db: D1Database,
  limit: number,
  excludeRunId: string,
): Promise<string[]> {
  const result = await db
    .prepare(
      "SELECT final_body FROM drafts " +
        "WHERE decision IN ('accepted', 'edited') AND final_body IS NOT NULL " +
        "AND run_id != ?1 ORDER BY decided_at DESC LIMIT ?2",
    )
    .bind(excludeRunId, limit)
    .all<{ final_body: string }>();
  return result.results.map((row) => row.final_body);
}

/* --------------------------------------------------------------------------
 * Phase 5 push (migration 0006): what happened when a draft went to Zernio.
 *
 * Both writers are scoped by run AND draft id, exactly as `recordDecision` is,
 * and for the same reason: ownership is the WHERE clause. A separate ownership
 * SELECT would be a second round trip and a race, and `meta.changes` already
 * says whether the row the caller claimed was really theirs.
 *
 * This module still imports nothing — not from ./prompts and not from ./zernio.
 * Anything either of those knows (a post id, an error code, a cap) arrives as a
 * primitive the caller passes in.
 * ------------------------------------------------------------------------ */

/**
 * Settings keys for the LinkedIn account a push goes to, chosen once on
 * `/zernio` — the same `settings`-table pattern as {@link SPEAKER_NAME_KEY},
 * declared here rather than beside it because everything Zernio lives in this
 * section. The label is stored alongside the id so a page can say which account
 * a push would use without spending a Zernio request on every render.
 */
export const ZERNIO_ACCOUNT_ID_KEY = "zernio.account_id";
export const ZERNIO_ACCOUNT_LABEL_KEY = "zernio.account_label";

/**
 * Record that a draft reached Zernio, with the id Zernio gave it.
 *
 * The non-obvious half is the clearing: a success sets both error columns back
 * to NULL. A draft that failed once and then succeeded is a pushed draft, and
 * stale error text beside a live post id would render as a success and a
 * failure at the same time.
 *
 * Returns false when nothing was updated, which means the draft id does not
 * belong to this run; the caller turns that into a 404.
 */
export async function recordPush(
  db: D1Database,
  runId: string,
  draftId: number,
  zernioPostId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE drafts SET zernio_post_id = ?1, zernio_pushed_at = ?2, " +
        "zernio_error_code = NULL, zernio_error_message = NULL, updated_at = ?2 " +
        "WHERE id = ?3 AND run_id = ?4",
    )
    .bind(zernioPostId, now, draftId, runId)
    .run();
  return result.meta.changes === 1;
}

/**
 * Record that a push failed, with Zernio's own code and message.
 *
 * The non-obvious half is what it does NOT touch: `zernio_post_id` is left
 * alone. A draft that was pushed successfully and later failed a re-push still
 * has its post sitting in Zernio, and blanking the id would throw away the only
 * receipt for something that exists over there.
 *
 * `message` is capped at `MAX_ERROR_MESSAGE`, the same cap `failJob` puts on job
 * error text, because it lands in the same place: rendered on the run page and
 * stored in D1 forever.
 */
export async function recordPushFailure(
  db: D1Database,
  runId: string,
  draftId: number,
  code: string,
  message: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE drafts SET zernio_error_code = ?1, zernio_error_message = ?2, " +
        "zernio_pushed_at = ?3, updated_at = ?3 WHERE id = ?4 AND run_id = ?5",
    )
    .bind(code, message.slice(0, MAX_ERROR_MESSAGE), now, draftId, runId)
    .run();
  return result.meta.changes === 1;
}

/* --------------------------------------------------------------------------
 * Phase 5 landing page (migration 0007): pilot requests from the public form.
 * ----------------------------------------------------------------------- */

/**
 * Record a pilot request from the public landing page.
 *
 * The only write in this file reachable without Cloudflare Access. The caller
 * (`src/landing.tsx`) shape-checks and caps the address first; this helper
 * does not re-validate, in the same way `recordDecision` trusts its route.
 * Nothing is returned because the page has nothing to say about the row —
 * a duplicate address is a person asking twice, not a conflict to report.
 */
export async function insertPilotRequest(db: D1Database, email: string): Promise<void> {
  await db
    .prepare("INSERT INTO pilot_requests (email, created_at) VALUES (?1, ?2)")
    .bind(email, new Date().toISOString())
    .run();
}
