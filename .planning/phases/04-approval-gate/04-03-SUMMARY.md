---
phase: 04-approval-gate
plan: 03
subsystem: api
tags: [prompts, openai, feedback-loop, prompt-cache, compliance, draft-04, appr-05]

# Dependency graph
requires:
  - phase: 04-approval-gate (04-01)
    provides: "`listApprovedPosts(db, limit, excludeRunId)` — `final_body` for accepted and edited drafts, newest first, with the run-exclusion argument this plan supplies"
  - phase: 04-approval-gate (04-02)
    provides: "the only write path into those rows: the accept / edit-then-accept / reject route whose decisions this plan reads back"
  - phase: 03-drafting (03-01)
    provides: "`buildDraftingInput`, `DRAFT_INSTRUCTIONS`, the named-constant rule, and the zero-imports compliance boundary of `src/prompts.ts`"
  - phase: 03-drafting (03-07)
    provides: "`checkGrounding` at the call site with its `[transcript.body, ...sampleBodies]` source pool, which this plan deliberately leaves alone"
provides:
  - "An `<approved_posts>` block in the drafting prompt, between `</voice_samples>` and `<transcript>`, inside the cacheable prefix"
  - "`MAX_APPROVED_POSTS` (3) and `MAX_APPROVED_CHARS` (2500) as named constants beside `MAX_SAMPLES`"
  - "Two new drafting rules: approved posts are voice, never a source of facts, and their topic, opening line, example and phrasing may not be reused"
  - "The read at the drafting call site, run-scoped so a run's own drafts never enter its own prompt"
  - "The whole of Phase 4 on production — version `734bc0e6`, which puts remote code back in step with migration 0005"
