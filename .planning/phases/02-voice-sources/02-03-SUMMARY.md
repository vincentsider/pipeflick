---
phase: 02-voice-sources
plan: 03
subsystem: api
tags: [fireflies, graphql, fetch, hono, hono-jsx, d1, cloudflare-workers, data-protection]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Hono Worker behind Cloudflare Access, FIREFLIES_API_KEY Worker secret, /health secret-presence check, Layout"
  - phase: 02-voice-sources (02-01)
    provides: "src/speaker-filter.ts — keepSpeakerLines, countBySpeaker, matchSpeaker, UNKNOWN_SPEAKER"
  - phase: 02-voice-sources (02-02)
    provides: "transcripts table (migration 0002), upsertTranscript, SPEAKER_NAME_KEY, /sources views, csrf()"
provides:
  - "src/fireflies.ts — typed GraphQL client (listMeetings, fetchTranscript, FirefliesError, PAGE_SIZE)"
  - "GET /fireflies — connection check + one page of meetings in a single API request, with skip paging"
  - "GET /fireflies/:id/import — speaker preview with line counts and a per-import override"
  - "POST /fireflies/:id/import — filtered write of only the chosen speaker's lines, then redirect to the stored transcript"
  - "First real executive data in D1, human-verified as containing no other participant's words"
