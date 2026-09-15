---
phase: 03-drafting
verified: 2026-09-15T12:15:00Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "Drafts contain only material from the executive's transcript lines and voice samples"
    status: failed
    reason: >-
      The DRAFT-03 guard checks the wrong surface. `isGrounded` validates only the 1-3
      `source_lines` the model chooses to report and never inspects the rest of the post, so a
      model can cite three genuine lines and write anything it likes around them. Confirmed on
      production D1, not inferred: draft 2 is stored `grounded = 1` while containing the line
      "Collect the prompts. Build authority. Become visible." twice, and that phrase appears
      zero times in the transcript. The same check also fails in the opposite direction —
      draft 1 is stored `grounded = 0` although its quotes really are in the transcript, the
      model having trimmed a leading filler word and recapitalised. Reproduced locally against
      the real function, both directions.
    artifacts:
      - path: "src/prompts.ts"
        issue: >-
          `isGrounded` (line 246) is `sourceLines.every(line => transcriptBody.includes(line))`.
          Exact substring, citations only. No whole-post coverage, no normalisation.
      - path: "src/runs.tsx"
        issue: >-
          Line 817 passes only `value.source_lines` to the check, so the post body reaching
          `finishDraft` on line 810 is stored unverified.
      - path: "src/db.ts"
        issue: >-
          `finishDraft` persists `grounded` as authoritative (migration 0003: "1 when every
          source line is in the transcript"), and `DraftSection` warns only on `grounded === false`,
          so a false positive is silent to the user.
    missing:
      - "Whole-post grounding, not citation-only: attribute each claim-bearing sentence back to transcript or voice samples"
      - "At minimum a verbatim-repetition detector, which would have caught draft 2 on its own"
      - "Normalised matching (collapse whitespace, lowercase, strip leading connectives and trailing punctuation) to kill the false negative on draft 1"
    already_tracked: ".planning/todos/pending/normalise-grounding-match.md — deferred to Phase 4, both directions documented"
  - truth: "The user can see what of their transcript was actually used"
    status: partial
    reason: >-
      `MAX_TRANSCRIPT_CHARS` (12,000) silently truncated an 18,429-character transcript on the
      first production run — roughly a third of the executive's own words dropped with no
      indication. `excerptTranscript` computes `linesUsed` and `linesTotal` precisely so the UI
      can say "using the first N of M lines", and 03-01-PLAN names that reporting as a must-have
      truth, but the values are consumed nowhere outside `test/prompts.test.ts`. Does not breach
      criterion 3's "only" clause (truncation narrows the pool, it cannot add foreign material)
      and does not break criterion 4's step status, error or retry. It does shrink the substance
      the model has to work with while telling the user nothing.
    artifacts:
      - path: "src/prompts.ts"
        issue: "`excerptTranscript` returns linesUsed/linesTotal; orphaned — grep finds no consumer in src/"
      - path: "src/runs.tsx"
        issue: "The run status page renders no transcript coverage figure"
    missing:
      - "Render linesUsed/linesTotal on the run page, or warn before the run is paid for"
    already_tracked: ".planning/todos/pending/context-layer-for-drafts.md (substance ceiling), steer-draft-topics.md (topic control)"
---

# Phase 3: Drafting Verification Report

**Phase Goal:** A run turns one transcript plus two or three pasted outliers into three LinkedIn drafts in the executive's voice
**Verified:** 2026-09-15
**Status:** gaps_found — split verdict
**Re-verification:** No — initial verification
**Human verification:** Already performed on a real paid production run; its findings are incorporated below as evidence, not re-requested.

## Verdict in one line

The machinery works — a run really does turn a transcript plus pasted outliers into three drafts,
and the compliance boundary holds. The quality guard that was supposed to prove the drafts stay
inside the executive's own words does not do that job, and production data proves it wrong in
both directions.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User pastes two or three outlier posts, picks one imported transcript, and starts a run | VERIFIED | `NewRunForm` (runs.tsx:193) renders a transcript `<select>` plus three textareas, first two `required`. `POST /runs` (643) validates the id pattern, confirms the transcript exists, counts non-empty bodies against MIN/MAX_OUTLIERS, caps each at MAX_OUTLIER_CHARS, then `createRun`. `createRun` (db.ts:258) re-asserts the 2-3 bound server-side. Pasting is the only route in; no URL field exists. |
| 2 | The run produces exactly three drafts, each filled from one of the run's extracted templates | VERIFIED | `createRun` inserts `DRAFTS_PER_RUN = 3` draft rows, each with `outlier_id = outlierIds[(position - 1) % outlierIds.length]` (db.ts:285-294), so with two outliers drafts map 1,2,1 and with three 1,2,3 — always a real template of this run. `claimNextJob` will not surrender a draft until `o.template_json IS NOT NULL` (db.ts:350). The step route parses `job.template` into the `<format>` block (runs.tsx:803). |
| 3a | Drafts contain only material from the executive's transcript lines and voice samples | **FAILED** | The guard checks citations, not the post. Production draft 2: `grounded = 1`, contains an invented line twice. Production draft 1: `grounded = 0`, quotes genuine. Reproduced locally — see Gap 1. |
| 3b | Templates are stored but never shown in the UI | VERIFIED | Structural, not rendering discipline: `getRunView` (db.ts:480) selects `id, position, substr(body,...) AS excerpt, status, attempts, error_code, error_message` — `template_json` is absent from the projection, so the column never enters the render tree. `OutlierView` has no template field. `TemplateSteps` (runs.tsx:296) shows status plus an 80-char excerpt of the *pasted* post only. Grep for `template` in runs.tsx returns only the step route's own `JSON.parse(job.template)` on the server path. |
| 4 | User sees the run's status while it generates, sees a clear error if OpenAI fails, and can retry | VERIFIED | `GET /runs/:id` shows "N of M steps done" plus per-step state; `Failure` (281) renders OpenAI's own message and code beside the failing step; `RunControl` explains permanent vs attempt-exhausted halts. `RetryForm` posts to `/runs/:id/retry` → `resetRunJobs`, whose `WHERE ... status != 'done'` means a finished call is never re-paid for. Exercised end to end on a real paid run. |

**Score:** 4/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/prompts.ts` | Builders, schemas, grounding check, 120+ lines | SUBSTANTIVE, WIRED (one function under-delivers) | 249 lines. All 10 declared exports present. **Zero imports** — the compliance boundary is enforced by construction. `isGrounded` exists and is wired but does not cover the goal it was written for. |
| `test/prompts.test.ts` | Caps, block ordering, primitives-only, grounding, 80+ lines | SUBSTANTIVE, WIRED | 265 lines, imports from `../src/prompts`. 34 tests pass across the suite. The tests are correct about what `isGrounded` does; they simply never asked whether checking citations alone is sufficient. |
| `migrations/0003_runs.sql` | runs, outliers, drafts | VERIFIED | 68 lines, three tables plus two indexes, compliance header naming the three fields allowed to leave the Worker. `template_json` commented "never rendered". |
| `src/db.ts` | Run and job helpers | VERIFIED | All 8 declared exports present. |
| `src/openai.ts` | Responses client with strict schema and error classification | VERIFIED | 230 lines. `callStructured` + `OpenAIError` exported. |
| `src/runs.tsx` | Front door, status view, step engine, retry, 250+ lines | VERIFIED | 854 lines. All routes present: `GET /runs`, `GET /runs/new`, `POST /runs`, `GET /runs/:id`, `POST /runs/:id/step`, `POST /runs/:id/retry`. |
| `src/index.tsx` | Runs router mounted | VERIFIED | `app.route("/", runs)` line 33, behind Access and `csrf()`. |
| `src/layout.tsx` | Runs in nav | VERIFIED | `{ href: "/runs", label: "Runs" }` line 43. |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `POST /runs/:id/step` | `claimNextJob` | Claim before spending — call happens only if claim won | WIRED (runs.tsx:754, returns 303 on null) |
| `claimNextJob` | conditional UPDATE | `meta.changes === 1` compare-and-swap on (status, started_at) | WIRED (db.ts:390) |
| `callStructured` | `/v1/responses` | `store: false`, `strict: true`, `type: "json_schema"` | WIRED (openai.ts:136-144) |
| `callStructured` | message item | `output.find(item => item.type === "message")`, never `output[0]` | WIRED (openai.ts:202) |
| `POST /runs/:id/step` | `buildDraftingInput` | Primitives only — `samples.map(s => s.body)`, `transcript.body`, parsed template | WIRED (runs.tsx:800-804). Only `transcript.body` is read; `title` never reaches the call site. |
| run status page | `POST /runs/:id/step` | Self-submitting form, gated on `advance.auto` | WIRED (runs.tsx:541-549) |
| `POST /runs` | `createRun` | Validated transcript id and outlier bodies | WIRED (runs.tsx:668) |
| `GET /runs/:id` | `getRunView` | One read per table, no `template_json` | WIRED (runs.tsx:678) |
| `finishDraft` | `isGrounded` | Whole-post verification | **NOT WIRED — citations only** (runs.tsx:817) |
| `excerptTranscript` | run status page | "using the first N of M lines" | **ORPHANED — no consumer in `src/`** |

### Requirements Coverage

| Requirement | Status | Note |
|-------------|--------|------|
| OUTL-01 — paste two or three outlier posts | SATISFIED | Validated both client and server side. |
| OUTL-02 — extract template, store, never show | SATISFIED | Stored in `template_json`; excluded at the query, not at the template. |
| DRAFT-01 — start a run from one transcript plus the outliers | SATISFIED | |
| DRAFT-02 — exactly three drafts, each from one of the run's templates | SATISFIED | |
| DRAFT-03 — drafts draw only on the executive's own words | **PARTIAL** | Two halves, opposite verdicts. *No other speaker's words can reach OpenAI* — structurally sound: `prompts.ts` has zero imports, every builder takes primitives, only `transcripts.body` (speaker-filtered at import by migration 0002), `voice_samples.body` and user-pasted `outliers.body` leave the Worker. *Drafts contain nothing invented* — unproven and, on the one production run, false. The prompt forbids invention; the check does not detect it. |
| DRAFT-05 — status, clear error, retry | SATISFIED | |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/prompts.ts` | `isGrounded` validates a model-chosen subset and is treated as a whole-output guarantee | Blocker (for criterion 3) | Stores `grounded = 1` on demonstrably ungrounded output. The warning the user is meant to trust fires on correct drafts and stays silent on invented ones. |
| `src/prompts.ts` / `src/runs.tsx` | `linesUsed`/`linesTotal` computed, tested, never rendered | Warning | A third of a real transcript was dropped silently. |

No TODO, FIXME, placeholder, "coming soon" or "not implemented" markers in any phase-3 file.
`npx tsc --noEmit` exits 0. `npm test` passes 34/34.

### Human Verification

Already completed on a real paid production run before this report; not re-requested. It is the
source of the criterion 3 verdict, and it is the reason that verdict contradicts the SUMMARYs —
`03-04-SUMMARY.md` reports the grounding check as working because every automated test of it
passes. The tests assert what the function does, not what the criterion requires.

### Gaps Summary

Three of the four roadmap criteria are met in code and were exercised end to end on a paid run.
The run front door validates properly, the job model is genuinely idempotent (claim-then-work with
a compare-and-swap, `attempts` incremented inside the claim, retry that skips `done`), the OpenAI
client classifies errors by `error.code` and surfaces them verbatim, and the auto-advance is
conservatively gated so the page cannot loop money away against a route that can only redirect.

The compliance half of criterion 3 is the strongest part of the phase: `prompts.ts` having zero
imports makes the Jersey/JFSC constraint unbreakable by accident rather than by discipline, and
the template-hiding is enforced in the SQL projection rather than in JSX.

What fails is the quality half of criterion 3. "Drafts contain only material from the executive's
transcript lines and voice samples" is the one criterion that cannot be satisfied by wiring, and
it is the one where the code checks a proxy — the model's own self-reported citations — rather
than the thing being claimed. Production data proves the proxy wrong in both directions on a
single run of three drafts: one false pass carrying an invented slogan printed twice, one false
warning on genuine quotes. A warning that fires on correct output and misses fabricated output is
worse than no warning, because it trains the user to ignore exactly the signal that guards
DRAFT-03.

All gaps are already recorded as deferred Phase 4 work in `.planning/todos/pending/` and nothing
was fixed during this verification, so report and code stay in step.

---

*Verified: 2026-09-15*
*Verifier: Claude (gsd-verifier)*
