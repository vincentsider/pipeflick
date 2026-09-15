---
phase: 03-drafting
plan: 01
subsystem: api
tags: [openai, responses-api, structured-outputs, prompt-caching, vitest, tdd, pure-functions, data-protection]

# Dependency graph
requires:
  - phase: 02-01
    provides: the pure-module + vitest convention (tests in test/**/*.test.ts, outside tsconfig include) this plan follows exactly
  - phase: 02-02
    provides: transcripts.body and voice_samples.body — the primitives the drafting builder consumes (it must never take the rows themselves)
provides:
  - src/prompts.ts — every OpenAI payload for this phase, assembled in one pure, import-free module
  - buildExtractionInput / buildDraftingInput / excerptTranscript / isGrounded
  - TEMPLATE_SCHEMA and DRAFT_SCHEMA in OpenAI strict-mode shape
  - EXTRACT_INSTRUCTIONS and DRAFT_INSTRUCTIONS verbatim from 03-RESEARCH.md
  - the pinned model ids, output caps, timeouts and input caps (MODEL_EXTRACT, MODEL_DRAFT, MAX_OUTPUT_*, TIMEOUT_*_MS, MAX_OUTLIER_CHARS, MAX_TRANSCRIPT_CHARS, MAX_SAMPLE_CHARS, MAX_SAMPLES)
  - test/prompts.test.ts — 24 cases including the compliance assertion that no meeting title or speaker label can reach OpenAI
