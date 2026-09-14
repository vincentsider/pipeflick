# Pipeflick

## What This Is

An AI content manager for busy executives. It takes the executive's own words (Fireflies meeting transcripts, past LinkedIn posts) and market-proven post formats (outlier posts the executive pastes in), and drafts LinkedIn posts that follow a proven structure while sounding unmistakably like them. The executive reviews each draft in a simple web app, edits or accepts it, and approved posts are pushed to Zernio for scheduling. First user is Vincent (the founder) on his own data; second is one willing executive in Jersey's finance, data and professional-services scene.

## Core Value

Drafts sound like the executive and follow a proven format, so at least 80% get approved with only light edits and a week of content costs them about an hour instead of eight.

## Requirements

### Validated

(None yet — ship to validate)

### Active

MVP (text loop, LinkedIn only):

- [ ] Connect Fireflies via API key, list meetings, pull a chosen transcript with speaker labels
- [ ] Keep only the executive's own lines from a transcript; drop all other speakers entirely
- [ ] Ingest the executive's past LinkedIn posts as voice samples
- [ ] Paste in two or three outlier LinkedIn posts as plain text
- [ ] Extract a reusable template (hook, structure, angle) from each outlier, internally, not shown to the user
- [ ] Generate three LinkedIn drafts per run using OpenAI, filling templates with the executive's own words and voice
- [ ] Approval view: accept, edit inline, or reject each draft
- [ ] Store original and edited text for every draft, plus the accept/edit/reject decision, so the light-edit rate is measurable
- [ ] Feed recently approved and edited posts back into the next drafting prompt as voice examples
- [ ] Push approved posts to Zernio for scheduling
- [ ] Single-user login sufficient for Vincent to use it alone
- [ ] Deployed on Cloudflare Workers with D1 for data and R2 for any files

Pilot extensions (after MVP is proven):

- [ ] Newsletter and X output formats (same pipeline, different templates)
- [ ] Outlier detection: find over-performing posts and videos in a chosen market via Apify or owned exports
- [ ] Saved outlier library tagged by niche
- [ ] Video: record to camera, AI cuts and clean-up, 4K export, transcript that feeds written content
- [ ] Video reference board: cluster outlier videos and merge components into one concept and script
- [ ] Insights layer that learns from what performed and improves future drafts
- [ ] Second user: the pilot executive, with their own data and consent handling

### Out of Scope

- Auto-publishing without human approval — the approval gate is the product's trust mechanism; approved posts go to Zernio as scheduled drafts, never straight to LinkedIn
- Direct LinkedIn posting — LinkedIn restricts it; Zernio is the route
- AI-generated infographics and branding — roadmap, after the text loop works
- Human editor touch-up tooling — roadmap
- Multi-client SaaS, billing, onboarding at scale — pilot proves the loop on one or two people
- Paid ads, comment management, DM automation — different product
- Any platform scraping — market data comes only from pasted text, owned exports, Apify, or curated libraries
- Fetching LinkedIn posts by URL — LinkedIn blocks it; paste text instead
- Showing or editing extracted templates in the MVP — user chose to hide them; revisit if drafts are off-voice and hard to diagnose

## Context

- **Origin:** Let's Build AI 2026 (Digital Jersey), Part B. The full pilot PRD is in `prd.md` at the repo root.
- **Problem:** executives have deep expertise but post rarely because writing is slow. Ghostwriters cost £30k to £40k a year or £1.5k to £3k a month freelance and still need constant input. Generic AI tools sound like nobody and don't perform. Existing tools (Metricool, Publer, Stanley, Poppy AI, KLOE) are scattered and none is built for executives.
- **Biggest risk:** voice matching isn't close enough and drafts need heavy rewriting. The MVP is designed to hit this risk first and nothing else; everything else is plumbing.
- **Data available now:** Vincent's own Fireflies transcripts and past LinkedIn posts. One executive has agreed to provide data for free once the loop works.
- **Existing accounts:** Fireflies, Zernio, OpenAI, Cloudflare (Vincent can log in via wrangler). A Supabase project exists in `.mcp.json` but is not used by this project; everything runs on Cloudflare.
- **Success criteria from the PRD:** a week of content (5 to 6 posts per platform) in 1 to 2 hours; 80%+ drafts approved with light edits; 90%+ of content produced without a blank page; at least one real executive publishes a full week from the pilot.
- **Kill criteria:** fewer than half the drafts usable without heavy rewriting; no real time saving over existing tools; compliance makes real executive data unusable.

## Constraints

- **Tech stack**: Cloudflare Workers, D1, R2, deployed with wrangler — single platform, single login, data in one place
- **LLM**: OpenAI API for template extraction and drafting — user preference
- **Integrations**: Fireflies API (transcripts in), Zernio API (approved posts out) — both accounts exist
- **Compliance**: Data Protection (Jersey) Law 2018 (GDPR-equivalent) — only the executive's own transcript lines are stored or used; other speakers are dropped at ingestion; minimal storage; delete on request
- **Compliance (later)**: for executives at JFSC-regulated firms, strip client identifiers and obtain written permission — affects the second-user phase, not the MVP
- **Data residency**: Fireflies is US-hosted — acceptable for Vincent's own data; check transfer terms before the pilot executive's data goes through it
- **Scope**: LinkedIn text only in the MVP — newsletters, X and video wait until three posts have been published from the tool

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LinkedIn only for the MVP | Other formats are the same pipeline with different templates; one platform keeps evaluation honest | — Pending |
| Manual outlier input (paste text) | Detection is a plumbing problem; template extraction and voice matching are the real risk | — Pending |
| All on Cloudflare (Workers, D1, R2) | One deploy, one login, data in one place | — Pending |
| OpenAI for drafting | User preference | — Pending |
| Fireflies API rather than paste | Speaker labels come free, which makes dropping other speakers easy | — Pending |
| Drop other speakers entirely | Matches the PRD consent rule; simplest compliant option | — Pending |
| Hide extracted templates from the user | Fewer steps; user chose this over a visible, editable step | ⚠️ Revisit if drafts are off-voice and hard to diagnose |
| Feed approved edits back into the next prompt | Cheapest form of the insights layer; starts learning from day one | — Pending |
| Push approved posts to Zernio | Pulls scheduling into the MVP; user has an account and wants the loop to end in a scheduled post | — Pending |
| MVP proven when Vincent publishes 3 posts from it | Concrete, personal, no third-party dependency | — Pending |

---
*Last updated: 2026-09-14 after initialization*
