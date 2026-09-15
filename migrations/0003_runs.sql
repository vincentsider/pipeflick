-- Phase 3: outlier templates and generated drafts.
--
-- Compliance note (PROJECT.md, Data Protection (Jersey) Law 2018):
-- Nothing in this phase may send a meeting title, a participant name, a speaker
-- label or any other speaker's words to OpenAI. Only three things may leave the
-- Worker: `transcripts.body` (already speaker-filtered to the executive's own
-- lines by migration 0002), `voice_samples.body`, and `outliers.body` — outlier
-- text the user pasted themselves. Meeting titles routinely name a counterparty,
-- which is why `runs` stores only `transcript_id` and the prompt builder takes
-- primitives rather than a transcript row.
--
-- `outliers.template_json` is stored but NEVER rendered in the UI (OUTL-02, a
-- product decision recorded in REQUIREMENTS.md "Out of Scope"). The status-page
-- projection omits the column at the query, so this is structural, not a
-- rendering discipline.
--
-- `usage_json` holds ONLY {input_tokens, output_tokens, reasoning_tokens} from
-- the OpenAI response — never the response object, which carries reasoning
-- metadata and inflates D1. It exists so the phase cost estimate becomes a
-- measurement after two real runs.

-- One drafting run: a transcript plus the pasted outliers, generating 3 drafts.
CREATE TABLE runs (
  id            TEXT PRIMARY KEY,          -- crypto.randomUUID()
  transcript_id TEXT NOT NULL,
  status        TEXT NOT NULL,             -- 'pending' | 'running' | 'done' | 'failed'
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One pasted over-performing post, and the reusable format extracted from it.
-- Also a job row: status/attempts/started_at drive the claim-then-work guard.
CREATE TABLE outliers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  position      INTEGER NOT NULL,          -- 1..3
  body          TEXT NOT NULL,             -- the pasted outlier post
  template_json TEXT,                      -- NULL until extracted; never rendered
  status        TEXT NOT NULL,             -- 'pending' | 'running' | 'done' | 'failed'
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_code    TEXT,
  error_message TEXT,
  usage_json    TEXT,                      -- {input_tokens, output_tokens, reasoning_tokens}
  started_at    TEXT,
  updated_at    TEXT NOT NULL
);

-- One generated post. Also a job row, claimable only once its outlier's
-- template exists.
CREATE TABLE drafts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            TEXT NOT NULL,
  position          INTEGER NOT NULL,      -- 1..3
  outlier_id        INTEGER NOT NULL,      -- which template filled this draft
  body              TEXT,                  -- NULL until generated
  source_lines_json TEXT,                  -- quotes the model grounded on
  grounded          INTEGER,               -- 1 when every source line is in the transcript
  status            TEXT NOT NULL,         -- 'pending' | 'running' | 'done' | 'failed'
  attempts          INTEGER NOT NULL DEFAULT 0,
  error_code        TEXT,
  error_message     TEXT,
  usage_json        TEXT,                  -- {input_tokens, output_tokens, reasoning_tokens}
  started_at        TEXT,
  updated_at        TEXT NOT NULL
);

CREATE INDEX outliers_run ON outliers(run_id, position);
CREATE INDEX drafts_run   ON drafts(run_id, position);
