# Drafts need a live context source, or they stay common sense

**Created:** 2026-09-15 (Phase 3 verification, first real run)
**Priority:** High — caps the value of every draft, and blocks the 80% approval target
**Status:** Recorded only. User decided 2026-09-15 not to insert this as a phase yet.
**Where:** `src/prompts.ts` (DRAFT_INSTRUCTIONS, buildDraftingInput), a new retrieval module,
migration for stored context

## What

Judged on the first real run: the drafts read as things the audience already knows. Not a
prompt-tuning problem — a structural one.

The only substance source is one meeting transcript, and DRAFT_INSTRUCTIONS explicitly forbids
going beyond it ("Invent nothing. Add no statistics, no research, no industry commentary that
is not already there"). So the ceiling on insight is whatever was said out loud in a single
meeting — and a meeting where the executive explains a topic to someone is inherently
foundational. The system faithfully reproduced a 101-level explainer because that is all it had.

## The user's proposal

Add a third input alongside voice and format: what is happening right now in the topic.
The post becomes the executive's angle on a live development rather than a general explainer.
Retrieval via Tavily or SerpAPI (API keys already held for both), plus optionally trending
posts in the topic.

## What it forces

- **Two sanctioned sources instead of one.** The grounding rule becomes "opinions and voice
  from the transcript, facts from the retrieved articles, nothing from thin air", and the
  grounding check must cover the whole post against both. See
  [[normalise-grounding-match]] — that check already fails in both directions on one source.
- **Pairs with topic steering.** Retrieval needs a topic to retrieve *for*. See
  [[steer-draft-topics]]; these two are one feature in practice.
- **Compliance stays simple on the news half.** Public articles carry no client identifiers,
  so the Jersey/JFSC constraint is unaffected by sending a topic string and reading results.

## Conflict to resolve first

CLAUDE.md scopes market data to "owned exports, Apify, or curated libraries. No platform
scraping." Searching LinkedIn for trending posts is platform scraping. The news/web half via
Tavily or SerpAPI is clean and can be built as-is; the LinkedIn half needs either an Apify
route or a deliberate decision by the user to relax that rule.

## Context

Raised by the user after reading the three drafts from run 1. Offered as "Phase 3.1: Context
Layer" ahead of the approval gate; the user chose to proceed with the existing plan first.
Worth revisiting before Phase 4 is measured, since an 80% approval rate measured on 101-level
posts would not mean anything.
