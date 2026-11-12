// Shared pieces of the Autopilot screens. Server-safe: no state, no effects. Figures go through Metric or sit in a table whose
// caption says what they are based on.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChecksStrip, EmptyState, StatusChip, count, money, pct, ratio, share, shortHash } from '@apex/ui';
import LocalTime from '../LocalTime';
import type { Loaded } from '@/lib/ledger';
import type { BoardRow, IntentRow, SlotRow, Trade } from '@/lib/queries';

export const pairHref = (trialKey: string) => `/autopilot/pairs/${trialKey.slice(0, 16)}`;
export const slotHref = (slotKey: string) => `/autopilot/slots/${encodeURIComponent(slotKey)}`;
export const receiptHref = (seq: number) => `/autopilot/ledger/${seq}`;
/** A route parameter as the ledger spells it. */
export const param = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** What a screen shows when there is no ledger to read: what is missing, why, and the next step. */
export function NoLedger({ state }: { state: Extract<Loaded, { ok: false }> }) {
  if (state.why === 'none') return <EmptyState title="Storage is not set up, so nothing is recorded and nothing runs" reason="The autopilot keeps every try, slot and paper trade in a ledger. This dashboard has no ledger connected."
    next={<>Set <code>DATABASE_URL</code> in the Vercel environment (see You, Setup). On your own machine, <code>npm run apex -- status</code> reads the local ledger.</>} />;
  if (state.why === 'error') return <EmptyState title="The ledger could not be read" reason={state.note ?? 'No detail was given.'} next="Nothing is shown rather than something that might be wrong. Check the database connection, then reload." />;
  return <EmptyState title="The first run has not happened yet" reason="The ledger is connected and empty." next={<>The nightly run fills it. To run now on your machine: <code>npm run apex -- run --full</code>.</>} />;
}

export function Card({ title, children, wide }: { title?: string; children: ReactNode; wide?: boolean }) {
  return <section className="card" style={wide ? { gridColumn: '1 / -1' } : undefined}>{title ? <h2 className="ax-card-title">{title}</h2> : null}{children}</section>;
}
export const Side = ({ side }: { side: 1 | -1 }) => <>{side === 1 ? 'Long' : 'Short'}</>;
export const Hash = ({ h }: { h: string }) => <code title={h}>{shortHash(h)}</code>;
export const Ref = ({ seq }: { seq: number }) => <Link className="ax-receipt" href={receiptHref(seq)}>#{count(seq)}</Link>;

export function BoardTable({ rows, caption }: { rows: BoardRow[]; caption: string }) {
  return (
    <div className="ax-scroll"><table className="ax-table ax-board"><caption>{caption}</caption>
      <thead><tr><th scope="col">Strategy</th><th scope="col">Market</th><th scope="col">Status</th><th scope="col"><abbr title="The seven checks of the gate, in order. A filled mark is a pass.">Checks</abbr></th>
        <th scope="col" className="ax-num"><abbr title="Closed trades in the backtest. Fewer than 50 is too few to judge.">Trades</abbr></th><th scope="col" className="ax-num"><abbr title="Return after the assumed costs, on past data.">Net</abbr></th>
        <th scope="col" className="ax-num"><abbr title="What buying and holding the same market returned over the same bars.">Hold</abbr></th><th scope="col" className="ax-num"><abbr title="Return per unit of risk, from daily returns. Higher is steadier.">Sharpe</abbr></th>
        <th scope="col" className="ax-num"><abbr title="The chance the Sharpe is more than luck, after counting every try so far.">Deflated</abbr></th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.trialKey}>
        <th scope="row"><Link href={pairHref(r.trialKey)}>{r.strategy}</Link></th><td>{r.symbol} {r.tf}</td><td><StatusChip status={r.status} /></td>
        <td>{r.error ? <span className="ax-n">did not run</span> : <ChecksStrip checks={r.checks} />}</td><td className="ax-num">{count(r.trades)}</td><td className="ax-num">{pct(r.ret)}</td><td className="ax-num">{pct(r.hold)}</td>
        <td className="ax-num">{ratio(r.sharpe)}</td><td className="ax-num">{r.dsr === null ? 'n/a' : share(r.dsr)}</td></tr>)}</tbody>
    </table></div>
  );
}

