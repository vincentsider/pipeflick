# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-14)

**Core value:** Drafts sound like the executive and follow a proven format, so at least 80% get approved with only light edits and a week of content costs them about an hour instead of eight.
**Current focus:** Phase 2 — Voice Sources (Phase 1 verified 2026-09-14)

## Current Position

Phase: 2 of 5 (Voice Sources)
Plan: 02-01 and 02-02 complete (speaker filter; sources storage and views); 02-03 remaining
Status: In progress — Phase 2 wave 1 complete
Last activity: 2026-09-15 — Completed 02-02-PLAN.md (migration 0002, /settings, /sources)

Progress: █████░░░░░ 45% (5 of 11 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~8 min agent time
- Total execution time: ~0.67 hours agent time (excluding user time on the Cloudflare dashboard and filling .dev.vars)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~33 min | ~11 min |
| 2 | 2/3 | ~7 min | ~3.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (~3 min), 01-02 (~15 min, includes a human-action pause), 01-03 (~15 min agent, ~42 min wall with two human pauses), 02-01 (~3 min, fully autonomous TDD), 02-02 (~4 min, fully autonomous, ran in parallel with 02-01)
- Trend: faster — Phase 2 wave 1 ran two plans in parallel with no human pause; 02-02's only slow step was the remote D1 migration

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Requirements: API keys live in Worker secrets, not a settings screen (single user in v1)
- Requirements: delete-on-request met by a wrangler D1 command in v1; UI deletion deferred to VOICE-09/10
- Roadmap: DRAFT-04 (feedback loop) verified in Phase 4, where approvals first exist
- Phase 1 plan: Hono 4.13 + hono/jsx server rendering (no build step, typed D1 bindings); no static assets binding because it drops the Access context
- Phase 1 plan: Access gate = hostname-based Access app on the workers.dev URL + Worker checks `ctx.access` and returns 403 without it (fail closed); preview_urls disabled
- Phase 1 plan: D1 schema starts with only a `settings` table; each later phase adds its own migration
- Phase 1 plan: secrets are OPENAI_API_KEY, FIREFLIES_API_KEY, METRICOOL_USER_TOKEN, pushed with `wrangler secret bulk .dev.vars`; no test framework until Phase 2 (speaker filtering is the first TDD candidate)
- 01-01: tsconfig uses `lib: ["ES2022"]` (no DOM) + `skipLibCheck` so wrangler-generated types and hono/jsx types coexist; keep it that way
- 01-01: `<style>` blocks use `dangerouslySetInnerHTML` (hono/jsx escapes text children)
- 01-01: Worker is live at https://pipeflick.your-subdomain.workers.dev; D1 `pipeflick-db` id `YOUR_D1_DATABASE_ID`, region WEUR
- 01-02: Access app created in the Cloudflare dashboard (Workers & Pages → pipeflick → Settings → Access), not via `scripts/create-access-app.sh`; no Access-scoped API token exists. Zero Trust team `your-team` (auto-generated), team domain `your-team.cloudflareaccess.com`, app AUD `YOUR_ACCESS_AUD`
- 01-02: `ctx.access` works with the hostname-based app; jose JWT fallback not needed. Every route sits behind `app.use("*", requireAccess)`; read the user as `c.get("email")`. Local dev identity comes from `access.dev` in wrangler.jsonc
- 01-03: Zernio replaces Metricool as the scheduler; the secret is ZERNIO_USER_TOKEN (not METRICOOL_USER_TOKEN). Phase 5 must be re-researched and re-planned against the Zernio API before execution. ROADMAP/REQUIREMENTS/PROJECT still say Metricool; the orchestrator updates them at phase completion
- 01-03: secret names live only in `src/env.ts` SECRET_NAMES; health page and bindings type derive from it. Adding a secret = SECRET_NAMES entry + `.dev.vars.example` line + `npm run secrets:push`
- 01-03: `/health` returns 500 when the D1 read-back fails so scripted checks catch a broken binding
- 02-01: test framework is plain vitest 5 (`npm test` = `vitest run`), tests in `test/**/*.test.ts` outside tsconfig `include: ["src"]` so `npm run check` is unaffected; no @cloudflare/vitest-plugin until a Workers-runtime test actually needs one
- 02-01: `src/speaker-filter.ts` is the only place that decides which transcript text may be stored — pure, no I/O, no logging. Exports `keepSpeakerLines`, `countBySpeaker`, `matchSpeaker`, `normaliseLabel`, `UNKNOWN_SPEAKER`, types `Sentence`/`SpeakerCount`. Every import must run through it before any D1 write
- 02-01: speaker matching is always on the normalised label (trim, collapse whitespace, lowercase); `matchSpeaker` returns null when blank, absent or ambiguous, and a blank label to `keepSpeakerLines` keeps nothing (fail closed, never dump a whole meeting)
- 02-02: migration 0002 adds `transcripts` (PK = the Fireflies transcript id, so re-import upserts) and `voice_samples`; applied to local AND remote D1. The compliance constraint (only the executive's lines, no participant emails/summaries/URLs) is written into the migration header, not just policy docs
- 02-02: D1 helpers live in `src/db.ts` on the bound-parameter rule — `upsertTranscript`, `listTranscripts` (returns `TranscriptSummary`, no body column), `getTranscript`, `insertVoiceSample`, `listVoiceSamples`. Speaker name is stored in `settings` under `SPEAKER_NAME_KEY` = `speaker.name`
- 02-02: `csrf()` from hono/csrf is registered app-wide right after `requireAccess`, so no future POST route can forget the Origin check. Form pattern is POST → validate → 303 redirect with a `?saved=1` flash; no client JS anywhere
- 02-02: feature routers are `export const x = new Hono<AppEnv>()` mounted with `app.route("/", x)`; `src/layout.tsx` owns the shared nav (Home, Sources, Fireflies, Settings, Health) and all CSS
- 02-02: an empty speaker name is valid and clears the setting; route-level validation (id `^[A-Za-z0-9_-]{1,100}$`, sample ≤ 20000 chars, name ≤ 200 chars) returns plain-text 400 before touching D1

### Pending Todos

- Phase 5: re-research and re-plan against the Zernio API (Metricool is gone); update ROADMAP.md, REQUIREMENTS.md and PROJECT.md Metricool references at Phase 1 completion

### Blockers/Concerns

- Phase 1 (resolved in 01-02): Zero Trust enabled and the Worker protected via the dashboard; `ctx.access` confirmed working, no jose fallback
- Phase 2 (follow-up): confirm the dashboard Access policy is an explicit email allow-list (owner@example.com, owner.alt@example.com) rather than the default account-wide rule before real transcripts are imported
- Phase 2 (02-02, minor): `/sources` loads every transcript summary and every sample body in one page render; fine for one executive at pilot scale, needs DB-level paging/truncation if the archive grows
- Phase 3: Worker request time limits may not fit several OpenAI calls in one request; research before planning
- Phase 5: confirm the Zernio API is available on Vincent's plan and supports LinkedIn drafts (replaces the earlier Metricool concern)

## Session Continuity

Last session: 2026-09-15 06:47 UTC
Stopped at: Completed 02-01-PLAN.md (speaker filter + vitest) and 02-02-PLAN.md (migration 0002, /settings, /sources). 02-03 (Fireflies import) is next: it consumes src/speaker-filter.ts, `upsertTranscript` and the `speaker.name` setting, and mounts /fireflies (already linked from the nav, 404 until then)
Resume file: None
