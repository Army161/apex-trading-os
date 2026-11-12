import { count, utc } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { dataHealth } from '@/lib/queries';
import { Card, Hash, NoLedger, Ref } from '@/components/autopilot/parts';
export const metadata = { title: 'Data health' };
export const dynamic = 'force-dynamic';

const MARK: Record<string, [string, string, string]> = { ok: ['●', 'Healthy', 'acc'], warn: ['◐', 'Warning', 'warn'], blocked: ['✕', 'Blocked', 'bad'] };

export default async function Page() {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const rows = dataHealth(l.view, l.entries), blocked = rows.filter(r => r.status === 'blocked').length, held = rows.filter(r => !r.tradable && r.status !== 'blocked').length;
  if (!rows.length) return <Card><p className="ax-n">No dataset has been checked yet. The first run records one row per market and timeframe.</p></Card>;
  return <div className="grid">
    <Card><p>{count(rows.length)} datasets checked. {blocked ? `${blocked} blocked: nothing is tested or traded on them.` : 'None is blocked.'} {held ? `${held} can be tested but not traded, usually because the last bar is too old.` : ''}</p>
      <p className="ax-n">A blocked dataset is left out rather than repaired. The checks are age of the last bar, gaps, bad prints, and agreement with a second source where there is one.</p></Card>
    <Card><div className="ax-scroll"><table className="ax-table"><caption>Each dataset as the last run found it, problems first</caption>
      <thead><tr><th scope="col">Dataset</th><th scope="col">Health</th><th scope="col">Tradable</th><th scope="col" className="ax-num">Bars</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Source</th><th scope="col">Second source</th><th scope="col">Version</th><th scope="col">Receipt</th></tr></thead>
      <tbody>{rows.map(d => { const m = MARK[d.status] ?? ['?', d.status, 'warn']; return <tr key={d.dataset}><th scope="row"><code>{d.dataset}</code></th>
        <td><span className="ax-mark" data-tone={m[2]}><span aria-hidden="true">{m[0]}</span> {m[1]}</span>{d.warnings.length ? <span className="ax-n"> {d.warnings.join(', ')}</span> : null}</td>
        <td>{d.tradable ? 'Yes' : 'No'}</td><td className="ax-num">{count(d.rows)}</td><td>{d.first ? utc(d.first).slice(0, 10) : 'n/a'}</td><td>{d.last ? utc(d.last).slice(0, 10) : 'n/a'}</td><td>{d.source || 'not recorded'}</td><td>{d.second ?? 'none'}</td>
        <td><Hash h={d.version} /></td><td>{d.seq === null ? '' : <Ref seq={d.seq} />}</td></tr>; })}</tbody></table></div>
      <p className="ax-n">Dates are UTC. With no second source, a wrong price in the only feed would not be caught here.</p></Card>
  </div>;
}
