// Every OpenAI payload in this phase is assembled here, and nowhere else.
//
// This module is the compliance boundary for the Jersey/JFSC constraint: it has
// ZERO imports and every builder takes primitives only, so there is no code path
// that can hand a Fireflies meeting title (which routinely names a counterparty),
// a speaker label, or another participant's words to OpenAI. Adding an import —
// of src/db.ts above all — would reopen that path. Asserted in test/prompts.test.ts.
//
// Pure functions and constants only: no I/O, no logging, no env access.

// --- Models and budgets -----------------------------------------------------
// The one place later phases look up what this pipeline costs and calls.
// Quality lever: if the approval rate sits under 80%, change MODEL_DRAFT to
// "gpt-6-astra" (~$0.40/run instead of ~$0.19/run). Nothing else needs to move.

/** Template extraction: balanced intelligence/cost tier. */
export const MODEL_EXTRACT = "gpt-5.6-terra";
/** Voice-matched drafting: flagship professional tier, where voice fidelity lives. */
export const MODEL_DRAFT = "gpt-5.6-sol";

/** `max_output_tokens` guards — reasoning tokens are billed even when discarded. */
export const MAX_OUTPUT_EXTRACT = 4000;
export const MAX_OUTPUT_DRAFT = 8000;

/** Our own `AbortSignal.timeout` bounds; Cloudflare sets no subrequest limit. */
export const TIMEOUT_EXTRACT_MS = 60_000;
export const TIMEOUT_DRAFT_MS = 120_000;

// Input caps. These exist for the Workers Free-plan 10ms CPU budget, which is
// spent marshalling payloads rather than waiting on the network.
/** Longest pasted outlier post sent for extraction. */
export const MAX_OUTLIER_CHARS = 5000;
/** Longest transcript excerpt sent for drafting, cut on a line boundary. */
export const MAX_TRANSCRIPT_CHARS = 12000;
/** Longest single voice sample sent for drafting. */
export const MAX_SAMPLE_CHARS = 2500;
/** How many voice samples ride along, most recent first. */
export const MAX_SAMPLES = 3;

// --- Types ------------------------------------------------------------------

/** The reusable form extracted from an outlier post. Shape only, never subject matter. */
export type Template = {
  hook: string;
  structure: string[];
  angle: string;
};

/** What a drafting call returns, once parsed. */
export type DraftOutput = {
  post: string;
  source_lines: string[];
};

/** A transcript body cut to the sending cap, with the counts the UI reports. */
export type TranscriptExcerpt = {
  text: string;
  linesUsed: number;
  linesTotal: number;
};

// --- Schemas ----------------------------------------------------------------
// Strict mode rules these obey: the root is an object, every property is listed
// in `required`, `additionalProperties` is false, and keys generate in the order
// they are declared.

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

// `post` is declared before `source_lines` on purpose: strict mode generates in
// key order, so the post is written first and the citations are chosen against it.
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

// --- Instructions -----------------------------------------------------------
// These go in the Responses `instructions` parameter, which takes priority over
// the `input`. Every rule below is load-bearing; do not shorten or paraphrase.

export const EXTRACT_INSTRUCTIONS = `You analyse high-performing LinkedIn posts and describe their reusable FORM.

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
- \`hook\`: the mechanism of the first one or two lines, as an instruction a
  writer could follow on any topic.
- \`structure\`: the ordered beats, 3 to 7 of them, one short instruction each.
- \`angle\`: the stance the writer takes toward the reader - who they position
  themselves as, and what the reader is meant to feel or do.
- If the post is too short or incoherent to have a reusable form, set \`angle\` to
  "unclear" and give your best reading of the rest.`;

export const DRAFT_INSTRUCTIONS = `You are a ghostwriter who writes LinkedIn posts in one specific executive's voice.

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
- Never repeat a sentence or phrase verbatim within the post.

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
- \`post\`: the finished post, 80 to 220 words, line breaks as they should appear.
- \`source_lines\`: 1 to 3 substrings copied verbatim from TRANSCRIPT that the
  post is built on.`;

// --- Builders ---------------------------------------------------------------

/**
 * Cut a transcript body down to MAX_TRANSCRIPT_CHARS on a line boundary, so a
 * sentence is never sent half-finished, and report the counts the run page shows
 * ("using the first N of M lines"). A single line longer than the whole budget
 * has no boundary to cut on, so it is truncated inside.
 */
