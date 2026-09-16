---
phase: 05-zernio-push
verified: 2026-09-16T14:16:03Z
status: human_needed
score: "15/17 must-haves verified (1 deferred to 06-07 by user decision, 1 needs a live observation)"
re_verification:
  previous_status: gaps_found
  previous_score: "14/17 (2 failed, 1 needs a live observation)"
  previous_verified: 2026-09-16T12:13:21Z
  gaps_closed:
    - "A failed push shows a clear error (SC3, second half; SCHED-03). Closed by 05-05 (e9781b1, 822c739), with e27e56f on the failure wording. Re-proven by reading the code and by driving the route against a local stand-in"
  gaps_remaining: []
  deferred:
    - truth: "The push is reachable only by the signed-in executive in every deployment of this code"
      decision: "Deferred to 06-07 by user decision (2026-09-16). The public site is left as-is, and pipeflick-site was deliberately redeployed from src/public.tsx"
      status: "Not closed. Not an open gap blocking Phase 5. Finding and evidence kept below"
  regressions: []
gaps: []
human_verification:
  - test: "On the gated app (version 67bbe1ff): open /zernio and confirm your LinkedIn account is listed and chosen. On /runs/<id>/approve, accept a draft unchanged, then press Send to Zernio. Then open Zernio"
    expected: "The draft shows 'In Zernio as an unscheduled LinkedIn draft: not scheduled, and not published' with the Zernio id and time, and no button. In Zernio the post sits under the right LinkedIn account with exactly the approved text, NOT scheduled and NOT published. The pill reads 'Accepted, unchanged' (04-02's CRLF check). Re-submitting from a stale tab is refused. If Zernio refuses instead, the reason and code appear beside the draft with Send to Zernio offered again"
    why_human: "POST /v1/posts has never been called against zernio.com. Production D1 at 14:16Z: 6 drafts, 0 decided, 0 push attempts. The call creates a real item in a real external account, and the 403/409/500 shapes have only been exercised against a stand-in built from the spec"
  - test: "Open /health on the gated app"
    expected: "Green, with OPENAI_API_KEY, FIREFLIES_API_KEY and ZERNIO_USER_TOKEN shown as set"
    why_human: "Access returns 302 for unauthenticated requests before the Worker runs. Still unobserved, including after the 14:11Z deploy"
---

# Phase 5: Zernio Push Verification Report

**Phase Goal:** An accepted draft reaches Zernio as an unscheduled LinkedIn post with one click
**Verified:** 2026-09-16T14:16:03Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure (05-05). The previous report (12:13Z, gaps_found, 14/17) is superseded. Its findings are kept below where they still apply.

> **How to read this report.** This project separates three levels of evidence, and so does every
> table below:
> - **In codebase:** read in the working tree at HEAD `e27e56f`.
> - **Driven locally (this verification):** exercised against `wrangler dev` running a **copy** of
>   `src/` in the session scratchpad, with its own scratch D1 and a fake token. Zernio was replaced
>   by a Node stand-in on 127.0.0.1. The project's working tree, `.dev.vars` and local D1 were not
>   touched.
> - **Observed live:** seen on production by a person.
>
> **Nothing in Phase 5's push path has reached the third level.** `POST /v1/posts` has still never
> been called against zernio.com. Production D1 has no decided draft and no push attempt.

## What Changed Since the Previous Report

