---
phase: 05-zernio-push
verified: 2026-09-16T12:13:21Z
status: gaps_found
score: "14/17 must-haves verified (2 failed, 1 needs a live observation)"
gaps:
  - truth: "A failed push shows a clear error (ROADMAP Phase 5 success criterion 3, second half; SCHED-03)"
    status: failed
    reason: "Regression introduced after 05-04 by b954dc5 (Broadsheet Run/Approve screens). The failure IS written to D1 (recordPushFailure), but no reachable screen renders it. PushState is the only reader of zernio_error_code / zernio_error_message, and it is rendered only by DraftSection. b954dc5 removed <DraftSection> from GET /runs/:id, so all three components are orphaned. The Approve screen is now the only place a push can be started, and it never reads the error columns: a failed push renders exactly like a never-pushed draft, a bare 'Send to Zernio' button. The route also redirects failures to /runs/:id, which no longer shows any draft or push state. Confirmed by behaviour: a seeded row with zernio_error_code = ACCOUNT_DISCONNECTED and a marker message rendered neither the code nor the message on /runs/:id/approve or /runs/:id."
    artifacts:
      - path: "src/runs.tsx"
        issue: "GET /runs/:id/approve (L1973-2215) never reads draft.zernio_error_code or draft.zernio_error_message"
      - path: "src/runs.tsx"
        issue: "Push route failure branch (L1750) and 409-duplicate branch (L1740) redirect to `/runs/${runId}` rather than returnTo(pushForm, runId), which the success branch (L1728) uses. The user lands on the Run screen, which shows no push state"
      - path: "src/runs.tsx"
        issue: "PushState, PushForm and DraftSection (L651-827) are defined but never rendered. tsconfig has no noUnusedLocals, so tsc stays silent. pushTarget on GET /runs/:id (L1274-1276) is computed and never used: two wasted D1 reads per render"
    missing:
      - "On /runs/:id/approve, render the failed-push state beside the draft: Zernio's message and code in amber (.notice.warn), with Send to Zernio still offered as a one-click retry"
      - "Redirect the failure and duplicate branches with returnTo(pushForm, runId), as the success branch already does"
      - "Either reuse PushState on the Approve screen, or delete PushState/PushForm/DraftSection and the unused pushTarget reads, so a dead copy cannot again be mistaken for the live one"
      - "Re-run the render check: a seeded draft with zernio_error_code set must show its message and code on /runs/:id/approve"
  - truth: "The push is reachable only by the signed-in executive in every deployment of this code (success criterion 2's 'user clicks once' means the executive)"
    status: failed
    reason: "A FINDING AGAINST THE PHASE, NOT AGAINST THE PUSH CODE. The push route itself is unchanged and its guards still hold on every hostname: only accepted or edited drafts, only final_body, once per draft, and nothing can publish. What fails is the composition around it. Introduced after Phase 5 by 7e7e0c1 (2026-09-16T08:30:03Z), and already known and scheduled: ROADMAP Phase 6 criterion 5 and 06-07 ('Close the hole the demo opened'). src/public.tsx mounts health, settings, sources, fireflies, zernio and runs with no requireAccess; demoIdentity only sets email = 'Guest'. The only thing in front is csrf(), which is not authentication: Hono 4.13.7 passes a form POST whenever Sec-Fetch-Site is same-origin or Origin matches the host, and a non-browser client sets either at will. This verification's own local sweep did exactly that with curl on every guard case. On that Worker, anyone with the URL can: accept or reject any draft (the decision route is mounted too, so the precondition is theirs to create); push it into the operator's real Zernio account as an unscheduled draft; change zernio.account_id via POST /zernio (bounded: the route re-lists accounts and refuses ids the token does not own); read stored transcripts; and spend OpenAI credit on runs. The worst Zernio outcome is an unwanted unscheduled draft, never a published post. WHETHER THIS IS LIVE IS INFERRED, NOT OBSERVED. Two facts support it: the gitignored wrangler.site.jsonc and the committed wrangler.site.example.jsonc both set main = src/public.tsx for pipeflick-site, and the live version 736c88f0 (version created 08:35:21Z, deployment 08:35:23Z) went up five minutes after 7e7e0c1. No request was made to the public hostname, and version metadata does not name the entry point (human check 2)."
    artifacts:
      - path: "src/public.tsx"
        issue: "Mounts health, settings, sources, fireflies, zernio and runs (including POST /runs/:id/drafts/:draftId/decision and /push) with no Access gate"
      - path: "wrangler.site.example.jsonc"
        issue: "main: src/public.tsx for name pipeflick-site (the gitignored wrangler.site.jsonc says the same)"
      - path: "CLAUDE.md"
        issue: "Says the public site is the same code with every route except / returning 403 from requireAccess, and gives `npx wrangler deploy --name pipeflick-site` as its deploy command. That command would build index.tsx from wrangler.jsonc, contradicting wrangler.site.example.jsonc. The two instructions disagree about what is public"
      - path: "README.md"
        issue: "L32-34 make the same '/ only, the rest 403s' claim"
    missing:
      - "Confirm which bundle is live on pipeflick-site (one unauthenticated GET /runs: 403 means safe, 200 means exposed)"
      - "If exposed: redeploy pipeflick-site from src/index.tsx now, or strip src/public.tsx to the landing page (06-07's target shape) now, rather than waiting for the rest of Phase 6"
      - "Do not rely on csrf() as a gate anywhere: it is a cross-site defence, not authentication"
      - "Make CLAUDE.md, README.md and the site wrangler template agree on which entry point the public Worker is built from"
