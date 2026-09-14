import { Hono } from "hono";
import { Layout } from "./layout";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.html(
    <Layout title="Pipeflick">
      <p>Pipeflick is running.</p>
      <p>
        <a href="/health">Health</a>
      </p>
    </Layout>,
  ),
);

export default app;
