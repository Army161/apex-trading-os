// Daily report (docs/design/04 s15). Fixed template, fixed wording, golden-file tested. S15: no performance number appears
// without its sample size and whether it is in-sample or forward.
export type QueueItem = { id: string; kind: 'variant' | 'new_rule' | 'data' | 'near_miss' | 'gap' | 'claim'; title: string; why: string; source: string; needs: string[]; cost: { trials: number; aiUsd: number }; status: 'proposed' | 'approved' | 'running' | 'done' | 'dropped'; createdBy: string };
export type ReportData = {
  at: number; runId: string; mode: string; commit: string; gateVersion: string; durable: boolean;
  status: { halts: string[]; dataProblems: string[]; waiting: string[]; problems: string[] };
  funnel: { pairs: number; evaluated: number; errors: number; newTrials: number; n: number; m: number; byStatus: Record<string, number>; waitingBudget: number; skipped: number };
  book: { equity: number; cash: number; peak: number; capital: number; dayPnl: number; weekPnl: number; drawdown: number; openRisk: number; closedTrades: number; positions: { slotKey: string; symbol: string; side: number; qty: number; entry: number; stop: number; riskUsd: number }[] };
  slots: { slotKey: string; status: string; role: string; shadowOf: string | null; weight: number; riskFraction: number; lockedAt: number; months: number; trades: number; tradesNeeded: number; ret: number; dd: number; dsrM: number; dsrN: number; cusum: number; driftPauses: number; grad: string; clock: string; bookTrades: number }[];
  intents: { slotKey: string; symbol: string; side: number; barT: number; qty: number; riskUsd: number; stop: number }[];
  blocks: { slotKey: string; symbol: string; side: number; barT: number; rules: string[] }[];
  fills: { slotKey: string; kind: string; t: number; price: number; qty: number }[];
  nearMisses: { strategy: string; symbol: string; tf: string; status: string; passed: number; of: number; trades: number; ret: number; hold: number; sharpe: number; holdSharpe: number; dd: number; failed: string[] }[];
  queue: QueueItem[];
  data: { dataset: string; status: string; tradable: boolean; source: string; second: string | null; version: string; rows: number; last: number; adj: string; warnings: string[] }[];
  costs: { version: string; anyMeasured: boolean; note: string };
  ledger: { added: number; headSeqBefore: number; digest: string };
};

