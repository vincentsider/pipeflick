---
phase: 03-drafting
plan: 05
subsystem: testing
tags: [grounding, compliance, tdd, text-matching, shingles, n-grams, prompts]

# Dependency graph
requires:
  - phase: 03-drafting (03-01)
    provides: "`src/prompts.ts` as a zero-import, primitives-only module; `isGrounded`; the named-constant rule"
  - phase: 03-drafting (03-04)
    provides: "production run 1 — the three stored drafts this check was calibrated against"
provides:
  - "`checkGrounding(post, sourceLines, sources)` returning a `GroundingReport` over the whole draft"
  - "`normaliseForMatch` — the one normal form both sides of every comparison are put into"
  - "`splitSentences` — raw-text sentence split, so an unsupported line is quotable back to the reviewer"
  - "`LEADING_CONNECTIVES` and the four `GROUNDING_*` thresholds, calibrated against run 1"
  - "One new DRAFT_INSTRUCTIONS line banning verbatim repetition within a post"
  - "27 new tests, including both production failures as named regressions"
affects: [03-07, 04-approval-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Report-not-boolean: the check returns counts and named lines, and says how much it did not look at"
    - "Normalise the pool once per call, reuse across every sentence — keeps the Free-plan 10ms CPU budget"
    - "Token n-gram stream across sentence boundaries, because the real failure was three 2-3 token sentences"

key-files:
  created: []
  modified:
    - src/prompts.ts
    - test/prompts.test.ts

key-decisions:
  - "`grounded` stays strict (citations resolve AND nothing unsupported AND nothing repeated) even though that is false on 3/3 production drafts — because inspection says false is the correct answer for all three"
  - "No threshold moved, and that is a measurement: sweeping the support ratio 0.5 → 0.25 changed 1-3 of 45 sentences and changed no draft's verdict"
  - "Citations are resolved with the same `supportedBy` as sentences, so there is one matching code path, not two"
  - "`skipped` is a reported field, not an internal detail — it is the honest measure of the check's blind spot"
  - "`isGrounded` left intact and marked superseded; 03-07 owns the call site and the deletion"

patterns-established:
  - "A quality check states its own limits in its doc comment and pins them with a test, rather than in prose that drifts"
  - "A threshold that survives calibration gets a comment saying what the sweep showed, same as one that moves"

# Metrics
duration: ~12 min
completed: 2026-09-15
---

# Phase 3 Plan 05: Whole-Post Grounding Summary

**`checkGrounding` reads the entire draft — normalised citation matching, per-sentence attribution by 4-token shingle overlap, and a 6-token repeat detector — and on production run 1 it flips both known verdicts: draft 1's tidied citations now resolve, draft 2's invented slogan is caught.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-15T12:46:30Z
- **Completed:** 2026-09-15T12:58:43Z
- **Tasks:** 3 (RED, GREEN, calibration)
- **Files modified:** 2

## Accomplishments

- Closed Gap 1 of `03-VERIFICATION.md` — the one failed criterion of Phase 3 — inside `src/prompts.ts`, which still has **zero imports**, so the Jersey/JFSC compliance boundary survived the change untouched.
- Both production failures fixed and pinned as named regression tests, verified against the real stored drafts and not only against fixtures.
- Tests went 34 → 60. `npm test` and `npm run check` both green.

## Task Commits

1. **RED — failing tests for whole-post grounding** — `5d687b3` (test)
2. **GREEN — `checkGrounding` over the whole post** — `12d4c2a` (feat)
3. **Calibration against production run 1** — `3394741` (docs)

No REFACTOR commit: the GREEN implementation needed no clean-up pass.

## Files Created/Modified

- `src/prompts.ts` — adds the `Grounding` section: four exported thresholds, `LEADING_CONNECTIVES`, `GroundingReport`, `normaliseForMatch`, `splitSentences`, `checkGrounding`, plus internal `tokenise` / `shingles` / `supportedBy` / `findRepeatedPhrases`. One line added to `DRAFT_INSTRUCTIONS`. `isGrounded` unchanged apart from a comment marking it superseded.
- `test/prompts.test.ts` — 27 new tests across `grounding constants`, `normaliseForMatch`, `splitSentences` and `checkGrounding`.

## How the check works

Three passes, all pure:

1. **Citations** — each reported `source_line` is resolved against the normalised source pool. Normalisation converts unicode punctuation to ASCII, lowercases, collapses whitespace, strips outer punctuation, then strips up to two stacked leading connectives (`meaning`, `and that`, `so`, `right`, …) and strips outer punctuation again. The empty-string guard from 03-01 is preserved: a blank citation does not resolve, because `pool.includes("")` is always true.
2. **Sentences** — every claim-bearing sentence (≥ 6 tokens) is attributed back to the pool, either by normalised containment or by ≥ 50% overlap of its 4-token shingles. Anything shorter is counted in `skipped`. Unsupported sentences are returned **verbatim as the post wrote them**, so the reviewer can find them on the page.
3. **Repeats** — a 6-token n-gram stream over the whole post finds phrases said twice that the sources never say at all; overlapping n-grams are merged into the longest contiguous phrase.

`sources` is the executive's own material only: `[transcriptBody, ...voiceSampleBodies]`. Outlier bodies are never passed in, and the doc comment says why — FORMAT carries shape, so an outlier's phrasing appearing in a draft is a defect to catch, not grounding to credit.

## Calibration against production run 1

Run 1's three drafts, the 18,429-character transcript and the three voice samples were exported to the scratchpad, checked with a throwaway script, and **deleted**. Nothing but verdicts, counts and the phrases already committed in `.planning/` is recorded here.

| Draft | Stored `grounded` | Citations resolve now | Supported / checked | Skipped | Repeated | New verdict |
|---|---|---|---|---|---|---|
| 1 | 0 (false warning) | **yes** (3/3) | 0 / 12 | 13 | 0 | false |
| 2 | 1 (false pass) | yes (3/3) | 3 / 16 | 17 | **1** | false |
| 3 | 1 | yes (3/3) | 2 / 17 | 10 | 0 | false |

Both known failures moved the way the plan required:

- **Draft 1's false warning is gone at the citation level.** All three of its citations now resolve, including the two tidied quotes recorded in `.planning/todos/pending/normalise-grounding-match.md`. On real data the exact-containment path also fires on draft 3's `"You have to choose your battle."`, which is the same class of match.
- **Draft 2's false pass is caught.** The repeat detector returns exactly one phrase, `collect the prompts build authority become visible`, and returns **nothing** for drafts 1 and 3. One true positive, zero false alarms across the batch.

Results are identical whether the pool is what was actually sent (the 12,000-char excerpt plus sliced samples) or the full stored bodies.

**No threshold was moved.** That is a measurement, not a default left alone: sweeping `GROUNDING_SUPPORT_RATIO` from 0.5 down to 0.25 changed 1 to 3 of the 45 claim-bearing sentences and changed no draft's verdict. A lower value buys leniency without buying a decision, so 0.5 stays, with a comment in the source recording what the sweep showed.

### The expected verdict that did not happen, stated rather than tuned away

The plan expected draft 1 to come out `grounded: true`. **It does not, and that is the correct answer.** The false warning was about its *citations*, and that is fixed. The *post*, however, asserts "websites have lost between 20% and 40% of human traffic" — and `20%` appears **zero times** in the executive's transcript and voice samples. The whole-post check flags draft 1 for a real fabrication that the citation-only check could never have seen. Draft 3 also moved from stored `1` to `false`, for the same kind of reason.

Per the plan's own instruction, this is reported rather than tuned around. No threshold in the 0.25–0.5 range makes any of the three drafts fully supported. Reaching `grounded: true` on draft 1 would have required loosening to 2-token overlap, at which point `of the` and `we have` match anything and the check means nothing.

**One production run is three data points.** Every number above is a guess with three observations behind it, and should be re-checked once the approval gate has produced more.

## Decisions Made

- **`grounded` stays strict** — `citationsResolved && unsupported.length === 0 && repeated.length === 0`, exactly as the plan specified, even though it is `false` for 3/3 production drafts. Loosening it to make real drafts pass would have recreated the original fault in a new costume.
- **Citations use the same `supportedBy` path as sentences**, so there is one matching implementation to reason about rather than two that can drift.
- **`skipped` is part of the public report**, not an internal counter. It is the number that stops this check being mistaken for a purity guarantee.
- **`isGrounded` untouched**, apart from a comment marking it superseded and pointing at 03-07. `src/runs.tsx` still compiles and still behaves exactly as it did.

## Deviations from Plan

None affecting scope — `src/prompts.ts` and `test/prompts.test.ts` only, as the scope boundary required. `migrations/0004_coverage_and_grounding.sql`, `src/db.ts` and `src/runs.tsx` (owned by 03-06, running in the same wave) were not touched.

Two additions beyond the written plan, both inside the owned files:

**1. [Rule 2 — Missing Critical] A regression test pinning the check's blind spot**
- **Found during:** Task 3 (calibration)
- **Issue:** The plan required the SUMMARY to state that a short invented sentence said once is skipped, not caught. Prose in a SUMMARY drifts; Phase 3 already failed once by over-claiming what a grounding check meant.
- **Fix:** Added a test asserting that a two-token fabricated sentence lands in `skipped` and leaves the post `grounded: true`, so the limitation is enforced rather than described.
- **Committed in:** `3394741`

**2. [Rule 2 — Missing Critical] The words-not-meaning limit documented in the source**
- **Found during:** Task 3 (calibration)
- **Issue:** Calibration showed most unsupported sentences on real drafts are the model compressing a genuine transcript idea into its own vocabulary, not fabricating. A future reader seeing `unsupported: 12` would otherwise conclude the draft is 12 lies.
- **Fix:** Stated in `checkGrounding`'s doc comment that this matches words, not meaning, and that `unsupported` is a list a reviewer reads rather than a count they act on.
- **Committed in:** `3394741`

**Total deviations:** 2 auto-fixed (both Rule 2). **Impact:** no scope creep — both are documentation and test hardening inside the two files this plan owns.

## Issues Encountered

**The calibration contradicted the plan's expected result.** Resolved by following the plan's own escape hatch — report it, do not tune until it goes away — and by verifying the contradiction against source data (`20%` absent from the pool) before accepting it. The finding strengthens the case for the fix rather than weakening it: the new check flags a fabrication that the old one was structurally incapable of seeing.

## User Setup Required

None — no external service configuration, no migration, no secret.

## Next Phase Readiness

**Ready for 03-07**, which owns the wiring:

- `checkGrounding` is exported, pure, tested, and calibrated. 03-06 has already shipped `drafts.grounding_json` in migration 0004 as an empty column for exactly this payload — the two halves of the wave meet cleanly.
- `isGrounded` is still exported and still called from `src/runs.tsx:817`. 03-07 deletes it, its three tests, and swaps the call site.
- The call site must pass `[transcript.body, ...samples.map(s => s.body)]` as `sources` and **must not** pass outlier bodies.

**Carry into 03-07 and Phase 4 — the one thing to get right:**

`grounded` is `false` on all three production drafts, and correctly so. A boolean that is false on 3/3 real drafts is exactly as uninformative to the executive as one that is true on 3/3 — which is the fault this plan exists to fix. **The tick must not be the UI.** What the reviewer needs on the page is the report: `supported / checked`, the named `unsupported` lines to read, the `repeated` phrases, and `skipped` so the number is not mistaken for full coverage. 03-07 should render the report, not the boolean.

Related: this is now a second, independent line of evidence for the open Phase 3 risk that draft quality does not clear the bar. The drafts do not reuse the executive's words — at 4-token granularity the median sentence overlap with their own material is 0.00 — which is the same finding as `context-layer-for-drafts.md` arriving from a different direction.

---
*Phase: 03-drafting*
*Completed: 2026-09-15*
