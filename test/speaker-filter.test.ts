import { describe, expect, it } from "vitest";

import {
  countBySpeaker,
  keepSpeakerLines,
  matchSpeaker,
  normaliseLabel,
  type Sentence,
} from "../src/speaker-filter";

/**
 * A three-speaker meeting. Only Vincent's lines may ever be kept; the words
 * "custody", "regulator" and "briefing" belong to other people and must never
 * appear in the output.
 */
const meeting: Sentence[] = [
  { index: 0, speaker_name: "Vincent Sider", text: "Fund administration margin is the whole story." },
  { index: 1, speaker_name: "Sarah Chen", text: "Agreed, though clients keep asking about custody." },
  { index: 2, speaker_name: "Vincent Sider", text: "Jersey quietly became the default domicile." },
  { index: 3, speaker_name: "Tom Reid", text: "I will circulate the regulator briefing tomorrow." },
  { index: 4, speaker_name: "Vincent Sider", text: "Nobody builds distribution before the product works." },
];

const vincentLines = [
  "Fund administration margin is the whole story.",
  "Jersey quietly became the default domicile.",
  "Nobody builds distribution before the product works.",
];

describe("keepSpeakerLines", () => {
  it("keeps only the chosen speaker's lines, in transcript order", () => {
    expect(keepSpeakerLines(meeting, "Vincent Sider")).toEqual(vincentLines);

    // Out-of-order array with indexes: sorted back into transcript order.
    const shuffled = [meeting[4], meeting[0], meeting[1], meeting[2]];
    expect(keepSpeakerLines(shuffled, "Vincent Sider")).toEqual(vincentLines);

    // No indexes at all: array order is preserved as-is.
    const unindexed: Sentence[] = [
      { speaker_name: "Vincent Sider", text: "Second thought." },
      { speaker_name: "Sarah Chen", text: "Something about custody." },
      { speaker_name: "Vincent Sider", text: "First thought." },
    ];
    expect(keepSpeakerLines(unindexed, "Vincent Sider")).toEqual(["Second thought.", "First thought."]);
  });

  it("matches the speaker label case- and whitespace-insensitively", () => {
    expect(keepSpeakerLines(meeting, "  vincent   SIDER ")).toEqual(vincentLines);

    const messyLabels: Sentence[] = [
      { index: 0, speaker_name: " VINCENT  sider ", text: "Kept anyway." },
      { index: 1, speaker_name: "Sarah Chen", text: "Dropped." },
    ];
    expect(keepSpeakerLines(messyLabels, "Vincent Sider")).toEqual(["Kept anyway."]);

    expect(normaliseLabel("  Vincent   SIDER ")).toBe("vincent sider");
    expect(normaliseLabel(null)).toBe("");
    expect(normaliseLabel(undefined)).toBe("");
  });

  it("returns an empty array when the label matches nobody", () => {
    expect(keepSpeakerLines(meeting, "Someone Else")).toEqual([]);
    expect(keepSpeakerLines(meeting, "")).toEqual([]);
    expect(keepSpeakerLines([], "Vincent Sider")).toEqual([]);
  });

  it("uses text, falls back to raw_text, trims, and drops blank sentences", () => {
    const mixed: Sentence[] = [
      { index: 0, speaker_name: "Vincent Sider", text: "  Edited version.  " },
      { index: 1, speaker_name: "Vincent Sider", text: "", raw_text: "Raw fallback version." },
      { index: 2, speaker_name: "Vincent Sider", text: null, raw_text: "   " },
      { index: 3, speaker_name: "Vincent Sider", text: "   ", raw_text: null },
      { index: 4, speaker_name: "Vincent Sider", raw_text: "  Another raw one.  " },
    ];

    expect(keepSpeakerLines(mixed, "Vincent Sider")).toEqual([
      "Edited version.",
      "Raw fallback version.",
      "Another raw one.",
    ]);
  });

  it("never leaks another speaker's words into the output", () => {
    const joined = keepSpeakerLines(meeting, "Vincent Sider").join("\n");

    for (const foreign of ["custody", "regulator", "briefing", "Agreed", "circulate"]) {
      expect(joined).not.toContain(foreign);
    }
    expect(joined.split("\n")).toHaveLength(3);
  });
});

describe("countBySpeaker", () => {
  it("counts non-blank lines per speaker, most lines first, Unknown for missing names", () => {
    const sentences: Sentence[] = [
      { index: 0, speaker_name: "Vincent Sider", text: "One." },
      { index: 1, speaker_name: "Sarah Chen", text: "Two." },
      { index: 2, speaker_name: "  vincent   sider  ", text: "Three." },
      { index: 3, speaker_name: null, text: "Four." },
      { index: 4, speaker_name: "Vincent Sider", text: "   " },
      { index: 5, speaker_name: "", text: "Five." },
      { index: 6, speaker_name: "Sarah Chen", text: "Six." },
      { index: 7, speaker_name: "VINCENT SIDER", raw_text: "Seven." },
    ];

    expect(countBySpeaker(sentences)).toEqual([
      { label: "Vincent Sider", lines: 3 },
      { label: "Sarah Chen", lines: 2 },
      { label: "Unknown", lines: 2 },
    ]);
    expect(countBySpeaker([])).toEqual([]);
  });
});

describe("matchSpeaker", () => {
  it("prefers an exact match over a partial one", () => {
    expect(matchSpeaker(["Vincent Sider Jr", "Vincent Sider"], "Vincent Sider")).toBe("Vincent Sider");
    expect(matchSpeaker(["Vincent  SIDER"], "  vincent sider ")).toBe("Vincent  SIDER");
  });

  it("returns the single label that contains the configured name", () => {
    expect(matchSpeaker(["Vincent Sider", "Sarah Chen", "Tom Reid"], "Vincent")).toBe("Vincent Sider");
    expect(matchSpeaker(["Vincent Sider", "Sarah Chen"], "  sider ")).toBe("Vincent Sider");
  });

  it("returns null when the partial match is ambiguous", () => {
    expect(matchSpeaker(["Vincent Sider", "Vincent Smith"], "Vincent")).toBeNull();
    expect(matchSpeaker(["Vincent Sider", "Sarah Chen"], "Nadia")).toBeNull();
  });

  it("returns null for a blank configured name or generic speaker labels", () => {
    expect(matchSpeaker(["Vincent Sider"], "")).toBeNull();
    expect(matchSpeaker(["Vincent Sider"], "   ")).toBeNull();
    expect(matchSpeaker(["Vincent Sider"], null)).toBeNull();
    expect(matchSpeaker(["Vincent Sider"], undefined)).toBeNull();
    expect(matchSpeaker(["Speaker 1", "Speaker 2"], "Vincent")).toBeNull();
    expect(matchSpeaker([], "Vincent")).toBeNull();
  });
});