human_verification:
  - test: "On the gated app: open /zernio and confirm your LinkedIn account is listed and chosen. On /runs/<id>/approve, accept a draft, then press Send to Zernio"
    expected: "The draft shows 'In Zernio as an unscheduled draft · <id>'. In Zernio the post exists under the right LinkedIn account with exactly the approved text, and is NOT scheduled and NOT published. Pressing again from a stale tab is refused (400 'already in Zernio')"
    why_human: "POST /v1/posts has never been called by anything. Production D1 has 6 drafts, 0 accepted or edited, and 0 push attempts (zernio_pushed_at is NULL on every row). It creates a real item in a real external account, and the 201 / 409 / 403 handling has only been read, never driven"
  - test: "Unauthenticated GET /runs on the public pipeflick-site hostname"
    expected: "403 'Access required' (index.tsx). A 200 means src/public.tsx is live and gap 2 is live too"
    why_human: "The real hostname is not in the repo, and `wrangler versions view` does not name the entry point"
  - test: "Open /health on the gated app"
    expected: "Green, with OPENAI_API_KEY, FIREFLIES_API_KEY and ZERNIO_USER_TOKEN shown as set"
    why_human: "Access returns 302 for unauthenticated requests before the Worker runs. /health is now five deploys unobserved"
---

# Phase 5: Zernio Push Verification Report

**Phase Goal:** An accepted draft reaches Zernio as an unscheduled LinkedIn post with one click
**Verified:** 2026-09-16T12:13:21Z
**Status:** gaps_found
**Re-verification:** No (initial verification). The 05-04 SUMMARY was reconstructed on 2026-09-16 and was treated as a claim, not as evidence.

