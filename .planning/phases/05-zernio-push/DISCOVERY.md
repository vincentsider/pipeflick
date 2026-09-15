# Phase 5 Discovery: the Zernio API

**Date:** 2026-09-15
**Depth:** Level 2 (new external integration)
**Reason discovery was mandatory:** ROADMAP marks Phase 5 `Research: Likely`, and STATE carried an
explicit instruction from 01-03 — "re-research and re-plan against the Zernio API before planning
that phase (the doc rename is done; the API research is not)". Zernio replaced Metricool at the
01-03 checkpoint and nothing about its API had ever been looked at.

**Primary source:** `https://zernio.com/openapi.yaml` — one OpenAPI 3.1 document, version 1.0.4,
59,031 lines, fetched 2026-09-15. Every field name below is read from that spec, not from the
prose docs. Where the prose docs at `docs.zernio.com` disagreed with the spec, the spec won, and
the disagreement is recorded.

---

## The answers Phase 5 needed

| Roadmap research topic | Answer |
|---|---|
| Authentication | `Authorization: Bearer <key>`. Keys are `sk_` + 64 hex characters. |
| Endpoint and payload for a LinkedIn post as a draft rather than scheduled | `POST /v1/posts` with `isDraft: true`. |
| How to read back the post id | `201` response, `post._id`. |
| Whether the API is available on Vincent's plan | Not answerable from documentation — `GET /v1/accounts` is the empirical test. See "The plan question" below. |

## Base URL and auth

- `servers[0].url` = `https://zernio.com/api`; every path is `/v1/...`. So `https://zernio.com/api/v1/posts`.
- `securitySchemes.bearerAuth`: HTTP bearer. The spec labels `bearerFormat: JWT` but its own
  description says "send your Zernio API key in the Authorization header, prefixed with Bearer",
  and the key format is `sk_` + 64 hex. Treat it as an opaque API key, not a JWT.
- The spec names the environment variable `ZERNIO_API_KEY`. **This project already calls it
  `ZERNIO_USER_TOKEN`** (declared in `src/env.ts` SECRET_NAMES since 01-03 and pushed to the
  Worker). Keep the project's name — renaming it means re-pushing secrets and editing the health
  page for no gain. It holds a Zernio API key; that is worth a comment, not a rename.
- All responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. The spec
  says to read those rather than hard-code a limit.

## SCHED-01 — is the connection working?

`GET /v1/accounts`

- Optional query: `platform` (e.g. `linkedin`), `status` (`connected` | `disconnected`),
  `profileId`, `includeOverLimit`, and `page`+`limit` (which must be sent together or it is 400).
- `200` → `{ accounts: [...], hasAnalyticsAccess: boolean }`. Each account has `_id`, `platform`,
  `username`, `displayName`, `profileUrl`, `isActive`, and an expanded `profileId` object.
- `401` → `{ error }`. `503` → temporarily unavailable.
- There is **no `/me` or dedicated credential-verification endpoint.** `GET /v1/accounts` is the
  connection check: it proves the token is good and returns the `accountId` a post needs.

This is the same shape as Fireflies' list page, which gets the key owner and the meetings in one
request. One request answers "does the connection work" and "which account would we post as".

## SCHED-02 — an unscheduled LinkedIn post

`POST /v1/posts`

Request fields that matter here:

| Field | Type | Notes |
|---|---|---|
| `content` | string | The post text. Required for a text-only post. |
| `platforms` | array | Entries are `{ platform, accountId }`, both required. `platform` is the string `"linkedin"`. `accountId` is the string `_id` from `GET /v1/accounts`. Required for non-draft posts; **drafts may omit it**. |
| `isDraft` | boolean | **When true, saves the post as a draft.** |
| `publishNow` | boolean | Publish synchronously. **Never send this.** |
| `scheduledFor` | date-time | Publish at a time. **Never send this.** |
| `queuedFromProfile` | string | Publish in the profile's next queue slot. **Never send this.** |
| `timezone` | string | IANA name, default `UTC`. Only interprets a `scheduledFor` without an offset, so it is irrelevant to a draft. |
| `platformSpecificData` | object | Entirely optional. `LinkedInPlatformData` covers documents, org URNs, first comments, reshares and polls — none of which a plain text post needs. |

**The precedence rule, quoted from the spec, is the safety property this phase rests on:**

> "Precedence: `isDraft: true` wins over `publishNow` and `scheduledFor` (the post is saved, never
> published), and `publishNow: true` wins over `scheduledFor`."

and

> "With none of them and `isDraft` unset, the post is saved as a draft."

So there are two ways to get a draft: send `isDraft: true`, or send none of the three scheduling
fields. **Send `isDraft: true` explicitly.** Relying on the absence of a field means a future
refactor that adds one publishes to Vincent's real LinkedIn profile, and CLAUDE.md puts
auto-publishing out of scope in the strongest terms the project has.

Send `platforms` as well, even though a draft may omit it: a draft with no target is not one click
from being scheduled in Zernio, which is the point of SCHED-02.

**A resolved documentation conflict.** `docs.zernio.com/platforms/linkedin` shows `publishNow: true`
and the prose index says a draft is what you get when you omit the scheduling fields; a third page
mentions `is_draft` in snake_case. The spec settles it: the field is **`isDraft`**, camelCase, and
it is explicit rather than implied. Do not trust the prose pages on this.

### Response

`201` → `PostCreateResponse`: `{ post: { _id, title, content, status, platforms: [...] }, message }`.

- `post._id` is the Zernio post id SCHED-03 stores.
- `post.status` for a draft is `draft`. The full enum is
  `draft | scheduled | publishing | published | partial | failed | cancelled`.
