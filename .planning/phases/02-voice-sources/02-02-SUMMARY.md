---
phase: 02-voice-sources
plan: 02
subsystem: database
tags: [d1, sqlite, hono, hono-jsx, csrf, forms, migrations, cloudflare-workers]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Hono + hono/jsx Worker behind Cloudflare Access, D1 binding `DB`, settings table (migration 0001), getSetting/setSetting, Layout component"
provides:
  - "Migration 0002: transcripts and voice_samples tables (applied local + remote)"
  - "Typed D1 helpers: upsertTranscript, listTranscripts, getTranscript, insertVoiceSample, listVoiceSamples"
  - "SPEAKER_NAME_KEY (`speaker.name`) persisted through /settings"
  - "GET/POST /settings — speaker-name round-trip"
  - "GET /sources — transcript list + voice sample paste form and list"
  - "POST /sources/samples — stores pasted past writing"
  - "GET /sources/transcripts/:id — stored lines for one transcript"
  - "hono/csrf registered app-wide (first POST forms in the project)"
  - "Layout nav across every page"
affects: [02-03-fireflies-import, 03-drafting, 04-approval]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Router-per-feature: `export const x = new Hono<AppEnv>()` mounted with app.route(\"/\", x)"
    - "POST → validate → 303 redirect with ?saved=1 flash, no client JS"
    - "Bound parameters only in every D1 statement; upsert via ON CONFLICT DO UPDATE SET excluded.*"
    - "Summary vs full row types (TranscriptSummary omits body) so list views never load transcript text"

key-files:
  created:
    - migrations/0002_sources.sql
    - src/settings.tsx
    - src/sources.tsx
  modified:
    - src/db.ts
    - src/index.tsx
    - src/layout.tsx

key-decisions:
  - "transcripts.id is the Fireflies transcript id, so re-import upserts instead of duplicating"
  - "Compliance constraint written into the migration header: body holds only the executive's own lines; no other speaker text, participant emails, summaries or URLs"
  - "csrf() registered app-wide right after requireAccess rather than per-route"
  - "Empty speaker name is valid and clears the setting (not a validation error)"
  - "listVoiceSamples orders by created_at DESC, id DESC so same-second pastes stay newest-first"

patterns-established:
  - "Flash messages: ?saved=1 query flag rendered as a .notice paragraph"
  - "Route-level input validation returns plain-text 400 (id pattern, length caps) before touching D1"
  - "hono/jsx auto-escaping is the XSS defence for stored text; dangerouslySetInnerHTML only for the CSS block"

# Metrics
duration: 4min
completed: 2026-09-15
---

# Phase 02 Plan 02: Sources Storage and Views Summary

**D1 tables for transcripts and pasted voice samples, plus the speaker-name setting and the /sources views that read them — the storage layer 02-03's Fireflies import writes into.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-15T06:42:19Z
- **Completed:** 2026-09-15T06:46:30Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- Migration 0002 creates `transcripts` and `voice_samples` and is applied to **both** local and remote D1; both report "No migrations to apply" and both list the new tables. 02-03 can deploy without touching migrations.
- Six typed D1 helpers on the established bound-parameter pattern, including the `upsertTranscript` that the Fireflies import depends on.
- `/settings` round-trips the speaker name under `speaker.name` — the value 02-03 reads to preselect the right speaker on import.
- `/sources` lists stored transcripts (title → detail link, date, duration, speaker, line count, imported date) with a Fireflies empty state, and accepts pasted past writing straight into `voice_samples`.
- `hono/csrf` now guards every state-changing request; cross-origin POSTs are rejected 403 and leave stored values untouched.

## Task Commits

1. **Task 1: Migration 0002 and typed D1 helpers** — `19d108f` (feat)
2. **Task 2: Speaker-name settings page** — `7df99df` (feat)
3. **Task 3: Sources view, paste samples, transcript detail, nav** — `e011b20` (feat)

_Commits `d81012d` and `0e9753b` interleaved in the log belong to plan 02-01, executed in parallel by another agent._

## Files Created/Modified

- `migrations/0002_sources.sql` — transcripts + voice_samples tables, meeting_date index, compliance note in the header
- `src/db.ts` — SPEAKER_NAME_KEY, TranscriptRow/TranscriptSummary/VoiceSampleRow, upsertTranscript, listTranscripts, getTranscript, insertVoiceSample, listVoiceSamples
- `src/settings.tsx` — GET/POST /settings for the speaker name
- `src/sources.tsx` — GET /sources, POST /sources/samples, GET /sources/transcripts/:id
- `src/index.tsx` — csrf() middleware, settings and sources routers mounted, home page links
- `src/layout.tsx` — nav (Home, Sources, Fireflies, Settings, Health) and styles for notices, hints, textareas, sample and transcript bodies

## Decisions Made

- **Fireflies id as primary key.** Re-importing a meeting (say with a different speaker selected) replaces the row rather than duplicating it, so `upsertTranscript` is the only write path 02-03 needs.
- **Compliance constraint documented in SQL, not just policy.** The migration header states that only the executive's lines are stored, so anyone reading the schema sees the Jersey DP constraint.
- **csrf() app-wide, not per-route.** An Origin check costs nothing behind Access and no future route can forget it.
- **Empty speaker name clears the setting** instead of erroring — the natural way to undo a wrong value.
- **`listVoiceSamples` tiebreaks on `id DESC`** so two samples pasted in the same second still list newest-first.

## Deviations from Plan

None — plan executed exactly as written. Three small additions stayed inside the tasks' stated scope: the CSS classes the plan's markup implied (`.notice`, `.hint`, textarea, sample/transcript bodies) were added alongside the Task 3 nav styles; `listVoiceSamples` got an `id DESC` tiebreaker; and the transcript-id regex was hoisted to a named constant.

## Issues Encountered

None. Remote migration applied first time; no lock contention with the parallel 02-01 agent.

## Verification Evidence

- `npm run check` exits 0; `git grep -n "console.log" src/` returns nothing.
- `wrangler d1 migrations list` — "No migrations to apply" both `--local` and `--remote`; remote `sqlite_master` lists `transcripts` and `voice_samples`.
- `/settings`: 200 with form → POST (Origin localhost) 303 → `/settings?saved=1` shows `value="Vincent Sider"` and "Saved."; POST with `Origin: http://evil.example` → 403 and the stored value is unchanged; 201-char name → 400; empty name → 303 and clears.
- `/sources`: 200 with both empty states → POST sample 303 → sample text visible on the next GET; whitespace-only body → 400.
- `/sources/transcripts/`: unknown id → 404, `bad%20id!` → 400. A temporary local row rendered the full table row (date `2026-09-10`, `42 min`, speaker, line count) and detail page ("Lines kept for speaker: Vincent Sider (2)" plus both lines); a `<script>` in the title rendered escaped. Test rows deleted afterwards — local `transcripts` and `voice_samples` are both empty, remote untouched.
- Nav renders on `/`, `/sources`, `/settings`, `/health`.

## User Setup Required

None — no external service configuration. Note the remote D1 now carries migration 0002; no data was written to it.

## Next Phase Readiness

**Ready for 02-03 (Fireflies import):**
- `upsertTranscript` accepts exactly the row shape the import produces.
- `getSetting(db, SPEAKER_NAME_KEY)` supplies the configured speaker label for preselection.
- The nav already links `/fireflies`, and `/sources` empty state points there — both 404 until 02-03 mounts the router.
- After import, redirect to `/sources/transcripts/:id` to show the stored result.

**Concerns:**
- `/sources` loads every transcript summary and every sample body on one page. Fine at pilot scale (one executive), but the sample list will need paging or truncation at the DB level if the archive grows large.
- The Phase 2 follow-up from STATE.md still stands: confirm the Access policy is an explicit email allow-list before real meeting transcripts are imported in 02-03.

---
*Phase: 02-voice-sources*
*Completed: 2026-09-15*
