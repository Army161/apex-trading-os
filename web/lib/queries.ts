// Query functions over the ledger view. Pure: entries in, plain rows out. The screens, the v1 API and the terminal's remote
// mode all call these, so the three surfaces cannot disagree (docs/design/07 s10, 09).
import { buildView, trialsEver, type LedgerView } from '@apex/kernel/view';
import type { LedgerEntry } from '@apex/kernel/ledger';

const LIVE = /^(micro_live|live_\d+)$/;
export type FunnelCounts = { tried: number; waiting: number; passed: number; paper: number; eligible: number; live: number; rejected: number; nearMiss: number; needsData: number };
export function funnelOf(v: LedgerView): FunnelCounts {
  const results = [...v.trials.values()].map(t => t.result).filter(Boolean), slots = [...v.slots.values()].filter(s => s.role === 'primary');
  const by = (st: string) => results.filter(r => r.status === st).length;
  return { tried: trialsEver(v), waiting: v.trials.size - results.length,
    passed: results.filter(r => Array.isArray(r.checks) && r.checks.length > 0 && r.checks.every((c: any) => c.pass)).length,
    paper: slots.filter(s => s.status === 'paper').length, eligible: slots.filter(s => s.status === 'live_eligible').length, live: slots.filter(s => LIVE.test(s.status)).length,
    rejected: by('rejected'), nearMiss: by('watch'), needsData: by('needs_data') };
}
export const funnel = (entries: LedgerEntry[], capital: number) => funnelOf(buildView(entries, capital));
