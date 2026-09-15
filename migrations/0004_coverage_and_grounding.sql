-- Phase 3 gap closure: transcript coverage, and a slot for the grounding report.
--
-- What the phase-3 verification found: `MAX_TRANSCRIPT_CHARS` silently dropped
-- roughly a third of an 18,429-character meeting on production run 1. The
-- counts were already computed (`excerptTranscript` returns linesUsed and
-- linesTotal) but nothing stored or showed them, so the only evidence the
-- executive had that two thirds of their words never reached the model was
-- drafts that felt thin. Storing the counts on the run makes the claim exact
-- and permanent: it is the coverage of the body as it was at creation time,
-- not a figure recomputed later against a transcript that may have changed.
--
-- NULL is a real state, not a defect. Every run created before this migration
-- has no coverage figure, and every read must handle NULL by saying nothing
-- rather than inventing a number — over-claiming is the exact fault this
-- migration exists to fix.
--
-- `grounding_json` holds the report from `checkGrounding` (filled by 03-07):
-- counts, and the lines the check could not trace back to the transcript. It
-- never holds a copy of the draft, and no transcript text beyond the lines it
-- is quoting back to the user.
--
-- Nothing here changes what leaves the Worker. The compliance note at the head
-- of 0003_runs.sql still governs: no meeting title, participant name or other
-- speaker's words may ever reach OpenAI.
--
-- One ADD COLUMN per ALTER TABLE (SQLite/D1 takes no more), and none may be
-- NOT NULL because rows already exist in both databases.

ALTER TABLE runs ADD COLUMN transcript_lines_used INTEGER;
ALTER TABLE runs ADD COLUMN transcript_lines_total INTEGER;
ALTER TABLE drafts ADD COLUMN grounding_json TEXT;
