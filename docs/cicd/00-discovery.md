# CI/CD discovery (Phase 2)

Date: 2026-11-04. No code was changed in this phase.

## Where the setup runs

Terminal session with the owner's own `gh` login (`CLAUDE_CODE_REMOTE` unset, `gh auth status`: logged in as `vincentsider`). Repository settings can be changed through `gh api`.

## The repository

| Fact | Value | Evidence |
|---|---|---|
| Owner | `vincentsider`, a personal account | `gh api repos/vincentsider/pipeflick --jq .owner.type` → `User` |
| Visibility | **public** | `.private` → `false` |
| Plan | GitHub Pro | `gh api user --jq .plan.name` → `pro` |
| Default branch | `main` | `.default_branch` |
| Branches | `main` only, local and remote | `git branch -a` |
| Production deploys from | the owner's laptop, by hand, from whatever is checked out | No workflow exists. CLAUDE.md: `npm run deploy` and `npx wrangler deploy -c wrangler.site.jsonc` |
| Rulesets / protection on `main` | none | `gh api repos/vincentsider/pipeflick/rulesets` → `[]` |
| Commits | 103, last on 2026-09-18 | `git log` |

Production is not deployed from a branch, so Phase 4 has no old live branch to retire. It does mean nothing today guarantees that production matches `main`.

## GitHub Actions health

No workflow has ever run (`actions/runs` → `total_count: 0`). There are no repository Actions secrets. Because the repository is public, Actions minutes on standard runners are free.

## The deployable parts

There is one source tree with two Workers. Both use the same D1 database.

| | `pipeflick` (the app) | `pipeflick-site` (public) |
|---|---|---|
| Entry point | `src/index.tsx` | `src/public.tsx` |
| Config | `wrangler.jsonc` (gitignored; template `wrangler.example.jsonc`) | `wrangler.site.jsonc` (gitignored; template `wrangler.site.example.jsonc`) |
| Host | Cloudflare Workers, `*.workers.dev`, `preview_urls: false` | Cloudflare Workers, `*.workers.dev` |
| Gate | A Cloudflare Access application on the hostname, plus `requireAccess` | None. Since `a4ec246` it serves only the landing page and the pilot-request form |
| Data | D1 `pipeflick-db` (production only, with no staging copy) | the same D1 |
| Secrets | `OPENAI_API_KEY`, `FIREFLIES_API_KEY`, `ZERNIO_USER_TOKEN` (`SECRET_NAMES` in `src/env.ts`) | none needed by the landing page |
| Health endpoint | `/health` and `/health.json`. Both are behind Access, so CI cannot read them without an Access service token | none. `/` is the only thing to check |

Stack: TypeScript, Hono 4, wrangler 4, vitest 5, and npm with `package-lock.json`. There is no lint script.

Commands today:

| Command | Result |
|---|---|
| `npm run check` (wrangler types + `tsc --noEmit`) | passes |
| `npm test` (vitest) | 3 files, 75 tests, all pass |

Migrations: `migrations/0001` to `0007`, applied by hand with `npm run db:migrate:remote`. They cannot be rolled back automatically.

## What already exists

- `CLAUDE.md`: yes, detailed. The working copy has an uncommitted edit. That edit describes the public site as "the whole app with no login", but `src/public.tsx` at `a4ec246` serves the landing page only. The owner should reconcile it. This setup does not touch that edit.
- No `.github/` directory: no workflows, no Dependabot, no PR template.
- No `.claude/` directory in the repo: no settings, hooks or skills.

## Secrets in history

`gitleaks git --redact` over the full history scanned 103 commits and **found no leaks**. Nothing needs rotating because of git history.

## Gaps against the target

1. No gate. Nothing runs typecheck or tests on a change, and `main` accepts direct pushes.
2. No staging: no staging Workers, no staging D1, and no staging Access application.
3. Deploys run by hand from a laptop. They depend on local gitignored config files, and it is easy to skip one of the two Workers.
4. Migrations are applied by hand. Nothing ties a migration to the deploy that needs it.
5. No automated check after a deploy. The app's health page sits behind Access.
6. No release tags, no rollback procedure, no AI review, no nightly security review, no Dependabot.
7. No repository hook to stop an AI session from pushing to `main`.

## Recommended profile

**Standard** (staging plus the Promote button). Pipeflick holds a real executive's transcripts, spends paid API credit and pushes to a connected Zernio account, so an untested deploy can do real harm. The open questions are listed in the PR that adds this file.
