# Pipeflick

An AI content manager for busy executives.

It takes the executive's own words — Fireflies meeting transcripts, past LinkedIn posts — plus market-proven post formats (outlier posts pasted in by hand), and drafts LinkedIn posts that follow a proven structure while sounding like the executive rather than like an AI. Every draft goes through a human approval gate; approved posts are pushed to [Zernio](https://zernio.com) as unscheduled drafts.

**Auto-publishing is deliberately out of scope.** Nothing in this codebase can publish to a social platform. The Zernio client sends `isDraft: true` and the property is pinned by a test that fails if a publishing field is ever added.

## The pipeline

1. **Voice sources** — import a Fireflies transcript keeping *only* the executive's own lines; paste in past posts as voice samples.
2. **Outliers → templates** — each pasted outlier is reduced to a reusable format (hook, structure, angle), stored but never shown.
3. **Drafting** — one OpenAI call per step, driven by D1 job rows, producing three drafts filled with the executive's own material.
4. **Grounding check** — every draft is checked sentence-by-sentence against the executive's own words, and what it could *not* trace is shown to the reviewer.
5. **Approval gate** — accept, edit-then-accept, or reject. Original and final text are both stored, so the light-edit rate is a query, not a survey.
6. **Feedback loop** — recently approved posts go into the next run's drafting prompt as voice examples.
7. **Push** — one click sends an accepted draft to Zernio as an unscheduled LinkedIn draft.

## Stack

Cloudflare Workers · Hono + `hono/jsx` server rendering · D1 · OpenAI Responses API · vitest

No client-side JavaScript, no build step beyond wrangler's esbuild.

## Deployment

One bundle, two hostnames:

| | Access | What's reachable |
| --- | --- | --- |
| `pipeflick.<subdomain>.workers.dev` | Cloudflare Access on the hostname | Everything, after login |
| `pipeflick-site.<subdomain>.workers.dev` | none | `/` only — the rest 403s |

Access gates the hostname at the edge, before the Worker runs, so a public page cannot live on the gated hostname. The public deploy works because the Worker's own `requireAccess` middleware fails closed: with no `ctx.access`, every route except the landing page answers 403 on its own. `npm run deploy` ships the app; `npx wrangler deploy --name pipeflick-site` ships the public site. Run both.

## Running it

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc   # fill in your D1 database_id
cp .dev.vars.example .dev.vars             # fill in the three API keys
npm run db:migrate:local
npm run dev                                # http://localhost:8787
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server (Miniflare, local D1) |
| `npm run check` | Regenerate types, then `tsc --noEmit` |
| `npm test` | vitest |
| `npm run deploy` | Deploy to workers.dev |
| `npm run db:migrate:local` / `:remote` | Apply `migrations/*.sql` |
| `npm run secrets:push` | Push `.dev.vars` as Worker secrets |

`OPENAI_API_KEY`, `FIREFLIES_API_KEY` and `ZERNIO_USER_TOKEN` live in `.dev.vars` locally and as Worker secrets remotely — never in D1, never in committed config. `/health` reports which are set, never their values.

## Data handling

Built against the Data Protection (Jersey) Law 2018. Two constraints shape the code rather than just the policy:

- **Meeting transcripts contain other participants.** Only the executive's own lines are ever stored. `src/speaker-filter.ts` is the single gate every import passes through, and it fails closed — a blank or ambiguous speaker match keeps nothing rather than dumping a whole meeting.
- **No client identifiers reach the model.** `src/prompts.ts` has zero imports and takes primitives only, so no code path can pass a Fireflies meeting title (which routinely names a counterparty) to OpenAI. Both halves are asserted by test. Every request sets `store: false`.

## How this was built

`.planning/` holds the full record — roadmap, per-phase plans, execution summaries and verification reports, written as the work happened. The summaries record what was measured rather than what was intended, including where a plan turned out to be wrong.

## Status

Pilot. The text loop works end to end. Draft quality is the open question: the approval gate exists precisely to measure it.
