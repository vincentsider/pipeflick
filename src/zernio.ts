/**
 * Zernio API client: connection check (account list) and LinkedIn draft creation.
 *
 * This is the only module in the project that talks to Zernio, and therefore
 * the only place a post could ever be published from. CLAUDE.md puts
 * auto-publishing out of scope "with or without approval", and that constraint
 * is enforceable in exactly one file if it is enforceable at all — this one.
 * Every request body is built by {@link buildDraftRequest}, which is pure,
 * exported solely so `test/zernio.test.ts` can pin it, and sends
 * `isDraft: true` explicitly.
 *
 * The API key is passed in as a string — this module never reads the
 * environment, never logs, and never puts the key, the request body or any
 * post text into an error message. Routes are the only place that reads the
 * ZERNIO_USER_TOKEN binding (the project's name, since 01-03, for what Zernio's
 * own spec calls ZERNIO_API_KEY; it holds a Zernio API key). A grep of this
 * file for an environment read returns nothing, comments included, so the rule
 * is checkable rather than merely stated.
 */

/** Base URL. The spec's server is `https://zernio.com/api` and every path is `/v1/...`. */
const ENDPOINT = "https://zernio.com/api/v1";

/** Fail rather than hold a Worker request open, same budget as Fireflies. */
const TIMEOUT_MS = 20_000;

/**
 * LinkedIn's own ceiling, stated twice in the Zernio spec. Note that
 * `MAX_DECISION_BODY_CHARS` in `src/runs.tsx` is deliberately 5000 (LinkedIn's
 * ceiling plus headroom in the edit box), so an accepted draft can legally sit
 * in D1 at a length Zernio will reject. The caller checks the length before
 * spending the request; this module does not silently truncate anyone's words.
 */
export const MAX_LINKEDIN_CHARS = 3000;

/** The only platform this client posts to. */
export const LINKEDIN_PLATFORM = "linkedin";

/**
 * A Zernio-reported failure. `code` is Zernio's own machine-readable code when
 * it sends one (`ACCOUNT_DISCONNECTED`, `ACCOUNT_NOT_ENABLED_FOR_POSTING`,
 * `PROFILE_OVER_LIMIT`, `PAYMENT_REQUIRED`), the synthetic `duplicate` for a
 * 409, else `http_<status>`. The message is Zernio's own text, scrubbed of any
 * key-shaped fragment, so it is safe to render.
 */
export class ZernioError extends Error {
  readonly code: string;
  readonly status: number;
  /** A 409 hands back the id of the post that already exists; see {@link createLinkedInDraft}. */
  readonly details?: { existingPostId?: string };

