---
phase: 03-drafting
plan: 02
subsystem: database
tags: [d1, sqlite, migrations, openai, responses-api, json-schema, job-queue, cloudflare-workers, data-protection]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "D1 binding, migration workflow (db:migrate:local/remote), OPENAI_API_KEY Worker secret, /health secret-presence check"
  - phase: 02-voice-sources
    provides: "src/db.ts bound-parameter discipline, transcripts/voice_samples tables, src/fireflies.ts credential-as-argument client pattern"
provides:
  - "migrations/0003_runs.sql — runs, outliers and drafts tables (applied local and remote)"
  - "src/db.ts run helpers — createRun, claimNextJob, finishOutlier, finishDraft, failJob, setRunStatus, getRunView, listRuns, resetRunJobs"
  - "src/openai.ts — callStructured (Responses API, strict json_schema, store disabled) and OpenAIError with code-based retry classification"
  - "The claim-then-work guard that makes one-OpenAI-call-per-invocation safe against double submits"
affects: [03-drafting (03-03, 03-04), 04-approval, 05-zernio-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D1 job table instead of a queue: one external call per Worker invocation, state in D1 between them"
    - "Claim-then-work compare-and-swap on (status, started_at); meta.changes === 1 decides the winner, no RETURNING"
    - "Stale-claim recovery by timestamp (180s), so a crashed invocation cannot strand a job"
    - "Retry resets only rows that are not 'done', so a completed paid call is never repeated"
    - "Projections omit columns that must never render (template_json), making a product rule structural"
    - "External API errors classified by provider error code, not HTTP status"

key-files:
  created:
    - migrations/0003_runs.sql
    - src/openai.ts
  modified:
    - src/db.ts

key-decisions:
  - "The claim UPDATE guards on the started_at that was read as well as the status, so two invocations that both saw the same stale 'running' row cannot both win"
  - "drafts gained a `grounded INTEGER` column the research DDL lacked: the plan's finishDraft signature requires storing the source-line check result"
  - "claimNextJob returns the template as the raw JSON string, so db.ts imports nothing from prompts.ts and stays schema-agnostic"
  - "finishOutlier/finishDraft accept the OpenAI usage object structurally and flatten it to {input_tokens, output_tokens, reasoning_tokens} before writing usage_json"
  - "JSON.parse failure and an unreadable 2xx body become OpenAIError (bad_json / bad_body), so no unhandled SyntaxError can 500 the step route and strand a claimed job"
  - "setRunStatus exported so run-level transitions stay inside db.ts (all SQL lives in db.ts)"
  - "error_message is truncated to 500 characters before it reaches D1"

patterns-established:
  - "Compare-and-swap claiming: SELECT candidate, UPDATE guarded by the exact (status, started_at) read, proceed only on meta.changes === 1"
  - "Job tables carry status, attempts, started_at, error_code, error_message, usage_json — the status page needs no other source"
  - "Token counts are stored per job from day one, so the cost estimate becomes a measurement after two runs"
  - "Compliance rules live in the migration header, not only in planning docs"

# Metrics
duration: 8min
completed: 2026-09-15
---

# Phase 03 Plan 02: Run Substrate and OpenAI Client Summary

**A D1 job table with a compare-and-swap claim guard, plus a Responses API client that disables application-state retention and classifies failures by error code — together the two foundations that let the drafting engine run one paid call per Worker invocation with visible status and a safe retry.**

## Performance

- **Duration:** ~8 min (fully autonomous, ran in parallel with 03-01)
- **Started:** 2026-09-15T07:48:31Z
- **Completed:** 2026-09-15T07:56:30Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Migration 0003 creates `runs`, `outliers` and `drafts` with the job columns (`status`, `attempts`, `started_at`, `error_code`, `error_message`, `usage_json`) and two indexes; applied to local **and** remote D1 and verified in both.
- The compliance rule is written into the migration header: only `transcripts.body` (already speaker-filtered by migration 0002), `voice_samples.body` and the user's own pasted outlier text may reach OpenAI — never a meeting title, participant name or speaker label.
- `claimNextJob` makes the whole architecture safe: a second concurrent claim on the same row reports `changes: 0` and changes nothing, proven against **remote** D1 (see Verification Evidence).
- `resetRunJobs` resets only rows that are not `done`, proven by a before/after dump: a finished outlier kept its template and attempt count while its failed siblings went back to `pending` with attempts 0.
- `src/openai.ts` posts the Responses-API request shape (flattened `text.format`, not the Chat Completions nesting), disables 30-day application-state retention, walks `output[]` for the message item, and turns nine distinct failure modes into a single renderable `OpenAIError`.
- No OpenAI call was made during this plan: the client is built, not exercised. First live call belongs to 03-04.

## Task Commits

1. **Task 1: Migration 0003 — runs, outliers and drafts** — `8498a59` (feat)
2. **Task 2: Run and job helpers in src/db.ts** — `39f7974` (feat)
3. **Task 3: OpenAI Responses client** — `1f12349` (feat)
4. **Interface alignment for 03-04** — `2137655` (refactor)

## Files Created/Modified

- `migrations/0003_runs.sql` — `runs`, `outliers`, `drafts`, indexes `outliers_run` and `drafts_run`, compliance header
- `src/db.ts` — "Phase 3 runs" section: `JobStatus`, `STALE_JOB_MS`, `DRAFTS_PER_RUN`, `RunRow`, `TokenUsage`, `OutlierView`, `DraftView`, `RunView`, `RunSummary`, `Job`, and the nine helpers
- `src/openai.ts` — `callStructured`, `OpenAIError`, `Usage`, `CallOptions`, `NON_RETRYABLE_429`, `toOpenAIError`

## The exact claim SQL (03-03 and 03-04 build on this)

Order of preference: every unfinished `outliers` row first (a draft cannot be written before its template exists), then `drafts` whose outlier already has a `template_json`.

**1. Candidate select — outliers:**

```sql
SELECT id, position, body, status, started_at FROM outliers
WHERE run_id = ?1 AND (status = 'pending' OR (status = 'running' AND started_at < ?2))
ORDER BY position LIMIT 1
```

**2. Candidate select — drafts (only when no outlier is claimable):**

```sql
SELECT d.id AS id, d.position AS position, d.status AS status,
       d.started_at AS started_at, d.outlier_id AS outlier_id, o.template_json AS template
FROM drafts d JOIN outliers o ON o.id = d.outlier_id
WHERE d.run_id = ?1 AND o.template_json IS NOT NULL
  AND (d.status = 'pending' OR (d.status = 'running' AND d.started_at < ?2))
ORDER BY d.position LIMIT 1
```

`?2` is `new Date(Date.now() - STALE_JOB_MS).toISOString()` with `STALE_JOB_MS = 180_000` — comfortably past the 120s OpenAI abort timeout, so only a crashed invocation's row is ever taken over.

**3. The claim (identical for both tables):**

```sql
UPDATE <table> SET status = 'running', attempts = attempts + 1, started_at = ?1, updated_at = ?1
WHERE id = ?2 AND status = ?3 AND started_at IS ?4
```

Bound with `(now, row.id, row.status, row.started_at)`. The call proceeds only when `result.meta.changes === 1`; otherwise `claimNextJob` returns `null` and the route redirects to the status page. `IS` rather than `=` because a pending row's `started_at` is NULL.

**4. The retry reset (`resetRunJobs`), run against `outliers` then `drafts`:**

```sql
UPDATE <table> SET status = 'pending', attempts = 0, error_code = NULL, error_message = NULL,
       started_at = NULL, updated_at = ?1
WHERE run_id = ?2 AND status != 'done'
```

`status != 'done'` is the whole point: a completed OpenAI call is never re-paid for, however many times Retry is pressed.

## The error-code table as implemented

`OpenAIError` carries `message`, `code`, `status`, `retryable`, `retryAfterSeconds`. `retryable` branches on the code, never on status alone, because 429 means both rate limiting and billing exhaustion.

| Condition | Source | `code` | `retryable` |
|---|---|---|---|
| Network failure or `AbortSignal.timeout` | thrown from `fetch` | `timeout` | **yes** |
| Rate limited | HTTP 429, code not in the billing set | OpenAI's code (`rate_limit_exceeded`, `slow_down`, …) | **yes** |
| Out of credit / over a spend or usage limit | HTTP 429 | `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded` | **no** |
| Server error | HTTP 500 | OpenAI's code, else `http_500` | **yes** |
| Overloaded | HTTP 503 | OpenAI's code, else `http_503` | **yes** |
| Bad key, unsupported country, malformed request, context too long, bad schema | HTTP 400 / 401 / 403 / anything else | OpenAI's code, else `http_<status>` | **no** |
| Unreadable success body | HTTP 2xx, JSON parse failed | `bad_body` | **yes** |
| Response `status: "failed"` | HTTP 200 | OpenAI's code, else `failed` | **yes** |
| Truncated output | HTTP 200, `incomplete_details.reason = "max_output_tokens"` | `incomplete_max_output_tokens` | **yes** (once — `attempts < 2` is enforced by the caller) |
| Any other early stop | HTTP 200, `status: "incomplete"` | `incomplete_<reason>` | **no** |
| Safety refusal | HTTP 200, `content[0].type = "refusal"` | `refusal` | **no** |
| No message item / no text | HTTP 200 | `no_output` | **yes** |
| Output was not valid JSON | HTTP 200 | `bad_json` | **yes** |

`retryAfterSeconds` is populated from the `Retry-After` header when it is a plain integer, so 03-04 can render the delay into the auto-submit `setTimeout`.

Every message is either OpenAI's own text or one of a fixed set of strings in this module. The API key, the request body, transcript text and the underlying cause of a network failure never appear in one.

## Decisions Made

- **The claim is a compare-and-swap, not just a status check.** The research SQL guarded on `status = ?` alone. That is enough for the common case (two tabs racing a `pending` row) but not for the stale case: two invocations that both read the same 180s-old `running` row would both match `status = 'running'` and both pay for a call. Guarding on the `started_at` that was read closes it. Cost: one extra bound parameter.
- **`drafts.grounded INTEGER` was added to the DDL.** The plan's `finishDraft(db, id, post, sourceLines, grounded, usage)` requires storing whether the model's quoted lines were actually found in the transcript; the research DDL had nowhere to put it. It is nullable — NULL until the draft is generated.
- **`claimNextJob` returns `template` as the raw JSON string.** Parsing belongs to the caller, so `src/db.ts` imports nothing from `src/prompts.ts` and cannot acquire a schema dependency. It also keeps 03-01 and 03-02 genuinely independent.
- **`usage` is accepted structurally and flattened on write.** `finishOutlier(db, id, value, usage)` in 03-04 passes what `callStructured` returned; the helper flattens `output_tokens_details.reasoning_tokens` and stores exactly `{input_tokens, output_tokens, reasoning_tokens}`. The response object is still never stored.
- **`getRunView` cannot leak `template_json`.** The column is absent from the projection, so OUTL-02 holds even if a future page renders the whole row. `outliers.body` is omitted for the same structural reason — the status page shows progress, not pasted text.
- **`listRuns` LEFT JOINs the transcript.** Delete-on-request means a transcript can vanish under an old run; `transcript_title` is typed `string | null` rather than dropping the run from the list.
- **`setRunStatus` was exported** (beyond the plan's list) so 03-03/03-04 never need to write run-level SQL outside `src/db.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `grounded` column added to `drafts`**
- **Found during:** Task 1 (migration 0003)
- **Issue:** The plan mandates `finishDraft(..., grounded, usage)` writing "the grounded flag", but the DDL copied from 03-RESEARCH.md has no column for it. Writing the helper as specified would have failed at runtime with "no such column".
- **Fix:** Added `grounded INTEGER` (nullable, 1 when every source line was found in the transcript) next to `source_lines_json`. `getRunView` maps it to `boolean | null` for the page.
- **Files modified:** `migrations/0003_runs.sql`, `src/db.ts`
- **Verification:** Both databases accept `UPDATE drafts SET ... grounded = 1`; the finished draft row read back with `grounded` set.
- **Committed in:** `8498a59` (Task 1 commit)

**2. [Rule 1 - Bug] Claim guard extended to `started_at`**
- **Found during:** Task 2 (job helpers)
- **Issue:** The research claim SQL guards only `WHERE id = ? AND status = ?`. For a stale `running` row this is not exclusive — two invocations reading the same row both match `status = 'running'`, both see `changes = 1`, and both call (and pay for) OpenAI. The plan's own truth is "exactly one invocation can claim a given job".
- **Fix:** Added `AND started_at IS ?4`, bound to the exact value read. NULL-safe via `IS`, so pending rows still match.
- **Files modified:** `src/db.ts`
- **Verification:** Double-claim against remote D1 — first `changes=1`, second `changes=0`, `attempts` stayed at 1.
- **Committed in:** `39f7974` (Task 2 commit)

**3. [Rule 2 - Missing Critical] `JSON.parse` and success-body reads wrapped**
- **Found during:** Task 3 (OpenAI client)
- **Issue:** The research client calls `JSON.parse(content.text)` and `res.json()` on the success path unguarded. A `SyntaxError` would escape as something other than `OpenAIError`, so 03-04's `catch` would not classify it, the step route would 500, and the job row would stay `running` for the full 180s stale window.
- **Fix:** Both wrapped; they raise `OpenAIError` with codes `bad_json` and `bad_body`, both retryable. The underlying parse error is dropped because it quotes the response text.
- **Files modified:** `src/openai.ts`
- **Verification:** `tsc --noEmit` exits 0; every exit path from `callStructured` is either a value or an `OpenAIError`.
- **Committed in:** `1f12349` (Task 3 commit)

**4. [Rule 3 - Blocking] `usage` parameter shape aligned with the client**
- **Found during:** Task 3 (after reading 03-04's step-route spec)
- **Issue:** `finishOutlier` first took a flat `{input_tokens, output_tokens, reasoning_tokens}`, but 03-04 calls `finishOutlier(db, id, value, usage)` with what `callStructured` returns, where the reasoning count is nested in `output_tokens_details`. As written, 03-04 could not type-check without inventing its own mapping.
- **Fix:** `TokenUsage` is now the structural OpenAI shape and `toUsageJson` flattens it internally. `src/db.ts` still imports nothing from `src/openai.ts`.
- **Files modified:** `src/db.ts`
- **Verification:** A throwaway module importing both and calling `finishOutlier(db, job.id, value, usage)` type-checked at exit 0, then was deleted.
- **Committed in:** `2137655`

### Additions beyond the plan's export list

`setRunStatus`, `STALE_JOB_MS`, `DRAFTS_PER_RUN`, the view types, and a `position` field on the `Job` union (so a failure can say which outlier or draft it was). All additive; the eight helpers the plan named exist with the named signatures.

---

**Total deviations:** 4 auto-fixed (1 bug, 2 missing-critical, 1 blocking)
**Impact on plan:** All four were required for the plan's own stated truths to hold or for 03-04 to compile against this work. No scope creep — no routes, no UI, no OpenAI call.

## Issues Encountered

- **`npm run db:migrate:remote` failed once** with Cloudflare API error 7403 ("The given account is not valid or is not authorized to access this service"). `wrangler whoami` showed a valid OAuth token with `d1 (write)`. Re-running the identical command immediately succeeded, so it was a transient API-side failure, not a credential problem. Worth knowing before anyone re-authenticates in response to it.

## Verification Evidence

- **Tables in both databases:** `runs`, `outliers`, `drafts` present locally and remotely alongside `settings`, `transcripts`, `voice_samples`; remote also lists the `outliers_run` and `drafts_run` indexes.
- **Round-robin assignment (2 outliers, 3 drafts):** draft 1 -> outlier 1, draft 2 -> outlier 2, draft 3 -> outlier 1.
- **Double claim (remote D1):** claim #1 `changes=1 rows_written=1`; claim #2 with the identical guard `changes=0 rows_written=0`; the row's `attempts` stayed at 1, so a losing claim cannot even inflate the retry counter.
- **Draft claim ordering:** the drafts candidate query returns nothing while the only templated outlier's drafts are `done`/`failed`, and skips drafts whose outlier has `template_json IS NULL`.
- **Reset skips done rows:** before — outlier 1 `done` (template, attempts 1), outlier 2 `failed` (attempts 1), draft 1 `done` (body), draft 3 `failed` (attempts 2). After — outlier 1 and draft 1 byte-identical, outlier 2 and draft 3 `pending` with attempts 0 and errors cleared.
- **Client hygiene:** `grep -n "c\.env\|console\." src/openai.ts` → empty; `grep -n "response_format" src/openai.ts` → empty (the wrong API shape is not present even in a comment); `grep -c "store: false" src/openai.ts` → 1.
- **`npx tsc --noEmit`** exits 0; **`npm test`** 34/34 across both test files (03-01's prompt tests included).
- **All verification rows were deleted** from both databases afterwards: `runs`, `outliers`, `drafts` counts are 0 local and 0 remote.

## User Setup Required

None. `OPENAI_API_KEY` was already pushed as a Worker secret in Phase 1 and shows as set on `/health`; no call is made until 03-04.

## Next Phase Readiness

Ready for 03-03 (run creation and status pages) and 03-04 (the step route):

- `createRun(db, transcriptId, outlierBodies)` returns the run id; it throws unless 2 or 3 bodies are supplied, so the route must validate before calling.
- `claimNextJob` → `callStructured` → `finishOutlier`/`finishDraft`/`failJob` compose without any mapping code (type-checked).
- The status page has everything it needs from one `getRunView` call: per-job status, attempts, error code and message, plus the draft bodies and grounded flags.
- The auto-advance guard in 03-04 should read `attempts` from `getRunView` and `retryable`/`retryAfterSeconds` from the `OpenAIError` recorded as `error_code` — note that `retryable` itself is **not** persisted, only the code. 03-04 must map the code back to retryability (the table above is the source of truth) or persist the flag in migration 0004.

**Concerns carried forward:**

- Free-plan D1 budget: the step route uses ~2-4 queries for the claim plus 2 for finishing plus the status render. Well inside 50, but a future batch-everything change would need re-checking.
- Application-state retention is disabled on every request; OpenAI's 30-day abuse-monitoring logs remain, and changing that requires a zero-data-retention agreement. Stated in the code comment, not glossed.
