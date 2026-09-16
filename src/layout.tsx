import type { FC, PropsWithChildren } from "hono/jsx";
import { ALL_CSS, FAVICON, FONT_HREF } from "./theme";

/**
 * The app shell, on the Broadsheet design system (design/README.md, "App
 * shell"): sticky blurred header, brand + Pilot tag, the tab group, a status
 * crumb and the avatar.
 *
 * The prop signature is unchanged from the first version of this file on
 * purpose. Seven screens render as `<Layout title="…">…</Layout>`, and the
 * point of this rewrite was to restyle all of them without editing any of
 * them. `crumb` is the only addition and it is optional.
 *
 * The handoff's shell shows three tabs because the prototype had three
 * screens. This app has more routes than the prototype, and dropping the rest
 * to match a mockup would have removed working features, so the tab group
 * carries the app's real sections in the design's treatment.
 */

const NAV = [
  // `/` is the public landing page; the app's home is behind the gate at /app.
  { href: "/app", label: "Home" },
  { href: "/sources", label: "Sources" },
  { href: "/runs", label: "Runs" },
  { href: "/fireflies", label: "Fireflies" },
  // Beside Fireflies on purpose: the two integrations are material in, posts out.
  { href: "/zernio", label: "Zernio" },
  { href: "/settings", label: "Settings" },
  { href: "/health", label: "Health" },
];

/**
 * Which tab reads as current. Longest matching prefix wins, so
 * `/runs/<id>` marks Runs and `/sources/transcripts/<id>` marks Sources.
 * `/app` matches only itself — every path starts with `/`.
 */
function currentHref(path: string): string {
  let best = "";
  for (const item of NAV) {
    if (path === item.href || path.startsWith(`${item.href}/`)) {
      if (item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

export type LayoutProps = PropsWithChildren<{
  title: string;
  /** Right-hand status text, e.g. "Run in progress" or "2 of 3 decided". */
  crumb?: string;
  /** Path used to mark the current tab; defaults to no tab marked. */
  path?: string;
}>;

export const Layout: FC<LayoutProps> = ({ title, crumb, path, children }) => {
  const current = currentHref(path ?? "");
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href={FAVICON} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
        <style dangerouslySetInnerHTML={{ __html: ALL_CSS }} />
      </head>
      <body>
        <header class="pf-header">
          <div class="pf-header-in">
            <div class="pf-brand">
              {/* The mark and wordmark are the way home, which is what a
                  reader expects of a logo. */}
              <a class="pf-home" href="/" aria-label="Pipeflick home">
                <span class="pf-mark" aria-hidden="true">
                  P
                </span>
                <span class="pf-wordmark">Pipeflick</span>
              </a>
              <span class="tag tag-accent">Pilot</span>
            </div>

            <nav class="pf-tabs">
              {NAV.map((item) => (
                <a
                  class="pf-tab"
                  href={item.href}
                  aria-current={item.href === current ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div class="pf-meta">
              {crumb ? <span class="pf-crumb">{crumb}</span> : ""}
              <span class="pf-avatar" aria-hidden="true">
                VS
              </span>
            </div>
          </div>
        </header>

        <main class="pf-main">{children}</main>
      </body>
    </html>
  );
};
