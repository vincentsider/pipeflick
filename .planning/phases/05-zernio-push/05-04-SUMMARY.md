---
phase: 05-zernio-push
plan: 04
subsystem: api
tags: [zernio, linkedin, hono, d1, publishing-boundary]

requires:
  - phase: 05-01
    provides: "src/zernio.ts — createLinkedInDraft, ZernioError, MAX_LINKEDIN_CHARS, the isDraft pin"
  - phase: 05-02
    provides: "migration 0006 — the four push columns, recordPush/recordPushFailure, widened getRunView"
  - phase: 05-03
    provides: "/zernio — the connection page, zernio.account_id and zernio.account_label in settings"
  - phase: 04-02
    provides: "the decision route whose id guards, 400/404 shapes and 303-back this route mirrors"
provides:
  - "POST /runs/:id/drafts/:draftId/push — nine guards, then one unscheduled Zernio draft"
  - "PushState and PushForm on a draft: in-Zernio, refused, pushable, or nothing at all"
  - "SCHED-02 and the visible half of SCHED-03"
affects: [06-accounts, 06-05, 07-paid-credits]

tech-stack:
  added: []
  patterns:
    - "A 409 duplicate is recorded as a success, because the post exists"
    - "Push failures land on the row and render beside the draft, never on an error page"

key-files:
  created: []
  modified:
    - src/runs.tsx

key-decisions:
  - "final_body is what reaches Zernio, never body — on an edited draft, body is the version the executive changed and did not approve"
  - "The decision guard is the requirement, not a safety net: a rejected or undecided draft reaching Zernio would make the approval gate decorative"
  - "A 409 duplicate carrying details.existingPostId is recorded with recordPush and redirected as a success"
  - "MAX_LINKEDIN_CHARS is checked locally before the request, because MAX_DECISION_BODY_CHARS (5000) legally exceeds LinkedIn's 3000"
  - "The route refuses an already-pushed draft even though the button is hidden, because a stale open tab would resubmit"

duration: unknown (reconstructed)
completed: 2026-09-15
reconstructed: 2026-09-16
---

# Phase 05-04: The Push — Summary

**An accepted draft reaches Zernio as an unscheduled LinkedIn post behind nine guards, and no path exists from this app to a published post.**

> ## ⚠️ This SUMMARY was reconstructed on 2026-09-16, not written at execution time
>
> Both code tasks were committed on 2026-09-15 but no SUMMARY was ever written, so Phase 5
> never got its verification, its REQUIREMENTS update or its STATE entry. This file was
> rebuilt from the commits and from checks re-run against the working tree on 2026-09-16.
>
> **What that costs, stated plainly:** everything below under "Verified on 2026-09-16" was
> observed by re-running it. Everything under "Never observed" has *no evidence either way* —
> the commit messages describe the code, not observations, and the plan's own verification
> steps (the curl sweep over every guard, the captured outbound request body, the five render
> states) left no trace. **They are recorded as not performed rather than assumed done.**
> This is the same rule 04-03 set for approved-but-unobserved work, applied to itself.

## Performance

- **Duration:** unknown — commits are 2 minutes apart (17:12:27 → 17:14:51 on 2026-09-15), which is commit spacing, not execution time
- **Tasks:** 2 of 3 code/deploy tasks evidenced; the blocking checkpoint was never answered
- **Files modified:** 1 (`src/runs.tsx`, +345 lines across two commits)

## Accomplishments

- **SCHED-02 in code**: `POST /runs/:id/drafts/:draftId/push` turns one approved draft into one unscheduled Zernio LinkedIn draft.
- **SCHED-03's visible half, as committed**: `3d26e6a` rendered the pushed state, the Zernio id and the time beside the draft, and showed a refused push in amber with Zernio's own message and code and the button again. **That rendering is no longer live.** `b954dc5` (the Broadsheet Run/Approve screens, the next morning) removed `<DraftSection>`, which left `PushState` and `PushForm` defined but never rendered. The new Approve screen shows the pushed id and the button but never reads the error columns, so a refused push looks like a button that did nothing. 05-VERIFICATION.md records this as gap 1, and 05-05 closes it.
- **The publishing ban holds end to end.** The only occurrences of `publishNow`, `scheduledFor` or `queuedFromProfile` anywhere in `src/` are three comment lines saying they are never constructed.

## Task Commits

1. **Task 1: The push route** — `5b57a56` (feat)
2. **Task 2: The push control and the pushed-state panel** — `3d26e6a` (feat)
3. **Task 3: Deploy** — no 05-04-specific deploy was recorded (see below)

## Files Created/Modified

- `src/runs.tsx` — the push route after the decision route; `PushState`, `PushForm` (both since orphaned by `b954dc5` and removed by 05-05), `pushFailure`; `RunControl`'s paragraph now says a push creates an *unscheduled* Zernio draft and that scheduling and publishing stay manual

## Verified on 2026-09-16 (re-run against the working tree)

| Check | Result |
|---|---|
| `npm run check` | exit 0 |
| `npm test` | 75/75 (was 68 at 05-03; later phases added 7) |
| Push route present | `src/runs.tsx:1664` |
| `key_links` from the plan | all three hold — `createLinkedInDraft(`, `recordPush(`, `final_body` |
| Nine guards | all present and in the plan's order: run id → draft id → missing token → no account → unknown draft → decision not accepted/edited → empty `final_body` → already pushed → over `MAX_LINKEDIN_CHARS` |
| 409-duplicate-as-success | present, with `recordPush` and a 303 |
| Ownership as the WHERE clause | `recordPush`/`recordPushFailure` false → 404, matching the decision route |
| Publishing fields in `src/` | comments only, none constructed |
| Remote D1 | fully migrated (`No migrations to apply`), through 0007 |
| Deployed | app `172124fb-ed97-4e2c-be5f-a674f5db9031` and site `736c88f0-41d0-4966-b63a-080ed16e9c78`, both 100%, both 2026-09-16 08:35 |

