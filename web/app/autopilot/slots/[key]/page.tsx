import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FIXED, GraduationClock, LockPanel, Metric, Receipt, StatusChip, count, money, ratio, share } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { slotDetail } from '@/lib/queries';
import { Card, Hash, IntentsTable, NoLedger, Ref, Side, SlotsTable, TradesTable, pairHref, param, receiptHref } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import LiveApproval from '@/components/autopilot/LiveApproval';
import { CHECKLIST, MAX_EXPIRY_DAYS, nextStage } from '@/app/api/admin/live/approval';
export const metadata = { title: 'Slot' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const d = slotDetail(l.view, l.entries, param((await params).key), l.now); if (!d) notFound();
  const s = d.slot, c = d.clock, is = d.inSample, stage = nextStage(s.status);
  const earliest = c.earliestMonth !== null ? `forward month ${c.earliestMonth}` : null;
  return <div className="grid">
    <Card>
      <div className="ax-titleline"><h2 className="ax-card-title">{s.strategy} on {s.symbol} {s.tf}</h2><StatusChip status={s.role === 'shadow' && s.status === 'paper' ? 'shadow' : s.status} /><span className="ax-chip">PAPER</span></div>
      <p className="ax-n">{s.role === 'primary' ? 'Primary slot' : `Shadow of ${s.shadowOf}`}. Locked <LocalTime t={s.lockedAt} date />, entry <Ref seq={s.lockSeq} />. Weight {share(s.weight, 0)}, risk per trade {share(s.riskFraction, 2)}. Strategy fingerprint <Hash h={d.fingerprint} />. A locked strategy does not change.</p>
    </Card>
    <div className="grid g2">
      <Card title="Graduation clock">
        <GraduationClock g={{ months: c.months, trades: c.trades, dsr: c.dsr, earliest, needMonths: c.needMonths, needTrades: c.needTrades, needDsr: c.needDsr }} />
        <p className="ax-n">{c.state ? <>Last monthly check ({c.checkedMonth}): <strong>{c.state.replace(/_/g, ' ')}</strong>.{c.fails.length ? ` Still short: ${c.fails.join('; ')}.` : ''}{c.note ? ` Clock: ${c.note}.` : ''}</> : 'No monthly check has run yet.'} The deflated figure counts {count(c.m)} {c.m === 1 ? 'slot' : 'slots'} ever locked.</p>
      </Card>
      <Card><div className="ax-scroll"><LockPanel locks={d.locks} /></div><p className="ax-n">{FIXED.live}</p>
        {/* The approval step shows only when locks 1 and 2 are open and lock 3 is not. The server works that out again before it records anything. */}
        {stage && d.locks[0].open && d.locks[1].open && !d.locks[2].open ? <LiveApproval slotKey={s.slotKey} stage={stage.id} sizePct={stage.size * 100} maxDays={MAX_EXPIRY_DAYS} checklist={CHECKLIST} /> : null}</Card>
    </div>
    <div className="grid g2">
      <Card title="Forward record (after the lock)">
        {d.forward.n ? <div className="grid g2">
          <Metric label="Paper result" value={d.forward.pnl} unit="money" n={d.forward.n} nLabel="trades" basis="forward" net />
          <Metric label="Average per trade, in risk units" value={d.forward.avgR ?? 0} unit="ratio" n={d.forward.n} nLabel="trades" basis="forward" net />
        </div> : <p>No forward trades yet. This is the only record that counts toward going live.</p>}
        {d.position && <p className="ax-n">Open now: <Side side={d.position.side} /> {d.position.qty} from {money(d.position.entry)}, stop {money(d.position.stop)}, {money(d.position.riskUsd)} at risk, since <LocalTime t={d.position.entryT} />.</p>}
      </Card>
      <Card title="Past data (what it was selected on)">
        {is ? <><div className="grid g2">
          <Metric label="Return" value={is.ret} unit="pct" n={is.trades} nLabel="trades" basis="in-sample" net receipt={is.seq} receiptHref={receiptHref(is.seq)} />
          <Metric label="Sharpe" value={is.sharpe} unit="ratio" n={is.trades} nLabel="trades" basis="in-sample" net />
        </div><p className="ax-n">{is.passed} of {is.checks.length} checks. <Link href={pairHref(is.trialKey)}>Open the full evaluation</Link>. Past and forward results are never added together.</p></> : <p className="ax-n">The evaluation this slot came from is not in the ledger view.</p>}
      </Card>
    </div>
    <Card title="Drift">
      {d.drift ? <p>After {count(d.drift.n)} forward trades the drift reading is <strong>{ratio(d.drift.s)}</strong> against an alarm line of {ratio(d.drift.threshold)}.{d.drift.alarms.length ? ` Alarms: ${d.drift.alarms.join('; ')}.` : ' No alarm.'} Paused for drift {s.driftPauses} {s.driftPauses === 1 ? 'time' : 'times'}; three retire the slot.</p>
        : <p className="ax-n">No drift reading yet. Drift compares forward trades with the past-data baseline{d.baseline ? ` (${count(d.baseline.n)} trades, win rate ${share(d.baseline.p, 0)})` : ''} and pauses the slot when they stop looking alike.</p>}
    </Card>
    {d.forward.n > 0 && <Card><TradesTable rows={d.forward.trades} caption="Forward paper trades, newest first, after assumed costs" /></Card>}
    <Card>{d.intents.length ? <IntentsTable rows={d.intents} caption="Orders the strategy asked for, and what the risk guard said" /> : <p className="ax-n">No order has been asked for yet. Every one goes through the risk guard, and a blocked one is kept with the rule that blocked it.</p>}</Card>
    {d.events.length > 0 && <Card><div className="ax-scroll"><table className="ax-table"><caption>Status changes</caption><thead><tr><th scope="col">When</th><th scope="col">Change</th><th scope="col">Why</th><th scope="col">Receipt</th></tr></thead>
      <tbody>{d.events.map(e => <tr key={e.seq}><td><LocalTime t={e.ts} /></td><th scope="row">{e.from} to {e.to}</th><td>{e.why}</td><td><Ref seq={e.seq} /></td></tr>)}</tbody></table></div></Card>}
    {d.shadows.length > 0 && <Card><SlotsTable rows={d.shadows} caption="Shadows: close relatives that run beside it without taking risk" /></Card>}
    {d.lock && <Card title="Lock receipt"><Receipt entry={d.lock} /></Card>}
  </div>;
}
