# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-14)

**Core value:** Drafts sound like the executive and follow a proven format, so at least 80% get approved with only light edits and a week of content costs them about an hour instead of eight.
**Current focus:** Phase 3 gap closure (03-05 ✓, 03-06 ✓, 03-07) before Phase 4. The drafting loop runs end to end on production and the engine is verified; draft quality is not. The gap-closure wave is done: the executive can now see how much of their meeting reached the model, and there is a grounding check that reads the whole draft instead of the three lines the model chose to report. 03-07 wires it in and deploys

## Current Position

Phase: 3 of 5 (Drafting) — gap closure in progress
Plan: 03-01 ✓, 03-02 ✓, 03-03 ✓, 03-04 ✓, 03-05 ✓, 03-06 ✓. Waves: [03-01 ✓, 03-02 ✓] → [03-03 ✓] → [03-04 ✓] → gap closure [03-05 ✓, 03-06 ✓] → [03-07]
Status: The engine was verified and the drafts were not. 03-VERIFICATION.md found two gaps; both are now closed in code. Gap 2 (silent transcript truncation) is visible before and after a run. Gap 1 (grounding) has its check built and calibrated in 03-05 — 03-07 owns the call site, the storage and the deploy. The 80% approval target remains unmet and untested since run 1, and 03-05's calibration is a second line of evidence for why
Last activity: 2026-09-15 — Completed 03-05-PLAN.md (whole-post grounding check, calibrated against production run 1)

