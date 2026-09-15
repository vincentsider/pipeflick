---
phase: 02-voice-sources
plan: 01
subsystem: testing
tags: [vitest, tdd, speaker-filter, fireflies, data-protection, pure-functions]

# Dependency graph
requires:
  - phase: 01-01
    provides: TypeScript/tsconfig setup (`include: ["src"]`, ES2022, strict) and the npm scripts this extends
provides:
  - src/speaker-filter.ts — pure module exporting keepSpeakerLines, countBySpeaker, matchSpeaker, normaliseLabel, UNKNOWN_SPEAKER, and the Sentence / SpeakerCount types
  - test/speaker-filter.test.ts — 10 behavioural cases including a negative assertion that no other speaker's words survive filtering
  - vitest 5 as the repo's first test framework, `npm test` = `vitest run`, tests in test/ (outside tsconfig include, so `npm run check` is untouched)
affects: [02-03 (Fireflies import calls keepSpeakerLines before anything reaches D1), 02-04 (preview page uses countBySpeaker/matchSpeaker), any later TDD plan reusing the vitest setup]

# Tech tracking
tech-stack:
  added: [vitest@5.0.0]
  patterns:
    - "Tests live in test/**/*.test.ts, outside tsconfig `include: [\"src\"]`; `npm run check` type-checks the Worker only, `npm test` runs the suite"
    - "Compliance-critical logic is a pure module with no I/O, so it can be proven by unit test without Fireflies or D1"
    - "Speaker matching is always on the normalised label (trim, collapse whitespace, lowercase), never the raw string"

key-files:
  created:
    - src/speaker-filter.ts
    - test/speaker-filter.test.ts
    - vitest.config.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "vitest 5 plain (no @cloudflare/vitest-plugin): the module under test is pure, so the Workers runtime adds nothing but install weight"
  - "keepSpeakerLines returns [] for a blank label rather than falling through to unnamed speakers, so a missing setting can never dump a whole meeting into D1"
  - "Missing speaker names are bucketed under the display label \"Unknown\" but keyed by the empty normalised string, so a participant genuinely called \"Unknown\" stays a separate speaker"
  - "matchSpeaker dedupes labels by normalised form before counting partial matches, so a repeated label is not mistaken for ambiguity"

patterns-established:
  - "TDD cycle: RED commit installs any framework it needs, GREEN commit is implementation only, REFACTOR commit is skipped when nothing changes"
  - "Every function that decides what transcript text may be stored carries a header comment saying so"

# Metrics
duration: ~3min
completed: 2026-09-15
---

# Phase 2 Plan 01: Speaker Filter Summary

**Tested-first pure module that keeps only the executive's transcript lines — exact/partial/ambiguous speaker matching, `text`→`raw_text` fallback, and a negative test proving no other participant's words survive — plus vitest 5 as the repo's first test framework**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-15T06:42:05Z
- **Completed:** 2026-09-15T06:44:43Z
- **Tasks:** 1 TDD feature (RED → GREEN, no refactor needed)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `src/speaker-filter.ts` (113 lines) is the single place that decides which transcript text may be stored; it is pure, dependency-free and does no logging, so the Jersey data-protection constraint is checkable without Fireflies or D1
- `keepSpeakerLines` keeps only the chosen speaker's non-blank lines in transcript order (by `index` when every kept sentence has one, else array order), preferring `text` and falling back to `raw_text`, trimming each line
- `matchSpeaker` resolves the configured speaker name against Fireflies labels: exact normalised match wins, then a single containing label ("Vincent" → "Vincent Sider"), and `null` when blank, absent, ambiguous ("Vincent Sider" vs "Vincent Smith") or generic ("Speaker 1"/"Speaker 2") — the preview page in 02-03/02-04 then asks the user to pick
- `countBySpeaker` ranks labels by line count (ties by first appearance) using the first-seen original spelling, counting only non-blank lines, with `Unknown` for sentences Fireflies left unnamed
- vitest 5 installed with `npm test` → `vitest run` and `vitest.config.ts` scoping to `test/**/*.test.ts`; Node 26 runs the TypeScript tests natively, no esbuild target override was needed

## Task Commits

TDD cycle for the single feature in this plan:

