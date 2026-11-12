// Claim checker step 7 (docs/design/05 s6): the result as a page, in the fixed order. The measured results are stated and the
// reader draws the conclusion. Text that came from the source or the model is always shown as a quote or a list item, never as
// Apex's own sentence. Words Apex never uses about a source are in BANNED, and the tests run every template string against it.
import { dataLabel, pct, type ClaimResult, type RuleSetResult, type Tested, type Verdict } from './check';
import type { Rule } from './extract';

export const BANNED = /\b(scam\w*|fake\w*|proven|fraud\w*)\b/i;
export const VERDICT_NAME: Record<Verdict, string> = { holds_up: 'Holds up on past data', near_miss: 'Near miss', no_edge: 'No edge found', untestable: 'Could not be tested' };
export const NOTICE = 'Past data only. Nothing here is advice, and a pass is a reason to paper trade, not a reason to trade.';
export const FLAG_NAME: Record<string, string> = { injection: 'Instructions aimed at the checker', fake_json: 'Ready-made result in the text', hidden_text: 'Hidden text', secret_redacted: 'Key or password removed', guaranteed_returns: 'Certain-result language',
  no_losses: 'Perfect-record language', paid_group: 'Paid group or course', affiliate_link: 'Affiliate link', urgency: 'Time pressure', screenshot_only: 'Results shown only as screenshots', cherry_picked_period: 'Short or hand-picked period',
  number_not_in_source: 'Figure not found in the source', trimmed: 'Source trimmed', pine_lookahead: 'Pine: reads future bars', pine_every_tick: 'Pine: calculates on every tick', pine_repaint: 'Pine: may repaint', pine_zero_commission: 'Pine: zero commission',
  pine_full_equity: 'Pine: 100% of equity per trade', pine_pyramiding: 'Pine: pyramiding' };
const q = (s: string) => `"${s.replace(/\s+/g, ' ').trim().replace(/"/g, "'")}"`, cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const rule = (kind: string, r: Rule) => `- ${kind}: ${r.text}\n  - Source, at character ${r.evidence.offset}: ${q(r.evidence.quote)}`;
const describeRules = (t: Tested) => ('template' in t.rules ? `strategy family \`${t.rules.template}\` with ${Object.entries(t.rules.params).map(([k, v]) => `${k} = ${v}`).join(', ')}` : `custom rules in Apex's rule format (\`${t.strategyId}\`)`);

function reading(t: Tested, best: boolean): string[] {
  const m = t.metrics, out = [`#### ${best ? 'Best reading' : 'Reading'}: ${t.label}`, '', `Run as ${describeRules(t)} on ${dataLabel(t.data)} (${t.data.rows.toLocaleString('en-US')} bars).${t.proxy ? ` ${t.proxy}` : ''}`, '',
    `${m.trades} trades. Return ${pct(m.ret)} against ${pct(m.hold)} for buy and hold. Worst drop ${pct(m.dd)} against ${pct(m.holdDd)}. Sharpe ${m.sharpe.toFixed(2)} against ${m.holdSharpe.toFixed(2)}. Win rate ${(m.winRate * 100).toFixed(0)}%. In-sample, with assumed costs.`, ''];
  if (t.checks.length) out.push('| Check | Result | Number behind it |', '|---|---|---|', ...t.checks.map(c => `| ${c.n}. ${cell(c.name)} | ${c.pass ? 'pass' : 'fail'} | ${cell(c.why)} |`), '');
  else out.push(`The rules could not be run on this data: ${t.why}`, '');
  return out;
}
function section(rs: RuleSetResult, r: ClaimResult, many: boolean): string[] {
  const x = r.extraction!.ruleSets[rs.index], out: string[] = [];
  if (many) out.push(`### ${rs.name}: ${VERDICT_NAME[rs.verdict]}`, '', rs.headline, '');
  rs.tested.forEach(t => out.push(...reading(t, r.ruleSets.length > 0 && rs.best !== null && r.ruleSets.flatMap(s => s.tested).indexOf(t) === rs.best && rs.tested.length > 1)));
  for (const u of rs.untested) out.push(`Not run, "${u.label}": ${u.missing.join('; ')}.`, '');
  out.push(`#### The rules as extracted${many ? ` (${rs.name})` : ''}`, '', `Market: ${x.market.join(', ') || 'not stated'}. Timeframe: ${x.timeframe.join(', ') || 'not stated'}. Direction: ${x.direction}. How much judgment the rules leave open: ${x.ambiguity}.`, '',
    ...x.entry.map(e => rule('Entry', e)), ...x.filters.map(e => rule('Filter', e)), ...x.exit.map(e => rule('Exit', e)), ...(x.stop ? [rule('Stop', x.stop)] : ['- Stop: none stated']), ...(x.target ? [rule('Target', x.target)] : []), ...(x.sizing ? [`- Sizing: ${x.sizing}`] : []), '');
  if (x.assumptions.length) out.push('Gaps that had to be filled:', '', ...x.assumptions.map(a => `- ${a.what}: used ${a.chosen}${a.alternatives.length ? ` (could also be ${a.alternatives.join(', ')})` : ''}`), '');
  return out;
}

