// Display components (docs/design/07 s3.5). Plain React and CSS variables, no state and no framework, so they render the same on
// the server, in a test and in the app. The interactive ones (tables that sort, the typed confirmation, the Halt sheet, charts)
// come with the screens that use them.
//
// The rule every one of these follows: a number never appears without what it is a number of. Status is a label and a shape as
// well as a colour. Nothing here calls an API or decides anything; it shows what it is given.
import type { ReactNode } from 'react';
import { arrow, count, money, pct, ratio, share, shortHash, utc } from './format';
import { statusOf, type StatusDef, type Tone } from './status';

// ---- Metric ----
export const BASES = { 'in-sample': 'Past data', forward: 'Forward', book: 'Paper book' } as const;
export type Basis = keyof typeof BASES;
export type MetricProps = {
  label: string; value: number; unit: 'pct' | 'share' | 'money' | 'ratio' | 'count';
  n: number; nLabel?: string;                 // sample size and what it counts ("trades" by default)
  basis: Basis; net?: boolean;                // net of the assumed or measured costs
  receipt?: number; receiptHref?: string;     // ledger sequence number this figure comes from
  size?: 'page' | 'card';
};
const FMT = { pct, share, money, ratio, count } as const;
/**
 * A figure with its context: the basis (past data, forward, paper book), the sample size and the ledger receipt. A figure
 * without a sample size or a basis is a bug. In development it throws, so it is found while building. In production it still
 * renders, marked "context missing", because hiding a number on a live page is worse than flagging it.
 */