| Commit | Change | Re-proven here |
|--------|--------|----------------|
| `e9781b1` | `ZernioStatus` / `SendToZernio` on `/runs/:id/approve`: pushed → refused → not accepted → control. Duplicate and failure branches redirect with `returnTo(pushForm, runId)`. The account label is read beside the id | Read. Rendered from seeded rows. Driven through the route with a stand-in |
| `822c739` | Removed `DraftSection`, `PushState`, `PushForm`, `GroundingPanel`, `FlaggedLines`, `parseGrounding`, `StoredGrounding`, `DecisionRecord`, `DecisionForm`, `DECISION_LABEL`, and the unused settings reads on `GET /runs/:id` | Each name has 0 whole-word references in `src/` and `test/`. No top-level declaration in `runs.tsx` is referenced fewer than 2 times. `tsc` exits 0 |
| `e27e56f` | The network-failure message says "Send to Zernio" (the real button) | Driven: a dropped connection rendered "…then press Send to Zernio again…" beside a button labelled Send to Zernio |
| Deploys | App `172124fb` → `67bbe1ff` (14:11:32Z). Site `736c88f0` → `d917c919` (14:11:51Z), built with `-c wrangler.site.jsonc`, i.e. from `src/public.tsx` | Both at 100% (`wrangler deployments list`). Created 25 s and 44 s after `e27e56f` (14:11:07Z). Bundles not diffed, so "contains e27e56f" is inferred |

`git diff 0786276 HEAD` touches **only `src/runs.tsx`** among code files. `src/zernio.ts`, `src/db.ts`, `src/zernio-routes.tsx`, `src/index.tsx`, `src/public.tsx`, `src/layout.tsx`, `test/`, `migrations/`, CLAUDE.md and README.md are byte-identical to the previous verification. So the earlier evidence for them stands, and they got a regression check rather than a full re-check.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees whether the Zernio connection works (SC1) | ✓ VERIFIED | `GET /zernio` unchanged (connection check = account list). Live evidence is **inferred, not reported**: production `zernio.account_id` was written 2026-09-15T15:21:23Z, which `POST /zernio` can do only after a successful `GET /v1/accounts` |
| 2 | A missing key, a bad key and an outage each show a distinct message | ✓ VERIFIED | Unchanged: 500 + /health, `BadKeyPage` on 401, 502 with code otherwise |
| 3 | The LinkedIn account is chosen once and remembered | ✓ VERIFIED | Unchanged. The Approve screen now names it too: "…draft for Verifier Label" rendered from settings |
| 4 | One click on an accepted draft puts it in Zernio as an unscheduled LinkedIn post (SC2) | ? HUMAN | Complete and driven end to end against a stand-in (201 → pushed, 303 back to the draft). **Never run against Zernio.** On the gated Worker this is the executive's click. On the site Worker anyone can make it (truth 15, deferred) |
| 5 | No code path can publish: `isDraft: true`, never `publishNow` / `scheduledFor` / `queuedFromProfile` | ✓ VERIFIED | `src/zernio.ts` unchanged, and the field names appear in `src/` only in comments. **Captured outbound bodies (7 of 7):** keys exactly `content, isDraft, platforms`, `isDraft: true`, `platforms: [{platform: "linkedin", accountId: <configured>}]`, no publishing field anywhere in the raw body. Pin: 10 of 11 mutants killed (one known survivor, below) |
| 6 | The client never reads the environment; the key never reaches an error or a log | ✓ VERIFIED | Unchanged. **Driven:** a stand-in 500 whose error text contained `sk_abcdef0123456789` rendered as "Upstream failure for the configured key token (http_500)" |
| 7 | Only an `accepted` or `edited` draft can be pushed | ✓ VERIFIED | Route guard unchanged (L1290). Approve screen: `ZernioStatus` offers the control only when `sendable`. A rejected draft, an undecided draft, and a draft rejected after a refused push all rendered with no push form |
| 8 | What reaches Zernio is `final_body`, never `body` | ✓ VERIFIED | **Driven:** for an `edited` draft whose `body` was "ORIGINAL BODY 305 must never be sent", the stand-in received content whose SHA-256 matched `final_body`, not `body` |
| 9 | A draft already in Zernio cannot be pushed twice | ✓ VERIFIED | **Driven:** a re-press on a pushed draft returned 400 "already in Zernio as zp_standin_409", and the stand-in's request count stayed at 7. The pushed state renders no form |
| 10 | A push is scoped to its run | ✓ VERIFIED | Route and `db.ts` unchanged since the previous report, where the cross-run 404 (row untouched) was driven |
| 11 | A success records the id and time and clears **both** error columns | ✓ VERIFIED | **Driven:** a draft refused three times (403, 409 without id, 500), then answered 409 **with** `existingPostId`, ended with `zernio_post_id = zp_standin_409` and both error columns NULL. A draft refused by a dropped connection, then answered 201, ended with `zp_standin_201` and both NULL |
| 12 | A failure records the reason without losing an earlier post id | ✓ VERIFIED | `db.ts` unchanged: `zernio_post_id` is not in `recordPushFailure`'s SET list. (Not driven: the route refuses to push an already-pushed draft, so no failure can follow a success.) |
| 13 | The draft shows its pushed state and Zernio id (SC3, first half) | ✓ VERIFIED | **Driven:** "In Zernio as an unscheduled LinkedIn draft: not scheduled, and not published. Zernio id … · 2026-09-16 14:14". The card hint reads "In Zernio as an unscheduled draft, not published". No form |
| 14 | **A failed push shows a clear error (SC3, second half)** | ✓ VERIFIED (**was ✗, gap closed**) | See "Gap 1: Re-proven" below |
| 15 | The push is reachable only by the signed-in executive, in every deployment | ⏸ DEFERRED to 06-07 by user decision (2026-09-16) | Not closed. `src/public.tsx` is unchanged and live on `pipeflick-site` (`d917c919`, built from it deliberately). Finding kept below |
| 16 | Migration 0006 applied to local and remote D1 | ✓ VERIFIED | Remote: "No migrations to apply" (re-run during this verification). Local: unchanged at 7 applied |
| 17 | The push code, including the gap-1 fix, is deployed | ✓ VERIFIED (by inference) | `67bbe1ff` at 100%, created 14:11:32Z, after `e9781b1`, `822c739` and `e27e56f`. Bundle not diffed against HEAD |

