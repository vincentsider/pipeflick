# Roadmap: Pipeflick

## Overview

Five phases take Pipeflick from an empty repo to the MVP text loop: a Cloudflare Worker that pulls Vincent's own lines out of a Fireflies transcript, turns pasted outlier posts into hidden templates, drafts three LinkedIn posts in his voice, records his accept/edit/reject decision on each, feeds approved posts back into the next run, and pushes accepted drafts to Zernio. The order follows the data flow (platform → source material → drafts → decisions → scheduling) so the voice-matching risk is hit as early as the pipeline allows.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Worker, D1, wrangler deploy, Cloudflare Access gate, secrets
- [x] **Phase 2: Voice Sources** - Fireflies import keeping only the executive's lines, pasted past posts
- [x] **Phase 3: Drafting** - Outliers to hidden templates, runs that produce three LinkedIn drafts
- [ ] **Phase 4: Approval Gate** - Accept, edit, reject with decisions stored, history, feedback into next prompt
- [ ] **Phase 5: Zernio Push** - Accepted drafts pushed to Zernio as unscheduled LinkedIn posts

## Phase Details

### Phase 1: Foundation
**Goal**: A deployed, access-gated Worker with a D1 database and secrets, ready to hold the pipeline
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. The app deploys with wrangler and responds at its Cloudflare URL
  2. Visiting the URL without a Cloudflare Access login is blocked; Vincent can log in and see the app
  3. D1 migrations apply and a health page shows the app can read and write the database
  4. OpenAI, Fireflies and Zernio keys are Worker secrets and the health page shows which are set without revealing values
**Research**: Likely (first Cloudflare deployment, framework choice)
**Research topics**: Cloudflare Access policy for a Worker route and how to validate the Access JWT in the Worker; D1 migrations with wrangler; server-rendered Worker framework choice (Hono vs plain fetch handler); local dev with wrangler dev and a local D1
**Plans**: 3 plans

Plans:
- [x] 01-01: Scaffold Hono Worker, D1 database and settings migration, local dev, first deploy
- [x] 01-02: Cloudflare Access gate (fail-closed middleware, hostname Access app, login verified)
- [x] 01-03: Worker secrets and health page (DB round-trip, secret presence without values)

### Phase 2: Voice Sources
**Goal**: The executive's own words are in the database: filtered Fireflies transcripts and pasted past posts
**Depends on**: Phase 1
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05, VOICE-06
**Success Criteria** (what must be TRUE):
  1. User sees whether the Fireflies connection works
  2. User sees a list of Fireflies meetings (title, date, duration) and can import one
  3. An imported transcript in D1 contains only the executive's lines; no other speaker's text is stored anywhere
  4. User sets their speaker name once in settings and can override the speaker match on any single import
  5. User pastes past LinkedIn posts and sees them, alongside imported transcripts, in a sources view
**Research**: Likely (external API)
**Research topics**: Fireflies GraphQL API for listing transcripts and fetching sentences with speaker names; auth header format; rate limits and pagination; how speaker names appear when unmatched
**Plans**: 3 plans

Plans:
- [x] 02-01: Speaker filter, test-first (vitest; keepSpeakerLines, countBySpeaker, matchSpeaker)
- [x] 02-02: Migration 0002 (transcripts, voice_samples), speaker-name setting, paste past posts, sources view
- [x] 02-03: Fireflies client, meeting list, preview with speaker override, filtered import, deploy and human check

### Phase 3: Drafting
**Goal**: A run turns one transcript plus two or three pasted outliers into three LinkedIn drafts in the executive's voice
**Depends on**: Phase 2
**Requirements**: OUTL-01, OUTL-02, DRAFT-01, DRAFT-02, DRAFT-03, DRAFT-05
**Success Criteria** (what must be TRUE):
  1. User pastes two or three outlier posts, picks one imported transcript, and starts a run
  2. The run produces exactly three drafts, each filled from one of the run's extracted templates
  3. Drafts contain only material from the executive's transcript lines and voice samples; templates are stored but never shown in the UI
  4. User sees the run's status while it generates, sees a clear error if OpenAI fails, and can retry
