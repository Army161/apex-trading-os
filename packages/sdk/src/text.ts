// The words for each shape in the contract (docs/design/08 s2 and s4, 10 s1.1). The terminal prints them and the MCP server
// sends them beside the data, so a figure reads the same in both. Every function takes the API's own shapes and returns
// text. A figure is never printed bare: a table that shows performance carries n, basis and net, as the Metric rule asks.
// Statuses are words, so nothing depends on colour.
import type { Book, ClaimCheck, ClaimCheckRow, Costs, DataHealth, DriftReading, Evaluation, EvaluationDetail, Fill, Funnel, Intent, LedgerEntry, LedgerHead, LedgerRow, LedgerVerify, Locks, Metric, Position, Queue, ReportRow, Risk, Slot, SlotDetail, SlotEvent, Status, Trade } from './contract';

export const table = (rows: (string | number | null)[][]) => { const w = rows[0].map((_, c) => Math.max(...rows.map(r => String(r[c] ?? '').length))); return rows.map(r => r.map((x, c) => String(x ?? '').padEnd(w[c])).join('  ').trimEnd()).join('\n'); };
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
export const share = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`, usd = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') + 'Z' : 'never');
const short = (h: string, n = 12) => h.slice(0, n), BASIS = { in_sample: 'past data', forward: 'forward', book: 'paper book' } as const;
/** A figure in words for its unit. */
export const fig = (m: Metric | null) => m === null ? '-' : m.unit === 'pct' ? pct(m.value) : m.unit === 'usd' ? usd(m.value) : m.unit === 'prob' ? share(m.value) : m.unit === 'count' ? String(m.value) : m.value.toFixed(2);
/** What a figure is based on, for a line of text: "past data, after costs, n=51". */
export const based = (m: Metric) => `${BASIS[m.basis]}, ${m.net ? 'after costs' : 'no costs'}, n=${m.n}`;
const net = (m: Metric) => (m.net ? 'yes' : 'no');

/** The first line of every command that touches the paper book: the mode and the count of tries. */
export function header(s: Status): string {
  const tries = s.trials === null ? 'tries unknown (no ledger)' : `${s.trials} ${s.trials === 1 ? 'try' : 'tries'} counted`;
  const data = s.data === 'ok' ? 'data ok' : s.data === 'unknown' ? 'data not checked yet' : `data ${s.data} (${(s.data === 'blocked' ? s.dataBlocked : s.dataStale).length})`;
  return `${s.mode === 'live' ? 'LIVE' : 'PAPER'} · ${tries} · ${data} · ${s.halts.length ? `HALTED: ${s.halts.map(h => h.level).join(', ')}` : 'no halts'}`;
}

export function statusText(s: Status, slots: Slot[], b: Book | null): string {
  const out = [header(s), `Ledger     ${s.ledger}, ${s.entries} entries`, `Last run   ${s.lastRun ? `${s.lastRun.id} (${s.lastRun.mode}) at ${when(s.lastRun.ts)}` : 'never'}`];
  for (const h of s.halts) out.push(`Halt       ${h.level}, by ${h.by}: ${h.reason}`);
  if (s.dataBlocked.length) out.push(`Blocked    ${s.dataBlocked.join(', ')}`);
  const active = slots.filter(x => x.status !== 'retired');
  out.push('', 'SLOTS', active.length ? slotsText(active) : 'Nothing has passed yet. The diversified core is the benchmark.');
  if (b) out.push('', bookLine(b));
  out.push('', 'Paper mode. Nothing here is proven or guaranteed.');
  return out.join('\n');
}

export const slotsText = (slots: Slot[]) => slots.length ? table([['slot', 'status', 'role', 'weight', 'locked', 'fwd trades', 'drift', 'last check'],
  ...slots.map(x => [x.slotKey, x.status, x.role, share(x.weight, 0), when(x.lockedAt), x.forwardTrades, x.drift.cusum.toFixed(2), x.graduation.state ? `${x.graduation.state} (${x.graduation.month})` : 'none yet'])]) : 'No slot has been locked yet.';

const bookLine = (b: Book) => `BOOK (${based(b.equity)})\nequity ${fig(b.equity)}   change ${fig(b.change)}   day ${share(b.lossUsed.day)} of ${share(b.limits.dailyLossPct, 0)}   week ${share(b.lossUsed.week)} of ${share(b.limits.weeklyLossPct, 0)}   drawdown ${share(b.lossUsed.fromPeak)} of ${share(b.limits.maxDrawdownPct, 0)}   open ${b.openPositions}`;
export function bookText(b: Book): string {
  return [bookLine(b), `cash ${usd(b.cash)}   peak ${usd(b.peak)}   started at ${usd(b.capital)}${b.since ? ` on ${b.since.slice(0, 10)}` : ''}   closed trades ${b.closedTrades}${b.drawdownPaused ? '   DRAWDOWN PAUSE ON' : ''}`,
    b.costs ? (b.costs.measured ? `Costs: ${b.costs.measured} rows measured from paper fills, ${b.costs.assumed} still assumed.` : 'Costs: every cost is assumed, not measured.') : 'Costs: no cost model is recorded yet.',
    'A limit that is reached stops new entries. It never closes a position by itself. No real money is in this book.'].join('\n');
}
export const positionsText = (p: Position[]) => p.length ? table([['slot', 'symbol', 'side', 'qty', 'entry', 'stop', 'at risk', 'share', 'since'], ...p.map(x => [x.slotKey, x.symbol, x.side, x.qty, x.entry.toFixed(2), x.stop.toFixed(2), usd(x.riskUsd), share(x.riskPct, 2), when(x.since)])]) : 'No open positions.';
export const fillsText = (f: Fill[]) => f.length ? table([['seq', 'when', 'slot', 'kind', 'price', 'qty'], ...f.map(x => [x.seq, when(x.at), x.slotKey, x.kind, x.price.toFixed(2), x.qty])]) : 'No paper fills yet.';
export const tradesText = (t: Trade[]) => t.length ? table([['slot', 'side', 'entered', 'exited', 'entry', 'exit', 'qty', 'result', 'R', 'exit reason', 'basis', 'net'],
  ...t.map(x => [x.slotKey, x.side, when(x.entryAt), when(x.exitAt), x.entry.toFixed(2), x.exit.toFixed(2), x.qty, usd(x.pnl), x.r.toFixed(2), x.reason, 'forward', 'yes'])]) : 'No forward trades yet. This is the only record that counts toward going live.';
export const intentsText = (i: Intent[]) => i.length ? table([['seq', 'when', 'slot', 'side', 'guard', 'qty', 'at risk', 'rule'], ...i.map(x => [x.seq, when(x.ts), x.slotKey, x.side, x.ok ? 'allowed' : 'BLOCKED', x.qty ?? '', x.riskUsd === null ? '' : usd(x.riskUsd), x.rules.map(r => `${r.id}${r.detail ? `: ${r.detail}` : ''}`).join('; ')])]) : 'No order has been asked for yet.';
export const eventsText = (e: SlotEvent[]) => e.length ? table([['seq', 'when', 'change', 'why'], ...e.map(x => [x.seq, when(x.ts), `${x.from} -> ${x.to}`, x.why])]) : 'No status change yet.';
export const driftText = (d: DriftReading[]) => d.length ? table([['seq', 'when', 'trades', 'reading', 'alarm line', 'alarms'], ...d.map(x => [x.seq, when(x.ts), x.n, x.s.toFixed(2), x.threshold.toFixed(2), x.alarms.join('; ') || 'none'])]) : 'No drift reading yet.';

export function boardText(rows: Evaluation[], total: number, sort?: string): string {
  if (!rows.length) return 'No trials match.';
  return ['Results on past data. None of this is a forward record.', '', table([['strategy', 'market', 'tf', 'status', 'checks', 'n', 'return', 'sharpe', 'max dd', 'luck-adj', 'basis', 'net', 'first failed check'],
    ...rows.map(r => [r.strategy, r.symbol, r.tf, r.status, `${r.checksPassed}/${r.checks.length}`, r.metrics.ret.n, fig(r.metrics.ret), fig(r.metrics.sharpe), fig(r.metrics.maxDrawdown), fig(r.metrics.dsr), BASIS[r.metrics.ret.basis], net(r.metrics.ret), r.error ? `did not run: ${r.error}` : r.checks.find(c => !c.pass)?.name ?? ''])]),
    '', `${rows.length} shown of ${total}. Sorted by ${sort === 'sharpe' ? 'Sharpe' : sort === 'checks' ? 'checks passed, then Sharpe' : 'status, then checks passed, then Sharpe'}. Never by return.`].join('\n');
}

export function pairText(p: EvaluationDetail): string {
  const out = [`${p.strategy} on ${p.symbol} ${p.tf} · ${p.status} · ${based(p.metrics.ret)}`, p.error ? `This pair did not run: ${p.error}` : p.why, ''];
  if (!p.error) { out.push(table([['', 'strategy', 'buy and hold'], ['return', fig(p.metrics.ret), fig(p.benchmark?.ret ?? null)], ['sharpe', fig(p.metrics.sharpe), fig(p.benchmark?.sharpe ?? null)], ['max drawdown', fig(p.metrics.maxDrawdown), fig(p.benchmark?.maxDrawdown ?? null)],
      ['n', `${p.metrics.ret.n} trades`, p.benchmark ? `${p.benchmark.bars} bars` : '-'], ['costs', 'taken off', 'none']]), '');
    out.push(...p.checks.map(c => `${String(c.n).padStart(2)} ${c.name.padEnd(34)} ${c.pass ? 'pass' : 'FAIL'}  ${c.why}`), ''); }
  out.push(p.metrics.dsr ? `Luck: after ${p.nTrials ?? '?'} tries, the chance this Sharpe is more than luck is ${fig(p.metrics.dsr)}. The forward gate asks for 95%.` : 'Luck: no deflated figure was recorded.');
  out.push(`Written down first: ${p.hypothesis || 'no hypothesis text'} (pass bar: ${p.passBar || 'not recorded'}; source ${p.source})`);
  out.push(p.validator.length ? `Validator: ${p.validator.map(v => `#${v.seq} ${v.purpose} ${v.level} ${v.agrees ? (v.exact ? 'agrees exactly' : 'agrees within tolerance') : `DISAGREES (${v.diffs.join('; ')})`}`).join(', ')}` : 'Validator: no run yet.');
  if (p.inputs) out.push(`Inputs: strategy ${short(p.inputs.strategyFingerprint)}, data ${p.inputs.datasets.map(d => `${d.id}@${short(d.version, 8)}`).join(', ')}, gate ${short(p.inputs.gateVersion)}, costs ${short(p.inputs.costModelVersion)} (assumed), engine ${short(p.inputs.engineFingerprint)}`);
  out.push(`receipt #${p.receipt}${p.preregSeq ? `  pre-registered #${p.preregSeq}` : ''}${p.receiptEntry ? `  hash ${short(p.receiptEntry.hash, 16)}` : ''}  trial ${short(p.trialKey, 16)}`);
  out.push('A result on past data: the start of the evidence, not the end of it.');
  return out.join('\n');
}

