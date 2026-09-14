# Phase 2 Discovery: Voice Sources

**Date:** 2026-09-15
**Depth:** Level 2 (standard) — external API (Fireflies GraphQL), first test framework
**Sources:** docs.fireflies.ai (authorization, limits, errors, `transcripts` and `transcript` and `user` queries, Transcript / Sentence / Speaker schemas), Fireflies knowledge base on speaker labels, Cloudflare Workers vitest docs, npm registry (versions checked 2026-09-15). No live call was made to the Fireflies API during planning; the first live calls happen in Plan 02-03 against Vincent's own account.

## Fireflies API (verified from docs)

| Item | Fact |
|------|------|
| Endpoint | `POST https://api.fireflies.ai/graphql`, body `{ "query": "...", "variables": {...} }` |
| Auth | `Authorization: Bearer <FIREFLIES_API_KEY>`, `Content-Type: application/json`. Key already exists as the Worker secret `FIREFLIES_API_KEY` (Phase 1) |
| Rate limits | Free 50 requests/day, Pro 500/day, Business 60/min. Design every page for **one** GraphQL request; the list page combines the connection check and the list in a single query |
| Errors | HTTP may be 200 with an `errors[]` array: `{ message, code, friendly, extensions: { code, status, helpUrls } }`. Known codes: `object_not_found` (bad or inaccessible transcript id), `paid_required`, invalid API key, too many requests. Surface `message` + `code` to the user; never surface the key |
| `user` query | `user { name email num_transcripts }` — with no `id` argument returns the API key owner. Used as the connection check (VOICE-01) |
| `transcripts` query | Arguments: `limit` (max 50), `skip` (offset), `fromDate`/`toDate` (ISO), `mine`, `host_email`, `participants`. Do not pass `mine`; the default returns every meeting the key owner can see, sorted newest first. Fields used: `id title date duration organizer_email` |
| `transcript(id:)` query | Fields used: `id title date duration speakers { id name } sentences { index speaker_name text raw_text }` |
| `date` | Float, milliseconds since epoch UTC (`dateString` is the ISO form). Store as ISO string via `new Date(date).toISOString()` |
| `duration` | Number, **minutes** (may be fractional). Round for display |
| `sentences[].text` | Default or user-edited sentence; `raw_text` is the raw ASR text. Prefer `text`, fall back to `raw_text` |
| `speaker_name` | Real names for Google Meet and Zoom when Fireflies could identify the participant; otherwise generic `Speaker 1`, `Speaker 2`... (also for uploaded audio). Names can be edited in the Fireflies UI and the API returns the edited label. This is why VOICE-03 needs a per-import override: the preview page lists the speaker labels with line counts and lets the user pick |

## Decisions

### 1. Speaker filtering is a pure module, built test-first

`src/speaker-filter.ts` exposes `keepSpeakerLines(sentences, label)`, `countBySpeaker(sentences)` and `matchSpeaker(labels, configuredName)`. Matching is on the normalised label (trim, collapse whitespace, lowercase). `matchSpeaker` prefers an exact match, then a unique label that contains the configured name (so "Vincent" matches "Vincent Sider"), and returns `null` when ambiguous or empty. The Fireflies route calls this module before anything touches D1, so no other speaker's sentence can reach storage.

### 2. Test framework: plain vitest

`vitest` 5.0.0 with `vitest run`, tests in `test/` (outside `tsconfig` `include: ["src"]`, so `npm run check` is unchanged). The Cloudflare vitest plugin (`@cloudflare/vitest-plugin` 1.1.9, requires vitest ≥ 4.1) is not needed: the only TDD target is a pure function. Add the plugin later if a D1 helper ever needs a Workers-runtime test.

### 3. Import is two steps: preview, then confirm

- `GET /fireflies` → one GraphQL request (`user` + `transcripts(limit: 50, skip)`), renders "Connected as ..." or the error, then the meeting list with title, date, duration and an Import link. `?skip=50` pages.
- `GET /fireflies/:id/import` → fetches the transcript, shows speakers with line counts, preselects the match for the configured speaker name, and a Confirm button. Other speakers' names and counts are shown transiently and never stored.
- `POST /fireflies/:id/import` with `speaker` → fetches again (the Worker never carries other speakers' text through the browser), keeps only that speaker's lines, upserts the transcript row, redirects to the stored transcript view.

Two Fireflies requests per import, one per list page: well inside 50/day.

### 4. Storage (migration 0002)

- `transcripts(id TEXT PK, title, meeting_date TEXT ISO, duration_minutes INTEGER, speaker_label TEXT, body TEXT, line_count INTEGER, imported_at TEXT)`. `body` is the kept lines joined by `\n`. `id` is the Fireflies transcript id, so re-importing replaces the row (upsert). Nothing else from the meeting is stored: no participant emails, no other speaker names, no summary, no URLs.
- `voice_samples(id INTEGER PK AUTOINCREMENT, body TEXT, created_at TEXT)` for pasted LinkedIn posts.
- Speaker name lives in the existing `settings` table under key `speaker.name`.

### 5. Forms and safety

All routes stay behind `requireAccess`. Add Hono's `csrf()` middleware (Origin check) since the phase introduces the first POST forms. `c.req.parseBody()` for form bodies; POST → 303 redirect. Validate: transcript id `^[A-Za-z0-9_-]{1,100}$`, `skip` a non-negative integer, sample body trimmed, non-empty, ≤ 20 000 chars, speaker name ≤ 200 chars. hono/jsx escapes text, so stored text renders safely. Never `console.log` a transcript or the API key.

## Not needed in Phase 2

- Fireflies webhooks, audio upload, live meetings, summaries.
- Pagination beyond `skip`.
- Deleting transcripts or samples (VOICE-09/10, v2).
- Cloudflare vitest plugin (see decision 2).
