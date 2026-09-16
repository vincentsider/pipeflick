import { Hono } from "hono";
import type { AppEnv } from "./access";
import { getSetting, setSetting, SPEAKER_NAME_KEY } from "./db";
import { Layout } from "./layout";

/** Longest speaker label we accept; Fireflies labels are far shorter. */
const MAX_SPEAKER_NAME = 200;

/** Trim and collapse internal whitespace so labels compare predictably. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export const settings = new Hono<AppEnv>();

settings.get("/settings", async (c) => {
  const speakerName = (await getSetting(c.env.DB, SPEAKER_NAME_KEY)) ?? "";
  const saved = c.req.query("saved") === "1";

  return c.html(
    <Layout title="Pipeflick settings" path={c.req.path}>
      <h2>Settings</h2>
      {saved ? <p class="notice">Saved.</p> : ""}
      <form method="post" action="/settings">
        <p>
          <label for="speaker_name">Your speaker name</label>
        </p>
        <p>
          <input
            type="text"
            id="speaker_name"
            name="speaker_name"
            value={speakerName}
            maxlength={MAX_SPEAKER_NAME}
            size={40}
          />
        </p>
        <p class="hint">
          Fireflies labels you by the name it detected in the meeting, or "Speaker 1" when it could
          not. Enter the name as Fireflies shows it; you can still pick a different speaker on each
          import.
        </p>
        <p>
          <button type="submit">Save</button>
        </p>
      </form>
    </Layout>,
  );
});

settings.post("/settings", async (c) => {
  const body = await c.req.parseBody();
  const raw = body["speaker_name"];
  const value = normalise(typeof raw === "string" ? raw : "");

  if (value.length > MAX_SPEAKER_NAME) {
    return c.text(`Speaker name must be ${MAX_SPEAKER_NAME} characters or fewer`, 400);
  }

  // An empty value is allowed: it clears the setting.
  await setSetting(c.env.DB, SPEAKER_NAME_KEY, value);
  return c.redirect("/settings?saved=1", 303);
});