> **How to read this report.** This project separates three levels of evidence, and so does every
> table below:
> - **In codebase:** read in the working tree at HEAD `0786276`.
> - **Driven locally (this verification):** exercised against `wrangler dev` on a scratch D1 in
>   the session scratchpad. The project's `.wrangler/state` and working tree were not touched.
> - **Observed live:** seen on production by a person.
>
> **Nothing in Phase 5's push path has reached the third level.** `POST /v1/posts` has never been
> called against the real Zernio service, and production D1 confirms it: zero push attempts.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees whether the Zernio connection works (SC1) | ✓ VERIFIED | `GET /zernio` (`src/zernio-routes.tsx:185`) uses `listLinkedInAccounts` as the connection check. It shows "Connected to Zernio — N LinkedIn accounts", or a warning when there are zero. Live evidence is **inferred, not reported**: production settings hold `zernio.account_id`, written 2026-09-15T15:21:23Z, and `POST /zernio` can only write it after a successful `GET /v1/accounts` |
| 2 | A missing key, a bad key and an outage each show a distinct message | ✓ VERIFIED | Missing key → 500 page pointing at /health, with no request made. A 401 → `BadKeyPage` explaining the `sk_` format and `secrets:push`. Any other `ZernioError` or a network error → 502 with Zernio's code, never a stack trace |
| 3 | The LinkedIn account is chosen once and remembered | ✓ VERIFIED | `POST /zernio` shape-checks the id, re-lists accounts, trusts only ids Zernio returned, and stores `zernio.account_id` and `zernio.account_label`. `GET` pre-checks the stored account and warns when it has disappeared |
| 4 | One click on an accepted draft puts it in Zernio as an unscheduled LinkedIn post (SC2) | ? HUMAN | On the **gated** app. (On the public site Worker anyone can make this click; see truth 15 and the finding below.) Wired end to end in code: Approve form → push route → `createLinkedInDraft` → `recordPush` → 303 back to the draft. **Never exercised against Zernio**: production has 0 approved drafts and 0 push attempts |
| 5 | No code path can publish: `isDraft: true` is sent, and `publishNow`, `scheduledFor` and `queuedFromProfile` are never constructed | ✓ VERIFIED | `buildDraftRequest` (`src/zernio.ts:132`) is the only body builder. The three field names appear in `src/` only in comments (`zernio.ts:120`, `runs.tsx:1645-1646`). The mutation run killed 10 of 11 mutants; one survivor is described under Anti-Patterns |
| 6 | The Zernio client never reads the environment, and the key never reaches an error or a log | ✓ VERIFIED | No `c.env`, `process.env` or `console` in `src/zernio.ts`. The token is a function argument. `scrubToken` removes `sk_…` from Zernio messages, and no error message is built from request data. Only `zernio-routes.tsx:186,216` and `runs.tsx:1677` read the binding |
| 7 | Only an `accepted` or `edited` draft can be pushed | ✓ VERIFIED | Route guard at `runs.tsx:1696`. **Driven locally:** a rejected draft and an undecided draft both got 400 with D1 unchanged. The Approve screen shows no push control on either (rendered HTML checked) |
| 8 | What reaches Zernio is `final_body`, never `body` | ✓ VERIFIED | `const post = draft.final_body ?? ""` (L1700), passed unmodified to `createLinkedInDraft` (L1723). `body` is never read in the route. A test pins pass-through without trimming or truncation |
| 9 | A draft already in Zernio cannot be pushed twice | ✓ VERIFIED | Route guard at L1707. **Driven:** 400 "already in Zernio as zp_seed_already", D1 unchanged. The Approve screen hides the button once `zernio_post_id` is set (checked) |
| 10 | A push is scoped to its run: a draft id from another run writes nothing | ✓ VERIFIED | **Driven:** `POST /runs/A/drafts/<id in run B>/push` → 404, and run B's row was byte-identical afterwards. The 404 fires at the `getRunView(runId)` lookup. The second line of defence is `recordPush`/`recordPushFailure`, whose UPDATE is `WHERE id = ? AND run_id = ?`; a false return becomes a 404 at all three call sites (L1725, L1737, L1747) |
| 11 | A successful push records the Zernio id and time, and clears **both** error columns | ✓ VERIFIED | `db.ts:851-853` sets `zernio_post_id`, `zernio_pushed_at`, `zernio_error_code = NULL`, `zernio_error_message = NULL` |
| 12 | A failed push records the reason without losing an earlier post id | ✓ VERIFIED | `db.ts:882-883` touches only the error columns and the timestamps. `zernio_post_id` is not in the SET list. The message is capped at `MAX_ERROR_MESSAGE` (500) |
| 13 | The draft shows its pushed state and Zernio id (SC3, first half) | ✓ VERIFIED | Approve screen L2091-2092 and L2186-2187. **Driven:** a seeded pushed row rendered "Sent to Zernio as an unscheduled draft" and "In Zernio as an unscheduled draft · zp_seed_already", with no push button |
| 14 | A failed push shows a clear error (SC3, second half) | ✗ FAILED | No reachable screen renders the error columns. See Gap 1 |
| 15 | The push is reachable only by the signed-in executive, in every deployment | ✗ FAILED: a finding against the phase, not the push code. In code: re-proven. Live: inferred | `src/public.tsx` mounts the push, decision and `/zernio` routes with no gate; `csrf()` is not authentication. The push route's guards still hold there. See Gap 2 and the finding below |
| 16 | Migration 0006 is applied to local and remote D1 | ✓ VERIFIED | `wrangler d1 migrations list` reports "No migrations to apply" for both. `pragma_table_info('drafts')` shows all four `zernio_*` columns in both databases |
| 17 | The push code is deployed | ✓ VERIFIED (by inference) | The live app version was created 2026-09-16T08:35:03Z, after every push commit (`5b57a56`, `3d26e6a`) and after `b954dc5`. So production almost certainly carries the Approve screen **and Gap 1**. The bundle was not diffed. `c3172a6` (UI only) was committed 24-42 s after the two deploys, so whether it is in the bundle is unknown and irrelevant to the push |

