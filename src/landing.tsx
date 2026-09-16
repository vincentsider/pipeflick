import { Hono } from "hono";
import type { FC } from "hono/jsx";
import type { AppEnv } from "./access";
import { insertPilotRequest } from "./db";

/**
 * The public landing page.
 *
 * This is the only route in the app that is not behind `requireAccess`, and
 * the exemption is structural rather than a flag: `src/index.tsx` registers
 * this router before `app.use("*", requireAccess)` and these handlers never
 * call `next()`, so the gate is reached by every other path. Nothing here
 * reads D1 except the pilot form's single insert, and nothing reads a secret.
 *
 * Note that Cloudflare Access gates the *hostname* at the edge, so an
 * anonymous visitor is still 302'd to the Access login before the Worker
 * runs. Making this page genuinely public also needs the Access application
 * re-scoped to the app's paths; until then this route is reachable only to a
 * signed-in visitor. See README.
 *
 * Design source: "Pipeflick Landing.dc.html" in the Claude Design project,
 * on the Broadsheet design system. The token block below is copied from that
 * system's styles.css; the interactive draft/quote demo is reproduced with
 * CSS `:has()` rather than the canvas runtime's state, keeping this page in
 * line with the rest of the app (no client-side JavaScript anywhere).
 */

/** Broadsheet tokens and the handful of component classes this page uses. */
const TOKENS = `
:root {
  --color-bg: #f3f2f2;
  --color-surface: #eae9e9;
  --color-text: #201e1d;
  --color-accent: #0088b0;
  --color-divider: color-mix(in srgb, #201e1d 16%, transparent);

  --color-neutral-600: #7d7979;
  --color-neutral-700: #605d5d;
  --color-neutral-800: #444141;
  --color-neutral-900: #2d2b2b;

  --color-accent-100: #e9f8ff;
  --color-accent-200: #cbeeff;
  --color-accent-300: #99e0ff;
  --color-accent-400: #62c5ee;
  --color-accent-600: #1186ac;
  --color-accent-700: #006786;
  --color-accent-800: #004961;
  --color-accent-900: #0a303e;

  --font-heading: "Source Serif 4", Georgia, serif;
  --font-body: "Source Serif 4", Georgia, serif;

  --space-1: 5px;
  --space-2: 10px;
  --space-3: 15px;
  --space-4: 20px;
  --space-6: 30px;

  --radius-sm: 1px;
  --radius-md: 2px;
  --radius-lg: 4px;

  --shadow-sm: 0 1px 2px color-mix(in srgb, #2d2b2b 14%, transparent);
  --shadow-md: 0 3px 10px color-mix(in srgb, #2d2b2b 16%, transparent);
  --shadow-lg: 0 12px 32px color-mix(in srgb, #2d2b2b 22%, transparent);
}

*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
}
img { display: block; max-width: 100%; }
a { color: var(--color-accent-700); text-decoration: none; }
a:hover { color: var(--color-accent-600); text-decoration: underline; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; text-decoration: none;
  font-family: var(--font-heading); font-weight: 600;
  font-size: 14px; line-height: 1.2; color: var(--color-text);
  background: transparent; border: 1px solid transparent;
  padding: var(--space-2) calc(var(--space-3) * 1.2);
  border-radius: var(--radius-md);
}
.btn-primary { background: var(--color-accent); color: var(--color-bg); }
.btn-primary:hover { background: var(--color-accent-600); text-decoration: none; color: var(--color-bg); }
.btn-primary:active { background: var(--color-accent-700); }
.btn-secondary { border-color: var(--color-divider); }
.btn-secondary:hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); text-decoration: none; color: var(--color-text); }

.tag {
  display: inline-flex; align-items: center; font-size: 11px;
  letter-spacing: 0.02em; padding: 3px 10px;
  border-radius: calc(var(--radius-md) * 0.75);
}
.tag-accent { background: var(--color-accent-100); color: var(--color-accent-800); }
`;

