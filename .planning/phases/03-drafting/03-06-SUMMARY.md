---
phase: 03-drafting
plan: 06
subsystem: ui
tags: [d1, sqlite, migration, hono-jsx, transparency, transcripts]

# Dependency graph
requires:
  - phase: 03-drafting (03-01)
    provides: "`excerptTranscript` returning {text, linesUsed, linesTotal} and MAX_TRANSCRIPT_CHARS"
  - phase: 03-drafting (03-02)
    provides: "migration 0003 job tables, `createRun`, `getRunView`, the no-prompts-import boundary in src/db.ts"
  - phase: 03-drafting (03-03)
    provides: "the run status page, NewRunForm, the progress paragraph the coverage line sits under"
provides:
  - "migration 0004: runs.transcript_lines_used, runs.transcript_lines_total, drafts.grounding_json"
  - "Transcript coverage stored on the run at creation and rendered exactly on the run page"
  - "A pre-run warning on any transcript that MAX_TRANSCRIPT_CHARS will cut"
  - "`TranscriptSummary.body_chars` — a body length without the body"
  - "An empty grounding_json column for 03-07 to fill"
affects: [03-07, 04-approval-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nullable columns as an honest 'no data' state: the UI says nothing rather than inventing a figure for rows that predate a migration"
    - "Aggregate-not-body projection: length(body) travels to the UI, body does not"

key-files:
  created:
    - migrations/0004_coverage_and_grounding.sql
  modified:
    - src/db.ts
    - src/runs.tsx

key-decisions:
  - "Coverage is computed by the caller and stored as two primitives; src/db.ts still imports nothing from src/prompts.ts"
  - "Counts are frozen at run creation rather than recomputed at render, so the figure describes the body the model actually saw"
  - "The pre-run warning carries no number: characters on one page and lines on another would undermine both"
  - "Either count NULL renders nothing at all — over-claiming is the fault this gap exists to fix"
  - "grounding_json ships in the same migration as the coverage columns so remote D1 is altered once, not twice"

patterns-established:
  - "Migration headers state what a NULL means and that every read must handle it"
  - "Verification of a rendering change runs against seeded local D1 and restores it to empty afterwards"

# Metrics
duration: 9min
completed: 2026-09-15
---

# Phase 3 Plan 06: Transcript Coverage Summary

**The run page now states "Using the first 148 of 250 lines of your transcript", and the new-run form flags a meeting that will be cut before a penny is spent — the silent truncation from production run 1 is visible at both ends.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-09-15T12:48:06Z
- **Completed:** 2026-09-15T12:57:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Closed Gap 2 of 03-VERIFICATION.md. `excerptTranscript`'s `linesUsed`/`linesTotal` were computed precisely by 03-01 and consumed nowhere outside `test/prompts.test.ts`; they now reach D1 and the page.
- Migration 0004 applied to **both** local and remote D1 first attempt (no 7403 this time). The one production run and its three drafts read back NULL on all three new columns — nothing was rewritten.
- The wasted read in `POST /runs` became the useful one: the transcript was already loaded to prove the row exists, and that same body now yields the coverage counts. This closes the minor 03-03 concern in STATE.md.
- `listTranscripts` gained `length(body) AS body_chars`, so the new-run form can warn about a long meeting without the body ever leaving D1.
- `drafts.grounding_json` is in place and empty, so 03-07 needs no migration of its own and remote D1 was altered once rather than twice.

## Task Commits

1. **Task 1: Migration 0004 — coverage counts and a grounding slot** — `09d4adf` (feat)
2. **Task 2: Store the coverage and expose it to the views** — `75d37e5` (feat)
3. **Task 3: Compute it at run creation, show it before and after** — `acf51cf` (feat)

**Plan metadata:** see the `docs(03-06)` commit following this summary.

## Files Created/Modified

- `migrations/0004_coverage_and_grounding.sql` — three nullable columns, one `ADD COLUMN` per `ALTER TABLE`; header records what the verification found, that NULL means "created before this migration", and what `grounding_json` may and may not hold.
- `src/db.ts` — `RunRow` carries the two counts as `number | null`; `createRun` takes a `TranscriptCoverage` of primitives and writes it; `getRunView` selects both columns; `listTranscripts` adds `body_chars`; `TranscriptSummary` widened to `Omit<TranscriptRow, "body"> & { body_chars: number }`.
- `src/runs.tsx` — `POST /runs` calls `excerptTranscript(transcript.body)` and passes the counts; `NewRunForm` marks over-cap transcripts and explains the cut; new `TranscriptCoverage` component renders between the progress paragraph and `<RunControl>`.

## Decisions Made

- **The caller computes, `src/db.ts` stores.** `createRun` takes `{ linesUsed, linesTotal }` rather than a transcript or an excerpt. 03-02 established that `src/db.ts` imports nothing from `src/prompts.ts`, and that boundary is what keeps the prompt builders provably free of row types (the Jersey/JFSC guard). Passing primitives preserves it exactly.
- **Coverage is frozen at creation, not recomputed at render.** A transcript can be re-imported with a different speaker label, which changes the body. The stored number describes what the model actually saw on this run; a recomputed one would silently drift away from the drafts sitting beside it.
- **Either count NULL renders nothing.** Not "unknown", not a guess from `line_count`. A run created before 0004 has no coverage figure, and inventing one would be precisely the over-claiming this gap exists to correct.
- **No number in the pre-run warning.** The option label says "(long — only the first part is used)" and the hint names the character cap once; the exact figure is lines-based and belongs to the run page. Quoting characters in one place against lines in another is how a user stops trusting both.
- **`body_chars` is a threshold, never a displayed figure.** SQLite `length()` counts characters on TEXT and `MAX_TRANSCRIPT_CHARS` is compared against JavaScript `string.length`, so the two agree for ordinary transcript text — but the comparison is all that is relied on. Noted in a comment at the query.
- **Amber, not red.** A cut transcript uses `.notice.warn`, matching 03-03's ungrounded-draft treatment: the run is fine, the drafts simply had less to work with, and that is a reviewer's cue rather than a failure.

## Deviations from Plan

None — plan executed exactly as written.

One planned verification could not be run where the plan placed it: Task 2's `verify` asks for `npm run check` to exit 0, but widening `createRun`'s signature necessarily breaks its only call site until Task 3 lands. Task 2 was therefore verified by confirming `tsc` reported **exactly one** error — `src/runs.tsx(668,23): Expected 4 arguments, but got 3` — and nothing else, which also proved the `TranscriptSummary` widening left `src/sources.tsx` untouched as the plan predicted. `npm run check` exits 0 after Task 3. No code was changed to work around this; it is a sequencing artefact of the plan's own task split, recorded rather than papered over.

## Issues Encountered

- **No pre-0004 run existed locally to test the NULL path.** Local D1 was empty (03-04 cleaned it out), so the third verification case had no subject. Resolved by seeding: two transcripts (2,439 chars and 20,249 chars) plus a run inserted directly with NULL coverage and its job rows. All seed rows were deleted afterwards and local D1 confirmed back to zero across all five tables.
- **Expected coverage numbers were taken from the real implementation, not re-derived.** A scratch script imported `excerptTranscript` from `src/prompts.ts` under Node 26's native type stripping and printed the expected `{148, 250}` and `{40, 40}` before the run was started, so the page was checked against the function rather than against a second guess at its arithmetic. The script lives in the scratchpad; `src/prompts.ts` was read only, never edited (03-05 owns it this wave).

## Verification

- `npm run check` exits 0; `npm test` 34/34 green.
- `PRAGMA table_info` confirms all three columns on **local and remote**; remote `runs` = 1 row with both counts NULL, remote `drafts` = 3 rows with `grounding_json` NULL.
- Local dev run, 250-line transcript: stored `148 / 250`, page renders "Using the first 148 of 250 lines of your transcript." — matching `excerptTranscript` on the same body exactly.
- Local dev run, 40-line transcript: stored `40 / 40`, page renders "Using all 40 lines of your transcript." as a hint.
- Seeded pre-0004 run: HTTP 200, progress line present, **no** coverage line, no error.
- `/runs/new`: the 20,249-char transcript carries "(long — only the first part is used)", the 2,439-char one does not, and the cut hint renders once.
- `git diff` touched only this plan's three files. `src/prompts.ts` untouched, as 03-05 is editing it in the same wave.

## User Setup Required

None — no external service configuration required. Remote D1 was migrated as part of Task 1, so 03-07's deploy has no schema step left to do.

## Next Phase Readiness

- **03-07 is unblocked on schema:** `drafts.grounding_json` exists and is NULL everywhere, local and remote. Writing the `checkGrounding` report needs a `db.ts` helper (or a widened `finishDraft`), not a migration.
- **Open, unchanged by this plan:** draft quality is still the project's real risk. Coverage transparency explains *why* a draft may be thin; it does not make it better. Gap 1 (grounding wrong in both directions) and the topic-steering todo are what move the 80% number.
- **Worth noting for Phase 4:** production run 1's coverage is permanently unknowable — it predates these columns. The next production run is the first one that can state its own figure, and it is also the first chance to see whether a full-transcript run reads differently from a two-thirds one.
- The `usage_json` / `cached_tokens` todo was **not** folded in here despite this plan touching `src/db.ts` — it belongs to the drafting write path that 03-07 is editing, and two agents in the same wave writing `finishDraft` is how a wave loses work. It stays pending for Phase 4.

---
*Phase: 03-drafting*
*Completed: 2026-09-15*
