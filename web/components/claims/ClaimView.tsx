// How a claim check is drawn. Pure, so the same pieces serve the page a run returns and the page rebuilt from the ledger.
// Anything that came from the source or the model is shown as a quote or a list item, never as Apex's own sentence.
import type { ClaimExtraction, ClaimResult, Flag, RuleSetResult, Tested } from '@apex/claims';
import { ChecksTable, ClaimCompare, Metric, SourceQuote, StatusChip, VERDICT_STATUS, count, shortHash } from '@apex/ui';

export type FlagNames = Record<string, string>;
const flagName = (names: FlagNames, k: string) => names[k] ?? k.replace(/_/g, ' ');
type Verdict = keyof typeof VERDICT_STATUS;

export function VerdictBanner({ verdict, headline, children }: { verdict: string | null; headline: string; children?: React.ReactNode }) {
  const def = verdict && verdict in VERDICT_STATUS ? VERDICT_STATUS[verdict as Verdict] : null;
  return <div className="ax-verdict" data-verdict={verdict ?? 'waiting'}>
    <p className="ax-verdict-name">{def ? <StatusChip def={def} /> : <span className="ax-chip">Waiting</span>}</p>
    <p className="ax-verdict-line">{headline}</p>{children}
  </div>;
}

export function Flags({ flags, names }: { flags: Flag[]; names: FlagNames }) {
  if (!flags.length) return <p className="ax-n">No flags.</p>;
  return <ul className="ax-list">{flags.map((f, i) => <li key={i}><strong>{flagName(names, f.kind)}</strong>: {f.detail}{f.evidence ? <blockquote className="ax-inline-quote">{f.evidence.quote}</blockquote> : null}</li>)}</ul>;
}

export function RulesAsExtracted({ x, index }: { x: ClaimExtraction; index: number }) {
  const rs = x.ruleSets[index]; if (!rs) return null;
  const parts: [string, { text: string; evidence: { quote: string; offset: number } }][] = [...rs.entry.map(r => ['Entry', r] as [string, typeof r]), ...rs.filters.map(r => ['Filter', r] as [string, typeof r]), ...rs.exit.map(r => ['Exit', r] as [string, typeof r]),
    ...(rs.stop ? [['Stop', rs.stop] as [string, typeof rs.stop]] : []), ...(rs.target ? [['Target', rs.target] as [string, typeof rs.target]] : [])];
  return <div className="ax-rules-x">
    <p className="ax-n">Market: {rs.market.join(', ') || 'not stated'}. Timeframe: {rs.timeframe.join(', ') || 'not stated'}. Direction: {rs.direction}. How much judgment the rules leave open: {rs.ambiguity}.</p>
    {parts.map(([kind, r], i) => <SourceQuote key={i} kind={kind} text={r.text} quote={r.evidence.quote} offset={r.evidence.offset} />)}
    {!rs.stop && <p className="ax-n">Stop: none stated.</p>}{rs.sizing ? <p className="ax-n">Sizing, as the source puts it: {rs.sizing}</p> : null}
    {rs.assumptions.length > 0 && <><p>Gaps that had to be filled ({rs.assumptions.length}):</p><ul className="ax-list">{rs.assumptions.map((a, i) => <li key={i}>{a.what}: used {a.chosen}{a.alternatives.length ? ` (could also be ${a.alternatives.join(', ')})` : ''}</li>)}</ul></>}
  </div>;
}

