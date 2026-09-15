---
phase: 04-approval-gate
verified: 2026-09-15T14:26:57Z
status: human_needed
score: 16/17 must-haves verified
human_verification:
  - test: "Open /health on the deployed Worker (version 734bc0e6) after a Cloudflare Access login"
    expected: "D1 round-trip succeeds and OPENAI_API_KEY, FIREFLIES_API_KEY, ZERNIO_USER_TOKEN all read 'set'"
    why_human: "Cloudflare Access 302s any unauthenticated request at the edge before the Worker runs. An agent cannot reach production and this project has no Access service token."
  - test: "On a finished production run, accept one draft unchanged, edit a second and accept it, reject the third, then refresh /runs/:id and open /runs"
    expected: "Draft 1 shows 'Accepted', draft 2 'Accepted with edits' with the edited text in the box, draft 3 'Rejected' with the original post still displayed; all three survive the refresh; /runs shows '1 accepted · 2 edited · 3 rejected' on that row"
    why_human: "Every 04-02 check ran against seeded local D1. No decision has ever been written to the production database, so the round trip on production D1 is unobserved."
  - test: "Read the grounding panel beside a real production draft and judge the flagged lines"
    expected: "The amber lines are genuinely not the executive's words, and nothing the panel passed is an invention"
    why_human: "Whether a flagged sentence is a real fabrication is a human judgement about the executive's own material. Only run 1's 03-05 calibration exists as evidence."
  - test: "Approve at least one post, then start a new run and read its three drafts"
    expected: "The new run's drafts read closer to the approved post's voice and standard; the three drafts do not all collide on one topic"
    why_human: "DRAFT-04 is wired, unit-tested and payload-verified, but no run has ever executed with an approved post in the prompt. Whether the loop improves output is an editorial judgement, and it costs a real OpenAI call."
---

# Phase 4: Approval Gate Verification Report

**Phase Goal:** Every draft gets a recorded human decision, and approved posts shape the next run
**Verified:** 2026-09-15T14:26:57Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths taken from the `must_haves` frontmatter of 04-01, 04-02 and 04-03.

**04-01 — the data model**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A draft row can hold a decision, the final text and a decision timestamp, with NULL meaning undecided | ✓ VERIFIED | `migrations/0005_decisions.sql` adds `decision`, `final_body`, `decided_at`, all nullable, one ADD COLUMN per ALTER TABLE. Local D1 `PRAGMA table_info(drafts)` shows columns 15-17; `d1_migrations` lists 0005 |
| 2 | The original generated post survives an edit — `body` is never overwritten | ✓ VERIFIED | Only two UPDATEs touch drafts text: `finishDraft` (db.ts:567) writes `body` at generation, `recordDecision` (db.ts:748) writes only `decision, final_body, decided_at, updated_at`. No other `SET body` exists |
| 3 | The light-edit rate can be computed from the drafts table with one SQL query | ✓ VERIFIED | The query in the migration header executes against the live local schema (exit 0). Returns no rows only because no draft has been decided yet |
| 4 | The most recent approved and edited posts read back, newest first, without loading any other draft body | ✓ VERIFIED | `listApprovedPosts` (db.ts:772) selects `final_body` alone, `WHERE decision IN ('accepted','edited') AND final_body IS NOT NULL AND run_id != ?1 ORDER BY decided_at DESC LIMIT ?2` |
| 5 | A draft can only be decided through the run that owns it | ✓ VERIFIED | `recordDecision` UPDATE is `WHERE id = ?4 AND run_id = ?5` and returns `meta.changes === 1`; the route turns false into a 404 (runs.tsx:1241, 1268) |

