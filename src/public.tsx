import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { csrf } from "hono/csrf";
import type { AppEnv } from "./access";
import { fireflies } from "./fireflies-routes";
import { health } from "./health";
import { landing } from "./landing";
import { Layout } from "./layout";
import { runs } from "./runs";
import { settings } from "./settings";
import { sources } from "./sources";
import { zernio } from "./zernio-routes";

/**
 * The PUBLIC entry point: the landing page and the app, with no login.
 *
 * This is a second Worker (`pipeflick-site`), built from the same source as
 * the gated one but composed differently. `src/index.tsx` is the real app and
 * still sits behind Cloudflare Access with `requireAccess` under it; this file
 * mounts the same routers without that gate so the pilot can be demonstrated
 * to people who have no login.
 *
 * WHY A SECOND ENTRY POINT RATHER THAN A FLAG.
 * `requireAccess` has no bypass switch, and adding one would have put the real
 * app's fail-closed behaviour at the mercy of an environment variable — set it
 * wrong once and the gated hostname opens. Composition cannot be misconfigured
 * that way: whether a route is public is decided by which file mounts it, and
 * this file is only ever deployed to the public Worker.
 *
 * WHAT THIS EXPOSES. Everything the app can do, to anyone with the URL: the
 * stored transcripts and drafts are readable, a run spends real OpenAI credit,
 * and an accepted draft can be pushed to the connected Zernio account. It
 * shares the production database, so it is the real service, not a copy.
 */

/**
 * Stands in for `requireAccess`. There is no Access context on this hostname,
 * so there is no identity to read; the app only uses the email to say who is
 * signed in, and every screen works without a real one.
 */
const demoIdentity = createMiddleware<AppEnv>(async (c, next) => {
  c.set("email", "Guest");
  await next();
});

const app = new Hono<AppEnv>();

app.route("/", landing);

app.use("*", demoIdentity);
app.use(csrf());

app.route("/", health);
app.route("/", settings);
app.route("/", sources);
app.route("/", fireflies);
app.route("/", zernio);
app.route("/", runs);

app.get("/app", (c) =>
  c.html(
    <Layout title="Pipeflick" path={c.req.path} crumb="Pilot week 3">
      <section>
        <span class="tag tag-accent tag-12">Pipeflick</span>
        <h1 class="pf-h1">The pilot, end to end.</h1>
        <p class="pf-lede">
          Start at Sources: pick a meeting you spoke in, paste two posts that did well in your
          market, and draft three posts in your own words. Every line is checked back against what
          you actually said, and nothing leaves without your yes.
        </p>
        <p style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-6)">
          <a class="btn btn-primary btn-lg" href="/sources">
            Start at Sources
          </a>
          <a class="btn btn-secondary" href="/runs">
            See past runs
          </a>
        </p>
      </section>
    </Layout>,
  ),
);

export default app;
