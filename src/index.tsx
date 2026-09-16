import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { requireAccess, type AppEnv } from "./access";
import { fireflies } from "./fireflies-routes";
import { health } from "./health";
import { landing } from "./landing";
import { Layout } from "./layout";
import { runs } from "./runs";
import { settings } from "./settings";
import { sources } from "./sources";
import { zernio } from "./zernio-routes";

const app = new Hono<AppEnv>();

// The public marketing page, and the ONLY thing in front of the Access gate.
//
// The exemption is the registration order, not a flag inside `requireAccess`:
// these two handlers answer and never call `next()`, so the gate below is
// still reached by every other path, including any path this router does not
// claim. `requireAccess` keeps its "no bypass switch" property — adding a
// public-paths list inside it would put the gate's fail-closed behaviour at
// the mercy of a string comparison.
//
// It is registered before `csrf()` on purpose too: the pilot form is posted by
// visitors who have no session to forge, and an Origin check would reject a
// perfectly ordinary cross-origin form post while protecting nothing.
app.route("/", landing);

// Every other route sits behind Cloudflare Access.
app.use("*", requireAccess);

// Origin check on state-changing requests. Cheap behind Access, and this
// phase introduces the first POST forms.
app.use(csrf());

// Health page and JSON endpoint (DB round-trip, secret presence).
app.route("/", health);

// Speaker name used to filter transcripts down to the executive's own lines.
app.route("/", settings);

// Stored transcripts and pasted voice samples.
app.route("/", sources);

// Fireflies connection, meeting list and speaker-filtered import.
app.route("/", fireflies);

// Fireflies' opposite number: the Zernio connection and the LinkedIn account
// an approved draft is pushed to. Behind the app-wide Access gate and csrf().
app.route("/", zernio);

// Drafting runs: paste outliers, pick a transcript, watch the steps.
app.route("/", runs);

// The signed-in home. `/` now belongs to the public landing page, so the app's
// own front door moved here; `src/layout.tsx` points Home at it.
app.get("/app", (c) =>
  c.html(
    <Layout title="Pipeflick" path={c.req.path}>
      <p>Pipeflick is running.</p>
      <p>Signed in as {c.get("email")}</p>
      <p>
        <a href="/sources">Sources</a> · <a href="/runs">Runs</a> ·{" "}
        <a href="/fireflies">Fireflies</a> · <a href="/zernio">Zernio</a> ·{" "}
        <a href="/settings">Settings</a> · <a href="/health">Health</a>
      </p>
    </Layout>,
  ),
);

export default app;