export function slotText(d: SlotDetail): string {
  const c = d.clock, f = d.forward;
  const out = [`${d.strategy} on ${d.symbol} ${d.tf} · ${d.status} · ${d.role}${d.shadowOf ? ` of ${d.shadowOf}` : ''} · PAPER`,
    `Locked ${when(d.lockedAt)} (entry #${d.lockSeq}), weight ${share(d.weight, 0)}, risk per trade ${share(d.riskFraction, 2)}, strategy ${short(d.fingerprint)}. A locked strategy does not change.`, '',
    `Graduation clock: ${c.months.toFixed(1)} of ${c.needMonths} months, ${c.trades} of ${c.needTrades} trades, luck-adjusted ${c.dsr ? `${fig(c.dsr)} (${based(c.dsr)})` : '-'} of ${share(c.needDsr, 0)} (counting ${c.slotsEverLocked} slots ever locked)`,
    c.state ? `Last monthly check (${c.checkedMonth}): ${c.state.replace(/_/g, ' ')}${c.fails.length ? `. Still short: ${c.fails.join('; ')}` : ''}${c.note ? `. Clock: ${c.note}` : ''}` : 'No monthly check has run yet.', '',
    `Forward record: ${f.trades ? `${fig(f.pnl)} over ${f.trades} trades (${f.wins} won), average ${fig(f.avgR)} R (${based(f.pnl)})` : 'no forward trades yet. This is the only record that counts toward going live.'}`,
    `Past data: ${d.inSample ? `${fig(d.inSample.metrics.ret)} return, Sharpe ${fig(d.inSample.metrics.sharpe)}, ${d.inSample.checksPassed} of ${d.inSample.checks.length} checks (${based(d.inSample.metrics.ret)})` : 'the evaluation is not in the ledger view'}. Past and forward results are never added together.`,
    `Open now: ${d.position ? `${d.position.side} ${d.position.qty} from ${d.position.entry.toFixed(2)}, stop ${d.position.stop.toFixed(2)}, ${usd(d.position.riskUsd)} at risk, since ${when(d.position.since)}` : 'nothing'}`,
    `Drift: reading ${d.drift.cusum.toFixed(2)}, paused for drift ${d.drift.pauses} of 3 times.`, '', locksText({ slotKey: d.slotKey, allowed: d.locks.every(l => l.open), locks: d.locks })];
  if (d.shadows.length) out.push('', `Shadows: ${d.shadows.join(', ')}`);
  return out.join('\n');
}
export const locksText = (l: Locks) => [`${l.slotKey}: ${l.allowed ? 'all four locks open' : 'live is closed'}`, ...l.locks.map(x => `  ${x.open ? 'open  ' : 'closed'} ${x.id}: ${x.why}`)].join('\n');

