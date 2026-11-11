import Link from 'next/link';
import { Metric, count, money, share } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { book } from '@/lib/queries';
import { Card, IntentsTable, NoLedger, Side, TradesTable, slotHref } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Paper book' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const b = book(l.view, l.entries, l.cfg.limits, l.now), s = b.summary, ctx = { n: s.closed, nLabel: 'closed trades', basis: 'book' as const, net: true };
  const used = (loss: number, limit: number) => `${share(Math.max(0, -loss))} of ${share(limit)}`;
  return <div className="grid">
    <div className="grid g4">
      <Card><Metric label="Paper equity" value={s.equity} unit="money" {...ctx} size="page" /><p className="ax-n">Started at {money(s.capital)}{s.since ? <> on <LocalTime t={s.since} date /></> : null}. No real money is in this book.</p></Card>
      <Card><Metric label="Change since the start" value={s.capital > 0 ? s.equity / s.capital - 1 : 0} unit="pct" {...ctx} /></Card>
      <Card><Metric label="Below the peak" value={s.drawdown} unit="pct" {...ctx} /><p className="ax-n">New entries stop at {share(s.limits.maxDrawdownPct, 0)} below the peak.{s.drawdownPaused ? ' That pause is on now.' : ''}</p></Card>
      <Card><Metric label="Open positions" value={s.open} unit="count" {...ctx} /></Card>
    </div>
    <Card><div className="ax-scroll"><table className="ax-table"><caption>Loss limits. A limit that is reached stops new entries; it never closes a position by itself</caption>
      <thead><tr><th scope="col">Window</th><th scope="col" className="ax-num">Result</th><th scope="col" className="ax-num">Loss used</th></tr></thead>
      <tbody><tr><th scope="row">Today (UTC)</th><td className="ax-num">{money(s.dayPnl)}</td><td className="ax-num">{used(s.dayLossPct, s.limits.dailyLossPct)}</td></tr>
        <tr><th scope="row">This week</th><td className="ax-num">{money(s.weekPnl)}</td><td className="ax-num">{used(s.weekLossPct, s.limits.weeklyLossPct)}</td></tr>
        <tr><th scope="row">From the peak</th><td className="ax-num">{money(s.equity - s.peak)}</td><td className="ax-num">{used(s.drawdown, s.limits.maxDrawdownPct)}</td></tr></tbody></table></div>
      <p className="ax-n">Based on {count(s.closed)} closed paper trades{s.lastMark ? <>, marked at <LocalTime t={s.lastMark} /></> : null}. The comparison with the diversified core and with holding SPY is in each report; it is not on this screen yet.</p></Card>
    <Card>{b.positions.length ? <div className="ax-scroll"><table className="ax-table"><caption>Open positions</caption>
      <thead><tr><th scope="col">Symbol</th><th scope="col">Side</th><th scope="col" className="ax-num">Quantity</th><th scope="col" className="ax-num">Entry</th><th scope="col" className="ax-num">Stop</th><th scope="col" className="ax-num">At risk</th><th scope="col">Since</th><th scope="col">Mode</th></tr></thead>
      <tbody>{b.positions.map(p => <tr key={p.slotKey}><th scope="row"><Link href={slotHref(p.slotKey)}>{p.symbol}</Link></th><td><Side side={p.side} /></td><td className="ax-num">{p.qty}</td><td className="ax-num">{money(p.entry)}</td><td className="ax-num">{money(p.stop)}</td>
        <td className="ax-num">{money(p.riskUsd)} ({share(p.riskPct, 2)})</td><td><LocalTime t={p.entryT} /></td><td><span className="ax-chip">PAPER</span></td></tr>)}</tbody></table></div>
      : <p className="ax-n">No open positions.</p>}</Card>
    <Card>{b.closed.length ? <TradesTable rows={b.closed} caption={`Closed paper trades, newest first, after assumed costs${s.closed > b.closed.length ? ` (latest ${b.closed.length} of ${s.closed})` : ''}`} /> : <p className="ax-n">No closed trades yet. The book only trades slots that passed the gate and the validator.</p>}</Card>
    <Card>{b.blocked.length ? <IntentsTable rows={b.blocked} caption="Orders the risk guard blocked, with the rule that blocked each" /> : <p className="ax-n">The risk guard has not blocked an order yet. When it does, the rule and the number are kept here.</p>}</Card>
    <Card title="Costs"><p>{s.costs ? (s.costs.measured ? `${s.costs.measured} cost rows are measured from paper fills and ${s.costs.assumed} are still assumed.` : 'Every cost here is assumed, not measured. They become measured as paper fills come in.') : 'No cost model is recorded yet.'}</p>
      <p className="ax-n">The terminal lists the rows: <code>npm run apex -- costs</code>.</p></Card>
  </div>;
}