/** Page-specific layout, and the CSS that replaces the canvas runtime's state. */
const PAGE_CSS = `
@keyframes pf-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@keyframes pf-drift { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }

.pf-shell { overflow-x: hidden; }
.pf-bound { max-width: 1280px; margin: 0 auto; padding-inline: clamp(18px, 4vw, 44px); }

.pf-header {
  position: sticky; top: 0; z-index: 30;
  backdrop-filter: blur(16px);
  background: color-mix(in srgb, #ffffff 76%, transparent);
  box-shadow: 0 1px 0 var(--color-accent-200);
}
.pf-header-in {
  display: flex; align-items: center; gap: var(--space-4);
  padding-block: var(--space-3);
}
.pf-mark {
  width: 30px; height: 30px; flex: none; border-radius: var(--radius-md);
  background: var(--color-accent-700); color: #fff;
  display: grid; place-items: center;
  font-family: var(--font-heading); font-size: 17px; font-weight: 600;
}
.pf-wordmark { font-family: var(--font-heading); font-weight: 600; font-size: 20px; letter-spacing: -0.01em; }
.pf-nav { margin-left: var(--space-6); display: flex; gap: var(--space-4); flex-wrap: wrap; }
.pf-nav a { font-size: 15px; color: var(--color-neutral-700); }
.pf-header .btn { margin-left: auto; }

.pf-hero {
  background: linear-gradient(170deg, var(--color-accent-200) 0%, var(--color-accent-100) 38%, var(--color-bg) 92%);
  padding-block: clamp(40px, 7vw, 104px) clamp(36px, 5vw, 72px);
}
.pf-hero-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: clamp(30px, 5vw, 64px); align-items: center;
}
.pf-h1 {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(40px, 6.4vw, 86px); line-height: 0.98; letter-spacing: -0.03em;
  margin: var(--space-3) 0 0; max-width: 15ch; text-wrap: balance;
}
.pf-lede {
  font-size: clamp(18px, 2vw, 24px); line-height: 1.45;
  color: var(--color-accent-900); margin: var(--space-4) 0 0;
  max-width: 46ch; text-wrap: pretty;
}
.pf-cta-row { display: flex; gap: var(--space-3); margin-top: var(--space-6); flex-wrap: wrap; }
.pf-cta-row .btn { font-size: 18px; padding: var(--space-3) var(--space-6); }
.pf-note { font-size: 14px; color: var(--color-accent-800); margin: var(--space-4) 0 0; }

.pf-card {
  background: #fff; border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); padding: clamp(20px, 2.6vw, 32px);
}
.pf-card-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
.pf-card-hint { font-size: 13px; color: var(--color-neutral-600); margin-left: auto; }
.pf-draft-title {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(21px, 2.3vw, 30px); line-height: 1.12; letter-spacing: -0.02em;
  margin: 0 0 var(--space-4);
}
.pf-draft-body { font-size: 17px; line-height: 1.6; }
.pf-draft-body p { margin: 0 0 var(--space-3); }

/* The traced lines. Hovering or focusing one swaps the quote card below,
   which the canvas original did with component state. Here the whole demo
   is one container and :has() does it with no script. */
.pf-ln {
  cursor: pointer; border-radius: var(--radius-sm);
  background: var(--color-accent-100);
  box-shadow: inset 0 -2px 0 var(--color-accent-400);
  transition: background .18s ease;
}
.pf-ln:hover, .pf-ln:focus-visible { background: var(--color-accent-200); }
.pf-demo:not(:has(.pf-ln:hover, .pf-ln:focus-visible)) .pf-ln-1 { background: var(--color-accent-200); }
.pf-plain { color: var(--color-neutral-800); }

.pf-quotes { display: grid; margin: calc(var(--space-4) * -1) 0 0 clamp(0px, 3vw, 48px); }
.pf-quote {
  grid-area: 1 / 1;
  background: var(--color-accent-800); color: #fff;
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: var(--space-4);
  animation: pf-drift 7s ease-in-out infinite;
  opacity: 0; transition: opacity .18s ease;
}
.pf-quote-1 { opacity: 1; }
.pf-demo:has(.pf-ln-2:hover, .pf-ln-2:focus-visible) .pf-quote-1,
.pf-demo:has(.pf-ln-3:hover, .pf-ln-3:focus-visible) .pf-quote-1 { opacity: 0; }
.pf-demo:has(.pf-ln-2:hover, .pf-ln-2:focus-visible) .pf-quote-2,
.pf-demo:has(.pf-ln-3:hover, .pf-ln-3:focus-visible) .pf-quote-3 { opacity: 1; }
.pf-quote-kicker {
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  margin: 0; color: var(--color-accent-300);
}
.pf-quote-text { font-size: 18px; line-height: 1.5; font-style: italic; margin: var(--space-2) 0 0; }
.pf-quote-src { font-size: 13px; margin: var(--space-2) 0 0; color: var(--color-accent-200); }

.pf-stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3); margin-top: clamp(34px, 5vw, 70px);
}
.pf-stat { background: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: var(--space-4); }
.pf-stat-v {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(30px, 3.4vw, 44px); line-height: 1; margin: 0; color: var(--color-accent-700);
}
.pf-stat-k { font-size: 15px; line-height: 1.4; color: var(--color-neutral-800); margin: var(--space-2) 0 0; }

.pf-band { position: relative; height: clamp(300px, 42vw, 560px); }
.pf-band-ground {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 90% at 18% 12%, var(--color-accent-400) 0%, transparent 58%),
    linear-gradient(200deg, var(--color-accent-700) 0%, var(--color-accent-900) 76%);
}
.pf-band-ground::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(0,0,0,0.22) 30%, transparent 32%);
  background-size: 3px 3px; mix-blend-mode: multiply;
}
.pf-band img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pf-band-cap {
  position: absolute; left: 0; bottom: 0; width: 100%; pointer-events: none;
  padding: clamp(20px, 4vw, 48px);
  background: linear-gradient(0deg, color-mix(in srgb, var(--color-accent-900) 72%, transparent) 0%, transparent 78%);
}
.pf-band-cap p {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(22px, 3.2vw, 44px); line-height: 1.05; letter-spacing: -0.02em;
  color: #fff; margin: 0; max-width: 24ch;
}

.pf-section { padding-top: clamp(48px, 7vw, 104px); }
.pf-h2 {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(30px, 4.4vw, 58px); line-height: 1.02; letter-spacing: -0.025em;
  margin: var(--space-3) 0 0; max-width: 24ch;
}
.pf-steps {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: var(--space-4); margin-top: clamp(24px, 3.4vw, 44px);
}
.pf-step {
  border-radius: var(--radius-lg); box-shadow: var(--shadow-md);
  padding: clamp(20px, 2.4vw, 30px);
  display: flex; flex-direction: column; gap: var(--space-3); min-height: 260px;
}
.pf-step-n {
  width: 38px; height: 38px; border-radius: var(--radius-md);
  display: grid; place-items: center;
  font-family: var(--font-heading); font-size: 19px; font-weight: 600;
}
.pf-step h3 { font-family: var(--font-heading); font-weight: 600; font-size: 25px; line-height: 1.15; margin: 0; }
.pf-step-body { font-size: 16px; line-height: 1.55; margin: 0; }
.pf-step-meta { margin-top: auto; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; }

.pf-split {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: clamp(28px, 4vw, 60px); align-items: center;
}
.pf-guarantees { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-6); }
.pf-guarantee { display: grid; grid-template-columns: 22px 1fr; gap: var(--space-3); align-items: start; }
.pf-guarantee span:first-child {
  width: 18px; height: 18px; margin-top: 4px; border-radius: 999px;
  background: var(--color-accent-200); box-shadow: inset 0 0 0 4px var(--color-accent-600);
}
.pf-guarantee span:last-child { font-size: 17px; line-height: 1.5; }

.pf-trace { background: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.pf-trace-head { padding: var(--space-4); background: var(--color-accent-100); display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.pf-trace-head p:first-child { font-family: var(--font-heading); font-weight: 600; font-size: 34px; line-height: 1; margin: 0; color: var(--color-accent-800); }
.pf-trace-head p:last-child { font-size: 15px; margin: 0; color: var(--color-accent-800); }
.pf-trace-rows { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.pf-trace-row {
  display: grid; grid-template-columns: 1fr auto; gap: var(--space-3); align-items: center;
  padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-accent-100);
}
.pf-trace-row span:first-child { font-size: 16px; line-height: 1.45; }
.pf-chip {
  font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
  padding: 4px 10px; border-radius: 999px;
  background: var(--color-accent-100); color: var(--color-accent-800);
}
.pf-chip-untraced { background: color-mix(in srgb, var(--color-neutral-900) 8%, transparent); color: var(--color-neutral-800); }

.pf-measures { margin-top: clamp(48px, 7vw, 104px); background: var(--color-accent-900); color: #fff; padding-block: clamp(40px, 6vw, 88px); }
.pf-measures h2 {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(28px, 4vw, 54px); line-height: 1.03; letter-spacing: -0.025em; margin: 0; max-width: 26ch;
}
.pf-measure-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4); margin-top: clamp(26px, 3.4vw, 46px); }
.pf-measure-v { font-family: var(--font-heading); font-weight: 600; font-size: clamp(32px, 4vw, 52px); line-height: 1; margin: 0; color: var(--color-accent-300); }
.pf-measure-k { font-size: 16px; line-height: 1.5; margin: var(--space-2) 0 0; color: var(--color-accent-100); max-width: 30ch; }

.pf-portrait-grid {
  padding-top: clamp(48px, 7vw, 96px);
  display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: clamp(28px, 4vw, 56px); align-items: center;
}
.pf-portrait { position: relative; aspect-ratio: 4 / 5; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg); }
.pf-portrait img { width: 100%; height: 100%; object-fit: cover; }
.pf-pull {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(24px, 3.4vw, 44px); line-height: 1.16; letter-spacing: -0.02em;
  margin: 0; max-width: 30ch; font-style: italic;
}
.pf-pull-src { font-size: 16px; color: var(--color-neutral-700); margin: var(--space-4) 0 0; }

.pf-pilot { margin-top: clamp(48px, 7vw, 104px); }
.pf-pilot-inner {
  background: linear-gradient(140deg, var(--color-accent-700), var(--color-accent-900));
  color: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: clamp(28px, 4.6vw, 64px);
  display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: clamp(24px, 4vw, 56px); align-items: center;
}
.pf-pilot h2 {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(28px, 4.2vw, 56px); line-height: 1.02; letter-spacing: -0.025em; margin: 0; max-width: 20ch;
}
.pf-pilot-lede { font-size: 18px; line-height: 1.5; color: var(--color-accent-100); margin: var(--space-4) 0 0; max-width: 42ch; }
.pf-form {
  background: color-mix(in srgb, #ffffff 12%, transparent);
  border-radius: var(--radius-lg); padding: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-3);
}
.pf-form label { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-accent-200); }
.pf-form input {
  font-family: var(--font-body); font-size: 17px; padding: var(--space-3);
  border-radius: var(--radius-md); border: 1px solid var(--color-accent-400);
  background: color-mix(in srgb, #ffffff 92%, transparent); color: var(--color-accent-900);
  width: 100%;
}
.pf-form button {
  all: unset; cursor: pointer; text-align: center;
  font-family: var(--font-body); font-size: 18px;
  padding: var(--space-3) var(--space-6); border-radius: var(--radius-md);
  background: #fff; color: var(--color-accent-800);
}
.pf-form button:hover { background: var(--color-accent-200); }
.pf-form-note { font-size: 14px; color: var(--color-accent-100); margin: 0; }

.pf-footer {
  padding-block: clamp(32px, 4vw, 56px);
  display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap;
}
.pf-footer-brand { font-family: var(--font-heading); font-weight: 600; font-size: 17px; }

/* At phone width the brand, three section links and the CTA cannot share a
   row without wrapping into a three-line header. The links point at sections
   the reader is about to scroll through anyway, so they give way first and
   the one thing worth tapping keeps its place. */
@media (max-width: 640px) {
  .pf-nav { display: none; }
  .pf-header-in { gap: var(--space-2); }
}

@media (prefers-reduced-motion: reduce) {
  .pf-rise, .pf-quote { animation: none !important; }
  .pf-quote { transition: none; }
}
`;

