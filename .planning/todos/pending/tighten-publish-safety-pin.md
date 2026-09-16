# Tighten the publish-safety pin in test/zernio.test.ts

**Created:** 2026-09-16 (05-VERIFICATION, mutation pass)
**Priority:** Medium. The shipped code is clean, but this test is the only automated guard on the auto-publishing ban
**Where:** `test/zernio.test.ts`, the source-level scan of `src/zernio.ts`

## What

The Phase 5 verifier mutated a scratch copy of `src/zernio.ts` ten ways, and the tests caught nine. The one that got through was a publishing field with a **variable** value (for example `scheduledFor: when`) added in the send path only, rather than in `buildDraftRequest`. The source scan only matches literal values, and the body assertions only exercise `buildDraftRequest`. So a refactor that builds the request body somewhere else could add a publishing field and still pass the tests.

## Fix

- Make the source scan match the field **names** (`publishNow`, `scheduledFor`, `queuedFromProfile`) whatever value follows, outside comments.
- And/or assert on the body actually passed to `fetch` by `createLinkedInDraft`, using a stubbed `fetch`, not only on `buildDraftRequest`'s return value.

Re-prove it with the same mutation, then restore `src/zernio.ts` SHA-identical, as 05-01 did.