export function riskText(r: Risk): string {
  const v = (k: string, x: number | null) => x === null ? 'none' : /^(maxOpen|maxPerSymbol|cooldownBars)$/.test(k) ? String(x) : share(x, x < 0.1 ? 1 : 0);
  return [table([['limit', 'in force', 'asked for', 'default', 'ceiling', 'waiting'], ...r.limits.map(l => [l.key, v(l.key, l.inForce), v(l.key, l.requested), v(l.key, l.default), v(l.key, l.ceiling), l.pending ? `${v(l.key, l.pending.value)} from ${when(l.pending.effective)}` : ''])]),
    '', 'A tighter value applies at once. A looser one applies only after 24 hours unchanged. Nothing can exceed its ceiling.',
    `Halts: ${r.halts.length ? r.halts.map(h => `${h.level} (by ${h.by}: ${h.reason})`).join('; ') : 'none'}. Drawdown pause ${r.drawdownPaused ? 'ON' : 'off'}.`,
    `Open risk: ${share(r.openRiskPct, 2)} of paper equity${r.exposure.length ? ` (${r.exposure.map(e => `${e.assetClass} ${share(e.riskPct, 2)} in ${e.positions}`).join(', ')})` : ''}.`,
    ...(r.drift.length ? ['', table([['slot', 'status', 'drift reading', 'alarm line', 'pauses'], ...r.drift.map(d => [d.slotKey, d.status, d.cusum.toFixed(2), d.threshold.toFixed(2), `${d.pauses} of 3`])])] : [])].join('\n');
}