export function excerptTranscript(body: string): TranscriptExcerpt {
  if (body === "") return { text: "", linesUsed: 0, linesTotal: 0 };

  const lines = body.split("\n");
  if (body.length <= MAX_TRANSCRIPT_CHARS) {
    return { text: body, linesUsed: lines.length, linesTotal: lines.length };
  }

  let used = 0;
  let length = 0;
  for (const line of lines) {
    const next = used === 0 ? line.length : length + 1 + line.length;
    if (next > MAX_TRANSCRIPT_CHARS) break;
    length = next;
    used += 1;
  }

  if (used === 0) {
    return { text: lines[0].slice(0, MAX_TRANSCRIPT_CHARS), linesUsed: 1, linesTotal: lines.length };
  }

  return { text: lines.slice(0, used).join("\n"), linesUsed: used, linesTotal: lines.length };
}

/** The extraction input: one pasted outlier post, capped, in its own block. */
export function buildExtractionInput(outlierBody: string): string {
  return `<outlier_post>\n${outlierBody.slice(0, MAX_OUTLIER_CHARS)}\n</outlier_post>`;
}

/**
 * The drafting input. Primitives only — a string of the executive's own lines, a
 * list of their own published samples, and a template of pure form. It cannot be
 * handed a transcript row, so a meeting title or speaker label cannot reach OpenAI.
 *
 * Block order is fixed and matters twice over: everything before <format> is
 * identical across all three drafts of a run, so it is served from the prompt
 * cache on drafts 2 and 3; and the model follows the most recent structural
 * instruction most reliably, so FORMAT goes last. The <voice_samples> block
 * renders even when empty to keep that cached prefix shape stable.
 *
 * Phase 4 inserts <approved_posts> directly after </voice_samples>, still inside
 * the cacheable prefix.
 */
export function buildDraftingInput(samples: string[], transcriptBody: string, template: Template): string {
  const voiceSamples = samples
    .slice(0, MAX_SAMPLES)
    .map((sample) => sample.slice(0, MAX_SAMPLE_CHARS))
    .join("\n---\n");

  const { text } = excerptTranscript(transcriptBody);

  return [
    `<voice_samples>\n${voiceSamples}\n</voice_samples>`,
    `<transcript>\n${text}\n</transcript>`,
    `<format>\n${JSON.stringify(template)}\n</format>`,
  ].join("\n\n");
}

/**
 * SUPERSEDED by `checkGrounding` below, and left here only because `src/runs.tsx`
 * still calls it; 03-07 rewires the call site and deletes this. Do not wire it
 * into anything new — production run 1 proved it wrong in both directions.
 *
 * The mechanical half of DRAFT-03: is every line the model claimed to build on
 * actually in the material it was given? Pass the same text that was sent (the
 * excerpt), or the full body, which is a superset and so only ever more lenient.
 * A draft citing nothing is not grounded. A miss is a warning next to the draft,
 * not a failure: strict schemas constrain shape, not verbatim accuracy.
 */
export function isGrounded(transcriptBody: string, sourceLines: string[]): boolean {
  if (sourceLines.length === 0) return false;
  return sourceLines.every((line) => line.trim() !== "" && transcriptBody.includes(line));
}

// --- Grounding --------------------------------------------------------------
// The mechanical half of DRAFT-03, rewritten after production run 1 proved the
// citation-only check wrong in BOTH directions on a single batch of three drafts:
// draft 1 was flagged ungrounded while quoting the transcript genuinely (the model
// had trimmed a leading connective and recapitalised), and draft 2 passed while
// printing an invented slogan twice. A warning that fires on correct output and
// stays silent on fabricated output trains the executive to ignore the one signal
// guarding DRAFT-03, which is worse than having no signal at all.
//
// Everything here stays pure and import-free, like the rest of this module.

/**
 * Tuning levers, in one place per the 03-01 rule. A moved value carries a
 * one-line comment saying what moved it.
 */
/** Sentences with fewer tokens than this are connective tissue, not claims. */
export const GROUNDING_MIN_CLAIM_TOKENS = 6;
/** Token run compared against the source pool when an exact match fails. */
export const GROUNDING_SHINGLE_TOKENS = 4;
/** Fraction of a sentence's shingles that must appear in the pool to count as supported. */
export const GROUNDING_SUPPORT_RATIO = 0.5;
/**
 * Token run used to detect a phrase the post repeats. It is a TOKEN count, not a
 * sentence count, on purpose: the real production failure was "Collect the
 * prompts. / Build authority. / Become visible." - three sentences of 3, 2 and 2
 * tokens, every one of them below any sensible claim threshold. Only an n-gram
 * stream that crosses sentence boundaries catches the repeated 7-token run.
 */
