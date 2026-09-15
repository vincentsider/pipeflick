# Normalise the grounding match so tidied quotes still count

**Created:** 2026-09-15 (Phase 3 verification, first real run)
**Priority:** High — the check gets it wrong in BOTH directions on real output
**Where:** `src/prompts.ts` `isGrounded` (line 246)

## What

`isGrounded` requires each reported `source_line` to be an exact substring of the transcript
body (`transcriptBody.includes(line)`). On the first production run, draft 1 was flagged
ungrounded because the model trimmed a leading filler word and capitalised the next letter:

| Model reported | Transcript actually says |
|---|---|
| "In the short terms you have to choose your battle, right?" | "Meaning in the short terms you have to choose your battle, right?" |
| "The two combined make your website authoritative and visible." | "And that the two combined make your website authoritative and visible." |

Both quotes are genuinely the executive's words. Drafts 2 and 3 copied cleanly and passed.

## Why it matters

The check cannot distinguish "tidied" from "fabricated", so it warns on both. A warning that
fires on correct drafts trains the user to ignore it — and ignoring it is exactly what must
not happen, because this check is the DRAFT-03 guard against invented material.

## Fix

Match on a normalised form of both sides: collapse whitespace, lowercase, strip a leading
connective ("meaning", "and", "and that", "so", "right,"), strip trailing punctuation. Keep
the raw check as the fast path. Pure function, fully unit-testable, no schema change.

## Context

Found on the first paid run of Phase 3 (run 1, draft 1). Recorded rather than fixed so the
Phase 3 verification report and the verified code stay in step.


## Update, same run: the check also passes invented content

Draft 2 contains the line "Collect the prompts. Build authority. Become visible." **twice**.
That phrase appears **zero times** in the transcript — the model composed the triad itself and
then repeated it. Draft 2 is stored `grounded = 1`.

`isGrounded` only validates the 1-3 `source_lines` the model chooses to report. It never looks
at the rest of the post. A model can therefore cite three genuine lines and write anything it
likes around them, and the check will pass it.

So on the first production run the check was wrong twice, in opposite directions:

- Draft 1: flagged ungrounded, but its quotes were real (only trimmed and recapitalised)
- Draft 2: passed, while carrying an invented line printed twice

**The real fix is therefore larger than normalisation.** Normalising the substring match
removes the false positive, but the false negative needs the check to cover the whole post,
not just the citations. Options: sentence-level attribution of every claim-bearing sentence
back to transcript or voice samples; a cheap second model pass scoring the post against its
sources; or at minimum a verbatim-repetition detector, which would have caught draft 2 on its
own.


---

## CLOSED — 2026-09-15, by 03-05 (check) and 03-07 (wiring)

Both directions are fixed, and the fix was the larger one this note called for: the check reads
the **whole post**, not just the citations.

- `checkGrounding(post, sourceLines, sources)` in `src/prompts.ts` — normalised citation
  resolution, per-sentence attribution by 4-token shingle overlap, and a 6-token n-gram repeat
  detector. Calibrated against run 1: draft 1's three citations now resolve, and draft 2's
  invented slogan is the only phrase flagged across the batch.
- `isGrounded` is **deleted**, so the citation-only surface cannot be checked again.
- The report is stored in `drafts.grounding_json` and rendered beside each draft — the named
  untraceable lines, any repeated phrase, `supported / checked`, and what was skipped. The
  boolean is never the UI.
- Live on production as version `f17cf55d-e6e8-4b04-bbaf-600fba5e7c93`.

**What this did not do:** it fixed the instrument, not the output. The check matches words, not
meaning, and a short invented sentence said once still lands in `skipped`. Draft quality is
unchanged — see `steer-draft-topics.md` and `context-layer-for-drafts.md`, both still open.
