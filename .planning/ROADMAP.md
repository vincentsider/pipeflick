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
- [x] **Phase 4: Approval Gate** - Accept, edit, reject with decisions stored, history, feedback into next prompt
- [ ] **Phase 5: Zernio Push** - Accepted drafts pushed to Zernio as unscheduled LinkedIn posts
- [ ] **Phase 6: Accounts** - Invited accounts, every row owned by one of them, and a run allowance
- [ ] **Phase 7: Paid Credits** - Paddle checkout tops up a credit balance that runs consume

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
**Plans**: 3 plans in 3 waves (planned 2026-09-15; split from 2 so the migration and D1 helpers land before anything renders through them). Verified 2026-09-15: 16/17 must-haves, 0 failed, status `human_needed` — four items await live confirmation (04-VERIFICATION.md)

Plans:
- [x] 04-01: Migration 0005, decision storage, approved-post read, decisions in the run views — wave 1
- [x] 04-02: Approval view (accept, inline edit, reject) and decisions in the run list — wave 2
- [x] 04-03: Approved posts into the drafting prompt (DRAFT-04), deploy and human check — wave 3

### Phase 5: Zernio Push
**Goal**: An accepted draft reaches Zernio as an unscheduled LinkedIn post with one click
**Depends on**: Phase 4
**Requirements**: SCHED-01, SCHED-02, SCHED-03
**Success Criteria** (what must be TRUE):
  1. User sees whether the Zernio connection works
  2. User clicks once on an accepted draft and it appears in Zernio as an unscheduled LinkedIn post
  3. The draft shows its pushed state and Zernio id, and a failed push shows a clear error