export const GROUNDING_REPEAT_TOKENS = 6;

/**
 * Openers a model trims off a quote while "tidying" it, longest match first.
 * Speech stacks them ("so and...", "well, okay,..."), so stripping runs twice.
 */
export const LEADING_CONNECTIVES = [
  "and that",
  "you know",
  "i mean",
  "meaning",
  "right",
  "okay",
  "well",
  "like",
  "now",
  "and",
  "but",
  "so",
] as const;

/** How many stacked connectives are stripped from the front of a quote. */
const CONNECTIVE_PASSES = 2;

const CONNECTIVE_PREFIX = new RegExp(
  `^(?:${[...LEADING_CONNECTIVES].sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}\\p{N}])[^\\p{L}\\p{N}]*`,
  "u",
);

/** Anything that is not a letter or a digit, at either end of the string. */
const OUTER_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Splits on runs of non-word characters; keeps accented letters intact. */
const NON_WORD = /[^\p{L}\p{N}]+/u;

/** What `checkGrounding` found, including what it did not look at. */
export type GroundingReport = {
  /** Every reported citation resolves against the source pool, normalised. */
  citationsResolved: boolean;
  /** Claim-bearing sentences the pool supports. */
  supported: number;
  /** Claim-bearing sentences examined. `supported` is always <= this. */
  checked: number;
  /** Sentences with no material support, verbatim as the post wrote them. */
  unsupported: string[];
  /** Normalised phrases the post repeats that appear nowhere in the pool. */
  repeated: string[];
  /**
   * Sentences too short to carry a claim. Reported, never hidden: a short
   * invented sentence that is never repeated lands here, not in `unsupported`.
   */
  skipped: number;
  /** `citationsResolved && unsupported.length === 0 && repeated.length === 0`. */
  grounded: boolean;
};

/**
 * The single normal form both sides of every comparison are put into.
 *
 * Order matters: outer punctuation comes off before the connective strip, so a
 * quote wrapped in quotation marks still has its "And that" found; and again
 * afterwards, so the comma in "Right, ..." does not survive the strip.
 */
export function normaliseForMatch(text: string): string {
  let out = text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(OUTER_PUNCTUATION, "");

  for (let pass = 0; pass < CONNECTIVE_PASSES; pass += 1) {
    const stripped = out.replace(CONNECTIVE_PREFIX, "");
    if (stripped === out) break;
    out = stripped;
  }

  return out.replace(OUTER_PUNCTUATION, "");
}

/**
 * Break a post into sentences, keeping each piece's RAW text: `unsupported` has
 * to be quotable back to the reviewer exactly as the post wrote it, so they can
 * find it on the page. Line breaks split first, because a LinkedIn post uses them
 * as punctuation. A terminator only ends a sentence when whitespace or the end of
 * the line follows it, so "60.5%" and "$1.5m" stay in one piece.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];

  for (const line of text.split("\n")) {
    let start = 0;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char !== "." && char !== "!" && char !== "?") continue;

      // Consume a run of terminators so "..." and "?!" end one sentence, not three.
      let end = i;
      while (end + 1 < line.length && (line[end + 1] === "." || line[end + 1] === "!" || line[end + 1] === "?")) {
        end += 1;
      }

      const after: string | undefined = line[end + 1];
      if (after !== undefined && !/\s/.test(after)) {
        i = end;
        continue;
      }

      const piece = line.slice(start, end + 1).trim();
      if (piece !== "") out.push(piece);
      start = end + 1;
      i = end;
    }

    const tail = line.slice(start).trim();
    if (tail !== "") out.push(tail);
  }

  return out;
}

/** Tokens of an ALREADY normalised string. Callers normalise once and reuse. */
function tokenise(normalised: string): string[] {
  if (normalised === "") return [];
  return normalised.split(NON_WORD).filter((token) => token !== "");
}

/** Contiguous token runs of the given length, joined by single spaces. */
function shingles(tokens: string[], size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= tokens.length; i += 1) out.push(tokens.slice(i, i + size).join(" "));
  return out;
}

