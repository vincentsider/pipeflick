---
phase: 04-approval-gate
plan: 01
subsystem: database
tags: [d1, sqlite, migration, approval, appr-05, measurement]

# Dependency graph
requires:
  - phase: 03-drafting (03-02)
    provides: "migration 0003's `drafts` table, `src/db.ts` conventions (bound parameters, no RETURNING, no bodies in list projections) and the no-import boundary against src/prompts.ts"
  - phase: 03-drafting (03-06)
    provides: "the nullable-columns-on-an-existing-table pattern from migration 0004, and the caller-computes/db-stores primitive rule"
  - phase: 03-drafting (03-07)
    provides: "`grounding_json` beside `grounded`, and the finding that `grounded` stays an integer precisely because APPR-05 counts it in SQL"
provides:
  - "`drafts.decision`, `drafts.final_body`, `drafts.decided_at` on local AND remote D1 (migration 0005)"
  - "`recordDecision(db, runId, draftId, decision, finalBody)` — one guarded UPDATE that is both the ownership check and the write"
  - "`listApprovedPosts(db, limit, excludeRunId)` — accepted and edited final text, newest first"
  - "`Decision` and `DraftDecision` types"
  - "`DraftView` carrying decision, final_body and decided_at; `RunSummary` carrying per-draft decisions"
  - "The APPR-05 light-edit query, written into the migration header and executed as written"
