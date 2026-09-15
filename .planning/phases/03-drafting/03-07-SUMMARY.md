---
phase: 03-drafting
plan: 07
subsystem: ui
tags: [grounding, compliance, hono-jsx, d1, deploy, transparency]

# Dependency graph
requires:
  - phase: 03-drafting (03-05)
    provides: "`checkGrounding(post, sourceLines, sources)` and its `GroundingReport`, calibrated against production run 1"
  - phase: 03-drafting (03-06)
    provides: "migration 0004's `drafts.grounding_json`, already applied to local and remote D1"
  - phase: 03-drafting (03-02)
    provides: "`finishDraft`, `getRunView`, and the rule that src/db.ts imports nothing from src/prompts.ts"
  - phase: 03-drafting (03-03)
    provides: "`DraftSection` and the `.notice.warn` / `.hint` vocabulary the panel reuses"
provides:
  - "`checkGrounding` at the step-route call site, reading the whole post against the executive's own material"
  - "`GroundingRecord` — the report typed structurally in src/db.ts, so the no-import boundary survives"
  - "`drafts.grounding_json` filled: capped at 5 lines of each kind, 300 chars each, with pre-cap totals"
  - "`GroundingPanel` — the report rendered beside each draft, never the bare boolean"
  - "`parseGrounding` — defensive read of D1 text, so a malformed report cannot take the run page down"
  - "`usage_json.cached_tokens` — prompt-cache effectiveness now measurable from D1"
  - "Production running the whole-post check and 03-06's coverage UI (version f17cf55d)"