**04-02 — the gate**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | A stopped run shows, under each draft, an editable copy of the post with Accept and Reject | ✓ VERIFIED | `DecisionForm` (runs.tsx:596) renders a textarea prefilled `final_body ?? body` plus two submit buttons sharing `name="decision"`. Rendered when `interactive={!advance.auto}` (runs.tsx:1055); `auto` is true only while the page self-submits |
| 7 | Accepting unchanged records 'accepted'; accepting changed records 'edited' and stores the changed text | ✓ VERIFIED | runs.tsx:1267 — `submitted === normalisePost(draft.body) ? "accepted" : "edited"`, both sides CRLF-normalised, then `recordDecision(..., decision, submitted)`. Derived by the server, not declared by the user |
| 8 | Rejecting records 'rejected' and the original post is still shown | ✓ VERIFIED | runs.tsx:1241 writes `"rejected"` with `null` final text; `DraftSection` still renders `draft.body` above the decision |
| 9 | The decision is still there after a refresh | ✓ VERIFIED (structurally) | Written to D1, read back by `getRunView`'s draft projection (`decision, final_body, decided_at`), rendered by `DecisionRecord`; route ends in a 303 redirect. Production round trip is human item 2 |
| 10 | A decision can be changed afterwards | ✓ VERIFIED | The UPDATE carries no guard on a prior decision, and the form prefills from `final_body ?? body` so reopening shows the text as it stands |
| 11 | The runs list shows the decision on each draft of each past run | ✓ VERIFIED | `listRuns` adds a second flat read grouped in JS into `RunSummary.decisions` (no N+1); `decisionCell` renders "1 accepted · 2 edited · 3 —" at runs.tsx:243 |
| 12 | The grounding report renders beside the decision; the bare `grounded` boolean renders nowhere | ✓ VERIFIED | `GroundingPanel json={draft.grounding_json}` sits directly above `DecisionRecord` (runs.tsx:660-664). `grounded` appears in runs.tsx only inside comments — never in JSX |

**04-03 — the feedback loop**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 13 | The drafting prompt carries the most recent approved and edited posts in their own block, between the voice samples and the transcript | ✓ VERIFIED | `buildDraftingInput` (prompts.ts:248) joins `voice_samples` → `approved_posts` → `transcript` → `format`. Caps `MAX_APPROVED_POSTS = 3`, `MAX_APPROVED_CHARS = 2500`. Block order, caps and the empty-block shape are pinned by tests |
| 14 | A run's own drafts never appear in its own prompt | ✓ VERIFIED | `listApprovedPosts(c.env.DB, MAX_APPROVED_POSTS, runId)` at runs.tsx:1140, and the query's `run_id != ?1` |
| 15 | Approved posts are shown to the model as voice, never credited as grounding | ✓ VERIFIED | `checkGrounding(value.post, value.source_lines, [transcript.body, ...sampleBodies])` at runs.tsx:1173 — approved posts absent. `DRAFT_INSTRUCTIONS` says "APPROVED POSTS are not a source of facts. Take voice from them; never take a claim, number, example or story from them." Phrase pinned by test |
| 16 | `buildDraftingInput` takes primitives only and `src/prompts.ts` still imports nothing | ✓ VERIFIED | Signature is `(string[], string[], string, Template)`; `grep -c "^import \|require("` on prompts.ts returns 0 |
| 17 | Accept, edit and reject work on production | ? UNCERTAIN | Code is deployed as version `734bc0e6` and migration 0005 is applied to the remote D1 (`wrangler d1 migrations list --remote` → "No migrations to apply"). Behaviour on production has never been observed — see human item 2 |

**Score:** 16/17 truths verified, 1 uncertain (live observation only), 0 failed

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `migrations/0005_decisions.sql` | decision, final_body, decided_at on drafts | ✓ EXISTS + SUBSTANTIVE + APPLIED | 38 lines; three ADD COLUMNs plus the APPR-05 measurement query and the "body is never overwritten" rationale in the header. Applied to local D1 and to remote D1 |
| `src/db.ts` | decision write, approved-post read, decisions in both run views | ✓ EXISTS + SUBSTANTIVE + WIRED | 786 lines; exports `recordDecision`, `listApprovedPosts`, types `Decision`, `DraftDecision`; `getRunView` and `listRuns` both project the decision columns |
| `src/runs.tsx` | decision form per draft, decision route, decisions in the run list, approved posts at the drafting call site | ✓ EXISTS + SUBSTANTIVE + WIRED | 1285 lines; `DecisionForm`, `DecisionRecord`, `decisionCell`, `POST /runs/:id/drafts/:draftId/decision`, `listApprovedPosts` at the drafting call site |
| `src/prompts.ts` | the approved_posts block, its caps, and the instructions that govern it | ✓ EXISTS + SUBSTANTIVE + WIRED | 562 lines; `MAX_APPROVED_POSTS`, `MAX_APPROVED_CHARS`, the block in `buildDraftingInput`, the "not a source of facts" and anti-repetition rules in `DRAFT_INSTRUCTIONS`. Zero imports |
| `test/prompts.test.ts` | block order, caps, empty-block shape, pinned instruction phrases | ✓ EXISTS + SUBSTANTIVE | 590 lines, 27 `approved` references. Includes the two-marker test that catches a silent swap of the two adjacent `string[]` parameters |