/**
 * The wordmark as a favicon, inline so the page costs no extra request and
 * the Worker needs no asset route. Matches the header's accent-700 square.
 */
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="2" fill="#006786"/>' +
      '<text x="16" y="23" font-family="Georgia,serif" font-size="21" font-weight="600" ' +
      'fill="#ffffff" text-anchor="middle">P</text></svg>',
  );

/**
 * The demo the hero runs on: a draft sentence beside the transcript line it
 * came from. `quote` is what the executive actually said; `text` is what the
 * model wrote from it. The last line is unhighlighted on purpose — it is the
 * one the check could not trace, which is the point the page is making.
 */
const DEMO_LINES = [
  {
    text: "Ghostwriters cost £30k to £40k a year, and they still need an hour of your time every week to sound like you.",
    quote:
      "A ghostwriter is thirty to forty grand a year and they still need an hour of my time a week to get anything out of me.",
    time: "00:14:22",
  },
  {
    text: "The expensive part was never the writing. It was getting the thinking out of the person who has it.",
    quote:
      "The expensive bit isn't the writing. It's getting the thinking out of the head of the person who actually has it.",
    time: "00:15:03",
  },
  {
    text: "I already say the useful thing three times a week — in client calls, in board updates, on stage.",
    quote:
      "I say the useful thing three times a week already, in client calls and board updates and on stage at Digital Jersey.",
    time: "00:16:41",
  },
] as const;

