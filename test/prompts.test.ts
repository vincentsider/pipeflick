import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DRAFT_INSTRUCTIONS,
  DRAFT_SCHEMA,
  EXTRACT_INSTRUCTIONS,
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
  excerptTranscript,
  isGrounded,
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

  it("orders the blocks so the cacheable prefix comes before the varying format", () => {
    const input = buildDraftingInput(samples, transcriptBody, template);

    const voice = input.indexOf("<voice_samples>");
    const transcript = input.indexOf("<transcript>");
    const format = input.indexOf("<format>");

    expect(voice).toBeGreaterThanOrEqual(0);
    expect(voice).toBeLessThan(transcript);
    expect(transcript).toBeLessThan(format);
    expect(input.indexOf("</voice_samples>")).toBeLessThan(transcript);
    expect(input.indexOf("</transcript>")).toBeLessThan(format);
    expect(input.trimEnd().endsWith("</format>")).toBe(true);
  });

  it("carries the samples, the transcript and the template", () => {
    const input = buildDraftingInput(samples, transcriptBody, template);

    for (const sample of samples) expect(input).toContain(sample);
    expect(input).toContain(transcriptBody);
    expect(input).toContain(JSON.stringify(template));
    expect(input).toContain("\n---\n");
  });

  it("keeps at most MAX_SAMPLES samples, each sliced to MAX_SAMPLE_CHARS", () => {
    const many = ["a".repeat(MAX_SAMPLE_CHARS + 500), "b", "c", "d-dropped", "e-dropped"];
    const input = buildDraftingInput(many, transcriptBody, template);

    expect(input).not.toContain("d-dropped");
    expect(input).not.toContain("e-dropped");
    expect(input).toContain("a".repeat(MAX_SAMPLE_CHARS));
    expect(input).not.toContain("a".repeat(MAX_SAMPLE_CHARS + 1));

    const block = input.slice(input.indexOf("<voice_samples>"), input.indexOf("</voice_samples>"));
    expect(block.split("\n---\n")).toHaveLength(MAX_SAMPLES);
  });

  it("still renders an empty voice_samples block when there are no samples", () => {
    const input = buildDraftingInput([], transcriptBody, template);

    expect(input).toContain("<voice_samples>");
    expect(input).toContain("</voice_samples>");
    expect(input.indexOf("<voice_samples>")).toBeLessThan(input.indexOf("<transcript>"));
    expect(input.slice(input.indexOf("<voice_samples>"), input.indexOf("</voice_samples>")).trim()).toBe(
      "<voice_samples>",
    );
  });

  it("excerpts an over-long transcript rather than sending all of it", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ${"y".repeat(90)}`);
    const body = lines.join("\n");
    const input = buildDraftingInput([], body, template);

    expect(input).toContain(excerptTranscript(body).text);
    expect(input).not.toContain(lines[199]);
  });
});

describe("compliance: primitives only", () => {
  it("cannot carry a meeting title or a speaker label into the payload", () => {
    // What a TranscriptRow would have brought with it, had the signature allowed one.
    const title = "Call with Acme Ltd";
    const speaker = "Vincent Sider";

    const input = buildDraftingInput(["Second published sample."], transcriptBody, template);

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
  });
});

describe("isGrounded", () => {
  it("is true when every cited line is verbatim in the transcript", () => {
    expect(isGrounded(transcriptBody, ["Jersey quietly became the default domicile."])).toBe(true);
    expect(isGrounded(transcriptBody, ["Fund administration margin", "default domicile"])).toBe(true);
  });

  it("is false when any cited line was invented", () => {
    expect(isGrounded(transcriptBody, ["Jersey quietly became the default domicile.", "We grew 40% last year."])).toBe(
      false,
    );
    expect(isGrounded(transcriptBody, ["We grew 40% last year."])).toBe(false);
  });

  it("is false for no citations at all", () => {
    expect(isGrounded(transcriptBody, [])).toBe(false);
    expect(isGrounded(transcriptBody, ["  "])).toBe(false);
    expect(isGrounded("", ["anything"])).toBe(false);
  });
});