  constructor(message: string, code: string, status: number, details?: { existingPostId?: string }) {
    super(message);
    this.name = "ZernioError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Zernio API keys are `sk_` + 64 hex characters. `scrubKey` in `src/runs.tsx`
 * matches `sk-` (hyphen — OpenAI's shape) and does **not** cover this; the
 * resemblance is a trap. Any Zernio-supplied message is scrubbed here, before
 * it leaves the module, so no caller has to remember which shape it is holding.
 */
const KEY_FRAGMENT = /sk_[A-Za-z0-9_*-]+/g;

function scrubToken(message: string): string {
  return message.replace(KEY_FRAGMENT, "the configured key");
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Response bodies are JSON on every documented status, but never trust that. */
async function readJson(res: Response): Promise<JsonObject | null> {
  try {
    return asObject(await res.json());
  } catch {
    return null;
  }
}

/**
 * Every 4xx/5xx is `{ error }` and most also carry a machine-readable `code`
 * (a 403 with no `code` means the accountId does not belong to this key).
 * Nothing from the request — token, body or post text — goes into the message.
 */
function toZernioError(body: JsonObject | null, status: number): ZernioError {
  const code = asString(body?.code) || `http_${status}`;
  const message = asString(body?.error) || `Zernio returned HTTP ${status}`;
  return new ZernioError(scrubToken(message), code, status);
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * The request body for a LinkedIn draft, and nothing else. Pure: no I/O, no
 * fetch, no environment. It is a separate export purely so a test can pin it.
 *
 * `isDraft: true` wins over the publishing fields per the spec's own precedence
 * rule, and it is sent **explicitly** rather than relying on their absence,
 * because absence is a property a future refactor can destroy silently while
 * adding an unrelated feature. The three fields that would publish —
 * `publishNow`, `scheduledFor` and `queuedFromProfile` — are never constructed
 * anywhere in this module, and `test/zernio.test.ts` asserts they are absent
 * from both the object and its serialised form.
 *
 * `platforms` is sent even though the spec allows a draft to omit it: a draft
 * with no target is not one click from being scheduled in Zernio, which is
 * exactly what the approval-gate-then-push flow promises.
 *
 * Deliberately not here: `dryRun` (TikTok-only — a body with no `tiktok` entry
 * is rejected with 400) and `timezone` (it only interprets a schedule time
 * without an offset, and this client never sends one).
 */
export function buildDraftRequest(content: string, accountId: string): Record<string, unknown> {
  return {
    content,
    isDraft: true,
    platforms: [{ platform: LINKEDIN_PLATFORM, accountId }],
  };
}

/**
 * A connected LinkedIn account as the settings page needs it. `id` is the
 * `_id` a post's `platforms[].accountId` refers to.
 */
export type ZernioAccount = {
  id: string;
  username: string;
  displayName: string;
  profileUrl: string;
  isActive: boolean;
};

function toAccount(raw: JsonObject): ZernioAccount {
  return {
    id: asString(raw._id),
    username: asString(raw.username),
    displayName: asString(raw.displayName),
    profileUrl: asString(raw.profileUrl),
    isActive: raw.isActive === true,
  };
}

/**
 * The connected LinkedIn accounts on this key. Zernio has no `/me` endpoint, so
 * this doubles as the connection check: a bad or missing key throws
 * `ZernioError` with status 401, and an empty array means the key works but no
 * LinkedIn account is connected in the Zernio dashboard.
 *
 * `page` and `limit` must be sent together or the API answers 400, so neither
 * is sent — the pilot has one account.
 */
export async function listLinkedInAccounts(token: string): Promise<ZernioAccount[]> {
  const res = await fetch(`${ENDPOINT}/accounts?platform=${LINKEDIN_PLATFORM}&status=connected`, {
    method: "GET",
    headers: authHeaders(token),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await readJson(res);
  if (!res.ok) {
    throw toZernioError(body, res.status);
  }

  const accounts = Array.isArray(body?.accounts) ? body.accounts : [];
  return accounts
    .map(asObject)
    .filter((raw): raw is JsonObject => raw !== null)
    .map(toAccount)
    .filter((account) => account.id !== "");
}

/** A created (or already-existing) Zernio draft. `status` for a draft is `draft`. */
export type ZernioDraft = {
  id: string;
  status: string;
};

/**
 * The response's `post` is an expanded object whose `platforms[].accountId` is
 * itself an object — unlike the request, where it is a string. Only `_id` and
 * `status` are read, so the two shapes never share a type.
 */
function toDraft(value: unknown): ZernioDraft | null {
  const post = asObject(value);
  const id = asString(post?._id);
  return id === "" ? null : { id, status: asString(post?.status) };
}

/**
 * Save one post as a LinkedIn draft in Zernio. Never publishes: the body comes
 * from {@link buildDraftRequest} and nothing is added to it here.
 *
 * `x-request-id` is fresh per call. The spec warns that reusing one id across
 * logical calls makes every later call look like a retry of the first, which
 * would return that first post instead of creating this one.
 *
 * Two idempotency layers are handled as success, not failure, because pressing
 * a button twice must not read as broken:
 *   200 — an `x-request-id` replay within ~5 minutes; `existingPost` is the
 *         original and nothing was created, which is the correct outcome.
 *   409 — Zernio's 24-hour content hash already has this text; the error
 *         carries `details.existingPostId` so the caller can say "already in
 *         Zernio" and record that id.
 */
export async function createLinkedInDraft(
  token: string,
  content: string,
  accountId: string,
): Promise<ZernioDraft> {
  const res = await fetch(`${ENDPOINT}/posts`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify(buildDraftRequest(content, accountId)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await readJson(res);

  if (res.status === 409) {
    const existingPostId = asString(asObject(body?.details)?.existingPostId);
    throw new ZernioError(
      scrubToken(asString(body?.error) || "This post is already in Zernio"),
      "duplicate",
      res.status,
      existingPostId === "" ? undefined : { existingPostId },
    );
  }

  if (!res.ok) {
    throw toZernioError(body, res.status);
  }

  // 200 is the replay path (`existingPost`), 201 the created one (`post`).
  const draft = toDraft(body?.existingPost) ?? toDraft(body?.post);
  if (!draft) {
    throw new ZernioError(
      "Zernio accepted the draft but returned no post id",
      `http_${res.status}`,
      res.status,
    );
  }

  return draft;
}
