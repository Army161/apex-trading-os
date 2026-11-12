import { notFound } from 'next/navigation';
import { count, ratio, shortHash } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { publicReceipts, receiptsOn, type Ref } from '@/lib/receipts';
import { Card } from '@/components/autopilot/parts';
export const metadata = { title: 'Receipts' };
export const dynamic = 'force-dynamic';

// Dates here are UTC days from the ledger, written out on the server, so every reader sees the same page.
const R = ({ r }: { r: Ref | null }) => r ? <>#{count(r.seq)} <code title={r.hash}>{shortHash(r.hash)}</code></> : <>none</>;
export default async function Page() {
  if (!(await receiptsOn())) notFound();                                     // off by default: the page does not exist until it is switched on
  const l = await loadLedger(); if (!l.ok) return <div className="grid"><Card><p>There is no ledger to show yet.</p></Card></div>;
  const d = publicReceipts(l.view, l.entries);
  return <div className="grid">
    <Card><p>This is a paper-trading record. No real money was traded. Each strategy below was locked on the date shown and has been judged only on what happened after that date. Results are in units of risk (R): +1R is one planned loss won, -1R is one planned loss lost. Slots that were retired stay on this page.</p>
      <p className="ax-n">Paper results are not a forward record with real money, and nothing here is advice. The ledger holds {count(d.entries)} entries. Its head is <R r={d.head} />.</p></Card>
    {d.slots.length ? d.slots.map(s => <Card key={s.name} title={`${s.strategy} on ${s.market} ${s.timeframe}`}>
      <p className="ax-n">Status: {s.status.replace(/_/g, ' ')} ({s.role}). Locked {s.locked}, entry <R r={s.lock} />.{s.lastCheck ? <> Last monthly check ({s.lastCheck.month}): {s.lastCheck.state.replace(/_/g, ' ')}, entry <R r={s.lastCheck} />.</> : ' No monthly check has run yet.'}</p>
      {s.n ? <><p>{count(s.n)} closed {s.n === 1 ? 'trade' : 'trades'} since the lock, {count(s.wins)} won. Total {ratio(s.totalR)}R, average {s.avgR === null ? 'n/a' : `${ratio(s.avgR)}R`} a trade (n={count(s.n)}, forward paper, after assumed costs).</p>
        <div className="ax-scroll"><table className="ax-table"><caption>Every closed trade since the lock, oldest first, with the ledger entries of its fills</caption>
          <thead><tr><th scope="col">Closed (UTC)</th><th scope="col">Side</th><th scope="col" className="ax-num">Result in R</th><th scope="col">Exit</th><th scope="col">Entry fill</th><th scope="col">Exit fill</th></tr></thead>
          <tbody>{s.trades.map(t => <tr key={t.fill.seq}><td>{t.closed}</td><td>{t.side}</td><td className="ax-num">{ratio(t.r)}</td><td>{t.exit}</td><td><R r={t.entry} /></td><td><R r={t.fill} /></td></tr>)}</tbody></table></div></>
        : <p>No trade has closed since the lock.</p>}
    </Card>) : <Card><p>No strategy has been locked into paper yet.</p></Card>}
    <Card title="Anchors">
      {d.anchors.length ? <><p>Once a day the ledger's head is saved to a dated file in the project's history. An entry is covered when an anchor was made after it. Entries up to #{count(d.lastAnchored)} are covered{d.head && d.head.seq > d.lastAnchored + 1 ? `; entries after that are not yet` : ''}.</p>
        <div className="ax-scroll"><table className="ax-table"><caption>{d.anchors.length === 1 ? 'The one anchor so far' : `The last ${d.anchors.length} anchors, newest first`}</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Head saved</th><th scope="col">Recorded as entry</th><th scope="col">File</th></tr></thead>
          <tbody>{d.anchors.map(a => <tr key={a.seq}><td>{a.date}</td><td>#{count(a.covers)} <code title={a.hash}>{shortHash(a.hash)}</code></td><td>#{count(a.seq)}</td><td>{a.file ? <code>{a.file}</code> : 'not recorded'}</td></tr>)}</tbody></table></div></>
        : <p>No anchor has been made yet, so nothing on this page is dated by anything but the ledger itself.</p>}
    </Card>
    <Card title="How to check this page">
      <ol className="ax-list">
        <li>Get the ledger file and the <code>heads</code> folder from the project's state branch.</li>
        <li>Run <code>npm run apex -- ledger verify</code>. It recomputes every entry's hash from the one before it, and checks each saved head against the chain. A ledger changed after a head was saved fails.</li>
        <li>Run <code>npm run apex -- ledger show</code> with an entry number from this page. The hash it prints should start with the characters shown here.</li>
        <li>Check the dates of the files in <code>heads</code> in the branch's history. A head cannot have been saved before the entries it covers existed.</li>
      </ol>
      <p className="ax-n">What this proves: the record was not edited after each anchor. What it does not prove: that the strategy will keep working, or that anyone could have traded at these prices.</p>
    </Card>
  </div>;
}