**Score:** 15/17 verified · 1 deferred (user decision, not blocking) · 1 needs a live observation

### Gap 1: Re-proven

**In codebase:**
- `ZernioStatus` (`src/runs.tsx:1667-1714`) reads `zernio_error_code` and `zernio_error_message` (L1701-1706). It renders them in `.notice.warn` with the code in parentheses, followed by `SendToZernio` while the draft is still accepted or edited.
- It is rendered from the Approve screen's decided branch (L1925).
- All three push outcomes redirect with `returnTo(pushForm, runId)` (L1322, L1334, L1346).
- The only readers of the error columns in `src/` are now in live code.

**Rendered from seeded rows (scratch D1):**

| Draft state | Push form | Warn notice | Message | Code | Other |
|-------------|:---------:|:-----------:|:-------:|:----:|-------|
| Refused, still accepted | ✓ | ✓ | ✓ marker | ✓ `(ACCOUNT_DISCONNECTED)` | Hint names "Verifier Label"; `return_draft=1` |
| Refused, then rejected | – | ✓ | ✓ marker | ✓ `(http_500)` | No retry button (the route would 400) |
| Refused, **no account chosen** | – | ✓ | ✓ marker | ✓ | "Choose a LinkedIn account" link instead of a form |
| Pushed | – | – | – | – | "not scheduled, and not published", id and time |
| Pushable (accepted / edited) | ✓ | – | – | – | "…unscheduled LinkedIn draft for Verifier Label. Scheduling and publishing stay manual, in Zernio." |
| Over-length (3001) | – | ✓ | "This post is 3001 characters and LinkedIn allows 3000…" | – | No form |
| Rejected / undecided | – | – | – | – | Nothing push-related |
| Run screen `/runs/:id` | – | – | – | – | No push state (by design since `b954dc5`); 200 |

**Driven through the route (stand-in on 127.0.0.1, fake token; every POST carried `Origin`):**

