-- Phase 2: the executive's own words.
--
-- Compliance note (PROJECT.md, Data Protection (Jersey) Law 2018):
-- `transcripts.body` holds ONLY the executive's own lines, joined by "\n".
-- No other speaker's text, no participant names or emails, no meeting summary
-- and no Fireflies URLs are stored here, by design. Speaker filtering happens
-- before anything reaches this table.
CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  speaker_label TEXT NOT NULL,
  body TEXT NOT NULL,
  line_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);

-- Pasted past writing (LinkedIn posts, newsletters) used as voice fuel.
CREATE TABLE voice_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX transcripts_meeting_date ON transcripts(meeting_date DESC);
