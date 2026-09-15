# Phase 3: Drafting - Research

**Researched:** 2026-09-15
**Domain:** OpenAI Responses API (structured outputs, reasoning models) on Cloudflare Workers Free tier
**Confidence:** HIGH on the OpenAI API surface, models, pricing and Cloudflare limits (all read from live docs today). MEDIUM on two composability questions flagged in Open Questions. LOW on nothing that blocks planning.

## Summary

The OpenAI half of this phase is settled and my training data was badly out of date on it. The current API is the **Responses API** (`POST https://api.openai.com/v1/responses`); Chat Completions still works but the docs say plainly "**While Chat Completions remains supported, Responses is recommended for all new projects**", and reasoning models measurably perform better on Responses. The current model families are **GPT-6 Astra** (flagship), **GPT-5.6 Sol / Terra / Luna** (professional / balanced / cheap). Everything from `gpt-4o` through `gpt-5.4` is still callable but is last-generation. Structured output is `text: { format: { type: "json_schema", name, strict: true, schema } }` — note this is *flattened* compared to the Chat Completions `response_format` shape, which is the single most likely thing to get wrong from memory.

The timing worry recorded in STATE.md turns out to be the wrong worry. Cloudflare states verbatim that "Waiting on network requests (such as `fetch()` calls, KV reads, or database queries) does **not** count toward CPU time", and that there is "**no hard limit on duration for HTTP-triggered Workers**". So a long OpenAI call does not burn the Free plan's 10 ms CPU budget and does not hit a wall clock ceiling. The real constraints are (a) the Free plan's **10 ms CPU per request**, which is spent on `JSON.stringify` of the prompt payload and JSX rendering, not on waiting; (b) `ctx.waitUntil` only extends execution **30 seconds** after the response, which is too short to host a whole run; and (c) the product requirement DRAFT-05 that the user *sees status while it generates*, which a single blocking request cannot satisfy.

The recommended architecture therefore needs **no queue, no Durable Object, no Workflow and no paid plan**: model the run as a small job table in D1, do **exactly one OpenAI call per Worker invocation**, and drive the run forward with a self-submitting form (which degrades to a visible "Continue" button with JavaScript off). Each invocation is ~1-2 ms CPU and 15-45 s of pure waiting; status is real after every step; retry is the same route and only touches jobs that are not `done`, so a partial failure never re-pays for completed calls. As a bonus, stepping sequentially means drafts 2 and 3 hit OpenAI's prompt cache on the shared prefix, cutting input cost roughly 10x on those calls.

**Primary recommendation:** One D1-backed job row per OpenAI call; one call per Worker invocation; `gpt-5.6-terra` (effort `low`) for template extraction and `gpt-5.6-sol` (effort `low`) for drafting; strict JSON schema on both; `store: false`; raw `fetch`, no SDK. Roughly **$0.19 per run**.

## Standard Stack

### Core

| Library / API | Version / id | Purpose | Why Standard |
|---------------|--------------|---------|--------------|
| OpenAI Responses API | `POST https://api.openai.com/v1/responses` (OpenAPI spec version 2.3.0) | All model calls | Docs: "While Chat Completions remains supported, Responses is recommended for all new projects." Reasoning models are explicitly better on Responses ("3% improvement in SWE-bench with same prompt and setup") and cache 40-80% better |
| `gpt-5.6-terra` | exact id, snapshot `gpt-5.6-terra` | Template extraction from an outlier post | "GPT-5.6 model that balances intelligence and cost... roughly corresponds to the mini model tier". $2.00 / $12.00 per 1M in/out. Supports `structured_outputs` and `prompt_caching` |
| `gpt-5.6-sol` | exact id | Voice-matched drafting | "Flagship model for complex professional work". $4.00 / $20.00 per 1M. Voice matching is the product's core risk, and the cost delta over terra is ~$0.10 per run |
| `reasoning: { effort: "low" }` | both calls | Speed/cost control | The effort table names **"drafting"** explicitly as a `low` use case: "Efficient reasoning with a modest latency increase... Common use cases include data analysis, drafting..." |
| `text.format` json_schema, `strict: true` | Responses shape | Guaranteed template and draft shape | "Structured Outputs is the evolution of JSON mode. While both ensure valid JSON is produced, only Structured Outputs ensure schema adherence." |
| Native `fetch` | Workers runtime | HTTP transport | Matches `src/fireflies.ts` exactly. No new dependency |
| D1 (migration 0003) | existing `DB` binding | Run / outlier / draft job rows | Already bound; adds the status and retry substrate |

**Do NOT add the `openai` npm package.** It works on Workers, but the project has exactly one runtime dependency (`hono`), no build step beyond wrangler's esbuild, and `src/fireflies.ts` already establishes the raw-`fetch` client pattern. The only thing the SDK buys here is `zodTextFormat`, and this project does not use zod.

**Installation:** none. No new packages. Migration 0003 plus two new source files.

### Supporting

| Thing | Purpose | When to Use |
|-------|---------|-------------|
| `AbortSignal.timeout(ms)` | Bound an OpenAI call | Already used in `src/fireflies.ts`. Cloudflare imposes "no set time limit on individual subrequests", so this is your own guard. Use 60 s for extraction, 120 s for drafting |
| `crypto.randomUUID()` | Run ids | Web Crypto, available in Workers, no dependency |
| `store: false` on every request | Jersey DP compliance | Default is retention. See Common Pitfalls |
| `max_output_tokens` | Cost guard on reasoning tokens | 4000 for extraction, 8000 for drafting |
| `response.body.cancel()` on non-2xx | Free memory | Cloudflare's own recommendation on the limits page |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gpt-5.6-sol` for drafting | `gpt-6-astra` | $10/$50 vs $4/$20, so ~$0.40/run vs ~$0.19/run. Astra is pitched at "the hardest end-to-end work" (agentic coding, long horizon), not stylistic fidelity. **Lever:** if the approval rate is under 80% after week one, change one constant to `gpt-6-astra` |
| `gpt-5.6-terra` for extraction | `gpt-5.6-luna` | $0.20/$1.20, about 10x cheaper and faster, but saves under a cent per run. Template quality gates draft quality. **Lever:** switch to luna only if extraction latency becomes the complaint |
| `effort: "low"` | `effort: "medium"` (the default) | Better judgement, more reasoning tokens, slower. Try `medium` on drafting only if `low` drafts read as generic |
| Responses API | Chat Completions | Would work, but is the last-generation surface, caches worse, and `text.format` becomes `response_format`. No reason |
| Raw `fetch` | `openai` npm package | Bundle weight and a dependency for zero benefit here |

## Architecture Patterns

### The decision: one OpenAI call per Worker invocation, driven by a D1 job table