**Score:** 14/17 verified · 2 failed · 1 needs human observation

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/zernio.ts` | Client: account list, draft creation, typed errors (≥120 lines) | ✓ VERIFIED | 267 lines. Exports `listLinkedInAccounts`, `createLinkedInDraft`, `buildDraftRequest`, `ZernioError`, `MAX_LINKEDIN_CHARS`, `LINKEDIN_PLATFORM`. No stubs. A fresh `x-request-id` per call. A 200 replay and a 409 are both handled |
| `test/zernio.test.ts` | Publish-safety pin (contains `isDraft`) | ✓ VERIFIED | 7 tests, all passing. Covers the object shape, the serialised form, the source-level field check and the source-level env check. See the mutation results below |
| `migrations/0006_push.sql` | Four push columns | ✓ VERIFIED | Four `ALTER TABLE drafts ADD COLUMN`, all nullable. Applied to local and remote D1 |
| `src/db.ts` | `recordPush`, `recordPushFailure`, `DraftView` widened, **imports nothing** | ✓ VERIFIED | No `import` or `require` anywhere in the file. `ZERNIO_ACCOUNT_ID_KEY`/`_LABEL_KEY` exported. `getRunView` projection includes the four columns (L658) |
| `src/zernio-routes.tsx` | `GET`/`POST /zernio` (≥90 lines) | ✓ VERIFIED | 251 lines. In the **gated** app, mounted at `index.tsx:50` after `requireAccess` (L30) and `csrf()` (L34). `src/public.tsx:57` mounts the same router with **no** gate (Gap 2) |
| `src/layout.tsx` | Zernio in nav | ✓ VERIFIED | `{ href: "/zernio", label: "Zernio" }` (L27) |
| `src/runs.tsx`: push route | `POST /runs/:id/drafts/:draftId/push` containing `createLinkedInDraft` | ✓ VERIFIED | L1664-1752. Nine guards in the plan's order, 409-with-id recorded as success, other errors recorded via `pushFailure` |
| `src/runs.tsx`: Approve screen push control | Button on an accepted draft; pushed / failed / pushable / hidden states | ⚠️ PARTIAL | Button, pushed state and hidden-on-rejected/undecided are present. **Failed state missing.** The button does not name the destination account |
| `src/runs.tsx`: `PushState`, `PushForm`, `DraftSection` | 05-04 Task 2 render components | ⚠️ ORPHANED | Defined, never rendered since `b954dc5`. The 05-04 SUMMARY still describes them as the live render ("a refused push renders amber with Zernio's own message and code, and the button comes back"), which has not been true since that commit |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/zernio.ts` | `https://zernio.com/api/v1` | `fetch`, `Authorization: Bearer <arg>` | ✓ WIRED | `/accounts?platform=linkedin&status=connected` (GET), `/posts` (POST) |
| `test/zernio.test.ts` | `buildDraftRequest` | asserts `isDraft === true` and the 3 fields absent | ✓ WIRED | 10 of 11 mutants killed |
| `src/db.ts recordPush` / `recordPushFailure` | `drafts` | `WHERE id = ?N AND run_id = ?M`, `meta.changes === 1` | ✓ WIRED | Both writers |
| `src/db.ts getRunView` | `drafts.zernio_*` | widened projection | ✓ WIRED | L658 |
| `src/zernio-routes.tsx` | `listLinkedInAccounts` | `c.env.ZERNIO_USER_TOKEN` as argument | ✓ WIRED | L194, L233 |
| `src/zernio-routes.tsx` | `settings` | `setSetting(ZERNIO_ACCOUNT_ID_KEY)` | ✓ WIRED | L246-248 |
| `src/index.tsx` (gated app only) | `zernio`, `runs` routers | `app.route("/", …)` behind `requireAccess` + `csrf` | ✓ WIRED | CSRF driven: a POST with no Origin header → 403, and a POST with a client-set Origin header → passes. CSRF is not authentication |
| push route | `createLinkedInDraft` | token + `zernio.account_id` from settings | ✓ WIRED | L1723 |
| push route | `recordPush` / `recordPushFailure` | returned id / `pushFailure(error)`; false → 404 | ✓ WIRED | L1724, L1736, L1746 |
| push route | `drafts.final_body` | decision-guarded | ✓ WIRED | L1696-1703 |
| Approve screen | push route | `<form action=/runs/:id/drafts/:draftId/push>` + `return_draft` | ✓ WIRED | L2166-2175. Success returns to the same draft via `returnTo` |
| Approve screen | `zernio_post_id` | render | ✓ WIRED | Driven |
| Approve screen | `zernio_error_code` / `zernio_error_message` | render | ✗ NOT WIRED | **Gap 1** |
| push route failure/duplicate | Approve screen | redirect | ✗ NOT WIRED | Goes to `/runs/:id`, which shows no push state |
| `src/public.tsx` (pipeflick-site) | `runs` (decision + push), `zernio`, `sources`, `settings`, `fireflies`, `health` | mounted after `demoIdentity` (sets "Guest") + `csrf` only | ⚠️ WIRED, and that is the problem | **Gap 2**: the push is not gated on this Worker |

