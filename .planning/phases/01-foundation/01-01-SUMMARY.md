---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [cloudflare-workers, wrangler, hono, hono-jsx, d1, typescript]

# Dependency graph
requires: []
provides:
  - Deployable Hono + hono/jsx Worker at the repo root with dev/check/deploy scripts
  - D1 database pipeflick-db bound as DB, migration 0001 (settings table) applied locally and remotely
  - Typed getSetting/setSetting helpers in src/db.ts
  - Live workers.dev URL for Plan 01-02 to gate with Access
affects: [01-02 access gate, 01-03 secrets and health page, every later phase that adds routes or migrations]

# Tech tracking
tech-stack:
  added: [hono 4.13.7, wrangler 4.131.2, typescript 5.9.3]
  patterns:
    - "Server-rendered pages via hono/jsx; Layout component with inline CSS, no assets binding"
    - "Env type comes from wrangler types (worker-configuration.d.ts, gitignored); tsconfig lib ES2022 without DOM, skipLibCheck on"
    - "D1 access through small typed helpers using prepare().bind() placeholders; one migration file per phase in migrations/"

key-files:
  created:
    - package.json
    - tsconfig.json
    - wrangler.jsonc
    - src/index.tsx
    - src/layout.tsx
    - src/db.ts
    - migrations/0001_settings.sql
  modified:
    - .gitignore
    - CLAUDE.md

key-decisions:
  - "tsconfig uses lib ES2022 (no DOM) plus skipLibCheck: wrangler-generated runtime types clash with lib.dom, and hono/jsx's .d.ts references DOM event names; this matches Hono's own Cloudflare template"
  - "Style blocks are rendered with dangerouslySetInnerHTML because hono/jsx HTML-escapes text children, which broke quoted font names inside <style>"
  - "compatibility_date 2026-09-01, nodejs_compat, observability on, preview_urls off, no assets binding (as planned)"

patterns-established:
  - "Pages: import Layout from ./layout and return c.html(<Layout title=...>...</Layout>)"
  - "DB helpers take D1Database as first arg so they are testable without Hono context"
  - "Remote D1 is touched only through wrangler d1 migrations apply --remote and read-only SELECTs"

# Metrics
duration: ~3min wall clock per system date (npm install, local dev check, remote migration and deploy included)
completed: 2026-09-14
---

# Phase 1 Plan 01: Scaffold, D1 and First Deploy Summary

**Hono 4.13 + hono/jsx Worker scaffolded at the repo root, D1 `pipeflick-db` (WEUR) bound with the `settings` migration applied locally and remotely, and the app live at https://pipeflick.your-subdomain.workers.dev**

## Performance

- **Duration:** ~3 min (system clock: 1789419451 → 1789419598 epoch)
- **Started:** 2026-09-14T20:57:31Z
- **Completed:** 2026-09-14T20:59:58Z
- **Tasks:** 3
- **Files modified:** 10 (9 source/config + CLAUDE.md)

## Accomplishments
- `npm run dev` serves GET / with 200 and "Pipeflick is running" locally; `npm run check` (wrangler types + tsc --noEmit) passes
- D1 database created (`pipeflick-db`, id `YOUR_D1_DATABASE_ID`, region WEUR); `settings` and `d1_migrations` tables exist in both local and remote databases
- First deploy succeeded without a subdomain gate; https://pipeflick.your-subdomain.workers.dev/ returns 200 with the home page (version `975a2511-cde5-4cb4-a835-4f4dda8f466f`)
- `.gitignore` covers `node_modules/`, `.wrangler/`, `.dev.vars*`, `worker-configuration.d.ts`, `dist/`; `git status` shows none of them

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold the Hono Worker project** - `8c883bb` (feat)
2. **Task 2: Create the D1 database, first migration and settings helpers** - `e647db2` (feat)
3. **Task 3: First deploy to workers.dev** - `bfb5eb7` (docs)

**Plan metadata:** see final commit (docs: complete plan)

