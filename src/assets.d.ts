/**
 * Binary modules. `wrangler.jsonc` declares a `Data` rule for `assets/*.webp`,
 * so esbuild inlines each file into the Worker bundle and the import is an
 * ArrayBuffer at runtime.
 *
 * This is how the landing page's photographs are served without an `assets`
 * binding — that binding puts a router Worker in front, which drops
 * `ctx.access` and would break the Access gate for every other route (see the
 * note in wrangler.jsonc, and Plan 01-01).
 */
declare module "*.webp" {
  const content: ArrayBuffer;
  export default content;
}