**Research**: Complete (see DISCOVERY.md, 2026-09-15) — read against the authoritative OpenAPI 3.1 spec at zernio.com/openapi.yaml, not the prose docs, which disagree with it on the draft field
**Research topics**: Zernio API authentication (Bearer API key, `sk_` + 64 hex); `POST /v1/posts` with `isDraft: true` for an unscheduled post; `post._id` read back from the 201; whether the API is available on Vincent's plan — not answerable from documentation, and `GET /v1/accounts` on the `/zernio` page is the empirical test
**Plans**: 4 plans in 3 waves (planned 2026-09-15; the roadmap's original estimate of 1 predates the research, which turned up a migration, a client, a connection/account page and the push path)

Plans:
- [ ] 05-01: Zernio client and the publish-safety pin (`isDraft` asserted by test) — wave 1
- [ ] 05-02: Migration 0006, push state stored per draft — wave 1
- [ ] 05-03: `/zernio` connection page and LinkedIn account selection (SCHED-01) — wave 2
- [ ] 05-04: Push button, route, pushed state, deploy and human check — wave 3

### Phase 6: Accounts
**Goal**: Anyone can register and use Pipeflick on their own material, with every stored row owned by exactly one account and Vincent's existing data still his
**Depends on**: Phase 5
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, ACCT-06
**Success Criteria** (what must be TRUE):
  1. An address the operator adds to the Access invite list can sign in and is treated as its own account, with no code change and no deploy (decided 2026-09-16: invite-list, because every account can spend the operator's OpenAI credit)
  2. Every transcript, voice sample, run, outlier, draft and setting belongs to exactly one account, and every row that existed before the migration belongs to vincent@getinference.com
  3. A signed-in user sees only their own data on every screen, and a URL naming another account's run or draft answers not-found rather than showing it
  4. Each user connects their own Fireflies and Zernio accounts, and no user's imports or pushes can use another user's credentials
  5. The public demo no longer exposes real accounts
  6. A user can delete their account and everything it owns
  7. An account cannot start a run it has no allowance left for
**Research**: Likely
**Research topics**: Cloudflare Access self-registration (one-time PIN to any email) — policy shape, seat limits and cost past the free tier; where per-user third-party credentials should live (encrypted column in D1 vs Workers KV vs Secrets Store) and how they are encrypted at rest; whether `ctx.access` still carries an identity for a self-registered user

**This phase is a deliberate scope change, not a gap.** CLAUDE.md lists multi-client SaaS and onboarding as explicitly out of scope for the pilot, and PLAT-02 currently reads "gated by Cloudflare Access so only Vincent can reach it". Phase 6 supersedes PLAT-02 and reopens that decision on purpose; it should not start until the pilot's own question — whether the drafts are good enough to publish — has an answer, because multi-tenancy makes every later change more expensive without moving that number.

**Two things that are larger than they look:**
- **Third-party keys stop being the operator's.** OpenAI can stay a Worker secret because the operator pays for it. Fireflies and Zernio cannot: another user's meetings live in their Fireflies account and their posts belong in their Zernio. Both must move out of Worker secrets into per-account storage, which reverses the Phase 1 decision that keys live in Worker secrets and never in D1 (PLAT-03). Storing other people's API keys means encrypting them and owning that risk.
- **Compliance changes category.** The pilot runs on the founder's own data specifically so it is never blocked on third-party consent. The moment another user imports a meeting, the project processes third parties' recordings and becomes a data processor under the Data Protection (Jersey) Law 2018: a privacy notice, a processing agreement, deletion on request, and a defensible answer on Fireflies being US-hosted. That is a prerequisite for letting a real user import a real meeting, not a follow-up.

**Plans**: 7 plans in 5 waves (planned 2026-09-16; the estimate of 4 predates DISCOVERY.md, which separated the migration from the query scoping, and split credential sealing out as a pure TDD module. Three plans run in parallel in wave 1)

Plans:
- [ ] 06-01: Migration 0008 — `owner_email` on the four root tables, backfill to vincent@getinference.com — wave 1
- [ ] 06-02: Access self-registration and the owner identity (decision + human check) — wave 1
- [ ] 06-03: Credential sealing, AES-GCM over WebCrypto (TDD, pure) — wave 1
- [ ] 06-04: Ownership as the WHERE clause — `src/db.ts` and all 45 call sites — wave 2
- [ ] 06-05: Per-account Fireflies and Zernio credentials, migration 0009 — wave 3
- [ ] 06-06: Per-account run allowance, so an invited account cannot spend without limit — wave 4
- [ ] 06-07: Close the public demo, account deletion, deploy and human check — wave 5


### Phase 7: Paid Credits
**Goal**: A user buys credits through Paddle and their runs consume them, so the service pays for itself instead of running on the operator's card
**Depends on**: Phase 6
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05
**Success Criteria** (what must be TRUE):
  1. A user sees their credit balance and what a run costs before starting one
  2. A user can buy credits with a card and the balance rises without anyone intervening
  3. A run consumes credits, and a user with too few cannot start one
  4. Every credit added or consumed is recorded, so a disputed balance can be answered from data
  5. A payment that Paddle reports twice adds credits once
  6. Nothing is charged silently: the price is shown before checkout and a receipt exists after
**Research**: Complete for the choice (see below); Likely for the integration
**Research topics**: Paddle Billing one-time prices and the `transaction.completed` webhook shape; webhook signature verification in a Worker (no Node crypto — WebCrypto HMAC); Paddle.js checkout overlay versus a hosted payment link; sandbox versus live environment switching

**Why Paddle and not Stripe.** Paddle is a **Merchant of Record**: Paddle is the legal seller, and handles payments, sales tax and compliance across 300+ markets. A Jersey-based operator selling to executives in other jurisdictions would otherwise have to work out VAT/sales-tax registration per market themselves. That is the single largest reason this phase is tractable at all, and it is why the choice is not a toss-up with Stripe. A credit top-up is a **one-time price** (no recurring interval), which skips Paddle's subscription engine entirely and is fulfilled by the `transaction.completed` webhook.

**Credits are not dollars, and that is deliberate.** Sell "a run costs N credits", never the OpenAI figure. It decouples the user-facing price from OpenAI's, so exercising the quality lever recorded in STATE — swapping `MODEL_DRAFT` to a stronger model — changes the operator's margin and not the customer's price. Pricing in real cost would make every model decision a pricing decision.

**What Phase 6 already built for this.** 06-06's allowance is the same check in cheaper clothing: `assertCanStartRun(db, owner)` is a named seam whose body swaps from "decrement a run" to "decrement a credit balance", and the route does not change. `usage_json` has stored per-call token counts on every job since Phase 3, so metering real cost per account needs a price table and an aggregation, not new instrumentation.

**Three things that are larger than they look:**
- **Money makes idempotency mandatory.** Webhooks retry. The same `transaction.completed` arriving twice must add credits once, which needs the Paddle transaction id stored and uniquely constrained — not a "have we seen this?" read followed by an insert. This is the one place in the project where getting concurrency wrong costs real money in the customer's favour or the operator's.
- **Reserve versus settle.** A call's cost is known only after it returns. The engine's one-call-per-invocation shape (03-02/03-04) is a genuine advantage here: checking the balance per step bounds an overdraft to roughly $0.02 rather than a whole run.
- **Selling changes the legal posture, on top of Phase 6's.** Phase 6 makes the project a data processor. Phase 7 makes it a business taking money: terms of service, refund policy, and a receipt trail. Paddle as MoR absorbs the tax side but not the terms or the refund decisions.

**Do not start this before the pilot has an answer.** Phase 7 monetises drafts good enough for an executive to publish. That is still unproven and untested since run 1. If the answer is no, this is infrastructure for a product that changes underneath it.

**Plans**: 5 plans estimated (not yet planned) — credit ledger and balance; Paddle client and checkout; webhook receiver with idempotency; consumption per step replacing the allowance; balance UI, deploy and human check


## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-09-14 |
| 2. Voice Sources | 3/3 | Complete | 2026-09-15 |
| 3. Drafting | 7/7 | Complete | 2026-09-15 |
| 4. Approval Gate | 3/3 | Complete | 2026-09-15 |
| 5. Zernio Push | 0/4 | Planned | - |
| 6. Accounts | 0/7 | Planned | - |
| 7. Paid Credits | 0/5 | Not planned | - |
