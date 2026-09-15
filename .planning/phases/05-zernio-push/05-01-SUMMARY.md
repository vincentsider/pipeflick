---
phase: 05-zernio-push
plan: 01
subsystem: api
tags: [zernio, linkedin, http-client, publish-safety, vitest, compliance-boundary]

# Dependency graph
requires:
  - phase: 02-voice-capture
    provides: "src/fireflies.ts — the external-client shape this file copies: typed error with a machine-readable code, key as an argument, 20s timeout, nothing from the request in an error message"
  - phase: 03-drafting-engine
    provides: "test/prompts.test.ts — the pinned-by-test discipline (a load-bearing property asserted, including at source level, rather than described in prose)"
  - phase: 05-zernio-push
    provides: "DISCOVERY.md — every field name, status code and precedence rule here is read from Zernio's OpenAPI 3.1 spec, not from its prose docs"
provides:
  - "src/zernio.ts — the single Zernio boundary: account list, LinkedIn draft creation, ZernioError"
  - "buildDraftRequest — the pure request builder, the only place a publishable body could ever be constructed"
  - "MAX_LINKEDIN_CHARS (3000) and LINKEDIN_PLATFORM as named constants for the call sites"
  - "test/zernio.test.ts — the publish-safety pin, verified by three mutations"