**Research**: Complete (see 03-RESEARCH.md, 2026-09-15)
**Research topics**: Current OpenAI API and model choice for extraction and drafting; structured output for the template shape; Worker CPU and request time limits versus multi-call generation (waitUntil, queues or a Durable Object if needed); prompt design for template extraction and voice-matched drafting
**Plans**: 7 plans (4 in 3 waves, plus 3 gap-closure plans in 2 waves). Re-verified 2026-09-15: both gaps closed, 3 items await live confirmation (03-VERIFICATION.md)

Plans:
- [x] 03-01: Prompt builders, schemas and grounding check (TDD, pure) — wave 1
- [x] 03-02: Migration 0003, run/job helpers, OpenAI Responses client — wave 1
- [x] 03-03: Run list, new-run form, run creation and status view — wave 2
- [x] 03-04: Step engine, auto-advance, retry, deploy and human check — wave 3

Gap closure (criterion 3 failed verification: the grounding check reads citations, not the post):
- [x] 03-05: Whole-post grounding check, normalised matching, repeat detection (TDD, pure) — wave 1
- [x] 03-06: Migration 0004, transcript coverage stored and shown before and after a run — wave 1
- [x] 03-07: Wire the check in, render what it found, retire `isGrounded`, deploy and human check — wave 2

### Phase 4: Approval Gate
**Goal**: Every draft gets a recorded human decision, and approved posts shape the next run
**Depends on**: Phase 3
**Requirements**: APPR-01, APPR-02, APPR-03, APPR-04, APPR-05, APPR-06, DRAFT-04
**Success Criteria** (what must be TRUE):
  1. User opens a run and sees its three drafts in an approval view
  2. User can accept a draft as-is, edit it inline then accept, or reject it, and the decision persists on refresh
  3. Every draft row holds original text, final text, decision and timestamp so the light-edit rate can be computed with one query
  4. User sees a list of past runs with the decision on each draft
  5. The next run's drafting prompt includes the most recent approved and edited posts as voice examples
**Research**: Unlikely (internal CRUD and UI using Phase 1 to 3 patterns)
**Plans**: 3 plans in 3 waves (planned 2026-09-15; split from 2 so the migration and D1 helpers land before anything renders through them)

Plans:
- [ ] 04-01: Migration 0005, decision storage, approved-post read, decisions in the run views — wave 1
- [ ] 04-02: Approval view (accept, inline edit, reject) and decisions in the run list — wave 2
- [ ] 04-03: Approved posts into the drafting prompt (DRAFT-04), deploy and human check — wave 3

### Phase 5: Zernio Push
**Goal**: An accepted draft reaches Zernio as an unscheduled LinkedIn post with one click
**Depends on**: Phase 4
**Requirements**: SCHED-01, SCHED-02, SCHED-03
**Success Criteria** (what must be TRUE):
  1. User sees whether the Zernio connection works
  2. User clicks once on an accepted draft and it appears in Zernio as an unscheduled LinkedIn post
  3. The draft shows its pushed state and Zernio id, and a failed push shows a clear error
**Research**: Likely (external API)
**Research topics**: Zernio API authentication (user token, user id, blog id); endpoint and payload for creating a LinkedIn post as a draft rather than scheduled; how to read back the post id; whether the API is available on Vincent's plan
**Plans**: 1 plan

Plans:
- [ ] 05-01: Zernio client, push button, pushed state and error handling

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-09-14 |
| 2. Voice Sources | 3/3 | Complete | 2026-09-15 |
| 3. Drafting | 7/7 | Complete | 2026-09-15 |
| 4. Approval Gate | 0/3 | Planned | - |
| 5. Zernio Push | 0/1 | Not started | - |
