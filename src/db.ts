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
