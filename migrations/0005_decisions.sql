-- Phase 4: what the executive decided about each draft.
--
-- APPR-05 — "at least 80% of drafts approved with only light edits" — is the
-- measurable half of this project, and it is a number only if every draft row
-- carries four things: the model's original text, the text as it finally stands,
-- the decision, and when it was made. These three columns are the other three;
-- `body` already holds the first.
--
-- `body` is NEVER overwritten by an edit. It is the model's original output and
-- one half of the measurement: a row whose original text was destroyed by the
-- edit that replaced it can never again say how much the executive changed.
--
-- NULL is a real state, not a defect. `decision` is NULL for every draft written
-- before this migration and for every draft in a run the executive has not
-- reviewed yet. A reader must show undecided as undecided rather than counting it
-- against either side of the ratio.
--
-- `final_body` is written on 'accepted' (a copy of `body`) as well as on
-- 'edited' (the executive's text), so "the final text" is a column rather than a
-- COALESCE every reader has to remember. NULL on 'rejected' and while undecided.
--
-- APPR-05, the whole measurement, one query:
--   SELECT decision,
--          COUNT(*) AS n,
--          AVG(ABS(length(final_body) - length(body))) AS avg_char_delta
--   FROM drafts WHERE decision IS NOT NULL GROUP BY decision;
-- `avg_char_delta` is a PROXY for edit size, not an edit distance. It says how
-- much text moved, never how much meaning did. Report it as what it is.
--
-- Nothing here changes what leaves the Worker. The compliance note at the head
-- of 0003_runs.sql still governs: no meeting title, participant name or other
-- speaker's words may ever reach OpenAI.
--
-- One ADD COLUMN per ALTER TABLE (SQLite/D1 takes no more), and none may be
-- NOT NULL because rows already exist in both databases.

ALTER TABLE drafts ADD COLUMN decision TEXT;    -- 'accepted' | 'edited' | 'rejected'; NULL = undecided
ALTER TABLE drafts ADD COLUMN final_body TEXT;  -- the post as it stands after the decision
ALTER TABLE drafts ADD COLUMN decided_at TEXT;  -- ISO timestamp of the decision