### Requirements Coverage

| Requirement | Status | Blocking issue |
|-------------|--------|----------------|
| SCHED-01: App connects to Zernio with configured credentials | ✓ SATISFIED (code); live success inferred from the production settings row, never reported | None |
| SCHED-02: One-click push of an accepted draft as an unscheduled LinkedIn post | ? NEEDS HUMAN | Complete in code, and every guard except the missing-token one has been driven locally. Never run against Zernio. On the public site Worker, "user" is anyone with the URL (Gap 2) |
| SCHED-03: User sees whether the push succeeded; the draft records pushed state and Zernio id | ✗ BLOCKED | Success and the stored id are visible. A **failure is recorded but never shown** (Gap 1) |

`REQUIREMENTS.md` still lists all three as Pending. That is correct until the gaps close and the push is observed.

### Behaviour Driven Locally (this verification)

`wrangler dev` ran on a scratch D1 (`--persist-to` in the session scratchpad), seeded with two runs and seven drafts, one per state. Every POST was chosen to fail a guard **before** the Zernio call, so no outbound request was possible. The scratch state was deleted afterwards. The project's local D1 still has 0 runs and 0 drafts, and its two pre-existing `zernio.*` settings rows (dated 2026-09-15) were not touched.

| Case | Expected | Got |
|------|----------|-----|
| POST with no `Origin` header | 403 | 403 |
| Bad run id | 400 | 400 "Invalid run id" |
| Bad draft id | 400 | 400 "Invalid draft id" |
| No account chosen | 400 | 400 "No Zernio account chosen yet…" |
| Unknown draft id | 404 | 404 |
| Unknown run (valid UUID) | 404 | 404 |
| **Cross-run draft id** | 404, target row untouched | 404, row identical |
| Rejected draft | 400 | 400 "Only an accepted draft can go to Zernio…" |
| Undecided draft | 400 | 400 (same) |
| Whitespace-only `final_body` | 400 | 400 "no approved text to push" |
| Already pushed | 400 naming the id | 400 "already in Zernio as zp_seed_already" |
| 3001-char `final_body` | 400 naming both numbers | 400 "LinkedIn allows 3000 characters and this post is 3001…" |
| `drafts` table after all of the above | unchanged | **unchanged** (full before/after comparison, 7 rows) |
| Approve screen, rejected / undecided | no push control | none |
| Approve screen, pushed | id and "unscheduled", no button | as expected |
| **Approve screen, failed push** | error message and code, retry button | **button only, no message, no code** |
| Run screen `/runs/:id` | (post-b954dc5: no drafts) | no push state of any kind |
| Edit a pushed draft via the decision route | (unspecified) | 303. `final_body` changed, `zernio_post_id` kept. Page shows "Accepted with your edits" plus "In Zernio…" |
| Reject a pushed draft via the decision route | (unspecified) | 303. Page shows "Rejected" plus "In Zernio as an unscheduled draft" |

