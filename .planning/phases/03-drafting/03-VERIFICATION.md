---
phase: 03-drafting
verified: 2026-09-15T15:35:00Z
status: human_needed
score: 4/4 truths verified in code; 1 awaiting live confirmation
re_verification:
  previous_status: gaps_found
  previous_score: 4/5 must-haves verified
  gaps_closed:
    - "Drafts contain only material from the executive's transcript lines and voice samples — the citation-only proxy is deleted and replaced by a whole-post check, independently re-proved against the exact attack the original gap described"
    - "The user can see what of their transcript was actually used — coverage stored at run creation and rendered before and after the run"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: >-
      Buy one fresh run (~$0.10) on the deployed version and read the grounding
      panel beside each of the three drafts.
    expected: >-
      The amber "could not be traced back to your own words" lines are genuinely
      not the executive's material, and any line NOT flagged genuinely is theirs.
      The `supported / checked` figure is plausible against the post on screen.
    why_human: >-
      Requires a paid OpenAI call and a judgement about the executive's own
      voice that no grep can make. The check was calibrated against run 1's real
      drafts (03-05), but the rendered panel has only ever been driven against
      hand-seeded D1 rows. This is the observation that decides whether the
      instrument earns its place on the page.
  - test: >-
      On that same run, confirm the panel renders a report that the live write
      path produced, end to end.
    expected: >-
      A report appears (not "Written before the current grounding check"), with
      counts and any flagged lines matching what the post actually says.
    why_human: >-
      `toGroundingJson` (writer, src/db.ts) and `parseGrounding` (reader,
      src/runs.tsx) are both module-private and have never been executed against
      each other. I verified their nine field names and types agree by reading
      both sides, but no test or observed run has exercised the round trip:
      every render state was seeded with hand-written JSON.
  - test: "Open /health (or /health.json) on the deployed version in an authenticated browser."
    expected: "D1 round-trip succeeds and all three secrets report as set."
    why_human: >-
      Cloudflare Access is fail-closed and no service token exists. I confirmed
      this myself: an unauthenticated request returns 302 to the Access login
      with `service_token_status: false`, `auth_status: NONE`. /health has not
      been seen green since version b3156846; the current deploy is f17cf55d.
---

# Phase 3: Drafting Verification Report

**Phase Goal:** A run turns one transcript plus two or three pasted outliers into three LinkedIn drafts in the executive's voice
**Verified:** 2026-09-15
**Status:** human_needed — all four criteria hold in code; three narrow observations remain unmade
**Re-verification:** Yes — after the 03-05 / 03-06 / 03-07 gap-closure wave

## Verdict in one line

The gap that failed this phase is genuinely closed — I re-proved it against the
codebase rather than the SUMMARYs, and the exact attack the original finding
described now fails where it used to pass. What is left is not a code gap but an
observation gap: the panel that reports the result has never rendered a report
produced by a real run.

## What changed since the last report

| Previous gap | Status now | Evidence I produced myself |
|---|---|---|
| Gap 1 — `isGrounded` checked the model's 1-3 self-reported citations, never the post | **CLOSED** | `grep -rn "isGrounded" src/ test/` returns nothing (exit 1). `checkGrounding` iterates `splitSentences(post)` over the whole body. Adversarial probe below. |
| Gap 2 — `linesUsed`/`linesTotal` computed, tested, never rendered | **CLOSED** | Stored at creation (`createRun` takes `TranscriptCoverage`, migration 0004 adds both columns), rendered by `TranscriptCoverage` (runs.tsx:303) on the run page, and warned about on the new-run form before the run is paid for. NULL renders as silence, which is correct for pre-0004 runs. |

No regressions. Criteria 1, 2, 3b and 4 were re-checked and still hold.

## The gap-1 re-proof, done independently

I did not take the 57 passing tests as evidence, because the previous report
failed exactly there: the old tests were correct about what `isGrounded` did and
never asked whether it was sufficient. I wrote six adversarial probes against the
real exported function, ran them, and deleted the file afterwards (working tree
confirmed clean).

