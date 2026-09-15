---
phase: 05-zernio-push
plan: 02
subsystem: database
tags: [d1, sqlite, migration, zernio, push, sched-03]

# Dependency graph
requires:
  - phase: 03-drafting (03-02)
    provides: "migration 0003's `drafts` table and the `src/db.ts` conventions — bound parameters everywhere, no RETURNING, no bodies in list projections, and MAX_ERROR_MESSAGE as the cap on any error text that lands in D1"
  - phase: 04-approval-gate (04-01)
    provides: "the nullable-columns-on-an-existing-table migration shape, and `recordDecision`'s ownership-is-the-WHERE-clause pattern that both writers here copy exactly"
  - phase: 05-zernio-push (05-01, same wave)
    provides: "`ZernioError.code` and the `post._id` these columns store; 05-01 owns src/zernio.ts and this plan never touched it"
provides:
  - "`drafts.zernio_post_id`, `zernio_pushed_at`, `zernio_error_code`, `zernio_error_message` on local AND remote D1 (migration 0006)"
  - "`recordPush(db, runId, draftId, zernioPostId)` — run-scoped, and clears both error columns"
  - "`recordPushFailure(db, runId, draftId, code, message)` — run-scoped, and leaves the post id alone"
  - "`DraftView` carrying the four push columns, selected by the `getRunView` projection that already ran"
