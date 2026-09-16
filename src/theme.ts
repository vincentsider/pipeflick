/**
 * The Broadsheet design system, as the product UI uses it.
 *
 * Token values come from the design handoff's tables (design/README.md) and
 * from the system's own styles.css. They are the single source of truth for
 * colour, type, spacing, radius and shadow across the whole app — the landing
 * page and every gated screen.
 *
 * Three blocks, concatenated by `ALL_CSS`:
 *
 *   TOKENS     `:root` custom properties and the derived surfaces.
 *   COMPONENTS the design system's own classes: .btn, .tag, and the app shell.
 *   APP        the utility classes the existing screens already use (.notice,
 *              .hint, tables, .draft, .status-*). These are restyled, never
 *              renamed: seven pages render through them, and renaming would
 *              have meant touching all seven to change how three of them look.
 *
 * Source Serif 4 everywhere, headings and body, per the handoff — no sans
 * anywhere including UI chrome.
 */

/** Colour, type, spacing, radius and shadow. The handoff's tables, verbatim. */
export const TOKENS = `
:root {
  --color-bg: #f3f2f2;
  --color-text: #201e1d;

  --color-neutral-600: #7d7979;
  --color-neutral-700: #605d5d;
  --color-neutral-800: #444141;
  --color-neutral-900: #2d2b2b;

  --color-accent-100: #e9f8ff;
  --color-accent-200: #cbeeff;
  --color-accent-300: #99e0ff;
  --color-accent-400: #62c5ee;
  --color-accent-500: #38a6cf;
  --color-accent-600: #1186ac;
  --color-accent-700: #006786;
  --color-accent-800: #004961;
  --color-accent-900: #0a303e;

  /* Derived surfaces. These read cooler than the warm neutrals, which is the
     point — the handoff calls them out separately for that reason. */
  --surface-card: color-mix(in srgb, var(--color-accent-100) 34%, #ffffff);
  --surface-input: color-mix(in srgb, var(--color-accent-100) 55%, #ffffff);
  --surface-untraced: color-mix(in srgb, var(--color-neutral-900) 8%, transparent);
  --surface-untraced-hover: color-mix(in srgb, var(--color-neutral-900) 14%, transparent);

  --font-heading: "Source Serif 4", Georgia, serif;
  --font-body: "Source Serif 4", Georgia, serif;

  --space-1: 5px;
  --space-2: 10px;
  --space-3: 15px;
  --space-4: 20px;
  --space-6: 30px;
  --space-8: 40px;

  --radius-sm: 1px;
  --radius-md: 2px;
  --radius-lg: 4px;

  --shadow-sm: 0 1px 2px rgba(45, 43, 43, .14);
  --shadow-md: 0 3px 10px rgba(45, 43, 43, .16);
  --shadow-lg: 0 12px 32px rgba(45, 43, 43, .22);
}

@keyframes pf-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes pf-pulse { 0%, 100% { opacity: .3 } 50% { opacity: 1 } }
`;

