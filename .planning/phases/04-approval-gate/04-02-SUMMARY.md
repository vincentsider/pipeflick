---
phase: 04-approval-gate
plan: 02
subsystem: ui
tags: [hono-jsx, forms, approval, human-in-the-loop, appr-01, appr-02, appr-03, appr-04, appr-06]

# Dependency graph
requires:
  - phase: 04-approval-gate (04-01)
    provides: "`recordDecision` (run-scoped guarded UPDATE), `DraftView.decision/final_body/decided_at`, `RunSummary.decisions`, and the rule that the DB layer stores the decision it is told rather than deriving 'edited'"
  - phase: 03-drafting (03-04)
    provides: "the auto-advance engine whose 400ms self-submit dictates when the gate may be interactive, and the POST-then-303 form pattern"
  - phase: 03-drafting (03-07)
    provides: "`GroundingPanel` and the standing rule that the report renders and the bare `grounded` boolean does not"
provides:
  - "Accept / edit-then-accept / reject under every finished draft on `/runs/:id`"
  - "`POST /runs/:id/drafts/:draftId/decision` — the only write path into the decision columns"
  - "`normalisePost`, which makes accepted-vs-edited a real comparison rather than a line-ending artefact"
  - "A per-draft decision cell on `/runs` (APPR-06)"
  - "The human-in-the-loop gate CLAUDE.md calls mandatory: nothing leaves this app without a recorded decision"
