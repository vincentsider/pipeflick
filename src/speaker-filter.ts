// This module is the only place that decides which transcript text may be stored:
// every import runs through keepSpeakerLines, and no other speaker's text may leave it.
// Pure functions only — no I/O, no logging, nothing that could echo a transcript elsewhere.

/** The subset of the Fireflies `sentences` fields the import uses. */
export type Sentence = {
  index?: number | null;
  speaker_name?: string | null;
  text?: string | null;
  raw_text?: string | null;
};

/** One speaker label and how many non-blank lines it accounts for. */
export type SpeakerCount = {
  label: string;
  lines: number;
};

/** Display label used when Fireflies gives a sentence no speaker name. */
export const UNKNOWN_SPEAKER = "Unknown";

/** Trim, collapse internal whitespace, lowercase. `null`/`undefined` become "". */
export function normaliseLabel(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The text of a sentence: `text` when non-blank, else `raw_text`, else "". */
function sentenceText(sentence: Sentence): string {
  const text = (sentence.text ?? "").trim();
  if (text !== "") return text;
  return (sentence.raw_text ?? "").trim();
}

function hasIndex(sentence: Sentence): boolean {
  return typeof sentence.index === "number" && Number.isFinite(sentence.index);
}

/**
 * Count the non-blank lines per distinct speaker, most lines first (ties keep
 * first appearance). Used to show the user who is in a meeting before import.
 */
export function countBySpeaker(sentences: Sentence[]): SpeakerCount[] {
  type Entry = { label: string; lines: number; firstSeen: number };
  const byKey = new Map<string, Entry>();

  for (const sentence of sentences) {
    if (sentenceText(sentence) === "") continue;

    const key = normaliseLabel(sentence.speaker_name);
    const existing = byKey.get(key);
    if (existing) {
      existing.lines += 1;
      continue;
    }

    const original = (sentence.speaker_name ?? "").trim();
    byKey.set(key, {
      label: original === "" ? UNKNOWN_SPEAKER : original,
      lines: 1,
      firstSeen: byKey.size,
    });
  }

  return [...byKey.values()]
    .sort((a, b) => b.lines - a.lines || a.firstSeen - b.firstSeen)
    .map(({ label, lines }) => ({ label, lines }));
}

/**
 * Find the configured speaker among the labels on a transcript: an exact
 * (normalised) match first, then a single label containing the name. Returns
 * null when the name is blank, absent, or matches more than one label — the
 * caller then asks the user to pick.
 */
export function matchSpeaker(labels: string[], configured: string | null | undefined): string | null {
  const wanted = normaliseLabel(configured);
  if (wanted === "") return null;

  for (const label of labels) {
    if (normaliseLabel(label) === wanted) return label;
  }

  const partial: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const key = normaliseLabel(label);
    if (key === "" || seen.has(key)) continue;
    if (key.includes(wanted)) {
      seen.add(key);
      partial.push(label);
    }
  }

  return partial.length === 1 ? partial[0] : null;
}

/**
 * Keep only the lines spoken by `label`, in transcript order. Everything the
 * other participants said is dropped here and never reaches storage.
 */
export function keepSpeakerLines(sentences: Sentence[], label: string): string[] {
  const wanted = normaliseLabel(label);
  if (wanted === "") return [];

  const kept = sentences.filter(
    (sentence) => normaliseLabel(sentence.speaker_name) === wanted && sentenceText(sentence) !== "",
  );

  const ordered = kept.every(hasIndex) ? [...kept].sort((a, b) => (a.index as number) - (b.index as number)) : kept;

  return ordered.map(sentenceText);
}