**On the deploy:** Task 3 asked for the version id to be recorded and it never was. The push
code has since been deployed — the live versions above postdate the 05-04 commits by a day and
the working tree is clean against `origin/main` — so the *effect* of Task 3 holds. But the
deploy attributable to this plan is not identifiable, and the live bundle was not diffed against
this commit. Recorded as deployed-by-inference, not as observed.

## Never observed

These are the plan's own verification steps and its blocking checkpoint. None left any evidence,
and none is claimed.

**From Task 1 and Task 2 (not performed, or performed without record):**
- The curl sweep driving every guard against seeded local D1, confirming `drafts` unchanged after each rejection
- **The captured outbound request body** the plan explicitly required to be pasted here, showing `isDraft: true`, the `linkedin` entry with the configured account id, and none of the three publishing fields. *(The static evidence is strong — `test/zernio.test.ts` pins it by mutation, and the fields appear nowhere in `src/` — but the captured body itself does not exist.)*
- The five render states (pushed, failed, pushable, rejected, undecided) seen at once
- The three Zernio outcomes (201, 409, 403) driven against a local stand-in

**From the blocking checkpoint (never answered — all five items open):**
1. `/health` green with every secret set — now **five** deploys unobserved
2. The decision round trip on production D1, and whether an unchanged accept records as `accepted` rather than `edited` (the only real test of 04-02's CRLF normalisation)
3. The grounding panel judged against a real draft
4. **`/zernio` and the push itself — including confirming in Zernio that the post sits there unscheduled and unpublished.** This is the whole phase, and `POST /v1/posts` has still never been called by anything
5. One new run with an approved post in the prompt — the only way to see DRAFT-04 do anything

**This is now the third consecutive checkpoint to pass without observations** (03-07, 04-03, and
this one — which went further and was never answered at all). The plan anticipated exactly this
and said it must not happen here, because unlike `/health`, an unexercised publishing client is a
risk to a real LinkedIn profile rather than an unverified claim. The risk is bounded — the client
structurally cannot publish, and that is pinned by mutation test — but "cannot publish" and "has
been seen working" remain different statements.

## Found during reconstruction: the push route is public on the site Worker

**The plan assumed only Vincent can press `Push to Zernio`. On the public hostname, anyone can.**

`src/public.tsx` (commit `7e7e0c1`, after this plan) is a second entry point that mounts
`health`, `settings`, `sources`, `fireflies`, `zernio` and `runs` **without** `requireAccess`.
A `demoIdentity` middleware sets the email to `"Guest"` in its place. Only `csrf()` is in front,
and `csrf()` checks the `Origin` header. It does not authenticate anyone, and a non-browser
client can set that header to anything. The file's own header says what that exposes:
readable transcripts and drafts, real OpenAI spend, and pushes to the connected Zernio account,
all against production D1 and the production secrets.

- `wrangler.site.jsonc` builds `pipeflick-site` from `src/public.tsx`
- `7e7e0c1` was committed at 08:30:03Z on 2026-09-16, and the live site version `736c88f0` was deployed at 08:35:23Z. The unauthenticated entry point is **almost certainly live**. That comes from timestamps and config, not from a request against the site.
- `CLAUDE.md` still says every non-landing route on the site hostname is 403'd by `requireAccess`. The code no longer does that.
- This is known and scheduled: Phase 6 criterion 5 and plan `06-07` ("Close the hole the demo opened")

**What still holds:** the guards run for a guest the same as for Vincent. Only an accepted or
edited draft goes out, only its `final_body`, and only once per draft. `POST /zernio` re-lists
the accounts and refuses any id the token does not own. Nothing can publish. The worst a
stranger can do through this route is put an unscheduled draft of already-approved text into
Vincent's Zernio. The wider exposure is not about pushes: a stranger can read the transcripts,
spend OpenAI credit and write decisions.

## Deviations from Plan

None in the code. The route and the render states match the plan task-for-task, including the
ordering of the guards and the 409-as-success rule.

The deviation is procedural: Task 3's version id was not recorded and the blocking checkpoint
was bypassed rather than answered.

## Issues Encountered

The missing SUMMARY hid a completed phase. `STATE.md` still described 05-04 as the remaining
plan, and `REQUIREMENTS.md` still listed SCHED-01/02/03 as Pending, while the code had been
written, merged and deployed for a day. Later commits (`b954dc5` Broadsheet Run/Approve screens,
`20fd556` per-sentence grounding) then rewrote parts of the same file, which is why the key links
were re-checked against the working tree rather than trusted from the commit.

## User Setup Required

None for the code. The checkpoint's five items are all user actions and all still outstanding.

## Next Phase Readiness

**Ready in code.** SCHED-01/02/03 are satisfied structurally, and Phase 6 can build on them.

**Two things Phase 6 inherits and should not rediscover:**
- `ZERNIO_USER_TOKEN` is still one shared Worker secret. 06-05 moves it per-account, which means the push route's `c.env.ZERNIO_USER_TOKEN` read becomes a per-account credential read.
- The push path has never run against the real service. Whoever first exercises it should treat it as first contact, not as a regression check.

---
*Phase: 05-zernio-push*
*Completed: 2026-09-15 (code) · SUMMARY reconstructed 2026-09-16*