affects: [04-03, 05-zernio-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two submit buttons sharing one name give three outcomes without a line of client JavaScript"
    - "A derived classification is computed from stored evidence at write time, never taken from the form"
    - "Interactivity is gated on the page's own auto-advance state, passed in as one prop rather than re-derived"

key-files:
  created: []
  modified:
    - src/runs.tsx

key-decisions:
  - "There is no third button: 'accepted' vs 'edited' is decided by comparing the submitted text with the stored original, so APPR-05 measures behaviour instead of surveying it"
  - "Both sides of that comparison go through `normalisePost` (CRLF to LF, then trim) — without it every accept would record as an edit and the light-edit rate would read 0% forever"
  - "Decision controls render only when `!advance.auto`, so a self-submitting page can never reload away a half-typed edit"
  - "Ownership stays `recordDecision`'s WHERE clause; the route turns `false` into 404 and adds no permission SELECT of its own"
  - "A rejected draft still shows its post and keeps `final_body` NULL — a decision is a record, not a delete"
  - "The textarea prefills from `final_body ?? body`, so reopening a decided draft shows the text as it now stands while `body` keeps the model's original"
  - "An undecided draft in the run list is a dash, never 'pending' — pending is Phase 3's job vocabulary and would claim the engine is still running"

patterns-established:
  - "A measurement the plan depends on is verified in the failing direction first: the unchanged-accept check was submitted with CRLF line endings, the way a browser actually sends it"
  - "Route validation is proved by driving every rejection path (bad ids, bad decision value, empty post, over-length post, cross-run draft, unwritten draft, missing Origin), not just the happy path"

# Metrics
duration: ~5 min
completed: 2026-09-15
---

# Phase 4 Plan 02: The Approval Gate Summary

**Every finished draft now carries an editable copy of itself with Accept and Reject, and the route decides for itself whether an accept was an edit by comparing the text against the model's stored original — so the 80% light-edit target is now being collected from behaviour rather than estimated.**

## Performance

- **Duration:** ~5 min, fully autonomous
- **Started:** 2026-09-15T14:00:42Z
- **Completed:** 2026-09-15T14:05:16Z
- **Tasks:** 2 (both auto)
- **Files modified:** 1 (`src/runs.tsx`)

## Accomplishments

- **The human-in-the-loop step exists.** CLAUDE.md calls the approval gate mandatory and until this plan the run page said out loud that it was read-only. Accept, edit-then-accept and reject all persist, survive a refresh, and can be changed afterwards.
- **'Edited' is measured, not declared.** Two buttons, three outcomes: the route reads the draft's stored `body`, compares, and writes `accepted` or `edited` itself. A reviewer who retypes the post verbatim has accepted it and one who changes a line has edited it, whichever button they pressed.
- **The line-ending trap was proved shut in the failing direction.** The unchanged-accept check was submitted with CRLF endings, exactly as a browser sends a textarea, and D1 came back `decision='accepted'` with `final_body` byte-equal to `body`. Without `normalisePost` that same request records `edited`, and APPR-05 reads 0% forever while looking perfectly healthy.
- **The model's original text survived all eight checks.** `body` was re-compared against the seeded values on every row afterwards: unchanged everywhere, including the row that was edited and the row decided twice.
- **A draft can only be decided through the run that owns it.** Both an accept and a reject aimed at another run's draft returned 404 through the route, and the target row was untouched.
- **The run list answers APPR-06 per draft** — `1 accepted · 2 edited · 3 rejected` — in the same two D1 queries the page already cost.
- `npm run check` exits 0; `npm test` 57/57, unchanged; `grep -n "draft.grounded"` and `grep -n "read-only"` both return nothing.

## Task Commits

1. **Task 1: Decision controls under each draft, and the route that records them** — `020aea0` (feat)
2. **Task 2: The decision on each draft, in the run list** — `f7af26a` (feat)

**Plan metadata:** see the `docs(04-02)` commit following this summary.

## Files Created/Modified

- **`src/runs.tsx`** — `MAX_DECISION_BODY_CHARS` (5000), `DRAFT_ID_PATTERN`, `normalisePost`, `DECISION_LABEL`; new `DecisionRecord` and `DecisionForm` components; `DraftSection` gains `runId` and `interactive`; `RunControl`'s finished-run notice rewritten; new `POST /runs/:id/drafts/:draftId/decision`; `decisionCell` and a Decisions column on `RunTable`.

No other file was touched. `src/db.ts` is untouched by this plan, which is what keeps the two-query claim for `/runs` true by construction.

## Verification

Driven against `npm run dev` with two seeded local runs — A (`1111…`, six of six steps done, three drafts with bodies) and B (`2222…`, mid-generation: one outlier done, one pending, draft 1 written, draft 2 not) — plus a third run with no drafts at all.

| # | Check | Result |
|---|---|---|
| 1 | Accept unchanged, submitted **CRLF** as a browser sends it | `decision='accepted'`, `final_body = body` (`final_equals_body = 1`), `decided_at` set |
| 2 | Change one word and Accept | `decision='edited'`, `final_body` = the new text, **`body` unchanged** |
| 3 | Reject | `decision='rejected'`, `final_body` NULL, post still rendered |
| 4 | Refresh after each | "Accepted", "Accepted with edits", "Rejected · timestamp" all still rendered |
| 5 | Accept a draft that was rejected (then reject it again) | Decision changes both ways; `decided_at` follows the last one |
| 6 | Accept **and** reject run B's draft 37 through run A | **404 "Draft not found"** both times; row 37 still `decision=NULL`, body `B1 original post, untouched.` |
| 7 | Accept with a whitespace-only textarea | **400 "A post cannot be empty"**, nothing written |
| 8 | Mid-generation run B | No form at all, one hint: "Decisions open when the run stops generating." |

Additional rejection paths, all driven through the live route: bogus `decision` value → 400; missing `decision` field → 400; non-numeric draft id → 400; malformed run id → 400; unknown-but-valid run uuid → 404; accept on a draft with no post yet → 400; 5001 characters → 400; POST with no `Origin` header → **403** from the app-wide `csrf()`.

Run list rendering, all three states: `1 accepted · 2 edited · 3 rejected` (decided), `1 — · 2 —` (undecided), `—` (a run with no drafts).

`body` re-compared against the seeded originals on all five draft rows afterwards: **unchanged on every one.** Every seeded row then deleted; local D1 confirmed back to zero runs, outliers, drafts and transcripts.

## Decisions Made

- **No "Accept with edits" button.** The form offers Accept and Reject; the third outcome is derived. A self-reported edit flag would turn APPR-05's headline number into a survey of the person it is meant to measure. Same instinct as 03-05 calibrating the grounding check against real drafts rather than trusting the model's own citations.
- **`normalisePost` runs on both sides of the comparison and on the stored value.** CRLF-versus-LF is the kind of defect that does not look like one: the gate keeps working, every decision reads `edited`, and the light-edit rate is quietly wrong in the flattering direction — it would say the executive rewrites everything, which is a number someone would eventually act on.
- **The gate opens on `!advance.auto`, not on "the run finished".** A halted run's already-written drafts are worth deciding, and the condition that actually matters is whether this page is about to resubmit itself underneath a half-typed edit. One prop, one definition.
- **A rejected draft keeps its post on screen and its `final_body` NULL.** The record is what was turned down, not the absence of something. It is also what makes `listApprovedPosts` correct without a second predicate.
- **The textarea prefills from `final_body ?? body`.** Reopening a decided draft shows the text as it now stands; `body` remains the model's untouched original underneath, which is the half of APPR-05 that cannot be recovered once lost.
- **A draft with no post yet is a 400, not a 404.** It exists and it belongs to this run — it simply has nothing to accept. Unreachable through the UI, but the route is a URL and says the true thing.
- **An undecided draft in the run list is `—`.** Borrowing "pending" from the job vocabulary would make a finished run read as though the engine were still working.
- **No new CSS.** `.notice`, `.notice.warn` and `.hint` already carry every state, and amber-for-rejected matches 03-03's rule that red belongs to a failed step.

## Deviations from Plan

**None — plan executed as written.** Three small additions inside its intent, all in the route:

**1. An extra 400 for a draft with no post.** The plan specified empty, over-length and bad-decision as 400s and cross-run as 404. Accepting a draft whose job has not written a body would otherwise have stored the submitted text as the "final" version of a post that was never generated. Rule 2 (missing critical validation): added, verified, 400 "That draft has no post yet".

**2. Reject takes the short path.** The plan's ordering reads getRunView-then-write; a rejection needs neither the stored body nor the comparison, so it calls `recordDecision` directly and costs one query instead of four. The 404 still comes from the same guarded UPDATE, and check 6 was run for reject as well as accept to prove the ownership guard holds on that path too.

**3. The plan's seed shape was three drafts on the undecided run; mine has two.** Run B is mid-generation by design (check 8 needs `advance.auto` true), so it has two drafts and renders `1 — · 2 —`. A separate zero-draft run was added to cover `decisionCell([])` → `—`. Same behaviour, one more state covered.

## Issues Encountered

- **JSX whitespace around the textarea child was worth checking rather than assuming.** `<textarea>{expr}</textarea>` written across several lines relies on the transform dropping whitespace-only text nodes; esbuild does, and the rendered HTML was inspected to confirm no leading or trailing whitespace reached the box. Had it not, `normalisePost`'s `trim()` would have hidden it in D1 while the browser showed a stray blank line.
- **Draft ids were 34-38**, continuing 04-01's observation that `AUTOINCREMENT` remembers the high-water mark across an emptied table. The seed reads its ids back rather than assuming them.
- **`/runs` could not be checked from production**, as ever: Cloudflare Access 302s an unauthenticated request before the Worker runs. Everything above is local.

## User Setup Required

None. No secret, no external configuration, no deploy.

## Next Phase Readiness

**04-03 (wave 3) is unblocked and now has real input to read.** `listApprovedPosts(db, MAX_APPROVED_POSTS, runId)` returns `final_body` for exactly the rows this plan writes, and this plan is the only thing that writes them.

**Not deployed, deliberately.** Remote D1 has had migration 0005 since 04-01 and remote code still has neither the columns' readers nor this gate; 04-03 owns the single deploy that puts schema and code back in step, as 03-06 → 03-07 did.

**What is still unobserved.** Every check above ran against seeded local D1 and hand-driven POSTs. The gate has never been used by the executive on a real draft, and the first time it is will be the first honest reading of the approval rate. Before that run: `/health` in a browser, still outstanding from 03-07.

**The open risk is unchanged and this plan sharpens it rather than reducing it.** Run 1's three drafts were unpublishable; `steer-draft-topics.md` and `context-layer-for-drafts.md` are both still open. The meter is now built and wired end to end — **Phase 4 is not a success because the gate works, it is a success when the rate it records is real and the number is good.** On current evidence the first reading will be poor, and a poor reading arriving faithfully is exactly what this plan was for. One thing to watch in 04-03: `listApprovedPosts` feeds approved posts back into the drafting prompt, so a low approval rate also means a thin feedback corpus — the loop only starts helping once something clears the gate.

---
*Phase: 04-approval-gate*
*Completed: 2026-09-15*
