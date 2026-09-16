---
phase: 05-zernio-push
plan: 05
subsystem: ui
tags: [zernio, approval-gate, push-state, dead-code, gap-closure, hono-jsx]

# Dependency graph
requires:
  - phase: 05-zernio-push
    provides: "05-02's zernio_error_code / zernio_error_message columns, written by recordPushFailure; 05-04's push route and returnTo; b954dc5's Approve screen"
provides:
  - "The refused-push state on GET /runs/:id/approve: Zernio's message and code in a .notice.warn, then Send to Zernio again"
  - "Every push outcome (sent, 409 duplicate, refused) redirects back to the same draft on the Approve screen"
  - "A pushed draft says 'not scheduled, and not published', with the Zernio id and the push time"
  - "A post over 3000 characters shows both numbers instead of a button"
  - "The push hint names the destination account (zernio.account_label, one settings read per render)"
  - "Ten dead declarations removed from src/runs.tsx, and two wasted D1 reads per Run-screen render"
affects: [05-verification, 06-accounts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A whole-line notice inside a wrapping flex action row: inline flex-basis:100%;margin:0, with no new CSS block"
    - "Behaviour-preserving deletion proven by a byte-for-byte diff of rendered HTML before and after, on the same seeded D1"
    - "True phone-width check through Chrome DevTools device emulation (375px), because headless --window-size below 500 lays out at 500 and crops"

key-files:
  created: []
  modified:
    - src/runs.tsx

key-decisions:
  - "The notice sits inside .pf-actions on a line of its own (inline flex-basis:100%), not below the row. It was observed at 375px, 500px and 1280px. src/theme.ts is untouched"
  - "Edit again moved to directly after the decision pill, and the push state follows it, so the full-line notices never strand a link after them"
  - "A draft rejected after a failed push keeps its message but gets no retry button, because the route would answer 400"
  - "The new components are ZernioStatus and SendToZernio. No new name contains a removed name, so the substring greps stay meaningful"
  - "The card's top hint on a pushed draft now also says 'not published'"

patterns-established:
  - "Deletion by grep chain: delete the root, re-grep each candidate, delete only what is referenced solely from deleted code, and re-scan until no top-level declaration has a count of 1"

# Metrics
duration: 16min
completed: 2026-09-16
---

# Phase 05 Plan 05: Refused Push on the Approve Screen Summary

**A push that Zernio refuses now shows Zernio's own message and code beside the draft on the Approve screen, with Send to Zernio offered again. Every push outcome returns the reader to that draft. The orphaned components that made the dead renderer look live are gone. Deployed to both Workers afterwards by the orchestrator (see Deploy).**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-16T12:17:44Z
- **Completed:** 2026-09-16T12:33:23Z
- **Tasks:** 2 of 2
- **Files modified:** 1 (`src/runs.tsx`: 176 lines added and 443 removed across both commits)

## Accomplishments

- **Gap 1 of 05-VERIFICATION.md is closed in code and was observed locally.** A seeded draft with `zernio_error_code = 'ACCOUNT_DISCONNECTED'` shows its marker message, the code and the button on `/runs/:id/approve`. A real 403 from the stand-in went through `pushFailure` and `recordPushFailure`, then redirected back to the draft, which then showed the route's own message and code.
- **The push state on the Approve screen is now one ordered state** (`ZernioStatus`): pushed → refused → not accepted (nothing) → the control. This replaces three separate conditionals that had no refused state.
- **All three push outcomes redirect with `returnTo(pushForm, runId)`.** The 409-duplicate and failure branches used to send the reader to `/runs/:id`, which shows no push state.
- **Dead code removed:** ten declarations, plus the settings reads on `GET /runs/:id` that fed them. Rendered HTML for both screens is byte-identical before and after (13 pages).

## Task Commits

1. **Task 1: Show a refused push on the Approve screen, and return there after every push.** `e9781b1` (fix)
2. **Task 2: Remove the orphaned push components.** `822c739` (refactor)

**Plan metadata:** the `docs(05-05)` commit that contains this file

## Files Created/Modified

- `src/runs.tsx`:
  - Adds `OWN_LINE`, `SendToZernio` and `ZernioStatus`.
  - The Approve route now reads `zernio.account_label` beside the id, in one `Promise.all`.
  - Both push redirects now use `returnTo`.
  - The dead block and the Run screen's settings reads are removed.
  - `returnTo`'s doc comment is updated.

## Removed Symbols

Each symbol was grepped before deletion. Each was referenced only from inside other deleted code:

| Symbol | Was referenced only from | `grep -rn "<Name>" src test` after |
|--------|--------------------------|------------------------------------|
| `DraftSection` | nothing (unrendered since b954dc5) | 0 |
| `PushState` | `DraftSection` | 0 |
| `PushForm` | `PushState` | 0 |
| `GroundingPanel` | `DraftSection` | 0 |
| `FlaggedLines` | `GroundingPanel` | 0 |
| `parseGrounding` | `GroundingPanel` | 0 |
| `StoredGrounding` (type) | `parseGrounding` | 0 |
| `DecisionRecord` | `DraftSection` | 0 |
| `DecisionForm` | `DraftSection` | 0 |
| `DECISION_LABEL` | `DecisionRecord` | 0 |
| `pushTarget` (local, `GET /runs/:id`) | nothing | 0 |
| `accountLabel` (local, `GET /runs/:id`) | `pushTarget` | 0 in `src/runs.tsx`. `src/zernio-routes.tsx` has an unrelated function with the same name, which is untouched |

The `accountId` read on `GET /runs/:id` was removed too, because nothing else on that page used it.

**Kept, because they still have live references:**
- `StepStatus` and `Failure`, both used by `TemplateSteps` on the Run screen.
- `formatDateTime`, now used by `ZernioStatus`.
- `MAX_DECISION_BODY_CHARS`, `Decision` and `MAX_LINKEDIN_CHARS`.

**Final scan:** after deletion, no top-level declaration in `src/runs.tsx` has a whole-word count below 2 across `src` and `test`. Every named import is used at least once. `noUnusedLocals` was not turned on.

## What Was Observed, and How

**Setup:**
- **Server:** `wrangler dev --port 8791` on the project's local D1 (nothing was on 8787).
- **Seeded data:** one run with eight drafts, one per state, plus a second run for the finding below.
- **Zernio:** `ENDPOINT` in `src/zernio.ts` was temporarily pointed at a Node stand-in on `127.0.0.1:8799`.
- **Secrets:** `.dev.vars` was temporarily replaced with `ZERNIO_USER_TOKEN="sk_invalid_standin_0505"` and empty OpenAI and Fireflies keys.
- **Checking method:** every render was checked by content (regexes on the fetched HTML), not by status code alone.

### Approve screen states (Task 1)

| Draft state | Observed on `/runs/:id/approve?draft=N` |
|-------------|------------------------------------------|
| Pushed (seeded `zp_seed_0505_pushed`) | "In Zernio as an unscheduled LinkedIn draft: not scheduled, and not published." plus "Zernio id zp_seed_0505_pushed · 2026-09-16 11:05". **No push form anywhere on the page.** The top hint reads "In Zernio as an unscheduled draft, not published" |
| Refused (seeded `ACCOUNT_DISCONNECTED` plus marker) | `.notice.warn` containing the marker message **and** "(ACCOUNT_DISCONNECTED)", **then** the Send to Zernio form with `return_draft=2`, then the hint naming the account and "Scheduling and publishing stay manual, in Zernio." |
| Pushable (edited) | The form (`return_draft=3`) and the same hint naming the account |
| Over-length (3117 chars, accepted) | `.notice.warn`: "This post is 3117 characters and LinkedIn allows 3000…". **No push form** |
| Rejected | "Rejected", Edit again, nothing push-related |
| Undecided | Accept, Edit, Reject, nothing push-related |
| Refused, then rejected (extra) | The message and "(http_500)" in `.notice.warn`, **no push form** |
| Pushable, with `zernio.account_id` removed | "Choose a LinkedIn account to push this." linking to `/zernio`, with no form. The refused draft kept its message and code, then the same link. The setting row was restored afterwards, value and `updated_at` byte-identical |

### Redirects through the stand-in (Task 1)

All POSTs carried `return_draft` and a matching `Origin`.

| Stand-in answer | Draft | Observed |
|-----------------|-------|----------|
| 403 `{code: ACCOUNT_DISCONNECTED}` | 3 | **303 → `/runs/:id/approve?draft=3`**. The page then showed the route-built message ("This social account has been disconnected. Reconnect LinkedIn in the Zernio dashboard, then choose the account again on /zernio — a reconnect gives the account a new id…"), "(ACCOUNT_DISCONNECTED)" and the button |
| 409 `{details.existingPostId}` | 3 (retry from the refused state) | **303 → `/runs/:id/approve?draft=3`**. The page then rendered as pushed, with `zp_standin_409_existing`, "not published" and no form. In D1, the error code and message were back to NULL |
| 403, **no** `return_draft` | 8 | 303 → `/runs/:id` (the fallback is unchanged) |
| 201 `{post._id}` | 8 | 303 → `/runs/:id/approve?draft=8`. Rendered as pushed with `zp_standin_201_created`. In D1, the error columns cleared the earlier 403 |

**What the stand-in log shows:**
- It received **exactly four** `POST /api/v1/posts`, one per row above.
- Every one carried the deliberately invalid bearer token (checked as a boolean, never logged) and an `x-request-id`.
- Each body had keys `content, isDraft, platforms` only, with `isDraft: true`, platform `linkedin`, and no `publishNow`, `scheduledFor` or `queuedFromProfile`.
- Content lengths were 254 and 236, which match each draft's `final_body`.

A first attempt at this sequence failed in zsh before curl sent anything; the stand-in logged zero POSTs for it.

**Phone width.** Chrome DevTools device emulation at a true 375px mobile viewport, on the refused, over-length and pushed drafts:
- `document.documentElement.scrollWidth` equalled `innerWidth` (375).
- Every element in the action row ended at 337px or less, inside the row's right edge at 357px.
- In the screenshot, the notice wraps inside the card, with the button and hint below it.

It was also checked at 500px and 1280px. At 1280px the notice spans the row under the pill and Edit again. The page was served from 127.0.0.1, with every other host blocked in Chrome.

**Colour:** "Amber" here means `.notice.warn`, the project's warn-not-error class (03-03's rule). The Broadsheet theme renders that class in the accent palette with a lighter border. There is no literal amber colour in the theme.