**Side result relevant to Gap 2:** every guard row above went through `csrf()` because curl set `Origin` to the dev host. That is direct evidence that `csrf()` stops browsers on other sites, not clients that choose their own headers.

**Not driven:** guard 3 (missing token; `.dev.vars` supplies it, verified by reading L1677-1680), and the 201 / 409 / 403 outcome branches. The plan's "local stand-in endpoint" technique does not work without a code change, because `ENDPOINT` is a module constant in `src/zernio.ts`. Those branches are verified by reading only.

### Publish-Safety Pin: Mutation Results

These mutants were run against a scratch copy of `src/zernio.ts` with the unmodified `test/zernio.test.ts`. The working tree's `src/zernio.ts` still matches HEAD.

| Mutant | Result |
|--------|--------|
| Baseline | 7/7 pass |
| `isDraft: false` | killed (2 failing) |
| `isDraft` removed | killed (2) |
| `publishNow: true` in `buildDraftRequest` | killed (3) |
| `scheduledFor: new Date()…` in `buildDraftRequest` | killed (3) |
| `queuedFromProfile` nested inside `platforms[]` | killed (3) |
| `publishNow: true` spread into the body in `createLinkedInDraft` only | killed (1, the source-level test) |
| `process.env` read | killed (1) |
| `c.env` mention (even in a comment) | killed (1) |
| `publishNow: <expression>` in `buildDraftRequest` | killed (2) |
| **`scheduledFor: when` (a variable) spread into the body in `createLinkedInDraft` only** | **SURVIVED (7/7 pass)** |

