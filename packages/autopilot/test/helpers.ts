import type { Bar } from '@apex/engine/core';
import type { StratDef } from '@apex/engine/strategies';
import { GATE_V1, Ledger, MemoryLedgerStore, DEFAULT_LIMITS } from '@apex/kernel';
import { versionOf } from '@apex/data/bars';
import type { DataHealth, DatasetSpec, LoadedDataset } from '@apex/data/types';
import { PRIOR_COSTS, runAutopilot, type RunInput, type RunOutput } from '../src/index';
import { markerStrategy, coinFlip } from '../../kernel/test/helpers';

export const spec = (symbol = 'TEST', over: Partial<DatasetSpec> = {}): DatasetSpec => ({ id: `csv:${symbol}:1d:raw`, source: 'csv', symbol, tf: '1d', assetClass: 'crypto', adj: 'raw', session: '24x7', calendar: 'CRYPTO', panels: ['test'], costBucket: 'liquid', ...over });
export const dataset = (bars: Bar[], s = spec()): LoadedDataset => ({ spec: s, bars, version: versionOf(bars), fetchedAt: 1 });
export const healthy = (d: LoadedDataset, over: Partial<DataHealth> = {}): DataHealth => ({ dataset: d.spec.id, version: d.version, at: 1, status: 'ok', tradable: true, checks: [], provenance: { source: d.spec.source, fetchedAt: 1, adj: d.spec.adj, termsRef: 'test' }, ...over });
export const strat = (id: string, build: StratDef['build'], fingerprint = `fp-${id}`) => ({ def: { id, name: id, source: 'test', direction: 'long' as const, tf: '1d', desc: id, build }, fingerprint });
export const MARKER = strat('marker', markerStrategy());
export const FLIP = strat('flip', coinFlip(91));

/** A ledger plus the loop the CLI runs: read everything, run the pure pipeline, append what it returns. */
export class Sim {
  store = new MemoryLedgerStore(); now = Date.UTC(2021, 0, 1); ledger = new Ledger(this.store, () => this.now); n = 0;
  constructor(public base: Partial<RunInput> = {}, durable = true) { this.store.durable = durable; }
  async input(over: Partial<RunInput> = {}): Promise<RunInput> {
    return { now: this.now, runId: `run-${++this.n}`, commit: 'testcommit', mode: 'tick', datasets: [], health: [], registry: [MARKER], engineFingerprint: 'engine-fp', entries: await this.store.read(), durable: this.store.durable,
      requestedLimits: DEFAULT_LIMITS, halts: { readable: true, kill: false, andon: false }, costModel: PRIOR_COSTS, gate: GATE_V1, capital: 10000, trialsPerWeek: 5, secondSourceExists: false, ...this.base, ...over };
  }
  async run(over: Partial<RunInput> = {}): Promise<RunOutput> { const out = runAutopilot(await this.input(over)); await this.ledger.appendAll('autopilot', out.appends); this.now += 3600e3; return out; }
  kinds = async () => (await this.store.read()).map(e => e.kind);
  of = async (kind: string) => (await this.store.read()).filter(e => e.kind === kind).map(e => e.payload);
}
