import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChecksTable, Metric, Receipt, StatusChip, WhyNot, count, ratio, share, utc } from '@apex/ui';
import { loadLedger } from '@/lib/ledger';
import { pair } from '@/lib/queries';
import { Card, Hash, NoLedger, Ref, param, receiptHref, slotHref } from '@/components/autopilot/parts';
export const metadata = { title: 'Pair' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const l = await loadLedger(); if (!l.ok) return <NoLedger state={l} />;
  const p = pair(l.view, l.entries, param((await params).key)); if (!p) notFound();
  const r = p.row, failed = r.checks.filter(c => !c.pass), basis = { n: r.trades, nLabel: 'trades', basis: 'in-sample' as const, net: true, receipt: r.seq, receiptHref: receiptHref(r.seq) };
  return <div className="grid">
    <Card>
      <div className="ax-titleline"><h2 className="ax-card-title">{r.strategy} on {r.symbol} {r.tf}</h2><StatusChip status={r.status} />{r.slotKey ? <Link href={slotHref(r.slotKey)}>Open its slot</Link> : null}</div>
      <p>{r.error ? `This pair did not run: ${r.error}` : r.why}</p>
      <p className="ax-n">A result on past data. It says the rule survived the checks on history, which is the start of the evidence, not the end of it.</p>
    </Card>
    {!r.error && <div className="grid g4">
      <Card><Metric label="Return" value={r.ret} unit="pct" {...basis} /></Card>
      <Card><Metric label="Buy and hold, same bars" value={r.hold} unit="pct" n={p.data?.rows ?? 0} nLabel="bars" basis="in-sample" /></Card>
      <Card><Metric label="Sharpe" value={r.sharpe} unit="ratio" {...basis} /><p className="ax-n">Buy and hold: {ratio(r.holdSharpe)}{p.tStat === null ? '' : `. t-stat ${ratio(p.tStat)}`}</p></Card>
      <Card><Metric label="Worst drawdown" value={r.dd} unit="pct" {...basis} /><p className="ax-n">Buy and hold: {share(r.holdDd)}</p></Card>
    </div>}
    {!r.error && r.checks.length > 0 && <Card><div className="ax-scroll"><ChecksTable checks={r.checks} /></div></Card>}
    {failed.length > 0 && <Card><WhyNot title="Why it did not pass" rules={failed.map(c => ({ id: `check ${c.n}`, text: c.name, detail: c.why }))} /></Card>}
    <Card title="How much luck could explain it">
      <p>{r.dsr === null ? 'No deflated figure was recorded for this pair.' : <>After counting all <strong>{count(r.nTrials ?? 0)}</strong> tries so far, the chance this Sharpe is more than luck is <strong>{share(r.dsr)}</strong>. The forward gate asks for 95%.</>}</p>
      <p className="ax-n">Trying many rules makes a lucky one likely. The count only goes up, and every try is in the ledger.</p>
    </Card>
    <Card title="Written down before it ran">
      <p>{p.hypothesis || 'No hypothesis text was recorded.'}</p>
      <p className="ax-n">Pass bar: {p.passBar || 'not recorded'}. Source: <code>{r.source}</code>.{p.preregSeq ? <> Pre-registration <Ref seq={p.preregSeq} />, result <Ref seq={r.seq} />.</> : null}</p>
    </Card>
    <Card title="Independent validator">
      {p.validator.length ? <div className="ax-scroll"><table className="ax-table"><caption>Each run repeats the test from the recorded inputs</caption>
        <thead><tr><th scope="col">Run</th><th scope="col">For</th><th scope="col">Level</th><th scope="col">Result</th><th scope="col">Data source</th></tr></thead>
        <tbody>{p.validator.map(x => <tr key={x.seq}><th scope="row"><Ref seq={x.seq} /></th><td>{x.purpose}</td><td>{x.level}</td>
          <td><span className="ax-mark" data-tone={x.agrees ? 'acc' : 'bad'}><span aria-hidden="true">{x.agrees ? '●' : '✕'}</span> {x.agrees ? (x.exact ? 'Agrees exactly' : 'Agrees within tolerance') : `Disagrees${x.diffs.length ? `: ${x.diffs.join('; ')}` : ''}`}</span></td>
          <td>{x.source === 'same' ? 'Same bars (catches bugs, not bad data)' : x.source}</td></tr>)}</tbody></table></div>
        : <p className="ax-n">{r.status === 'passed_pending_validation' ? 'Waiting for the validator. Nothing is promoted by the run that found it.' : 'The validator only re-runs pairs that pass all seven checks.'}</p>}
    </Card>
    {p.inputs && <Card title="Exactly what was tested">
      <dl className="ax-receipt-card">
        <dt>Strategy fingerprint</dt><dd><Hash h={p.inputs.strategyFingerprint} /></dd>
        <dt>Data</dt><dd>{p.inputs.datasets.map(d => <span key={d.id}><code>{d.id}</code> version <Hash h={d.version} /> </span>)}{p.data ? <span className="ax-n">{count(p.data.rows)} bars, {utc(p.data.first).slice(0, 10)} to {utc(p.data.last).slice(0, 10)}</span> : null}</dd>
        <dt>Gate version</dt><dd><Hash h={p.inputs.gateVersion} /></dd><dt>Cost model</dt><dd><Hash h={p.inputs.costModelVersion} /> <span className="ax-n">assumed, not measured</span></dd>
        <dt>Engine</dt><dd><Hash h={p.inputs.engineFingerprint} /></dd><dt>Seed</dt><dd>{p.inputs.seed ?? 'none'}</dd>
      </dl>
    </Card>}
    {p.receipt && <Card title="Receipt"><Receipt entry={p.receipt} /></Card>}
  </div>;
}