affects: [05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership as a WHERE clause, reused: a URL-supplied draft id is scoped by its run in the same UPDATE, and meta.changes answers"
    - "A success clears the failure record; a failure never clears the success record — the asymmetry is the state machine"
    - "New state on an existing row rides along in the projection that already runs, rather than buying a query"

key-files:
  created:
    - migrations/0006_push.sql
  modified:
    - src/db.ts

key-decisions:
  - "A NULL `zernio_post_id` beside a non-NULL `zernio_error_code` is a failed push and a real state, written into the migration header because it is the fact a later reader gets wrong"
  - "`recordPush` clears both error columns: a draft that failed once and then succeeded is a pushed draft, and stale error text beside a live post id would render as both at once"
  - "`recordPushFailure` leaves `zernio_post_id` alone: a failed re-push must not discard the receipt for a post that still exists in Zernio"
  - "`zernio_pushed_at` is the timestamp of the LAST ATTEMPT, success or failure — meaningless read alone, exact read beside the id and the code"
  - "The message is capped with the existing `MAX_ERROR_MESSAGE` (500), the same cap `failJob` puts on job error text, rather than a new constant"
  - "`listRuns` was deliberately left alone: SCHED-03 is satisfied on the run page, and push state in the list is a second concern and a wider read for no requirement"
  - "The migration header states that nothing here is ever published — the post id is a receipt for an unscheduled draft in Zernio, never a LinkedIn URL"

patterns-established:
  - "Helper SQL is verified by capturing it from the compiled module through a stub D1, then running the captured statement verbatim against local D1 — so the SQL tested is provably the SQL shipped, not a hand-transcription of it"
  - "A cap applied in JS is proved at the binding (a 700-char message arrived as 500), not read off the source line"

# Metrics
duration: ~4 min
completed: 2026-09-15
---

# Phase 5 Plan 02: Push State Columns and Helpers Summary

**Migration 0006 gives every draft a Zernio post id, a last-attempt timestamp and a failure record on both databases, and `src/db.ts` gains a run-scoped `recordPush` that clears the error and a run-scoped `recordPushFailure` that preserves the post id — so SCHED-03's "pushed state and Zernio id, or a clear error" is a pair of columns before anything renders through it.**

## Performance

- **Duration:** ~4 min, fully autonomous
- **Started:** 2026-09-15T14:44:57Z
- **Completed:** 2026-09-15T14:49Z
- **Tasks:** 2 (both auto)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **SCHED-03 has a data model, in both directions.** A draft can record that it landed (post id + timestamp, errors cleared) or that it failed (code + message + timestamp, post id preserved). Neither state can silently erase the other.
- **The asymmetry is the whole design and it was measured, not reasoned about.** A failure, then a success, then a re-push failure were driven through local D1 in sequence: the success cleared `duplicate` / "Duplicate content within 24h" to NULL and set `zp_abc123`; the later `http_502` was written **beside** that id rather than over it.
- **A push cannot be recorded against a draft in another run.** Both UPDATEs were run with draft 9001 under `run-bbb` — the other run's id — and both changed **0 rows**, with neither row's stored values moving afterwards.
- **The run page's read did not get more expensive.** `getRunView` still issues exactly 3 queries (counted by driving the real function against a stub D1); the four columns ride in the `drafts` projection that already ran. `listRuns` is untouched, so the run list is still two queries.
- **The SQL verified is provably the SQL shipped.** `src/db.ts` was compiled with esbuild and both helpers were called against a stub `D1Database` that captured their prepared statement and bindings; those captured statements were then executed verbatim against local D1. No step of the check depended on me retyping the query correctly.
- `npm run check` exits 0; `npm test` 68/68 (61 before this wave; the extra 7 are 05-01's, landed in parallel — the count did not fall); `src/db.ts` still has **no import lines at all**, from `./prompts` or `./zernio`.

## Task Commits

1. **Task 1: Migration 0006 — push state on drafts** — `750c283` (feat)
2. **Task 2: Push writes and push state on the run read** — `c5d6644` (feat)

**Plan metadata:** see the `docs(05-02)` commit following this summary.

## Files Created/Modified

- **`migrations/0006_push.sql`** (new) — four nullable TEXT columns on `drafts`, one `ADD COLUMN` per `ALTER TABLE`. The header carries the four facts a later reader would get wrong: NULL is "never pushed"; NULL id + non-NULL code is a failed push and a real state; a success clears the error while a failed re-push keeps the id; and **nothing here is ever published** — the id is a receipt for an unscheduled draft inside Zernio, and published posts carry `platformPostUrl`, which this project never creates. The 0003 compliance note is restated as still governing. Applied to local **and** remote D1.
- **`src/db.ts`** — `DraftView` gains the four columns (documented so the page renders the error when there is no id); the `getRunView` drafts projection selects them with a comment saying why they ride along rather than buying a read; new `recordPush` and `recordPushFailure` under a Phase 5 section header that restates the no-import boundary.

## Verification

Two runs seeded into local D1 (`run-aaa` and `run-bbb`, one draft each, ids 9001 and 9002), then each helper's statement executed with `SELECT changes()` after it:

| Check | Result |
|---|---|
| `wrangler d1 migrations list --local` | no migrations to apply (0006 applied) |
| `wrangler d1 migrations list --remote` | no migrations to apply (0006 applied) |
| `PRAGMA table_info(drafts)` local | all four `zernio_*` columns present |
| `PRAGMA table_info(drafts)` remote | all four `zernio_*` columns present |
| `recordPushFailure` on the right run | `changes() = 1`; code + message + timestamp set, `zernio_post_id` still NULL — **the failed-push state** |
| `recordPush` after that failure | `changes() = 1`; `zernio_post_id = zp_abc123`, **both error columns back to NULL** |
| `recordPushFailure` on the already-pushed draft | `changes() = 1`; `http_502` / "Bad gateway" written **beside** `zp_abc123`, id untouched |
| **`recordPush`, draft 9001 under `run-bbb`** | **`changes() = 0`** |
| **`recordPushFailure`, draft 9001 under `run-bbb`** | **`changes() = 0`** |
| both rows re-read after the cross-run attempts | unchanged — 9001 still run-aaa's values, 9002 still all-NULL |
| `body` throughout | never written by any path; `post A` / `post B` intact at every step |
| message cap | a 700-char message arrived at the binding as **500** chars (`MAX_ERROR_MESSAGE`) |
| `getRunView` query count | **3**, driven against a stub D1 — unchanged by this plan |
| the widened projection against local D1 | returns all four columns with the expected values |
| `git diff src/db.ts \| grep listRuns` | no match — the run list is untouched |
| `grep -n "^import" src/db.ts` | no match |
| `npm run check` | exit 0 |
| `npm test` | 68/68 |
| local D1 after cleanup | **0 rows across runs, drafts, outliers, transcripts, voice_samples** |

## Decisions Made

- **The success/failure asymmetry is deliberate and is the state machine.** `recordPush` clears the error columns; `recordPushFailure` does not clear the post id. Symmetry either way produces a lie: clearing the id on a failed re-push loses the receipt for a post that exists in Zernio, and leaving stale error text after a success renders the same draft as landed and broken simultaneously.
- **A failed push is a first-class state, not the absence of a successful one.** SCHED-03 asks for the pushed state *and* a clear error, so the page must be able to tell "never pushed" (everything NULL) from "tried and failed" (code set, id NULL). That distinction is written into the migration header and onto the `DraftView` type, because it is invisible in the column list.
- **`zernio_pushed_at` means last attempt, not last success.** One timestamp for both outcomes keeps the row honest about when its current state was decided; a `pushed_at` that only moved on success would sit frozen beside a fresh error.
- **The error message reuses `MAX_ERROR_MESSAGE` (500) rather than adding a constant.** It is the same kind of text landing in the same place — rendered on the run page, stored in D1 forever — and `failJob` already caps job errors with it. A second cap would be two numbers to keep in step for no reason.
- **`listRuns` was left alone.** SCHED-03 is satisfied on the run page. Adding push state to the list means a wider read on every row for a requirement nobody wrote, and 04-01 worked to get that page down to two queries.
- **Ownership is still the WHERE clause.** Copied from `recordDecision` deliberately: the draft id arrives from a URL nested under a run, a prior ownership `SELECT` would be a second round trip and a race, and `meta.changes === 1` already answers. The caller turns `false` into a 404.
- **`src/db.ts` still imports nothing, now also from `./zernio`.** The post id and the error code arrive as caller-supplied primitives, exactly as `limit` does from `src/prompts.ts`. The boundary is the same one that keeps the prompt path provably free of row types.

## Deviations from Plan

**None — plan executed as written.** Three things worth recording:

**1. The remote migration went through on the first attempt.** STATE warned of Cloudflare API error 7403 on 2 of 3 previous remote migrations. No error this time, so the tally is now **2 failures in 4 remote migrations**. Still a recurring transient; the retry-once advice stands.

**2. The plan's "the run page is at four reads" needs a correction.** `getRunView` issues **three** queries (run, outliers, drafts) and `GET /runs/:id` calls it once, so the run page render is three reads, not four. Either way the number is unchanged by this plan, which was the actual instruction; the figure is corrected here so it does not propagate.

**3. The test count moved up, not down.** The plan says the count must not fall from 61. It is 68, because 05-01 landed `test/zernio.test.ts` in the same wave. This plan added no tests: the two helpers are I/O against D1, and this codebase's line is that pure logic is pinned by test and D1 behaviour is measured against a seeded database.

## Issues Encountered

- **Verifying a helper by retyping its SQL is a test of my typing, not of the code.** The cross-run case is the security claim of this plan, and a hand-copied `WHERE` clause that happened to be correct would prove nothing about what ships. So `src/db.ts` was compiled with the esbuild already in `node_modules`, both helpers were called against a stub `D1Database` capturing `prepare()` and `.bind()`, and the captured statement was inlined with its own bindings and run against local D1. That is also what turned the 500-char cap into an observation rather than a reading of the source.
- **`wrangler d1 execute` still surfaces no per-statement `meta.changes`**, so every UPDATE is followed by `SELECT changes()` in the same file, as 04-01 established. The stored values were then re-read independently, because `changes() = 0` and "the row is unchanged" are two claims and only the second one matters to the executive.
- **Draft ids were seeded at 9001/9002 on purpose.** `drafts` is empty but `AUTOINCREMENT` remembers Phase 3 and 4's high-water mark; hardcoding `id = 1` would have updated nothing and "passed", which 04-01 flagged.

## User Setup Required

None in this plan. **05-03 carries the Zernio account setup** (API key confirmation and connecting a LinkedIn account in the Zernio dashboard); nothing here needs a secret, an external service or a deploy.

## Next Phase Readiness

**05-03 (wave 2) is unblocked on the storage side.** It gets:

- `recordPush` / `recordPushFailure` returning `false` for "no such draft in this run" — the 404 its route needs, same contract as `recordDecision`.
- `DraftView` carrying the four columns from the read the run page already does, so the pushed badge, the Zernio id and the failure message are all rendering decisions now.
- The rule the page must honour: **a NULL id beside a non-NULL error code is a failed push**, so a draft that tried and failed must never render as "not pushed yet".
- 05-03 also touches `src/db.ts` (for the selected-account setting). That file is free again from this plan's side; both new helpers sit at the end under a Phase 5 header.

**Remote schema is ahead of remote code, deliberately** — the same arrangement 03-06 and 04-01 left. All four columns are nullable and no deployed code reads or writes them. **05-04 owns the deploy.**

**Nothing here has been observed against Zernio.** These columns have only ever held values an agent wrote. What a real `ZernioError.code` looks like, and whether a 409 duplicate is the common failure in practice, are 05-01's and 05-03's to find out.

**The carried-over concern is unchanged and this plan does not touch it.** Four items are still approved-but-unobserved on production (`/health`, a real decision written to production D1, the grounding panel against a real draft, DRAFT-04 end to end), and the 80% approval target is still unmet with one data point behind it. A push button makes an unpublishable draft reach Zernio faster; it does not make it publishable.

---
*Phase: 05-zernio-push*
*Completed: 2026-09-15*
