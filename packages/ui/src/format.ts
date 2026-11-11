// Number and text formats used everywhere (docs/design/07 s8): percentages to one decimal with a sign, money to cents, Sharpe to
// two decimals, thousands separators, hashes as first four and last four.
const NF = (min: number, max = min) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
export const sign = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '');
/** A return or change as a fraction: 0.087 -> "+8.7%". Always signed. */
export const pct = (x: number, digits = 1) => `${sign(x)}${NF(digits).format(Math.abs(x) * 100)}%`;
/** Goes beside a gain or loss so it reads without colour. */
export const arrow = (x: number) => (x > 0 ? '▲' : x < 0 ? '▼' : '■');
/** A share that is not a change: 0.45 -> "45.0%". No sign. */
export const share = (x: number, digits = 1) => `${NF(digits).format(x * 100)}%`;
export const money = (x: number) => `${x < 0 ? '−' : ''}$${NF(2).format(Math.abs(x))}`;
export const ratio = (x: number) => `${x < 0 ? '−' : ''}${NF(2).format(Math.abs(x))}`;
export const count = (x: number) => NF(0).format(x);
export const shortHash = (h: string) => (h.length <= 10 ? h : `${h.slice(0, 4)}…${h.slice(-4)}`);
export const utc = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
/** Words Apex never puts on a screen about a result (07 s8). "signal" is allowed for a tested rule only, so that one is checked by a person. */
export const NEVER_WORDS = /\b(guaranteed?|risk[- ]free|winning|proven)\b/i;
/** Fixed phrases, used word for word everywhere. They are the only place the never-words may appear, and only to deny them. */
export const FIXED = {
  paper: 'Paper mode. Nothing here is proven or guaranteed.',
  nothingPassed: 'Nothing has passed yet. The diversified core is the benchmark.',
  live: 'Going live is your switch, on your machine.',
} as const;