export function Metric(p: MetricProps) {
  const missing = !(p.basis in BASES) || typeof p.n !== 'number' || !Number.isFinite(p.n);
  if (missing && process.env.NODE_ENV !== 'production') throw new Error(`Metric "${p.label}" has no ${p.basis in BASES ? 'sample size (n)' : 'basis'}. Every figure shows what it is based on.`);
  const signed = p.unit === 'pct' || p.unit === 'money', tone = signed && p.value !== 0 ? (p.value > 0 ? 'acc' : 'bad') : undefined;
  return (
    <div className={`ax-metric ax-metric-${p.size ?? 'card'}`} data-metric="" data-metric-context={missing ? 'missing' : 'ok'}>
      <div className="ax-label">{p.label}</div>
      <div className="ax-figure" data-tone={tone}>{signed && p.value !== 0 ? <span className="ax-arrow" aria-hidden="true">{arrow(p.value)} </span> : null}{FMT[p.unit](p.value)}</div>
      <div className="ax-context">
        {missing ? <span className="ax-chip" data-tone="bad">Context missing</span> : <>
          <span className="ax-chip" data-tone={p.basis === 'forward' ? 'info' : undefined}>{BASES[p.basis]}</span>
          <span className="ax-n">n = {count(p.n)}{p.nLabel ? ` ${p.nLabel}` : ''}</span>
        </>}
        {p.net === undefined ? null : <span className="ax-n">{p.net ? 'after costs' : 'before costs'}</span>}
        {p.receipt === undefined ? null : p.receiptHref ? <a className="ax-receipt" href={p.receiptHref}>Receipt #{count(p.receipt)}</a> : <span className="ax-receipt">Receipt #{count(p.receipt)}</span>}
      </div>
    </div>
  );
}

// ---- status ----
export function StatusChip({ status, def }: { status?: string; def?: StatusDef }) {
  const d = def ?? statusOf(status ?? '');
  return <span className="ax-chip ax-status" data-tone={d.tone}><span className="ax-shape" aria-hidden="true">{d.shape}</span> {d.label}</span>;
}

// ---- gate checks ----
export type Check = { n: number; name: string; pass: boolean; why: string; value?: number | null };
export function CheckRow({ check }: { check: Check }) {
  return (
    <tr className="ax-check" data-pass={check.pass}>
      <th scope="row">{check.n}. {check.name}</th>
      <td><span className="ax-mark" data-tone={check.pass ? 'acc' : 'bad'}><span aria-hidden="true">{check.pass ? '●' : '✕'}</span> {check.pass ? 'Pass' : 'Fail'}</span></td>
      <td>{check.why}</td>
    </tr>
  );
}
export function ChecksTable({ checks, caption = 'The seven checks' }: { checks: Check[]; caption?: string }) {
  return <table className="ax-table"><caption>{caption}</caption><thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">Number behind it</th></tr></thead><tbody>{checks.map(c => <CheckRow key={c.n} check={c} />)}</tbody></table>;
}
/** The words a screen reader gets for a strip of marks: "6 of 7; failed: enough trades". */
export const checksSummary = (checks: Check[]) => { const failed = checks.filter(c => !c.pass); return checks.length ? `${checks.length - failed.length} of ${checks.length}${failed.length ? `; failed: ${failed.map(c => c.name).join(', ')}` : ''}` : 'not run'; };
/** Seven small marks for a table cell: filled for a pass, a hollow cross for a fail, with the same thing in words. */
export function ChecksStrip({ checks }: { checks: Check[] }) {
  const text = checksSummary(checks);
  return <span className="ax-strip" role="img" aria-label={text} title={text}>{checks.map(c => <span key={c.n} className="ax-mark" data-tone={c.pass ? 'acc' : 'bad'} aria-hidden="true">{c.pass ? '●' : '✕'}</span>)}</span>;
}

// ---- funnel ----
export type Stage = { label: string; count: number; note?: string };
/** Counts by stage as horizontal bars with the count written on each. Each bar is scaled against the first stage. */
export function Funnel({ stages, caption }: { stages: Stage[]; caption: string }) {
  const top = Math.max(1, ...stages.map(s => s.count));
  return (
    <figure className="ax-funnel">
      <figcaption>{caption}</figcaption>
      <ol>{stages.map(s => <li key={s.label}><span className="ax-funnel-label">{s.label}</span><span className="ax-bar" style={{ width: `${Math.max(1, (s.count / top) * 100)}%` }} aria-hidden="true" /><span className="ax-funnel-count">{count(s.count)}</span>{s.note ? <span className="ax-n"> {s.note}</span> : null}</li>)}</ol>
    </figure>
  );
}

// ---- graduation ----
export type Graduation = { months: number; trades: number; dsr: number | null; earliest: string | null; needMonths?: number; needTrades?: number; needDsr?: number };
/** Progress to "eligible": forward months, forward trades and the deflated probability, each against its bar. */
export function GraduationClock({ g }: { g: Graduation }) {
  const rows: [string, number, number, string][] = [
    ['Forward months', g.months, g.needMonths ?? 6, `${ratio(g.months)} of ${g.needMonths ?? 6}`],
    ['Forward trades', g.trades, g.needTrades ?? 50, `${count(g.trades)} of ${g.needTrades ?? 50}`],
    ['Chance it is more than luck', g.dsr ?? 0, g.needDsr ?? 0.95, g.dsr === null ? 'not enough forward trades to say' : `${share(g.dsr, 0)} of ${share(g.needDsr ?? 0.95, 0)}`],
  ];
  return (
    <div className="ax-clock">
      {rows.map(([label, have, need, text]) => <div key={label} className="ax-clock-row"><span className="ax-label">{label}</span><span className="ax-track" aria-hidden="true"><span className="ax-fill" style={{ width: `${Math.min(100, Math.max(0, (have / need) * 100))}%` }} data-done={have >= need} /></span><span className="ax-n">{text}</span></div>)}
      <p className="ax-n">{g.earliest ? `Earliest possible: ${g.earliest} at the current pace. Forward results only; past data does not count here.` : 'No earliest date yet: there are no forward trades.'}</p>
    </div>
  );
}

// ---- live locks ----
export type LockRow = { id: 'evidence' | 'validated' | 'approved' | 'machine'; open: boolean; why: string };
const LOCKS: Record<LockRow['id'], [string, string]> = {
  evidence: ['1. Evidence', 'Opens by itself when a slot holds up in forward paper trading'],
  validated: ['2. Independent check', 'Opens when a separate validator run agrees'],
  approved: ['3. Your approval', 'Only you, signed on your machine'],
  machine: ['4. Your machine and keys', 'Only you, on the machine that holds your broker keys. Nothing on this page can open it'],
};
/** The four locks between paper and live. It shows state and who can change it. It has no button: none of the locks opens from a card. */
export function LockPanel({ locks }: { locks: LockRow[] }) {
  return (
    <table className="ax-table ax-locks"><caption>What stands between paper and live</caption>
      <thead><tr><th scope="col">Lock</th><th scope="col">State</th><th scope="col">Who opens it</th><th scope="col">Why it is where it is</th></tr></thead>
      <tbody>{locks.map(l => <tr key={l.id}><th scope="row">{LOCKS[l.id][0]}</th><td><span className="ax-mark" data-tone={l.open ? 'acc' : 'mute'}><span aria-hidden="true">{l.open ? '🔓' : '🔒'}</span> {l.open ? 'Open' : 'Closed'}</span></td><td>{LOCKS[l.id][1]}</td><td>{l.why}</td></tr>)}</tbody>
    </table>
  );
}

// ---- reasons, receipts, provenance ----
export function WhyNot({ title = 'Why not', rules }: { title?: string; rules: { id: string; text: string; detail?: string }[] }) {
  return <section className="ax-why"><h3>{title}</h3><ul>{rules.map(r => <li key={r.id}><code>{r.id}</code> {r.text}{r.detail ? <span className="ax-n"> ({r.detail})</span> : null}</li>)}</ul></section>;
}
export type LedgerRow = { seq: number; kind: string; ts: number; actor: string; hash: string; prevHash: string; payloadHash: string };
export function Receipt({ entry }: { entry: LedgerRow }) {
  return (
    <dl className="ax-receipt-card">
      <dt>Entry</dt><dd>#{count(entry.seq)} · {entry.kind} · {utc(entry.ts)} · by {entry.actor}</dd>
      {([['Hash', entry.hash], ['Previous', entry.prevHash], ['Payload', entry.payloadHash]] as const).map(([k, h]) => <span key={k} className="ax-hash"><dt>{k}</dt><dd><code title={h}>{shortHash(h)}</code></dd></span>)}
      <dt>Check it yourself</dt><dd><code>apex ledger show {entry.seq}</code> then <code>apex ledger verify</code></dd>
    </dl>
  );
}
export type Provenance = { dataset: string; source: string; second: string | null; fetched: number; adjustment: string; health: 'ok' | 'warn' | 'blocked' };
const HEALTH: Record<Provenance['health'], [string, string, Tone]> = { ok: ['●', 'Healthy', 'acc'], warn: ['◐', 'Warning', 'warn'], blocked: ['✕', 'Blocked', 'bad'] };
export function ProvenanceTable({ rows }: { rows: Provenance[] }) {
  return (
    <div className="ax-scroll"><table className="ax-table"><caption>Where the data came from</caption>
      <thead><tr><th scope="col">Dataset</th><th scope="col">Source</th><th scope="col">Second source</th><th scope="col">Fetched</th><th scope="col">Adjustment</th><th scope="col">Health</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.dataset}><th scope="row"><code>{r.dataset}</code></th><td>{r.source}</td><td>{r.second ?? 'None. One source cannot catch its own bad data'}</td><td>{utc(r.fetched)}</td><td>{r.adjustment}</td>
        <td><span className="ax-mark" data-tone={HEALTH[r.health][2]}><span aria-hidden="true">{HEALTH[r.health][0]}</span> {HEALTH[r.health][1]}</span></td></tr>)}</tbody>
    </table></div>
  );
}

