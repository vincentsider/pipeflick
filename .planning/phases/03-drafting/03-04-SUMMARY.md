---
phase: 03-drafting
plan: 04
subsystem: api
tags: [openai, responses-api, cloudflare-workers, hono, d1, job-queue, prompt-caching, data-protection]

# Dependency graph
requires:
  - phase: 03-drafting (03-01)
    provides: "src/prompts.ts — models, budgets, instructions, schemas, primitives-only builders, isGrounded"
  - phase: 03-drafting (03-02)
    provides: "migration 0003, claim-then-work job helpers, callStructured/OpenAIError"
  - phase: 03-drafting (03-03)
    provides: "runs router, new-run form, run creation, status view components"
provides:
  - "POST /runs/:id/step — claim one job, make one OpenAI call, record, redirect"
  - "POST /runs/:id/retry — reset only what is unfinished"
  - "The self-submitting auto-advance form and the guard that decides when it may spend money"
  - "error_code to retryability mapping (RETRYABLE_ERROR_CODES), default-deny"
  - "Measured per-run cost and token counts from a real production run"
  - "Three verified draft-quality findings, deferred to Phase 4 as pending todos"
affects: [04-approval, 05-zernio-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-submitting POST form as the progress engine: no framework, no client JS beyond one setTimeout"
    - "Auto-advance guard defined as 'exactly what claimNextJob will take', not 'not done'"
    - "Default-deny retry classification: an unrecognised error code stops the run"
    - "Ephemeral state through a clamped redirect query parameter instead of a schema change"
    - "Denormalised run status recomputed from the job rows after every step"

key-files:
  created:
    - .planning/phases/03-drafting/03-04-SUMMARY.md
  modified:
    - src/runs.tsx

key-decisions:
  - "A failed step is terminal until Retry; the retryable/attempts guard decides whether to keep going at all, not whether to re-run the failed step"
  - "retryAfterSeconds travels as a clamped ?retry_after=N query parameter, avoiding a migration for a value that lives one redirect"
  - "Auto-advance never renders while any job is 'running', which closes a two-tab redirect loop the plan did not anticipate"
  - "RETRYABLE_ERROR_CODES is default-deny: an unknown code halts the run, because being wrong that way costs one click and being wrong the other way burns the request budget"
  - "Every sk- run is scrubbed out of a stored error message before it reaches D1"
  - "The new-run form warns when no voice samples are saved, because a run without them still costs money and produces the weakest possible drafts"

patterns-established:
  - "Claim before spend: no OpenAI call happens on any path that did not first win claimNextJob"
  - "One POST, one call, one 303 — a reload re-runs the GET and never the POST"
  - "Primitives read out of the row at the call site, so the compliance boundary holds without the builder knowing about rows"
  - "Free verification of a paid path by running the whole engine against a deliberately invalid key"

# Metrics
duration: 19min agent (~2h wall, including the user's production run and review)
completed: 2026-09-15
---

# Phase 03 Plan 04: Step Engine, Auto-Advance and Retry Summary

**The drafting loop runs end to end on production — a run walks itself through three template extractions and three drafts for about $0.10 — and the first real output proved the engine works while the drafts do not yet clear the bar.**

## Performance

- **Duration:** ~19 min agent time (~2h wall, the difference being the user's production run and review)
- **Started:** 2026-09-15T08:06:39Z
- **Completed:** 2026-09-15T10:09:07Z
- **Tasks:** 3 auto + 1 blocking human-verify checkpoint
- **Files modified:** 1 (`src/runs.tsx`, 337 -> 851 lines)

## Accomplishments

- `POST /runs/:id/step` claims exactly one job and makes exactly one OpenAI call. No code path reaches `callStructured` without first winning the claim.
- A run walks itself to three drafts with no further clicks, driven by a POST form and one `setTimeout`.
- A bad key costs exactly **one** call and then stops. Proven in the request log, not argued.
- `POST /runs/:id/retry` re-runs only unfinished steps; a finished outlier kept its template, usage and attempt count byte-identical across a retry.
- Deployed and exercised on real executive data: **3 outliers, 3 drafts, all six steps `done` on the first attempt**, no failures, no retries, run status reconciled to `done`.
- The research's cost estimate became a measurement (below), and it was roughly **half** what was estimated.
- Three draft-quality findings were produced by the verification and written up as pending todos rather than patched in place.

## Task Commits

1. **Task 1: The step route — one claim, one OpenAI call** — `8433e35` (feat)
2. **Task 2: Auto-advance and retry** — `feb314f` (feat)
3. **Deviation: warn when a run would start with no voice samples** — `75ef4a6` (feat)
4. **Task 3: Deploy** — no files; versions `671bf3fd-1628-4554-8be5-7eb7dc8dfa5a` then `b3156846-e6bb-4e4a-a14a-ad45b629406b`

## Files Created/Modified

- `src/runs.tsx` — `POST /runs/:id/step`, `POST /runs/:id/retry`, `RunControl`, `RetryForm`, `planAdvance`, `runStatus`, `reconcileRunStatus`, `isRetryableCode`, `pauseQuery`, `scrubKey`, `NotConfigured`, plus the voice-sample warning on the new-run form

## Verification Result

Split deliberately, because the two halves came out differently.

### The engine: verified

| Check | Result |
|---|---|
| A real run produced exactly three drafts | Yes — 6/6 steps `done`, first attempt, no retries |
| One POST = one claim = one call | Yes, locally and in production |
| Auto-advance walks the run without clicks | Yes |
| A forced failure stops and does not loop | Yes — 1 step POST in the request log, then the script stops rendering |
| Auto-advance continues past a *retryable* failure | Yes — 2 POSTs, then halt |
| Retry re-runs only unfinished jobs | Yes — done rows byte-identical before/after |
| No page renders `template_json` | Yes — absent from the projection and from the router |
| No whole-row pass to `buildDraftingInput` | Yes — `grep` finds none; only `transcript.body` and sample bodies |
| Deployed, Access enforced | Yes — 302 to the Access login for an unauthenticated request |

Nine distinct page states were rendered and inspected before any money was spent: fresh run, retryable failure, non-retryable failure, two attempts, job in flight, orphaned drafts, finished, `?retry_after=7` honoured, junk `?retry_after` ignored.

### The output: did not meet the bar

**Would the user publish these with only light edits? No.** Phase 3 has **not** met the 80% light-edit target. Three findings, all verified against production D1 rather than inferred:

**1. The grounding check is wrong in both directions.**

- Draft 1 was flagged `grounded = 0` but its quotes *are* the executive's words — the model trimmed a leading filler and recapitalised ("In the short terms you have to choose your battle, right?" against the transcript's "Meaning in the short terms…"). A false alarm.
- Draft 2 passed `grounded = 1` while containing "Collect the prompts. Build authority. Become visible." **twice** — a phrase that appears **zero** times in the transcript. Invented, repeated, and passed.

Root cause: `isGrounded` validates only the 1-3 `source_lines` the model chose to report. It never looks at the rest of the post. A model can cite three real lines and write anything around them, and the check will call it grounded.

**2. Topic collision.** Drafts 1 and 2 both landed on AI visibility; draft 3 on agentic web. All three quoted the same most-quotable transcript line. This is structural, not bad luck: the three drafting calls receive the same transcript and the same voice samples, the format is explicitly shape-only, the calls run blind to each other, and there is no topic input anywhere in the system.

**3. The drafts read as common sense.** Foundational explainer material the audience already knows. Also structural: one meeting transcript is the only substance source and `DRAFT_INSTRUCTIONS` forbids going beyond it, so the ceiling on insight is whatever was said out loud — and a meeting where the executive explains a topic to someone is inherently 101-level. The system faithfully reproduced what it was given.

### Requirements status

| Id | Status | Note |
|---|---|---|
| DRAFT-01 | Met | Transcript picked, outliers pasted, run started |
| DRAFT-02 | Met | Exactly three drafts, each filled from one of the run's templates |
| DRAFT-05 | Met | Status visible per step, OpenAI's own message and code on failure, retry works |
| OUTL-02 | Met, structurally | Templates stored, never rendered; the column is absent from `getRunView`'s projection, so this cannot regress by a rendering mistake |
| DRAFT-03 | **Partial — do not record as clean** | The "never other speakers" half holds by construction (migration 0002 speaker filtering plus the primitives-only builder). The "draw only on" half has a demonstrated hole: draft 2 contained invented material and the guard passed it |

## Measured Cost and Tokens

From `usage_json` on the six production job rows. Rates from 03-RESEARCH.md: terra $2.00/$12.00, sol $4.00/$20.00 per 1M in/out.

| Step | Model | Input | Output | Reasoning |
|---|---|---|---|---|
| Outlier 1 | `gpt-5.6-terra` | 693 | 216 | 0 |
| Outlier 2 | `gpt-5.6-terra` | 759 | 212 | 0 |
| Outlier 3 | `gpt-5.6-terra` | 898 | 207 | 0 |
| Draft 1 | `gpt-5.6-sol` | 4,797 | 428 | 120 |
| Draft 2 | `gpt-5.6-sol` | 4,794 | 406 | 52 |
| Draft 3 | `gpt-5.6-sol` | 4,789 | 510 | 131 |
| **Total** | | **16,730** | **1,979** | **303** |

- Extraction: **$0.0123**
- Drafting, assuming no caching: **$0.0844**
- **Run total: $0.097** against the research's **~$0.19** estimate — about **half**.
- If prompt caching engaged on drafts 2 and 3, the same run costs roughly **$0.063** (research estimated $0.15 cached).

Why the estimate was high: reasoning tokens barely materialised. The research assumed ~650 output tokens per extraction and ~1,500 per draft including reasoning; the reality was ~212 and ~448, with **zero** reasoning tokens on all three `gpt-5.6-terra` extractions at `effort: "low"`. Input was also lower than assumed (~780 per extraction against ~1,200; ~4,790 per draft against ~6,000).

Run context, for anyone reproducing these numbers: 3 voice samples (7,447 characters, at the 2,500-per-sample cap), one transcript of 18,429 characters across 224 lines — which means `excerptTranscript` cut it to the 12,000-character budget, and **the drafts were written from roughly the first two thirds of the meeting**. Nothing on the page says so; `excerptTranscript` returns `linesUsed`/`linesTotal` precisely so it could, and 03-03's status page does not render them yet.

**Economics conclusion stands and strengthens:** at two runs a week this is about **$0.80 a month**. Model cost is not a constraint on this product. Quality is. Do not trade draft quality for token savings — and specifically, the `MODEL_DRAFT` -> `gpt-6-astra` lever costs about $0.30 a run more, which is nothing.

## Open Questions From the Research, Answered

**Did prompt caching engage on drafts 2 and 3? Unknown, and the instrumentation cannot tell us.** `TokenUsage` in `src/db.ts` stores `input_tokens`, `output_tokens` and `reasoning_tokens` only. The Responses API reports cache hits as `usage.input_tokens_details.cached_tokens`, which is never read and never stored. What can be said: the three drafting calls had input token counts of 4,797 / 4,794 / 4,789 — differing only by the `<format>` block, so the shared prefix really was byte-stable and comfortably over the 1,024-token minimum. Caching was *eligible*. Whether it *fired* would have to come from the OpenAI dashboard, or from adding `cached_tokens` to `usage_json` in a future migration. Recorded as eligible, not as proven.

**CPU ms per step (research Open Question 3, Free plan allows 10ms): not captured.** Workers Logs are enabled but were not queried, and there is no convenient CLI path to historical per-request CPU. The available evidence is indirect but real: all six steps returned 303 and reached `done` with no Error 1102 `exceededCpu`, on the Free plan, with a 12,000-character transcript and 7,447 characters of voice samples — close to the worst case the input caps allow. The 10ms budget was not exceeded on the largest payload the system currently permits.

## Decisions Made

- **A failed step is terminal until Retry.** `failJob` writes `status = 'failed'` and `claimNextJob` only takes `pending` rows, so a failed job is not re-claimable. The plan's `retryable && attempts < 2` guard therefore decides **whether the run keeps going at all**, not whether the failed step is re-run. A non-retryable failure halts the run immediately (one call wasted); a retryable one lets the run continue to the remaining claimable work and leaves the failure for a Retry click. The alternative — automatic single retry — needs a `db.ts` helper to un-fail a row, and `resetRunJobs` zeroes `attempts`, so it cannot reuse Retry without reopening the infinite-loop risk. Left as a deliberate, documented tradeoff.
- **Auto-advance never renders while any job is `running`.** Not in the plan, and necessary. Without it, two open tabs would both see claimable work, both POST, and the loser would get `claimNextJob -> null -> 303` and re-render with the script still present — an infinite redirect loop at ~150 requests a minute. The rule also gives a crashed invocation a clean story: the page shows a plain Continue button that takes the job over after the 180s stale window.
- **"Claimable" is defined as exactly what `claimNextJob` will take**, not "not done". A draft whose outlier failed is `pending` forever, and counting it as work would produce the same loop.
- **`RETRYABLE_ERROR_CODES` is default-deny.** `OpenAIError.retryable` is computed but never persisted, so the code had to be mapped back. An unrecognised code halts the run. Being wrong in that direction costs one click; being wrong the other way burns the Free plan's daily request budget on a key that will never work. The four billing 429 codes are absent by construction rather than by a special case.
- **`retryAfterSeconds` travels as `?retry_after=N` on the redirect**, clamped to 60s and validated as 1-3 digits. It is needed for exactly one page render, so a column would have outlived its usefulness by several orders of magnitude. No migration 0004 was needed.
- **The run's own status is recomputed after every step** from the job rows, reusing the `getRunView` that the drafting branch already needs for `transcript_id`. `createRun` writes `pending` once and nothing else maintained it, so `/runs` would have shown every finished run as "pending".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Key fragments scrubbed from stored error messages**
- **Found during:** Task 1 verification
- **Issue:** OpenAI's `invalid_api_key` message quotes the key back, masked to its prefix and last four characters: `Incorrect API key provided: sk-proj-****************test`. The status page renders `error_message` verbatim, so a fragment of a credential would have been rendered. CLAUDE.md forbids rendering, logging or prefix-printing any part of a secret.
- **Fix:** `scrubKey` replaces every `sk-[A-Za-z0-9_*-]+` run with "the configured key" before the message reaches D1. Applied in the step route's catch.
- **Files modified:** `src/runs.tsx`
- **Verification:** The next failure stored `Incorrect API key provided: the configured key. You can find your API key at…`
- **Committed in:** `8433e35`

**2. [Rule 1 - Bug] `runs.status` was written once and never maintained**
- **Found during:** Task 1
- **Issue:** `createRun` sets `pending`; nothing updated it. `/runs` renders `row.status` and the status page renders `view.run.status`, so a completed run would have shown "PENDING" beside "6 of 6 steps done" — the first thing the user would see at the checkpoint.
- **Fix:** `runStatus` derives the value from the job statuses; `reconcileRunStatus` writes it after every step, reusing the view the drafting branch already reads. Costs at most one extra query, and only when the status actually moved.
- **Files modified:** `src/runs.tsx`
- **Verification:** The production run's `runs.status` is `done`.
- **Committed in:** `8433e35`

**3. [Rule 2 - Missing Critical] A deleted transcript would have crashed the drafting branch**
- **Found during:** Task 1
- **Issue:** Delete-on-request can remove a transcript from under an older run. `getTranscript` returns `null`, and `transcript.body` would have thrown a `TypeError` — caught by the catch, but recorded as the meaningless "Unexpected failure / unknown".
- **Fix:** Explicit null check that fails the job with `transcript_missing` and a plain-English message, **before** any OpenAI call. Not in `RETRYABLE_ERROR_CODES`, so the run halts rather than failing five more steps identically.
- **Files modified:** `src/runs.tsx`
- **Verification:** Deleted the local transcript mid-run; draft 3 reached `failed` with `error_code = transcript_missing` and no request was made.
- **Committed in:** `8433e35`

**4. [Rule 1 - Bug] Two-tab redirect loop in the auto-advance guard**
- **Found during:** Task 2
- **Issue:** The plan's guard is "there is claimable work AND the last failure was retryable AND attempts < 2". A job already `running` is not claimable by a second invocation, so a second tab would POST, get `null`, 303 back, and re-render with the script intact — forever.
- **Fix:** `planAdvance` returns `inFlight`, and `auto` requires `!inFlight`. The form still renders as a plain button, with a hint naming the 3-minute takeover window.
- **Files modified:** `src/runs.tsx`
- **Verification:** Page state E — a `running` job renders the button and no `setTimeout`.
- **Committed in:** `feb314f`

**5. [Rule 2 - Missing Critical] No warning when a run would start with no voice samples**
- **Found during:** Pre-checkpoint inspection of production D1
- **Issue:** Production had **zero** `voice_samples`. Voice samples are half the drafting input; a run without them still costs ~$0.19 and produces drafts matched against the transcript alone. The first real run would have been judged on exactly that, and would have produced a false verdict on the entire phase.
- **Fix:** The new-run form warns and links to `/sources` when the count is zero, and reports the count when it is not. Not a hard block.
- **Files modified:** `src/runs.tsx`
- **Verification:** The user saved 3 samples before running; the drafting inputs show ~4,790 tokens, consistent with samples plus the capped transcript.
- **Committed in:** `75ef4a6`

**Total deviations:** 5 auto-fixed (2 bugs, 3 missing-critical). No architectural changes, no schema changes, no new dependencies. Every one was inside `src/runs.tsx`, the plan's single declared file.

## Issues Encountered

- **The happy path could not be verified without spending.** Every local test ran against a deliberately invalid key, which returns 401 at zero cost and exercises the whole engine up to the HTTP response. That left three things unproven until the checkpoint: that OpenAI accepts the request shape, that the model ids resolve, and anything about quality. All three passed on the first production run, so the Responses-API shape written in 03-02 (flattened `text.format`, not Chat Completions' `response_format`) is now confirmed against the live API.
- **`.dev.vars` had to be temporarily rewritten** to hold an invalid key. It was backed up, SHA-256 recorded, restored, and the hash re-verified as identical. Worth repeating as a pattern rather than reinventing: it makes the entire paid path testable for free.
- **Local D1 was seeded with fabricated transcript and sample text** for every local test, never real meeting content, and all of it was deleted afterwards. Local `runs`, `outliers`, `drafts`, `transcripts` and `voice_samples` are back to zero.

## Deferred, Not Fixed

All three quality findings are recorded and left for Phase 4 by the user's decision. Do not fix them opportunistically; they interact.

- `.planning/todos/pending/normalise-grounding-match.md` — the grounding check in both directions, including the whole-post hole that lets invented material pass
- `.planning/todos/pending/steer-draft-topics.md` — a topic input, plus forwarding earlier drafts' used source lines so calls 2 and 3 stop colliding
- `.planning/todos/pending/context-layer-for-drafts.md` — live context retrieval (Tavily/SerpAPI) so drafts can exceed the ceiling of a single meeting. Recorded only; the user decided on 2026-09-15 not to insert it as a phase yet

One more, smaller, not yet written up: `usage_json` does not capture `cached_tokens`, so prompt-cache effectiveness is unmeasurable from D1. Worth folding into whichever Phase 4 plan next touches `src/db.ts`.

## Next Phase Readiness

Phase 4 (Approval Gate) is unblocked and has everything it needs:

- Three real drafts exist on production D1 with bodies, `source_lines_json`, `grounded` flags and token counts — a genuine fixture for the approval view rather than seeded text.
- `drafts.body` is the text to accept, edit or reject. The approval columns (original text, final text, decision, timestamp) are a migration 0004 away.
- DRAFT-04 (feeding approved and edited posts back as voice examples) slots into `buildDraftingInput` as an `<approved_posts>` block directly after `</voice_samples>`, inside the cacheable prefix, exactly as 03-01 designed for.
- The `RunControl` / `planAdvance` split means the approval view can render drafts without touching the engine.

**Concerns carried into Phase 4:**

- **Draft quality is the open risk of this project, and it is now measured rather than feared.** The engine is not the problem. Phase 4 must not be judged as a success while the drafts remain unpublishable — the approval gate will faithfully record a low approval rate, which is the point, but the three todos above are what actually move it.
- The approval-rate instrumentation Phase 4 builds is what turns "the user said no" into a number. Until then, the 80% target has exactly one data point behind it: run 1, three drafts, zero publishable without real edits.
- `excerptTranscript`'s 12,000-character cap silently discarded about a third of an 18,429-character meeting, and no page says so. The counts are already returned; only the rendering is missing.
- The quality lever named in 03-01 (`MODEL_DRAFT` from `gpt-5.6-sol` to `gpt-6-astra`) is untried. Given the measured cost, it is nearly free to test — but findings 2 and 3 above are structural, and a better model will not invent a topic input or a context source.