affects: [04-approval-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render the report, not the verdict: counts and named lines, plus what was never examined"
    - "Parse-don't-trust for D1 text columns: every field re-derived from `unknown`, failure costs one hint"
    - "A retired check is deleted, not deprecated — the wrong surface cannot be called by accident"

key-files:
  created: []
  modified:
    - src/db.ts
    - src/runs.tsx
    - src/prompts.ts
    - src/openai.ts
    - test/prompts.test.ts

key-decisions:
  - "`grounded` stays a plain 1/0 column for APPR-05 while `grounding_json` carries what a person reads — two columns, two audiences"
  - "A draft with no stored report shows no verdict; the legacy `grounded` boolean is never rendered as a fallback"
  - "The panel renders below the post, not above it: a block of quoted flagged lines would push the draft off-screen"
  - "`supported / checked` renders in every state, not only the clean one, per 03-05's carry-forward"
  - "Unresolved citations get their own amber line, so a `grounded = 0` draft can never render as clean"
  - "The stored report is capped at 5 lines of each kind with pre-cap totals kept, the way MAX_ERROR_MESSAGE caps error text"

patterns-established:
  - "A quality check's blind spot is stated on the page itself, in every state, not only in its doc comment"
  - "Rendering changes are verified against hand-seeded local D1 covering every branch, including the malformed one"

# Metrics
duration: ~12 min agent (~25 min wall, one blocking checkpoint)
completed: 2026-09-15
---

# Phase 3 Plan 07: Wire and Show the Grounding Check Summary

**`checkGrounding` now runs on the whole post at the call site and the run page renders its report — the named lines that could not be traced, any repeated phrase, `supported / checked`, and what was skipped — with `isGrounded` deleted so the citation-only proxy cannot be called again.**

## Performance

- **Duration:** ~12 min agent time, ~25 min wall (one blocking human-verify checkpoint)
- **Started:** 2026-09-15T13:03:17Z
- **Completed:** 2026-09-15T13:28Z
- **Tasks:** 4 (3 auto, 1 checkpoint)
- **Files modified:** 5

## Accomplishments

- **Gap 1 of `03-VERIFICATION.md` is closed end to end.** 03-05 built the check; this plan put it at the call site, in the column, and on the page. The one failed criterion of Phase 3 now has a working instrument behind it.
- **`isGrounded` no longer exists** anywhere in `src/` or `test/`. The check that was wrong in both directions on a single batch of three drafts is deleted, not deprecated.
- **The tick is not the UI.** Per 03-05's carry-forward, the page renders counts and named lines. `grounded` is still stored for Phase 4's light-edit rate, but it is never what the reviewer reads.
- **Deployed as version `f17cf55d-e6e8-4b04-bbaf-600fba5e7c93`**, which also ships 03-06's transcript-coverage UI. Production is no longer running pre-0004 code against a post-0004 schema.
- **No migration written.** 03-06's migration 0004 was confirmed present on remote D1 (`PRAGMA table_info(drafts)`) before deploying, exactly as the wave intended.
- `npm run check` exits 0; `npm test` 60 → 57 (the three `isGrounded` tests deleted, nothing else lost).

## Task Commits

1. **Task 1: Store the report, retire the proxy** — `dea4cc5` (feat)
2. **Task 2: Call it on the whole post, render what it found** — `330ca88` (feat)
3. **Task 3: Deploy** — no commit; changed no files. Version `f17cf55d-e6e8-4b04-bbaf-600fba5e7c93`, 100% of traffic
4. **Task 4: Human verification** — checkpoint, approved (see below)

**Plan metadata:** see the `docs(03-07)` commit following this summary.

## Files Created/Modified

- **`src/db.ts`** — `finishDraft` takes a `GroundingRecord` instead of a boolean and writes both `grounded` (1/0) and `grounding_json`. New `GroundingRecord` type (structural, like `TokenUsage`), `toGroundingJson` with `MAX_GROUNDING_LINES = 5` / `MAX_GROUNDING_LINE_CHARS = 300`, `DraftView.grounding_json`, and the column added to `getRunView`'s projection. Still **zero imports**.
- **`src/runs.tsx`** — the step route calls `checkGrounding(value.post, value.source_lines, [transcript.body, ...sampleBodies])`; new `parseGrounding`, `FlaggedLines` and `GroundingPanel`; the old `grounded === false` warning removed.
- **`src/prompts.ts`** — `isGrounded` and its doc comment deleted. Nothing else moved; still zero imports.
- **`src/openai.ts`** — `Usage` gains `input_tokens_details?: { cached_tokens?: number }`.
- **`test/prompts.test.ts`** — the three `isGrounded` tests and the import removed. 60 → 57 tests.

## What the page shows now

| State | Rendered |
|---|---|
| No stored report (pre-03-07 draft, or unreadable JSON) | `Written before the current grounding check.` — and nothing else |
| Clean | `Traced 12 of 12 substantive lines back to your own words.` |
| Untraceable lines | Amber label, the lines themselves in `.draft-body` blocks, `and 7 more.` past the cap |
| Repeated phrase | Amber label (singular or plural), the phrase quoted back |
| Citations unresolved, nothing else flagged | `The quotes this draft reported building on were not found in your own words.` |
| Never written (pending/failed draft) | No panel at all |

In every state where a report exists, one more line always follows: **"N short or connecting lines were too generic to check."** That sentence is the point of the plan, not decoration. Phase 3 failed its one criterion by letting a narrow check read as a whole-output guarantee, and this check matches **words, not meaning** — a short invented sentence said once lands in `skipped`, not `unsupported`. The page now says out loud what it did not examine.

## Verification

- `npm run check` exits 0, `npm test` 57/57, `grep -rn "isGrounded" src/ test/` returns nothing, `grep -n "^import" src/db.ts` returns nothing.
- All six render states above were driven against **hand-seeded local D1** — a run with seven drafts covering legacy-null, clean, five capped unsupported lines with a total of 12, one repeated phrase, `grounding_json` set literally to `not json`, unresolved citations, and an unwritten draft. The malformed row renders the legacy hint and the page still returns **HTTP 200**.
- A flagged line containing a newline renders with its break intact (`.draft-body` white-space).
- 03-06's coverage line still renders correctly above the drafts, untouched.
- All seed rows deleted afterwards; local D1 confirmed back to **zero rows across all five tables**.
- Remote `PRAGMA table_info(drafts)` confirms `grounding_json` before the deploy.

## Human verification (Task 4)

**Approved as-built. The individual observations were not reported back, and are recorded here as approved-but-unobserved rather than verified.**

The user replied "approved" and asked to finish, without answering the three questions the checkpoint asked. Specifically **not** confirmed:

- **`/health`** — the D1 round-trip and the three secrets showing as set on the deployed version. I could not check it myself: Cloudflare Access returns a **302 to the login page** for an unauthenticated `curl`, and no Access service token exists in this project. The 302 does confirm the gate is fail-closed as designed, but nothing behind it was observed. `/health` has not been seen green since version `b3156846`.
- **Run 1's coverage line** — whether the run page renders nothing (expected, since run 1 predates migration 0004) or a figure. Either outcome is correct; neither was observed.
- **The panel against real output** — the user chose not to spend ~$0.10 on a fresh run. So the panel has been seen against seeded data covering every branch, and **never against a real draft**. The judgement that actually tests whether the check earns its place — are the amber lines genuinely not the executive's words, and are the clean drafts genuinely theirs — remains unmade. 03-05's calibration is the only evidence, and it is three drafts deep.

## Decisions Made

- **Two columns, two audiences.** `grounded` stays a plain 1/0 because Phase 4 computes the light-edit rate off it and APPR-05 needs an integer SQL can count. `grounding_json` carries the counts and lines a person reads. Collapsing them would have forced one of the two to be wrong.
- **A draft with no stored report shows no verdict**, and the stored `grounded` boolean is explicitly *not* used as a fallback. That boolean is the proxy this plan retires; re-rendering it would keep the misleading signal alive on exactly the drafts already known to carry it wrong (run 1's draft 2 is stored `grounded = 1` and contains an invented slogan printed twice).
- **Unreadable JSON renders as "no report", not as an error.** `parseGrounding` re-derives every field from `unknown` and returns null on any failure. A draft whose report cannot be parsed costs one hint; it must never take down a run page carrying two perfectly good drafts.
- **The report is capped for storage** at five lines of each kind, 300 chars each, with pre-cap totals kept so the page says "and N more". A reviewer acts on five flagged lines; fifty is a wall of draft prose sitting in D1 for no one.
- **`GroundingRecord` is duplicated structurally in `src/db.ts`** rather than imported from `src/prompts.ts`. The import would be the shorter line and the wrong one — that boundary is the Jersey/JFSC guard (03-02, 03-06), and it is what keeps the prompt builders provably free of row types.

## Deviations from Plan

Scope held to the plan's four files plus one line in `src/openai.ts`. Four additions, all documented below.

**1. [Sanctioned in-scope addition] The `cached_tokens` todo, folded in**

- **Found during:** Task 1 — STATE.md's pending todo says to fold it into whichever plan next touches `finishDraft` alone, and 03-06 deliberately deferred it here.
- **Change:** `TokenUsage` gains `input_tokens_details?: { cached_tokens?: number }`, `toUsageJson` records it, and `src/openai.ts`'s `Usage` gains the same field.
- **Why `src/openai.ts` was touched** (outside the plan's `files_modified`): without it the field would have been read at runtime while the type said it did not exist. It worked either way — the value passed is raw parsed JSON — but relying on that is how a type stops describing reality. One field, one comment.
- **Note for the reader:** rows written before this commit have no `cached_tokens` key. Absence means unknown, not zero cache hits. 03-04's "eligible but unproven" caching note can be settled on the next run.
- **Committed in:** `dea4cc5`

**2. [Judgement call] The panel renders below the post, not above it**

- The old `grounded === false` warning sat above the draft body, and the plan implied the panel would replace it in place. It renders **below** instead. The warning it replaces was one sentence; this panel can be five quoted lines plus three hints, and putting that between the heading and the post would push the draft itself off the screen. The flagged lines are also quotes *from* a post the reader has not read yet if they come first. Reversible in one move if the executive prefers the amber cue before reading.

**3. [Judgement call] `supported / checked` renders in every state, not only the clean one**

- The plan specified it as the `otherwise` branch — shown only when nothing is flagged. 03-05's carry-forward is emphatic that the *report* is what belongs on the page: `supported`/`checked` counts, the named lines, the repeated phrases, and `skipped`. A draft with three flagged lines out of sixteen checked is a very different object from one with three out of four, and hiding the ratio precisely when it matters most would repeat the plan's own complaint. The wording reads correctly in both cases. Where the two instructions differed, the carry-forward won.

**4. [Rule 2 — Missing Critical] An amber line for unresolved citations**

- **Found during:** Task 2, writing the render branches.
- **Issue:** The plan's three states are driven by `unsupported` and `repeated` only. But `checkGrounding` computes `grounded = citationsResolved && unsupported.length === 0 && repeated.length === 0`. A draft whose citations do not resolve while every sentence traces cleanly would have stored `grounded = 0` and rendered the clean "Traced N of N" message — the page contradicting the verdict beside it in D1, which is the exact class of fault this plan exists to remove.
- **Fix:** When `citationsResolved` is false, an amber line says so: *"The quotes this draft reported building on were not found in your own words."* It is a distinct fact from an untraceable sentence — it is about the lines the model chose to report — so it renders whenever false, not only when nothing else is flagged.
- **Likelihood:** low. On run 1, citations resolved 3/3 on all three drafts after 03-05's normalisation. This is a hole closed before it was fallen into, not an observed failure.
- **Committed in:** `330ca88`

**Minor wording change:** the plan's two label sentences are singular (*"This phrase is repeated…"*). Both lists can hold up to five entries, so each label pluralises on count.

**Total deviations:** 1 sanctioned addition, 2 judgement calls, 1 Rule 2 auto-fix.

## Issues Encountered

- **Local verification needed a UUID-shaped run id.** The first seeded run was keyed `seed-run-1` and `GET /runs/:id` returned 400 — `RUN_ID_PATTERN` guards the UUID shape before D1, as designed (03-03). Re-keyed and re-fetched; the guard behaved correctly and was not touched.
- **The first seeded `grounding_json` was itself malformed.** A `char(10)` concatenation intended to put a newline inside a JSON string landed *inside* the string literal, producing invalid JSON — which rendered as the legacy hint and would have silently passed as a "correct" test of the wrong branch. Caught by reading the seed back rather than trusting it, fixed with a proper `\n` escape. The accidental version was a free extra test of the malformed path.
- **`/health` could not be checked from the CLI.** Cloudflare Access 302s an unauthenticated request at the edge, before the Worker runs. Folded into the checkpoint, which the user approved without reporting back — see the Human verification section. Any future scripted health check needs an Access service token, which this project does not have.

## Draft quality is unchanged by this plan

Stated plainly, because the temptation to read a closed gap as a solved problem is the specific way Phase 3 already went wrong once.

Run 1 produced three drafts the user would not publish. Three findings explain that: **topic collision** (all three drafts on the same subject, no topic input anywhere), **a thin substance base** (one meeting transcript as the only source), and **a grounding check that passed invented material**. This wave closed the third. The other two are untouched and remain open as Phase 4 todos — `steer-draft-topics.md` and `context-layer-for-drafts.md`.

**This wave fixed the instrument, not the output.** 03-06 made it visible how much of the transcript reached the model; 03-05 and 03-07 made it visible which lines cannot be traced back to the executive. Both are measurement. Neither changes a single word the model writes. The 80% approval target is still unmet, still has exactly one production run behind it, and the next run will produce drafts of the same quality as the last one — better described.

The corroborating measurement from 03-05 stands: at 4-token granularity the **median** sentence overlap between run 1's drafts and the executive's own material is **0.00**.

## User Setup Required

None. No migration, no secret, no external configuration. The deploy is live.

## Next Phase Readiness

**Phase 3 is complete.** All seven plans executed; both verification gaps closed in code and deployed.

Carried into Phase 4:

- **The open risk is unchanged and is the whole point of the approval gate.** Phase 4 must not be called a success while the drafts stay unpublishable. The gate will faithfully record a low approval rate — that is what it is for — but `steer-draft-topics.md` and `context-layer-for-drafts.md` are what move the number.
- **`grounding_json` is the Phase 4 input.** The approval gate can show the same panel beside the accept/edit/reject control, and `grounded` remains a plain integer column for the light-edit rate (APPR-05).
- **Every production draft so far has a null report.** Run 1's three drafts predate the check and will always show "written before the current grounding check". The first run after this deploy is the first draft anywhere with a real report, and the first chance to judge whether the flagged lines are genuinely not the executive's words.
- **`/health` has not been observed green since version `b3156846`.** Worth thirty seconds in a browser before the next paid run.
- **`cached_tokens` is now recorded**, so 03-04's "caching eligible but unproven" note can be settled from D1 after one more run.

---
*Phase: 03-drafting*
*Completed: 2026-09-15*