export const queueText = (q: Queue) => [`Tries this week: ${q.used} of ${q.budget}${q.waiting ? `. ${q.waiting} pairs are waiting for budget` : ''}.`, '',
  q.items.length ? table([['source', 'what', 'pairs', 'done', 'passed', 'near miss', 'first'], ...q.items.map(i => [i.source, i.label, i.pairs, i.done, i.passed, i.nearMiss, i.first.slice(0, 10)])]) : 'Nothing has been registered yet.'].join('\n');
export const dataText = (d: DataHealth[]) => d.length ? table([['dataset', 'status', 'tradable', 'bars', 'first', 'last', 'source', 'notes'], ...d.map(x => [x.dataset, x.status, x.tradable ? 'yes' : 'no', x.rows, x.first.slice(0, 10), when(x.last), x.source, x.warnings.join('; ')])]) : 'No run has checked the data yet.';
export function costsText(c: Costs): string {
  if (!c) return 'No cost model is recorded in the ledger yet.';
  const cols = [...new Set(c.rows.flatMap(r => Object.keys(r)))];
  return [`Cost model ${short(c.version)} (entry #${c.receipt}). A row is assumed until paper fills are measured against it.`, '', c.rows.length ? table([cols, ...c.rows.map(r => cols.map(k => (r[k] === null || r[k] === undefined ? '' : String(r[k]))))]) : 'It has no rows.'].join('\n');
}
export const reportsText = (r: ReportRow[]) => r.length ? table([['run', 'when', 'mode', 'evaluated', 'new tries', 'orders', 'blocked', 'fills', 'errors'], ...r.map(x => [x.id, when(x.ts), x.mode, x.evaluated, x.newTrials, x.intents, x.blocked, x.fills, x.errors])]) : 'No run is recorded yet.';

