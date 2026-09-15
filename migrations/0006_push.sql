-- Phase 5: what happened when a draft was pushed to Zernio.
--
-- SCHED-03 asks for two things on the run page: a draft shows its pushed state
-- and its Zernio id, and a failed push shows a clear error. Both are columns
-- before they are pixels, which is why they land here and not alongside the
-- rendering.
--
-- NULL is a real state, not a defect. Every draft written before this migration
-- has never been pushed, and so does every draft the executive has approved but
-- not sent. A reader must show "not pushed" as not pushed rather than as an
-- error or as a success with a missing id.
--
-- A NULL `zernio_post_id` beside a NON-NULL `zernio_error_code` is a FAILED
-- PUSH, and it is a real state too. Both halves are needed: SCHED-03 asks for
-- the pushed state *and* a clear error on failure, so the page reads the error
-- columns when there is no id rather than rendering nothing.
--
-- A SUCCESSFUL PUSH CLEARS THE ERROR COLUMNS. A draft that failed once (a
-- timeout, a duplicate, a dropped connection) and then succeeded is a pushed
-- draft. Leaving stale error text beside a live post id would render as both at
-- once, and a reviewer would not know which of the two to believe.
--
-- A re-push that fails, on the other hand, leaves `zernio_post_id` alone: the
-- earlier post still exists in Zernio and the id is the only receipt for it.
--
-- NOTHING HERE IS EVER PUBLISHED. The Zernio post is a *draft in Zernio*, and
-- `zernio_post_id` is a receipt for something sitting unscheduled in Vincent's
-- Zernio account — not a LinkedIn URL and not a scheduled post. Published posts
-- carry `platformPostUrl` in Zernio's own model; this project never creates one,
-- and no column here should ever be read as evidence that something went live.
-- Auto-publishing is out of scope for the pilot (PROJECT.md), and the approval
-- gate in Phase 4 is the only thing that decides a post is fit to leave at all.
--
-- `zernio_pushed_at` is the timestamp of the LAST ATTEMPT, success or failure —
-- not "the time this went to Zernio". Read with the id and the error code, it
-- says when the state beside it was decided; read alone it says nothing.
--
-- The compliance note at the head of 0003_runs.sql still governs. Nothing in
-- this migration changes what leaves the Worker toward OpenAI: these columns are
-- written after a draft exists and are never part of any prompt.
--
-- One ADD COLUMN per ALTER TABLE (SQLite/D1 takes no more), and none may be
-- NOT NULL because rows already exist in both databases.

ALTER TABLE drafts ADD COLUMN zernio_post_id TEXT;       -- Zernio's `_id`; NULL = never reached Zernio
ALTER TABLE drafts ADD COLUMN zernio_pushed_at TEXT;     -- ISO timestamp of the last push attempt
ALTER TABLE drafts ADD COLUMN zernio_error_code TEXT;    -- ZernioError.code of the last failure; NULL after a success
ALTER TABLE drafts ADD COLUMN zernio_error_message TEXT; -- Zernio's own text; NULL after a success