The decisive one reconstructs the original finding's attack — a post whose three
citations are genuine transcript quotes and whose body is entirely invented:

| Probe | Question | Result |
|---|---|---|
| 1 | Three genuine citations + a fully fabricated body | `citationsResolved: true` but **`grounded: false`**, with all three invented sentences (a fake McKinsey statistic, a fake hours figure, generic AI commentary) quoted back verbatim in `unsupported`. **This is the attack that used to pass.** |
| 2 | An honest post built from the executive's own words | `grounded: true`, `supported 5/5`, nothing flagged. No false warning. |
| 3 | Run 1 draft 2's shape — an invented slogan printed twice | `repeated: ["collect the prompts build authority become visible"]`, `grounded: false`. Caught by the cross-sentence n-gram, as designed. |
| 4 | A long invented sentence said only once | Flagged in `unsupported`. |
| 5 | A short invented sentence said once ("Jersey will lose.") | **Escapes into `skipped: 1`** — the documented blind spot is real. |
| 6 | An outlier's phrasing appearing in a draft | Flagged `unsupported` — outlier bodies are correctly absent from the pool. |

Probe 5 matters as much as probe 1. The blind spot is real, and the code does not
hide it: the doc comment states it, a test pins it, and `GroundingPanel` prints
"N short or connecting lines were too generic to check" in **every** state where a
report exists. That is the difference between this check and the one it replaced —
the old one presented a narrow result as a whole-output guarantee; this one reports
its own scope.

## Goal Achievement

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | User pastes two or three outliers, picks one imported transcript, starts a run | VERIFIED | `MIN_OUTLIERS = 2`, `MAX_OUTLIERS = 3` enforced in `POST /runs` (runs.tsx:832-836) and re-asserted in `createRun`. Six routes present. Paste is the only route in. |
| 2 | Exactly three drafts, each from one of the run's extracted templates | VERIFIED | `DRAFTS_PER_RUN = 3` (db.ts:156), loop at db.ts:387. `claimNextJob` will not surrender a draft until `o.template_json IS NOT NULL` (db.ts:452). |
| 3a | Drafts contain only material from the executive's transcript and voice samples | **VERIFIED (code) — see human_verification** | Two halves. *Compliance:* `src/prompts.ts` has **zero imports** (grep confirms), every builder takes primitives, and the call site reads `transcript.body` out of the row so `title` cannot travel. *Mechanical:* `checkGrounding(value.post, value.source_lines, [transcript.body, ...sampleBodies])` at runs.tsx:999 — whole post, outliers excluded, full transcript as the pool (a superset of what the model saw, so leniency only). Re-proved above. |
| 3b | Templates are stored but never shown in the UI | VERIFIED | Structural. `getRunView`'s outlier projection is `id, position, substr(body,1,80) AS excerpt, status, attempts, error_code, error_message` — `template_json` absent. `grep -n "template" src/runs.tsx` returns five hits, none in a render path: two are comments, two are the step route's own `JSON.parse(job.template)` and schema name, one is a `Set` of outlier **ids**. |
| 4 | Status while generating, clear error if OpenAI fails, retry | VERIFIED | `GET /runs/:id` renders per-step state; `Failure` renders OpenAI's own code and message; `POST /runs/:id/retry` → `resetRunJobs`, which skips `done` rows so a finished call is never re-paid for. |

**Score:** 4/4 truths verified in code. Truth 3a carries an unobserved half (below).

## Requirements Coverage