- **Trap:** `platforms[].accountId` is a *string* in the request and an *expanded object*
  (`{_id, platform, username, displayName, isActive}`) in the response. Do not write a single type
  for both.
- `platformPostUrl` only exists once a post is published. A draft has none, which is why SCHED-03
  asks for the Zernio id rather than a LinkedIn URL.

### Errors

| Status | Meaning |
|---|---|
| `400` | Validation error. `{ error }`. |
| `401` | Unauthorized. `{ error }`. Bad or missing key. |
| `403` | `{ error, code }` where `code` is `ACCOUNT_DISCONNECTED`, `ACCOUNT_NOT_ENABLED_FOR_POSTING` or `PROFILE_OVER_LIMIT`. **No `code` at all means the `accountId` does not belong to this key.** The remedy for all of them is to reconnect in Zernio and refresh ids from `GET /v1/accounts`. |
| `409` | Duplicate content within 24h. `{ error, details: { accountId, platform, existingPostId } }`. |
| `429` | Rate limited: API rate limit, 25 posts/hour per account, account cooldown, or a daily platform limit. |

Every 4xx/5xx is `application/json` with a human-readable `error`; most also carry a
machine-readable `code`. Same division of labour as `FirefliesError`.

### Idempotency — two independent layers

1. **`x-request-id` header (~5 minute window).** A repeat with the same value returns **`200`**
   (not 201) with the original post in an `existingPost` field, creating nothing. The spec warns
   against reusing one id across different logical calls.
2. **Content-hash dedup (24 hour window).** Independently, Zernio hashes
   `(platform, accountId, content + media URLs)` and answers `409` with `details.existingPostId`.

The second layer is a gift for a one-click push button: pressing it twice cannot create two
LinkedIn drafts, and the 409 hands back the id of the one that exists. Treat a 409 as "it is
already there, here is its id", not as a failure.

### Not useful here

- `dryRun` is **TikTok-only**. It cannot be used to rehearse a LinkedIn push. Do not reach for it.
- `POST /v1/posts/{postId}/retry`, `/unpublish`, `/edit` all exist but belong to published posts.
- `GET /v1/posts/{postId}` returns a post by id — a cheap way to confirm a draft landed, and the
  only read the phase might want beyond the create call.

### LinkedIn's own limit

**3,000 characters.** The spec repeats it twice. Note that `MAX_DECISION_BODY_CHARS` in
`src/runs.tsx` is **5,000**, deliberately (04-02 chose LinkedIn's ceiling plus headroom for the
edit box). So an accepted draft can legally sit in D1 at a length Zernio will reject. Check the
length before spending the request.

## The plan question — deliberately left open

The roadmap asks "whether the API is available on Vincent's plan". The spec does **not** answer it,
and no amount of further reading will.

What the spec does say: a `402 PAYMENT_REQUIRED` exists with `reason` in
`free_tier_exceeded | twitter_passthrough | enterprise_required`. `free_tier_exceeded` fires when a
team connects **more than 2 accounts** without a card on file. Pipeflick needs exactly one
(LinkedIn), so the documented free tier covers it. `createPost` does not list `402` among its
responses at all; the payment gate documented on it is about *connecting* accounts, not posting to
them.

Two things follow, and they shape the plans rather than being assumptions inside them:

1. `GET /v1/accounts` returning Vincent's LinkedIn account **is** the answer. It is the first thing
   the `/zernio` page does, and it costs nothing. Phase 5 therefore finds out on its first page
   load rather than guessing now.
2. Vincent must have connected LinkedIn inside the Zernio dashboard, and `ZERNIO_USER_TOKEN` must
   hold a Zernio **API key** rather than some other token. Neither is something Claude can do or
   check without the key. Both are `user_setup` on plan 05-03.

## Decisions carried into the plans

1. **`src/zernio.ts` is the publishing boundary, the way `src/prompts.ts` is the compliance
   boundary.** It takes the token as an argument, never reads `c.env`, never logs, and never puts
   the key or the post text in an error. The request body is built by a pure exported function so a
   test can assert `isDraft: true` is present and `publishNow` / `scheduledFor` /
   `queuedFromProfile` are absent. That test is the only thing standing between a refactor and
   publishing to Vincent's real LinkedIn profile.
2. **The account id lives in `settings`**, keyed `zernio.account_id`, chosen once on `/zernio` —
   the same pattern as `speaker.name` from 02-02. Alongside it `zernio.account_label` so the run
   page can name the account without a request. A stale id comes back as `403`, whose remedy the
   page states.
3. **Only `final_body` is ever pushed, and only from a draft decided `accepted` or `edited`.**
   `body` is the model's original and half of APPR-05; pushing it would publish text the executive
   did not approve.
4. **A push is recorded whether it succeeded or failed** (`zernio_post_id`, `zernio_pushed_at`,
   `zernio_error_*`), because SCHED-03 asks for both states.
5. **`sk_`, not `sk-`.** `scrubKey` in `src/runs.tsx` strips OpenAI-shaped `sk-` fragments. Zernio
   keys are `sk_` + hex. Any Zernio message stored or rendered needs the underscore form scrubbed
   too, or CLAUDE.md's "never render any part of a secret" is broken by a helper that looks like it
   already handles it.

## Sources

- [Zernio OpenAPI 3.1 spec (authoritative)](https://zernio.com/openapi.yaml) — v1.0.4, fetched 2026-09-15
- [Zernio API documentation](https://docs.zernio.com/)
- [Zernio LinkedIn platform docs](https://docs.zernio.com/platforms/linkedin)
- [Zernio LinkedIn integration page](https://zernio.com/linkedin)
