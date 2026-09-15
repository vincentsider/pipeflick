import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DRAFT_INSTRUCTIONS,
  DRAFT_SCHEMA,
  EXTRACT_INSTRUCTIONS,
  GROUNDING_MIN_CLAIM_TOKENS,
  GROUNDING_REPEAT_TOKENS,
  GROUNDING_SHINGLE_TOKENS,
  GROUNDING_SUPPORT_RATIO,
  LEADING_CONNECTIVES,
  MAX_APPROVED_CHARS,
  MAX_APPROVED_POSTS,
  MAX_OUTLIER_CHARS,
  MAX_OUTPUT_DRAFT,
  MAX_OUTPUT_EXTRACT,
  MAX_SAMPLES,
  MAX_SAMPLE_CHARS,
  MAX_TRANSCRIPT_CHARS,
  MODEL_DRAFT,
  MODEL_EXTRACT,
  TEMPLATE_SCHEMA,
  TIMEOUT_DRAFT_MS,
  TIMEOUT_EXTRACT_MS,
  buildDraftingInput,
  buildExtractionInput,
  checkGrounding,
  excerptTranscript,
  normaliseForMatch,
  splitSentences,
  type Template,
} from "../src/prompts";

const template: Template = {
  hook: "Open with a one-line admission of a past mistake.",
  structure: ["Name the mistake.", "Say what it cost.", "Give the rule you now follow."],
  angle: "A practitioner talking to peers, inviting them to avoid the same cost.",
};

/**
 * The compliance fixture. This meeting was titled "Call with Acme Ltd" in
 * Fireflies and the executive's speaker label is "Vincent Sider". Neither may
 * ever reach OpenAI, so neither is reachable from buildDraftingInput's
 * primitives-only signature.
 */
const transcriptBody = [
  "Fund administration margin is the whole story.",
  "Jersey quietly became the default domicile.",
  "Nobody builds distribution before the product works.",
].join("\n");

describe("constants", () => {
  it("pins the model ids, output caps and timeouts in one place", () => {
    expect(MODEL_EXTRACT).toBe("gpt-5.6-terra");
    expect(MODEL_DRAFT).toBe("gpt-5.6-sol");
    expect(MAX_OUTPUT_EXTRACT).toBe(4000);
    expect(MAX_OUTPUT_DRAFT).toBe(8000);
    expect(TIMEOUT_EXTRACT_MS).toBe(60_000);
    expect(TIMEOUT_DRAFT_MS).toBe(120_000);
  });

  it("pins the input caps that keep the Free-plan CPU budget", () => {
    expect(MAX_OUTLIER_CHARS).toBe(5000);
    expect(MAX_TRANSCRIPT_CHARS).toBe(12000);
    expect(MAX_SAMPLE_CHARS).toBe(2500);
    expect(MAX_SAMPLES).toBe(3);
    expect(MAX_APPROVED_CHARS).toBe(2500);
    expect(MAX_APPROVED_POSTS).toBe(3);
  });
});

