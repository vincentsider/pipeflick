import { createMiddleware } from "hono/factory";

/**
 * Hono environment shared by every route: D1 and secret bindings from
 * wrangler-generated `Env`, plus the signed-in email set by `requireAccess`.
 */
export type AppEnv = {
  Bindings: Env;
  Variables: { email: string };
};

/**
 * Fail-closed Cloudflare Access gate.
 *
 * The Worker only serves a request when the runtime attached an Access
 * context (`ctx.access`), which Cloudflare does after the visitor passed the
 * Access application in front of this hostname. If the application is
 * removed, misrouted, or the request arrives some other way, there is no
 * context and the Worker answers 403 itself.
 *
 * There is deliberately no bypass switch. Local development gets a context
 * from the `access.dev` block in wrangler.jsonc; remove that block to
 * simulate an anonymous visitor.
 */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  let access: CloudflareAccessContext | undefined;
  try {
    // `c.executionCtx` throws when no execution context exists; treat as no Access.
    // Hono types it with its own narrow interface; the runtime object is the
    // Cloudflare ExecutionContext (global from worker-configuration.d.ts).
    access = (c.executionCtx as ExecutionContext).access;
  } catch {
    access = undefined;
  }

  if (!access) {
    return c.text("Access required", 403);
  }

  const identity = await access.getIdentity();
  c.set("email", identity?.email ?? "unknown");
  await next();
});