/** Reset, typography, the design system's components, and the app shell. */
export const COMPONENTS = `
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  /* The page ground is mostly overlaid by the blue wash, per the handoff. */
  background: linear-gradient(180deg, var(--color-accent-100) 0%, var(--color-bg) 460px);
  background-attachment: fixed;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  min-height: 100vh;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading); font-weight: 600;
  line-height: 1.12; letter-spacing: -0.015em; margin: 0 0 var(--space-2);
}
p { margin: 0 0 var(--space-3); }
img { display: block; max-width: 100%; }
a { color: var(--color-accent-700); text-decoration: none; }
a:hover { color: var(--color-accent-600); text-decoration: underline; }

/* Themed focus ring on every interactive element — never the browser default. */
:focus { outline: none; }
:focus-visible { outline: 2px solid #0088b0; outline-offset: 2px; }

/* --- buttons --- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; text-decoration: none;
  font-family: var(--font-heading); font-weight: 600;
  font-size: 14px; line-height: 1.2; color: var(--color-text);
  background: transparent; border: 1px solid transparent;
  padding: var(--space-2) calc(var(--space-3) * 1.2);
  border-radius: var(--radius-md);
  transition: background .18s ease, color .18s ease;
}
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-primary { background: var(--color-accent-700); color: var(--surface-card); }
.btn-primary:hover { background: var(--color-accent-600); color: var(--surface-card); text-decoration: none; }
.btn-primary:active { background: var(--color-accent-800); }
.btn-secondary { border-color: var(--color-accent-300); background: var(--surface-card); }
.btn-secondary:hover { background: var(--color-accent-100); color: var(--color-text); text-decoration: none; }
.btn-ghost { color: var(--color-accent-700); padding-inline: var(--space-2); }
.btn-ghost:hover { background: color-mix(in srgb, var(--color-accent-700) 10%, transparent); text-decoration: none; }
.btn-lg { font-size: 17px; padding: var(--space-3) var(--space-6); }
.btn-danger { color: var(--color-neutral-800); }
.btn-danger:hover { background: var(--surface-untraced); color: var(--color-neutral-900); text-decoration: none; }

/* Any button the older screens render without a class still belongs to the
   system. Cheaper and safer than editing seven files to add a class, and it
   means a new bare button can never look like a browser default. */
button:not([class]), input[type="submit"]:not([class]) {
  font-family: var(--font-heading); font-weight: 600; font-size: 14px; line-height: 1.2;
  color: var(--color-text); cursor: pointer;
  background: var(--surface-card); border: 1px solid var(--color-accent-300);
  padding: var(--space-2) calc(var(--space-3) * 1.2); border-radius: var(--radius-md);
  transition: background .18s ease, color .18s ease;
}
button:not([class]):hover, input[type="submit"]:not([class]):hover { background: var(--color-accent-100); }
button:not([class]):disabled { opacity: .45; cursor: not-allowed; }

/* --- tags --- */
.tag {
  display: inline-flex; align-items: center; font-size: 11px;
  letter-spacing: .02em; padding: 3px 10px; border-radius: 1.5px;
  white-space: nowrap;
}
.tag-accent { background: var(--color-accent-100); color: var(--color-accent-800); }
.tag-neutral { background: var(--surface-untraced); color: var(--color-neutral-800); }
.tag-12 { font-size: 12px; }

/* --- app shell --- */
.pf-header {
  position: sticky; top: 0; z-index: 20;
  backdrop-filter: blur(14px);
  background: color-mix(in srgb, var(--surface-card) 82%, transparent);
  box-shadow: var(--shadow-sm);
}
.pf-header-in {
  max-width: 1320px; margin: 0 auto;
  padding: var(--space-3) clamp(18px, 4vw, 44px);
  display: flex; align-items: center; gap: var(--space-6); flex-wrap: wrap;
}
.pf-brand { display: flex; align-items: center; gap: var(--space-3); }
.pf-mark {
  width: 30px; height: 30px; flex: none; border-radius: var(--radius-md);
  background: var(--color-accent-700); color: var(--surface-card);
  display: grid; place-items: center;
  font-family: var(--font-heading); font-size: 17px; font-weight: 600;
}
.pf-wordmark { font-family: var(--font-heading); font-weight: 600; font-size: 20px; letter-spacing: -0.01em; }

.pf-tabs {
  display: flex; gap: var(--space-1); padding: 4px;
  border-radius: var(--radius-lg); background: var(--color-accent-100);
  flex-wrap: wrap;
}
.pf-tab {
  font-family: var(--font-body); font-size: 15px;
  padding: 7px var(--space-4); border-radius: var(--radius-md);
  color: var(--color-neutral-700); background: transparent; box-shadow: none;
  text-decoration: none; white-space: nowrap;
  transition: background .18s ease, color .18s ease;
}
.pf-tab:hover { color: var(--color-accent-700); text-decoration: none; }
.pf-tab[aria-current="page"] {
  background: var(--surface-card); color: var(--color-accent-800); box-shadow: var(--shadow-sm);
}
.pf-meta { margin-left: auto; display: flex; align-items: center; gap: var(--space-4); }
.pf-crumb { font-size: 14px; color: var(--color-neutral-700); }
.pf-avatar {
  width: 32px; height: 32px; flex: none; border-radius: 999px;
  background: var(--color-accent-200); color: var(--color-accent-800);
  display: grid; place-items: center; font-size: 14px;
}

.pf-main {
  max-width: 1320px; margin: 0 auto;
  padding: clamp(28px, 4vw, 52px) clamp(18px, 4vw, 44px) 120px;
  animation: pf-rise .4s ease both;
}

/* --- surfaces --- */
.pf-card {
  background: var(--surface-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: var(--space-4);
}
.pf-card-sm { box-shadow: var(--shadow-sm); }
.pf-card-lg { box-shadow: var(--shadow-lg); }
.pf-panel {
  background: var(--color-accent-700); color: var(--surface-card);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: var(--space-4);
}
.pf-panel .pf-kicker { color: var(--color-accent-200); }
.pf-kicker { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; margin: 0; }
.pf-figure { font-family: var(--font-heading); font-weight: 600; line-height: 1; margin: var(--space-2) 0 0; }

/* --- forms --- */
input[type="text"], input[type="email"], input[type="number"], select, textarea {
  width: 100%; font-family: var(--font-body); font-size: 16px; line-height: 1.5;
  color: var(--color-text); background: var(--surface-input);
  border: 1px solid var(--color-accent-200); border-radius: var(--radius-md);
  padding: var(--space-3); resize: vertical;
}
textarea::placeholder, input::placeholder { color: var(--color-neutral-600); opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .pf-main, [style*="pf-rise"] { animation: none !important; }
  * { transition-duration: .01ms !important; }
}
`;