describe("excerptTranscript", () => {
  it("passes a short body through untouched", () => {
    const result = excerptTranscript(transcriptBody);
    expect(result.text).toBe(transcriptBody);
    expect(result.linesUsed).toBe(3);
    expect(result.linesTotal).toBe(3);
  });

  it("returns zeros for an empty body", () => {
    expect(excerptTranscript("")).toEqual({ text: "", linesUsed: 0, linesTotal: 0 });
  });

  it("cuts on a line boundary and reports how many lines were used", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ${"y".repeat(90)}`);
    const body = lines.join("\n");
    expect(body.length).toBeGreaterThan(MAX_TRANSCRIPT_CHARS);

    const result = excerptTranscript(body);

    expect(result.linesTotal).toBe(200);
    expect(result.linesUsed).toBeGreaterThan(0);
    expect(result.linesUsed).toBeLessThan(200);
    expect(result.text.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    // Whole lines only: the excerpt is exactly the first N lines, never a partial one.
    expect(result.text).toBe(lines.slice(0, result.linesUsed).join("\n"));
    expect(result.text.split("\n").every((line) => lines.includes(line))).toBe(true);
    // And one more line would have blown the cap.
    expect(lines.slice(0, result.linesUsed + 1).join("\n").length).toBeGreaterThan(MAX_TRANSCRIPT_CHARS);
  });

  it("hard-truncates a single line longer than the cap", () => {
    const body = "z".repeat(MAX_TRANSCRIPT_CHARS + 8000);
    const result = excerptTranscript(body);

    expect(result.text).toBe("z".repeat(MAX_TRANSCRIPT_CHARS));
    expect(result.linesUsed).toBe(1);
    expect(result.linesTotal).toBe(1);
  });
});

describe("buildExtractionInput", () => {
  it("wraps the outlier in its own block", () => {
    expect(buildExtractionInput("Nobody reads past line one.")).toBe(
      "<outlier_post>\nNobody reads past line one.\n</outlier_post>",
    );
  });

  it("slices an over-long outlier to the cap", () => {
    const input = buildExtractionInput("p".repeat(MAX_OUTLIER_CHARS + 2000));
    expect(input).toBe(`<outlier_post>\n${"p".repeat(MAX_OUTLIER_CHARS)}\n</outlier_post>`);
  });
});

describe("buildDraftingInput", () => {
  const samples = ["First published sample.", "Second published sample.", "Third published sample."];
  const approvedPosts = ["First approved post.", "Second approved post."];

  it("orders the blocks so the cacheable prefix comes before the varying format", () => {
    const input = buildDraftingInput(samples, approvedPosts, transcriptBody, template);

    const voice = input.indexOf("<voice_samples>");
    const approved = input.indexOf("<approved_posts>");
    const transcript = input.indexOf("<transcript>");
    const format = input.indexOf("<format>");

    expect(voice).toBeGreaterThanOrEqual(0);
    expect(voice).toBeLessThan(approved);
    expect(approved).toBeLessThan(transcript);
    expect(transcript).toBeLessThan(format);
    expect(input.indexOf("</voice_samples>")).toBeLessThan(approved);
    expect(input.indexOf("</approved_posts>")).toBeLessThan(transcript);
    expect(input.indexOf("</transcript>")).toBeLessThan(format);
    expect(input.trimEnd().endsWith("</format>")).toBe(true);
  });

  it("carries the samples, the approved posts, the transcript and the template", () => {
    const input = buildDraftingInput(samples, approvedPosts, transcriptBody, template);

    for (const sample of samples) expect(input).toContain(sample);
    for (const post of approvedPosts) expect(input).toContain(post);
    expect(input).toContain(transcriptBody);
    expect(input).toContain(JSON.stringify(template));
    expect(input).toContain("\n---\n");
  });

  it("keeps each of the two string lists in its own block", () => {
    // `samples` and `approvedPosts` are adjacent string[] parameters, so the type
    // checker cannot tell them apart. This test is the only thing standing
    // between a future refactor and a silent swap of the two.
    const input = buildDraftingInput(["SAMPLE-MARKER"], ["APPROVED-MARKER"], transcriptBody, template);

    const voiceBlock = input.slice(input.indexOf("<voice_samples>"), input.indexOf("</voice_samples>"));
    const approvedBlock = input.slice(input.indexOf("<approved_posts>"), input.indexOf("</approved_posts>"));

    expect(voiceBlock).toContain("SAMPLE-MARKER");
    expect(voiceBlock).not.toContain("APPROVED-MARKER");
    expect(approvedBlock).toContain("APPROVED-MARKER");
    expect(approvedBlock).not.toContain("SAMPLE-MARKER");
  });

  it("keeps at most MAX_SAMPLES samples, each sliced to MAX_SAMPLE_CHARS", () => {
    const many = ["a".repeat(MAX_SAMPLE_CHARS + 500), "b", "c", "d-dropped", "e-dropped"];
    const input = buildDraftingInput(many, [], transcriptBody, template);

    expect(input).not.toContain("d-dropped");
    expect(input).not.toContain("e-dropped");
    expect(input).toContain("a".repeat(MAX_SAMPLE_CHARS));
    expect(input).not.toContain("a".repeat(MAX_SAMPLE_CHARS + 1));

    const block = input.slice(input.indexOf("<voice_samples>"), input.indexOf("</voice_samples>"));
    expect(block.split("\n---\n")).toHaveLength(MAX_SAMPLES);
  });

  it("keeps at most MAX_APPROVED_POSTS posts, each sliced to MAX_APPROVED_CHARS", () => {
    const many = ["q".repeat(MAX_APPROVED_CHARS + 500), "r", "s", "t-dropped", "u-dropped"];
    const input = buildDraftingInput([], many, transcriptBody, template);

    expect(input).not.toContain("t-dropped");
    expect(input).not.toContain("u-dropped");
    expect(input).toContain("q".repeat(MAX_APPROVED_CHARS));
    expect(input).not.toContain("q".repeat(MAX_APPROVED_CHARS + 1));

    const block = input.slice(input.indexOf("<approved_posts>"), input.indexOf("</approved_posts>"));
    expect(block.split("\n---\n")).toHaveLength(MAX_APPROVED_POSTS);
  });

  it("still renders an empty voice_samples block when there are no samples", () => {
    const input = buildDraftingInput([], approvedPosts, transcriptBody, template);

    expect(input).toContain("<voice_samples>");
    expect(input).toContain("</voice_samples>");
    expect(input.indexOf("<voice_samples>")).toBeLessThan(input.indexOf("<transcript>"));
    expect(input.slice(input.indexOf("<voice_samples>"), input.indexOf("</voice_samples>")).trim()).toBe(
      "<voice_samples>",
    );
  });

  it("still renders an empty approved_posts block, in position, on the first run", () => {
    // Nothing has been approved yet, and the block shape must not change when
    // something is: drafts 2 and 3 of a run are cache-eligible only while the
    // prefix is byte-stable.
    const input = buildDraftingInput(samples, [], transcriptBody, template);

    expect(input).toContain("<approved_posts>");
    expect(input).toContain("</approved_posts>");
    expect(input.indexOf("</voice_samples>")).toBeLessThan(input.indexOf("<approved_posts>"));
    expect(input.indexOf("</approved_posts>")).toBeLessThan(input.indexOf("<transcript>"));
    expect(input.slice(input.indexOf("<approved_posts>"), input.indexOf("</approved_posts>")).trim()).toBe(
      "<approved_posts>",
    );
  });

  it("excerpts an over-long transcript rather than sending all of it", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ${"y".repeat(90)}`);
    const body = lines.join("\n");
    const input = buildDraftingInput([], [], body, template);

    expect(input).toContain(excerptTranscript(body).text);
    expect(input).not.toContain(lines[199]);
  });
});