export const ledgerRows = (rows: LedgerRow[]) => rows.length ? rows.map(e => `${String(e.seq).padStart(6)}  ${when(e.ts)}  ${e.kind.padEnd(20)} ${e.actor.padEnd(14)} ${e.summary}`).join('\n') : 'The ledger is empty.';
export const ledgerEntryText = (e: LedgerEntry) => [`#${e.seq} ${e.kind} by ${e.actor} at ${when(e.ts)}`, e.summary, `hash         ${e.hash}`, `previous     ${e.prevHash}`, `payload hash ${e.payloadHash}`, '', JSON.stringify(e.payload, null, 1)].join('\n');
export const headText = (h: LedgerHead) => h.hash === null ? 'The ledger is empty.' : `seq ${h.seq}\nhash ${h.hash}\nlast anchor ${h.anchor ? `#${h.anchor.seq} ${short(h.anchor.hash, 16)} at ${when(h.anchor.at)}` : 'none yet'}`;
export const verifyText = (v: LedgerVerify) => v.ok ? `chain   ok   ${v.from} .. ${v.to}   (${v.checked} entries)` : v.checked === 0 ? `chain   nothing to check in ${v.from} .. ${v.to}` : `chain   BROKEN at #${v.badSeq}: ${v.why}. Pull the cord and do not run until this is understood.`;

export const funnelText = (f: Funnel) => `Pairs: ${f.tried} tried, ${f.waiting} waiting, ${f.passed} passed the checks, ${f.validated} validated, ${f.paper} in paper, ${f.eligible} eligible, ${f.live} live. ${f.rejected} rejected, ${f.nearMiss} near miss, ${f.needsData} need data.`;
export const claimRowsText = (c: ClaimCheckRow[]) => c.length ? table([['check', 'when', 'verdict', 'source', 'readings', 'untested', 'flags', 'receipt'], ...c.map(x => [x.id, when(x.ts), (x.verdict ?? 'none').replace(/_/g, ' '), x.sourceKind, x.readings, x.untested, x.flags.join(', '), `#${x.receipt}`])]) : 'No claim check has been run yet.';
export function claimText(c: ClaimCheck): string {
  return [`Claim check ${c.id} · verdict: ${(c.verdict ?? 'none').replace(/_/g, ' ')} · ${c.readings} readings tested, ${c.untested} not testable · ${c.trialsUsed} tries used · receipt #${c.receipt}`,
    `Source: ${c.sourceKind}, ${c.chars} characters. The source text is not stored.${c.flags.length ? ` Flags: ${c.flags.join(', ')}.` : ''}`, '',
    ...(c.interpretations.length ? [table([['reading', 'strategy', 'data', 'status', 'luck-adj in this check', 'stand-in data'], ...c.interpretations.map(i => [i.ruleSet, i.strategy, i.panel, i.status, fig(i.dsrInCheck), i.proxy ? 'yes' : 'no'])])] : ['No reading could be tested.']),
    '', 'A verdict is what the gate found on past data. It is not a judgment of the source or its author.'].join('\n');
}
