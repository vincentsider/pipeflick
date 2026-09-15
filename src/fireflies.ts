/**
 * Fireflies GraphQL client: connection check, meeting list, single transcript.
 *
 * Rate limits are 50 requests/day on the Free plan (500/day Pro), so every
 * caller makes exactly ONE request per page view: the list page asks for the
 * key owner and the meetings in a single query, and an import costs one
 * request for the preview plus one for the confirmed write.
 *
 * The API key is passed in as a string — this module never reads the
 * environment, never logs, and never puts the key, the request body or any
 * transcript text into an error message.
 */

import type { Sentence } from "./speaker-filter";

const ENDPOINT = "https://api.fireflies.ai/graphql";

/** Fireflies is occasionally slow; fail rather than hold a Worker request open. */
const TIMEOUT_MS = 20_000;

/** Meetings per list page (the API caps `limit` at 50). */
export const PAGE_SIZE = 50;

/**
 * A Fireflies-reported failure. `code` is the Fireflies error code
 * (`object_not_found`, `paid_required`, ...) or `http_<status>` when the API
 * gave none. The message is safe to render: it is Fireflies' own text.
 */
export class FirefliesError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "FirefliesError";
    this.code = code;
    this.status = status;
  }
}

type GraphQLError = {
  message?: string | null;
  code?: string | null;
  extensions?: { code?: string | null } | null;
};

type GraphQLResponse<T> = {
  data?: T | null;
  errors?: GraphQLError[] | null;
};

function toFirefliesError(errors: GraphQLError[] | null | undefined, status: number): FirefliesError {
  const first = errors && errors.length > 0 ? errors[0] : undefined;
  const code = first?.code ?? first?.extensions?.code ?? `http_${status}`;
  const message = first?.message ?? `Fireflies returned HTTP ${status}`;
  return new FirefliesError(message, code, status);
}

/**
 * One GraphQL round-trip. Fireflies answers HTTP 200 with a populated
 * `errors` array for application-level failures, so both are checked.
 */
async function firefliesQuery<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let json: GraphQLResponse<T> | null = null;
  try {
    json = (await res.json()) as GraphQLResponse<T>;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw toFirefliesError(json?.errors, res.status);
  }
  if (json?.errors && json.errors.length > 0) {
    throw toFirefliesError(json.errors, res.status);
  }
  if (!json || json.data === null || json.data === undefined) {
    throw new FirefliesError("Fireflies returned no data", `http_${res.status}`, res.status);
  }

  return json.data;
}

/** A meeting as the list and preview pages need it. */
export type Meeting = {
  id: string;
  title: string;
  /** Meeting start as an ISO-8601 string; "" when Fireflies gave no usable date. */
  dateIso: string;
  durationMinutes: number;
};

export type FetchedTranscript = Meeting & {
  sentences: Sentence[];
};

type RawTranscript = {
  id?: string | null;
  title?: string | null;
  /** Float, milliseconds since the epoch (UTC). */
  date?: number | string | null;
  /** Minutes, possibly fractional. */
  duration?: number | string | null;
  sentences?: Sentence[] | null;
};

function toIsoDate(value: RawTranscript["date"]): string {
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function toMinutes(value: RawTranscript["duration"]): number {
  const minutes = typeof value === "number" ? value : Number(value);
  return Number.isFinite(minutes) ? Math.round(minutes) : 0;
}

function toMeeting(raw: RawTranscript): Meeting {
  const title = (raw.title ?? "").trim();
  return {
    id: raw.id ?? "",
    title: title === "" ? "(untitled)" : title,
    dateIso: toIsoDate(raw.date),
    durationMinutes: toMinutes(raw.duration),
  };
}

/** Connection check and meeting list in a single request (see rate limits). */
const LIST_QUERY = `query($skip: Int) {
  user { name email }
  transcripts(limit: ${PAGE_SIZE}, skip: $skip) { id title date duration }
}`;

const TRANSCRIPT_QUERY = `query($id: String!) {
  transcript(id: $id) {
    id
    title
    date
    duration
    sentences { index speaker_name text raw_text }
  }
}`;

export type FirefliesUser = { name: string; email: string };

/**
 * The API key owner plus one page of their meetings, newest first, in ONE
 * request. `skip` is the offset; pages are {@link PAGE_SIZE} long.
 */
export async function listMeetings(
  apiKey: string,
  skip = 0,
): Promise<{ user: FirefliesUser; meetings: Meeting[] }> {
  const data = await firefliesQuery<{
    user?: { name?: string | null; email?: string | null } | null;
    transcripts?: RawTranscript[] | null;
  }>(apiKey, LIST_QUERY, { skip });

  return {
    user: {
      name: (data.user?.name ?? "").trim(),
      email: (data.user?.email ?? "").trim(),
    },
    meetings: (data.transcripts ?? [])
      .filter((raw): raw is RawTranscript => Boolean(raw) && typeof raw.id === "string" && raw.id !== "")
      .map(toMeeting),
  };
}

/**
 * One transcript with its sentences. The sentences go straight to
 * `countBySpeaker`/`keepSpeakerLines`; nothing else may touch them.
 * An unknown or inaccessible id raises `FirefliesError` with code
 * `object_not_found`.
 */
export async function fetchTranscript(apiKey: string, id: string): Promise<FetchedTranscript> {
  const data = await firefliesQuery<{ transcript?: RawTranscript | null }>(apiKey, TRANSCRIPT_QUERY, {
    id,
  });

  const raw = data.transcript;
  if (!raw) {
    throw new FirefliesError("Transcript not found", "object_not_found", 404);
  }

  return {
    ...toMeeting(raw),
    id: raw.id ?? id,
    sentences: raw.sentences ?? [],
  };
}