export function SlotsTable({ rows, caption }: { rows: SlotRow[]; caption: string }) {
  return (
    <div className="ax-scroll"><table className="ax-table"><caption>{caption}</caption>
      <thead><tr><th scope="col">Slot</th><th scope="col">Status</th><th scope="col">Role</th><th scope="col" className="ax-num">Weight</th><th scope="col">Locked</th><th scope="col" className="ax-num">Forward trades</th><th scope="col">Last monthly check</th></tr></thead>
      <tbody>{rows.map(s => <tr key={s.slotKey}><th scope="row"><Link href={slotHref(s.slotKey)}>{s.strategy}</Link> <span className="ax-n">{s.symbol} {s.tf}</span></th><td><StatusChip status={s.role === 'shadow' && s.status === 'paper' ? 'shadow' : s.status} /></td><td>{s.role}</td>
        <td className="ax-num">{share(s.weight, 0)}</td><td><LocalTime t={s.lockedAt} date /></td><td className="ax-num">{count(s.forwardTrades)}</td><td>{s.gradState ? `${s.gradState.replace(/_/g, ' ')} (${s.gradMonth})` : 'none yet'}</td></tr>)}</tbody>
    </table></div>
  );
}

export function TradesTable({ rows, caption }: { rows: Trade[]; caption: string }) {
  return (
    <div className="ax-scroll"><table className="ax-table"><caption>{caption}</caption>
      <thead><tr><th scope="col">Closed</th><th scope="col">Slot</th><th scope="col">Side</th><th scope="col" className="ax-num">Quantity</th><th scope="col" className="ax-num">Entry</th><th scope="col" className="ax-num">Exit</th><th scope="col" className="ax-num">Result</th><th scope="col" className="ax-num">In risk units</th><th scope="col">Exit reason</th><th scope="col">Mode</th></tr></thead>
      <tbody>{rows.map((t, i) => <tr key={`${t.slotKey}-${t.exitT}-${i}`}><td><LocalTime t={t.exitT} /></td><th scope="row"><Link href={slotHref(t.slotKey)}>{t.symbol}</Link></th><td><Side side={t.side} /></td><td className="ax-num">{t.qty}</td><td className="ax-num">{money(t.entry)}</td><td className="ax-num">{money(t.exit)}</td>
        <td className="ax-num">{money(t.pnl)}</td><td className="ax-num">{ratio(t.r)}R</td><td>{t.reason}</td><td><span className="ax-chip">PAPER</span></td></tr>)}</tbody>
    </table></div>
  );
}

export function IntentsTable({ rows, caption }: { rows: IntentRow[]; caption: string }) {
  return (
    <div className="ax-scroll"><table className="ax-table"><caption>{caption}</caption>
      <thead><tr><th scope="col">When</th><th scope="col">Slot</th><th scope="col">Side</th><th scope="col">Guard</th><th scope="col">Rules</th><th scope="col">Receipt</th></tr></thead>
      <tbody>{rows.map(i => <tr key={i.seq}><td><LocalTime t={i.ts} /></td><th scope="row"><Link href={slotHref(i.slotKey)}>{i.symbol}</Link></th><td><Side side={i.side} /></td>
        <td><span className="ax-mark" data-tone={i.ok ? 'acc' : 'warn'}><span aria-hidden="true">{i.ok ? '●' : '✕'}</span> {i.ok ? `Passed, ${i.qty} at ${money(i.riskUsd ?? 0)} risk` : 'Blocked'}</span></td>
        <td>{i.ok ? <span className="ax-n">{i.rules.length} rules passed</span> : <ul className="ax-rules">{i.rules.map(r => <li key={r.id}><code>{r.id}</code> {r.detail}</li>)}{i.note ? <li>{i.note}</li> : null}</ul>}</td><td><Ref seq={i.seq} /></td></tr>)}</tbody>
    </table></div>
  );
}

/** A filter row that works without scripts: a plain GET form. */
export function Filters({ action, children }: { action: string; children: ReactNode }) {
  return <form className="ax-filters" action={action} method="get">{children}<button type="submit" className="ax-btn">Apply</button><Link className="ax-btn" href={action}>Clear</Link></form>;
}
export function Pick({ name, label, value, options }: { name: string; label: string; value?: string; options: { value: string; label: string }[] }) {
  return <label className="ax-pick"><span className="ax-label">{label}</span><select name={name} defaultValue={value ?? ''}><option value="">All</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