1. **RED: failing tests + framework** — `7c3295b` (test) — vitest devDependency, `test` script, `vitest.config.ts`, 10 cases; suite failed with `Cannot find module '../src/speaker-filter'`
2. **GREEN: implementation** — `c581fb2` (feat) — `src/speaker-filter.ts`; 10/10 tests pass
3. **REFACTOR** — skipped, no change was warranted (see Decisions Made)

**Plan metadata:** see the `docs(02-01)` commit following this summary.

## Files Created/Modified

- `src/speaker-filter.ts` - Pure speaker filtering: `normaliseLabel`, `countBySpeaker`, `matchSpeaker`, `keepSpeakerLines`, `UNKNOWN_SPEAKER`, types `Sentence` and `SpeakerCount`
- `test/speaker-filter.test.ts` - 10 behavioural cases across four describes, including the negative "never leaks another speaker's words" assertion
- `vitest.config.ts` - `test.include = ["test/**/*.test.ts"]`
- `package.json` - added `vitest@^5.0.0` devDependency and `"test": "vitest run"` (placed next to `check`)
- `package-lock.json` - lockfile for vitest and its 34 transitive packages

## Decisions Made

- **No REFACTOR commit.** After GREEN the module was already four small exported functions plus two private helpers, each under 20 lines. The only candidate change was removing an `as number` cast inside the index comparator, which would have added a helper to save a cast — not an improvement worth a commit. The TDD rule "commit refactor only if something changed" was honoured literally.
- **Blank label means keep nothing.** `keepSpeakerLines(sentences, "")` returns `[]` rather than matching sentences with no `speaker_name`. If the `speaker.name` setting is ever empty or a caller passes a missing match through, the failure mode is an empty import, not a whole meeting (every participant) being written to D1.
- **`Unknown` is a display label, not a matching key.** Unnamed sentences are counted under the key `""` and shown as `Unknown`, so a real participant named "Unknown" is not merged with them.
- **Partial matches are deduped by normalised label** before the ambiguity check, so a transcript that repeats the same label does not look like two different people.
- **Exported `UNKNOWN_SPEAKER`** (beyond the plan's export list) so 02-03/02-04 render the same string the counts use rather than hardcoding it.

## Deviations from Plan

None - plan executed exactly as written. The 10 specified cases map one-to-one onto the 10 `it` blocks, and all five exports the plan required for Plan 02-03 (`Sentence`, `keepSpeakerLines`, `countBySpeaker`, `matchSpeaker`, `normaliseLabel`) are present.

## Issues Encountered

- `npm i -D vitest` printed an `allow-scripts` warning (esbuild, fsevents and workerd postinstall scripts not yet approved). No action taken: vitest 5 ran the TypeScript suite fine without them, so approving install scripts was unnecessary. Worth knowing if a future plan needs esbuild's native binary.
- Ran concurrently with Plan 02-02 in the same worktree. Handled by staging only this plan's five files by path (never `git add .`); the parallel agent's `feat(02-02)` commit landed between RED and GREEN with no conflict.

## Verification

- `npm test` → 10 passed (10), exit 0
- `npx tsc --noEmit` → exit 0 (tests sit outside `include: ["src"]`, so `npm run check` is unaffected)
- `git grep -n "console.log" src/speaker-filter.ts` → no matches

## User Setup Required

None - no external service configuration required. The module is pure; the Fireflies API key is only needed from Plan 02-03 onwards.

## Next Phase Readiness

Ready. Plan 02-03 can `import { keepSpeakerLines, countBySpeaker, matchSpeaker } from "./speaker-filter"` and call the filter between the Fireflies GraphQL response and any D1 write. Two things for that plan to honour:

- The speaker name lives in `settings` under `speaker.name` (Plan 02-02's settings page); pass it to `matchSpeaker` and, when the result is `null`, render the `countBySpeaker` list for the user to choose from rather than guessing.
- Only the `string[]` returned by `keepSpeakerLines` may be persisted; other speakers' names and counts are for transient display on the preview page only.

No blockers. Outstanding phase-level concern unchanged: confirm the Cloudflare Access policy is an explicit email allow-list before real transcripts are imported.

---
*Phase: 02-voice-sources*
*Completed: 2026-09-15*
