import Link from 'next/link';
import { FIXED, money, ratio, share } from '@apex/ui';
import { loadLedger, shellStatus } from '@/lib/ledger';
import { RESUMABLE, confirmPhrase, risk } from '@/lib/queries';
import { Card, IntentsTable, NoLedger, Ref, slotHref } from '@/components/autopilot/parts';
import ConfirmTyped from '@/components/ConfirmTyped';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Risk' };
export const dynamic = 'force-dynamic';

const LIMITS: Record<string, [string, 'pct' | 'count']> = { riskPct: ['Risk per trade', 'pct'], maxOpen: ['Open positions at once', 'count'], maxPerSymbol: ['Positions per symbol', 'count'], dailyLossPct: ['Daily loss stop', 'pct'], weeklyLossPct: ['Weekly loss stop', 'pct'],
  maxDrawdownPct: ['Drawdown stop', 'pct'], maxWeightPct: ['Largest slot weight', 'pct'], maxClassPct: ['Largest share in one asset class', 'pct'], maxCorrRiskPct: ['Risk in correlated positions', 'pct'], cooldownBars: ['Bars to wait after a stop', 'count'] };
const show = (k: string, x: number) => (LIMITS[k]?.[1] === 'count' ? String(x) : share(x, x < 0.1 ? 1 : 0));

export default async function Page() {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const r = risk(l.view, l.entries, l.cfg.limits, l.now), st = await shellStatus(), levels = [...new Set(r.halts.map(h => h.level))];
  return <div className="grid">
    <Card title="Halts">
      {r.halts.length ? <ul className="ax-list">{r.halts.map((h, i) => <li key={i}><strong>{h.level}</strong>: {h.reason} <span className="ax-n">Pulled by {h.by}, <LocalTime t={h.ts} />.</span></li>)}</ul>
        : <p>Nothing is halted in the ledger.{st.halts.some(h => h.from === 'dashboard') ? <> The dashboard's own switch is on, though: release it on <Link href="/">Today</Link>.</> : null}</p>}
      {levels.map(level => Object.prototype.hasOwnProperty.call(RESUMABLE, level)
        ? <ConfirmTyped key={level} action="/api/resume" body={{ level }} phrase={confirmPhrase(level)} button={`Resume after ${RESUMABLE[level as keyof typeof RESUMABLE]}`}
            what={`Resuming removes ${RESUMABLE[level as keyof typeof RESUMABLE]} from the ledger, so the next paper run may open new paper positions. It does not open any live lock. Only you can do this.`} />
        : <p key={level} className="ax-n">The level “{level}” is not one that is resumed from here.</p>)}
      {r.halts.length > 0 && !st.signedIn && <p className="ax-n">You are not signed in, so the resume will be refused. Log in under <Link href="/you/setup">You, Setup</Link>.</p>}
    </Card>
    <Card><div className="ax-scroll"><table className="ax-table"><caption>Limits. Read-only here</caption>
      <thead><tr><th scope="col">Limit</th><th scope="col" className="ax-num">In force</th><th scope="col" className="ax-num">Asked for</th><th scope="col" className="ax-num">Default</th><th scope="col" className="ax-num">Ceiling</th><th scope="col">Waiting</th></tr></thead>
      <tbody>{r.limits.map(x => <tr key={x.key}><th scope="row">{LIMITS[x.key]?.[0] ?? x.key} <code>{x.key}</code></th><td className="ax-num">{show(x.key, x.inForce)}</td><td className="ax-num">{show(x.key, x.requested)}</td><td className="ax-num">{show(x.key, x.def)}</td><td className="ax-num">{show(x.key, x.ceiling)}</td>
        <td>{x.pending ? <>{show(x.key, x.pending.value)} takes effect <LocalTime t={x.pending.effective} /></> : ''}</td></tr>)}</tbody></table></div>
      <p className="ax-n">A limit is set in the environment on the machine that runs the autopilot. A tighter value applies at once. A looser one applies only after 24 hours unchanged. Nothing can exceed its ceiling.</p></Card>
    <Card title="Exposure">
      {r.exposure.length ? <div className="ax-scroll"><table className="ax-table"><caption>Open risk by asset class, as a share of paper equity</caption><thead><tr><th scope="col">Asset class</th><th scope="col" className="ax-num">Positions</th><th scope="col" className="ax-num">At risk</th><th scope="col" className="ax-num">Share</th></tr></thead>
        <tbody>{r.exposure.map(e => <tr key={e.assetClass}><th scope="row">{e.assetClass}</th><td className="ax-num">{e.positions}</td><td className="ax-num">{money(e.riskUsd)}</td><td className="ax-num">{share(e.riskPct, 2)}</td></tr>)}</tbody></table></div>
        : <p className="ax-n">No open positions, so no open risk.</p>}
    </Card>
    <Card title="Drift">
      {r.drift.length ? <div className="ax-scroll"><table className="ax-table"><caption>Each slot's drift reading against its alarm line</caption><thead><tr><th scope="col">Slot</th><th scope="col" className="ax-num">Reading</th><th scope="col" className="ax-num">Alarm line</th><th scope="col" className="ax-num">Pauses so far</th></tr></thead>
        <tbody>{r.drift.map(d => <tr key={d.slotKey}><th scope="row"><Link href={slotHref(d.slotKey)}>{d.slotKey}</Link></th><td className="ax-num">{ratio(d.cusum)}</td><td className="ax-num">{ratio(d.threshold)}</td><td className="ax-num">{d.pauses} of 3</td></tr>)}</tbody></table></div>
        : <p className="ax-n">No slot is in paper, so there is nothing to watch for drift.</p>}
    </Card>
    <Card>{r.activity.length ? <IntentsTable rows={r.activity} caption="Risk guard activity: the last 100 orders asked for" /> : <p className="ax-n">The risk guard has not been asked about an order yet.</p>}</Card>
    <Card>{r.history.length ? <div className="ax-scroll"><table className="ax-table"><caption>Halt history</caption><thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Level</th><th scope="col">Who</th><th scope="col">Why</th><th scope="col">Receipt</th></tr></thead>
      <tbody>{r.history.map(h => <tr key={h.seq}><td><LocalTime t={h.ts} /></td><th scope="row">{h.kind === 'halt' ? 'Halted' : 'Resumed'}</th><td>{h.level}</td><td>{h.by}</td><td>{h.reason}</td><td><Ref seq={h.seq} /></td></tr>)}</tbody></table></div>
      : <p className="ax-n">No halt has ever been recorded. That count should not stay at zero forever: a halt that is never pulled is a halt nobody trusts.</p>}
      <p className="ax-n">{FIXED.live}</p></Card>
  </div>;
}
