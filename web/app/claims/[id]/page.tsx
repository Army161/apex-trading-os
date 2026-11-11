import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FLAG_NAME, NOTICE } from '@apex/claims';
import { ChecksTable, Metric, Receipt, count, pct, ratio } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { claimDetail } from '@/lib/queries';
import { Card, Hash, NoLedger, Ref, pairHref, param } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
import { VerdictBanner } from '@/components/claims/ClaimView';
export const metadata = { title: 'Claim check result' };
export const dynamic = 'force-dynamic';
const SAID: Record<string, string> = { holds_up: 'These rules passed all seven checks on past data.', near_miss: 'These rules came close and did not pass.', no_edge: 'These rules did not beat random entries, costs and buy and hold.', untestable: 'Apex could not test this as stated.' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const d = claimDetail(l.view, l.entries, param((await params).id)); if (!d) notFound();
  const c = d.check;
  return <div className="grid">
    <VerdictBanner verdict={c.verdict} headline={SAID[c.verdict ?? ''] ?? 'No verdict was recorded.'}>
      <p className="ax-n">Check <code>{c.id}</code>, <LocalTime t={c.ts} />, entry <Ref seq={c.seq} />. {count(c.readings)} {c.readings === 1 ? 'reading' : 'readings'} run{c.untested ? `, ${c.untested} not run` : ''}. {NOTICE} <Link href="/claims">All checks</Link></p>
    </VerdictBanner>
    <Card><p className="ax-n">This page is rebuilt from the ledger. The source text is never stored, so its quotes and its claimed figures are not here. They are shown once, when the check is run. Source: {c.sourceKind}, {count(c.chars)} characters, content hash <Hash h={c.contentHash} />.</p></Card>
    {d.readings.map((r, i) => <Card key={i} title={`Reading ${i + 1}: ${r.strategy} on ${r.panel}`}>
      {r.proxy && <p className="ax-n">Run on a stand-in market, so it can at best be a near miss.</p>}
      {r.row ? <>
        {!r.row.error && <div className="grid g4">
          <div><Metric label="Return" value={r.row.ret} unit="pct" n={r.row.trades} nLabel="trades" basis="in-sample" net /></div>
          <div><Metric label="Sharpe" value={r.row.sharpe} unit="ratio" n={r.row.trades} nLabel="trades" basis="in-sample" net /></div><div><Metric label="Worst drawdown" value={r.row.dd} unit="pct" n={r.row.trades} nLabel="trades" basis="in-sample" net /></div></div>}
        {r.row.checks.length > 0 ? <div className="ax-scroll"><ChecksTable checks={r.row.checks} /></div> : <p>{r.row.error ? `It did not run: ${r.row.error}` : r.row.why}</p>}
        <p className="ax-n">Buying and holding over the same bars returned {pct(r.row.hold)}, with a Sharpe of {ratio(r.row.holdSharpe)}. <Link href={pairHref(r.row.trialKey)}>Open the full evaluation</Link>. Written down before it ran: {r.hypothesis || 'not recorded'}</p></>
        : <p className="ax-n">The trial for this reading is not in the ledger view.</p>}
      {r.rules ? <details className="ax-details"><summary>The rules in the form they were run</summary><pre className="ax-pre">{JSON.stringify(r.rules, null, 2)}</pre></details> : null}
    </Card>)}
    {d.readings.length === 0 && <Card><p>No reading of the rules could be run, so no try was used.</p></Card>}
    <Card title="Flags">{c.flags.length ? <ul className="ax-list">{c.flags.map(f => <li key={f}>{FLAG_NAME[f] ?? f.replace(/_/g, ' ')}</li>)}</ul> : <p className="ax-n">No flags.</p>}</Card>
    {d.earlier.length > 0 && <Card><p className="ax-n">The same text was checked before: {d.earlier.map(e => <span key={e.seq}><Ref seq={e.seq} /> </span>)}. Checking again does not use the tries again.</p></Card>}
    <Card title="Receipt"><Receipt entry={d.receipt} /></Card>
  </div>;
}
