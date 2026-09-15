---
phase: 02-voice-sources
verified: 2026-09-15T07:15:00Z
status: passed
score: 5/5 roadmap criteria; 11/11 plan truths; 9/9 artifacts; 8/8 key links
re_verification: none (initial verification)
requirements:
  VOICE-01: satisfied
  VOICE-02: satisfied
  VOICE-03: satisfied
  VOICE-04: satisfied
  VOICE-05: satisfied
  VOICE-06: satisfied
evidence:
  tests: "vitest run — 10/10 pass"
  typecheck: "wrangler types && tsc --noEmit — exit 0"
  deployed: "anonymous GET / /fireflies /sources /settings /health — all 302 to cloudflareaccess.com"
  deployed_version: f20df031-5ab9-413d-abbe-07c7d1b7be84
  migrations_remote: [0001_settings.sql, 0002_sources.sql]
  migrations_local: [0001_settings.sql, 0002_sources.sql]
notes:
  - "POST /sources/samples has never run against production D1 (remote voice_samples = 0 rows). Code path verified and exercised locally in 02-02; not a gap."
---

# Phase 2: Voice Sources Verification Report

**Phase Goal:** The executive's own words are in the database: filtered Fireflies transcripts and pasted past posts
**Verified:** 2026-09-15T07:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User sees whether the Fireflies connection works | ✓ VERIFIED | `fireflies-routes.tsx:172` renders `Connected as {user.name} ({user.email})`; failures render Fireflies' own message + code at 502 (`firefliesErrorPage`, line 139-143); missing key → 500 naming `FIREFLIES_API_KEY` |
| 2 | User sees a list of meetings (title, date, duration) and can import one | ✓ VERIFIED | `fireflies-routes.tsx:177-199` table of title / `formatDate(dateIso)` / `{durationMinutes} min` / Import link to `/fireflies/:id/import`; skip-based paging 201-212. Human-approved 2026-09-15 |
| 3 | An imported transcript in D1 contains only the executive's lines | ✓ VERIFIED | Single write path, see "Compliance trace" below. Human-approved 2026-09-15 |
| 4 | User sets speaker name once in settings and can override per import | ✓ VERIFIED | `/settings` persists `speaker.name` (`settings.tsx:61`); preview preselects via `matchSpeaker` and offers radios for every importable label (`fireflies-routes.tsx:219-231`, 116-125); POST uses the submitted label, not the setting (line 303). Human-approved 2026-09-15 |
| 5 | User pastes past LinkedIn posts and sees them alongside transcripts in a sources view | ✓ VERIFIED | `/sources` renders `TranscriptTable` + paste form + `SampleList` in one view (`sources.tsx:96-127`); POST stores and redirects 303 to `?saved=1` |

**Score:** 5/5 criteria verified

### Compliance trace (criterion 3 — Data Protection (Jersey) Law 2018)

Verified structurally, as five independent properties:

1. **Single write path.** `grep -rn "upsertTranscript" src/` → exactly one call site, `fireflies-routes.tsx:319`. `INSERT INTO transcripts` appears once, in `db.ts:63`. There is no other path that can write a transcript row.
2. **Filter runs before the write.** In `POST /fireflies/:id/import`: `keepSpeakerLines(transcript.sentences, speaker)` at line 303 → `upsertTranscript(..., body: lines.join("\n"), line_count: lines.length)` at 319-327. `lines` is a `string[]` of the chosen speaker's text only; the `sentences` array is never passed to `upsertTranscript`.
3. **Schema cannot hold anyone else's text.** Remote `sqlite_master` matches `migrations/0002_sources.sql` byte-for-byte: `transcripts(id, title, meeting_date, duration_minutes, speaker_label, body, line_count, imported_at)`. No participants column, no emails column, no summary, no raw-sentences column, no Fireflies URL.
4. **The confirm step re-fetches.** `fireflies-routes.tsx:294` calls `fetchTranscript(apiKey, id)` again on POST; the form (line 116-125) submits only the `speaker` radio value. No other speaker's text ever travels through the browser, so no round-trip can be tampered with to inject it.
5. **No side channels.** `grep -rn "console\." src/` → nothing. `grep -rn "sentences" src/` → the array reaches only `countBySpeaker` and `keepSpeakerLines`. `fireflies.ts` never reads env, never logs, and no error message carries the key, request body or transcript text. `ImportPreview` is typed `meeting: Meeting` and renders only title/date/duration/id; `hono/jsx` server-renders without serialising props.