// ---- system states ----
export const BANNERS = {
  halted: ['bad', 'Halted'], data_blocked: ['bad', 'Data blocked'], not_persistent: ['warn', 'Storage is not persistent'], budget: ['info', 'Weekly trial budget reached'], run_failed: ['bad', 'The last run failed'], paper: ['info', 'Paper mode'],
} as const satisfies Record<string, [Tone, string]>;
export function Banner({ kind, children }: { kind: keyof typeof BANNERS; children?: ReactNode }) {
  const [tone, title] = BANNERS[kind];
  return <div className="ax-banner" role={tone === 'bad' ? 'alert' : 'status'} data-tone={tone}><strong>{title}.</strong> {children}</div>;
}
/** Nothing yet: what is empty, why, and the next step. Never a bare "No data". */
export function EmptyState({ title, reason, next }: { title: string; reason: string; next: ReactNode }) {
  return <div className="ax-empty"><p className="ax-empty-title">{title}</p><p>{reason}</p><p className="ax-n">{next}</p></div>;
}

// ---- claim check ----
export function ClaimCompare({ rows }: { rows: { claim: string; claimed: string; measured: string }[] }) {
  return (
    <div className="ax-scroll"><table className="ax-table ax-compare"><caption>Claimed and measured</caption>
      <thead><tr><th scope="col">What the source says</th><th scope="col">Claimed</th><th scope="col">Measured</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><th scope="row">{r.claim}</th><td>{r.claimed}</td><td>{r.measured}</td></tr>)}</tbody>
    </table></div>
  );
}
/** One extracted rule with the words it came from. The quote is the source's text, shown as a quote and never as Apex's own sentence. */
export function SourceQuote({ kind, text, quote, offset, href }: { kind: string; text: string; quote: string; offset: number; href?: string }) {
  return (
    <div className="ax-quote">
      <p><span className="ax-chip">{kind}</span> {text}</p>
      <blockquote>{quote}</blockquote>
      <p className="ax-n">{href ? <a href={href}>In the source at character {count(offset)}</a> : `In the source at character ${count(offset)}`}</p>
    </div>
  );
}