describe("compliance: primitives only", () => {
  it("cannot carry a meeting title or a speaker label into the payload", () => {
    // What a TranscriptRow would have brought with it, had the signature allowed one.
    const title = "Call with Acme Ltd";
    const speaker = "Vincent Sider";

    const input = buildDraftingInput(
      ["Second published sample."],
      ["An approved post."],
      transcriptBody,
      template,
    );

    expect(input).not.toContain(title);
    expect(input).not.toContain("Acme");
    expect(input).not.toContain(speaker);
    expect(input).toContain(transcriptBody);
  });

  it("has no imports at all, so nothing carrying a title is reachable from it", () => {
    const source = readFileSync(new URL("../src/prompts.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

describe("schemas", () => {
  for (const [name, schema] of [
    ["TEMPLATE_SCHEMA", TEMPLATE_SCHEMA],
    ["DRAFT_SCHEMA", DRAFT_SCHEMA],
  ] as const) {
    it(`${name} satisfies OpenAI strict-mode structural rules`, () => {
      const s = schema as unknown as {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
      };

      expect(s.type).toBe("object");
      expect(s.additionalProperties).toBe(false);
      // "All fields must be required" — required lists every key of properties.
      expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
    });
  }

  it("TEMPLATE_SCHEMA describes hook, structure and angle", () => {
    expect(Object.keys(TEMPLATE_SCHEMA.properties)).toEqual(["hook", "structure", "angle"]);
    expect(TEMPLATE_SCHEMA.properties.structure.type).toBe("array");
    expect(TEMPLATE_SCHEMA.properties.structure.items.type).toBe("string");
  });

  it("DRAFT_SCHEMA generates the post before its citations", () => {
    expect(Object.keys(DRAFT_SCHEMA.properties)).toEqual(["post", "source_lines"]);
    expect(DRAFT_SCHEMA.properties.source_lines.type).toBe("array");
  });
});

describe("instructions", () => {
  it("keeps the extraction rules that stop the outlier's subject matter leaking", () => {
    expect(EXTRACT_INSTRUCTIONS).toContain("Never describe what it is about.");
    expect(EXTRACT_INSTRUCTIONS).toContain("Never quote, paraphrase or reuse any specific fact");
  });

  it("keeps the grounding, voice and banned-word rules", () => {
    expect(DRAFT_INSTRUCTIONS).toContain("Invent nothing.");
    expect(DRAFT_INSTRUCTIONS).toContain("Do not name clients, counterparties, firms or individuals.");
    expect(DRAFT_INSTRUCTIONS).toContain("Never mention that a transcript, meeting, recording, notes or AI were involved.");
    for (const banned of ["delve", "leverage", "unlock", "game-changer", "landscape"]) {
      expect(DRAFT_INSTRUCTIONS).toContain(banned);
    }
    expect(DRAFT_INSTRUCTIONS).toContain("Do not use em dashes.");
    // 03-05: the cheap half of the repetition fix. The check detects; the prompt prevents.
    expect(DRAFT_INSTRUCTIONS).toContain("Never repeat a sentence or phrase verbatim within the post.");
  });

  it("tells the model what APPROVED POSTS are, and what may not be taken from them", () => {
    // 04-03: the block is voice input, never a source of facts. Without the
    // grounding rule below, one fabrication that got approved could launder
    // itself into every later draft.
    expect(DRAFT_INSTRUCTIONS).toContain(
      "APPROVED POSTS - posts this system drafted that the executive approved",
    );
    expect(DRAFT_INSTRUCTIONS).toContain("APPROVED POSTS are not a source of facts.");
    expect(DRAFT_INSTRUCTIONS).toContain(
      "Do not reuse an APPROVED POST's topic, opening line, example or phrasing.",
    );
    // The blocks are listed in the order buildDraftingInput renders them.
    expect(DRAFT_INSTRUCTIONS.indexOf("1. VOICE SAMPLES")).toBeLessThan(
      DRAFT_INSTRUCTIONS.indexOf("2. APPROVED POSTS"),
    );
    expect(DRAFT_INSTRUCTIONS.indexOf("2. APPROVED POSTS")).toBeLessThan(
      DRAFT_INSTRUCTIONS.indexOf("3. TRANSCRIPT"),
    );
    expect(DRAFT_INSTRUCTIONS.indexOf("3. TRANSCRIPT")).toBeLessThan(DRAFT_INSTRUCTIONS.indexOf("4. FORMAT"));
  });
});

// --- Whole-post grounding (03-05) -------------------------------------------
// The two production failures below are verbatim from run 1 and are already
// recorded in .planning/todos/pending/normalise-grounding-match.md.

/** Stands in for [transcriptBody, ...voiceSampleBodies] — the executive's own material only. */
const groundingTranscript = [
  "Meaning in the short terms you have to choose your battle, right?",
  "And that the two combined make your website authoritative and visible.",
  "We spent about six months getting the fund administration margin right.",
  "Nobody builds distribution before the product actually works, in my experience.",
].join("\n");

const groundingSample = "We only ever write about what we have actually shipped for a client.";

const sources = [groundingTranscript, groundingSample];

describe("grounding constants", () => {
  it("pins the thresholds so the tuning levers stay in one place", () => {
    expect(GROUNDING_MIN_CLAIM_TOKENS).toBe(6);
    expect(GROUNDING_SHINGLE_TOKENS).toBe(4);
    expect(GROUNDING_SUPPORT_RATIO).toBe(0.5);
    expect(GROUNDING_REPEAT_TOKENS).toBe(6);
  });

  it("lists the leading connectives a model trims off a quote", () => {
    for (const connective of ["meaning", "and that", "and", "so", "but", "right"]) {
      expect(LEADING_CONNECTIVES).toContain(connective);
    }
  });
});

describe("normaliseForMatch", () => {
  it("lowercases, collapses whitespace and trims", () => {
    expect(normaliseForMatch("  The   Two\ncombined  ")).toBe("the two combined");
  });

  it("normalises curly quotes and dashes to ASCII", () => {
    expect(normaliseForMatch("“It’s fine — really.”")).toBe("it's fine - really");
    expect(normaliseForMatch("half–yearly")).toBe("half-yearly");
  });

  it("strips a leading connective, longest match first", () => {
    expect(normaliseForMatch("And that the two combined make your website visible.")).toBe(
      "the two combined make your website visible",
    );
    expect(normaliseForMatch("Meaning in the short terms you have to choose your battle, right?")).toBe(
      "in the short terms you have to choose your battle, right",
    );
  });

  it("strips a second leading connective, because speech stacks them", () => {
    expect(normaliseForMatch("So and we shipped it.")).toBe("we shipped it");
    expect(normaliseForMatch("Well, okay, we shipped it.")).toBe("we shipped it");
  });

  it("only strips at the very start, never mid-sentence", () => {
    expect(normaliseForMatch("We shipped and that was it.")).toBe("we shipped and that was it");
  });

  it("strips leading and trailing punctuation", () => {
    expect(normaliseForMatch("...we shipped it!!")).toBe("we shipped it");
  });

  it("returns an empty string for whitespace or punctuation only", () => {
    expect(normaliseForMatch("   ")).toBe("");
    expect(normaliseForMatch(" -- ")).toBe("");
  });
});

describe("splitSentences", () => {
  it("splits on line breaks and terminators, keeping the raw text", () => {
    expect(splitSentences("One thing.\nTwo things! Three?")).toEqual([
      "One thing.",
      "Two things!",
      "Three?",
    ]);
  });

  it("drops empty pieces and blank lines", () => {
    expect(splitSentences("\n\n  One thing.  \n\n")).toEqual(["One thing."]);
  });

  it("keeps a trailing fragment that has no terminator", () => {
    expect(splitSentences("One thing. And then this")).toEqual(["One thing.", "And then this"]);
  });

  it("does not split a decimal or a percentage mid-number", () => {
    expect(splitSentences("Margins sat at 60.5% last year. Then they moved.")).toEqual([
      "Margins sat at 60.5% last year.",
      "Then they moved.",
    ]);
  });
});

describe("checkGrounding", () => {
  it("resolves a citation the model tidied (production run 1, draft 1 false warning)", () => {
    // Reported: "In the short terms..." / Transcript: "Meaning in the short terms..."
    // Reported: "The two combined..."   / Transcript: "And that the two combined..."
    const report = checkGrounding(
      "In the short terms you have to choose your battle, right?",
      [
        "In the short terms you have to choose your battle, right?",
        "The two combined make your website authoritative and visible.",
      ],
      sources,
    );

    expect(report.citationsResolved).toBe(true);
    expect(report.unsupported).toEqual([]);
    expect(report.grounded).toBe(true);
  });

  it("catches an invented phrase the post repeats (production run 1, draft 2 false pass)", () => {
    // Every citation is genuine, every long sentence is genuine, and the post is
    // still fabricated: "Collect the prompts. Build authority. Become visible."
    // is nowhere in the sources and is printed twice.
    const post = [
      "We spent about six months getting the fund administration margin right.",
      "",
      "Collect the prompts. Build authority. Become visible.",
      "",
      "Nobody builds distribution before the product actually works, in my experience.",
      "",
      "Collect the prompts. Build authority. Become visible.",
    ].join("\n");

    const report = checkGrounding(
      post,
      ["We spent about six months getting the fund administration margin right."],
      sources,
    );

    expect(report.citationsResolved).toBe(true);
    expect(report.unsupported).toEqual([]);
    expect(report.repeated).toContain("collect the prompts build authority become visible");
    expect(report.repeated).toHaveLength(1);
    expect(report.grounded).toBe(false);
  });

  it("supports a sentence rephrased from the executive's own words", () => {
    const report = checkGrounding(
      "In my experience nobody builds distribution before the product actually works.",
      ["Nobody builds distribution before the product actually works, in my experience."],
      sources,
    );

    expect(report.checked).toBe(1);
    expect(report.supported).toBe(1);
    expect(report.unsupported).toEqual([]);
    expect(report.grounded).toBe(true);
  });

  it("reports an invented sentence verbatim as the post wrote it", () => {
    const invented = "Studies show 60% of firms fail at this within three years.";
    const report = checkGrounding(
      `We spent about six months getting the fund administration margin right.\n\n${invented}`,
      ["We spent about six months getting the fund administration margin right."],
      sources,
    );

    expect(report.unsupported).toEqual([invented]);
    expect(report.checked).toBe(2);
    expect(report.supported).toBe(1);
    expect(report.grounded).toBe(false);
  });

  it("skips sentences too short to carry a claim, and says how many", () => {
    const report = checkGrounding(
      "Here is the thing.\n\nWe spent about six months getting the fund administration margin right.",
      ["We spent about six months getting the fund administration margin right."],
      sources,
    );

    expect(report.skipped).toBe(1);
    expect(report.checked).toBe(1);
    expect(report.supported).toBe(1);
    expect(report.grounded).toBe(true);
  });

  it("counts voice samples as source material, not just the transcript", () => {
    const sentence = "We only ever write about what we have actually shipped for a client.";

    expect(checkGrounding(sentence, [sentence], sources).grounded).toBe(true);
    expect(checkGrounding(sentence, [sentence], [groundingTranscript]).grounded).toBe(false);
  });

  it("does not treat an outlier's phrasing as grounding, because outliers are never in the pool", () => {
    const outlierPhrasing = "I lost the biggest client of my career on a Tuesday afternoon.";
    const report = checkGrounding(outlierPhrasing, [outlierPhrasing], sources);

    expect(report.citationsResolved).toBe(false);
    expect(report.unsupported).toEqual([outlierPhrasing]);
    expect(report.grounded).toBe(false);
  });

  it("does not flag a repeat that is genuinely the executive's own phrase", () => {
    const own = "Nobody builds distribution before the product actually works, in my experience.";
    const report = checkGrounding(`${own}\n\n${own}`, [own], sources);

    expect(report.repeated).toEqual([]);
    expect(report.grounded).toBe(true);
  });

  it("is not grounded when the post cites nothing at all", () => {
    const report = checkGrounding(
      "We spent about six months getting the fund administration margin right.",
      [],
      sources,
    );

    expect(report.citationsResolved).toBe(false);
    expect(report.grounded).toBe(false);
  });

  it("does not resolve a whitespace-only citation", () => {
    // "".includes("") is always true; a naive check scores an empty citation as grounded.
    const report = checkGrounding(
      "We spent about six months getting the fund administration margin right.",
      ["  "],
      sources,
    );

    expect(report.citationsResolved).toBe(false);
    expect(report.grounded).toBe(false);
  });

  it("is not grounded against empty sources", () => {
    const report = checkGrounding("Anything at all, said at some length here.", ["Anything at all"], []);

    expect(report.citationsResolved).toBe(false);
    expect(report.grounded).toBe(false);
  });

  it("cannot catch a short invented sentence said only once, and says so by counting it", () => {
    // The blind spot, pinned deliberately. "Margins doubled." is fabricated, two
    // tokens, and printed once: below the claim threshold and below the repeat
    // threshold. It lands in `skipped`, which is why `skipped` is reported at all.
    // Phase 3 failed once by over-claiming what a grounding check meant.
    const report = checkGrounding(
      "We spent about six months getting the fund administration margin right.\n\nMargins doubled.",
      ["We spent about six months getting the fund administration margin right."],
      sources,
    );

    expect(report.skipped).toBe(1);
    expect(report.unsupported).toEqual([]);
    expect(report.grounded).toBe(true);
  });

  it("handles an empty post without claiming it is grounded by accident", () => {
    const report = checkGrounding("", [], sources);

    expect(report.checked).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.grounded).toBe(false);
  });
});
