-- The public landing page's pilot request form.
--
-- This is the ONLY table in the project written by an unauthenticated visitor.
-- Every other write sits behind Cloudflare Access and is the executive's own
-- action; this one is a stranger's. That difference is why the route caps the
-- address at 254 characters and shape-checks it before the insert, and why
-- nothing here is ever read back into a prompt or shown in the app.
--
-- PERSONAL DATA. A work email address is personal data under the Data
-- Protection (Jersey) Law 2018, and this row is the only place the project
-- stores personal data belonging to someone who is not the executive. Three
-- consequences the code and the operator have to honour:
--
--   1. Minimal storage. The address and a timestamp, nothing else. No IP, no
--      user agent, no referrer — a lead form does not need them and storing
--      them would widen the obligation for nothing.
--   2. Delete on request. Same v1 answer as the rest of the project: a
--      `wrangler d1 execute` DELETE by address. There is no UI for it.
--   3. A privacy notice is owed before this is collected from real strangers.
--      The landing page does not carry one yet, so either add it or take the
--      form down before the page is genuinely public. Collecting first and
--      explaining later is the thing the law is about.
--
-- The address is NOT unique: someone asking twice is a person asking twice,
-- not an error to swallow. Deduplicate at read time if it ever matters.
-- `created_at` is an ISO timestamp for the same reason every other table uses
-- one — D1 has no native date type and string ISO sorts correctly.

CREATE TABLE IF NOT EXISTS pilot_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,             -- shape-checked and capped at 254 chars by the route
  created_at TEXT NOT NULL              -- ISO 8601, UTC
);

CREATE INDEX IF NOT EXISTS idx_pilot_requests_created_at
  ON pilot_requests (created_at DESC);
