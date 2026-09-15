# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-14)

**Core value:** Drafts sound like the executive and follow a proven format, so at least 80% get approved with only light edits and a week of content costs them about an hour instead of eight.
**Current focus:** Phase 2 — Voice Sources complete (verified 2026-09-15); Phase 3 — Drafting is next

## Current Position

Phase: 2 of 5 (Voice Sources)
Plan: 3 of 3 — all Phase 2 plans complete (speaker filter; sources storage and views; Fireflies import)
Status: Phase 2 complete and verified 2026-09-15 (5/5 roadmap criteria, 11/11 plan truths, no gaps)
Last activity: 2026-09-15 — Completed 02-03-PLAN.md (Fireflies client, /fireflies import routes, deployed, checkpoint approved)

Progress: ██████░░░░ 55% (6 of 11 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: ~8 min agent time
- Total execution time: ~0.8 hours agent time (excluding user time on the Cloudflare dashboard, filling .dev.vars, and the 02-03 verification checkpoint)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~33 min | ~11 min |
| 2 | 3/3 | ~15 min agent (~27 min wall) | ~5 min |

**Recent Trend:**
- Last 5 plans: 01-02 (~15 min, includes a human-action pause), 01-03 (~15 min agent, ~42 min wall with two human pauses), 02-01 (~3 min, fully autonomous TDD), 02-02 (~4 min, fully autonomous, ran in parallel with 02-01), 02-03 (~8 min agent, ~20 min wall with one human-verify checkpoint)
- Trend: steady — Phase 2 averaged ~5 min per plan; the only wall-clock cost was the single verification checkpoint in 02-03, which is exactly where a human should be in the loop (first real executive data)

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
- 01-03: Zernio replaces Metricool as the scheduler; the secret is ZERNIO_USER_TOKEN (not METRICOOL_USER_TOKEN). Phase 5 must be re-researched and re-planned against the Zernio API before execution. ROADMAP/REQUIREMENTS/PROJECT were updated to Zernio at Phase 2 completion (2026-09-15); the phase directory is now `05-zernio-push`. The only remaining Metricool mention is PROJECT.md naming it as a competitor tool, which is correct
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
- 02-03: `src/fireflies.ts` takes the API key as an argument and never reads env, never logs, and never puts the key, request body or transcript text in an error. Routes are the only place touching `c.env.FIREFLIES_API_KEY`; a missing key renders a 500 pointing at /health and makes no request
- 02-03: Fireflies returns HTTP 200 with a populated `errors[]` array, so both status and body are checked; `FirefliesError` carries `code` (Fireflies code, else `http_<status>`). `object_not_found` → 404, everything else → 502 rendering Fireflies' own message plus code (never a stack)
- 02-03: one GraphQL request per page view — `user` and `transcripts(limit: 50, skip)` ride in the same query. An import costs 2 requests (preview + confirm) because the confirm re-fetches rather than posting sentences from the browser, keeping other participants' text inside the Worker
- 02-03: a speaker option is selectable only when `keepSpeakerLines` actually returns lines for that label, which disables the `UNKNOWN_SPEAKER` group; `matchSpeaker` is given only importable labels; zero kept lines is a 422 re-render that writes nothing
- 02-03: Fireflies plan tier is unconfirmed — the Free-plan budget of 50 requests/day stays the working assumption; any future polling/webhook feature must re-check the tier first

### Pending Todos

- Phase 3 (low, hardening): narrow the transcript prop on the Fireflies import preview so `sentences` is not passed into a `Meeting`-typed component — see `.planning/todos/pending/narrow-transcript-prop-type.md`

- Phase 5: re-research and re-plan against the Zernio API before planning that phase (the doc rename is done; the API research is not)

### Blockers/Concerns

- Phase 1 (resolved in 01-02): Zero Trust enabled and the Worker protected via the dashboard; `ctx.access` confirmed working, no jose fallback
- Phase 2 (02-03, closed): the Access policy check was step 1 of the 02-03 verification. The user confirmed the checkpoint, including that step; whether it required a change was not reported
- Phase 2 (02-02, minor): `/sources` loads every transcript summary and every sample body in one page render; fine for one executive at pilot scale, needs DB-level paging/truncation if the archive grows
- Phase 2 (02-03, ongoing): Fireflies is US-hosted. Storing only the executive's own lines is the mitigation, not a resolution, of the Jersey/GDPR transfer question in CLAUDE.md
- Phase 2 (02-03, minor): `/fireflies` shows one page of 50 meetings with skip paging only — no search or date filter. Fine at pilot scale
- Phase 3: Worker request time limits may not fit several OpenAI calls in one request; research before planning
- Phase 2 (verification, info): `POST /sources/samples` has run locally but never against production D1 (remote `voice_samples` is empty); the deployed bundle is identical, so this is usage-not-yet-occurred, not a gap
- Phase 5: confirm the Zernio API is available on Vincent's plan and supports LinkedIn drafts (replaces the earlier Metricool concern)

## Session Continuity

Last session: 2026-09-15 07:08 UTC
Stopped at: Completed 02-03-PLAN.md — Phase 2 is done. Fireflies client + /fireflies routes are deployed (version f20df031-5ab9-413d-abbe-07c7d1b7be84) and the human checkpoint was approved on a real meeting import. Phase 3 (drafting) is next and reads from `getTranscript`/`listTranscripts`/`listVoiceSamples`; research Worker request-time limits versus multiple OpenAI calls before planning it
Resume file: None