/**
 * The classes the existing screens already render through. Restyled onto the
 * Broadsheet tokens, with the same names and the same meanings, so no screen
 * had to change to be restyled.
 */
export const APP = `
.notice {
  background: var(--color-accent-100); color: var(--color-accent-800);
  border-left: 3px solid var(--color-accent-600);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}
.notice.error {
  background: var(--surface-untraced); color: var(--color-neutral-900);
  border-left-color: var(--color-neutral-700);
}
.notice.warn {
  background: var(--color-accent-100); color: var(--color-accent-900);
  border-left-color: var(--color-accent-400);
}
.hint { color: var(--color-neutral-700); font-size: 13px; }

table { width: 100%; border-collapse: collapse; font-size: 15px; }
th {
  text-align: left; font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--color-neutral-600); font-weight: 400;
  padding: var(--space-2); border-bottom: 1px solid var(--color-accent-200);
}
td { padding: var(--space-2); border-bottom: 1px solid var(--color-accent-100); }
tbody tr:hover { background: var(--color-accent-100); }

.samples { list-style: none; padding: 0; margin: 0; }
.samples li { border-bottom: 1px solid var(--color-accent-100); padding: var(--space-3) 0; }
.sample-body, .transcript-body p, .draft-body { white-space: pre-wrap; }

.status { text-transform: uppercase; font-size: 12px; letter-spacing: .04em; color: var(--color-neutral-700); }
.status-done { color: var(--color-accent-700); }
.status-running { color: var(--color-accent-600); }
.status-failed { color: var(--color-neutral-900); }

.steps { list-style: none; padding: 0; margin: 0; }
.steps li { border-bottom: 1px solid var(--color-accent-100); padding: var(--space-3) 0; }

.draft {
  background: var(--surface-card); border: 0; border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: var(--space-4); margin: var(--space-4) 0;
}
.draft h4 { margin: 0 0 var(--space-2); font-size: 20px; }
.speakers { list-style: none; padding: 0; margin: 0; }
.speakers li { padding: var(--space-1) 0; }
`;

