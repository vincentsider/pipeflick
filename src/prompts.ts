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
