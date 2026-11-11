import Link from 'next/link';
import { FIXED, Metric, count, share } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { today } from '@/lib/queries';
import { BoardTable, Card, NoLedger, Ref, SlotsTable } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import { TodayPage } from '@/components/pages';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const l = await loadLedger();
  if (!l.ok) return <div className="grid"><NoLedger state={l} /><TodayPage /></div>;
  const t = today(l.view, l.entries, l.cfg.limits, l.now), f = t.funnel, b = t.book, r = t.lastRun, ctx = { n: b.closed, nLabel: 'closed trades', basis: 'book' as const, net: true };
  return <div className="grid">
    <Card title="Needs you">
      {t.needsYou.length ? <ul className="ax-list">{t.needsYou.map((n, i) => <li key={i}><Link href={n.href}>{n.text}</Link></li>)}</ul> : <p>Nothing needs you right now.</p>}
    </Card>
    <div className="grid g2">
      <Card title="Where the evidence stands">
        <p>{count(f.tried)} tried, {count(f.passed)} passed all seven checks on past data, {count(f.paper)} in paper, {count(f.eligible)} eligible, {count(f.live)} live.{f.passed === 0 ? ` ${FIXED.nothingPassed}` : ''}</p>
        <p className="ax-n">A pass on past data starts the forward test. It is not a forward record. <Link href="/autopilot">Open the funnel and board</Link></p>
      </Card>
      <Card title="Last run">
        {r ? <><p><Link href={`/autopilot/reports/${encodeURIComponent(r.id)}`}>{r.mode === 'full' ? 'Full run' : r.mode === 'tick' ? 'Paper tick' : r.mode}</Link>, <LocalTime t={r.ts} />, entry <Ref seq={r.seq} />.</p>
          <p className="ax-n">{count(r.evaluated)} pairs evaluated, {count(r.newTrials)} new tries, {count(r.intents)} orders asked, {count(r.blocked)} blocked, {count(r.fills)} paper fills, {count(r.errors)} errors.{r.waitingBudget ? ` ${count(r.waitingBudget)} pairs wait for the weekly budget.` : ''}</p></>
          : <p className="ax-n">No run has finished yet.</p>}
      </Card>
    </div>
    <div className="grid g4">
      <Card><Metric label="Paper equity" value={b.equity} unit="money" {...ctx} size="page" /><p className="ax-n">No real money is in this book. <Link href="/autopilot/book">Open the paper book</Link></p></Card>
      <Card><Metric label="Today (UTC)" value={b.dayPnl} unit="money" {...ctx} /><p className="ax-n">New entries stop at a loss of {share(b.limits.dailyLossPct)} in a day.</p></Card>
      <Card><Metric label="Below the peak" value={b.drawdown} unit="pct" {...ctx} /></Card>
      <Card><Metric label="Open positions" value={b.open} unit="count" {...ctx} /></Card>
    </div>
    <Card>{t.slots.length ? <SlotsTable rows={t.slots} caption="Slots in paper. Each is judged only on bars after its lock" /> : <p className="ax-n">No slot is in paper. A slot is a pair that passed all seven checks, was confirmed by the validator and was then locked.</p>}
      <p className="ax-n">{FIXED.live}</p></Card>
    {t.nearMisses.length > 0 && <Card><BoardTable rows={t.nearMisses} caption="Closest to passing, on past data after assumed costs. Sorted by checks passed, then Sharpe; never by return" /></Card>}
    <section aria-label="Bots reporting in"><h2 className="ax-card-title">Bots reporting in</h2><TodayPage /></section>
  </div>;
}
