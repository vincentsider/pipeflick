# Give the user topic control, and stop the three drafts colliding

**Created:** 2026-09-15 (Phase 3 verification, first real run)
**Priority:** High — the executive cannot say what they want to say this week
**Where:** `src/runs.tsx` (new-run form, `POST /runs`, drafting branch),
`src/prompts.ts` `buildDraftingInput` (line 224), migration 0004

## What

Two halves of the same gap, found together on the first real run.

**a) There is no topic input anywhere.** The whole system takes exactly two inputs: a
transcript dropdown and one outliers textarea. `buildDraftingInput(samples, transcriptBody,
template)` has no topic parameter. The model alone decides what each post is about, from
whatever is most salient in the transcript.

**b) The three drafting calls run blind to each other.** Each gets the same transcript and
the same voice samples; only the format differs, and the format is explicitly shape-only.
Nothing tells call 2 what call 1 already used.

Result on run 1: drafts 1 and 2 both landed on AI visibility, draft 3 on agentic web. All
three quoted "it's the agent behind the website that matters" — the most quotable line in
the meeting.

## Why it matters

A week of content means saying several things, not the same thing three ways. And the whole
premise is that the executive has a point of view they want out — "AI visibility this week,
agentic next" is the normal way a person works. Right now they can only re-roll and hope.

Topic overlap was flagged as a known risk in the 03-04 plan before the run; the run confirmed
it on the first attempt, which promotes it from risk to defect.

## Fix

- Add an optional topic/angle field to the new-run form, store it on the run row (migration
  0004), and thread it into `buildDraftingInput` as a fourth primitive. Keep the
  primitives-only signature — that is the Jersey/JFSC guarantee asserted by test.
- The three calls are already sequential (for prompt caching), so pass earlier drafts'
  `source_lines` into later calls as "already used, choose different material".
- Consider per-draft topics (three fields) rather than one run-level topic, so one run can
  produce three deliberately different posts.

## Context

Both were user-visible on the very first production run. Recorded rather than fixed so the
Phase 3 verification report and the verified code stay in step.