const DEMO_PLAIN = "It just dies in the recording.";
const DEMO_SOURCE = "Digital Jersey — AI in professional services · only your lines were stored";

const STATS = [
  { v: "3", k: "drafts from one meeting, every week" },
  { v: "1 hr", k: "of your time a week, not eight" },
  { v: "£40k", k: "a year a ghostwriter would cost" },
  { v: "0", k: "posts published without your yes" },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Point it at what you already said",
    body: "A Fireflies transcript comes in and every other speaker is dropped at import. Only your lines are kept, and only your lines reach the model.",
    meta: "Transcript · voice samples",
    style: "background:#fff;color:var(--color-text)",
    bodyStyle: "color:var(--color-neutral-800)",
    metaStyle: "color:var(--color-neutral-600)",
    numStyle: "background:var(--color-accent-100);color:var(--color-accent-800)",
  },
  {
    n: "2",
    title: "Borrow the format, not the content",
    body: "Paste two posts that over-performed in your market. Their structure is extracted — hook, shape, angle — and filled entirely with your own material.",
    meta: "Outliers · one run, three drafts",
    style: "background:var(--color-accent-100);color:var(--color-accent-900)",
    bodyStyle: "color:var(--color-accent-800)",
    metaStyle: "color:var(--color-accent-700)",
    numStyle: "background:var(--color-accent-700);color:#fff",
  },
  {
    n: "3",
    title: "Read it, then decide",
    body: "Accept, edit or reject each draft. Accepted posts land in Zernio as unscheduled drafts. Every decision is recorded, so in four weeks you know whether it works.",
    meta: "Approval · Zernio handoff",
    style: "background:var(--color-accent-800);color:#fff",
    bodyStyle: "color:var(--color-accent-100)",
    metaStyle: "color:var(--color-accent-300)",
    numStyle: "background:#fff;color:var(--color-accent-800)",
  },
] as const;