affects: [03-drafting, 04-approval, voice-ingestion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "External API clients take credentials as arguments and never read env, log, or echo request bodies"
    - "One GraphQL request per page view; the connection check rides along with the list query (rate-limit budget)"
    - "Application errors can arrive with HTTP 200 (errors[] array) — check both status and body"
    - "Two-step import: preview then re-fetch on confirm, so third-party text never round-trips through the browser"
    - "Fail closed on ambiguity: an unmatchable speaker label is shown but not selectable"

key-files:
  created:
    - src/fireflies.ts
    - src/fireflies-routes.tsx
  modified:
    - src/index.tsx
    - src/layout.tsx

key-decisions:
  - "FirefliesError carries a code (Fireflies code, else http_<status>) so pages can distinguish object_not_found (404) from every other failure (502)"
  - "The confirm step re-fetches the transcript instead of posting sentences from the browser: other speakers' text never leaves the Worker"
  - "Speaker options are marked importable only when keepSpeakerLines actually returns lines, so the UNKNOWN_SPEAKER group cannot be imported"
  - "matchSpeaker is given only the importable labels, so preselection can never land on an unusable option"
  - "Zero lines for the chosen speaker re-renders the preview with a 422 and writes nothing"
  - "A missing FIREFLIES_API_KEY renders a 500 pointing at /health and makes no API request"

patterns-established:
  - "Rate-limit discipline is documented at the top of the client module, not just in planning docs"
  - "Sentence arrays are passed only to countBySpeaker/keepSpeakerLines — never to storage, logging or templates"
  - "Error pages render Fireflies' own message plus its code; never a stack, never a key"

# Metrics
duration: 20min
completed: 2026-09-15
---

# Phase 02 Plan 03: Fireflies Import Summary

**Fireflies GraphQL client plus a two-step import UI that shows every speaker with line counts and writes only the chosen speaker's lines to D1 — the first real executive data in the system, human-verified as clean.**

## Performance

- **Duration:** ~20 min wall (~8 min agent time; the rest was the human verification checkpoint)
- **Started:** 2026-09-15T06:48:25Z
- **Completed:** 2026-09-15T07:08:00Z
- **Tasks:** 3 (2 automated, 1 human-verify checkpoint)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `src/fireflies.ts` speaks the Fireflies GraphQL API with one request per page view: the connection check (`user`) and the meeting page (`transcripts(limit: 50, skip)`) travel in the same query, which matters because the Free plan allows 50 requests a day.
- Fireflies' habit of returning HTTP 200 with a populated `errors[]` array is handled: both paths raise `FirefliesError` carrying the Fireflies code, and no message can contain the API key, the request body or transcript text.
- `/fireflies` renders the connection line, a meeting table (title, date, duration, Import link) and skip-based paging; failures render Fireflies' own message and code at 502 with no list and no stack.
- `/fireflies/:id/import` previews the speakers with line counts, preselects the configured name via `matchSpeaker`, and lets the user override per import — the VOICE-03 requirement, since Fireflies labels are often "Speaker 1".
- `POST /fireflies/:id/import` re-fetches the transcript, runs `keepSpeakerLines` and stores only those lines; the user confirmed on a real meeting that every stored line is theirs.
- Deployed and gated: anonymous `GET /fireflies` returns 302, as do `/sources` and `/health.json`.

## Task Commits

1. **Task 1: Fireflies GraphQL client** — `ee7c392` (feat)
2. **Task 2: Import routes, mount, deploy** — `294a2bc` (feat)
3. **Task 3: Human verification of a real import** — checkpoint, approved by the user; no commit

**Deployed version:** `f20df031-5ab9-413d-abbe-07c7d1b7be84`

## Files Created/Modified

- `src/fireflies.ts` — endpoint, timeout, `FirefliesError`, `firefliesQuery`, `listMeetings`, `fetchTranscript`, `Meeting`/`FetchedTranscript` types, `PAGE_SIZE`
- `src/fireflies-routes.tsx` — the three routes, the speaker preview form, shared error page, id and skip validation
- `src/index.tsx` — mounts the router behind `requireAccess` + `csrf()`, home page links Fireflies
- `src/layout.tsx` — two CSS rules (see Deviations)

## Decisions Made

- **The client is credential-agnostic.** It takes the key as a string, so it never reads `c.env` and stays trivially testable; the routes are the only place that touches the secret, and a missing key short-circuits to a 500 pointing at `/health` without making a request.
- **Error code drives the status.** `object_not_found` becomes a 404 (the user's link is wrong), everything else a 502 (Fireflies is unhappy). The user sees Fireflies' own wording plus the code, which is what makes a rate-limit or plan error diagnosable without logs.
- **Confirm re-fetches rather than trusting the browser.** Posting the sentences back would put every participant's words in the user's browser history, proxies and POST body. One extra API request buys the guarantee that third-party text stays inside the Worker.
- **Importability is computed, not assumed.** Each speaker option is offered only when `keepSpeakerLines` actually returns lines for that label. This disables the `UNKNOWN_SPEAKER` group (lines Fireflies never attributed) and would equally catch any other label the filter cannot match — fail closed rather than silently store nothing.
- **Preselection sees only importable labels**, so `matchSpeaker` can never preselect an option the user cannot submit.
- **Zero kept lines is a 422 re-render, not an empty row.** Nothing is written when the filter finds nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two CSS rules added to `src/layout.tsx`**
- **Found during:** Task 2 (import routes)
- **Issue:** The new pages needed an error banner and a speaker radio list. The only existing banner class is `.notice`, which is green — an import failure rendered in a success-green box misreads at a glance. `src/layout.tsx` was not in the plan's `files_modified`.
- **Fix:** Added `.notice.error` (red tint and left border) and `.speakers` list spacing to the existing CSS block. No markup, route or behaviour change anywhere else.
- **Files modified:** `src/layout.tsx`
- **Verification:** `tsc --noEmit` exits 0; pages render; every other view is byte-identical in behaviour.
- **Committed in:** `294a2bc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking/presentational)
**Impact on plan:** Cosmetic only; the file was outside the declared `files_modified` but the change is three lines of CSS in an existing block. No scope creep.

## Issues Encountered

None. The first live call connected on the first attempt and returned a full page of 50 meetings with a working "Next 50" link.

## Verification Evidence

All evidence below is deliberately free of meeting titles, participant identities and transcript text.

- `npx tsc --noEmit` exits 0; `vitest run` 10/10 pass; `git grep -n "console\." src/` returns nothing.
- `grep -c "api.fireflies.ai/graphql" src/fireflies.ts` = 1; no `console.` in either new file.
- `wrangler d1 migrations list pipeflick-db --remote` → "No migrations to apply" (0002 from 02-02 confirmed present; nothing re-run).
- Local: `/health.json` 200 with `FIREFLIES_API_KEY` reported present; `GET /fireflies` 200 containing the "Connected as" marker, 50 Import links and a `skip=50` paging link; `GET /fireflies/bad%20id/import` → 400. The rendered page was matched for those markers only and deleted immediately.
- Deployed: anonymous `GET /fireflies` → **302**, `/sources` → 302, `/health.json` → 302 (Access gate intact).
- Human checkpoint: the user ran the full verification — settings, connection, speaker preview with override, confirmed import, stored transcript view, `/sources` listing — and approved with no caveats and no reported issues.

**API budget used during execution:** one live Fireflies request by the executor (the local connection check), plus the user's own requests during verification. The client costs 1 request per list page and 2 per import (preview + confirm).

## User Setup Required

None new. Existing setup still applies: `FIREFLIES_API_KEY` must be present both in `.dev.vars` (local) and as a Worker secret (remote); `/health` reports presence only.

**Fireflies plan tier: not confirmed.** The user did not state a tier, so the Free-plan budget of 50 requests/day remains the working assumption until told otherwise. Everything is built for that ceiling; a Pro/Business tier only widens the margin.

**Access policy:** the user confirmed the checkpoint, including the Access policy step; whether it required a change was not reported.

## Next Phase Readiness

**Ready for Phase 3 (drafting):**
- Real, compliant source material now exists in D1: transcript bodies containing only the executive's own lines, plus pasted voice samples from 02-02.
- `getTranscript`/`listTranscripts` and `listVoiceSamples` are the read path drafting needs; `TranscriptSummary` omits `body` so list views never pull transcript text.
- Re-import is idempotent (Fireflies id is the primary key), so a mis-selected speaker is corrected by importing again.

**Concerns carried forward:**
- Fireflies remains US-hosted; the Jersey/GDPR transfer question stated in CLAUDE.md is unchanged by this plan. Only the executive's own lines are stored locally, which is the mitigation, not a resolution.
- The 50/day Free-plan assumption is unconfirmed. Any future feature that polls Fireflies (webhooks, auto-sync) must re-check the tier first.
- `/fireflies` holds one page of 50 meetings; there is no search or date filter, only skip paging. Fine at pilot scale.
- Phase 3 still needs the pre-existing research item: Worker request-time limits versus several OpenAI calls in one request.

---
*Phase: 02-voice-sources*
*Completed: 2026-09-15*