/** Screen layouts from the handoff. Every grid collapses; nothing is fixed-width. */
export const SCREENS = `
/* --- shared screen furniture --- */
.pf-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: clamp(24px, 4vw, 56px);
  align-items: end;
}
.pf-h1 {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(38px, 5.4vw, 68px); line-height: 1; letter-spacing: -0.025em;
  margin: var(--space-3) 0 0; max-width: 18ch; text-wrap: balance;
}
.pf-lede {
  font-size: 20px; line-height: 1.5; max-width: 50ch;
  margin: var(--space-4) 0 0; color: var(--color-neutral-800); text-wrap: pretty;
}
.pf-plates { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.pf-plate {
  background: var(--surface-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm); padding: var(--space-3);
}
.pf-plate-v { font-family: var(--font-heading); font-weight: 600; font-size: 30px; line-height: 1; margin: 0; color: var(--color-accent-700); }
.pf-plate-k { font-size: 13px; line-height: 1.35; color: var(--color-neutral-700); margin: var(--space-2) 0 0; }

.pf-cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: var(--space-4); margin-top: clamp(28px, 4vw, 48px);
}
.pf-cards > * { display: flex; flex-direction: column; gap: var(--space-3); }
.pf-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.pf-card-head h2 { font-family: var(--font-heading); font-weight: 600; font-size: 23px; margin: 0; }
.pf-card-body { font-size: 15px; line-height: 1.45; color: var(--color-neutral-700); margin: 0; }
.pf-tint { background: var(--color-accent-100); color: var(--color-accent-800); }
.pf-tint .pf-card-body { color: var(--color-accent-800); }

/* --- transcript picker (radio list) --- */
.pf-picker { display: flex; flex-direction: column; gap: var(--space-2); margin: 0; border: 0; padding: 0; }
.pf-picker legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.pf-pick {
  display: grid; grid-template-columns: 16px 1fr; gap: var(--space-3);
  padding: var(--space-3); border-radius: var(--radius-md); cursor: pointer;
  background: var(--surface-input); box-shadow: inset 0 0 0 1px var(--color-accent-100);
  transition: background .18s ease;
}
.pf-pick:hover { background: var(--color-accent-100); }
.pf-pick input { position: absolute; opacity: 0; width: 0; height: 0; }
.pf-dot {
  width: 12px; height: 12px; border-radius: 999px; margin-top: 6px;
  background: transparent; box-shadow: inset 0 0 0 1px var(--color-accent-500);
}
.pf-pick:has(input:checked) { background: var(--color-accent-100); box-shadow: inset 0 0 0 1px var(--color-accent-300); }
.pf-pick:has(input:checked) .pf-dot { background: var(--color-accent-600); }
.pf-pick:has(input:focus-visible) { outline: 2px solid #0088b0; outline-offset: 2px; }
.pf-pick-title { display: block; font-size: 17px; line-height: 1.3; }
.pf-pick-meta { display: block; font-size: 13px; color: var(--color-neutral-600); margin-top: 4px; }

/* --- outliers --- */
.pf-outlier {
  background: var(--surface-card); border-radius: var(--radius-md);
  padding: var(--space-3); display: grid; grid-template-columns: 26px 1fr; gap: var(--space-3);
}
.pf-letter {
  width: 24px; height: 24px; border-radius: var(--radius-sm);
  background: var(--color-accent-700); color: var(--surface-card);
  display: grid; place-items: center; font-family: var(--font-heading); font-size: 14px;
}
.pf-outlier textarea {
  font-size: 15px; line-height: 1.5; background: transparent;
  border: 0; padding: 0; border-radius: 0;
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
.pf-outlier-status { display: block; font-size: 12px; color: var(--color-neutral-600); margin-top: var(--space-2); }
/* Live per-row feedback with no script: :placeholder-shown is empty-or-not. */
.pf-outlier .pf-when-filled { display: none; }
.pf-outlier:has(textarea:not(:placeholder-shown)) .pf-when-filled { display: block; }
.pf-outlier:has(textarea:not(:placeholder-shown)) .pf-when-empty { display: none; }

/* --- footer CTA bar --- */
.pf-cta {
  margin-top: var(--space-6); background: var(--color-accent-800);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  padding: var(--space-4) var(--space-6);
  display: flex; align-items: center; gap: var(--space-6); flex-wrap: wrap;
}
.pf-cta-title { font-family: var(--font-heading); font-weight: 600; font-size: 26px; margin: 0; color: var(--surface-card); }
.pf-cta-sub { font-size: 15px; margin: var(--space-1) 0 0; color: var(--color-accent-200); }
.pf-cta-btn {
  margin-left: auto; font-family: var(--font-body); font-size: 18px;
  padding: var(--space-3) var(--space-6); border-radius: var(--radius-md);
  background: var(--surface-card); color: var(--color-accent-800);
  border: 0; cursor: pointer; transition: background .18s ease;
}
.pf-cta-btn:hover { background: var(--color-accent-200); }
.pf-cta-btn:disabled { opacity: .5; cursor: not-allowed; }

/* --- Run screen --- */
.pf-split {
  display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.8fr);
  gap: clamp(24px, 4vw, 48px); align-items: start;
}
.pf-h1-run {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(34px, 4.6vw, 56px); line-height: 1; letter-spacing: -0.025em;
  margin: var(--space-3) 0 0;
}
.pf-sub { font-size: 18px; line-height: 1.5; color: var(--color-neutral-800); margin: var(--space-3) 0 0; max-width: 52ch; }

.pf-steps-card {
  margin-top: var(--space-6); background: var(--surface-card);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden;
}
.pf-track { height: 6px; background: var(--color-accent-100); }
.pf-fill { height: 6px; background: var(--color-accent-500); transition: width .6s ease; }
.pf-steps-body { padding: var(--space-2) var(--space-4) var(--space-4); }
.pf-step-row {
  display: grid; grid-template-columns: 22px 110px 1fr auto;
  gap: var(--space-3); align-items: center;
  padding: var(--space-3) 0; border-bottom: 1px solid var(--color-accent-100);
}
.pf-step-row:last-child { border-bottom: 0; }
.pf-step-dot {
  width: 18px; height: 18px; border-radius: 999px;
  background: transparent; box-shadow: inset 0 0 0 1px var(--color-accent-400);
}
.pf-step-dot.is-done { background: var(--color-accent-600); }
.pf-step-dot.is-working { background: var(--color-accent-300); animation: pf-pulse 1s ease-in-out infinite; }
.pf-step-dot.is-failed { background: var(--color-neutral-700); box-shadow: inset 0 0 0 1px var(--color-neutral-700); }
.pf-step-phase { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--color-neutral-600); }
.pf-step-label { font-size: 17px; line-height: 1.35; }
.pf-chip {
  font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
  padding: 3px 10px; border-radius: 999px; white-space: nowrap;
  background: var(--color-accent-100); color: var(--color-neutral-700);
}
.pf-chip.is-done { color: var(--color-accent-800); }
.pf-chip.is-working { background: var(--color-accent-200); color: var(--color-accent-800); }
.pf-chip.is-failed { background: var(--surface-untraced); color: var(--color-neutral-900); }

.pf-facts { display: flex; flex-direction: column; gap: var(--space-2); }
.pf-fact { display: flex; justify-content: space-between; gap: var(--space-3); font-size: 15px; padding: var(--space-1) 0; }
.pf-fact-k { color: var(--color-neutral-700); }
.pf-aside { display: flex; flex-direction: column; gap: var(--space-3); }

/* --- Approve screen --- */
.pf-approve-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.pf-pager { display: flex; gap: var(--space-1); padding: 4px; border-radius: var(--radius-lg); background: var(--color-accent-100); }
.pf-page {
  font-family: var(--font-heading); font-size: 15px; min-width: 32px; height: 32px;
  display: grid; place-items: center; border-radius: var(--radius-md);
  background: transparent; color: var(--color-neutral-700); text-decoration: none;
  transition: background .18s ease, color .18s ease;
}
.pf-page:hover { color: var(--color-accent-700); text-decoration: none; }
.pf-page[aria-current="page"] { background: var(--surface-card); color: var(--color-accent-800); box-shadow: var(--shadow-sm); }

.pf-approve {
  display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.85fr);
  gap: clamp(24px, 3.4vw, 44px); margin-top: var(--space-4); align-items: start;
}
.pf-draft-card {
  background: var(--surface-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); overflow: hidden;
}
.pf-draft-meta {
  padding: var(--space-4) clamp(20px, 3vw, 40px) 0;
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
}
.pf-draft-hint { margin-left: auto; font-size: 13px; color: var(--color-neutral-600); }
.pf-draft-hook {
  font-family: var(--font-heading); font-weight: 600;
  font-size: clamp(28px, 3.1vw, 40px); line-height: 1.08; letter-spacing: -0.02em;
  margin: var(--space-3) 0 0; padding: 0 clamp(20px, 3vw, 40px); max-width: 28ch;
}
.pf-draft-body {
  font-size: 20px; line-height: 1.62;
  padding: var(--space-4) clamp(20px, 3vw, 40px) 0; max-width: 62ch;
}
.pf-draft-body p { margin: 0 0 var(--space-4); text-wrap: pretty; }
.pf-edit { padding: var(--space-4) clamp(20px, 3vw, 40px) 0; }
.pf-edit textarea { font-size: 19px; line-height: 1.6; background: var(--color-accent-100); border-color: var(--color-accent-300); padding: var(--space-4); }

/* Sentence marks. Buttons, so a tap focuses one and the citation follows on
   touch as well as hover — the handoff asks for both. */
.pf-seg {
  /* inline, not inline-block: a sentence has to flow and wrap inside its
     paragraph like text, not sit on a line of its own. */
  display: inline;
  font: inherit; color: inherit; text-align: left;
  border: 0; padding: 0; margin: 0; background: transparent;
  border-radius: var(--radius-sm); cursor: pointer;
}
.pf-seg-traced { background: var(--color-accent-100); box-shadow: inset 0 -2px 0 var(--color-accent-400); transition: background .15s ease; }
.pf-seg-traced:hover { background: var(--color-accent-200); }
/* Untraced stays full-strength ink: it must be marked AND legible. */
.pf-seg-untraced { background: var(--surface-untraced); color: var(--color-text); box-shadow: inset 0 -2px 0 var(--color-neutral-700); transition: background .15s ease; }
.pf-seg-untraced:hover { background: var(--surface-untraced-hover); }
.pf-seg-plain { cursor: default; }

.pf-actions {
  margin-top: var(--space-4); padding: var(--space-4) clamp(20px, 3vw, 40px);
  background: var(--surface-input);
  display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;
}
.pf-pill {
  display: inline-flex; align-items: center; gap: var(--space-2); font-size: 16px;
  padding: 6px var(--space-3); border-radius: 999px;
  background: var(--color-accent-100); color: var(--color-accent-800);
}
.pf-pill-rejected { background: color-mix(in srgb, var(--color-neutral-900) 8%, #ffffff); color: var(--color-neutral-900); }

.pf-evidence { position: sticky; top: 96px; display: flex; flex-direction: column; gap: var(--space-3); }
.pf-meter { height: 6px; border-radius: 999px; background: var(--color-accent-900); margin: var(--space-3) 0 0; overflow: hidden; }
.pf-meter-fill { height: 6px; background: var(--color-accent-300); transition: width .4s ease; }
.pf-cite {
  background: var(--surface-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: var(--space-4);
}
.pf-cite-untraced { background: color-mix(in srgb, var(--color-neutral-900) 7%, #ffffff); }
.pf-cite-quote { font-size: 19px; line-height: 1.55; font-style: italic; margin: 0; }
.pf-cite-meta { font-size: 13px; color: var(--color-neutral-700); margin: var(--space-3) 0 0; }
/* Only one citation shows at a time; the rest are revealed by :has() rules
   generated per draft in the page's own <style>. */
.pf-cite-alt { display: none; }

@media (max-width: 860px) {
  .pf-hero, .pf-split, .pf-approve { grid-template-columns: minmax(0, 1fr); }
  .pf-step-row { grid-template-columns: 22px 1fr; }
  .pf-step-phase, .pf-chip { grid-column: 2; }
  .pf-evidence { position: static; }
}
`;

/** Everything, in cascade order. */
export const ALL_CSS = TOKENS + COMPONENTS + APP + SCREENS;

/** Source Serif 4, the one webfont the design uses. */
export const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap";

/** The wordmark as a favicon, inline so no asset route is needed. */
export const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="2" fill="#006786"/>' +
      '<text x="16" y="23" font-family="Georgia,serif" font-size="21" font-weight="600" ' +
      'fill="#ffffff" text-anchor="middle">P</text></svg>',
  );
