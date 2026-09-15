import type { FC, PropsWithChildren } from "hono/jsx";

const css = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 720px;
    margin: 2rem auto;
    padding: 0 1rem;
    line-height: 1.5;
    color: #1a1a1a;
  }
  header { border-bottom: 1px solid #ddd; margin-bottom: 1.5rem; padding-bottom: 0.5rem; }
  header h1 { margin: 0; font-size: 1.5rem; }
  nav ul { list-style: none; display: flex; gap: 1rem; margin: 0.5rem 0 0; padding: 0; }
  nav a { color: #0b5; text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; }
  th { font-weight: 600; }
  .notice { background: #eefaf1; border-left: 3px solid #0b5; padding: 0.4rem 0.6rem; }
  .notice.error { background: #fdeded; border-left-color: #c0392b; }
  .notice.warn { background: #fdf6e3; border-left-color: #b8860b; }
  .hint { color: #666; font-size: 0.9rem; }
  textarea { width: 100%; font: inherit; }
  .samples { list-style: none; padding: 0; }
  .samples li { border-bottom: 1px solid #eee; padding: 0.6rem 0; }
  .sample-body, .transcript-body p, .draft-body { white-space: pre-wrap; }
  .status { text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.04em; color: #666; }
  .status-done { color: #0b5; }
  .status-running { color: #b8860b; }
  .status-failed { color: #c0392b; }
  .steps { list-style: none; padding: 0; }
  .steps li { border-bottom: 1px solid #eee; padding: 0.5rem 0; }
  .draft { border: 1px solid #eee; padding: 0.6rem 0.8rem; margin: 0.8rem 0; }
  .draft h4 { margin: 0 0 0.3rem; }
  .speakers { list-style: none; padding: 0; }
  .speakers li { padding: 0.2rem 0; }
`;

const NAV = [
  { href: "/", label: "Home" },
  { href: "/sources", label: "Sources" },
  { href: "/runs", label: "Runs" },
  { href: "/fireflies", label: "Fireflies" },
  // Beside Fireflies on purpose: the two integrations are material in, posts out.
  { href: "/zernio", label: "Zernio" },
  { href: "/settings", label: "Settings" },
  { href: "/health", label: "Health" },
];

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <header>
        <h1>Pipeflick</h1>
        <nav>
          <ul>
            {NAV.map((item) => (
              <li>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>{children}</main>
    </body>
  </html>
);
