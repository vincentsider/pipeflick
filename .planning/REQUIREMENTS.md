# Requirements: Pipeflick

**Defined:** 2026-09-14
**Core Value:** Drafts sound like the executive and follow a proven format, so at least 80% get approved with only light edits and a week of content costs them about an hour instead of eight.

## v1 Requirements

Requirements for the MVP text loop (LinkedIn only, Vincent's own data). Each maps to roadmap phases.

### Voice Sources

- [ ] **VOICE-01**: App connects to Fireflies with a configured API key and reports whether the connection works
- [ ] **VOICE-02**: User can list their Fireflies meetings (title, date, duration) and pick one to import
- [ ] **VOICE-03**: User sets their own speaker name once, and can override which speaker is them on any single import
- [ ] **VOICE-04**: Importing a transcript keeps only the executive's lines and discards every other speaker before anything is stored
- [ ] **VOICE-05**: User can paste past LinkedIn posts as plain text and save them as voice samples
- [ ] **VOICE-06**: User can see the stored transcripts and voice samples

### Outliers

- [ ] **OUTL-01**: User can paste two or three outlier LinkedIn posts as plain text for a run
- [ ] **OUTL-02**: System extracts a template (hook, structure, angle) from each outlier with OpenAI and stores it, not shown in the UI

### Drafting

- [ ] **DRAFT-01**: User can start a run by choosing one imported transcript and the run's pasted outliers
- [ ] **DRAFT-02**: A run produces exactly three LinkedIn drafts, each filled from one of the run's templates
- [ ] **DRAFT-03**: Drafts draw only on the executive's own transcript lines and voice samples, never other speakers
- [ ] **DRAFT-04**: The drafting prompt includes the most recent approved and edited posts as voice examples
- [ ] **DRAFT-05**: User sees run status and a clear error if generation fails, and can retry the run

### Approval

- [ ] **APPR-01**: User can view a run's three drafts in an approval view
- [ ] **APPR-02**: User can accept a draft as-is
- [ ] **APPR-03**: User can edit a draft inline and accept the edited version
- [ ] **APPR-04**: User can reject a draft
- [ ] **APPR-05**: Every draft stores original text, final text, decision and timestamp so the light-edit rate can be computed from data
- [ ] **APPR-06**: User can see past runs and the decision on each draft

### Scheduling

- [ ] **SCHED-01**: App connects to Zernio with configured credentials
- [ ] **SCHED-02**: User can push an accepted draft to Zernio as an unscheduled LinkedIn post with one click
- [ ] **SCHED-03**: User sees whether the push succeeded, and the draft records its pushed state and Zernio id

### Platform

- [x] **PLAT-01**: App runs on Cloudflare Workers with D1, deployed with wrangler
- [x] **PLAT-02**: App is gated by Cloudflare Access so only Vincent can reach it
- [x] **PLAT-03**: OpenAI, Fireflies and Zernio keys live in Worker secrets, never in D1 or the repo

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Voice Sources

- **VOICE-07**: User can upload a LinkedIn data export CSV to import all past posts at once
- **VOICE-08**: User can upload a voice note and have it transcribed into a usable transcript
- **VOICE-09**: User can delete an individual transcript or voice sample
- **VOICE-10**: User can delete all their data with one control

### Drafting

- **DRAFT-06**: User can give an optional topic or angle hint before generating
- **DRAFT-07**: User can regenerate a single draft without redoing the run
- **DRAFT-08**: User can select several transcripts per run

### Approval

- **APPR-07**: User can see the light-edit rate and decision counts in the app
- **APPR-08**: User can give a reject reason that feeds later prompts

### Scheduling

- **SCHED-04**: User can pick a schedule date and time when pushing to Zernio

### Pilot extensions (from PROJECT.md)

- **FORMAT-01**: Newsletter and X output formats using the same pipeline with different templates
- **OUTL-03**: Outlier detection via Apify or owned exports
- **OUTL-04**: Saved outlier library tagged by niche
- **VIDEO-01**: Record to camera, AI cuts and clean-up, 4K export, transcript feeds written content
- **VIDEO-02**: Video reference board that clusters outlier videos into one concept and script
- **INSIGHT-01**: Insights layer that learns from what performed and improves future drafts
- **USER-01**: Second user (the pilot executive) with their own data, consent handling and JFSC client-identifier stripping

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-publishing without human approval | The approval gate is the product's trust mechanism |
| Direct LinkedIn posting | LinkedIn restricts it; Zernio is the route |
| AI-generated infographics and branding | Roadmap, after the text loop works |
| Human editor touch-up tooling | Roadmap |
| Multi-client SaaS, billing, onboarding at scale | Pilot proves the loop on one or two people |
| Paid ads, comment management, DM automation | Different product |
| Platform scraping, fetching LinkedIn posts by URL | Blocked by LinkedIn and non-compliant; paste text instead |
| Showing or editing extracted templates | User chose to hide them; revisit if drafts are off-voice and hard to diagnose |
| R2 storage in the MVP | Nothing in the text loop stores files |
| Delete-my-data UI in the MVP | Only Vincent's data in v1; delete on request is met by a wrangler D1 command. Becomes VOICE-09/10 before the second user |

## Traceability

Which phases cover which requirements. Updated by create-roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VOICE-01 | Phase 2 | Pending |
| VOICE-02 | Phase 2 | Pending |
| VOICE-03 | Phase 2 | Pending |
| VOICE-04 | Phase 2 | Pending |
| VOICE-05 | Phase 2 | Pending |
| VOICE-06 | Phase 2 | Pending |
| OUTL-01 | Phase 3 | Pending |
| OUTL-02 | Phase 3 | Pending |
| DRAFT-01 | Phase 3 | Pending |
| DRAFT-02 | Phase 3 | Pending |
| DRAFT-03 | Phase 3 | Pending |
| DRAFT-04 | Phase 4 | Pending |
| DRAFT-05 | Phase 3 | Pending |
| APPR-01 | Phase 4 | Pending |
| APPR-02 | Phase 4 | Pending |
| APPR-03 | Phase 4 | Pending |
| APPR-04 | Phase 4 | Pending |
| APPR-05 | Phase 4 | Pending |
| APPR-06 | Phase 4 | Pending |
| SCHED-01 | Phase 5 | Pending |
| SCHED-02 | Phase 5 | Pending |
| SCHED-03 | Phase 5 | Pending |
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-14*
*Last updated: 2026-09-14 after roadmap creation*
