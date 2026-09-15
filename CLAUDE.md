# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack and commands

Cloudflare Worker written in TypeScript with Hono + `hono/jsx` server rendering (no build step beyond wrangler's esbuild), D1 for storage, wrangler for dev/deploy. Source lives in `src/`, migrations in `migrations/`. `wrangler types` generates `worker-configuration.d.ts` (gitignored), which is where the `Env` binding type comes from; do not add `@cloudflare/workers-types`.

`wrangler.jsonc` is **gitignored** — it holds the real D1 `database_id` and the local dev identity. `wrangler.example.jsonc` is the committed template; copy it to `wrangler.jsonc` and fill in your own values. Nothing in the public repo carries account, database or Access identifiers.

- `npm run dev` — local dev server at http://localhost:8787 (Miniflare, local D1 under `.wrangler/state`)
- `npm run check` — regenerate types and run `tsc --noEmit`
- `npm run deploy` — deploy to workers.dev
- `npm run types` — regenerate `worker-configuration.d.ts` only
- `npm run db:migrate:local` / `npm run db:migrate:remote` — apply `migrations/*.sql` to the local or production D1 (`pipeflick-db`)
- `npm run secrets:push` — after filling `.dev.vars`, push every line in it as a Worker secret (`wrangler secret bulk .dev.vars`); keep `.dev.vars` to real secrets only, no local toggles

Deployed at: https://pipeflick.your-subdomain.workers.dev

After any deploy, open `/health` first (or `/health.json` for scripts): it round-trips a timestamp through D1 and shows each secret as set / not set.

### Secrets

The Worker needs `OPENAI_API_KEY`, `FIREFLIES_API_KEY` and `ZERNIO_USER_TOKEN` (names declared in `src/env.ts`, template in `.dev.vars.example`). Values live in exactly two places: `.dev.vars` locally (gitignored, read by `wrangler dev`) and Worker secrets remotely (`npm run secrets:push`). Never store them in D1, in `wrangler.jsonc` `vars`, or in any committed file, and never render, log or prefix-print a value; `/health` only reports presence. Do not run `wrangler secret bulk .env` — that file belongs to an unrelated tool.

`logs/infinity-rules-mcp.log` is noise from an unrelated Pega MCP plugin and `cache/rag_queries/` is empty; neither belongs to this project.

## What is being built

Pipeflick is an AI content manager for busy executives (initially Jersey finance, data and professional-services leaders). The pipeline, end to end:

1. **Outlier detection**: find over-performing posts/videos in the executive's market. Market data comes only from owned exports, Apify, or curated libraries. No platform scraping.
2. **Extract to template**: break each outlier into a reusable format (hook, structure, angle); pull transcripts from viral videos.
3. **Voice capture**: ingest the executive's own material (Fireflies meeting transcripts, voice notes, texts, newsletters, prior writing) as the fuel for voice and substance.
4. **Drafting**: fill the templates with the executive's own words to produce newsletters, LinkedIn posts and X posts.
5. **Video** (second build within the pilot, after the text loop is proven): executive records to camera, AI does cuts/clean-up, exports 4K, produces a transcript that also feeds written content.
6. **Approval gate**: a simple dashboard where the executive accepts, edits or rejects each draft. This human-in-the-loop step is mandatory; auto-publishing is out of scope.
7. **Insights layer**: learn from what performed and feed it back into future drafts.

### Thinnest first version (build this first)

Feed in one meeting transcript or voice note plus two or three chosen competitor outliers, and produce three approved, on-brand text posts in the executive's voice through a simple approval view. Text only. No infographics, no scheduling, no multi-client. Everything else is an extension once this loop produces posts the executive would genuinely publish.

### Explicitly out of scope for the pilot

Auto-publishing (with or without approval), AI infographics/branding, human-editor touch-up tooling, multi-client SaaS/billing/onboarding, paid ads, comment or DM automation, any platform scraping. If publishing is ever needed, route it through the approved scheduler (Zernio) rather than posting directly to LinkedIn.

## Success criteria the code must serve

- A full week of content (5 to 6 posts per platform) in 1 to 2 hours of the executive's time, down from ~8.
- At least 80% of AI drafts approved with only light edits. The approval gate should record accept/edit/reject so this is measurable.
- 90%+ of content produced without writing from a blank page.
- Kill criteria: fewer than half the drafts usable, no real time saving, or real executive data unusable for compliance reasons.

## Data handling constraints (Data Protection (Jersey) Law 2018, GDPR-equivalent)

These shape the data model and ingestion code, not just policy:

- Meeting transcripts include other participants. Only the executive's own contributions may be used; design ingestion to filter by speaker.
- For executives at JFSC-regulated firms, strip client identifiers and use only the executive's own commentary.
- Minimal storage, delete on request. Prefer owned or local storage over US cloud (Fireflies is US-hosted; check transfer acceptability or replace).
- The first trial runs on the founder's own data, so the build is never blocked on third-party consent.

## Configuration and secrets

- `.env` and `.mcp.json` are gitignored and contain live credentials (Supabase access token, Discord bot token, ElevenLabs key, PixelLab key, SSH host). Never copy their contents into tracked files or commit them.
- `.mcp.json` configures a Supabase MCP server pointed at a specific project ref, which signals Supabase as the intended backing store. Inspect existing tables before schema changes and prefer local development before applying migrations to the remote project.
- ElevenLabs is available via MCP and is the likely candidate for the voice/transcript side of the pipeline.