| Requirement | Status | Note |
|---|---|---|
| OUTL-01 — paste two or three outlier posts | SATISFIED | |
| OUTL-02 — extract template, store, never show | SATISFIED | Excluded at the SQL projection, not at the template. |
| DRAFT-01 — start a run from one transcript plus the outliers | SATISFIED | |
| DRAFT-02 — exactly three drafts, each from one of the run's templates | SATISFIED | |
| DRAFT-03 — drafts draw only on the executive's own words | **SATISFIED** (was PARTIAL) | Both halves now hold. The compliance half was always sound; the mechanical half now reads the whole post and reports its own blind spot instead of overclaiming. |
| DRAFT-05 — status, clear error, retry | SATISFIED | |

## Compliance Boundary (re-checked, all four asked for)

| Check | Result |
|---|---|
| `isGrounded` absent from `src/` and `test/` | **Confirmed** — grep exits 1 |
| `outliers.template_json` out of the `getRunView` projection and rendered nowhere | **Confirmed** — absent from the SQL, absent from `OutlierView`, no render-path hit |
| `src/prompts.ts` import-free and primitives-only | **Confirmed** — zero import statements; asserted by test at both halves |
| `store: false` on every OpenAI request | **Confirmed** — one request site exists in the whole codebase (`openai.ts:121`, the only `fetch` to `api.openai.com`), and `store: false` is on it (line 138) |

## Build Health (run by me, not quoted)

- `npm test` → **57/57 passed**, 2 files (was 34 at last verification; three `isGrounded` tests correctly deleted).
- `npm run check` → `wrangler types` regenerated, `tsc --noEmit` **exit 0**.
- Working tree clean apart from pre-existing untracked `logs/` and `prd.md`.
- Deployed version `f17cf55d` was cut at `330ca88`; the only commit after it is docs-only, so deployed code matches HEAD.

No TODO, FIXME, placeholder or "not implemented" markers in any phase-3 file.

## What I could not check

- **Anything behind Cloudflare Access.** I probed `/health.json` myself: HTTP 302 to the Access login, `service_token_status: false`, `auth_status: NONE`. The gate is correctly fail-closed, and that is also why the live run page and `/health` are unobservable from here.
- **A paid OpenAI run.** No fresh run was bought, so no real draft has been through the live write path since 03-07.
- **Production D1 contents.** Not queried; run 1's stored rows were read by 03-05 during calibration, not by me.
- **The `toGroundingJson` → `parseGrounding` round trip in execution.** Both are module-private with no test file for `src/db.ts`. I verified all nine field names and their types agree by reading both sides, so the failure mode that would matter (a renamed key silently rendering every draft as "no report") is ruled out by inspection — but not by running it.

## Why human_needed rather than passed

Nothing in the code is missing, stubbed or unwired, so this is not `gaps_found`.
But rounding it up to `passed` would repeat the mistake that produced the original
finding: treating "the mechanism exists and its tests are green" as "the outcome is
confirmed".

Concretely, the panel has been seen against seven hand-seeded D1 rows covering
every render branch — and never against a report that the Worker itself wrote. The
seeding validates the reader; it cannot validate the writer, and those are the two
halves of a round trip that has never met. The judgement that decides whether the
instrument is worth having — are the amber lines genuinely foreign to the
executive's voice — is also unmade. The 03-07 checkpoint was approved without the
three observations being reported back, and the SUMMARY says so plainly, which is
to its credit and is the reason I can be precise about what is missing.

One paid run closes all three items at once.

## Explicitly NOT a criterion-3 failure

Run 1 produced three drafts the executive would not publish. That is real, it is
the open risk of the project, and it is tracked in STATE.md and in
`.planning/todos/pending/` (`steer-draft-topics.md`, `context-layer-for-drafts.md`)
as Phase 4 work. It is a **draft-quality** problem, not a compliance one.

Criterion 3 asks whether the code confines drafts to the executive's own material
and reports honestly on how well it managed. It now does both. Conflating the two
would either fail this phase for something it never promised, or — worse — let the
quality problem be quietly marked closed because a grounding check exists. The
gap-closure wave fixed the instrument, not the output, and both this report and
STATE.md should keep saying so.

---

*Verified: 2026-09-15*
*Verifier: Claude (gsd-verifier)*