function Reading({ t, best }: { t: Tested; best: boolean }) {
  const m = t.metrics, ctx = { n: m.trades, nLabel: 'trades', basis: 'in-sample' as const, net: true };
  return <div className="ax-reading">
    <h3>{best ? 'Best reading: ' : 'Reading: '}{t.label}</h3>
    <p className="ax-n">Run as {'template' in t.rules ? <>strategy family <code>{t.rules.template}</code></> : <>custom rules (<code>{t.strategyId}</code>)</>} on {t.data.symbol} {t.data.tf}, {count(t.data.rows)} bars.{t.proxy ? ` ${t.proxy}` : ''}{t.recorded ? '' : ' Already in the ledger, so it was not counted again.'}</p>
    {t.checks.length ? <>
      <div className="grid g4">
        <div><Metric label="Return" value={m.ret} unit="pct" {...ctx} /></div><div><Metric label="Buy and hold, same bars" value={m.hold} unit="pct" n={t.data.rows} nLabel="bars" basis="in-sample" /></div>
        <div><Metric label="Sharpe" value={m.sharpe} unit="ratio" {...ctx} /></div><div><Metric label="Worst drawdown" value={m.dd} unit="pct" {...ctx} /></div>
      </div>
      <div className="ax-scroll"><ChecksTable checks={t.checks} /></div></> : <p>The rules could not be run on this data: {t.why}</p>}
  </div>;
}

function RuleSetBlock({ rs, r, many }: { rs: RuleSetResult; r: ClaimResult; many: boolean }) {
  const all = r.ruleSets.flatMap(s => s.tested);
  return <section className="card">
    {many && <VerdictBanner verdict={rs.verdict} headline={`${rs.name}: ${rs.headline}`} />}
    {rs.tested.map((t, i) => <Reading key={i} t={t} best={rs.tested.length > 1 && all.indexOf(t) === rs.best} />)}
    {rs.untested.map((u, i) => <p key={i} className="ax-n">Not run, “{u.label}”: {u.missing.join('; ')}.</p>)}
    {r.extraction ? <><h3>The rules as extracted{many ? ` (${rs.name})` : ''}</h3><RulesAsExtracted x={r.extraction} index={rs.index} /></> : null}
  </section>;
}

/** The whole result, in the order of docs/design/05 s6: verdict, claimed and measured, checks, rules, not tested, flags, receipt. */
export function ClaimResultView({ r, names, notice, seq }: { r: ClaimResult; names: FlagNames; notice: string; seq?: number | null }) {
  const tested = r.ruleSets.flatMap(s => s.tested), notTested = [...new Set(r.ruleSets.flatMap(s => [...s.tested.flatMap(t => [...t.notTested, ...(t.proxy ? [t.proxy] : [])]), ...s.untested.flatMap(u => u.missing)]))];
  return <div className="grid">
    <VerdictBanner verdict={r.verdict} headline={r.headline}>
      <p className="ax-n">{r.title}. The rules as extracted, {tested.length} {tested.length === 1 ? 'reading' : 'readings'}, {r.tries.fresh} new {r.tries.fresh === 1 ? 'try' : 'tries'}. Tries so far: {count(r.tries.everAfter)}.{seq ? ` Ledger entry #${count(seq)}.` : ''} {notice}</p>
    </VerdictBanner>
    {r.claims.length > 0 && <section className="card"><ClaimCompare rows={r.claims} /></section>}
    {r.ruleSets.map(rs => <RuleSetBlock key={rs.index} rs={rs} r={r} many={r.ruleSets.length > 1} />)}
    <section className="card"><h2 className="ax-card-title">What was not tested</h2>
      <ul className="ax-list">{notTested.map((n, i) => <li key={i}>{n}</li>)}<li>Whether the rules will work from here on. Only forward paper trading can show that.</li></ul></section>
    <section className="card"><h2 className="ax-card-title">Flags</h2><Flags flags={r.flags} names={names} /></section>
    <section className="card"><h2 className="ax-card-title">Receipt</h2>
      <p className="ax-n">Check <code>{r.id}</code>. Source: {r.sourceKind}, {count(r.chars)} characters, content hash <code title={r.contentHash}>{shortHash(r.contentHash)}</code>. The source text is not stored. Gate <code>{r.receipt.gateVersion.slice(0, 12)}</code>, cost model <code>{r.receipt.costModelVersion.slice(0, 12)}</code> (costs assumed), engine <code>{r.receipt.engineFingerprint.slice(0, 12)}</code>.</p>
      <p><a href={`/claims/${r.id}`}>Open this check as the ledger holds it</a></p></section>
  </div>;
}