The survivor exists because the source-level regex only matches literal values (`true`, a string, or `new Date`). The shipped code has no such construct, so **the publishing ban holds today**. The pin is weaker than "by mutation" suggests for the fetch path, though.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/runs.tsx` | 651-827 | Orphaned components (`PushState`, `PushForm`, `DraftSection`) | 🛑 Blocker | The only failed-push renderer is dead code (Gap 1). It also makes a grep for "error rendered" look satisfied when it isn't |
| `src/runs.tsx` | 1740, 1750 | Failure and duplicate redirects ignore `returnTo` | 🛑 Blocker (part of Gap 1) | The user is sent to a screen with no push state |
| `src/public.tsx` | 50-58 | App routers mounted with no Access gate | 🛑 Blocker (Gap 2; owned by 06-07) | Anonymous accept and push into the real Zernio account; transcripts readable |
| `test/zernio.test.ts` | 92 | Source regex only matches literal values | ⚠️ Warning | Mutant with `scheduledFor: <variable>` survives. Suggested fix: strip comments, then assert the three names do not appear at all |
| `src/runs.tsx` | 2191-2197, 1529 | A pushed draft can still be edited (UI) or rejected (POST) | ⚠️ Warning | The approval record and the Zernio copy can diverge, e.g. "Rejected" beside "In Zernio". The app has no way to update or withdraw the Zernio copy, and the route refuses a re-push |
| `src/runs.tsx` | 2172-2173 | Push button does not name the destination account | ⚠️ Warning | 05-04 Task 2 required "as {label}". Only `/zernio` shows the target now |
| `src/runs.tsx` | 2165 | Send to Zernio offered on a >3000-char draft | ⚠️ Warning | The click lands on a bare `text/plain` 400. `PushForm`'s pre-check that prevented this is in the dead code |
| `src/runs.tsx` | 1274-1276 | `pushTarget` computed, never used | ⚠️ Warning | Two D1 reads per Run-page render, for nothing |
| `CLAUDE.md`, `README.md` | 21-23 / 32-34 | Public-site description contradicts `wrangler.site.example.jsonc` | ⚠️ Warning | Future work will trust the wrong safety claim (Gap 2) |
| `src/runs.tsx` | 1024 | RunControl says "the drafts are below" | ℹ️ Info | Stale since the drafts moved to the Approve screen |
| `src/runs.tsx` | 1707 / `src/db.ts` 851 | Check-then-act on "already pushed"; `recordPush` has no `AND zernio_post_id IS NULL` | ℹ️ Info | Two concurrent clicks could both reach Zernio. The backstop is Zernio's 24-hour content-hash 409, which is documented in the spec but never observed |
| `src/runs.tsx` | 1616-1618 | Generic failure text promises "this cannot create a second draft" | ℹ️ Info | Rests on that same unobserved 409. Currently never rendered anyway (Gap 1) |

No TODO, FIXME or placeholder text in any Phase 5 file. `npx tsc --noEmit` exits 0 and `vitest run` exits 0 (75/75).

### Verified in Codebase vs. Observed Live

| Claim | In codebase | Driven locally | Observed live |
|-------|-------------|----------------|---------------|
| Client cannot publish (`isDraft`, no publishing fields) | ✓ | 10/11 mutants killed | n/a (structural) |
| `/zernio` connection and account choice | ✓ | not driven (it calls real Zernio) | **Inferred only.** The production settings row was written 2026-09-15T15:21Z. Never reported as an observation |
| Push guards and cross-run 404 | ✓ | ✓ all except the missing-token guard | never |
| Pushed state and Zernio id rendered | ✓ | ✓ | never (0 pushed rows in production) |
| Failed push rendered | ✗ | ✗ confirmed absent | never |
| `POST /v1/posts`: 201 / 409 / 403 handling | ✓ by reading | not driven (no injection point) | **never; 0 push attempts in production D1** |
| Deployed | inferred (08:35Z, after all push commits) | — | `/health` unobserved for five deploys |
| Push is gated on the public site Worker | ✗ `public.tsx` has no gate (re-proven) | `csrf()` passes a client-set Origin (driven) | **Inferred live, not observed**: `main = src/public.tsx`, and the live version went up 08:35:21-23Z, 5 min after `7e7e0c1`. No request was made |

### Finding: the push is not gated on the public site Worker

Raised by the orchestrator and re-proven here, apart from the one item marked inferred. **This does not fail the push code.** It fails the claim that only the executive can make the push.

| Evidence | Status |
|----------|--------|
| `src/public.tsx:50-58` mounts `health`, `settings`, `sources`, `fireflies`, `zernio`, `runs` after `demoIdentity` (`c.set("email", "Guest")`, L41-44) and `csrf()`. No `requireAccess` | Re-proven (read) |
| The file's own header (L30-33): "Everything the app can do, to anyone with the URL … an accepted draft can be pushed to the connected Zernio account. It shares the production database" | Re-proven (read) |
| `csrf()` is not authentication: Hono 4.13.7 lets a form POST through when `Sec-Fetch-Site: same-origin` **or** `Origin` equals the request origin. Both are client-set headers | Re-proven (read `node_modules/hono/dist/middleware/csrf/index.js`, and driven with curl locally) |
| The decision route is mounted too, so an anonymous visitor can create the "accepted" precondition as well as press the push | Re-proven (read) |
| `POST /zernio` is reachable, so `zernio.account_id` can be changed anonymously. It is bounded: the route re-lists accounts and refuses any id the token does not own (`zernio-routes.tsx:241-244`) | Re-proven (read) |
| Guards 6-8 (accepted/edited only, `final_body` only, once per draft) and the publishing ban hold on that Worker too: the route code is identical | Re-proven (same router) |
| `wrangler.site.jsonc` (gitignored) and `wrangler.site.example.jsonc` both set `"main": "src/public.tsx"` for `pipeflick-site` | Re-proven (read the `name`/`main` lines only) |
| The live `pipeflick-site` version `736c88f0` (version created 08:35:21Z, deployment 08:35:23Z) went up 5 minutes after `7e7e0c1` (08:30:03Z), and it holds `ZERNIO_USER_TOKEN` and the production D1 binding | Re-proven (`wrangler deployments list`, `versions view`) |
| **The live site serves `public.tsx`** | **Inferred** from the two rows above. Not observed: no request was made to the public hostname, and version metadata does not name the entry point |
| CLAUDE.md (L21-23) and README.md (L32-34) say every non-landing route on the site hostname is 403'd by `requireAccess` | Re-proven: no longer true of the code |
| Known and scheduled: ROADMAP Phase 6 criterion 5, and 06-07 "Close the hole the demo opened" | Re-proven (read) |

**Worst case, if live:** anyone with the URL can accept a draft and push it as an **unscheduled draft** into the operator's real Zernio account, re-point the saved account at another account the same token owns, flip any decision (which corrupts the APPR-05 acceptance metric), read stored transcripts (a data-protection exposure, since they are the executive's own lines from meetings), and spend OpenAI credit. Nothing can be **published**.

### Human Verification Required

These are still needed after the two gaps are fixed and redeployed.

#### 1. The push itself (this is the whole phase)
**Test:** On the gated app, open `/zernio` and confirm your LinkedIn account is listed and selected. On `/runs/<id>/approve`, accept a draft (unchanged, which also answers 04-02's open CRLF question: the pill should read "Accepted, unchanged"). Press **Send to Zernio**. Then open Zernio.
**Expected:** The draft shows "In Zernio as an unscheduled draft · <id>". In Zernio the post sits under the right LinkedIn account with exactly the approved text, **not scheduled and not published**. Re-submitting from a stale tab is refused.
**Why human:** Nothing has ever called `POST /v1/posts`. It creates a real item in a real external account.

#### 2. Which bundle is live on `pipeflick-site`
**Test:** Unauthenticated `GET /runs` on the public hostname.
**Expected:** `403 Access required`. A `200` means Gap 2 is live: anyone can accept and push drafts, and read transcripts.
**Why human:** The hostname is not in the repo, and version metadata does not name the entry point.

#### 3. `/health`
**Test:** Open `/health` on the gated app.
**Expected:** Green, with all three secrets set.
**Why human:** Access redirects before the Worker runs. Unobserved for five deploys.

### Gaps Summary

**The publishing ban is solid, and the push path is wired correctly.** The Zernio client cannot build a publishing request, a mutation test protects that property (with one narrow escape, noted above), the token only ever arrives as an argument, `src/db.ts` still imports nothing, ownership is the WHERE clause, and every driveable guard returned its status with D1 left untouched. The 05-04 code as committed matched its plan.

**Gap 1 is a regression, not a 05-04 omission.** `b954dc5` rebuilt the Run and Approve screens the next morning. It removed `<DraftSection>`, which silently orphaned `PushState`, the one component that rendered a failed push, and the new Approve screen never picked that job up. The failure is still written to D1; nobody can see it. Combined with the failure redirect to `/runs/:id`, a push Zernio refuses now looks, from the executive's side, like a button that did nothing. That is exactly the "clear error" SCHED-03 and success criterion 3 ask for, so the criterion fails. The fix is small and local to `src/runs.tsx`. The reconstructed 05-04 SUMMARY describes the orphaned render as live and should not be trusted on this point.

**Gap 2 is a finding against the phase, not against the push code.** The push route, its guards and the publishing ban are the same on both Workers. What fails is who can reach them. `src/public.tsx` mounts the decision, push and `/zernio` routes with no gate, only `csrf()`, which is not authentication. So on the site Worker, "user clicks once on an accepted draft" means *anyone* accepts and anyone clicks. That the live site serves this file is **inferred** from its config and a deploy five minutes after the commit, not observed with a request. 06-07 already owns the fix. It is listed here because the exposure is probably current rather than future, and because CLAUDE.md and the README state the opposite of what the code does. **This report does not claim the push is gated. It is gated only on the `pipeflick` Worker.**

**What remains even with both gaps closed:** the push has never been seen working. Production has not recorded a single accepted draft, let alone a push. Until human check 1 is answered with an observation, SCHED-02 is complete in code and unproven in fact.

---

_Verified: 2026-09-16T12:13:21Z_
_Verifier: Claude (gsd-verifier)_