| Stand-in answer | Redirect | What the Approve screen then showed |
|-----------------|----------|-------------------------------------|
| 403 `ACCOUNT_DISCONNECTED` | 303 → `/runs/:id/approve?draft=4` | "This social account has been disconnected. Reconnect LinkedIn in the Zernio dashboard, then choose the account again on /zernio — …" `(ACCOUNT_DISCONNECTED)`, then the form |
| 409, no `existingPostId` | 303 → `…?draft=4` | "…Zernio already has this exact text from the last 24 hours but returned no id for it…" `(duplicate)`, then the form |
| 500 with a key-shaped fragment | 303 → `…?draft=4` | "Upstream failure for the configured key token" `(http_500)`, then the form |
| 409 **with** `existingPostId` | 303 → `…?draft=4` | Pushed, `zp_standin_409`, no form. D1 error columns back to NULL |
| Connection dropped | 303 → `…?draft=5` | "The push did not complete… press **Send to Zernio** again…" `(push_failed)`, then the form |
| 201 | 303 → `…?draft=5` | Pushed, `zp_standin_201`, no form. D1 error columns back to NULL |
| 403, **no** `return_draft` | 303 → `/runs/:id` | (fallback unchanged; row recorded as `ACCOUNT_DISCONNECTED`) |
| (re-press on pushed draft) | 400 "already in Zernio as zp_standin_409" | Stand-in received nothing |

**The captured outbound request body**, which 05-04 required and never recorded, is now captured. All 7 requests carried the fake bearer token (checked as a boolean) and an `x-request-id`. Each body was exactly:
```
{ content: <the draft's final_body>, isDraft: true,
  platforms: [ { platform: "linkedin", accountId: "<configured id>" } ] }
```
with no `publishNow`, `scheduledFor` or `queuedFromProfile` anywhere in the raw text.

**Containment:**
- **Only one Zernio address:** the only Zernio fetch base in the scratch copy was the stand-in. `https://zernio.com` remained only in a comment.
- **No real keys:** the scratch `.dev.vars` held a fake Zernio token and empty OpenAI and Fireflies keys.
- **No other outbound routes used:** no `/step` or `/fireflies` request was made.
- **Clean-up and state checks:**
  - Both processes were stopped and the scratch tree deleted.
  - The project's `src/zernio.ts` equals HEAD, and `src`, `test` and `migrations` are clean against HEAD.
  - The project's local D1 row counts and settings timestamps match the pre-run baseline exactly (settings 4, migrations 7, everything else 0).
