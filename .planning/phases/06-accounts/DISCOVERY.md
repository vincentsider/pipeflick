# Phase 6 Discovery: Accounts

**Date:** 2026-09-16
**Depth:** Standard (Level 2) — the roadmap flagged `Research: Likely`; two questions were open and both are now answered.

---

## Q1: Can Cloudflare Access do self-registration?

**Yes, and it needs no code.**

One-time PIN is an identity provider. An Access policy whose Include rule is the OTP login method *without* an email-domain or email-list restriction lets anyone with any inbox authenticate: they enter an address, Cloudflare mails a PIN, they enter it, they are in. Cloudflare only sends the PIN when the policy allows the address, so the policy is the whole registration gate.

- **Free tier:** Zero Trust Free protects up to **50 users** at no cost. Past that it is per-seat.
- **PIN lifetime:** 10 minutes.
- **Identity:** the signed-in email arrives the same way it does today — `ctx.access.getIdentity()`, already read in `src/access.ts`. Nothing about the Worker-side plumbing changes; only the policy widens.

**What this gives us:** a verified email address. The user proved they control that inbox. That is exactly the guarantee an `owner_email` column needs, and it is stronger than a self-hosted password sign-up would give us without an email-verification flow of our own.

**What it does NOT give us — the risk this opens:**
An open OTP policy means *any address on the internet* can register. Every registration can then spend the operator's OpenAI credit (a run is ~$0.10 measured on run 1) and occupy one of the 50 free seats. This is the single largest new abuse surface in the phase, and Phase 6 must not ship without an answer to it. Options, cheapest first:
1. Keep the Include rule an email **list** the operator edits — invite-only, self-service for the operator, zero code, no abuse surface. Registration is "email Vincent".
2. Restrict to one or more **email domains** — works if the pilot users share a firm.
3. Open OTP plus an in-app **invite code** checked on first sign-in before any row is created.

**DECIDED 2026-09-16: option (1), the invite list.** Vincent: "i don't want people to use my openai account / api freely." The Include rule stays an explicit email list the operator edits; nobody uninvited reaches the Worker at all.

Note what this does and does not close. It closes registration abuse completely — an uninvited address never gets a PIN. It does **not** cap spend: an invited account can still start unlimited runs on the operator's OpenAI key. That gap is recorded as `.planning/todos/pending/cap-run-spend-per-account.md` and is deliberately outside Phase 6.

Sources:
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/
- https://blog.cloudflare.com/teams-plans/

---

## Q2: Where do per-account Fireflies and Zernio credentials live?

**An encrypted column in D1, using WebCrypto AES-GCM with a Worker secret as the master key.**

Workers implements the full WebCrypto standard, and **AES-GCM is fully supported** for `generateKey`, `encrypt` and `decrypt` via `crypto.subtle`. A 0-length IV is rejected, so every record carries its own random 12-byte IV.

Options considered:

| Option | Verdict |
|---|---|
| **Encrypted column in D1** | **Chosen.** The data is already per-account and already in D1; the ciphertext travels with the row it belongs to, so deleting an account deletes its keys by construction (ACCT-06). |
| Workers KV | Rejected. A second store to keep consistent with D1, and account deletion becomes a two-place operation that can half-fail. |
| Secrets Store / Worker secrets | Rejected. Worker secrets are per-*Worker*, not per-*user*. There is no per-end-user granularity; this is the very thing ACCT-05 has to move away from. |

**Shape:** one master key as a Worker secret (`CREDENTIAL_KEY`, 32 random bytes base64), imported with `crypto.subtle.importKey`. Each stored credential is `{iv, ciphertext}`, both base64, in a TEXT column. Decrypt only at the moment of use, never at render.

**This reverses PLAT-03 for two of the three keys, and the reversal is the point.** OpenAI stays a Worker secret — the operator pays for it. Fireflies and Zernio become per-account, because another user's meetings are in their Fireflies and their posts belong in their Zernio.

**Honest limits, to be written at the code site:**
- The master key is a Worker secret, so anyone who can deploy the Worker can decrypt every stored credential. This protects against a D1 dump, not against a compromised Cloudflare account. Saying otherwise would be a false claim.
- Rotating the master key means re-encrypting every row. Out of scope for this phase; the column stores a `key_version` so a later rotation is possible without guessing.

Sources:
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

---

## Q3 (codebase, not external): what actually has to be scoped?

Measured, not estimated:

- **7 tables.** Six carry user data: `settings`, `transcripts`, `voice_samples`, `runs`, `outliers`, `drafts`. `pilot_requests` is the landing page's lead capture — it belongs to the operator, not to a user, and deliberately gets **no** owner column.
- **21 exported functions in `src/db.ts`.**
- **Next migration number is 0008** (0007 is `pilot_requests`).
- **Two entry points**, not one: `src/index.tsx` (gated) and `src/public.tsx` (the public demo added for the 2026-09-16 showing). Criterion 5 exists because of the second one.

**Ownership shape — owner on roots, children reached only through them.**

`owner_email` goes on the four root tables: `settings`, `transcripts`, `voice_samples`, `runs`. `outliers` and `drafts` do **not** get one. They are already reached exclusively by `run_id` (`recordDecision` is `WHERE id = ?4 AND run_id = ?5`, measured at `changes() = 0` cross-run in 04-01), so scoping the run scopes its children.

This is only safe if there is no path to a child that skips the run check, which is why `getRunView` must take the owner and return null for someone else's run. That makes it structural rather than a discipline: there is no way to reach a draft except through an owner-scoped run read. Denormalising `owner_email` onto children was rejected — two sources of truth for one fact drift, and a draft whose owner disagrees with its run's owner is unrecoverable.

---

## What this phase must NOT quietly become

The roadmap already says it: multi-tenancy is a deliberate scope change and should wait until the pilot's own question has an answer. Two further notes for whoever executes it:

- **Compliance is a prerequisite, not a follow-up.** The first time another user imports a meeting, the project processes a third party's recording. Privacy notice, processing agreement, deletion on request, and a defensible answer on Fireflies being US-hosted all have to exist *before* that import, not after.
- **`src/public.tsx` currently carries the production database and the operator's API keys with no login at all.** It was correct for one evening's demo. It is incompatible with real accounts, and 06-04 closes or re-scopes it.