/** The whole result as Markdown. Sections follow 05 s6: verdict, claimed and measured, checks, rules, not tested, flags, receipt. */
export function renderMarkdown(r: ClaimResult): string {
  const out = [`# Claim check: ${r.title}`, '', NOTICE, ''];
  if (r.status === 'waiting_budget') return [...out, '## Waiting', '', r.headline, '', `Each reading of the rules is one try, and tries are limited each week so results keep their meaning. Trials so far: ${r.tries.everAfter.toLocaleString('en-US')}.`, ''].join('\n');
  out.push(`## Verdict: ${VERDICT_NAME[r.verdict!]}`, '', r.headline, '');
  if (r.claims.length) out.push('## Claimed and measured', '', '| What the source says | Claimed | Measured |', '|---|---|---|', ...r.claims.map(c => `| ${cell(c.claim)} | ${cell(c.claimed)} | ${cell(c.measured)} |`), '');
  if (r.ruleSets.length) { out.push('## Checks and rules', ''); for (const rs of r.ruleSets) out.push(...section(rs, r, r.ruleSets.length > 1)); }
  const notTested = [...new Set(r.ruleSets.flatMap(s => [...s.tested.flatMap(t => [...t.notTested, ...(t.proxy ? [t.proxy] : [])]), ...s.untested.flatMap(u => u.missing)]))];
  out.push('## What was not tested', '', ...(notTested.length ? notTested.map(n => `- ${n}`) : ['- Nothing was left out.']), '- Whether the rules will work from here on. Only forward paper trading can show that.', '');
  out.push('## Flags', '', ...(r.flags.length ? r.flags.map(f => `- ${FLAG_NAME[f.kind] ?? f.kind.replace(/_/g, ' ')}: ${f.detail}${f.evidence ? `. Source: ${q(f.evidence.quote)}` : ''}`) : ['- None.']), '');
  out.push('## Receipt', '', `- Check ${r.id}. Source: ${r.sourceKind}, ${r.chars.toLocaleString('en-US')} characters, content hash ${r.contentHash.slice(0, 16)}.`,
    `- Tries used by this check: ${r.tries.fresh} new of ${r.tries.planned} run. Trials so far: ${r.tries.everAfter.toLocaleString('en-US')}.`,
    `- Gate ${r.receipt.gateVersion.slice(0, 12)}, cost model ${r.receipt.costModelVersion.slice(0, 12)} (assumed costs until paper fills are measured), engine ${r.receipt.engineFingerprint.slice(0, 12)}.`,
    ...r.ruleSets.flatMap(s => s.tested.map(t => `- Trial ${t.trialKey.slice(0, 12)}: ${t.strategyId} on ${t.data.id}, data version ${t.data.version.slice(0, 12)}, result ${t.resultHash.slice(0, 12)}${t.recorded ? '' : ' (already in the ledger, not counted again)'}.`)), '');
  return out.join('\n');
}
/** Two lines for a chat message or a terminal. */
export const renderShort = (r: ClaimResult) => `${r.verdict ? VERDICT_NAME[r.verdict] : 'Waiting'}: ${r.title}\n${r.headline}`;
