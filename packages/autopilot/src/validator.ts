// Independent validator: agreement rules (docs/design/04 s7, idea 10). The model plays no part in the verdict.
import type { GateConfig, GateResult } from '@apex/kernel/gate';

export type Digest = { checks: { n: number; pass: boolean }[]; metrics: { trades: number; ret: number; sharpe: number } };
export type Agreement = { agrees: boolean; exact: boolean; diffs: string[] };
/** Same pass or fail on every check, trade count within 2%, net return within 1 percentage point, Sharpe within 0.1. */
export function agreement(orig: Digest, re: Digest, tol: GateConfig['validator'], hashes?: { orig: string; re: string }): Agreement {
  const diffs: string[] = [];
  if (orig.checks.length !== re.checks.length) diffs.push(`ran ${re.checks.length} checks, original ran ${orig.checks.length}`);
  for (const c of orig.checks) { const r = re.checks.find(x => x.n === c.n); if (r && r.pass !== c.pass) diffs.push(`check ${c.n}: original ${c.pass ? 'pass' : 'fail'}, validator ${r.pass ? 'pass' : 'fail'}`); }
  const t0 = orig.metrics.trades, t1 = re.metrics.trades;
  if (Math.abs(t1 - t0) > tol.tradesPct * Math.max(t0, 1)) diffs.push(`trades ${t1} against ${t0}`);
  if (Math.abs(re.metrics.ret - orig.metrics.ret) > tol.retPts) diffs.push(`return ${(re.metrics.ret * 100).toFixed(2)}% against ${(orig.metrics.ret * 100).toFixed(2)}%`);
  if (Math.abs(re.metrics.sharpe - orig.metrics.sharpe) > tol.sharpe) diffs.push(`Sharpe ${re.metrics.sharpe.toFixed(2)} against ${orig.metrics.sharpe.toFixed(2)}`);
  return { agrees: diffs.length === 0, exact: !!hashes && hashes.orig === hashes.re, diffs };
}
export const digestOf = (r: Pick<GateResult, 'checks' | 'metrics'>): Digest => ({ checks: r.checks.map(c => ({ n: c.n, pass: c.pass })), metrics: { trades: r.metrics.trades, ret: r.metrics.ret, sharpe: r.metrics.sharpe } });