Progress: █████████▏ 92% (12 of 13 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: ~8 min agent time
- Total execution time: ~1.4 hours agent time (excluding user time on the Cloudflare dashboard, filling .dev.vars, and the 02-03 / 03-04 verification checkpoints)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | ~33 min | ~11 min |
| 2 | 3/3 | ~15 min agent (~27 min wall) | ~5 min |
| 3 | 5/7 | ~49 min agent (~2.6h wall) | ~10 min |
| 3 (gap closure) | 2/3 | ~21 min agent | ~11 min |

**Recent Trend:**
- Last 5 plans: 01-02 (~15 min, includes a human-action pause), 01-03 (~15 min agent, ~42 min wall with two human pauses), 02-01 (~3 min, fully autonomous TDD), 02-02 (~4 min, fully autonomous, ran in parallel with 02-01), 02-03 (~8 min agent, ~20 min wall with one human-verify checkpoint)
- Wave 1 of Phase 3 ran two plans in parallel with zero file overlap (03-01: prompts/tests; 03-02: migration/db/openai). 03-02 took ~8 min fully autonomous
- 03-03 (~5 min, fully autonomous): the fastest plan yet, because 03-02 had already shaped the reads the page needed — the only work was rendering and validation
- 03-04 (~19 min agent, ~2h wall): the longest agent time of the phase, because the whole paid path was verified for free first — nine page states and every failure mode driven against a deliberately invalid key before a penny was spent
- 03-06 (~9 min, fully autonomous, gap closure wave): a migration, two files and a rendering change; about half the time went on seeding local D1 with a long transcript, a short one and a pre-migration run so all three coverage states could be seen rather than reasoned about
- 03-05 (~12 min, fully autonomous TDD, ran in parallel with 03-06): RED/GREEN took ~5 min; the other ~7 went on calibrating against the real production drafts — exporting run 1, sweeping thresholds, and checking whether a flagged sentence was actually a fabrication before accepting the verdict. The measurement is what made the SUMMARY honest, and it contradicted the plan
- Trend: steady — Phase 2 averaged ~5 min per plan; the wall-clock cost is concentrated in the two verification checkpoints (02-03, 03-04), which is exactly where a human should be in the loop (first real executive data, then first real output)

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
- 03 plan: architecture is one OpenAI call per Worker invocation driven by D1 job rows (migration 0003: `runs`, `outliers`, `drafts`) plus a self-submitting POST form. Rejected: all-calls-in-one-request (no status, loses everything on disconnect), `Promise.all` (no status, no prompt cache), `ctx.waitUntil` (caps at 30s), Queues / Durable Objects / Workflows (all free-tier available, but over-build for one user), cron sweep (60s granularity). Revisit Workflows if a run grows past ~10 steps
- 03 plan: models are `gpt-5.6-terra` (extraction) and `gpt-5.6-sol` (drafting), both `reasoning.effort: "low"`, via the **Responses** API (`text.format` json_schema — flattened, NOT Chat Completions' `response_format`). Raw `fetch`, no `openai` package. ~$0.19/run. The quality lever if approval is under 80% is one constant: swap drafting to `gpt-6-astra`
- 03 plan: `src/prompts.ts` is pure and import-free by design — `buildDraftingInput` takes primitives only, so no code path can send a Fireflies meeting title (which names counterparties) or a speaker label to OpenAI. Asserted in `test/prompts.test.ts`
- 03 plan: `store: false` on every OpenAI request (the Responses default is 30-day application-state retention). Abuse-monitoring logs are still kept 30 days; changing that needs a ZDR agreement — state it honestly, do not claim zero retention
- 03 plan: claim-then-work before every call (`SELECT` then conditional `UPDATE`, `meta.changes === 1`); no `RETURNING` (undocumented in D1). Auto-advance renders its `<script>` only when work is claimable, the last failure was retryable and `attempts < 2` — otherwise a bad key loops forever
- 03 plan: `outliers.template_json` is stored but never rendered, and is excluded from the `getRunView` projection so OUTL-02 is structural rather than a rendering discipline
- 03-01: `src/prompts.ts` is the phase's compliance boundary — zero imports, primitives-only builders. `buildDraftingInput(samples: string[], transcriptBody: string, template: Template)` must never gain a row-taking overload, and no call site may pass a meeting title "for context". Both halves are asserted in `test/prompts.test.ts` (payload excludes the title/speaker, and the source file contains no `import`)
- 03-01: every model id, token cap, timeout and character cap lives as a named constant in `src/prompts.ts`, not inline at the call site. The approval-rate lever is one line there: `MODEL_DRAFT` from `gpt-5.6-sol` to `gpt-6-astra`
- 03-01: `excerptTranscript` returns `{ text, linesUsed, linesTotal }` (counts, not a truncated flag) so the run page renders "using the first N of M lines" without a second pass over the body; a line longer than the whole 12000-char budget is truncated inside rather than dropped
- 03-01: `isGrounded` rejects whitespace-only citations as well as an empty array — `body.includes("")` is always true, so a naive check would score an empty citation as grounded. A false is a warning beside the draft, never a hard failure
- 03-01: the load-bearing instruction phrases (banned words, "Invent nothing.", "Do not name clients…", the never-mention-a-transcript rule, the em-dash ban) are pinned by test, so a reword cannot silently drop one
- 03-02: the claim UPDATE guards on `started_at` as well as `status` (`WHERE id = ?2 AND status = ?3 AND started_at IS ?4`, bound to the values just read). Status alone is not exclusive for a stale `running` row — two invocations would both match and both pay. `meta.changes === 1` still decides the winner; no `RETURNING`. Stale window `STALE_JOB_MS = 180_000`
- 03-02: `resetRunJobs` resets only `status != 'done'` rows (verified by before/after dump), so Retry never re-pays for a finished OpenAI call. `getRunView` omits both `template_json` and `outliers.body` at the query
- 03-02: `claimNextJob` returns the template as the raw JSON string, so `src/db.ts` imports nothing from `src/prompts.ts`; `finishOutlier`/`finishDraft` take the OpenAI `usage` object structurally and flatten it to `{input_tokens, output_tokens, reasoning_tokens}` before writing `usage_json`
- 03-02: migration 0003 added `drafts.grounded INTEGER` (not in 03-RESEARCH.md's DDL) because `finishDraft` must store the source-line check; `usage_json` on both job tables makes the cost estimate a measurement after two runs
- 03-03: run progress is always `done_jobs` of `total_jobs`, never "of 6" — `createRun` accepts 2 or 3 outliers, so a run has 5 or 6 steps and a hardcoded 6 would permanently misreport a finished two-outlier run
- 03-03: the status page's outlier excerpt is cut by SQLite `substr(body, 1, 80)` inside the `getRunView` projection (`OUTLIER_EXCERPT_CHARS`), so the page stays at three reads and the rest of the pasted post never enters the Worker. `template_json` remains unselected — that rule is untouched
- 03-03: `getRunView` LEFT JOINs the transcript title into `RunView.transcript_title` (the `listRuns` pattern), so a deleted transcript renders "(transcript deleted)" instead of dropping the run
- 03-03: an ungrounded draft gets amber `.notice.warn`, not red `.notice.error` — it is a reviewer's cue, not a failed step, and the draft is always still shown
- 03-03: a malformed run id is 400 and an unknown run is 404, matching the `src/sources.tsx` transcript-detail precedent. `RUN_ID_PATTERN` guards the UUID shape before D1
- 03-03: route table is `GET /runs`, `GET /runs/new`, `POST /runs`, `GET /runs/:id`; components are `RunTable`, `NewRunForm`, `StepStatus`, `Failure`, `TemplateSteps`, `DraftSection`, `progress`. 03-04's auto-advance form belongs between the progress paragraph and `<h3>Templates</h3>`
- 03-02: `src/openai.ts` classifies by `error.code` — the four billing/spend/usage 429 codes are NOT retryable; `bad_json` and `bad_body` were added so no unhandled `SyntaxError` can 500 the step route and strand a claimed job. `retryable` is computed, NOT persisted: 03-04 resolved this by mapping `error_code` back in `RETRYABLE_ERROR_CODES` (no migration 0004 needed)
- 03-04: `RETRYABLE_ERROR_CODES` in `src/runs.tsx` is the code-to-retryability map, and it is **default-deny** — an unrecognised code halts the run. Being wrong that way costs one click; being wrong the other way burns the Free plan's daily request budget on a key that will never work
- 03-04: a failed step is **terminal until Retry**. `failJob` writes `failed` and `claimNextJob` only takes `pending`, so the `retryable && attempts < 2` guard decides whether the run keeps going **at all**, not whether the failed step is re-run. A transient timeout therefore costs one Retry click. Automatic single retry would need a `db.ts` helper to un-fail a row, because `resetRunJobs` zeroes `attempts`
- 03-04: auto-advance never renders while any job is `running`. Without it two open tabs loop forever (loser gets `claimNextJob` → null → 303 → re-render with the script intact). "Claimable" is defined as exactly what `claimNextJob` will take, never "not done" — a draft whose outlier failed is `pending` forever
- 03-04: `retryAfterSeconds` travels as a clamped `?retry_after=N` query parameter on the redirect, not a column. It is needed for one page render
- 03-04: `runs.status` is recomputed from the job rows after every step (`runStatus`/`reconcileRunStatus`), reusing the `getRunView` the drafting branch already needs. `createRun` writes `pending` once and nothing else maintained it
- 03-04: every `sk-` run is scrubbed out of an error message before it reaches D1 — OpenAI's `invalid_api_key` text quotes the key back masked, and CLAUDE.md forbids rendering any part of a secret
- 03-04: the Responses-API request shape from 03-02 (flattened `text.format`, `store: false`, `reasoning.effort: "low"`) is **confirmed against the live API**; `gpt-5.6-terra` and `gpt-5.6-sol` both resolve
- 03-06: migration 0004 adds `runs.transcript_lines_used`, `runs.transcript_lines_total` and `drafts.grounding_json` — all nullable, applied to local AND remote D1 (first attempt, no 7403 this time). `grounding_json` rides along empty so 03-07 needs no migration and remote D1 was altered once, not twice
- 03-06: coverage is **computed by the caller and stored as two primitives** — `createRun(db, transcriptId, bodies, { linesUsed, linesTotal })`. `src/db.ts` still imports nothing from `src/prompts.ts`; that boundary is the Jersey/JFSC guard and a convenience overload taking a transcript row would break it
- 03-06: the counts are frozen at run creation, never recomputed at render. A re-imported transcript changes the body, and a recomputed figure would drift away from the drafts sitting beside it
- 03-06: either count NULL renders **nothing** — not "unknown", not a guess from `line_count`. Runs predating 0004 have no coverage figure, and inventing one is the exact over-claiming the gap exists to fix
- 03-06: `listTranscripts` selects `length(body) AS body_chars` and `TranscriptSummary` is now `Omit<TranscriptRow, "body"> & { body_chars: number }`. The body never leaves D1; only its length does. It is a threshold for the new-run warning, never a displayed figure — the pre-run warning carries no number at all, because characters on one page against lines on another destroys trust in both
- 03-06: a cut transcript is amber `.notice.warn`, matching 03-03's ungrounded-draft treatment — the run is fine, the drafts simply had less to work with
- 03-04 (measured, run 1): **$0.097 per run**, about half the research's ~$0.19 estimate. 16,730 input / 1,979 output tokens across 6 calls; **zero** reasoning tokens on all three terra extractions. At two runs a week that is ~$0.80/month — model cost is not a constraint, quality is. The `MODEL_DRAFT` → `gpt-6-astra` lever is nearly free to test

- 03-05: `checkGrounding(post, sourceLines, sources)` replaces the citation-only proxy and is the DRAFT-03 guard from here on. Three passes: normalised citation resolution, per-sentence attribution (normalised containment, else ≥50% overlap of 4-token shingles), and a 6-token n-gram repeat detector over the whole post. `sources` is `[transcriptBody, ...voiceSampleBodies]` and **outlier bodies must never be passed in** — FORMAT carries shape, so an outlier's phrasing in a draft is a defect to catch, not grounding to credit
- 03-05: the repeat detector is a **token** n-gram stream, not sentence comparison, and that is load-bearing. The production failure was three sentences of 3, 2 and 2 tokens; only a stream that crosses sentence boundaries catches the repeated 7-token run
- 03-05: `GroundingReport` reports `skipped` as a first-class field. A short invented sentence said once is below both the claim and the repeat thresholds and is **not caught** — the count is the honest measure of the blind spot, and it is pinned by test rather than described in prose
- 03-05: the check matches **words, not meaning**. A model compressing a real transcript idea into its own vocabulary reads as unsupported, which is most of what `unsupported` contained on run 1. It is a list a reviewer reads, never a count they act on blindly
- 03-05: thresholds are `GROUNDING_MIN_CLAIM_TOKENS = 6`, `GROUNDING_SHINGLE_TOKENS = 4`, `GROUNDING_SUPPORT_RATIO = 0.5`, `GROUNDING_REPEAT_TOKENS = 6`. **None moved during calibration, and that is a measurement**: sweeping the ratio 0.5 → 0.25 changed 1-3 of 45 sentences and changed no draft's verdict. Move one only when a run exists where it changes an answer, and say which run in the source comment
- 03-05: `normaliseForMatch` strips outer punctuation, then up to **two** stacked leading connectives, then outer punctuation again. Order matters — a quote wrapped in quotation marks still needs its "And that" found, and "Right," must not leave its comma behind
- 03-05: `isGrounded` is left intact and marked superseded so `src/runs.tsx` keeps compiling; 03-07 owns the call site and the deletion. `src/prompts.ts` still has **zero imports**

### Pending Todos

- **Phase 4, high — the draft-quality findings from 03-04's real run. Do not fix them opportunistically; they interact:**
  - ~~`.planning/todos/pending/normalise-grounding-match.md`~~ — **check built by 03-05**, both directions fixed and verified against the real stored drafts. Not closed until 03-07 wires it to `finishDraft` and the run page and deletes `isGrounded`
  - `.planning/todos/pending/steer-draft-topics.md` — no topic input anywhere, and the three drafting calls run blind to each other
  - `.planning/todos/pending/context-layer-for-drafts.md` — live context retrieval. Recorded only; the user decided 2026-09-15 not to insert it as a phase yet
- Phase 4 (small): `usage_json` does not capture `usage.input_tokens_details.cached_tokens`, so prompt-cache effectiveness is unmeasurable from D1. 03-06 touched `src/db.ts` and deliberately did **not** fold it in — it belongs to the drafting write path (`finishDraft`) that 03-07 is editing in the same wave. Fold it into whichever plan next touches `finishDraft` alone
- ~~Phase 4 (small): `excerptTranscript` returns `linesUsed`/`linesTotal` and no page renders them~~ — **closed by 03-06.** The counts are stored on the run at creation and rendered on the run page; a transcript that will be cut is flagged on the new-run form before the run is paid for. Run 1's own coverage stays permanently unknown (it predates the columns)
- Still pending (low, hardening): narrow the transcript prop on the Fireflies import preview — see `.planning/todos/pending/narrow-transcript-prop-type.md`. It said to pick this up in any Phase 3 plan touching `fireflies-routes.tsx`; none did, so it stays pending for Phase 4

- Phase 5: re-research and re-plan against the Zernio API before planning that phase (the doc rename is done; the API research is not)

### Blockers/Concerns

- Phase 1 (resolved in 01-02): Zero Trust enabled and the Worker protected via the dashboard; `ctx.access` confirmed working, no jose fallback
- Phase 2 (02-03, closed): the Access policy check was step 1 of the 02-03 verification. The user confirmed the checkpoint, including that step; whether it required a change was not reported
- Phase 2 (02-02, minor): `/sources` loads every transcript summary and every sample body in one page render; fine for one executive at pilot scale, needs DB-level paging/truncation if the archive grows
- Phase 2 (02-03, ongoing): Fireflies is US-hosted. Storing only the executive's own lines is the mitigation, not a resolution, of the Jersey/GDPR transfer question in CLAUDE.md
- Phase 2 (02-03, minor): `/fireflies` shows one page of 50 meetings with skip paging only — no search or date filter. Fine at pilot scale
- Phase 3 (closed by 03-RESEARCH.md, 2026-09-15): the Worker-timing worry was misdirected. Cloudflare states waiting on `fetch()` does not count toward CPU time and HTTP-triggered Workers have no hard duration limit. The real constraints are the Free plan's 10ms CPU per request (spent marshalling payloads, not waiting), `ctx.waitUntil` capping at 30s, and DRAFT-05 needing visible status. Resolved by one OpenAI call per invocation driven by a D1 job table; no queue, Durable Object, Workflow or paid plan needed
- Phase 3 (compliance, from research): every OpenAI request must set `store: false` — the Responses API default is 30-day application-state retention. Abuse-monitoring logs are still kept 30 days and need a ZDR agreement to change; state this honestly rather than claiming no retention
- Phase 3 (compliance, from research): the prompt builder must take primitives only, never a TranscriptRow — Fireflies meeting titles routinely name the counterparty, so passing the row would send a client identifier to OpenAI. Assert it in a test
- Phase 2 (verification, info): `POST /sources/samples` has run locally but never against production D1 (remote `voice_samples` is empty); the deployed bundle is identical, so this is usage-not-yet-occurred, not a gap
- Phase 3 (03-02, info): `npm run db:migrate:remote` failed once with Cloudflare API error 7403 ("account not valid or not authorized") on a valid token with `d1 (write)`, then succeeded on an immediate retry. Transient API-side failure — retry before re-authenticating. 03-06's remote migration went through first attempt, so it stays a one-off
- **Phase 3 (03-04, THE open risk of this project): draft quality does not clear the bar.** Run 1 produced three drafts the user would NOT publish with light edits. The 80% target is unmet with exactly one data point behind it. The engine is verified and is not the problem — the three findings are: a grounding check that passes invented material, three drafts colliding on the same topic with no topic input anywhere, and a ceiling of "common sense" because one meeting transcript is the only substance source. **Phase 4 must not be called a success while the drafts stay unpublishable**; the approval gate will faithfully record a low rate, which is the point, but the three todos are what move it
- **Phase 3 (03-05, for 03-07 — the one thing to get right): `grounded` is `false` on all three production drafts, and correctly so.** A boolean that is false on 3/3 real drafts is exactly as uninformative to the executive as one that is true on 3/3, which is the fault this gap exists to fix. **The tick must not be the UI.** Render the report — `supported / checked`, the named `unsupported` lines, the `repeated` phrases, and `skipped` so the figure is not mistaken for full coverage. 03-06 already shipped `drafts.grounding_json` (nullable, empty) for exactly this payload, so 03-07 needs no migration
- Phase 3 (03-05, evidence): the plan expected draft 1 to flip to `grounded: true`. It did not, and that is the right answer — its citations do now resolve, but the post asserts "between 20% and 40%" and `20%` appears **zero times** in the executive's material. Draft 3 also moved from stored `1` to `false`. Reported rather than tuned away, per the plan's own instruction; no threshold in the 0.25-0.5 range makes any draft fully supported
- Phase 3 (03-05, corroborates the open risk): at 4-token granularity the **median** sentence overlap between run 1's drafts and the executive's own material is **0.00**. The drafts are the model's constructions, not the executive's words rearranged. Same finding as `context-layer-for-drafts.md`, arriving from a different direction. One production run is three data points — re-check once the approval gate has produced more
- Phase 3 (03-06, info): the deployed bundle does **not** yet include the coverage UI — 03-06 migrated remote D1 but did not deploy. Production is running the pre-0004 code against a post-0004 schema, which is safe (three unread nullable columns) until 03-07's deploy
- Phase 3 (03-04, resolved): `OpenAIError.retryable` is not stored on the job row — resolved by the default-deny `RETRYABLE_ERROR_CODES` map in `src/runs.tsx`; no column added
- Phase 3 (03-03, resolved by 03-04): the run page's "Nothing has run yet" notice has been rewritten now that an engine exists
- Phase 3 (03-04, info): prompt caching was **eligible** on drafts 2 and 3 (byte-stable ~4,700-token prefix, well over the 1,024 minimum) but cannot be proven from D1 — `cached_tokens` is not stored. Recorded as eligible, not proven
- Phase 3 (03-04, info): CPU ms per step was not captured. Indirect evidence only — six steps on the Free plan with the largest payload the input caps allow, no Error 1102 `exceededCpu`
- Phase 3 (03-03, minor): `/runs` lists every run with no paging, like `/sources`. Fine at pilot scale, but `listRuns` counts jobs per run with subqueries, so a long history would want a limit
- Phase 3 (03-03, resolved by 03-06): `POST /runs` loaded the whole transcript body only to prove the row existed and then discarded it. That read now pays for the coverage counts stored on the run
- Phase 5: confirm the Zernio API is available on Vincent's plan and supports LinkedIn drafts (replaces the earlier Metricool concern)

## Session Continuity

Last session: 2026-09-15
Stopped at: Phase 3 complete. 03-04 — step route (`8433e35`), auto-advance and retry (`feb314f`), voice-sample warning (`75ef4a6`), deployed as version `b3156846-e6bb-4e4a-a14a-ad45b629406b`. The whole paid path was verified for free against a deliberately invalid key before the checkpoint; `.dev.vars` was backed up and restored SHA-identical, and local D1 is back to zero rows. The user then ran it on real data: 6/6 steps done first attempt, $0.097, three drafts they would not publish. Next: Phase 4 (Approval Gate), 2 plans, carrying the three quality todos

03-06 (2026-09-15, gap closure wave, ran in parallel with 03-05): migration 0004 (`43246f1`), coverage stored and exposed in `src/db.ts` (`107bac8`), computed and rendered in `src/runs.tsx` (`7e41764`). Migration applied to local **and remote** D1; **not deployed** — 03-07 owns the deploy. Verified against seeded local D1 (148 of 250 lines on a long transcript, "all 40" on a short one, nothing at all on a seeded pre-0004 run), then all seed rows deleted and local D1 confirmed back to zero. `src/prompts.ts` untouched, as 03-05 owns it this wave
03-05 (2026-09-15, gap closure wave, ran in parallel with 03-06): failing tests first (`5d687b3`), `checkGrounding` (`12d4c2a`), calibration notes and the blind-spot test (`3394741`). TDD, 34 → 60 tests, `tsc` clean, `src/prompts.ts` still zero imports. Calibrated against production run 1 by exporting the three drafts, the 18,429-char transcript and the three voice samples to the scratchpad; all of it deleted afterwards and nothing but verdicts and counts recorded. Both known failures flipped: draft 1's three citations now resolve, and draft 2's invented slogan is the only phrase flagged across the batch. All three drafts come out `grounded: false`, which inspection says is correct. `migrations/`, `src/db.ts` and `src/runs.tsx` untouched, as 03-06 owned them this wave

Next: 03-07 — wire `checkGrounding` into `finishDraft`, store the report in `drafts.grounding_json`, render it on the run page, delete `isGrounded` and its three tests, and deploy (which also ships 03-06's coverage UI to production)
Resume file: None