## Files Created/Modified
- `package.json` - scripts `dev`, `deploy`, `types`, `check`, `db:migrate:local`, `db:migrate:remote`; deps hono, wrangler, typescript
- `tsconfig.json` - ES2022 / Bundler / strict / hono/jsx JSX source / types from `worker-configuration.d.ts`; `lib: ["ES2022"]` and `skipLibCheck`
- `wrangler.jsonc` - name `pipeflick`, `compatibility_date` 2026-09-01, `nodejs_compat`, observability on, `preview_urls: false`, D1 binding `DB`
- `src/layout.tsx` - `Layout` FC with `<title>`, inline CSS, "Pipeflick" header
- `src/index.tsx` - `new Hono<{ Bindings: Env }>()`, GET / page, link to `/health` (built in 01-03)
- `src/db.ts` - `getSetting(db, key)` and `setSetting(db, key, value)` with bound parameters and upsert
- `migrations/0001_settings.sql` - `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `.gitignore` - added generated/local artefacts
- `CLAUDE.md` - "Current state" replaced by "Stack and commands"; deployed URL recorded

## Installed versions
- hono 4.13.7
- wrangler 4.131.2
- typescript 5.9.3
- Node v26.4.0 / npm 11.17.0

## Facts Plan 01-02 and 01-03 need
- **workers.dev URL:** https://pipeflick.your-subdomain.workers.dev (hostname `pipeflick.your-subdomain.workers.dev` for the Access application)
- **D1 database id:** `YOUR_D1_DATABASE_ID` (binding `DB`, name `pipeflick-db`, region WEUR)
- **Account id:** `YOUR_CLOUDFLARE_ACCOUNT_ID` (wrangler OAuth login as owner@example.com)
- The Worker is currently public; nothing sensitive is served until 01-02 gates it

## Decisions Made
- `lib: ["ES2022"]` (no DOM) plus `skipLibCheck: true` in tsconfig. Without an explicit `lib`, tsc pulled in `lib.dom`, which conflicts with the runtime types `wrangler types` generates (TS2717/TS2403 on TransformStream, WebSocket, etc.). Dropping DOM then exposed hono/jsx's `.d.ts` referencing `TouchEvent`/`DragEvent`; `skipLibCheck` is the standard fix and is what Hono's own Cloudflare template does. Source files in `src/` are still fully checked.
- `<style dangerouslySetInnerHTML={{ __html: css }} />` in the layout, since hono/jsx escapes text children.
- Left `prd.md` and `logs/` untracked; they are outside this plan's file list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsconfig needed `lib` and `skipLibCheck` for `npm run check` to pass**
- **Found during:** Task 1 (Scaffold the Hono Worker project)
- **Issue:** `tsc --noEmit` reported ~15 declaration conflicts between the default DOM lib and `worker-configuration.d.ts`; after removing DOM, hono/jsx's type definitions failed on DOM event names
- **Fix:** Added `"lib": ["ES2022"]` and `"skipLibCheck": true` to `tsconfig.json`
- **Files modified:** tsconfig.json
- **Verification:** `npm run check` exits 0
- **Committed in:** 8c883bb (part of task commit)

**2. [Rule 1 - Bug] Inline CSS was HTML-escaped inside `<style>`**
- **Found during:** Task 1 (local curl of GET /)
- **Issue:** `font-family: "Segoe UI"` rendered as `&quot;Segoe UI&quot;`, invalid CSS inside a style element
- **Fix:** Render the style block with `dangerouslySetInnerHTML`
- **Files modified:** src/layout.tsx
- **Verification:** local and remote bodies contain the unescaped `"Segoe UI"`
- **Committed in:** 8c883bb (part of task commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** Both were needed for the plan's own verification to pass. No scope change.

## Issues Encountered
- `wrangler d1 create` offered to add the binding itself with binding name `pipeflick_db`; declined (non-interactive default) and wrote the `DB` binding by hand as the plan specifies.
- `wrangler d1 migrations apply --remote` asked for confirmation and auto-answered yes in the non-interactive shell, as the plan anticipated.
- First curl of the live URL returned 200 but the body grep missed; the second request (seconds later) returned the full page. Treated as edge propagation, not a defect.

## Authentication Gates
None. wrangler was already logged in via OAuth with D1 and Workers scopes, and the account already had a workers.dev subdomain (`your-subdomain`).

## User Setup Required
None for this plan. The Zero Trust enablement and Access-scoped API token remain prerequisites for Plan 01-02 (see STATE.md blockers).

## Next Phase Readiness
- Plan 01-02 can start: hostname for the Access app is `pipeflick.your-subdomain.workers.dev`; still needs Zero Trust enabled and an Access-scoped token (user action)
- Plan 01-03 can start: `DB` binding and `getSetting`/`setSetting` exist for the health page round-trip; `/health` link on the home page currently 404s by design
- No test framework yet, per plan; Phase 2 introduces vitest

---
*Phase: 01-foundation*
*Completed: 2026-09-14*