**The Cloudflare facts this rests on** (all from https://developers.cloudflare.com/workers/platform/limits/, page last updated 2026-09-05, quoted verbatim):

| Limit | Workers **Free** | Workers Paid |
|-------|------------------|--------------|
| CPU time per HTTP request | **10 ms** | 5 min (default: 30 seconds) |
| Subrequests per invocation | **50** | 10,000 (up to 10M) |
| Simultaneous outgoing connections | **6** | 6 |
| Requests | 100,000/day | No limit |
| Memory | 128 MB | 128 MB |
| Wall time, incoming HTTP request | **Unlimited** | Unlimited |

- "CPU time measures how long the CPU spends executing your Worker code. **Waiting on network requests (such as `fetch()` calls, KV reads, or database queries) does not count toward CPU time.**"
- "There is **no hard limit on duration for HTTP-triggered Workers**. As long as the client remains connected, the Worker can continue processing, making subrequests, and streaming a response body."
- "`waitUntil()` can extend execution for **up to 30 seconds** after the response is sent or the client disconnects."
- "There is **no set time limit on individual subrequests**."
- "Most Workers consume very little CPU time. The average Worker uses approximately 2.2 ms per request. Heavier workloads that handle authentication, server-side rendering, or parse large payloads typically use 10-20 ms."
- Exceeding CPU returns **Error 1102**, "Worker exceeded resource limits", invocation outcome `exceededCpu`.

D1 adds (https://developers.cloudflare.com/d1/platform/limits/): **queries per Worker invocation 50 (Free) / 1000 (Paid)**, max SQL statement 100 KB, **max 100 bound parameters per query**, max string/row 2 MB, max database 500 MB (Free).

**Candidate architectures, evaluated:**

| Shape | Bindings / config needed | Paid plan? | Verdict |
|-------|--------------------------|------------|---------|
| All 6 calls sequentially inside one request | none | no | **Rejected.** Works on the limits (wall time is unlimited, CPU is only the marshalling) but takes 2-4 minutes behind a blank browser tab, fails DRAFT-05 ("sees the run's status *while* it generates"), and a disconnect throws away every call already paid for |
| All calls in one request with `Promise.all` | none | no | **Rejected.** ~30 s not 2 min, and 3 concurrent is under the 6-connection cap. But still zero intermediate status, still loses everything on disconnect, and concurrent calls cannot hit each other's prompt cache |
| `ctx.waitUntil` background continuation | none | no | **Rejected on the facts.** `waitUntil` extends execution "up to 30 seconds after the response is sent". Five or six reasoning calls will not finish in 30 s. Viable for *one* call, which is not a useful unit |
| **One call per invocation + D1 job rows + self-submitting form** | none | **no** | **RECOMMENDED** |
| Cloudflare Queues | `queues.producers` + `queues.consumers` in `wrangler.jsonc`, a `queue()` handler, `wrangler queues create` | no (Free includes 10,000 operations/day) | Rejected as over-build. Consumer wall time 15 min is ample, but consumers on Free still run under the 10 ms CPU limit, so it buys nothing on CPU. It adds a second execution context, a dead-letter story, and a second place errors can hide, for one user |
| Durable Object | `durable_objects.bindings` + `migrations` block in `wrangler.jsonc`, an exported DO class | no (Free supports SQLite-backed DOs only) | Rejected. Alarm handlers get 15 min wall time but the same 10 ms CPU on Free. Real coordination value at multi-user scale; none at one user, and D1 already gives durable state |
| Cloudflare Workflows | `workflows` binding + an exported `WorkflowEntrypoint` class | no | Closest genuine competitor: `step.do()` gives durable steps, built-in retries and an instance status to poll, and "each step can run for an unlimited wall time". Rejected for the pilot because it introduces a new runtime primitive, a new class shape and a new status model to learn, to replace ~40 lines of D1 SQL that this codebase already knows how to write. **Revisit in Phase 5+ if runs grow past ~10 steps** |
| Cron trigger sweeping pending runs | `triggers.crons` in `wrangler.jsonc` | no | Rejected. 1-minute granularity means the user clicks Generate and stares at nothing for up to 60 s before anything starts |

**Why one call per invocation wins:**

1. **Free plan safe.** Per invocation: 1 OpenAI `fetch` + ~4 D1 queries = 5 of 50 subrequests, 5 of 50 D1 queries, 1 of 6 connections, and roughly 1-2 ms CPU (one `JSON.stringify` of a capped payload, one `JSON.parse` of a few KB, one JSX render).
2. **DRAFT-05 falls out for free.** The status page is a plain `GET` that reads job rows. After every step the user sees "Draft 2 of 3", an error message on the failed one, and a Retry button.
3. **Retry is idempotent by construction.** The step route only ever claims a job whose status is not `done`. Two of three drafts succeeded means the retry makes exactly one call.
4. **Partial-failure blast radius is one call (~$0.01)**, not a whole run.
5. **Prompt caching works.** Sequential drafting calls share a >1,024-token prefix, so calls 2 and 3 read it at $0.40/1M instead of $4.00/1M.
6. **It matches the codebase.** POST -> validate -> 303 redirect, bound-parameter D1 helpers, router-per-feature, hono/jsx escaping. Nothing new to learn.

**The only cost:** total wall time is the sum, roughly 6 x 20 s = ~2 min per run, versus ~40 s if everything were fired concurrently. For a product whose pitch is "a week of content in one hour instead of eight", two minutes of visible progress is not the bottleneck.

### Recommended run model (migration 0003)

```sql
-- Phase 3: outlier templates and generated drafts.
--
-- Compliance note (Data Protection (Jersey) Law 2018):
-- Nothing in this phase may send a meeting title, participant name, speaker
-- label or any other speaker's words to OpenAI. Only transcripts.body (the
-- executive's own lines, per migration 0002), voice_samples.body, and the
-- outlier text the user pasted themselves.
--
-- outliers.template_json is stored but NEVER rendered in the UI (product decision).

CREATE TABLE runs (
  id            TEXT PRIMARY KEY,          -- crypto.randomUUID()
  transcript_id TEXT NOT NULL,
  status        TEXT NOT NULL,             -- 'pending' | 'running' | 'done' | 'failed'
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE outliers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  position      INTEGER NOT NULL,          -- 1..3
  body          TEXT NOT NULL,             -- the pasted outlier post
  template_json TEXT,                      -- NULL until extracted; never rendered
  status        TEXT NOT NULL,             -- 'pending' | 'running' | 'done' | 'failed'
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_code    TEXT,
  error_message TEXT,
  started_at    TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE drafts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            TEXT NOT NULL,
  position          INTEGER NOT NULL,      -- 1..3
  outlier_id        INTEGER NOT NULL,      -- which template filled this draft
  body              TEXT,                  -- NULL until generated
  source_lines_json TEXT,                  -- quotes the model grounded on
  status            TEXT NOT NULL,
  attempts          INTEGER NOT NULL DEFAULT 0,
  error_code        TEXT,
  error_message     TEXT,
  started_at        TEXT,
  updated_at        TEXT NOT NULL
);

CREATE INDEX outliers_run ON outliers(run_id, position);
CREATE INDEX drafts_run   ON drafts(run_id, position);
```

**Room left for Phase 4 (DRAFT-04):** migration 0004 adds `decision TEXT`, `final_text TEXT`, `decided_at TEXT` to `drafts`. Nothing in Phase 3 needs to change for that, and the drafting prompt already has a labelled slot (see Prompt Design) where the approved-post block gets inserted.

**Three drafts from two or three templates:** when only two outliers were pasted, assign `drafts.outlier_id` round-robin over the outliers by position (1 -> A, 2 -> B, 3 -> A). DRAFT-02 says each draft is filled from *one of* the run's templates; it does not require a bijection.

### Pattern 1: Claim-then-work (the idempotency guard)

**What:** never call OpenAI without first winning an atomic claim on the job row.
**When to use:** every step, always. Two browser tabs, a double-click, or a back-button resubmit will otherwise pay twice.
**How:** two statements, no `RETURNING` (D1's support for `RETURNING` is not documented on the pages I read — do not rely on it).

```ts
// 1. Find the next unfinished job for this run.
const staleBefore = new Date(Date.now() - 180_000).toISOString();
const job = await db
  .prepare(
    "SELECT id, position, outlier_id, status, attempts FROM drafts " +
      "WHERE run_id = ?1 AND (status = 'pending' OR (status = 'running' AND started_at < ?2)) " +
      "ORDER BY position LIMIT 1",
  )
  .bind(runId, staleBefore)
  .first<DraftJob>();

if (!job) return; // nothing to do; the run is finished or every job already failed

// 2. Claim it. meta.changes === 1 means we won.
const claim = await db
  .prepare(
    "UPDATE drafts SET status = 'running', attempts = attempts + 1, started_at = ?1, updated_at = ?1 " +
      "WHERE id = ?2 AND status = ?3",
  )
  .bind(new Date().toISOString(), job.id, job.status)
  .run();

if (claim.meta.changes !== 1) {
  // Another invocation claimed it first. Redirect back to the status page.
  return c.redirect(`/runs/${runId}`, 303);
}
```

The `status = 'running' AND started_at < staleBefore` clause is the crash recovery: a Worker killed mid-call leaves `running` forever otherwise. 180 s comfortably exceeds the 120 s `AbortSignal` timeout.

### Pattern 2: Self-submitting step form (progress without a JS framework)

**What:** the status page renders a POST form that submits itself after a short delay. With JavaScript off it is a labelled "Continue" button. POST semantics are preserved, so the app-wide `csrf()` Origin check still applies and no `GET` ever mutates.

**Critical:** only render it when there is claimable work **and** the last failure was retryable **and** `attempts < 2`. Otherwise a 401 will loop forever, burning Free-plan requests.

```tsx
{pending > 0 && autoAdvance ? (
  <>
    <form method="post" action={`/runs/${run.id}/step`} id="step">
      <button type="submit">Continue ({done} of {total} done)</button>
    </form>
    <script
      dangerouslySetInnerHTML={{
        __html: "setTimeout(function(){document.getElementById('step').submit()},400)",
      }}
    />
  </>
) : null}
```

`dangerouslySetInnerHTML` for `<script>` is the same escape hatch 01-01 established for `<style>` — hono/jsx escapes text children.

### Pattern 3: Prefix-stable prompt assembly (free cost cut)

Assemble the drafting input in strictly this order so the varying part is last and the shared part can be cached:

```
instructions (top-level `instructions` param)   <- identical across all 3 drafts
<voice_samples> ... </voice_samples>            <- identical
<transcript> ... </transcript>                  <- identical
<format> {"hook":..,"structure":[..],"angle":..} </format>   <- VARIES per draft
```

Prompt caching is on by default. "The minimum cacheable prompt length is 1,024 tokens for GPT-5.6 and later." Our shared prefix is ~5,000 tokens, so drafts 2 and 3 read it at the cached rate ($0.40/1M instead of $4.00/1M on sol). This only works because the calls are **sequential** — concurrent calls have no earlier write to hit.

Phase 4 inserts `<approved_posts>` between `<voice_samples>` and `<transcript>`, still inside the cacheable prefix.

### Recommended file layout

```
src/
  openai.ts        # client: callResponses(), OpenAIError, error mapping. Takes apiKey as an argument.
  prompts.ts       # pure: buildExtractionInput(), buildDraftingInput(), the two schemas, the two instruction strings
  runs.tsx         # router: GET /runs, GET|POST /runs/new, GET /runs/:id, POST /runs/:id/step, POST /runs/:id/retry
  db.ts            # + run/outlier/draft helpers, bound parameters only
migrations/
  0003_runs.sql
test/
  prompts.test.ts  # vitest: truncation caps, prefix ordering, no title leaks into the payload
```

`src/prompts.ts` being pure and I/O-free makes it the natural second TDD target after `src/speaker-filter.ts`: assert that the built payload contains the transcript body and the samples and **does not contain** the meeting title or speaker label.

### Anti-Patterns to Avoid

- **Firing all three drafting calls with `Promise.all`.** Costs you the prompt cache, gives zero intermediate status, and a disconnect loses all three.
- **Advancing the run from a `GET`.** The meta-refresh temptation. It makes a money-spending mutation reachable by an `<img src>`, and it contradicts the app-wide `csrf()` discipline.
- **A `waitUntil` chain across calls.** 30 seconds. It will silently truncate your run.
- **Storing the OpenAI response object.** Store the parsed `post` and `source_lines`. The raw response carries reasoning metadata and inflates D1.
- **Rendering `template_json`.** OUTL-02 says stored, never shown. Do not add a "debug" view; it will ship.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Getting JSON of a fixed shape out of the model | "Reply with JSON only" + `JSON.parse` + a repair/retry loop | `text.format` with `type: "json_schema"`, `strict: true` | Docs: only Structured Outputs "ensure schema adherence". A strict schema removes the entire class of parse-failure retries, and makes refusals programmatically detectable via a `refusal` content part |
| Validating the model's JSON against your TypeScript type | A hand-written validator or zod | The strict schema itself | With `strict: true` every listed field is present and no extra keys appear. Validate only *semantics* (e.g. is each `source_line` actually a substring of the transcript) |
| Background execution / durable job state | A custom in-memory queue, a `setTimeout` chain, a self-`fetch` | D1 job rows + claim-then-work | Workers isolates are not durable and `waitUntil` caps at 30 s. Also: a Worker self-`fetch` on the same zone is documented to fail, and would be blocked by the Access gate anyway |
| Knowing whether an error is worth retrying | Retrying every non-2xx | The `error.code` table in Common Pitfalls | The docs say outright: "Retrying billing, spend, or quota errors won't restore API access." Blind retry on `credit_balance_exhausted` is an infinite loop |
| Backoff timing on 429 / 503 | A fixed sleep | The `Retry-After` response header | "`Retry-After` may be present on `429` responses caused by a temporary rate limit and `503` responses caused by temporary model overload" |
| Counting tokens before sending | A tokenizer in the Worker | Character caps + `max_output_tokens` + reading `usage` from the response | A tokenizer is bundle weight and CPU you do not have on 10 ms. Cap characters, then read the real numbers back from `usage.input_tokens` / `usage.output_tokens_details.reasoning_tokens` |
| Speaker filtering | Anything | `src/speaker-filter.ts` (Phase 2) | Already the single gate. Phase 3 reads `transcripts.body`, which is already filtered. Do not add a new path to unfiltered sentences |

## Common Pitfalls

### Pitfall 1: The `text.format` shape is NOT the Chat Completions `response_format` shape

**What goes wrong:** you write `response_format: { type: "json_schema", json_schema: { name, strict, schema } }` from memory and get a 400.
**Why it happens:** Chat Completions nests under a `json_schema` key. The Responses API flattens it.
**Correct (Responses):** `text: { format: { type: "json_schema", name: "...", strict: true, schema: {...} } }` — `name`, `strict` and `schema` are all siblings inside `format`.
**Warning sign:** HTTP 400 `invalid_request_error` naming `text` or `response_format` in `error.param`.

### Pitfall 2: `output[0]` is the reasoning item, not the message

**What goes wrong:** you read `json.output[0].content[0].text` and get `undefined`, intermittently.
**Why it happens:** reasoning models emit a `reasoning` item into `output[]` before the `message` item. `output_text` is a convenience the SDKs synthesise; over raw HTTP you must walk the array.
**How to avoid:** always `json.output.find(i => i.type === "message")`, then check `content[0].type` is `"output_text"` (and not `"refusal"`).

### Pitfall 3: `store` defaults to retaining your data for 30 days

**What goes wrong:** the executive's meeting words sit in the OpenAI dashboard for a month, which is exactly the compliance question CLAUDE.md flags.
**Why it happens:** docs: "the Responses API has a **30 day Application State retention period by default**, or when the `store` parameter is set to true."
**How to avoid:** set `store: false` on **every** request in this phase. Abuse-monitoring logs are still retained 30 days (that requires an approved ZDR/Modified Abuse Monitoring agreement to change, out of scope for the pilot) — but application state retention drops to none. Record this honestly in the phase summary rather than claiming the data is not retained at all.

### Pitfall 4: sending the meeting title leaks a client identifier

**What goes wrong:** you build the prompt from a `TranscriptRow` and pass the whole object, so `title` ("Vincent <> Acme Capital review") goes to OpenAI.
**Why it happens:** Fireflies meeting titles routinely name the counterparty. `transcripts.title` is displayed in the UI legitimately, so it feels safe.
**How to avoid:** `buildDraftingInput()` takes **primitives only** — `body: string`, `samples: string[]`, `template: Template`. Never a `TranscriptRow`. Assert it in `test/prompts.test.ts`: build a payload from a transcript titled `"Call with Acme Ltd"` and assert `!payload.includes("Acme")`.
**This is the JFSC-regulated-firm constraint in CLAUDE.md, enforced in code.**

### Pitfall 5: the auto-advance form loops forever on a non-retryable error

**What goes wrong:** the key is wrong, every step 401s, the form resubmits, and you burn through the Free plan's 100,000 daily requests.
**How to avoid:** render the auto-submit `<script>` only when `retryable && attempts < 2`. On a non-retryable error render the message and a manual Retry button with no script. Store `attempts` on the job row so a page reload cannot reset the counter.

### Pitfall 6: `incomplete` costs you money and returns nothing

**What goes wrong:** `max_output_tokens` is set too low; the model spends its whole budget on reasoning tokens and you get `status: "incomplete"` with no visible output — and you are billed for the reasoning.
**Why it happens:** docs: "This might occur before any visible output tokens are produced, meaning you could incur costs for input and reasoning tokens without receiving a visible response."
**How to avoid:** 4000 for extraction, 8000 for drafting. Always check `json.status === "incomplete" && json.incomplete_details.reason === "max_output_tokens"` and surface it as a distinct, *retryable-once-with-more-budget* error. Never tune `max_output_tokens` downward to save money; a truncated response is 100% waste.

### Pitfall 7: the 10 ms Free-plan CPU budget is spent on payload marshalling

**What goes wrong:** Error 1102 `exceededCpu` on a long transcript, intermittently, and only in production.
**Why it happens:** `JSON.stringify` of a large prompt body plus a JSX render can approach 10 ms. Cloudflare's own note: workloads that "parse large payloads typically use 10-20 ms."
**How to avoid:**
- Cap what goes in: transcript excerpt **12,000 characters** (truncate on a line boundary, and tell the user "using the first N of M lines"); voice samples **3 most recent, 2,500 characters each**; each pasted outlier **5,000 characters**.
- One OpenAI call per invocation, so you marshal one payload, not three.
- Do not read `transcripts.body` on list pages — `TranscriptSummary` already omits it; keep that discipline for `runs` list views too.
**Escape hatch (state this in the plan):** if `exceededCpu` shows up in the observability logs, Workers Paid at $5/month raises CPU to 30 s by default with **zero code change**. The recommended architecture does not require it.

### Pitfall 8: strict schemas have hard structural rules

**What goes wrong:** the API rejects your schema at request time.
**Rules, verbatim from the docs:**
- "All fields must be `required`" — optional is emulated with `"type": ["string", "null"]`.
- "`additionalProperties: false` must always be set in objects."
- "the root level object of a schema must be an object, and not use `anyOf`."
- "A schema may have up to 5000 object properties total, with up to 10 levels of nesting."
- Unsupported: `allOf`, `not`, `dependentRequired`, `dependentSchemas`, `if`, `then`, `else`.
- "When using Structured Outputs, outputs will be produced in the same order as the ordering of keys in the schema." (Put `post` before `source_lines` so the post generates first.)

### Pitfall 9: D1 caps bound parameters at 100 per query, and queries at 50 per invocation on Free

**What goes wrong:** a batched insert of outliers and drafts silently approaches the limit, or an N+1 status page burns the 50-query budget alongside the OpenAI subrequest.
**How to avoid:** one statement per row for the 3+3 rows at run creation (6 queries, fine), and a single `SELECT ... WHERE run_id = ?` per table on the status page. Both subrequests **and** D1 queries count 50 on Free, so keep the step route under ~10 total.

### Pitfall 10: OpenAI error codes that look retryable but are not

**What goes wrong:** you retry a 429 forever on an account with no credit.
**Why it happens:** billing exhaustion returns **429**, the same status as rate limiting.
**How to avoid:** branch on `error.code`, not on the status alone. Full table in Error Handling below. Docs: "For billing-related errors, inspect `error.code` to identify the specific cause. The broader `error.type` can still be `insufficient_quota`. Retrying billing, spend, or quota errors won't restore API access."

## Code Examples

### The template schema (OUTL-02)

```ts
// src/prompts.ts
export type Template = {
  hook: string;
  structure: string[];
  angle: string;
};

export const TEMPLATE_SCHEMA = {
  type: "object",
  properties: {
    hook: {
      type: "string",
      description:
        "The mechanism of the opening one or two lines, written as an instruction a " +
        "writer could follow on any topic. Never the post's actual opening words.",
    },
    structure: {
      type: "array",
      description: "The ordered beats of the post, 3 to 7 items, one short instruction per beat.",
      items: { type: "string" },
    },
    angle: {
      type: "string",
      description:
        "The stance the writer takes toward the reader: who they position themselves as, " +
        "and what the reader is meant to feel or do.",
    },
  },
  required: ["hook", "structure", "angle"],
  additionalProperties: false,
} as const;
```

### The draft schema (DRAFT-02, DRAFT-03)

```ts
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    post: {
      type: "string",
      description: "The finished LinkedIn post, 80 to 220 words, with line breaks as they should appear.",
    },
    source_lines: {
      type: "array",
      description:
        "1 to 3 substrings copied verbatim from the TRANSCRIPT block that this post is built on.",
      items: { type: "string" },
    },
  },
  required: ["post", "source_lines"],
  additionalProperties: false,
} as const;
```

`source_lines` is the grounding device for success criterion 3. After parsing, check each entry with `transcriptBody.includes(line)` and record a `grounded: boolean`. Treat a miss as a **warning shown next to the draft**, not a hard failure: strict schemas constrain shape, not verbatim accuracy.

### The Worker client (`src/openai.ts`)

Mirrors `src/fireflies.ts`: the key is an argument, never read from env here, never logged, never placed in an error message.

```ts
const ENDPOINT = "https://api.openai.com/v1/responses";

export class OpenAIError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code: string,
    status: number,
    retryable: boolean,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "OpenAIError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type ResponseBody = {
  status?: string;
  error?: { message?: string; type?: string; code?: string; param?: string | null } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string; refusal?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

/**
 * One Responses API round-trip returning a strict-schema JSON object.
 * `apiKey` is passed in and never logged. No request body or transcript text
 * ever reaches an error message.
 */
export async function callStructured<T>(
  apiKey: string,
  opts: {
    model: string;
    instructions: string;
    input: string;
    schemaName: string;
    schema: unknown;
    maxOutputTokens: number;
    effort?: "none" | "low" | "medium" | "high";
    timeoutMs?: number;
  },
): Promise<{ value: T; usage: ResponseBody["usage"] }> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        instructions: opts.instructions,
        input: opts.input,
        reasoning: { effort: opts.effort ?? "low" },
        max_output_tokens: opts.maxOutputTokens,
        // Jersey DP: do not let OpenAI retain application state for 30 days.
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: opts.schemaName,
            strict: true,
            schema: opts.schema,
          },
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch {
    // AbortSignal.timeout or a network failure. Never echo the cause.
    throw new OpenAIError("OpenAI did not respond in time", "timeout", 0, true);
  }

  if (!res.ok) {
    let body: ResponseBody | null = null;
    try {
      body = (await res.json()) as ResponseBody;
    } catch {
      res.body?.cancel();
    }
    throw toOpenAIError(body, res);
  }

  const body = (await res.json()) as ResponseBody;

  if (body.status === "failed") {
    throw new OpenAIError(
      body.error?.message ?? "OpenAI could not complete the request",
      body.error?.code ?? "failed",
      200,
      true,
    );
  }
  if (body.status === "incomplete") {
    const reason = body.incomplete_details?.reason ?? "unknown";
    throw new OpenAIError(
      reason === "max_output_tokens"
        ? "The model ran out of output budget before finishing"
        : `OpenAI stopped early (${reason})`,
      `incomplete_${reason}`,
      200,
      reason === "max_output_tokens",
    );
  }

  // Reasoning models put a `reasoning` item first; find the message item.
  const message = body.output?.find((item) => item.type === "message");
  const content = message?.content?.[0];

  if (content?.type === "refusal") {
    throw new OpenAIError(
      content.refusal ?? "The model declined this request",
      "refusal",
      200,
      false,
    );
  }
  if (content?.type !== "output_text" || typeof content.text !== "string") {
    throw new OpenAIError("OpenAI returned no usable output", "no_output", 200, true);
  }

  return { value: JSON.parse(content.text) as T, usage: body.usage };
}

const NON_RETRYABLE_429 = new Set([
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

function toOpenAIError(body: ResponseBody | null, res: Response): OpenAIError {
  const code = body?.error?.code ?? `http_${res.status}`;
  const message = body?.error?.message ?? `OpenAI returned HTTP ${res.status}`;
  const header = res.headers.get("Retry-After");
  const retryAfter = header && /^\d+$/.test(header) ? Number(header) : null;

  const retryable =
    res.status === 500 ||
    res.status === 503 ||
    (res.status === 429 && !NON_RETRYABLE_429.has(code));

  return new OpenAIError(message, code, res.status, retryable, retryAfter);
}
```

### The step route

```tsx
// src/runs.tsx
runs.post("/runs/:id/step", async (c) => {
  const runId = c.req.param("id");
  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.html(<Layout title="Not configured">...point at /health...</Layout>, 500);
  }

  const job = await claimNextJob(c.env.DB, runId); // Pattern 1
  if (!job) return c.redirect(`/runs/${runId}`, 303);

  try {
    if (job.kind === "extract") {
      const { value } = await callStructured<Template>(apiKey, {
        model: MODEL_EXTRACT,               // "gpt-5.6-terra"
        instructions: EXTRACT_INSTRUCTIONS,
        input: buildExtractionInput(job.outlierBody),
        schemaName: "outlier_template",
        schema: TEMPLATE_SCHEMA,
        maxOutputTokens: 4000,
        timeoutMs: 60_000,
      });
      await finishOutlier(c.env.DB, job.id, value);
    } else {
      const { value } = await callStructured<DraftOut>(apiKey, {
        model: MODEL_DRAFT,                 // "gpt-5.6-sol"
        instructions: DRAFT_INSTRUCTIONS,
        input: buildDraftingInput(job.samples, job.transcriptExcerpt, job.template),
        schemaName: "linkedin_draft",
        schema: DRAFT_SCHEMA,
        maxOutputTokens: 8000,
        timeoutMs: 120_000,
      });
      await finishDraft(c.env.DB, job.id, value);
    }
  } catch (err) {
    const e = err instanceof OpenAIError ? err : new OpenAIError("Unexpected failure", "unknown", 0, false);
    await failJob(c.env.DB, job, e.code, e.message, e.retryable);
  }

  return c.redirect(`/runs/${runId}`, 303);
});
```

Note the `catch` never lets a raw `Error` reach the page, and `OpenAIError.message` is always OpenAI's own text or a fixed string — never a stack, never the key, never the prompt.

## Prompt Design

### (a) Template extraction, without copying the outlier's content

The whole trick is to force the model to describe **form** and forbid **substance**. Put that in `instructions` (which "will take priority over a prompt in the `input` parameter") and repeat it in the schema field descriptions, because the model reads those too.

```
You analyse high-performing LinkedIn posts and describe their reusable FORM.

You will be given one LinkedIn post that performed unusually well. Describe only
how it is built. Never describe what it is about.

Rules:
- Never quote, paraphrase or reuse any specific fact, name, company, number,
  place, product, industry or anecdote from the post.
- Describe the shape of each part, not what it said. Write "opens with a
  one-line admission of a past mistake", never "opens by admitting he lost a
  client".
- A reader of your output must not be able to guess what the original post was
  about. If they could, you have failed.
- `hook`: the mechanism of the first one or two lines, as an instruction a
  writer could follow on any topic.
- `structure`: the ordered beats, 3 to 7 of them, one short instruction each.
- `angle`: the stance the writer takes toward the reader - who they position
  themselves as, and what the reader is meant to feel or do.
- If the post is too short or incoherent to have a reusable form, set `angle` to
  "unclear" and give your best reading of the rest.
```

Input: `<outlier_post>\n{pasted text, capped at 5,000 chars}\n</outlier_post>`.

**Cheap verification for the phase's verification step:** extract a template from an outlier about, say, crypto regulation, and confirm the stored `template_json` contains no crypto vocabulary. This is exactly why the template is stored but never rendered — the UI has no need for it, and hiding it removes the temptation to let it leak topic into the drafts.

### (b) Voice-matched drafting, grounded in the executive's own material

```
You are a ghostwriter who writes LinkedIn posts in one specific executive's voice.

You will be given, in this order:
1. VOICE SAMPLES - writing the executive published themselves.
2. TRANSCRIPT - lines the executive personally said in a meeting. Every line is
   theirs; no other speaker's words are included.
3. FORMAT - the shape the post must follow.

Write ONE LinkedIn post.

Grounding rules (these override everything else):
- Every claim, opinion, number, example and story must come from the TRANSCRIPT
  or the VOICE SAMPLES. Invent nothing. Add no statistics, no research, no
  industry commentary that is not already there.
- If the material does not support a beat in FORMAT, drop that beat rather than
  inventing content to fill it. A shorter honest post beats a complete invented one.
- Do not name clients, counterparties, firms or individuals. If the transcript
  names someone, write around it: "a client", "a firm we work with".
- Never mention that a transcript, meeting, recording, notes or AI were involved.

Voice rules:
- Match the sentence length, rhythm, punctuation habits and vocabulary of the
  VOICE SAMPLES. Reuse the executive's own phrasings where they fit.
- Do not use em dashes. No hashtags. No emoji. No "Thoughts?" sign-off.
- Banned words and phrases: delve, leverage, unlock, game-changer, landscape,
  "in today's fast-paced", "it's not just X, it's Y".

FORMAT rules:
- Follow the beats in order. FORMAT describes shape only; it carries no subject
  matter. Do not import any topic, example or phrasing from it.

Output:
- `post`: the finished post, 80 to 220 words, line breaks as they should appear.
- `source_lines`: 1 to 3 substrings copied verbatim from TRANSCRIPT that the
  post is built on.
```

Input, in this exact order (prefix-stable, see Architecture Pattern 3):

```
<voice_samples>
{sample 1}
---
{sample 2}
---
{sample 3}
</voice_samples>

<transcript>
{transcripts.body, capped at 12,000 chars on a line boundary}
</transcript>

<format>
{"hook":"...","structure":["...","..."],"angle":"..."}
</format>
```

**Three notes the plan should carry:**

1. **`source_lines` is what makes DRAFT-03 checkable.** Asking the model to name the lines it built on both improves grounding (it has to find real material before writing) and gives you a mechanical check (`body.includes(line)`) plus a reviewable trail in the Phase 4 approval view.
2. **Why the FORMAT block goes last.** Prompt caching, and recency: the model follows the most recent structural instruction more reliably.
3. **Phase 4's slot (DRAFT-04).** Insert `<approved_posts>` immediately after `</voice_samples>`, carrying the most recent accepted or edited `final_text` values, with a line in the instructions: "APPROVED POSTS are posts this executive approved for publication. They are the strongest available signal of their voice; weight them above VOICE SAMPLES." Keeping it inside the cacheable prefix means the cache only goes cold on the first run after a new approval.

## Error Handling

| Condition | HTTP | `error.code` | Retryable | User-facing message |
|-----------|------|--------------|-----------|---------------------|
| Bad or revoked key | 401 | `invalid_api_key` and similar | **No** | "OpenAI rejected the API key. Check `OPENAI_API_KEY` on /health, then re-push it with `npm run secrets:push`." |
| Unsupported country | 403 | - | **No** | "OpenAI is not available from this location." |
| Rate limited | 429 | `rate_limit_exceeded`, `slow_down` | **Yes** | "OpenAI is rate limiting this account. Retrying in N seconds." (N from `Retry-After`) |
| Out of credit / over a limit | 429 | `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded` | **No** | "OpenAI has no credit or the spend limit is reached. Top up or raise the limit in the OpenAI dashboard, then retry." |
| Malformed request / context too long / bad schema | 400 | `invalid_request_error` type | **No** | "OpenAI rejected the request: {message}. The transcript may be too long - try a shorter meeting." |
| Server error | 500 | - | **Yes** | "OpenAI had a server error. Retry." |
| Model overloaded | 503 | `server_is_overloaded` | **Yes** | "OpenAI is overloaded right now. Retrying in N seconds." |
| Our timeout / network | n/a | `timeout` | **Yes** | "OpenAI did not respond in time. Retry." |
| Safety refusal | 200 | `refusal` | **No** | Show the model's own refusal text plus "This outlier or transcript triggered a safety refusal. Edit the input and start a new run." |
| Truncated | 200 | `incomplete_max_output_tokens` | **Yes (once)** | "The model ran out of output budget. Retry." |
| Other early stop | 200 | `incomplete_content_filter` and similar | **No** | "OpenAI stopped this generation ({reason})." |

Error body shape on a non-2xx: `{"error": {"message": "...", "type": "...", "param": null, "code": "..."}}`. The docs reference `error.code`, `error.type` and `error.param` individually (for example "an `invalid_request_error` with `error.param` set to `service_tier`").

**Retry policy for the phase:** auto-advance retries a *retryable* failure once (`attempts < 2`), honouring `Retry-After` by rendering the delay into the auto-submit `setTimeout`. Everything else stops and shows the manual Retry button. `POST /runs/:id/retry` resets `status` to `pending` and `attempts` to 0 for every job that is not `done`, then redirects to the status page — **completed jobs are untouched, so nothing is re-paid for**.

## Cost

Short-context rates (all our requests are far under the 272K threshold where the 2x long-context multiplier kicks in), per 1M tokens:

| Model | Input | Cached input | Cache write | Output |
|-------|-------|--------------|-------------|--------|
| `gpt-6-astra` | $10.00 | $1.00 | $12.50 | $50.00 |
| `gpt-5.6-sol` | $4.00 | $0.40 | $5.00 | $20.00 |
| `gpt-5.6-terra` | $2.00 | $0.20 | $2.50 | $12.00 |
| `gpt-5.6-luna` | $0.20 | $0.02 | $0.25 | $1.20 |

**Per run, at the recommended models** (3 outliers, ~3,000-token transcript excerpt, ~1,900 tokens of voice samples):

| Step | Calls | Input tokens | Output tokens (incl. reasoning) | Cost |
|------|-------|--------------|----------------------------------|------|
| Extraction, `gpt-5.6-terra` | 3 | ~1,200 each = 3,600 | ~650 each = 1,950 | ~$0.031 |
| Drafting, `gpt-5.6-sol`, no caching | 3 | ~6,000 each = 18,000 | ~1,500 each = 4,500 | ~$0.162 |
| **Total, no caching** | 6 | | | **~$0.19** |
| Drafting with sequential prompt caching | 3 | 6,000 fresh + 2 x ~5,000 cached | same | ~$0.116 |
| **Total, with caching** | 6 | | | **~$0.15** |

**Sanity check on the pilot's economics:** at two runs a week that is roughly **$1.30 a month**. Even at `gpt-6-astra` for drafting (~$0.40/run) it is about $3.50 a month. **Model cost is not a constraint on this product; quality is.** Plan accordingly: do not trade draft quality for token savings.

Cloudflare cost: **$0** on the Free plan under this architecture. A run is ~8 Worker invocations against a 100,000/day allowance.

**Instrument it.** Write `usage.input_tokens`, `usage.output_tokens` and `usage.output_tokens_details.reasoning_tokens` into the job rows (or at minimum log the totals). Reasoning-token counts are the one number that could make these estimates materially wrong, and after two real runs the estimate becomes a measurement.

## State of the Art (2026)

| My training said | Current reality | Impact |
|------------------|-----------------|--------|
| Chat Completions is the default API | "Responses is recommended for all new projects"; reasoning models perform better on it and cache 40-80% better | Use `/v1/responses`. Different request and response shapes |
| `gpt-4o` / `gpt-4o-mini` are the workhorses | Current lineup is `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`; GPT-4o and GPT-5.x are last-generation but callable | Model ids from memory would be stale-but-working, and 5-20x worse value |
| `response_format: { type: "json_schema", json_schema: {...} }` | Responses uses `text: { format: { type: "json_schema", name, strict, schema } }` (flattened) | Guaranteed 400 if written from memory |
| Non-reasoning chat models, no effort knob | Every current model is a reasoning model with `reasoning.effort` of `none`/`low`/`medium`/`high`/`xhigh`/`max`, and GPT-5.6 adds `reasoning.mode: standard \| pro` | Effort is now the main latency and cost lever. `gpt-6-astra` **rejects** `effort: "none"` with a 400 |
| Context windows in the 128K range | `gpt-5.6-terra`/`luna`: 1,050,000-token context, 922,000 max input, 128,000 max output, knowledge cutoff 2026-02-16 | Context length is a non-issue for this phase; cost and CPU are the reasons to cap input, not the window |
| n/a | `background: true` + poll `GET /v1/responses/{id}` exists for long-running work | A genuine alternative architecture - see Open Questions |
| n/a | `DELETE /v1/responses/{id}` exists | Useful belt-and-braces if `store: false` is ever not enough |

**Cloudflare, verified today:** the Free plan's CPU allowance is 10 ms per HTTP request, subrequests 50, D1 queries 50 per invocation, D1 database 500 MB. Queues, Durable Objects (SQLite backend) and Workflows are all now available on the Free plan — so "needs a paid plan" is **not** a valid reason to reject them; over-build for a single user is.

## Open Questions

1. **Does `background: true` compose with `text.format` strict JSON schema?**
   - What we know: `background` is a top-level parameter on `POST /v1/responses`; `text.format` is a separate top-level parameter; the background guide documents `store: false` support and ~10-minute polling retention; the only documented incompatibility is WebSocket mode ("background is not supported over WebSocket").
   - What's unclear: no doc page states the combination explicitly.
   - Confidence: MEDIUM that it works.
   - Recommendation: **do not depend on it in Phase 3.** The recommended architecture does not need it. What would settle it: one live call with both parameters set. If background does work, it is the natural Phase 4/5 upgrade — it makes a disconnect cost nothing, since the response keeps generating and is retrievable by id.

2. **Does D1 support `RETURNING`?**
   - What we know: D1 is SQLite and SQLite has supported `RETURNING` since 3.35, but neither the D1 SQL statements page nor the D1 Worker API page mentions it.
   - Recommendation: use the documented two-statement claim (`SELECT` then conditional `UPDATE` checking `meta.changes`). It is one extra query out of a 50-query budget and it is certain. What would settle it: `wrangler d1 execute pipeflick-db --local --command "UPDATE settings SET value='x' WHERE key='y' RETURNING key"`.

3. **Actual CPU consumption per step on the Free plan.**
   - What we know: the budget is 10 ms; Cloudflare's own guidance says payload-parsing workloads "typically use 10-20 ms"; our per-invocation work is one `JSON.stringify` of a capped (~25 KB) payload, one `JSON.parse` of a few KB, and one JSX render.
   - What's unclear: whether that lands at 2 ms or 9 ms in production.
   - Recommendation: build as recommended, then read the real CPU number from Workers Logs (observability is already enabled in `wrangler.jsonc`) on the first production run, and record it in the phase summary. The escape hatch is a $5 plan change with no code change.

4. **Do three drafts generated independently come out too similar?**
   - Each drafting call sees the same transcript and samples but a different template, and none sees the others. This is a plausible quality failure that no amount of doc reading can settle.
   - Recommendation: ship it, and judge it at the Phase 3 verification checkpoint on real data. If the drafts overlap, the cheapest fix is to pass the previous drafts' `source_lines` into the next call with "do not build on these lines again" — which the sequential architecture already makes trivial (drafts 2 and 3 run after 1 has landed). Note this as the designed-in remedy rather than building it up front.

5. **Reasoning-token volume at `effort: "low"`.**
   - The ~650 and ~1,500 output-token figures in the cost table are estimates. Reasoning tokens are billed as output and are invisible until you read `usage`.
   - Recommendation: store `usage` on the job rows from day one, so the cost table becomes a measurement after two runs.

## Sources

### Primary (HIGH confidence)

OpenAI developer docs, read 2026-09-15 via the `developers.openai.com/mcp` documentation server (`search_openai_docs`, `fetch_openai_doc`, `list_api_endpoints`, `get_openapi_spec`). No live API call was made against the account.

- https://developers.openai.com/api/docs/guides/structured-outputs - `text.format` shape, strict-mode rules (all fields required, `additionalProperties: false`, root must be an object, no `allOf`/`not`/`if`, 5000 properties / 10 levels, key ordering), refusal content parts, `status: "incomplete"` and `incomplete_details.reason` handling
- https://developers.openai.com/api/docs/models - current catalogue; featured models GPT-6 Astra, GPT-5.6 Sol/Terra/Luna
- https://developers.openai.com/api/docs/models/gpt-5.6-terra and /gpt-5.6-luna - exact model ids, snapshots, 1,050,000-token context, 922,000 max input, 128,000 max output, knowledge cutoff 2026-02-16, supported endpoints and features (`structured_outputs`, `prompt_caching`)
- https://developers.openai.com/api/docs/pricing - the per-1M rate tables quoted in Cost
- https://developers.openai.com/api/docs/guides/reasoning - `reasoning.effort` values and the use-case table (drafting under `low`), `gpt-6-astra` rejecting `effort: "none"` with a 400, `reasoning.mode: pro` on GPT-5.6, `max_output_tokens` and the incomplete-response warning, `usage.output_tokens_details.reasoning_tokens`
- https://developers.openai.com/api/docs/guides/migrate-to-responses - "While Chat Completions remains supported, Responses is recommended for all new projects"
- https://developers.openai.com/api/docs/guides/error-codes - the status/code/type table, "Retrying billing, spend, or quota errors won't restore API access"
- https://developers.openai.com/api/docs/guides/rate-limits - `Retry-After` and `x-ratelimit-*` headers, usage tiers
- https://developers.openai.com/api/docs/guides/background - `background: true`, polling `GET /v1/responses/{id}`, `POST /v1/responses/{id}/cancel`, `store=false` behaviour and ~10-minute retention
- https://developers.openai.com/api/docs/guides/prompt-caching - 1,024-token minimum cacheable prefix for GPT-5.6+, implicit vs explicit mode, which settings break the prefix, cache-write economics
- https://developers.openai.com/api/docs/guides/your-data - `/v1/responses` retention: no training, 30-day abuse-monitoring retention, "30 day Application State retention period by default, or when the `store` parameter is set to true"
- https://developers.openai.com/api/docs/guides/prompt-engineering#message-roles-and-instruction-following - `instructions` takes priority over `input`
- OpenAPI spec (version 2.3.0) for `/responses` and `/responses/{response_id}` - confirms `GET` and `DELETE` on a response id

Cloudflare docs, read 2026-09-15:

- https://developers.cloudflare.com/workers/platform/limits/ (page states "Last updated Sep 5, 2026") - every CPU, subrequest, connection, memory, duration and wall-time number quoted in Architecture Patterns, plus Error 1102 / `exceededCpu` and the `limits.cpu_ms` config
- https://developers.cloudflare.com/workers/platform/pricing/ - Free vs Paid; Queues, Durable Objects (SQLite backend) and Workflows all available on Free
- https://developers.cloudflare.com/queues/platform/pricing/ - Queues on Free: 10,000 operations/day
- https://developers.cloudflare.com/d1/platform/limits/ - 100 KB max statement, 100 bound parameters, 2 MB max string/row, 500 MB database (Free), 50 queries per invocation (Free) / 1000 (Paid)
- https://developers.cloudflare.com/d1/worker-api/d1-database/ - `meta.changes`, `meta.last_row_id`, `meta.rows_written` result shape

### Repository (HIGH confidence)

- `src/fireflies.ts`, `src/db.ts`, `src/index.tsx`, `src/speaker-filter.ts`, `migrations/0002_sources.sql`, `wrangler.jsonc`, `package.json` - the client, router, D1 helper and migration conventions this phase must extend
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/phases/02-voice-sources/02-DISCOVERY.md`, `02-02-SUMMARY.md`, `02-03-SUMMARY.md`

### Not used

No WebSearch results informed any claim in this document. No Anthropic, Google or open-model comparison was researched - the provider is a settled decision.

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Model ids, pricing, context limits | HIGH | Read from live OpenAI model and pricing pages today; my training data was wrong about all of them |
| Responses API request/response shape, strict schema rules | HIGH | Quoted directly from the structured-outputs guide, including the verbatim restriction list |
| Cloudflare CPU / subrequest / duration / `waitUntil` limits | HIGH | Quoted verbatim from a docs page dated 2026-09-05, with the plan tier stated for each |
| Which alternatives need which bindings and which plan | HIGH | Cross-checked against the Workers and Queues pricing pages; notably, none of Queues, DO or Workflows requires a paid plan |
| Error codes and retryability | HIGH | From the error-codes guide, including the explicit "retrying billing errors won't restore access" |
| Recommended architecture | HIGH on the constraints, MEDIUM on the judgement | The limits are verified; "one call per invocation beats Promise.all" is my reasoning from those limits plus DRAFT-05, not a documented pattern |
| `background: true` + strict schema composing | MEDIUM | No doc states the combination. Not depended upon |
| D1 `RETURNING` support | LOW | Absent from the D1 docs. Avoided entirely in the recommendation |
| Cost per run | MEDIUM | Rates are exact; token counts are estimates, dominated by unmeasured reasoning tokens |
| Prompt wording quality | MEDIUM | Grounded in the docs' own guidance ("include instructions on how to handle situations where the input cannot result in a valid response", "provide examples in the system instructions"), but voice matching is empirical and only the Phase 3 checkpoint on real data can judge it |

**Research date:** 2026-09-15
**Valid until:** Cloudflare limits ~30 days. OpenAI model ids and pricing ~14 days - the catalogue shows five GPT-5.x generations plus GPT-6 shipped inside roughly a year, so re-check `developers.openai.com/api/docs/models` before Phase 4 rather than trusting this file.
