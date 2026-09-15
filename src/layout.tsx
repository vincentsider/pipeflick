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
  .hint { color: #666; font-size: 0.9rem; }
  textarea { width: 100%; font: inherit; }
  .samples { list-style: none; padding: 0; }
  .samples li { border-bottom: 1px solid #eee; padding: 0.6rem 0; }
  .sample-body, .transcript-body p { white-space: pre-wrap; }
`;

const NAV = [
  { href: "/", label: "Home" },
  { href: "/sources", label: "Sources" },
  { href: "/fireflies", label: "Fireflies" },
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