**Artifacts:** 5/5 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `db.ts recordDecision` | `drafts.decision/final_body/decided_at` | UPDATE scoped by id and run_id | ✓ WIRED | db.ts:747-751, `WHERE id = ?4 AND run_id = ?5`, returns `changes === 1` |
| `db.ts getRunView` | `drafts.decision` | the drafts projection | ✓ WIRED | db.ts:638-639 selects `decision, final_body, decided_at` |
| `db.ts listApprovedPosts` | `drafts.final_body` | decision IN ('accepted','edited'), newest first, excluding one run | ✓ WIRED | db.ts:779-782 |
| `runs.tsx DraftSection` | `POST /runs/:id/drafts/:draftId/decision` | one form per draft, two submit buttons | ✓ WIRED | runs.tsx:598 — ``action={`/runs/${runId}/drafts/${draft.id}/decision`}`` |
| `runs.tsx decision route` | `db.ts recordDecision` | normalise, compare against original, then write | ✓ WIRED | runs.tsx:1241 (reject) and 1267-1268 (accept/edit) |
| `runs.tsx RunTable` | `RunSummary.decisions` | a decision cell per draft position | ✓ WIRED | runs.tsx:243 `<td class="hint">{decisionCell(row.decisions)}</td>` |
| `runs.tsx step route` | `db.ts listApprovedPosts` | read with MAX_APPROVED_POSTS, excluding this run | ✓ WIRED | runs.tsx:1140 — exact pattern from the plan |
| `runs.tsx step route` | `prompts.ts buildDraftingInput` | primitives only, approved posts second | ✓ WIRED | runs.tsx:1149 — `buildDraftingInput(sampleBodies, approvedPosts, transcript.body, ...)` |
| `runs.tsx checkGrounding` | the source pool | transcript and voice samples only | ✓ WIRED | runs.tsx:1173 — approved posts deliberately absent, documented at the call site |

**Wiring:** 9/9 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| APPR-01: view a run's three drafts in an approval view | ✓ SATISFIED | - |
| APPR-02: accept a draft as-is | ✓ SATISFIED | - |
| APPR-03: edit a draft inline and accept the edited version | ✓ SATISFIED | - |
| APPR-04: reject a draft | ✓ SATISFIED | - |
| APPR-05: every draft stores original text, final text, decision and timestamp so the light-edit rate can be computed from data | ✓ SATISFIED | Columns exist locally and remotely; the one-query measurement runs. It will return no rows until decisions are recorded |
| APPR-06: see past runs and the decision on each draft | ✓ SATISFIED | - |
| DRAFT-04: the drafting prompt includes the most recent approved and edited posts as voice examples | ✓ SATISFIED (code) / ? NEEDS HUMAN (end to end) | Wired, unit-tested and payload-verified against a captured request body. No run has ever executed with an approved post in the prompt |

**Coverage:** 7/7 requirements satisfied in code; DRAFT-04 unexercised end to end

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO, FIXME, XXX, HACK, placeholder or "not implemented" in any of the five phase files | — | — |
| `src/db.ts`, `src/runs.tsx` | various | `return null` occurrences | ℹ️ Info | All are genuine guard clauses on real reads (`if (!run) return null`), not empty implementations |
| `.planning/REQUIREMENTS.md` | 123-130 | APPR-01…06 and DRAFT-04 still marked "Pending" in the traceability table; ROADMAP Phase 4 and its three plans still unchecked | ℹ️ Info | Bookkeeping the orchestrator closes at phase completion, not a code defect |

**Anti-patterns:** 0 blockers, 0 warnings, 3 informational

**Build health:** `tsc --noEmit` exits 0. `npm test` passes 61/61 across 2 files. Working tree clean apart from untracked `logs/` and `prd.md`, both already identified as unrelated noise in CLAUDE.md.