**Live data check (read-only SELECTs, no text read):** remote `transcripts` holds 1 row from the user's real import. `line_count` equals the newline count of `body` + 1 (consistent with a `join("\n")` of exactly `line_count` kept lines), `LENGTH(body) > 0`, `LENGTH(speaker_label) > 0`, and `body LIKE '%@%'` → 0 rows (no participant email addresses). No row text, title or speaker name was read or is recorded here.

**Fail-closed detail:** `buildPreview` marks a label `importable` only when `keepSpeakerLines` would actually return lines, so the `UNKNOWN_SPEAKER` placeholder for blank Fireflies names is rendered disabled and cannot be imported. An override that matches nobody re-renders the preview at 422 and writes nothing (lines 305-317).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/speaker-filter.ts` | keepSpeakerLines, countBySpeaker, matchSpeaker, Sentence | ✓ VERIFIED | 113 lines; all four exported plus `normaliseLabel`, `UNKNOWN_SPEAKER`, `SpeakerCount`; pure, no I/O |
| `test/speaker-filter.test.ts` | Behavioural tests, min 40 lines | ✓ VERIFIED | 139 lines, 10 tests, incl. an explicit "never leaks another speaker's words" assertion |
| `vitest.config.ts` | picks up test/**/*.test.ts | ✓ VERIFIED | `include: ["test/**/*.test.ts"]` |
| `migrations/0002_sources.sql` | transcripts + voice_samples | ✓ VERIFIED | 26 lines; both CREATE TABLEs + date index; applied local and remote |
| `src/db.ts` | 6 typed helpers + SPEAKER_NAME_KEY | ✓ VERIFIED | 123 lines; all exports present; every value bound, no SQL interpolation |
| `src/settings.tsx` | GET/POST /settings | ✓ VERIFIED | 63 lines; 200-char cap, whitespace normalise, empty clears |
| `src/sources.tsx` | GET /sources, POST /sources/samples, GET /sources/transcripts/:id, min 60 lines | ✓ VERIFIED | 177 lines; all three routes; 20k cap, id regex, empty states |
| `src/fireflies.ts` | firefliesQuery, listMeetings, fetchTranscript, FirefliesError | ✓ VERIFIED | 206 lines; all exported; 20s timeout; HTTP-200-with-errors handled |
| `src/fireflies-routes.tsx` | 3 routes, min 80 lines | ✓ VERIFIED | 330 lines; GET list, GET preview, POST import |

No stub patterns found. The only `placeholder` match is the word inside an explanatory comment (`fireflies-routes.tsx:222`); the only `return null` / `return []` are the documented, test-covered fail-closed branches in `speaker-filter.ts`.

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| `package.json` | vitest | `"test": "vitest run"` | ✓ WIRED — 10/10 pass |
| `src/settings.tsx` | settings table | `setSetting(c.env.DB, SPEAKER_NAME_KEY, value)` | ✓ WIRED — line 61 |
| `src/sources.tsx` | `src/db.ts` | listTranscripts + listVoiceSamples on GET, insertVoiceSample on POST | ✓ WIRED — lines 97-100, 141 |
| `src/index.tsx` | settings + sources routers | `app.route("/", ...)` after requireAccess and csrf | ✓ WIRED — lines 13, 17, 23, 26 |
| `src/fireflies.ts` | api.fireflies.ai/graphql | fetch POST, `Authorization: Bearer ${apiKey}` | ✓ WIRED — lines 16, 68-76; key passed as an argument, never read from env in this module |
| `src/fireflies-routes.tsx` | `src/speaker-filter.ts` | keepSpeakerLines before upsertTranscript | ✓ WIRED — line 303 precedes line 319 |
| `src/fireflies-routes.tsx` | `src/db.ts` | upsertTranscript with body = kept lines only | ✓ WIRED — `body: lines.join("\n")`, line 325 |
| `src/fireflies-routes.tsx` | settings table | `getSetting(db, SPEAKER_NAME_KEY)` to preselect | ✓ WIRED — line 225 |

### Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| VOICE-01 connect to Fireflies and report whether it works | ✓ SATISFIED | `/fireflies` connection line / error page with Fireflies code |
| VOICE-02 list meetings and pick one to import | ✓ SATISFIED | meeting table + Import link + paging |
| VOICE-03 set speaker name once, override per import | ✓ SATISFIED | `speaker.name` setting + per-import radio override |
| VOICE-04 keep only executive's lines, discard rest before storing | ✓ SATISFIED | See compliance trace (5 properties) |
| VOICE-05 paste past LinkedIn posts as voice samples | ✓ SATISFIED | `POST /sources/samples` → `voice_samples` |
| VOICE-06 see stored transcripts and voice samples | ✓ SATISFIED | `/sources` + `/sources/transcripts/:id` |

### Build, Test and Deploy Checks

- `npm test` → **10/10 pass** (1 file, 98ms).
- `npm run check` (`wrangler types && tsc --noEmit`) → **exit 0**.
- Deployed anonymous GETs: `/` `/fireflies` `/sources` `/settings` `/health` → **302** to `your-team.cloudflareaccess.com`. Access gate intact on every route; no authentication attempted.
- Deployment timeline confirms the deployed bundle contains this code: last source write 06:50:42Z, deployed version `f20df031` created 06:51:31Z, final commit `294a2bc` at 06:51:52Z. `git diff HEAD` over `src/ migrations/ test/ package.json vitest.config.ts` is empty, so working tree = HEAD = deployed.
- Remote D1: `d1_migrations` = [0001, 0002]; tables `settings`, `transcripts`, `voice_samples` present. Local D1: same migrations applied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/fireflies-routes.tsx` | 222 | word "placeholder" in a comment | ℹ️ Info | Explanatory comment about `UNKNOWN_SPEAKER`; not a stub |
| `src/fireflies-routes.tsx` | 262 | `meeting={transcript}` passes the full `FetchedTranscript` (carrying `sentences`) into a prop typed `Meeting` | ℹ️ Info | No leak today: `hono/jsx` server-renders and `ImportPreview` reads only id/title/date/duration. Narrowing the argument at the call site would remove the latent footgun |

