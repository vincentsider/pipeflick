---
phase: 03-drafting
plan: 03
subsystem: ui
tags: [hono, hono-jsx, server-rendering, forms, csrf, d1, cloudflare-workers, status-page]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Hono + hono/jsx server rendering, Access gate, shared Layout and nav"
  - phase: 02-voice-sources
    provides: "transcripts table and listTranscripts/getTranscript, the router + POST-validate-303 conventions in src/sources.tsx"
  - phase: 03-drafting (03-01)
    provides: "MAX_OUTLIER_CHARS, the cap the paste fields enforce"
  - phase: 03-drafting (03-02)
    provides: "createRun, listRuns, getRunView and the run/outlier/draft job rows this renders"
provides:
  - "src/runs.tsx — GET /runs, GET /runs/new, POST /runs, GET /runs/:id"
  - "The run status surface DRAFT-05 reports onto, rendering pending / running / done / failed before anything can produce those states"
  - "Run creation validation: known transcript, 2-3 non-empty outliers, each within the outlier cap, all before any D1 write"
  - "getRunView now carries the transcript title and an 80-char outlier excerpt, still in three reads"
affects: [03-drafting (03-04), 04-approval, 05-zernio-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status page built before the engine that drives it, so every state has a renderer on the day it first occurs"
    - "Excerpts cut with SQLite substr() in the projection, so the rest of a stored body never enters the Worker"
    - "A projection that omits a column is the enforcement of a never-render rule; the page cannot leak what it cannot select"
    - "Presentational failure rendering: provider code plus provider message, never a stack"

key-files:
  created:
    - src/runs.tsx
  modified:
    - src/index.tsx
    - src/layout.tsx
    - src/db.ts

key-decisions:
  - "Progress reads N of total_jobs, never a hardcoded 6: a two-outlier run has five steps and would otherwise permanently report 5 of 6"
  - "The outlier excerpt is cut by SQL substr() inside getRunView rather than by a fourth query or by loading the body, keeping the page at three reads and the pasted text in D1"
  - "getRunView LEFT JOINs the transcript title (the listRuns pattern), so a deleted transcript renders '(transcript deleted)' instead of dropping the run"
  - "An ungrounded draft gets an amber .notice.warn, not the red .notice.error: it is a reviewer's cue, not a failed step, and red would misreport it"
  - "A malformed run id is 400 and an unknown run is 404, matching the src/sources.tsx transcript-detail precedent"
  - "The new-run form states in the UI that pasting is the only route in, so the absent URL field reads as a decision rather than a missing feature"

patterns-established:
  - "Job-state rendering: StepStatus shows the attempt count only once attempts > 1, so a normal first run stays quiet and a retry loop is visible"
  - "Failure rendering: <Failure code message /> prints the provider's own text plus its code, and a fixed string when neither was recorded"
  - "Form caps are imported from the module that owns them (MAX_OUTLIER_CHARS from src/prompts.ts), never retyped in the route"

# Metrics
duration: 5min
completed: 2026-09-15
---

# Phase 03 Plan 03: Run Front Door and Status View Summary

**A paste-only run form and a status page that already renders every job state the engine will produce — pending, running, done, failed with OpenAI's own message, and the ungrounded-draft warning — built one plan before anything exists to produce them.**

## Performance

- **Duration:** ~5 min (fully autonomous)
- **Started:** 2026-09-15T07:58:46Z
- **Completed:** 2026-09-15T08:04:03Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- OUTL-01 and DRAFT-01 are satisfied end to end: pick an imported transcript, paste two or three outlier posts, press Start run, land on that run's page with 5 or 6 job rows waiting.
- Every validation path was exercised against the running Worker and returns a plain-text 400 **before** any D1 write: one outlier, an unknown transcript id, a malformed id, and a 5001-character paste. A POST with no `Origin` is 403 from the app-wide `csrf()`.
- The status page renders all four job states, verified by driving the rows directly in D1: `done` with the post in pre-wrap, `failed` with `rate_limit_exceeded` and OpenAI's message, `running`, and `pending`.
- OUTL-02 holds structurally. With a real `template_json` stored on outlier 1, `curl /runs/{id} | grep -ci "hook\|angle\|contrarian\|structure"` returns **0** — the column is not in the projection, so there is nothing for a renderer to leak.
- No client JS: `grep "<script" src/runs.tsx` is empty. Plan 04 owns the auto-advance form and its `<script>`.
- Local D1 was returned to zero rows afterwards; remote D1 was never written to.

## Task Commits

1. **Task 1: Run list, new-run form and run creation** — `dcca167` (feat)
2. **Task 2: Run status view** — `333a2b6` (feat)

## Route table (plan 04 edits this file)

| Route | Handler behaviour | Reads / writes |
|---|---|---|
| `GET /runs` | `RunTable` — transcript title, started date, status, "N of M done"; empty state links to `/runs/new` | `listRuns` |
| `GET /runs/new` | `NewRunForm` — transcript `select`, three `textarea`s (1 and 2 required, 3 optional, `maxlength=MAX_OUTLIER_CHARS`); with no transcripts it links to `/fireflies` instead of rendering a dead form | `listTranscripts` |
| `POST /runs` | validate → `createRun` → 303 to `/runs/{id}` | `getTranscript`, `createRun` |
| `GET /runs/:id` | the status view; 400 on a malformed id, 404 on an unknown run | `getRunView` |

## Component names (plan 04 extends these)

| Component | Props | Role |
|---|---|---|
| `RunTable` | `{ rows: RunSummary[] }` | the run list |
| `NewRunForm` | `{ transcripts: TranscriptSummary[] }` | the paste form, or the import prompt |
| `StepStatus` | `{ status: string; attempts?: number }` | `<span class="status status-{status}">`, appending "· attempt N" only when `attempts > 1` |
| `Failure` | `{ code: string \| null; message: string \| null }` | `.notice.error` with the provider's message and code |
| `TemplateSteps` | `{ outliers: OutlierView[] }` | one `<li>` per outlier: position, `StepStatus`, 80-char excerpt, `Failure` |
| `DraftSection` | `{ drafts: DraftView[] }` | one `.draft` block per draft: `StepStatus`, `Failure`, grounding warning, body |
| `progress` | `(view: RunView) => { done, total }` | counts `done` across both job arrays |

Module-level helpers in the same file: `formatDate`, `formatDateTime`, `field` (parseBody coercion), and the constants `OUTLIER_FIELDS`, `MIN_OUTLIERS`, `MAX_OUTLIERS`, `TRANSCRIPT_ID_PATTERN`, `RUN_ID_PATTERN`.

**Where plan 04 hooks in:** the auto-advance form and its `<script>` belong in the `GET /runs/:id` handler, between the progress paragraph and `<h3>Templates</h3>`. The guard it needs is already on the page's data — `view.run.status`, each job's `status` and `attempts`, and `error_code` (map it back to retryability using the table in 03-02-SUMMARY.md; `retryable` itself is not persisted). The `done === 0` notice currently says running the steps "is the next piece of the build" and must be replaced when the engine lands.

## Files Created/Modified

- `src/runs.tsx` (337 lines) — the four routes, seven components and the validation constants above
- `src/index.tsx` — `app.route("/", runs)` behind `requireAccess` and `csrf()`; Runs added to the home-page links
- `src/layout.tsx` — "Runs" in `NAV` between Sources and Fireflies; CSS for `.status` / `.status-done|running|failed`, `.steps`, `.draft`, `.draft-body` (pre-wrap) and `.notice.warn`
- `src/db.ts` — `OUTLIER_EXCERPT_CHARS = 80`; `OutlierView.excerpt`; `RunView.transcript_title`; `getRunView` gains a LEFT JOIN and a `substr()` projection (still three reads)

## Decisions Made

- **Progress is `done_jobs` of `total_jobs`, not "of 6".** The plan's wording says "N of 6 done", but a run with two outliers has five steps. Hardcoding 6 would make a completed two-outlier run read "5 of 6 done" forever, which is exactly the DRAFT-05 signal the page exists to give. Both `listRuns` and the run page compute the total from the rows.
- **The outlier excerpt is cut in SQL.** The page needs ~80 characters to tell two pasted posts apart, and `getRunView` deliberately does not select `outliers.body`. `substr(body, 1, ?2)` in the projection satisfies both: one query, and the remainder of the pasted post never enters the Worker's memory.
- **Amber, not red, for an ungrounded draft.** `isGrounded` returning false means the model's quoted lines were not found verbatim in the transcript. The draft is still shown — strict schemas constrain shape, not accuracy — so it is a reviewer's cue. `.notice.error` would have rendered a perfectly usable draft as a failure.
- **400 for a malformed run id, 404 for an unknown one.** `src/sources.tsx` already draws that line for transcript ids; the run page follows it rather than collapsing both to 404.
- **The form explains the absence of a URL field.** REQUIREMENTS.md lists "fetching LinkedIn posts by URL" as out of scope and non-compliant. Saying so on the form makes it a stated decision instead of something that reads like a gap and gets "fixed" later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getRunView` could not supply the transcript title or an outlier excerpt**
- **Found during:** Task 2 (run status view)
- **Issue:** The plan requires the status page to show "the transcript title" and "the outlier's own first ~80 characters", from "one `getRunView(db, runId)` call; no N+1". The 03-02 projection selects neither: `runs` is read without a join, and `outliers.body` is omitted by design. As written, Task 2 could not be built without extra per-page queries.
- **Fix:** Two additive changes in `src/db.ts`. The run query LEFT JOINs `transcripts` for `title` (the pattern `listRuns` already uses, so a deleted transcript yields `null` rather than dropping the run), surfaced as `RunView.transcript_title`. The outliers query selects `substr(body, 1, ?2) AS excerpt` with `OUTLIER_EXCERPT_CHARS = 80`, surfaced as `OutlierView.excerpt`. Query count is unchanged at three, and the full outlier body still never leaves D1.
- **Why this is not a weakening of 03-02's discipline:** `template_json` remains unselected and unexported — the rule that mattered is untouched. The body rule was "the page shows progress, not the pasted text"; an 80-character identifier cut inside SQLite respects that while making two outliers distinguishable.
- **Files modified:** `src/db.ts`
- **Verification:** `tsc --noEmit` exit 0; the page renders "Q3 board review" and a truncated excerpt ending in "…"; the template-leak grep still returns 0 with a template stored.
- **Committed in:** `333a2b6` (Task 2 commit)

**2. [Rule 1 - Bug] "N of 6" would misreport every two-outlier run**
- **Found during:** Task 1 (run list)
- **Issue:** The plan's copy for the run list is `"N of 6 done"`. `createRun` accepts 2 or 3 outliers, so a run has 5 or 6 jobs. A finished two-outlier run would have shown "5 of 6 done" permanently.
- **Fix:** Render `${done_jobs} of ${total_jobs} done` on the list and `${done} of ${total} steps done` on the run page, both counted from the rows.
- **Files modified:** `src/runs.tsx`
- **Verification:** a two-outlier run renders "0 of 5 steps done"; a three-outlier run renders "0 of 6 steps done".
- **Committed in:** `dcca167` (Task 1) and `333a2b6` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both were required for the plan's own stated behaviour. `src/db.ts` was edited beyond the plan's `files_modified` list; the changes are additive (two new fields, one new constant) and 03-04's call sites are unaffected. No new routes, no client JS, no OpenAI call.

## Issues Encountered

- Local D1 held no transcripts, so a fixture transcript (`testfixture123`, three lines of plausible executive speech) was inserted to exercise the form, then deleted along with every run, outlier and draft row. Local and remote both end at zero rows in all three run tables.

## Verification Evidence

- **`npx tsc --noEmit`** exit 0; **`npm test`** 34/34 (unchanged — this plan adds no test, and the `src/db.ts` change did not disturb the prompt or speaker-filter suites).
- **Validation, against the running Worker:** one outlier → `400 Paste at least 2 outlier posts`; unknown id → `400 Transcript not found`; `bad id!` → `400 Invalid transcript id`; 5001 chars → `400 Each outlier must be 5000 characters or fewer`; no `Origin` header → `403`. `SELECT COUNT(*) FROM runs` was unchanged by all of them.
- **A valid two-outlier submission** returned `303` with `Location: /runs/79c3c6b4-…`, and D1 showed `runs 1, outliers 2, drafts 3`, all `pending`. A three-outlier submission produced `outliers 3, drafts 3`.
- **All four states rendered** after driving the rows in D1: outlier 1 `done`; outlier 2 `failed · attempt 2` with "Rate limit reached for gpt-5.6-terra (rate_limit_exceeded)"; draft 1 `done` with its line breaks preserved in `.draft-body`; draft 2 `done` with the amber ungrounded warning; draft 3 `running`. Header read "3 of 5 steps done".
- **`curl -s /runs/{id} | grep -ci "hook\|angle\|contrarian\|structure"` → 0** with a populated `template_json` on outlier 1.
- **`grep -n "template_json" src/runs.tsx`** and **`grep -n "<script" src/runs.tsx`** both return nothing.
- **`/runs` nav link present on all seven pages** (`/`, `/sources`, `/runs`, `/runs/new`, `/fireflies`, `/settings`, `/health`).
- **Routing:** `/runs/new` still resolves to the form with `/runs/:id` registered (200), an unknown UUID → `404 Run not found`, `/runs/abc` → `400 Invalid run id`.

## User Setup Required

None. No new secret, no migration, no deploy required by this plan — the routes are inside the existing Worker and will ship with the next `npm run deploy`.

## Next Phase Readiness

Ready for 03-04 (the step route and the first live OpenAI call):

- Every state 03-04 can produce already has a renderer, so the engine can be verified by watching this page rather than by querying D1.
- `POST /runs/:id/step` should mount in `src/runs.tsx` beside the existing routes and 303 back to `/runs/{id}`; `RUN_ID_PATTERN` is there to reuse.
- The auto-advance guard has its inputs on the page already (`status`, `attempts` per job) except retryability, which must still be derived from `error_code` (03-02-SUMMARY.md's table) or persisted in migration 0004.
- The `done === 0` notice is worded for a world with no engine and must be rewritten when one exists.

**Concerns carried forward:**

- `/runs` lists every run with no paging, like `/sources` before it. Fine at pilot scale; the `listRuns` subqueries count jobs per run, so a long history would want a limit.
- The run page is a full reload per view. That is intentional (no client JS in this plan), and 03-04's auto-advance will replace the manual refresh.
- `POST /runs` calls `getTranscript` purely to prove the transcript exists, which loads the whole body to discard it. Harmless at one executive's scale; a `SELECT 1` helper would be tidier if transcripts get long.

---
*Phase: 03-drafting*
*Completed: 2026-09-15*