affects: [05-zernio-push, steer-draft-topics, context-layer-for-drafts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A block that renders even when empty, so the cacheable prompt prefix keeps a stable shape from the first run onward"
    - "Two adjacent parameters of the same type are separated by a test, not by the type checker"
    - "An omission that will look like an oversight is documented at the site of the omission (approved posts absent from the grounding pool)"

key-files:
  created: []
  modified:
    - src/prompts.ts
    - test/prompts.test.ts
    - src/runs.tsx

key-decisions:
  - "`approvedPosts` is `buildDraftingInput`'s SECOND parameter so argument order matches block order, and a test proves each of the two adjacent `string[]` lists lands in its own block"
  - "The block renders even when empty, for the same reason the voice-samples block does: a byte-stable prefix is what makes drafts 2 and 3 of a run cache-eligible"
  - "Approved posts are voice input and never grounding — `checkGrounding`'s pool is untouched, and the reason is written where the omission is"
  - "`listApprovedPosts` is called with `runId` as the exclusion, so a mid-run approval cannot feed draft 1 back into draft 3"
  - "The constant comes from `./prompts` and the query from `./db`; the route is the only place that knows both, so `src/db.ts` still imports nothing from `src/prompts.ts`"
  - "A repetition rule shipped with the block that creates the risk, rather than waiting for the first week where every post sounds like the last"

patterns-established:
  - "The paid path is proved for free first: an invalid key proves the read and the build ran, and a local stand-in endpoint captures the real request body so block order, contents and exclusions are inspected rather than reasoned about"
  - "An approved checkpoint with no reported observations is recorded as approved-but-unobserved, never as verified"

# Metrics
duration: ~14 min agent
completed: 2026-09-15
---

# Phase 4 Plan 03: The Feedback Loop Summary

**The drafting prompt now carries the three most recently approved or edited posts in their own block ahead of the transcript — as voice, explicitly not as grounding — and the whole approval gate is deployed as version `734bc0e6`, though no run has yet been executed with an approved post in the prompt.**

## Performance

- **Duration:** ~14 min agent time across two sessions (one blocking checkpoint between them)
- **Started:** 2026-09-15T14:08Z
- **Completed:** 2026-09-15T14:22Z
- **Tasks:** 3 (2 auto, 1 human-verify checkpoint)
- **Files modified:** 3 (`src/prompts.ts`, `test/prompts.test.ts`, `src/runs.tsx`)

## Accomplishments

- **DRAFT-04 is wired.** `buildDraftingInput(samples, approvedPosts, transcriptBody, template)` renders `<approved_posts>` between `</voice_samples>` and `<transcript>`, capped at 3 posts of 2500 characters and joined with `\n---\n` exactly as the samples block is. The block renders even when empty, so a run's cacheable prefix has the same shape on the first run as on the fiftieth.
- **The model is told what it may and may not take.** `DRAFT_INSTRUCTIONS` now lists four blocks, with a grounding rule (`APPROVED POSTS are not a source of facts. Take voice from them; never take a claim, number, example or story from them.`) and a repetition rule (`Do not reuse an APPROVED POST's topic, opening line, example or phrasing.`). Every previously pinned phrase — the banned-word list, "Invent nothing.", the do-not-name-clients rule, the never-mention-a-transcript rule and the em-dash ban — is verbatim and still asserted.
- **A run's own drafts cannot reach its own prompt.** The call site passes `runId` to `listApprovedPosts`, which is what stops a mid-run approval from feeding draft 1 into draft 3 and what keeps the prefix byte-stable across a run's three drafting calls.
- **The grounding pool is unchanged**, and the reason now sits beside it in `src/runs.tsx`: approving a post for publication is not certifying its claims, and crediting one as a source would let a single fabrication launder itself into a permanent one, re-credited in every run afterwards.
- **`src/prompts.ts` still has zero imports** and still takes primitives only. The captured request body contains no meeting title and no speaker label.
- **Phase 4 is on production.** Version `734bc0e6-7963-4d70-8db8-349b27102d07` (previous `f17cf55d`), confirmed at 100% by `npx wrangler deployments list`. Remote code and migration 0005 are back in step, as 03-06 → 03-07 did before.
- `npm run check` exits 0; `npm test` 61/61, up from 57 and losing none.

## Task Commits

1. **Task 1: The approved_posts block, its instructions, and the tests that pin them** — `d69581a` (feat)
2. **Task 2: Read the approved posts at the call site, and deploy the phase** — `aaf5241` (feat)
3. **Task 3: Human verification of the approval gate on production** — checkpoint, approved by the user; no code, no commit

**Plan metadata:** see the `docs(04-03)` commit following this summary.

## Files Created/Modified

- **`src/prompts.ts`** — `MAX_APPROVED_CHARS` (2500) and `MAX_APPROVED_POSTS` (3) beside `MAX_SAMPLES`; `buildDraftingInput` gains `approvedPosts` as its second parameter and renders the block; `DRAFT_INSTRUCTIONS` renumbered to four blocks with two new rules; the doc comment's Phase 4 promise replaced by what was actually built.
- **`test/prompts.test.ts`** — 4 net new tests (57 → 61): block order extended to `voice_samples < approved_posts < transcript < format`, each `string[]` in its own block, the caps, the empty block in position, and the two new instruction phrases pinned. The existing compliance tests (no imports in the source, no meeting title or speaker label reachable through the payload) pass untouched.
- **`src/runs.tsx`** — the drafting branch reads `listApprovedPosts(c.env.DB, MAX_APPROVED_POSTS, runId)` beside `listVoiceSamples` and passes it as the second argument; the step route's budget comment moves from 10 to 11 D1 queries against a Free-plan ceiling of 50, with no extra subrequest; the `checkGrounding` call is unchanged and gains the comment explaining the omission.

## Verification

**Automated (all green):**

| Check | Result |
|---|---|
| `npm run check` | exits 0 |
| `npm test` | 61 passed, up from 57, none lost |
| `grep -c "^import" src/prompts.ts` | 0 |
| `checkGrounding` source pool | still `[transcript.body, ...sampleBodies]` |
| `npx wrangler deployments list` | `734bc0e6-7963-4d70-8db8-349b27102d07` at 100%, created 2026-09-15T14:14:49Z |

**Locally, beyond the plan's asks.** With a deliberately invalid `OPENAI_API_KEY` the step reached the OpenAI call and failed on `invalid_api_key` — proving the read and the build both ran rather than something short-circuiting earlier. The real request body was then captured against a local stand-in endpoint and inspected: blocks in order `voice_samples` → `approved_posts` → `transcript` → `format`; another run's approved post inside the block; **the run's own accepted draft absent from the entire payload**; no meeting title and no speaker label anywhere. `.dev.vars` was backed up and restored SHA-identical (`fba35998…`), `src/openai.ts` returned to a zero diff, every seeded row deleted and local D1 confirmed back to zero.

**Task 3 (production): approved, unobserved.** The user replied "approved" and reported no observations. That is a real distinction and it is recorded as such below — nothing in this plan's production behaviour was seen by anyone.

## What is approved but unobserved

The checkpoint asked for six observations and none were reported. Each of the following is **approved-but-unobserved**, not verified, and each is the identical item already left open at 03-07:

1. **`/health` green.** Not observed since version `b3156846`, now three deploys ago — `b3156846` → `f17cf55d` → `734bc0e6`. The D1 round-trip and the three secrets are believed fine on the deployed bundle and have not been seen. It cannot be checked from an agent: Cloudflare Access 302s an unauthenticated request at the edge before the Worker runs, which is correct fail-closed behaviour, and a scripted check would need an Access service token this project does not have.
2. **The accept / edit-then-accept / reject round trip on production D1.** Every one of 04-02's checks ran against seeded local D1 through the live local route. No decision has ever been recorded against the production database, and the decision cells on `/runs` have never been rendered from it.
3. **The grounding panel against a real draft, and the human judgement behind it.** All six render states were driven from hand-seeded JSON. Whether the amber lines are genuinely not the executive's words — and whether anything the panel passed is genuinely theirs — is the judgement that actually tests the check, and it is still unmade. 03-05's calibration against run 1 remains the only evidence.
4. **DRAFT-04 end to end.** Criterion 5 is wired, unit-tested and payload-verified against a captured request body. **No run has been executed with an approved post in the prompt.** The optional ~$0.10 run was not reported as taken, so it is assumed not taken. Whether drafts written with an accepted post in front of them read closer to publishable is unknown, and so is whether the three drafts of a run still collide on one topic.

## Decisions Made

- **`approvedPosts` is the second parameter, not the last.** Argument order matches block order, which is what the `buildDraftingInput` doc comment has promised since 03-01. The cost is that `samples` and `approvedPosts` are two adjacent `string[]`s the type checker cannot tell apart, so a test passes distinctly recognisable strings and asserts each lands in its own block. That test is the only thing standing between a future refactor and a silent swap that would compile, run, and quietly write posts from the wrong material.
- **The block renders even when empty.** Same rule and same reason as the voice-samples block: the prefix before `<format>` must be byte-identical across a run's three drafting calls or drafts 2 and 3 stop being cache-eligible. It also means the first run ever — with nothing approved — produces the same prompt shape as every run after it.
- **`MAX_APPROVED_CHARS` equals `MAX_SAMPLE_CHARS` (2500) deliberately.** An approved post is the same kind of object as a voice sample — the executive's own published-standard writing — so it gets the same budget. Named constants, never inline at the call site, per 03-01's rule for this file.
- **Approved posts are voice, never grounding, and the omission is documented where it happens.** `checkGrounding`'s pool stays `[transcript.body, ...sampleBodies]`. Approving a post for publication is not certifying that every claim in it came from the executive's own material; run 1's draft 2 is exactly the case — an invented slogan in a post a hurried reviewer could have accepted. Credit that as a source and the fabrication is re-credited in every run afterwards. Same reason outlier bodies have never been in the pool. The prompt tells the model the same thing in words.
- **The repetition rule shipped with the block that creates the need for it.** Feeding three approved posts into every draft makes "every post sounds like last week's" the natural failure mode. Writing the rule now costs a line; discovering it costs a week of drafts.
- **The constant lives with the prompt, the query lives with the database, and the route knows both.** Same shape as 03-06's coverage counts and 04-01's `limit`. It is what keeps `src/db.ts` free of any import from `src/prompts.ts`, which is the Jersey/JFSC compliance boundary, not a style preference.
- **Task 3 is closed as approved-but-unobserved.** The user has the authority to approve the checkpoint and did. They do not thereby make an observation nobody made. Writing "verified on production" here would put a false statement into the one document the next plan reads first.

## Deviations from Plan

**None — plan executed as written.** Two notes inside its intent:

**1. The plan's "roughly 5 tests" came out as 4 net new.** Block order and the two-lists test are separate cases, the caps and empty-block cases are one each, and the instruction phrases were pinned by extending the existing assertion rather than adding a case. 57 → 61, none lost.

**2. Task 2's verification went beyond what was asked.** The plan asked only that an invalid key prove the step reached the OpenAI call. The request body itself was also captured against a local stand-in endpoint, because "the read ran" and "the right bytes went to OpenAI in the right order with the right things missing" are different claims, and the second is the one DRAFT-04 depends on. `src/openai.ts` was returned to a zero diff afterwards.

## Issues Encountered

- **`tsc` failed between the two commits, by design.** Task 1 changed `buildDraftingInput`'s arity with the single call site still passing three arguments; task 2 fixed it. The same sequencing 03-06 used for `createRun`. Worth stating so the intermediate commit is not read as broken.
- **The checkpoint returned no observations, for the second consecutive time.** Handled by recording the unobserved set rather than by re-asking. See below.

## User Setup Required

None. The deploy is done and no secret, migration or dashboard step is outstanding.

## Next Phase Readiness

**Phase 4 is code-complete and deployed.** APPR-01 through APPR-06 and DRAFT-04 all have code on production, and migration 0005 finally has readers and writers in front of it.

**One browser session still closes everything above.** `/health`, one decision round trip on a real run, a look at the grounding panel against real output, and — for about $0.10 — one new run whose drafts were written with an approved post in the prompt. That single session would close four items that have now been carried across two plans.

**The open risk is untouched by this plan and is now the whole of it.** Run 1's three drafts were unpublishable. This plan is the only lever in Phase 4 that can move draft quality rather than measure it, and it has not yet been observed moving anything. `steer-draft-topics.md` (three drafting calls still run blind to each other; no topic input anywhere) and `context-layer-for-drafts.md` are both still open, and on 03-05's evidence — median 4-token sentence overlap of 0.00 between run 1's drafts and the executive's own material — they are the larger levers.

**The loop starts cold.** `listApprovedPosts` reads only `accepted` and `edited` rows, so until something clears the gate the block renders empty and the prompt is exactly Phase 3's. A low approval rate therefore starves the fix for a low approval rate. The first run after the executive accepts anything is the first run this plan can affect at all.

---
*Phase: 04-approval-gate*
*Completed: 2026-09-15*