## Human Verification Required

Four items. All four are **live observations that an agent cannot make**, not missing code. Cloudflare Access returns a 302 at the edge for any unauthenticated request, before the Worker runs — correct fail-closed behaviour, and this project holds no Access service token. Production was therefore never contacted for this verification; the deployed code was confirmed instead through the committed source, a clean typecheck, the passing suite, and a remote D1 migration check (which does not go through the Access-gated hostname).

All four were already recorded as approved-but-unobserved in 04-03-SUMMARY.md. This report does not re-litigate that; it carries them forward unchanged.

### 1. `/health` on the deployed Worker
**Test:** Log in through Cloudflare Access and open `/health` on version `734bc0e6`.
**Expected:** The D1 round-trip succeeds and all three secrets read "set".
**Why human:** Access blocks the request before the Worker runs. Last observed on `b3156846`, three deploys ago.

### 2. The decision round trip on production D1
**Test:** On a finished production run, accept one draft unchanged, edit a second and accept it, reject the third. Refresh `/runs/:id`, then open `/runs`.
**Expected:** "Accepted", "Accepted with edits" (with the edited text in the box), "Rejected" (with the original post still shown). All three survive the refresh. The run list row reads `1 accepted · 2 edited · 3 rejected`.
**Why human:** Every 04-02 check ran against seeded local D1 through the local route. Nothing has ever been written to the production database, and the run-list decision cells have never been rendered from it. This is also the single test that would expose a CRLF fault in the accepted-vs-edited comparison against a real browser.

### 3. The grounding panel against a real draft
**Test:** Read the grounding panel beside a real production draft and judge the flagged lines.
**Expected:** The amber lines are genuinely not the executive's words; nothing the panel passed is invented.
**Why human:** All six render states were driven from hand-seeded JSON. Whether a flagged sentence is a real fabrication is an editorial judgement about the executive's own material.

### 4. DRAFT-04 end to end
**Test:** Approve at least one post, then start a fresh run and read its drafts.
**Expected:** The drafts carry the approved post's voice and standard; the three drafts do not collide on one topic.
**Why human:** No run has ever executed with an approved post in the prompt, and the value of the loop is an editorial judgement. Costs a real OpenAI call (~$0.10).

## Gaps Summary

**No code gaps found.** Every must-have across the three plans is present, substantive and wired. The phase goal — "every draft gets a recorded human decision, and approved posts shape the next run" — is achieved in code: the columns exist in both databases, the gate writes to them, both run views read from them, and the drafting call reads the approved posts back into the prompt in their own block, as voice and never as grounding.

What is outstanding is observation, not implementation. Four behaviours have been approved but never seen, and they stay open rather than being marked verified.

### Not a gap in this phase: draft quality

Phase 3's open risk carries forward unchanged — **draft quality does not clear the 80% approval bar, and nothing in Phase 4 has tested whether it now does.** That is deliberately not what this phase promised. Phase 4 promised that decisions are *recorded* and *fed back*, and both are done. The distinction matters in both directions:

- Do not fail Phase 4 for draft quality. The approval gate recording a low rate faithfully is the gate working, not the gate failing.
- Do not let this phase's completion imply the quality problem is closed. The 80% target remains unmet and untested since run 1. The feedback loop is the one lever here that *could* move it, and it has never run. Until human item 4 is done, DRAFT-04's effect on quality is unknown.

The first production run that records real decisions will produce the first real light-edit rate this project has ever had. That number, not this report, is what tells you whether the core value holds.

## Verification Metadata

**Verification approach:** Goal-backward from the ROADMAP Phase 4 goal and its five success criteria
**Must-haves source:** `must_haves` frontmatter of 04-01-PLAN.md, 04-02-PLAN.md, 04-03-PLAN.md (17 truths, 5 artifacts, 9 key links)
**Automated checks:** 30 passed, 0 failed (16 truths, 5 artifacts at three levels, 9 key links), plus `tsc --noEmit` clean, `npm test` 61/61, local and remote D1 schema confirmed
**Production reached:** No — Cloudflare Access blocks agent access by design; the deployed URL was never contacted
**Human checks required:** 4
**Total verification time:** ~8 min

---
*Verified: 2026-09-15T14:26:57Z*
*Verifier: Claude (gsd-verifier)*