affects: [03-02 (src/openai.ts reads the models, caps and timeouts from here), 03-03 (the runs router builds every payload through these functions and records isGrounded per draft), 03-04 (phase verification checks the stored template carries no topic vocabulary), 04-approval (inserts an <approved_posts> block after </voice_samples>, inside the cacheable prefix)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compliance by signature: the prompt module has zero imports and takes primitives only, so a row carrying a counterparty name is not reachable from it — enforced by a test that reads the source and asserts no import statement"
    - "Prefix-stable prompt assembly: voice_samples, transcript, format in that fixed order, with the empty block still rendered, so the cached prefix shape never varies across a run's three drafts"
    - "Model ids, token caps, timeouts and character caps live as named constants in the prompt module, not inline at the call site"

key-files:
  created:
    - src/prompts.ts
    - test/prompts.test.ts
  modified: []

key-decisions:
  - "excerptTranscript reports linesUsed/linesTotal rather than a boolean truncated flag, so the run page can say 'using the first N of M lines' without recomputing anything"
  - "A single line longer than the whole 12000-char budget is hard-truncated inside the line (there is no boundary to cut on) and still reports linesUsed 1 — a pathological transcript degrades instead of sending nothing"
  - "isGrounded rejects a whitespace-only citation as well as an empty array: '' and '  ' are substrings of any string, so a naive includes() check would score an empty citation as grounded"
  - "isGrounded takes the transcript text as an argument rather than reading a row, and its doc says to pass the same excerpt that was sent (the full body is a superset and only ever more lenient)"
  - "The no-imports rule is asserted mechanically in the test suite (readFileSync + /^\\s*import\\s/m), not only in the plan's grep verification, so a future edit that adds an import fails CI-equivalent locally"

patterns-established:
  - "TDD cycle: RED commit is tests only, GREEN is implementation only, REFACTOR skipped when nothing warrants changing"
  - "Instruction strings are module-level template literals copied verbatim from the research, with backticks escaped; tests pin the load-bearing phrases (banned words, 'Invent nothing.', the no-transcript-mention rule) so a well-meaning reword cannot silently drop them"

# Metrics
duration: ~3min
completed: 2026-09-15
---

# Phase 3 Plan 01: Prompt Assembly Summary

**Pure, import-free `src/prompts.ts` that assembles every OpenAI payload for the drafting phase — both strict JSON schemas, both verbatim instruction strings, line-boundary transcript excerpting, prefix-stable block ordering for prompt caching, and the mechanical `isGrounded` check — with the Jersey/JFSC constraint enforced by a primitives-only signature rather than a policy note**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-15T07:48:28Z
- **Completed:** 2026-09-15T07:51:38Z
- **Tasks:** 1 TDD feature (RED → GREEN, no refactor needed)
- **Files modified:** 2 (both created)

## Accomplishments

- `src/prompts.ts` (249 lines) is the compliance boundary for this phase: zero imports, no I/O, no logging, no env access. `buildDraftingInput(samples: string[], transcriptBody: string, template: Template)` takes primitives only, so there is no code path from a Fireflies meeting title (which routinely names a counterparty) or a speaker label to OpenAI. The test suite proves both halves — the payload excludes "Acme"/"Vincent Sider", and the source file contains no `import` statement.
- `excerptTranscript` cuts a body to 12,000 characters on a line boundary and returns `{ text, linesUsed, linesTotal }`, so the run page can report "using the first N of M lines". A short body passes through untouched; an empty body returns zeros; a single line longer than the entire budget is truncated inside it rather than dropped.
- `buildDraftingInput` emits `<voice_samples>`, `<transcript>`, `<format>` in exactly that order — everything before `<format>` is identical across a run's three drafting calls, so drafts 2 and 3 read a ~5,000-token prefix at the cached rate. The `<voice_samples>` block renders even when empty so the cached prefix shape never changes. Samples are capped at 3 × 2,500 chars, joined by `\n---\n`.
- `TEMPLATE_SCHEMA` and `DRAFT_SCHEMA` are `as const` objects in OpenAI strict-mode shape (root `type: "object"`, `additionalProperties: false`, every property in `required`), with `post` declared before `source_lines` so the post generates before its citations.
- `isGrounded(transcriptBody, sourceLines)` is the mechanical half of DRAFT-03: true only when every citation is a non-blank verbatim substring. An empty array is false, because a draft citing nothing is not grounded.
- Model ids, output-token caps, timeouts and input character caps are pinned as named constants in one place, which is what 03-02's client and 03-03's router will read.

## Task Commits

TDD cycle for the single feature in this plan:

1. **RED: failing tests** — `88ad0b4` (test) — 24 cases across 8 describes; suite failed with `Cannot find module '../src/prompts'` while the existing 10 speaker-filter tests kept passing
2. **GREEN: implementation** — `01f551d` (feat) — `src/prompts.ts`; 34/34 tests pass, `tsc --noEmit` exit 0
3. **REFACTOR** — skipped, nothing warranted changing (see Decisions Made)

**Plan metadata:** see the `docs(03-01)` commit following this summary.

## Files Created/Modified

- `src/prompts.ts` - Constants (`MODEL_EXTRACT`, `MODEL_DRAFT`, `MAX_OUTPUT_EXTRACT`, `MAX_OUTPUT_DRAFT`, `TIMEOUT_EXTRACT_MS`, `TIMEOUT_DRAFT_MS`, `MAX_OUTLIER_CHARS`, `MAX_TRANSCRIPT_CHARS`, `MAX_SAMPLE_CHARS`, `MAX_SAMPLES`), types (`Template`, `DraftOutput`, `TranscriptExcerpt`), schemas (`TEMPLATE_SCHEMA`, `DRAFT_SCHEMA`), instructions (`EXTRACT_INSTRUCTIONS`, `DRAFT_INSTRUCTIONS`) and builders (`excerptTranscript`, `buildExtractionInput`, `buildDraftingInput`, `isGrounded`)
- `test/prompts.test.ts` - 24 cases: constant pinning, four excerpt behaviours, extraction wrapping and capping, five drafting-payload behaviours, two compliance assertions, four schema/structural assertions, two instruction-content assertions, three grounding cases

## The numbers later phases need in one place

| Constant | Value | Why |
|----------|-------|-----|
| `MODEL_EXTRACT` | `gpt-5.6-terra` | Balanced tier; template quality gates draft quality, so not luna |
| `MODEL_DRAFT` | `gpt-5.6-sol` | Flagship professional tier; voice fidelity is the product's core risk. ~$0.19/run |
| `MAX_OUTPUT_EXTRACT` | 4000 | Reasoning tokens are billed even when discarded |
| `MAX_OUTPUT_DRAFT` | 8000 | Same, with room for a 220-word post plus citations |
| `TIMEOUT_EXTRACT_MS` | 60,000 | Our own `AbortSignal.timeout`; Cloudflare sets no subrequest limit |
| `TIMEOUT_DRAFT_MS` | 120,000 | Drafting reasons longer than extraction |
| `MAX_OUTLIER_CHARS` | 5,000 | Free-plan 10 ms CPU is spent marshalling payloads |
| `MAX_TRANSCRIPT_CHARS` | 12,000 | Same, cut on a line boundary |
| `MAX_SAMPLE_CHARS` / `MAX_SAMPLES` | 2,500 / 3 | Keeps the cacheable prefix bounded |

**The quality lever:** if the approval rate is under 80% after week one, change `MODEL_DRAFT` to `gpt-6-astra` (~$0.40/run). Nothing else moves. Secondary lever: `reasoning.effort` from `low` to `medium` on drafting only, which lives in 03-02's client, not here.

## Decisions Made

- **No REFACTOR commit.** After GREEN the module was four small exported functions plus constants and two literal blocks; the only candidate change was extracting the `<tag>\n…\n</tag>` wrapper into a helper, which would have added indirection to save nine characters at three call sites. The TDD rule "commit refactor only if something changed" was honoured literally.
- **`excerptTranscript` returns counts, not a flag.** `linesUsed`/`linesTotal` let 03-03 render "using the first 118 of 240 lines" with no second pass over the body — which matters on a 10 ms CPU budget.
- **A blank citation is not grounded.** `"".includes("")` and `body.includes("  ")` are both true, so `isGrounded` trims each entry and rejects the empty ones before the substring check. Without this, a model that returned `["", "", ""]` would have scored as perfectly grounded.
- **The no-imports rule is a test, not just a grep.** `test/prompts.test.ts` reads the source with `node:fs` and asserts against `/^\s*import\s/m` and `/\brequire\(/`. The plan's verification step was a manual grep; making it an assertion means a future edit that imports `src/db.ts` fails `npm test` rather than surviving until someone re-reads the plan.
- **The instruction strings are pinned by test.** Tests assert the presence of "Invent nothing.", "Do not name clients, counterparties, firms or individuals.", the no-transcript-mention rule, the em-dash ban and each banned word. These rules are why drafts are publishable and compliant; a reword that drops one would otherwise be invisible.
- **Backticks inside the instruction text are escaped rather than removed**, so the strings stay byte-verbatim to 03-RESEARCH.md's Prompt Design section.

## Deviations from Plan

None - plan executed exactly as written. Every behaviour listed in the plan's `<behavior>` block has at least one test, the export list matches the plan's `artifacts.exports` exactly (plus the `Template`, `DraftOutput` and `TranscriptExcerpt` types and the four `MAX_OUTPUT_*`/`TIMEOUT_*` constants the behaviour section specified), and both files exceed their `min_lines` (249 vs 120, 265 vs 80).

## Issues Encountered

- Ran concurrently with Plan 03-02 in the same worktree. Handled by staging only this plan's two files by path (never `git add .`); 03-02's `feat(03-02)` migration commit landed immediately before the RED commit with no conflict, and neither plan touched the other's files.
- `npm run check` prints a wrangler advisory to install `@types/node`. Pre-existing and unrelated to this plan (it is about the Worker's `nodejs_compat` flag); `tsc --noEmit` exits 0. The `node:fs` import in the test file is not affected because `test/` sits outside `tsconfig include: ["src"]`.

## Verification

- `npm test` → 34 passed (34), exit 0. The RED commit's run failed first with `Cannot find module '../src/prompts'`
- `npx tsc --noEmit` → exit 0
- `grep -n "^import" src/prompts.ts` → no matches (exit 1), and the same rule is asserted in the suite
- Compliance case passes: a payload built from the executive's own lines, for a meeting Fireflies titled "Call with Acme Ltd" with speaker label "Vincent Sider", contains neither "Acme" nor "Vincent Sider"
- Both schemas pass the structural assertion: root `type === "object"`, `additionalProperties === false`, `required` lists every key of `properties`

## User Setup Required

None - no external service configuration required. The module is pure; `OPENAI_API_KEY` is first needed by 03-02's client.

## Next Phase Readiness

Ready. Plan 03-02 (`src/openai.ts`) and 03-03 (the runs router) can import everything they need from `./prompts`:

- Extraction call: `MODEL_EXTRACT`, `EXTRACT_INSTRUCTIONS`, `buildExtractionInput(body)`, `TEMPLATE_SCHEMA`, `MAX_OUTPUT_EXTRACT`, `TIMEOUT_EXTRACT_MS`
- Drafting call: `MODEL_DRAFT`, `DRAFT_INSTRUCTIONS`, `buildDraftingInput(samples, body, template)`, `DRAFT_SCHEMA`, `MAX_OUTPUT_DRAFT`, `TIMEOUT_DRAFT_MS`
- After parsing a draft: `isGrounded(transcriptText, parsed.source_lines)` → store as a boolean and show a warning beside a false, never a hard failure

Three things those plans must honour:

- **Call `buildDraftingInput` with primitives.** Read `transcripts.body` and `voice_samples.body` out of the row at the call site; do not add an overload that takes a row, and do not pass the meeting title "for context".
- **Keep the calls sequential.** The prompt cache only pays off because drafts 2 and 3 follow draft 1; `Promise.all` would lose it, along with intermediate status.
- **`store: false` on every request** (03-02's job, stated here because it is the other half of the compliance story this module starts).

No blockers. Open items unchanged: Fireflies remains US-hosted (storing only the executive's own lines is the mitigation), and OpenAI's 30-day abuse-monitoring retention stands unless a ZDR agreement is signed — `store: false` removes application-state retention only.

---
*Phase: 03-drafting*
*Completed: 2026-09-15*