/**
 * Is one piece of text carried by the source pool? Exact (normalised) containment
 * first, which is what flips the two false warnings from run 1; otherwise enough
 * shingle overlap that the sentence is a rearrangement of the executive's own
 * words rather than new material.
 *
 * The empty-string guard is load-bearing: `pool.includes("")` is always true, so
 * without it a blank citation would score as grounded.
 */
function supportedBy(text: string, poolNormalised: string, poolShingles: Set<string>): boolean {
  const normalised = normaliseForMatch(text);
  if (normalised === "" || poolNormalised === "") return false;
  if (poolNormalised.includes(normalised)) return true;

  const tokens = tokenise(normalised);
  if (tokens.length < GROUNDING_SHINGLE_TOKENS) return false;

  const own = shingles(tokens, GROUNDING_SHINGLE_TOKENS);
  let hits = 0;
  for (const shingle of own) if (poolShingles.has(shingle)) hits += 1;

  return hits / own.length >= GROUNDING_SUPPORT_RATIO;
}

/**
 * Phrases the post says twice that the sources never say at all. Overlapping
 * n-grams are merged into the longest contiguous run, so the reviewer is shown
 * one phrase rather than a sliding window of near-duplicates.
 */
function findRepeatedPhrases(postTokens: string[], poolRepeats: Set<string>): string[] {
  const grams = shingles(postTokens, GROUNDING_REPEAT_TOKENS);
  if (grams.length === 0) return [];

  const counts = new Map<string, number>();
  for (const gram of grams) counts.set(gram, (counts.get(gram) ?? 0) + 1);

  const merged: Array<[number, number]> = [];
  for (let i = 0; i < grams.length; i += 1) {
    const gram = grams[i];
    if ((counts.get(gram) ?? 0) < 2) continue;
    if (poolRepeats.has(gram)) continue;

    const end = i + GROUNDING_REPEAT_TOKENS - 1;
    const last = merged[merged.length - 1];
    if (last !== undefined && i <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([i, end]);
  }

  const phrases: string[] = [];
  for (const [start, end] of merged) {
    const phrase = postTokens.slice(start, end + 1).join(" ");
    if (!phrases.includes(phrase)) phrases.push(phrase);
  }

  return phrases;
}

/**
 * Whole-post grounding: does everything this draft asserts come from the
 * executive's own material?
 *
 * `sources` is the executive's own material and nothing else:
 * `[transcriptBody, ...voiceSampleBodies]`. Outlier bodies must NEVER be passed
 * in. The FORMAT block carries shape only, so an outlier's phrasing turning up in
 * a draft is a defect to be caught, not grounding to be credited.
 *
 * Costs one normalisation of the pool and one pass over the post, which stays
 * inside the Workers Free-plan 10ms CPU budget for a ~220-word post against an
 * ~18,000-character pool.
 *
 * What this CANNOT prove, and must not be read as proving: a short invented
 * sentence that is never repeated is counted in `skipped`, not caught. The report
 * says how much it did not look at for exactly that reason.
 */
export function checkGrounding(post: string, sourceLines: string[], sources: string[]): GroundingReport {
  const poolNormalised = normaliseForMatch(sources.join("\n"));
  const poolTokens = tokenise(poolNormalised);
  const poolShingles = new Set(shingles(poolTokens, GROUNDING_SHINGLE_TOKENS));
  const poolRepeats = new Set(shingles(poolTokens, GROUNDING_REPEAT_TOKENS));

  const citationsResolved =
    sourceLines.length > 0 && sourceLines.every((line) => supportedBy(line, poolNormalised, poolShingles));

  let supported = 0;
  let checked = 0;
  let skipped = 0;
  const unsupported: string[] = [];

  for (const sentence of splitSentences(post)) {
    if (tokenise(normaliseForMatch(sentence)).length < GROUNDING_MIN_CLAIM_TOKENS) {
      skipped += 1;
      continue;
    }

    checked += 1;
    if (supportedBy(sentence, poolNormalised, poolShingles)) supported += 1;
    else unsupported.push(sentence);
  }

  const repeated = findRepeatedPhrases(tokenise(normaliseForMatch(post)), poolRepeats);

  return {
    citationsResolved,
    supported,
    checked,
    unsupported,
    repeated,
    skipped,
    grounded: citationsResolved && unsupported.length === 0 && repeated.length === 0,
  };
}