- **No production traffic:** no request was made to zernio.com, api.openai.com or either production hostname. Only read-only Cloudflare API calls were made: deployments, and D1 migrations and counts.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/zernio.ts` | Client, typed errors, draft-only body (≥120 lines) | ✓ VERIFIED | Unchanged, 267 lines |
| `test/zernio.test.ts` | Publish-safety pin | ✓ VERIFIED | Unchanged. 75/75 suite passes |
| `migrations/0006_push.sql` | Four push columns | ✓ VERIFIED | Applied local and remote |
| `src/db.ts` | `recordPush` / `recordPushFailure`, widened `DraftView`, **imports nothing** | ✓ VERIFIED | Unchanged. 0 import lines |
| `src/zernio-routes.tsx` | `GET`/`POST /zernio` | ✓ VERIFIED | Unchanged. Gated in `index.tsx`, **ungated in `public.tsx`** (deferred finding) |
| `src/runs.tsx`: push route | Nine guards, then one draft | ✓ VERIFIED | Guards unchanged. All outcomes return to the draft |
| `src/runs.tsx`: `ZernioStatus`, `SendToZernio` | The push state and control on the Approve screen | ✓ VERIFIED | Four states, driven (was ⚠️ PARTIAL) |
| `src/runs.tsx`: former `PushState` / `PushForm` / `DraftSection` | — | ✓ REMOVED | Were ⚠️ ORPHANED. 0 references now |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/zernio.ts` | Zernio `/v1/posts`, `/v1/accounts` | `fetch`, Bearer from argument | ✓ WIRED | Body shape captured (stand-in) |
| `test/zernio.test.ts` | `buildDraftRequest` | shape and source assertions | ✓ WIRED | 10 of 11 mutants killed |
| `recordPush` / `recordPushFailure` | `drafts` | `WHERE id AND run_id`, `changes === 1` → 404 | ✓ WIRED | Unchanged |
| `getRunView` | `drafts.zernio_*` | projection | ✓ WIRED | Unchanged |
| `src/zernio-routes.tsx` | `listLinkedInAccounts`, settings | token argument, `ZERNIO_ACCOUNT_ID_KEY` | ✓ WIRED | Unchanged |
| `src/index.tsx` (gated Worker) | `zernio`, `runs` | behind `requireAccess` + `csrf` | ✓ WIRED | Unchanged |
| push route | `createLinkedInDraft` → `recordPush` / `recordPushFailure` | returned id / `pushFailure` | ✓ WIRED | Driven through all outcomes |
| push route (all outcomes) | Approve screen | `returnTo(pushForm, runId)` | ✓ WIRED | **was ✗ for failure and duplicate** |
| Approve screen | `zernio_error_code` / `_message` | `ZernioStatus` | ✓ WIRED | **was ✗ NOT WIRED** |
| Approve screen | `zernio_post_id`, `zernio_pushed_at` | `ZernioStatus` | ✓ WIRED | Driven |
| Approve screen | `zernio.account_label` | one settings read per render | ✓ WIRED | Hint names the account |
| `src/public.tsx` (site Worker) | `runs`, `zernio`, … | no `requireAccess` | ⏸ DEFERRED | Live on `d917c919` by user decision |

### Requirements Coverage

| Requirement | Status | Note |
|-------------|--------|------|
| SCHED-01: App connects to Zernio with configured credentials | ✓ SATISFIED | Live success inferred from the production settings row, never reported |
| SCHED-02: One-click push of an accepted draft as an unscheduled LinkedIn post | ? NEEDS HUMAN | Complete in code and driven against a stand-in. Never run against Zernio |
| SCHED-03: User sees whether the push succeeded; draft records pushed state and Zernio id | ✓ SATISFIED (code + driven locally) | Success, id, time and refusals all render beside the draft. Not yet seen live, since no push has happened |

### Deferred: The Push Is Not Gated on the Public Site Worker

**Status: deferred to 06-07 by user decision (2026-09-16).** It is not closed, and it is not an open gap blocking this phase. The user chose to leave the public site as-is until 06-07, and `pipeflick-site` was deliberately redeployed from `src/public.tsx` (`d917c919`, 14:11:51Z). **This does not fail the push code:** the route and its guards are identical on both Workers. **This report does not claim the push is gated: it is gated only on the `pipeflick` Worker.**

| Evidence | Status |
|----------|--------|
| `src/public.tsx:50-58` mounts `health`, `settings`, `sources`, `fireflies`, `zernio`, `runs` after `demoIdentity` (`c.set("email", "Guest")`) and `csrf()`, with no `requireAccess` | Re-proven (file unchanged since the previous report) |
| The file's header: "Everything the app can do, to anyone with the URL … an accepted draft can be pushed to the connected Zernio account. It shares the production database" | Re-proven |
| `csrf()` is not authentication. Hono 4.13.7 passes a form POST when `Sec-Fetch-Site: same-origin` **or** `Origin` matches, and both are client-set. Every POST in this verification's local runs passed it with a curl-set `Origin` | Re-proven (source read, and driven) |
| The decision route and `POST /zernio` are mounted too, so an anonymous visitor can create the "accepted" precondition and re-point `zernio.account_id` (bounded: only ids the token owns) | Re-proven (read) |
| Guards 6-8 and the ban on publishing hold on that Worker | Re-proven (same router) |
| The live site serves `public.tsx` | **Previously inferred. Now stated by the deploy record**: `d917c919` built with `-c wrangler.site.jsonc` (per the orchestrator). Still not observed with a request, by instruction |
| CLAUDE.md (L21-23) and README.md (L32-34) say every non-landing route on the site hostname returns 403 | Still untrue of the code. **Left unedited, by instruction** |
| Tracked: ROADMAP Phase 6 criterion 5; 06-07 "Close the hole the demo opened" | Re-proven |