No blocker or warning anti-patterns. No TODO/FIXME, no `console.*`, no empty handlers, no unused-state renders.

### Human Verification

The 02-03 human checkpoint was performed and approved by the user on 2026-09-15 (real import through Cloudflare Access, covering settings, connection, speaker preview with override, confirmed import, stored transcript view and the `/sources` listing). The browser-only aspects of criteria 2, 3 and 4 are treated as human-approved; they were not re-tested here, and no Fireflies API request was made during this verification.

One optional, non-blocking confirmation remains: `POST /sources/samples` has never run against production D1 (remote `voice_samples` = 0 rows). The path is fully wired, was exercised locally during 02-02 (POST → 303 → sample visible on the next GET, test rows deleted afterwards), and the deployed bundle is identical, so this is recorded as usage-not-yet-occurred rather than a gap. It will be exercised naturally the first time a past post is pasted in Phase 3 prep.

### Gaps Summary

None. Every must-have across plans 02-01, 02-02 and 02-03 is present, substantive and wired; all five roadmap criteria hold; all six VOICE requirements are satisfied. The compliance core (criterion 3 / VOICE-04) is the strongest part of the phase: one write path, one filter gate ahead of it, a schema with nowhere to put another participant's words, a re-fetching confirm step, and no logging or serialisation side channel.

---

_Verified: 2026-09-15T07:15:00Z_
_Verifier: Claude (gsd-verifier)_
