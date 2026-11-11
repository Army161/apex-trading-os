// The ledger behind `--fixtures`: a small made-up ledger with real hashes, for demos and tests. Every name in it starts with
// `demo_` so nobody mistakes it for a result. Rebuild the committed file with `npx tsx apps/cli/fixtures/make.ts`; a test
// fails if the file and this script disagree.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATE_V1, makeEntry, type LedgerEntry, type LedgerKind } from '@apex/kernel';

const T0 = Date.UTC(2026, 0, 5, 14, 30), G = 'gate-demo', PANEL = 'csv:SPY:1h:split', SLOT = `demo_alpha@${PANEL}`, key = (c: string) => c.repeat(64);
const prereg = (k: string, id: string, source: string): [LedgerKind, object] => ['prereg', { trialKey: key(k), gateVersion: G, source, panel: PANEL, tf: '1h', hypothesis: `Fixture data, not a real result: ${id} has an edge`, passBar: 'all seven checks', strategy: { id, fingerprint: `fp-${id}` }, rules: { enter: 'made up' } }];
const result = (k: string, id: string, status: string, passes: number, m: { trades: number; ret: number; sharpe: number; dd: number }): [LedgerKind, object] => ['trial_result', { trialKey: key(k), gateVersion: G, strategy: id, symbol: 'SPY', tf: '1h', panel: PANEL, status, why: `${passes} of 7 checks passed`, inputHash: `in-${k}`, resultHash: `out-${k}`,
  inputs: { strategy: { fingerprint: `fp-${id}` }, dataset: [{ id: PANEL, version: 'v-demo' }], gateVersion: G, costModelVersion: 'cm-demo', engineFingerprint: 'eng-demo', seed: 7 }, data: { first: T0 - 9e9, last: T0, rows: 4000 },
  checks: ['enough trades', 'monkey test', 'locked test window', 'one bar late', 'double costs', 'costs under half moves', 'beats hold on risk'].map((name, i) => ({ n: i + 1, name, pass: i < passes, why: i < passes ? 'met' : 'not met', value: i + 1 })),
  metrics: { trades: m.trades, ret: m.ret, hold: 0.1, sharpe: m.sharpe, holdSharpe: 0.7, dd: m.dd, holdDd: -0.2 }, readouts: { dsrN: 0.4, nTrials: 3, tStat: 2.1 } }];

export function fixtureEntries(): LedgerEntry[] {
  const rows: [LedgerKind, object][] = [
    ['gate_version', { version: G, config: GATE_V1 }],
    ['data_version', { dataset: PANEL, status: 'ok', tradable: true, rows: 4000, first: T0 - 9e9, last: T0, source: 'csv', version: 'v-demo' }],
    ['cost_model', { version: 'cm-demo', rows: [{ venue: 'paper', assetClass: 'equity', bucket: 'liquid', feeBps: 0.5, halfSpreadBps: 1, slipBps: 1, source: 'prior', n: 0 }] }],
    prereg('a', 'demo_alpha', 'factory'), result('a', 'demo_alpha', 'passed_pending_validation', 7, { trades: 60, ret: 0.2, sharpe: 0.9, dd: -0.1 }),
    prereg('b', 'demo_beta', 'claim:demo1'), result('b', 'demo_beta', 'watch', 5, { trades: 55, ret: 0.31, sharpe: 0.6, dd: -0.18 }),
    prereg('c', 'demo_gamma', 'factory'), result('c', 'demo_gamma', 'rejected', 1, { trades: 74, ret: -0.02, sharpe: -0.1, dd: -0.09 }),
    ['validator_run', { trialKey: key('a'), level: 'L1', purpose: 'promotion', inputHash: 'in-a', resultHash: 'out-a', agrees: true, exact: true, source: 'same' }],
    ['slot_locked', { slotKey: SLOT, trialKey: key('a'), strategy: 'demo_alpha', dataset: PANEL, symbol: 'SPY', tf: '1h', assetClass: 'equity', lockedAt: T0, inputHash: 'in-a', gateVersion: G, role: 'primary', baseline: { n: 60, mu: 0.2, p: 0.5 }, inputs: { strategy: { fingerprint: 'fp-demo_alpha' } } }],
    ['weights', { weights: { [SLOT]: 0.25 }, riskFractions: { [SLOT]: 0.01 }, method: 'equal' }],
    ['intent', { id: 'i1', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0, qty: 10, riskUsd: 50, stop: 95, rules: [] }],
    ['fill', { intent: 'i1', slotKey: SLOT, kind: 'entry', t: T0 + 1, price: 100, qty: 10, symbol: 'SPY', assetClass: 'equity', side: 1, stop: 95, fee: 1 }],
    ['fill', { intent: 'i1', slotKey: SLOT, kind: 'target', t: T0 + 2, price: 110, qty: 10, fee: 1 }],
    ['intent', { id: 'i2', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0 + 3, qty: 10, riskUsd: 50, stop: 105, rules: [] }],
    ['fill', { intent: 'i2', slotKey: SLOT, kind: 'entry', t: T0 + 4, price: 110, qty: 10, symbol: 'SPY', assetClass: 'equity', side: 1, stop: 105, fee: 1 }],
    ['intent_blocked', { id: 'i3', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0 + 5, rules: [{ id: 'R3', detail: 'one position a symbol' }] }],
    ['drift_reading', { slotKey: SLOT, n: 1, s: 0.3, alarms: [] }],
    ['book_snapshot', { at: T0 + 6, equity: 10098, cash: 10097, peak: 10098, cursors: {} }],
    ['claim_check', { id: 'demo1', contentHash: 'ch-demo', sourceKind: 'transcript', chars: 900, verdict: 'no_edge', gateVersion: G, trialKeys: [key('b')], readings: [{ ruleSet: 1, strategy: 'demo_beta', panel: PANEL, proxy: false, status: 'watch', resultHash: 'out-b', dsrInCheck: 0.3 }], untested: 0, flags: ['guaranteed'] }],
    ['run', { id: '20260105T143020-full', mode: 'full', evaluated: 3, newTrials: 3, intents: 2, blocked: 1, fills: 3, errors: 0, waitingBudget: 0, problems: [] }],
  ];
  const out: LedgerEntry[] = [];
  for (const [kind, payload] of rows) { const prev = out[out.length - 1]; out.push(makeEntry(prev ? { seq: prev.seq, hash: prev.hash } : null, T0 + out.length * 1000, kind, 'fixture', payload)); }
  return out;
}
export const fixtureText = () => fixtureEntries().map(e => JSON.stringify(e)).join('\n') + '\n';
if (require.main === module) { writeFileSync(join(__dirname, 'ledger.jsonl'), fixtureText()); console.log(`Wrote ${fixtureEntries().length} entries.`); }