affects: [04-02, 04-03, 05-zernio-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership as a WHERE clause: a URL-supplied child id is scoped by its parent in the same UPDATE, never checked by a prior SELECT"
    - "The original output is never overwritten by the edited one — both columns exist because the measurement needs the pair"
    - "A list view that needs per-child data takes one flat second query grouped in JS, not N+1 and not more correlated subqueries"

key-files:
  created:
    - migrations/0005_decisions.sql
  modified:
    - src/db.ts

key-decisions:
  - "`final_body` is written on 'accepted' as well as 'edited', so the final text is a column rather than a COALESCE every reader must remember"
  - "`body` is never overwritten: an edit that destroyed the original would make that row's light-edit rate uncomputable forever"
  - "`recordDecision` is scoped by run_id as well as id — one guarded UPDATE is both the ownership check and the write, and meta.changes decides"
  - "`listApprovedPosts` excludes the calling run, which stops draft 3 echoing draft 1 and keeps the cacheable prompt prefix byte-stable within a run"
  - "The APPR-05 measurement lives in the migration header, with avg_char_delta labelled a proxy for edit size rather than an edit distance"
  - "`limit` stays a caller-computed primitive so src/db.ts still imports nothing from src/prompts.ts"

patterns-established:
  - "A measurement claim in a plan is written into the schema as runnable SQL and then actually run, so 'computable with one query' is checkable rather than asserted"
  - "D1 helper behaviour is proved against seeded local D1 by driving the exact SQL, including the negative case, then deleting every seeded row"

# Metrics
duration: ~7 min
completed: 2026-09-15
---

# Phase 4 Plan 01: Decision Columns and Helpers Summary

**Migration 0005 gives every draft a decision, a final text and a timestamp on both databases, and `src/db.ts` gains a run-scoped `recordDecision` plus a newest-first `listApprovedPosts` — so the 80% light-edit claim is now one SQL query away from the data instead of an opinion.**

## Performance

- **Duration:** ~7 min, fully autonomous
- **Started:** 2026-09-15T13:53:44Z
- **Completed:** 2026-09-15T14:00Z
- **Tasks:** 2 (both auto)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **APPR-05 has a data model.** Every draft row can now hold the model's original text (`body`, untouched), the text as it finally stands (`final_body`), what was decided and when. The pair is the measurement; either half alone is not.
- **The measurement query is in the schema and has been run**, not described. The migration header carries the exact `GROUP BY decision` query, and it executed against seeded local D1 returning `accepted n=2 delta=0`, `edited n=1 delta=19`, `rejected n=1 delta=NULL`.
- **A draft cannot be decided through a run that does not own it.** The guarded UPDATE was driven directly: the same draft id under the wrong run changed **0 rows** and its stored text was unchanged afterwards.
- **`listApprovedPosts` is the 04-03 input**, already excluding a given run so a run never feeds its own drafts back into its own prompt.
- **`listRuns` gained per-draft decisions at a cost of one flat query**, not four more subqueries per row and not a per-run read.
- `npm run check` exits 0; `npm test` 57/57; `src/db.ts` still imports nothing at all.

## Task Commits

1. **Task 1: Migration 0005 — decision, final text and timestamp on drafts** — `d1fe1e2` (feat)
2. **Task 2: Decision write, approved-post read, and decisions in the run views** — `82734c1` (feat)

**Plan metadata:** see the `docs(04-01)` commit following this summary.

## Files Created/Modified

- **`migrations/0005_decisions.sql`** (new) — three nullable columns on `drafts`, one `ADD COLUMN` per `ALTER TABLE`. The header states what each column means, that NULL is undecided and a real state, that `body` is never overwritten, and carries the APPR-05 query with its proxy caveat. Applied to local and remote D1.
- **`src/db.ts`** — `Decision` and `DraftDecision` types; `DraftView` gains `decision`, `final_body`, `decided_at` and `getRunView` selects them; `RunSummary` gains `decisions[]` filled by a second flat query grouped in JS; new `recordDecision` and `listApprovedPosts` under a Phase 4 section header.

## Verification

Run against local D1 with two seeded runs (`seed-run-a`, 3 drafts; `seed-run-b`, 1 draft), by executing the exact SQL each helper builds:

| Check | Result |
|---|---|
| `PRAGMA table_info(drafts)` local | `decision`, `final_body`, `decided_at` present |
| `PRAGMA table_info(drafts)` remote | all three present |
| accept / edit / reject UPDATE, correct run | `changes() = 1` each |
| same UPDATE with a draft id from another run | **`changes() = 0`**, and that draft still reads `B1 original`, not `stolen` |
| `body` after an edit | `A2 original` intact beside `final_body` = the rewritten text |
| approved read excluding run B | `A2 as the executive rewrote it`, then `A1 original` — newest first, rejected row absent |
| approved read excluding run A | only `B1 original` |
| `LIMIT 1` | the newest only |
| APPR-05 query | runs as written; see counts above |
| `listRuns` decisions query | 4 rows ordered by `run_id`, `position` |
| `grep -n 'from "./prompts"' src/db.ts` | no match |
| local D1 after cleanup | **0 rows across runs, drafts, outliers, transcripts** |

## Decisions Made

- **`final_body` is written on accept, not only on edit.** A `COALESCE(final_body, body)` in every reader is one forgotten call away from a post being published as the model wrote it after the executive changed it. The column always holds the truth for a decided row; NULL only ever means rejected or undecided.
- **`body` is immutable after generation.** This is the load-bearing half of APPR-05: a row whose original was overwritten by the edit can never again say how much the executive changed, and no later migration can recover it.
- **Ownership is the WHERE clause.** `recordDecision` scopes by `run_id` as well as `id`, because the draft id arrives from a URL nested under a run. A prior `SELECT` to check ownership would be a second round trip and a race; the guarded UPDATE is both, and `meta.changes === 1` answers, exactly as `claimNextJob`'s claim does.
- **`avg_char_delta` is documented as a proxy.** It says how much text moved, never how much meaning did. A one-word change that reverses a claim scores 3; a reflow that changes nothing scores 200. Stated in the header so no future reader quotes it as an edit distance.
- **Deciding twice is allowed and overwrites**, with `decided_at` meaning the last decision. An executive may accept a draft, reread it and reject it; refusing that would make the gate lie about what they think now.
- **`limit` is a caller-computed primitive.** 04-03's `MAX_APPROVED_POSTS` lives in `src/prompts.ts`, and `src/db.ts` importing it would breach the boundary that keeps the prompt builders provably free of row types (03-02, 03-06, 03-07). Same reasoning as `createRun`'s coverage pair and `finishDraft`'s structural `GroundingRecord`.
- **Decisions reach the run list through a second flat query**, grouped into a `Map` in JS. `listRuns` already carries four correlated subqueries per row; adding four more to fetch decisions would have made the page's cost grow with the history twice over. Two queries total, no bodies, and when this list finally needs a limit the same `run_id IN (...)` restriction fits both.

## Deviations from Plan

**None — plan executed as written.** Three things worth recording, none of which changed the plan's shape:

**1. The plan's test count was stale.** It says "60 tests today; this plan adds none and must break none". The real count is **57** — 03-07 deleted the three `isGrounded` tests, which STATE.md already records. Neither test file imports `src/db.ts`, so the figure was unaffected by this plan either way. 57/57 pass.

**2. The remote migration needed the retry the plan predicted.** `npm run db:migrate:remote` failed first with Cloudflare API error 7403 ("account not valid or not authorized") on a valid token, and succeeded immediately on retry — exactly as 03-02 saw. This is now **two occurrences out of three remote migrations**, so it is a recurring transient rather than the one-off STATE currently calls it.

**3. `avg_char_delta` is NULL for rejected rows**, because `final_body` is NULL there and SQLite's `AVG` over NULL is NULL. That is correct and desirable — a rejected draft has no final text and so has no edit size — but it is NULL, not 0, and a reader charting the three groups must not plot it as "no change".

## Issues Encountered

- **`SELECT changes()` was the only honest way to check the guard from the CLI.** `wrangler d1 execute` does not surface `meta.changes` per statement in a way worth parsing, so each UPDATE in the seed script is followed by `SELECT changes() AS ..._expect_N;` and the whole file run with `--json`. That is what made the cross-run case a measured 0 rather than an inferred one; the stored text was then re-read to confirm it independently.
- **Draft ids were 30-33, not 1-4.** `drafts` is empty but `AUTOINCREMENT` remembers the high-water mark from Phase 3's seeding. Harmless here, but a seed script that hardcodes `id = 1` would have silently updated nothing and "passed".

## User Setup Required

None. No secret, no external configuration, no deploy.

## Next Phase Readiness

**04-02 (wave 2) is unblocked.** It has everything it writes through:

- `recordDecision` returning `false` for "no such draft in this run" — the 404 the route needs.
- `DraftView.final_body` to prefill the edit box, falling back to `body` when undecided.
- `RunSummary.decisions` (position, decision, status per draft) for the run-list cell.
- The reminder from 03-07 that still binds: render the grounding **report** beside the decision control, never the bare `grounded` boolean.
- 04-02 owns deriving 'edited' by comparing the submitted text against `body`. The DB layer deliberately does not: it stores what it is told, and a self-reported "I edited it" would measure what people claim rather than what they did.

**04-03 (wave 3) has its read.** `listApprovedPosts(db, MAX_APPROVED_POSTS, runId)` — the constant stays on the prompts side.

**Remote schema is ahead of remote code, deliberately**, the same way 03-06 left it. All three columns are nullable and no deployed code reads or writes them. 04-03 owns the deploy.

**The open risk is untouched by this plan, and this plan is the instrument for it.** Run 1's three drafts were unpublishable; `steer-draft-topics.md` and `context-layer-for-drafts.md` are still open. The gate this plan's columns feed will now record the approval rate faithfully — including a low one. **Phase 4 is not a success because the gate works; it is a success when the rate it records is real and the number is good.** On current evidence the first honest reading will be poor, and that is the point of building the meter before tuning the engine.

---
*Phase: 04-approval-gate*
*Completed: 2026-09-15*
