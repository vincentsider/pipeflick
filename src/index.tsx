import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { requireAccess, type AppEnv } from "./access";
import { health } from "./health";
import { Layout } from "./layout";
import { settings } from "./settings";

const app = new Hono<AppEnv>();

// Every route sits behind Cloudflare Access; there are no public routes.
app.use("*", requireAccess);

// Origin check on state-changing requests. Cheap behind Access, and this
// phase introduces the first POST forms.
app.use(csrf());

// Health page and JSON endpoint (DB round-trip, secret presence).
app.route("/", health);

// Speaker name used to filter transcripts down to the executive's own lines.
app.route("/", settings);

app.get("/", (c) =>
  c.html(
    <Layout title="Pipeflick">
      <p>Pipeflick is running.</p>
      <p>Signed in as {c.get("email")}</p>
      <p>
        <a href="/settings">Settings</a> · <a href="/health">Health</a>
      </p>
    </Layout>,
  ),
);

export default app;