**Accepted exposure until 06-07:** anyone with the site URL can accept or reject any draft (which skews the APPR-05 metric), push an accepted draft into the operator's real Zernio account **as an unscheduled draft**, re-point the saved account among accounts the token owns, read stored transcripts, and spend OpenAI credit. Nothing can be **published**.

### Anti-Patterns and Open Items

| File | Line | Pattern | Severity | Status |
|------|------|---------|----------|--------|
| `src/runs.tsx` | — | Orphaned push components | — | **Fixed** (`822c739`) |
| `src/runs.tsx` | 1334, 1346 | Failure and duplicate redirects ignored `returnTo` | — | **Fixed** (`e9781b1`) |
| `src/runs.tsx` | — | Push button did not name the account | — | **Fixed** (hint names the label) |
| `src/runs.tsx` | — | Send offered on a >3000-char draft | — | **Fixed** (the notice replaces the form) |
| `src/runs.tsx` | — | Unused `pushTarget` reads on the Run screen | — | **Fixed** |
| `src/public.tsx` | 50-58 | App routers mounted with no Access gate | ⏸ Deferred | 06-07, by user decision |
| CLAUDE.md, README.md | 21-23 / 32-34 | Public-site description contradicts the code | ⚠️ Warning | Part of the deferred finding. Not edited, by instruction |
| `test/zernio.test.ts` | 92 | Source regex only matches literal values: a mutant with `scheduledFor: <variable>` in the fetch path survives | ⚠️ Warning | Open. The shipped code has no such construct |
| `src/runs.tsx` | 1918-1924, 1123 | A pushed draft can still be edited or rejected, and its Zernio copy will not follow | ⚠️ Warning | Open. Tracked in `.planning/todos/pending/pushed-draft-can-diverge-from-zernio.md` |
| `src/runs.tsx` | 626, 651-652 | Run screen copy: "the drafts are below" and "The message is beside the step below". A failed **draft job's** message is rendered nowhere (a `b954dc5` regression outside Phase 5, per DRAFT-05) | ⚠️ Warning (not Phase 5) | Open. Tracked in `.planning/todos/pending/run-screen-regressions-from-broadsheet.md` |
| `src/runs.tsx` | 775 | `ZernioNotConfigured` heading still reads "Push to Zernio" | ℹ️ Info | Page heading, not a button reference. Harmless |
| `src/runs.tsx` / `src/db.ts` | 1301 / 851 | Check-then-act on "already pushed" | ℹ️ Info | Zernio's 24-hour content-hash 409 is the backstop. Driven against the stand-in, never seen from Zernio |
| `src/runs.tsx` | 1209-1212 | Failure text promises "this cannot create a second draft" | ℹ️ Info | Rests on the same unobserved 409 |

No TODO, FIXME or placeholder text in Phase 5 files. `npx tsc --noEmit` exits 0 and `vitest run` exits 0 (75/75).

### Publish-Safety Pin: Mutation Results (from the previous report; `src/zernio.ts` and the test are unchanged)

10 of 11 mutants were killed:
- `isDraft: false`, and `isDraft` removed
- `publishNow` or `scheduledFor` added to `buildDraftRequest`, and `publishNow: <expression>` there
- `queuedFromProfile` nested in `platforms[]`
- `publishNow: true` spread in the fetch path
- a `process.env` read, and a `c.env` mention

**Survivor:** `scheduledFor: when` (a variable) spread into the body in `createLinkedInDraft` only. The ban holds today; the pin should be tightened, e.g. strip comments and then assert the three names are absent.

