import { Hono } from "hono";
import { requireAccess, type AppEnv } from "./access";
import { health } from "./health";
import { Layout } from "./layout";

const app = new Hono<AppEnv>();

// Every route sits behind Cloudflare Access; there are no public routes.
app.use("*", requireAccess);

// Health page and JSON endpoint (DB round-trip, secret presence).
app.route("/", health);

app.get("/", (c) =>
  c.html(
    <Layout title="Pipeflick">
      <p>Pipeflick is running.</p>
      <p>Signed in as {c.get("email")}</p>
      <p>
        <a href="/health">Health</a>
      </p>
    </Layout>,
  ),
);

export default app;