const GUARANTEES = [
  "Other speakers are dropped before anything is stored.",
  "Transcript coverage is recorded per run, so a thin draft is explainable.",
  "Untraced lines are marked, not quietly published.",
  "Nothing posts automatically — approval is a human step, every time.",
] as const;

const TRACE_ROWS = [
  { line: "Ghostwriters cost £30k to £40k a year…", mark: "00:14:22", traced: true },
  { line: "It was getting the thinking out of the person who has it.", mark: "00:15:03", traced: true },
  { line: "It reads what I already said and hands back three drafts.", mark: "00:22:10", traced: true },
  { line: "An hour a week instead of eight, and it is unmistakably mine.", mark: "not traced", traced: false },
] as const;

const MEASURES = [
  { v: "≤ 1 hr", k: "of the executive's time per week, start to scheduled" },
  { v: "3 / week", k: "drafts good enough to accept with light edits" },
  { v: "4 weeks", k: "before the decision log is reviewed together" },
] as const;

/**
 * A photograph area. The design carries two `<image-slot>` drop zones, which
 * are a canvas authoring affordance rather than something to ship. Passing a
 * `src` renders the photograph; without one the area falls back to the
 * system's own ink-on-paper ground, which is a finished treatment rather than
 * an empty box. Swapping a real photograph in is a one-line change.
 */
const Photo: FC<{ src?: string; alt?: string; className?: string }> = ({ src, alt, className }) =>
  src ? (
    <img src={src} alt={alt ?? ""} class={className} />
  ) : (
    <div class={`pf-band-ground ${className ?? ""}`} role="presentation" />
  );

