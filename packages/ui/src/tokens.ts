// Design tokens (docs/design/07 s3). One table, used three ways: tokens.css is generated from it (a test keeps the file in
// step), the contrast check reads it, and the terminal and reports can read the same names. Dark is the default for the
// installed app; both themes are first class.
export type Token = { light: string; dark: string; use: string };
export const TOKENS: Record<string, Token> = {
  'bg': { light: '#f6f7f9', dark: '#0a0d12', use: 'Page' },
  'panel': { light: '#ffffff', dark: '#11161d', use: 'Cards' },
  'panel-2': { light: '#f0f3f6', dark: '#161d26', use: 'Nested areas, table header' },
  'ink': { light: '#0f1720', dark: '#e6edf3', use: 'Text' },
  'mute': { light: '#566170', dark: '#93a0b0', use: 'Secondary text' },
  'line': { light: '#e3e7ec', dark: '#222b36', use: 'Borders' },
  'acc': { light: '#0b7a5c', dark: '#2fd59b', use: 'Brand, primary button, ok' },
  'info': { light: '#2456d6', dark: '#6ea8ff', use: 'Links, neutral highlights, forward data' },
  'warn': { light: '#8a5600', dark: '#f0b54a', use: 'Warnings, near miss, paused' },
  'bad': { light: '#b42323', dark: '#ff7b72', use: 'Failures, blocks, halt' },
  // The design gives #b4520b for light. On a chip that is 4.49:1, a hair under the 4.5 rule, so it is one step darker here.
  'live': { light: '#ad4e0a', dark: '#ff9f43', use: 'Anything live. Used nowhere else' },
  'chip': { light: '#eef2f5', dark: '#17202a', use: 'Chips' },
  'on-acc': { light: '#ffffff', dark: '#0a0d12', use: 'Text on a primary button' },
};
export const SURFACES = ['bg', 'panel', 'panel-2', 'chip'] as const;
export const TEXT = ['ink', 'mute', 'acc', 'info', 'warn', 'bad', 'live'] as const;
export const SCALE = { label: 12, table: 13, body: 14, cardTitle: 16, sectionTitle: 20, pageFigure: 28 } as const;
export const SHAPE = { grid: 4, cardPad: 16, radiusCard: 12, radiusControl: 8, radiusChip: 999, touch: 44, maxWidth: 1360, motionMs: 120 } as const;

const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** WCAG contrast ratio of two #rrggbb colours. */
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Every text colour on every surface, and button text on the accent, in both themes. Returns the pairs under 4.5:1. */
export function contrastFailures(tokens: Record<string, Token> = TOKENS, min = 4.5): string[] {
  const bad: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const fg of TEXT) for (const bg of SURFACES) { const r = contrast(tokens[fg][theme], tokens[bg][theme]); if (r < min) bad.push(`${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1`); }
    const r = contrast(tokens['on-acc'][theme], tokens.acc[theme]); if (r < min) bad.push(`${theme}: --on-acc on --acc is ${r.toFixed(2)}:1`);
  }
  return bad;
}
const vars = (theme: 'light' | 'dark') => Object.entries(TOKENS).map(([k, v]) => `--${k}:${v[theme]}`).join(';');
/** The token stylesheet. Dark is the default; a light system setting or data-theme="light" switches it; data-theme="dark" forces it. */
export const tokensCss = () => `/* Generated from tokens.ts. Do not edit by hand: change tokens.ts and run the ui tests with UPDATE_TOKENS=1. */
:root{${vars('dark')};--font-ui:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-num:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;--radius-card:${SHAPE.radiusCard}px;--radius-control:${SHAPE.radiusControl}px;--motion:${SHAPE.motionMs}ms}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){${vars('light')}}}
:root[data-theme="light"]{${vars('light')}}
:root[data-theme="dark"]{${vars('dark')}}
@media (prefers-reduced-motion:reduce){:root{--motion:0ms}*{animation:none!important;transition:none!important}}
`;
