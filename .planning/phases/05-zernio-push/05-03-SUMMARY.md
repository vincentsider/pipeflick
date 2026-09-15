---
phase: 05-zernio-push
plan: 03
subsystem: ui
tags: [zernio, linkedin, settings, connection-check, hono-jsx, first-contact]

# Dependency graph
requires:
  - phase: 05-zernio-push
    provides: "src/zernio.ts — listLinkedInAccounts and ZernioError; this page is the first thing that ever called it"
  - phase: 02-voice-capture
    provides: "src/fireflies-routes.tsx — the connection-page shape (missing key 500 pointing at /health, provider error 502 with its own message and code) and the settings-key + POST → 303 ?saved=1 pattern"
provides:
  - "GET /zernio — the connection check and the account list, one request"
  - "POST /zernio — the LinkedIn account choice, validated against the ids Zernio just listed"
  - "settings zernio.account_id and zernio.account_label for 05-04 to read"
  - "The empirical answer to the roadmap's open question: the Zernio API works on this plan"
affects: [05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Connection check = the list call: Zernio has no /me, so GET /v1/accounts proves the key and returns the id a push needs"
    - "A submitted id is validated against the provider's own list, never trusted from the form"
    - "The human label is stored beside the id so a later page can name the target without spending a provider request"

key-files:
  created:
    - src/zernio-routes.tsx
  modified:
    - src/db.ts
    - src/index.tsx
    - src/layout.tsx

key-decisions:
  - "Zero connected accounts is a warn, not an error — it is the expected first-run state"
  - "An inactive account is listed and selectable, with a reconnect hint; hiding it would lose the account the user is looking for"
  - "A 401 gets its own extra paragraph naming .dev.vars and npm run secrets:push"
  - "The stored-but-no-longer-listed account gets its own warn, because a push to a stale id is a Zernio 403 at the worst moment"
  - "The two settings keys live in db.ts's Phase 5 section rather than beside SPEAKER_NAME_KEY"

patterns-established:
  - "Proving a request did NOT happen: count fetch spans to the provider host through wrangler's local observability API before and after the request (7 → 7), rather than reasoning from the code"
  - "Stand-in-endpoint rendering: point the client's ENDPOINT constant at a local server that serves the states the real API will not produce on demand, then restore the file SHA-identical"

# Metrics
duration: ~16min
completed: 2026-09-15
---

# Phase 05 Plan 03: Zernio Connection Page Summary

**`/zernio` lists the executive's connected LinkedIn account and stores the one a push will use — and loading it made the project's first ever Zernio request, which answered the roadmap's open plan question: the API works on this plan.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-09-15T14:46Z
- **Completed:** 2026-09-15T15:02Z
- **Tasks:** 2
- **Files modified:** 1 created, 3 modified

## Accomplishments

- **First contact with Zernio.** `GET https://zernio.com/api/v1/accounts?platform=linkedin&status=connected` returned **200** with exactly one connected LinkedIn account — `Vincent Sider`, id `YOUR_ZERNIO_ACCOUNT_ID`, `isActive: true`. Both of the plan's `user_setup` prerequisites were already in place, so no checkpoint was needed: the LinkedIn account is connected inside Zernio, and `ZERNIO_USER_TOKEN` holds a real, working Zernio API key (`sk_` + 64 hex — shape checked without printing the value, then proved by the 200).
- **The roadmap's open question is closed empirically.** "Is the API available on Vincent's plan?" — yes, for the account-listing call on the free tier with one connected account. No 402, no `free_tier_exceeded`. `POST /v1/posts` is still unexercised; that is 05-04.
- `src/zernio-routes.tsx` (251 lines) renders four distinct states and all four were **observed, not reasoned about** (see Verification).
- The account choice is stored as two settings rows (`zernio.account_id`, `zernio.account_label`) and the page preselects it on the next load.
- `npm run check` exits 0; `npm test` is 68/68, the count 05-01 left it at (this plan adds no tests — it is routes and rendering, and the project's convention since `src/fireflies-routes.tsx` is that pages are driven, not unit-tested).

## Task Commits

1. **Task 1: The /zernio connection page and account selection** - `0273042` (feat)
2. **Task 2: Mount the router and put Zernio in the nav** - `31a2eff` (feat)

**Plan metadata:** see the `docs(05-03)` commit following this summary.

## Files Created/Modified

- `src/zernio-routes.tsx` - `GET /zernio` (connection check + account list) and `POST /zernio` (account choice). The only file that reads the `ZERNIO_USER_TOKEN` binding.
- `src/db.ts` - `ZERNIO_ACCOUNT_ID_KEY` and `ZERNIO_ACCOUNT_LABEL_KEY`. No helper changed; `getSetting`/`setSetting` already do the work, and the file still imports nothing.
- `src/index.tsx` - mounts the router after the app-wide `requireAccess` and `csrf()`; Zernio added to the home link row.
- `src/layout.tsx` - `Zernio` in `NAV`, between Fireflies and Settings.

## Decisions Made

- **The connection check is the list call, and one request answers both questions.** Zernio has no `/me`; `GET /v1/accounts` proves the key works *and* returns the `accountId` a push needs. Same shape as `/fireflies`, which fetches the key owner and the meeting page together.
- **Zero accounts is a `.notice.warn`, not an error.** It is the expected first-run state — the key works, there is simply nowhere to push yet — and rendering it red would send someone hunting for a broken key that is fine. The dashboard step is named in the notice.
- **A 401 gets a second paragraph of its own.** "Zernio rejected it, so the value is not a valid Zernio API key; a key is `sk_` + 64 hex, created in the Zernio dashboard; fix `.dev.vars` and run `npm run secrets:push`." DISCOVERY.md flagged this as a genuinely likely state (the secret was *named* for Zernio at 01-03, but what it held had never been exercised), and that paragraph is the difference between ten minutes and an afternoon.
- **The form is not evidence.** `POST /zernio` shape-guards the id (`/^[a-f0-9]{24}$/i` → plain-text 400 before D1), then re-lists the accounts and refuses any id Zernio does not return. Observed: the previously stored real id was rejected 400 while a stand-in listed a different account. Trusting the form would let a stale id be stored and fail much later, on a push, as a Zernio 403.
- **The label is stored, not recomputed.** `zernio.account_label` exists so 05-04's run page can say which account a push targets without spending a Zernio request per render — the same instinct as 03-06 storing the coverage counts.
- **An inactive account is listed, selectable, and labelled.** Hiding it would silently lose the account the user came to find; the hint says to reconnect it in Zernio.
- **The two settings keys live in `db.ts`'s Phase 5 section, not literally beside `SPEAKER_NAME_KEY`.** That constant sits under the "Phase 2 sources (migration 0002)" header, and filing a Zernio key under it would be wrong in the one place people go looking. The comment points at `SPEAKER_NAME_KEY` as the pattern.
- **Nothing was deployed.** 05-04 owns the deploy, so `/zernio` exists locally and not on production — the same deliberate arrangement 05-02 left the schema in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The account line rendered "Vincent Sider (@Vincent Sider)"**

- **Found during:** Task 1, on the first real account list
- **Issue:** Zernio's LinkedIn `username` is the person's name, not a handle, so it is identical to `displayName` on the real account. An unconditional `(@username)` suffix reads as a rendering fault.
- **Fix:** `accountLine` shows the handle only when it differs from the label. Verified both ways — the real account renders `Vincent Sider`, the stand-in renders `Stand-in Account (@stand-in-handle)`.
- **Files modified:** `src/zernio-routes.tsx`
- **Commit:** `0273042`

**2. [Rule 2 - Missing Critical] A stored account that is no longer connected rendered as nothing at all**

- **Found during:** Task 1
- **Issue:** If the account is disconnected and reconnected in Zernio, its `_id` changes. The stored id would then quietly match nothing, no radio would be preselected, and 05-04 would push to an id this key no longer owns — a Zernio 403 at the worst possible moment, with nothing on the page having warned anyone.
- **Fix:** when a stored id is absent from the returned list, a `.notice.warn` names the saved label and says to choose again. Observed against the stand-in.
- **Files modified:** `src/zernio-routes.tsx`
- **Commit:** `0273042`

### Additions

**3. The home page's own link row gained Zernio** (`src/index.tsx`, `31a2eff`). The plan only asked for `NAV`; leaving the two lists disagreeing is the kind of small inconsistency that reads as a half-finished feature.

## Issues Encountered

**Three of the four states cannot be produced on demand by the real API**, so they were driven against a local stand-in server (`/empty`, `/inactive`, `/down`) by pointing `ENDPOINT` in `src/zernio.ts` at it. The file was restored afterwards and confirmed **SHA-identical** (`f2f627323fab50a486e2362b4c09a738e03affa6` before and after, `git diff` empty), the same discipline 05-01 used for its mutation testing. `grep "c.env\|process.env" src/zernio.ts` is still empty.

**"No request was made" was measured, not argued.** wrangler's local observability API records a span per outbound `fetch` with `url.full`. The count of spans to `zernio.com` was **7 before and 7 after** a `GET /zernio` and a `POST /zernio` with the token line removed from `.dev.vars` — both returned 500 without touching the network. The same table is what confirmed the real call went to `https://zernio.com/api/v1/accounts?platform=linkedin&status=connected` and that the `Authorization` header is not captured in the trace.

**`.dev.vars` was backed up, edited twice (invalid key, then no key) and restored SHA-identical** (`<sha elided>` throughout). The backup copy was deleted from the scratchpad afterwards. `wrangler dev` does **not** hot-reload `.dev.vars` — the server was restarted for each variant, which cost one misleading render before it was noticed.

## Verification

All four plan states plus three extra paths, observed:

| State | How produced | Result |
|---|---|---|
| No key | `ZERNIO_USER_TOKEN` line removed | **500**, "ZERNIO_USER_TOKEN is not set (see /health)", **0 outbound requests** (span count 7 → 7), same for the POST |
| Bad key | `sk_` + 64 hex of `deadbeef` | **502**, "Zernio connection failed: Unauthorized (code http_401)" plus the fix paragraph; no stack, no hex run of 20+ chars anywhere in the HTML |
| Connected, no accounts | stand-in `{"accounts": []}` | **200**, `.notice` "Connected to Zernio." + `.notice.warn` naming Accounts → Connect → LinkedIn |
| Connected, with accounts | **the real Zernio API** | **200**, "Connected to Zernio — 1 LinkedIn account on this key.", the account listed with a radio |
| Inactive account | stand-in `isActive: false` | listed and selectable, with the reconnect hint |
| Stale stored id | stand-in listing a different account | `.notice.warn` naming the saved label |
| Zernio outage | stand-in 503 | **502**, "Service temporarily unavailable (code http_503)" |

POST paths: bad shape → 400 `Invalid account id`; missing field → 400; well-formed unknown id → 400 `That account is not connected to this Zernio key`; valid → **303 → /zernio?saved=1**, both settings rows written, the flash and the preselected radio observed on the reload; **no `Origin` header → 403** from the app-wide `csrf()`. Nav link present on `/`, `/sources`, `/runs`, `/fireflies`, `/zernio`, `/health`.

Local D1 was left holding the real account id and label — this is real configuration, not seed data, so unlike previous plans nothing was deleted afterwards.

## Observed facts about the Zernio API (previously spec-only)

- A bad key returns **401** with body `{"error": "Unauthorized"}` and **no machine-readable `code`**, so `toZernioError`'s `http_<status>` fallback is what renders. The spec-derived mapping in `src/zernio.ts` is correct on this path — now seen, not assumed.
- The account list for a single connected LinkedIn account comes back in well under a second (a cold call took ~3.3s once, subsequent ones ~200ms).
- `_id` is a 24-character hex ObjectId exactly as DISCOVERY.md read it, so the route's shape guard is right.
- `username` for LinkedIn is a display name, not a handle.

## User Setup Required

None outstanding. Both `user_setup` items in the plan were already satisfied and are now **verified rather than assumed**: LinkedIn is connected inside Zernio, and `ZERNIO_USER_TOKEN` in `.dev.vars` holds a working Zernio API key.

**One thing this plan could not check:** whether the **Worker secret** on production holds that same working value. `/health` reports presence only, and nothing here was deployed. The first load of `/zernio` on production is that check, and it belongs to 05-04.

## Next Phase Readiness

**Ready for 05-04.** It now has everything it needs: a working key, a proven account id in `settings` (`zernio.account_id` = `YOUR_ZERNIO_ACCOUNT_ID`), `createLinkedInDraft`, the four push columns from 05-02, and `MAX_LINKEDIN_CHARS` to check a draft's length against before spending the request.

**Carried forward, unresolved:**

- **`POST /v1/posts` has still never been called.** This plan exercised one GET. The 201 create, the 200 `x-request-id` replay, the 409 duplicate and every 403 code are still implemented-from-spec and unobserved — and that is the call that can put text on a real LinkedIn profile. 05-04's checkpoint is first contact with it. The 401 path being right on the first try is evidence the spec was read correctly; it is not evidence about the write path.
- The push flow will need the account label on the run page (stored, unrendered so far) and should handle the stored-id-no-longer-valid case the same way this page does: a Zernio 403 with no `code` means the account id does not belong to this key.
- Production does not have `/zernio` at all yet. Remote code is still version `734bc0e6` (Phase 4), while remote D1 carries migration 0006. 05-04's deploy closes both gaps at once.
- Everything still outstanding from Phase 3 and Phase 4 remains outstanding: `/health` unobserved across three deploys, no decision ever written to production D1, the grounding panel never seen against a real draft, DRAFT-04 never exercised end to end.

---
*Phase: 05-zernio-push*
*Completed: 2026-09-15*
