import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "./access";
import { getSetting, setSetting } from "./db";
import { SECRET_NAMES, type SecretName } from "./env";
import { Layout } from "./layout";

export const HEALTH_KEY = "health.last_check";

export type HealthResult = {
  email: string;
  db: { ok: boolean; lastCheck?: string; error?: string };
  secrets: Record<SecretName, boolean>;
};

/**
 * Round-trips a timestamp through the D1 `settings` table and reports which
 * secrets are configured. Only booleans leave this function for secrets; no
 * value, prefix or length is ever exposed.
 */
export async function runHealth(c: Context<AppEnv>): Promise<HealthResult> {
  const db: HealthResult["db"] = { ok: false };
  try {
    const written = new Date().toISOString();
    await setSetting(c.env.DB, HEALTH_KEY, written);
    const read = await getSetting(c.env.DB, HEALTH_KEY);
    db.ok = read === written;
    db.lastCheck = read ?? undefined;
    if (!db.ok) db.error = "read-back did not match written value";
  } catch (err) {
    db.error = String(err);
  }

  const secrets = {} as Record<SecretName, boolean>;
  for (const name of SECRET_NAMES) {
    const value = c.env[name];
    secrets[name] = typeof value === "string" && value.length > 0;
  }

  return { email: c.get("email"), db, secrets };
}

export const health = new Hono<AppEnv>();

health.get("/health", async (c) => {
  const result = await runHealth(c);
  return c.html(
    <Layout title="Pipeflick health">
      <h2>Health</h2>
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DB</td>
            <td>
              {result.db.ok ? "ok" : `error: ${result.db.error ?? "unknown"}`}
              {result.db.lastCheck ? ` (last check ${result.db.lastCheck})` : ""}
            </td>
          </tr>
          {SECRET_NAMES.map((name) => (
            <tr>
              <td>{name}</td>
              <td>{result.secrets[name] ? "set" : "not set"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Signed in as {result.email}</p>
    </Layout>,
    result.db.ok ? 200 : 500,
  );
});

health.get("/health.json", async (c) => {
  const result = await runHealth(c);
  return c.json(result, result.db.ok ? 200 : 500);
});