### Verified in Codebase vs. Observed Live

| Claim | In codebase | Driven locally | Observed live |
|-------|-------------|----------------|---------------|
| Client cannot publish | ✓ | ✓ 10/11 mutants; 7/7 captured bodies clean | n/a (structural) |
| `/zernio` connection and account choice | ✓ | not driven (calls real Zernio) | **Inferred** from the production settings row (2026-09-15T15:21Z). Never reported |
| Push guards, cross-run 404, stale-tab refusal | ✓ | ✓ | never |
| Pushed state, id and time rendered | ✓ | ✓ | never (0 pushed rows in production) |
| **Refused push rendered, with retry** | ✓ | ✓ seeded, and 403 / 409 / 500 / dropped connection through the route | never |
| All outcomes return to the draft | ✓ | ✓ | never |
| `final_body` sent, not `body` | ✓ | ✓ (SHA match) | never |
| Real Zernio answers in the shapes the client parses | by reading, from the spec | stand-in only | **never: `POST /v1/posts` has not been called against zernio.com** |
| Deployed | `67bbe1ff` / `d917c919` at 100%, 25-44 s after `e27e56f` | — | `/health` unobserved |
| Push gated on the site Worker | ✗ | `csrf()` passes client-set Origin | Deferred to 06-07 by user decision. Site built from `public.tsx` per the deploy record |

### Human Verification Required

#### 1. The push itself (this is the whole phase)
**Test:** On the gated app, open `/zernio` and confirm the account. On `/runs/<id>/approve`, accept a draft **unchanged** and press **Send to Zernio**. Then open Zernio.
**Expected:** The draft shows "In Zernio as an unscheduled LinkedIn draft: not scheduled, and not published", with the id and time. In Zernio the post has exactly the approved text under the right LinkedIn account, **not scheduled and not published**. The pill reads "Accepted, unchanged". A stale-tab re-press is refused. If Zernio refuses the push, its reason and code appear beside the draft, with the button offered again.
**Why human:** Nothing has ever called `POST /v1/posts` on zernio.com. Production has 0 decided drafts and 0 push attempts.

#### 2. `/health`
**Test:** Open `/health` on the gated app.
**Expected:** Green, all three secrets set.
**Why human:** Access redirects before the Worker runs. Still unobserved after the 14:11Z deploy.

*The previous report's check "which bundle is live on pipeflick-site" is answered by the deploy record (`d917c919` built from `src/public.tsx`, by user decision) and is no longer asked.*

### Summary

**Gap 1 is closed, and the closure holds up under a harder test than the one it was asked to pass.** A refused push now renders Zernio's message and code beside the draft on the Approve screen, with Send to Zernio offered again only while the draft is still accepted. Every push outcome returns the reader to that draft. That was proven three ways: from seeded rows, by driving a real 403, both 409 shapes, a 500 and a dropped connection through the route against a local stand-in, and by reading. The dead components that made the missing renderer look present are gone, with no remaining references. The push route's guards did not change. The request body 05-04 never captured is now captured, and it is draft-only and carries `final_body`. The 05-05 SUMMARY's claims matched what was re-observed here. Its "Not deployed" line has since been superseded by the 14:11Z deploys.

**Gap 2 is deferred, not closed.** On the user's decision, the public site Worker stays open until 06-07. The finding and its evidence remain above, and nothing here should be read as "the push is gated" beyond the `pipeflick` Worker.

**Why the status is `human_needed` and not `passed`:** every automated check passes, but the phase goal ends at Zernio, and nothing has ever reached Zernio. Production has no decided draft and no push attempt. Until human check 1 is answered with an observation, SCHED-02 is complete in code and proven against a stand-in, not against the service.

---

_Verified: 2026-09-16T14:16:03Z (re-verification; previous: 2026-09-16T12:13:21Z, gaps_found)_
_Verifier: Claude (gsd-verifier)_
