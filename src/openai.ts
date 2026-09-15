/**
 * OpenAI Responses API client: one round-trip returning a strict-schema JSON
 * object.
 *
 * Mirrors `src/fireflies.ts`: the API key is passed in as a string. This module
 * never reads the environment, never logs, and never puts the key, the request
 * body or any transcript text into an error message. `OpenAIError.message` is
 * always either OpenAI's own text or one of a fixed set of strings here, so it
 * is always safe to render on the status page.
 *
 * Raw `fetch`, no SDK: the project has one runtime dependency and the Fireflies
 * client already set this pattern.
 */

const ENDPOINT = "https://api.openai.com/v1/responses";

/** Calls routinely take 20-60s with reasoning models; 2 minutes is the ceiling. */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * A failed OpenAI call. `code` is OpenAI's own `error.code` when it gave one,
 * otherwise `http_<status>`, `timeout`, `refusal`, `incomplete_<reason>`,
 * `no_output` or `bad_json`.
 *
 * `retryable` is decided by code rather than status alone, because 429 means
 * both "slow down" (worth retrying) and "out of credit" (retrying restores
 * nothing and loops forever).
 */
export class OpenAIError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  /** Seconds from the `Retry-After` header, when it was a plain integer. */
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    code: string,
    status: number,
    retryable: boolean,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "OpenAIError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Token counts as the API reports them. Stored per job to turn the phase cost estimate into a measurement. */
export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number } | null;
};

type ResponseBody = {
  status?: string;
  error?: { message?: string; type?: string; code?: string; param?: string | null } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string; refusal?: string }>;
  }>;
  usage?: Usage;
};

export type CallOptions = {
  model: string;
  /** Top-level system instructions. Kept identical across calls so the prefix caches. */
  instructions: string;
  input: string;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
  effort?: "none" | "low" | "medium" | "high";
  timeoutMs?: number;
};

/**
 * Billing and quota failures arrive as 429, exactly like rate limiting. Retrying
 * them is an infinite loop that restores nothing, so they are listed explicitly.
 */
const NON_RETRYABLE_429 = new Set([
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

function toOpenAIError(body: ResponseBody | null, res: Response): OpenAIError {
  const code = body?.error?.code ?? `http_${res.status}`;
  const message = body?.error?.message ?? `OpenAI returned HTTP ${res.status}`;
  const header = res.headers.get("Retry-After");
  const retryAfter = header && /^\d+$/.test(header) ? Number(header) : null;

  const retryable =
    res.status === 500 ||
    res.status === 503 ||
    (res.status === 429 && !NON_RETRYABLE_429.has(code));

  return new OpenAIError(message, code, res.status, retryable, retryAfter);
}

/**
 * One Responses API round-trip returning a strict-schema JSON object.
 *
 * Throws {@link OpenAIError} for every failure mode, so a caller only has to
 * record `code`, `message` and `retryable` on the job row.
 */
export async function callStructured<T>(
  apiKey: string,
  opts: CallOptions,
): Promise<{ value: T; usage: Usage | null }> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        instructions: opts.instructions,
        input: opts.input,
        reasoning: { effort: opts.effort ?? "low" },
        max_output_tokens: opts.maxOutputTokens,
        // Jersey DP / GDPR: the Responses API otherwise retains application
        // state for 30 days. Disabling it drops that retention to none.
        // Be honest about the remainder: abuse-monitoring logs are still kept
        // for 30 days, and changing THAT needs an approved zero-data-retention
        // agreement with OpenAI, which is out of scope for the pilot.
        store: false,
        // The Responses shape: name, strict and schema are siblings inside
        // `format`. Chat Completions nests them a level deeper; writing that
        // shape here is a guaranteed 400.
        text: {
          format: {
            type: "json_schema",
            name: opts.schemaName,
            strict: true,
            schema: opts.schema,
          },
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    // AbortSignal.timeout or a network failure. The cause is never echoed: it
    // can carry the request. Retryable — this says nothing about the account.
    throw new OpenAIError("OpenAI did not respond in time", "timeout", 0, true);
  }

  if (!res.ok) {
    let body: ResponseBody | null = null;
    try {
      body = (await res.json()) as ResponseBody;
    } catch {
      // Nothing readable; release the stream rather than leaving it dangling.
      res.body?.cancel();
    }
    throw toOpenAIError(body, res);
  }

  let body: ResponseBody;
  try {
    body = (await res.json()) as ResponseBody;
  } catch {
    res.body?.cancel();
    throw new OpenAIError("OpenAI returned an unreadable response", "bad_body", res.status, true);
  }

  if (body.status === "failed") {
    throw new OpenAIError(
      body.error?.message ?? "OpenAI could not complete the request",
      body.error?.code ?? "failed",
      200,
      true,
    );
  }

  if (body.status === "incomplete") {
    // A truncated response is billed and returns nothing, so it is surfaced
    // distinctly rather than as "no output". Running out of output budget is
    // worth one retry; a content filter or any other early stop is not.
    const reason = body.incomplete_details?.reason ?? "unknown";
    throw new OpenAIError(
      reason === "max_output_tokens"
        ? "The model ran out of output budget before finishing"
        : `OpenAI stopped early (${reason})`,
      `incomplete_${reason}`,
      200,
      reason === "max_output_tokens",
    );
  }

  // Reasoning models emit a `reasoning` item into output[] before the message,
  // so output[0] is intermittently the wrong item. Always walk the array.
  const message = body.output?.find((item) => item.type === "message");
  const content = message?.content?.[0];

  if (content?.type === "refusal") {
    // The model's own words about why it declined: safe and useful to show.
    throw new OpenAIError(
      content.refusal ?? "The model declined this request",
      "refusal",
      200,
      false,
    );
  }

  if (content?.type !== "output_text" || typeof content.text !== "string") {
    throw new OpenAIError("OpenAI returned no usable output", "no_output", 200, true);
  }

  let value: T;
  try {
    value = JSON.parse(content.text) as T;
  } catch {
    // A strict schema makes this close to impossible, but an unhandled
    // SyntaxError here would escape as a 500 and leave the job row claimed.
    // The parse error itself is dropped: it quotes the response text.
    throw new OpenAIError("OpenAI returned output that was not valid JSON", "bad_json", 200, true);
  }

  return { value, usage: body.usage ?? null };
}