affects: [05-02, 05-03, 05-04, any-future-scheduler-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publishing boundary: one module, token as an argument, no environment read anywhere in the file (grep-clean including comments)"
    - "Safety property asserted at both value and source level, so a body built outside the pure builder is still caught"
    - "Idempotency treated as success: an x-request-id replay (200) and a content-hash duplicate (409) both yield a post id"

key-files:
  created:
    - src/zernio.ts
    - test/zernio.test.ts
  modified: []

key-decisions:
  - "isDraft: true is sent explicitly, never inferred from the absence of the publishing fields"
  - "platforms is sent on a draft even though the spec allows omitting it — a draft with no target is not one click from scheduled"
  - "A 409 duplicate is a success-shaped error carrying details.existingPostId, not a failure"
  - "sk_ is scrubbed inside src/zernio.ts; scrubKey in src/runs.tsx matches sk- and does not cover it"
  - "No grep hit for an environment read in this file, comments included, so the rule is mechanically checkable"
  - "The fetch paths are deliberately untested, matching src/fireflies.ts and src/openai.ts"

patterns-established:
  - "Mutation-verified test: a safety test is only proven by making the property false and watching it fail (three mutations run here, including one nested where a key check would miss it)"
  - "Constants at the top, named, never inline at a call site (03-01's rule) — ENDPOINT, TIMEOUT_MS, MAX_LINKEDIN_CHARS, LINKEDIN_PLATFORM"

# Metrics
duration: ~4min
completed: 2026-09-15
---

# Phase 05 Plan 01: Zernio Client Summary

**A Zernio HTTP client whose only reachable request body is a LinkedIn draft, with `isDraft: true` sent explicitly and the three publishing fields pinned absent by a test that was proven by breaking it three ways.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-15T14:44Z
- **Completed:** 2026-09-15T14:48Z
- **Tasks:** 2
- **Files modified:** 2 created, 0 modified

## Accomplishments

- `src/zernio.ts` (265 lines) is the project's publishing boundary, in the same relation to CLAUDE.md's auto-publishing ban that `src/prompts.ts` has to the Jersey/JFSC constraint: one file, no environment read, no key or post text in any error.
- `buildDraftRequest` is pure and returns exactly `{ content, isDraft: true, platforms: [{ platform, accountId }] }`. Nothing is added to it inside `createLinkedInDraft`.
- Both of Zernio's idempotency layers are handled as success: a 200 `x-request-id` replay returns `existingPost`, and a 409 content-hash duplicate throws a `ZernioError` carrying `details.existingPostId` so the caller can say "already in Zernio" rather than "failed".
- The safety property was **verified by mutation, not by assertion alone** — see Issues Encountered.
- 61 → 68 tests; `npm run check` 0.

## Task Commits

1. **Task 1: Zernio client with a draft-only request builder** - `dfd1d11` (feat)
2. **Task 2: Pin the publish-safety property with a test** - `0980cf8` (test)

**Plan metadata:** see the `docs(05-01)` commit following this summary.

## Files Created/Modified

- `src/zernio.ts` - Zernio API client. Exports `ZernioError`, `ZernioAccount`, `ZernioDraft`, `buildDraftRequest`, `listLinkedInAccounts`, `createLinkedInDraft`, `MAX_LINKEDIN_CHARS`, `LINKEDIN_PLATFORM`.
- `test/zernio.test.ts` - Seven assertions on the request body and the source file. Not a coverage test; its header says so, because it is small and deletable-looking.

## Decisions Made

- **`isDraft: true` is sent explicitly, and that is the whole plan.** The spec offers two routes to a draft — set the flag, or omit `publishNow` / `scheduledFor` / `queuedFromProfile` entirely. Absence is a property a future refactor destroys silently while adding an unrelated feature; an explicit flag survives it, because the spec's precedence rule says `isDraft` wins over both publishing fields.
- **`platforms` is sent even though a draft may omit it.** A draft with no target account is one click from being scheduled inside Zernio's own UI. Naming the account is what makes "saved as a draft" mean what SCHED-02 promises.
- **A 409 is not a failure.** Zernio hashes `(platform, accountId, content)` over 24 hours and answers 409 with `details.existingPostId`. Pressing a push button twice therefore cannot create two LinkedIn drafts, and the second press has an id to show. `ZernioError` gained a `details` field purely to carry it; code is the synthetic `duplicate`.
- **`sk_`, not `sk-`, and the resemblance is a trap.** `scrubKey` in `src/runs.tsx` strips OpenAI-shaped `sk-` fragments and would pass a Zernio key straight through. `src/zernio.ts` scrubs `/sk_[A-Za-z0-9_*-]+/g` on every Zernio-supplied message before it leaves the module, so no caller has to know which shape it is holding.
- **A grep for an environment read in `src/zernio.ts` returns nothing, comments included.** The plan asked both for a comment naming `c.env.ZERNIO_USER_TOKEN` as routes-only and for that grep to be empty. The comment was reworded to state the rule without the literal token, because a mechanically checkable rule beats a well-phrased one — 05-04's verification can run the grep and read the answer.
- **Length is the caller's check.** `MAX_LINKEDIN_CHARS` is exported and the client does not enforce it. `MAX_DECISION_BODY_CHARS` in `src/runs.tsx` is 5000, so an accepted draft can legally sit in D1 at a length Zernio rejects; checking before the request saves a round trip, and truncating inside the client would publish text the executive never approved.
- **The fetch paths are not tested**, matching `src/fireflies.ts` and `src/openai.ts`. Pure logic is pinned; network calls are verified by driving the real thing at 05-04's checkpoint.
- **`dryRun` and `timezone` are absent by decision, not oversight.** `dryRun` is TikTok-only (a body with no `tiktok` entry is rejected 400), and `timezone` only interprets a schedule time this client never sends. Both are named in comments so nobody re-reaches for them.

## Deviations from Plan

None - plan executed exactly as written.

One wording change inside Task 1's own instructions: the plan's action text asked for a comment containing `c.env.ZERNIO_USER_TOKEN` while its verify block required `grep -n "c.env\|process.env" src/zernio.ts` to return nothing. The two cannot both hold. The rule is stated without the literal token, so the verification is the one that passes — recorded above as a decision rather than a deviation, since no behaviour differs from what the plan describes.

## Issues Encountered

**The test was proved, not assumed.** A test asserting a field is absent passes trivially against a file that never had it, so three mutations were applied to `src/zernio.ts` and reverted, each confirmed SHA-identical afterwards (`git diff --stat` empty):

| Mutation | Failures | What it proves |
|---|---|---|
| Delete `isDraft: true` | 2 | The draft flag is required, not incidental |
| Add `publishNow: true` beside it | 3 | A refactor adding a publishing field is caught at value, string and source level |
| Nest `scheduledFor` inside `platforms[]` | 3 | **The one a key-only check would have missed** — caught by the serialised-body assertion and the source scan |

The third is the reason the plan asked for a `JSON.stringify` assertion as well as `not.toHaveProperty`, and it earned its place.

`src/db.ts` shows as modified in the working tree throughout: that is 05-02 running in parallel in the same wave. It was never read into any commit here — both commits stage a single file by name.

## User Setup Required

None in this plan. `ZERNIO_USER_TOKEN` must hold a Zernio **API key** (`sk_` + 64 hex) and Vincent must have connected LinkedIn in the Zernio dashboard, but both are 05-03's `user_setup`, and `listLinkedInAccounts` is the empirical test of both.

## Next Phase Readiness

**Ready for 05-03 and 05-04.** The call sites they own now have: a connection check (`listLinkedInAccounts`, which is also the answer to "is the API available on Vincent's plan"), a create call, a typed error with a code to branch on, and the length constant to check before spending a request.

**Carried forward, unresolved:**

- **Nothing in this file has ever reached Zernio.** No network path has run — not once, not against a bad token. `listLinkedInAccounts` throwing 401 on a bad key, the 200 replay path, and the 409 duplicate path are all read from the OpenAPI spec and implemented, never observed. 05-04's checkpoint is where that happens, and this project's standing record is that the last two checkpoints were approved with no observations reported. This one cannot be: it is the first contact with a service that can publish.
- The 429 path is thrown as a plain `ZernioError` with code `http_429`. Zernio sends `X-RateLimit-Remaining` / `X-RateLimit-Reset` on every response and the client reads neither. Fine for one user pushing a handful of posts; if a caller ever needs to pause, that is where the number lives.
- `GET /v1/posts/{postId}` (confirm a draft landed) is not implemented. Nothing needs it yet.

---
*Phase: 05-zernio-push*
*Completed: 2026-09-15*