const LandingPage: FC<{ sent: boolean; error?: string }> = ({ sent, error }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Pipeflick — you already said it</title>
      <meta
        name="description"
        content="Pipeflick turns the meetings you already speak in into LinkedIn posts in your own words. Three drafts a week, every line traceable, nothing published without your yes."
      />
      <link rel="icon" href={FAVICON} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: TOKENS + PAGE_CSS }} />
    </head>
    <body>
      <div class="pf-shell">
        <header class="pf-header">
          <div class="pf-bound pf-header-in">
            <span class="pf-mark" aria-hidden="true">
              P
            </span>
            <span class="pf-wordmark">Pipeflick</span>
            <nav class="pf-nav">
              <a href="#how">How it works</a>
              <a href="#grounding">Grounding</a>
              <a href="#pilot">Pilot</a>
            </nav>
            <a href="#pilot" class="btn btn-primary">
              Request the pilot
            </a>
          </div>
        </header>

        <section class="pf-hero">
          <div class="pf-bound pf-hero-grid">
            <div class="pf-rise" style="animation:pf-rise .5s ease both">
              <span class="tag tag-accent" style="font-size:12px">
                Ghostwriting, without the ghost
              </span>
              <h1 class="pf-h1">You already said it.</h1>
              <p class="pf-lede">
                Pipeflick turns the meetings you already speak in into LinkedIn posts in your own
                words — three drafts a week, every line traceable to something you actually said,
                nothing published without your yes.
              </p>
              <div class="pf-cta-row">
                <a href="#pilot" class="btn btn-primary">
                  Request the pilot
                </a>
                <a href="#grounding" class="btn btn-secondary">
                  See how it proves itself
                </a>
              </div>
              <p class="pf-note">Built for one executive first. Jersey, week three of the pilot.</p>
            </div>

            <div class="pf-demo pf-rise" style="animation:pf-rise .7s ease both;position:relative">
              <div class="pf-card">
                <div class="pf-card-head">
                  <span class="tag tag-accent">Draft 1 of 3</span>
                  <span class="pf-card-hint">Hover a highlighted line</span>
                </div>
                <p class="pf-draft-title">
                  Ghostwriters cost £40k a year. The blank page costs more.
                </p>
                <div class="pf-draft-body">
                  {DEMO_LINES.map((ln, i) => (
                    <p>
                      <span class={`pf-ln pf-ln-${i + 1}`} tabindex={0}>
                        {ln.text}
                      </span>
                    </p>
                  ))}
                  <p>
                    <span class="pf-plain">{DEMO_PLAIN}</span>
                  </p>
                </div>
              </div>

              <div class="pf-quotes">
                {DEMO_LINES.map((ln, i) => (
                  <figure class={`pf-quote pf-quote-${i + 1}`}>
                    <p class="pf-quote-kicker">Your words · {ln.time}</p>
                    <blockquote class="pf-quote-text" style="margin:var(--space-2) 0 0">
                      {ln.quote}
                    </blockquote>
                    <figcaption class="pf-quote-src">{DEMO_SOURCE}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>

          <div class="pf-bound pf-stats">
            {STATS.map((st) => (
              <div class="pf-stat">
                <p class="pf-stat-v">{st.v}</p>
                <p class="pf-stat-k">{st.k}</p>
              </div>
            ))}
          </div>
        </section>

        <section class="pf-band">
          <Photo alt="" />
          <div class="pf-band-cap">
            <div class="pf-bound">
              <p>Forty-eight minutes on stage. Six hundred lines of your own thinking.</p>
            </div>
          </div>
        </section>

        <section id="how" class="pf-bound pf-section">
          <span class="tag tag-accent" style="font-size:12px">
            How it works
          </span>
          <h2 class="pf-h2">Three steps, one of them yours.</h2>
          <div class="pf-steps">
            {STEPS.map((s) => (
              <div class="pf-step" style={s.style}>
                <span class="pf-step-n" style={s.numStyle}>
                  {s.n}
                </span>
                <h3>{s.title}</h3>
                <p class="pf-step-body" style={s.bodyStyle}>
                  {s.body}
                </p>
                <span class="pf-step-meta" style={s.metaStyle}>
                  {s.meta}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="grounding" class="pf-bound pf-section">
          <div class="pf-split">
            <div>
              <span class="tag tag-accent" style="font-size:12px">
                Grounding
              </span>
              <h2 class="pf-h2" style="max-width:22ch">
                Every claim carries its receipt.
              </h2>
              <p
                class="pf-lede"
                style="font-size:19px;color:var(--color-neutral-800);max-width:48ch"
              >
                Other tools ask you to trust the output. Pipeflick shows its work: each substantive
                sentence is checked against your transcript, and the line it came from is one hover
                away. Anything the model wrote unaided is marked, not hidden.
              </p>
              <div class="pf-guarantees">
                {GUARANTEES.map((g) => (
                  <div class="pf-guarantee">
                    <span aria-hidden="true" />
                    <span>{g}</span>
                  </div>
                ))}
              </div>
            </div>

            <div class="pf-trace">
              <div class="pf-trace-head">
                <p>9 of 10</p>
                <p>lines traced to your own words</p>
              </div>
              <div class="pf-trace-rows">
                {TRACE_ROWS.map((r) => (
                  <div class="pf-trace-row">
                    <span>{r.line}</span>
                    <span class={r.traced ? "pf-chip" : "pf-chip pf-chip-untraced"}>{r.mark}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section class="pf-measures">
          <div class="pf-bound">
            <h2>What the pilot is actually measuring.</h2>
            <div class="pf-measure-grid">
              {MEASURES.map((m) => (
                <div>
                  <p class="pf-measure-v">{m.v}</p>
                  <p class="pf-measure-k">{m.k}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section class="pf-bound pf-portrait-grid">
          <div class="pf-portrait">
            <Photo alt="" />
          </div>
          <div>
            <p class="pf-pull">
              “I say the useful thing three times a week already. It just dies in the recording.”
            </p>
            <p class="pf-pull-src">Pilot user, professional services · Jersey</p>
          </div>
        </section>

        <section id="pilot" class="pf-bound pf-pilot">
          <div class="pf-pilot-inner">
            <div>
              <h2>An hour a week, in your own voice.</h2>
              <p class="pf-pilot-lede">
                The pilot runs with one transcript source, two outlier formats and your approval on
                every post. Four weeks, then we look at the numbers together.
              </p>
            </div>
            <form class="pf-form" method="post" action="/pilot">
              <label for="pilot-email">Work email</label>
              <input
                id="pilot-email"
                name="email"
                type="email"
                required
                maxlength={MAX_EMAIL_CHARS}
                placeholder="you@firm.com"
                autocomplete="email"
              />
              <button type="submit">{sent ? "Request sent" : "Request the pilot"}</button>
              <p class="pf-form-note">
                {error
                  ? error
                  : sent
                    ? "Thanks — you'll hear back with a transcript checklist."
                    : "One transcript and two outlier posts is all the setup needs."}
              </p>
            </form>
          </div>
        </section>

        <footer class="pf-bound pf-footer">
          <span class="pf-footer-brand">Pipeflick</span>
          <span style="font-size:14px;color:var(--color-neutral-700)">Drafts, never autopilot.</span>
          <span style="margin-left:auto;font-size:14px;color:var(--color-neutral-600)">© 2026</span>
        </footer>
      </div>
    </body>
  </html>
);

/**
 * LinkedIn-style ceiling on a stored address. Deliberately short: this is the
 * only unauthenticated write in the app, so the row it can create is capped
 * before it reaches D1.
 */
export const MAX_EMAIL_CHARS = 254;

/** Shape check only. Deliverability is not this route's business. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const landing = new Hono<AppEnv>();

landing.get("/", (c) =>
  c.html(<LandingPage sent={c.req.query("sent") === "1"} />),
);

landing.post("/pilot", async (c) => {
  const form = await c.req.formData();
  const email = String(form.get("email") ?? "").trim();

  if (!email || email.length > MAX_EMAIL_CHARS || !EMAIL_PATTERN.test(email)) {
    // Re-render rather than redirect so the message sits with the field.
    return c.html(<LandingPage sent={false} error="That does not look like an email address." />, 400);
  }

  await insertPilotRequest(c.env.DB, email);
  // 303 so a refresh does not resubmit, matching every other form in the app.
  return c.redirect("/?sent=1#pilot", 303);
});
