/**
 * What this file is for, plainly: it is the only thing standing between a
 * plausible refactor and publishing to Vincent's real LinkedIn profile.
 *
 * CLAUDE.md puts auto-publishing out of scope in the strongest terms in the
 * document — "with or without approval" — and Zernio's API will publish the
 * moment a body carries `publishNow`, `scheduledFor` or `queuedFromProfile`.
 * `buildDraftRequest` is the single place such a field could ever appear, so
 * its shape is asserted here rather than described in a comment somewhere.
 *
 * This is not a coverage test. It is small because the property it protects is
 * small, and it should not be deleted for being either.
 *
 * The fetch paths are deliberately untested: `src/fireflies.ts` and
 * `src/openai.ts` have none for the same reason. Pure logic is pinned, network
 * calls are verified by driving the real thing, which is what 05-04's
 * checkpoint is for.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LINKEDIN_PLATFORM, MAX_LINKEDIN_CHARS, buildDraftRequest } from "../src/zernio";

/** A real-shaped Zernio account `_id` (24-hex ObjectId), so nothing passes by looking odd. */
const ACCOUNT_ID = "64e1f0a9e2b5af0012ab34cd";
const CONTENT = "some post text";

/** The three fields that would publish. None may ever be constructed. */
const PUBLISHING_FIELDS = ["publishNow", "scheduledFor", "queuedFromProfile"] as const;

describe("buildDraftRequest", () => {
  it("marks the post a draft explicitly", () => {
    const body = buildDraftRequest(CONTENT, ACCOUNT_ID);

    // Explicit `true`, not merely truthy, and not merely "the publishing
    // fields are missing": the spec's precedence rule says isDraft wins over
    // both of them, so an explicit draft flag survives a refactor that adds one.
    expect(body.isDraft).toBe(true);
  });

  it("omits every field that could publish", () => {
    const body = buildDraftRequest(CONTENT, ACCOUNT_ID);

    // not.toHaveProperty rather than toBeUndefined(): an explicitly-set
    // `undefined` passes the latter and serialises away, but the distinction
    // matters the day this shape is built by spreading a caller's object.
    for (const field of PUBLISHING_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("names a target account so the draft is not one click from scheduled", () => {
    const body = buildDraftRequest(CONTENT, ACCOUNT_ID);

    expect(body.platforms).toEqual([{ platform: LINKEDIN_PLATFORM, accountId: ACCOUNT_ID }]);
    expect(LINKEDIN_PLATFORM).toBe("linkedin");
  });

  it("passes the post text through unmodified", () => {
    const text = "  Leading space, an em dash — and a\nnewline.  ";
    const body = buildDraftRequest(text, ACCOUNT_ID);

    // The executive approved these exact characters at the gate. Trimming or
    // truncating here would publish text nobody accepted; the length check
    // against MAX_LINKEDIN_CHARS belongs to the caller, before the request.
    expect(body.content).toBe(text);
    expect(MAX_LINKEDIN_CHARS).toBe(3000);
  });

  it("serialises with no publishing field anywhere in the body", () => {
    const serialised = JSON.stringify(buildDraftRequest(CONTENT, ACCOUNT_ID));

    // The assertion that survives a refactor nesting a field somewhere
    // unexpected — inside platforms[], say, where a key check would miss it.
    for (const field of PUBLISHING_FIELDS) {
      expect(serialised).not.toContain(field);
    }
    expect(serialised).toContain('"isDraft":true');
  });
});

describe("src/zernio.ts", () => {
  const source = readFileSync(new URL("../src/zernio.ts", import.meta.url), "utf8");

  it("never sets a publishing field, in any code path", () => {
    // Source-level, in the style of test/prompts.test.ts's zero-imports check:
    // buildDraftRequest is not the only function that could grow a body, so the
    // whole file is checked for an assignment rather than just its return value.
    for (const field of PUBLISHING_FIELDS) {
      expect(source).not.toMatch(new RegExp(`${field}\\s*:\\s*(true|\`|"|'|new Date)`));
    }
    expect(source).not.toMatch(/publishNow:\s*true/);
  });

  it("reads no environment, so the token can only arrive as an argument", () => {
    expect(source).not.toMatch(/\bc\.env\b/);
    expect(source).not.toMatch(/\bprocess\.env\b/);
  });
});