export const FIRST_LINE = 'Paper mode. Nothing here is proven or guaranteed.';
export const NOTHING_PASSED = 'Nothing has passed yet. The diversified core is the benchmark.';
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`, usd = (x: number) => `$${x.toFixed(2)}`, day = (t: number) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'n/a');
const STATUS_ORDER = ['in_paper', 'passed_pending_validation', 'watch', 'needs_data', 'rejected'];
const STATUS_WORDS: Record<string, string> = { in_paper: 'in paper', passed_pending_validation: 'passed, waiting for the validator', watch: 'one check short', needs_data: 'needs more trades', rejected: 'rejected' };

export function renderReport(r: ReportData, head?: { seq: number; hash: string } | null): string {
  const L: string[] = [], s = r.status;
  L.push(`# Apex daily report, ${new Date(r.at).toISOString().slice(0, 10)}`, '', FIRST_LINE, '');
  L.push('## 1. Status', '', `- Mode: paper. Run \`${r.runId}\` (${r.mode}) at commit \`${r.commit.slice(0, 12) || 'unknown'}\`.`);
  L.push(`- Halts: ${s.halts.length ? s.halts.join('; ') : 'none'}.`, `- Data problems: ${s.dataProblems.length ? s.dataProblems.join('; ') : 'none'}.`, `- Waiting on Jeremy or the validator: ${s.waiting.length ? s.waiting.join('; ') : 'nothing'}.`);
  if (!r.durable) L.push('- There is no durable ledger, so no paper order can be opened. Set `DATABASE_URL` or use the file ledger.');
  for (const p of s.problems) L.push(`- Problem: ${p}.`);
  const f = r.funnel;
  L.push('', '## 2. Funnel', '', `- Strategy and market pairs: ${f.pairs}. Evaluated this run: ${f.evaluated}${f.errors ? ` (${f.errors} errored and are recorded as failed trials)` : ''}. New trials this run: ${f.newTrials}.`,
    `- Trials ever (N): ${f.n}. Slots ever locked into paper (M): ${f.m}.`);
  const st = STATUS_ORDER.filter(k => f.byStatus[k]).map(k => `${STATUS_WORDS[k]} ${f.byStatus[k]}`); L.push(`- Where the ${f.n} trials stand: ${st.length ? st.join(', ') : 'none yet'}.`);
  if (f.waitingBudget) L.push(`- ${f.waitingBudget} new pairs wait for the weekly trial budget.`); if (f.skipped) L.push(`- ${f.skipped} pairs skipped because their data is blocked (not counted as trials).`);
  const b = r.book;
  L.push('', '## 3. Paper book', '', `- Equity ${usd(b.equity)} from a start of ${usd(b.capital)} (${pct(b.equity / b.capital - 1, 2)}, forward, paper, ${b.closedTrades} closed trades, costs assumed).`,
    `- Today ${usd(b.dayPnl)}, this week ${usd(b.weekPnl)}, drawdown from peak ${pct(b.drawdown, 2)}, open risk ${usd(b.openRisk)}.`, '- Benchmarks: the diversified core is not built yet (it needs the long daily history). No comparison is shown rather than a wrong one.');
  if (b.positions.length) { L.push('', '| Slot | Side | Qty | Entry | Stop | Risk |', '|---|---|---|---|---|---|'); for (const p of b.positions) L.push(`| ${p.slotKey} | ${p.side === 1 ? 'long' : 'short'} | ${p.qty} | ${p.entry.toFixed(2)} | ${p.stop.toFixed(2)} | ${usd(p.riskUsd)} |`); }
  else L.push('- No open positions.');
  L.push('', '## 4. Slots', '');
  if (!r.slots.length) L.push(NOTHING_PASSED);
  else { L.push('| Slot | Status | Weight | Forward months | Forward trades | Forward return | Deflated Sharpe (M / N) | Drift | Graduation |', '|---|---|---|---|---|---|---|---|---|');
    for (const x of r.slots) L.push(`| ${x.slotKey} | ${x.status}${x.role === 'shadow' ? ` (shadow of ${x.shadowOf})` : ''} | ${(x.weight * 100).toFixed(0)}% | ${x.months.toFixed(1)} | ${x.trades} of ${x.tradesNeeded} | ${pct(x.ret)} (n=${x.trades}, forward) | ${(x.dsrM * 100).toFixed(0)}% / ${(x.dsrN * 100).toFixed(0)}% | CUSUM ${x.cusum.toFixed(2)}, ${x.driftPauses} pauses | ${x.grad}: ${x.clock} |`); }
  L.push('', '## 5. New intents and blocks', '');
  if (!r.intents.length && !r.blocks.length && !r.fills.length) L.push('None this run.');
  for (const i of r.intents) L.push(`- Intent: ${i.slotKey} ${i.side === 1 ? 'long' : 'short'} ${i.qty} ${i.symbol}, stop ${Number(i.stop).toFixed(2)}, risk ${usd(i.riskUsd)}, signal bar ${day(i.barT)}.`);
  for (const x of r.blocks) L.push(`- Blocked: ${x.slotKey} ${x.side === 1 ? 'long' : 'short'} ${x.symbol} on ${day(x.barT)}. Rules: ${x.rules.join(', ')}.`);
  for (const x of r.fills) L.push(`- Fill: ${x.slotKey} ${x.kind} ${x.qty} at ${x.price.toFixed(2)} on ${day(x.t)} (paper).`);
  L.push('', '## 6. Closest near misses', '', 'In-sample results on past data. None of these is in paper.', '');
  if (!r.nearMisses.length) L.push('None yet.');
  else { L.push('| Strategy | Market | Checks | Trades | Return | Hold | Sharpe | Hold Sharpe | Fails |', '|---|---|---|---|---|---|---|---|---|');
    for (const n of r.nearMisses) L.push(`| ${n.strategy} | ${n.symbol} ${n.tf} | ${n.passed} of ${n.of} | ${n.trades} | ${pct(n.ret)} | ${pct(n.hold)} | ${n.sharpe.toFixed(2)} | ${n.holdSharpe.toFixed(2)} | ${n.failed.join('; ') || 'none'} |`); }
  L.push('', '## 7. Research queue', '');
  if (!r.queue.length) L.push('No new items.'); else for (const q of r.queue.slice(0, 15)) L.push(`- ${q.title}. ${q.why}`.replace(/\.\.$/, '.'));
  if (r.queue.length > 15) L.push(`- and ${r.queue.length - 15} more.`);
  L.push('', '## 8. Where the data came from', '', '| Dataset | Source | Second source | Bars | Last bar | Adjustment | Health |', '|---|---|---|---|---|---|---|');
  for (const d of r.data) L.push(`| ${d.dataset} | ${d.source} | ${d.second ?? 'none'} | ${d.rows} | ${day(d.last)} | ${d.adj} | ${d.status}${d.tradable ? '' : ', not tradable'}${d.warnings.length ? `: ${d.warnings.join('; ')}` : ''} |`);
  L.push('', '## 9. Costs', '', `Cost model \`${r.costs.version}\`: ${r.costs.note}.`);
  L.push('', '## 10. Ledger', '', `Entries added this run: ${r.ledger.added}. ${head ? `Head: seq ${head.seq}, hash \`${head.hash}\`.` : `Run digest \`${r.ledger.digest.slice(0, 16)}\`.`} Gate version \`${r.gateVersion.slice(0, 12)}\`.`, '');
  return L.join('\n');
}

/** Sections 1 to 5, shortened, for Telegram. */
export function renderShort(r: ReportData): string {
  const f = r.funnel, b = r.book, inPaper = r.slots.filter(s => s.status !== 'retired').length;
  return [FIRST_LINE, `Run ${r.mode}: ${f.evaluated} evaluated, ${f.newTrials} new trials, N=${f.n}, M=${f.m}.`,
    `Halts: ${r.status.halts.length ? r.status.halts.join('; ') : 'none'}. Data: ${r.status.dataProblems.length ? `${r.status.dataProblems.length} problems` : 'ok'}.`,
    `Book ${usd(b.equity)} (${pct(b.equity / b.capital - 1, 2)} forward paper, ${b.closedTrades} trades), drawdown ${pct(b.drawdown, 2)}.`,
    inPaper ? `Slots in paper: ${inPaper}.` : NOTHING_PASSED, `Intents ${r.intents.length}, blocked ${r.blocks.length}, fills ${r.fills.length}.`,
    ...(r.status.waiting.length ? [`Waiting: ${r.status.waiting.slice(0, 3).join('; ')}.`] : [])].join('\n');
}
