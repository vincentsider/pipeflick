# CI/CD setup log

## Phase 2: discovery (2026-11-04)
- Done: `docs/cicd/00-discovery.md`. Typecheck and 75 tests pass, gitleaks is clean, Actions has never run, and there is no protection on `main`.
- Owner's decisions: Standard profile. Separate staging Workers and a separate D1 with no real data, its own low-limit OpenAI key and no Zernio token. Migrations run in the pipeline. Claude in Actions uses `CLAUDE_CODE_OAUTH_TOKEN`. An Access service token lets CI check the gated app. The owner reconciles their uncommitted `CLAUDE.md` edit themselves.
- PR: #1.
