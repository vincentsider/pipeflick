import { Hono } from "hono";
import type { AppEnv } from "./access";
import { landing } from "./landing";

/**
 * The PUBLIC entry point: the marketing page, and nothing else.
 *
 * This is a second Worker (`pipeflick-site`), built from the same source as
 * the gated one but composed differently. `src/index.tsx` is the real app and
 * sits behind Cloudflare Access with `requireAccess` under it. This file
 * mounts only the landing page, so the app itself is reachable at the gated
 * hostname alone.
 *
 * WHY A SECOND ENTRY POINT RATHER THAN A FLAG.
 * `requireAccess` has no bypass switch, and adding one would have put the real
 * app's fail-closed behaviour at the mercy of an environment variable — set it
 * wrong once and the gated hostname opens. Composition cannot be misconfigured
 * that way: whether a route is public is decided by which file mounts it.
 *
 * WHAT THIS EXPOSES. The landing page and the pilot-request form, which is
 * all it is for. Until 18 September 2026 it mounted the whole app with no
 * login, on the production database: the stored transcripts and drafts were
 * readable by anyone with the URL, a visitor could spend real OpenAI credit,
 * push an accepted draft to the connected Zernio account, and make the
 * Fireflies page list meeting titles from Vincent's account. That was a
 * deliberate choice so the pilot could be demonstrated without a login, and
 * Vincent ended it: Pipeflick is his own tool and it needs his login.
 *
 * Anything not mounted here answers 404 from Hono, so a new router added to
 * `src/index.tsx` is private unless someone adds it here on purpose.
 */
const app = new Hono<AppEnv>();

app.route("/", landing);

export default app;