### Both screens after the deletion (Task 2)

**Method:** 13 pages were captured with `src/runs.tsx` at `e9781b1` (Task 1), then again with Task 2's version, on the same seeded D1, and compared with `diff -r`:
- `/runs/:id`, `/runs/:id/approve?draft=1..8` and `?draft=3&edit=1` for run A
- `/runs/:id` and `/runs/:id/approve` for run B
- `/runs`

**Result:** all 13 returned 200 and are **byte-identical**. The content checks above also re-passed on Task 2's version.

### Restoration

- **`src/zernio.ts`:** SHA-256 `a0d5dc02d7ceaf88…` before and after, git blob `f8e913e9…` (HEAD's), and `git diff src/zernio.ts` is empty. The dev server and stand-in were stopped *before* the restore, so no process ever ran the real endpoint with a push in flight.
- **`.dev.vars`:** SHA-256 `fba359988f636d4d…` before and after. The backup was deleted. Values were never printed; only key names and SHAs were read.
- **Local D1:** back to its pre-plan counts:
  - `d1_migrations=7`, `settings=4`
  - `drafts`, `outliers`, `pilot_requests`, `runs`, `transcripts` and `voice_samples` all at 0

  `sqlite_sequence` was also reset to its snapshot (`drafts` 9204, `outliers` 9004), and the four `settings` rows are byte-identical to the pre-plan snapshot. Only rows seeded by this plan were deleted: two run ids and one transcript id.
- **Processes:** no dev server, stand-in or headless Chrome is left running.

### What could not be observed here

| Claim | In codebase | Driven locally (this plan) | Observed live |
|-------|-------------|----------------------------|---------------|
| A refused push shows message, code and retry | ✓ | ✓ (seeded row, and a real 403 through the route) | never |
| Every push outcome returns to the draft | ✓ | ✓ 403, 409, 201 via the stand-in | never |
| Pushed state says "not published" | ✓ | ✓ | never |
| Real Zernio answers 403 / 409 in the shapes the client parses | by reading `src/zernio.ts` | stand-in only, shaped from the spec | **never**: `POST /v1/posts` has still never been called against zernio.com |
| No request reached zernio.com | by construction: `ENDPOINT`, the only fetch base, pointed at 127.0.0.1 for the whole stand-in session, with an invalid token as a backstop | the stand-in logged every push the route made (4 of 4) | n/a |
| No request reached api.openai.com | by construction: `OPENAI_API_KEY` was empty during the stand-in session, and no `/step` POST was made in either session. Task 2's session used the real `.dev.vars` and made GET requests only, to routes that make no outbound calls | — | n/a |

## Deploy (added by the orchestrator, after the plan)

The executor did not deploy, as instructed; what follows was done afterwards, once the user had decided about the public site.

- **Extra commit before deploy:** `e27e56f` changed the network-failure push message from "press Push to Zernio again" to "press Send to Zernio again". This was the executor's finding 3, and it falls under SCHED-03's "clear error", because the old message pointed at a button the page does not have.
- **User decision (2026-09-16):** leave the public site as it is until 06-07. Both Workers were therefore deployed as they are built today.
- **App** `pipeflick` (`npm run deploy`, `src/index.tsx`): `172124fb-ed97-4e2c-be5f-a674f5db9031` → **`67bbe1ff-cacb-4a87-823f-cad36f7ead78`**
- **Site** `pipeflick-site` (`npx wrangler deploy -c wrangler.site.jsonc`, `src/public.tsx`): `736c88f0-41d0-4966-b63a-080ed16e9c78` → **`d917c919-7a18-42e7-bfd1-7942c7f9492f`**
- Both confirmed at 100% with `wrangler deployments list`. No remote D1 command was run, and none was needed.
- **Not observed on production:** no request was made to either hostname. The fixed Approve screen has been seen locally only.
- The documented site deploy command (`npx wrangler deploy --name pipeflick-site` in CLAUDE.md and the README) builds `src/index.tsx`, so it would have closed the site against the user's decision. It was not used, and the docs still disagree with `wrangler.site.jsonc`. 06-07 owns that.

**At the time the plan finished (superseded above):** neither Worker was deployed, and no remote D1 command was run. Production still serves the pre-05-05 Approve screen, and the gap is still live there until a deploy. The deploy is held for the user's decision on the public site Worker (05-VERIFICATION.md gap 2), which this plan does not touch.

## Decisions Made

- **Where the notice goes: inside the row, on its own line.** The plan allowed a block below the row if the row could not hold a notice. The row can hold it with an inline `flex-basis:100%;margin:0` (the screen already uses inline styles, e.g. `display:contents`). That keeps the notice inside the card's padded, tinted action strip. No new CSS block was needed, so `src/theme.ts` is untouched.
- **Order in the row: pill, Edit again, then the push state.** Previously it was pill, push, Edit again. With full-line notices, a trailing Edit again would sit under the notice and read as part of it.
- **Destination wording:** "Saves it in Zernio as an unscheduled LinkedIn draft for {label}. Scheduling and publishing stay manual, in Zernio." When no label is stored, the account id stands in for it. The label is read once per render, never per draft, and never from Zernio.
- **Over-length wording:** "This post is N characters and LinkedIn allows 3000. Edit it to fit and accept it again, then send it to Zernio." When no account is chosen, the `/zernio` link comes first, per the plan's order.
- **The card's top hint** on a pushed draft now reads "In Zernio as an unscheduled draft, not published". Previously it said "Sent to Zernio as an unscheduled draft".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] No retry button on a draft rejected after a failed push**
- **Found during:** Task 1
- **Issue:** The plan's state 2 shows the notice and then the push control, checked before the decision (the order `PushState` used). A draft that was accepted, refused by Zernio and *then* rejected still has `zernio_error_code`, so a literal port would offer Send to Zernio on a rejected draft. The route answers that click with a plain-text 400. This is the "button that can only fail" that the over-length check exists to prevent.
- **Fix:** State 2 always shows the message and code. The control follows only while the decision is `accepted` or `edited`.
- **Files modified:** `src/runs.tsx`
- **Verification:** A seeded refused-then-rejected draft shows the message and "(http_500)", with no push form anywhere on the page.
- **Committed in:** `e9781b1`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The fix only narrows when the button appears. The route's guards are untouched.

**Beyond what the plan asked, and not deviations in behaviour:**
- Seeded two extra states (refused-then-rejected, and a second pushable draft to drive the 201 path).
- Diffed the rendered HTML byte for byte, rather than eyeballing "the same states".
- Checked phone width at a true 375px.
- Restored `sqlite_sequence` as well as the row counts.

## Issues Encountered

- **zsh does not word-split `${var:+…}`.** The first redirect run made curl reject its own arguments, so no POST was sent and the stand-in logged none. It was re-run under `bash`.
- **Headless Chrome and narrow windows.** At `--window-size=390`, Chrome lays out at its 500px minimum window width and crops the capture. The first "phone" shot therefore looked cut off on every element, header included. Device emulation over the DevTools protocol gave a true 375px viewport. Headless Chrome also did not exit after writing a screenshot, so each instance was stopped by its scratch-profile path.

## Findings Not Fixed (for the orchestrator)

1. **A failed *draft job's* OpenAI error message is shown nowhere.** This is a second casualty of b954dc5, separate from push.
   - **Cause:** `DraftSection` was also the only renderer of a failed draft job's `error_message`.
   - **Observed:** a seeded run with a failed outlier (`MARKER_0505_OUTLIER_JOB_FAILED`) and a failed draft (`invalid_api_key`, `MARKER_0505_DRAFT_JOB_FAILED`). On `/runs/:id`, the outlier marker appears, in the Templates card. The draft marker appears on neither screen. The stop notice shows the code, then says "The message is beside the step below", which is false for a draft.
   - **Why not fixed:** it is outside gap 1, and Task 2 required both screens' behaviour to stay unchanged.
   - **Suggested fix:** render the stopping job's message inside that notice.
2. **Stale UI text on the Run screen:** "All N steps are done; the drafts are below." The drafts are on the Approve screen. The verification report lists this as Info. It was left unchanged for the same reason.
3. **Wrong button name in the stored message.** `pushFailure`'s network-failure message says "press Push to Zernio again", but the button now reads "Send to Zernio". The plan said not to touch `pushFailure`. Also, messages are stored when a push fails, so rows already written keep the old wording.
4. **05-04-SUMMARY.md is now superseded.** It describes `PushState` as the live render. Those components no longer exist; the live renderer is `ZernioStatus` on the Approve screen.
5. **Pushed drafts can diverge from their Zernio copy (unchanged).** A pushed draft can still be edited or rejected (05-VERIFICATION warning).

## User Setup Required

None.

## Next Phase Readiness

- **Ready for re-verification of gap 1.** The render check the verifier asked for passes locally: a seeded `zernio_error_code` row shows its message and code on `/runs/:id/approve`.
- **Gap 2 is untouched by this plan.** The user deferred it to 06-07, and both Workers were redeployed as they are built (see Deploy). Production now carries the gap 1 fix.
- **Still outstanding from 05-VERIFICATION human checks:**
  - **Check 1:** the first real push. Nothing has ever called `POST /v1/posts` on zernio.com.
  - **Check 2:** which bundle `pipeflick-site` serves.
  - **Check 3:** `/health`.

---
*Phase: 05-zernio-push*
*Completed: 2026-09-16*
