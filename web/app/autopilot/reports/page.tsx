import Link from 'next/link';
import { count } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { runs } from '@/lib/queries';
import { Card, NoLedger, Ref } from '@/components/autopilot/parts';
import LocalTime from '@/components/LocalTime';
export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';
const SHOW = 100;

export default async function Page() {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const rs = runs(l.entries);
  if (!rs.length) return <Card><p className="ax-n">No run has finished yet, so there is no report.</p></Card>;
  return <Card><div className="ax-scroll"><table className="ax-table"><caption>Runs, newest first{rs.length > SHOW ? ` (latest ${SHOW} of ${count(rs.length)})` : ''}. Each wrote one report</caption>
    <thead><tr><th scope="col">Run</th><th scope="col">When</th><th scope="col">Kind</th><th scope="col" className="ax-num">Pairs evaluated</th><th scope="col" className="ax-num">New tries</th><th scope="col" className="ax-num">Orders asked</th><th scope="col" className="ax-num">Blocked</th><th scope="col" className="ax-num">Paper fills</th><th scope="col" className="ax-num">Errors</th><th scope="col">Receipt</th></tr></thead>
    <tbody>{rs.slice(0, SHOW).map(r => <tr key={r.seq}><th scope="row"><Link href={`/autopilot/reports/${encodeURIComponent(r.id)}`}>{r.id}</Link></th><td><LocalTime t={r.ts} /></td><td>{r.mode}</td><td className="ax-num">{count(r.evaluated)}</td><td className="ax-num">{count(r.newTrials)}</td>
      <td className="ax-num">{count(r.intents)}</td><td className="ax-num">{count(r.blocked)}</td><td className="ax-num">{count(r.fills)}</td>
      <td className="ax-num">{r.errors ? <span className="ax-mark" data-tone="bad"><span aria-hidden="true">✕</span> {count(r.errors)}</span> : '0'}</td><td><Ref seq={r.seq} /></td></tr>)}</tbody></table></div>
    <p className="ax-n">A full run tests new pairs and trades the paper book. A tick only trades the paper book.</p></Card>;
}
