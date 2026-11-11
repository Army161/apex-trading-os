// Dataset registry and loader. The committed default is data/registry.json. CI and tests use committed fixtures only.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Bar } from '@apex/engine/core';
import { resample } from '@apex/engine/trend';
import { parseCsv, toCsv, versionOf, closedOnly, mergeBars } from './bars';
import { termsOk } from './adapters';
import { TF_MS, type DatasetSpec, type LoadedDataset, type SourceAdapter } from './types';

export type Registry = { datasets: DatasetSpec[] };
export const loadRegistry = (root: string): Registry => JSON.parse(readFileSync(join(root, 'data/registry.json'), 'utf8'));

/** Committed fixture, optionally resampled from a finer file (the same resample the stress board used). */
export const cachePath = (cacheDir: string, spec: DatasetSpec) => join(cacheDir, `${spec.source}_${spec.symbol}_${spec.from?.tf ?? spec.tf}_${spec.adj}.csv`.replace(/[^\w.-]/g, '_'));
/** The committed file, or the refreshed copy in `cacheDir` when `apex data pull` has made one (same history, newer bars appended). */
export function loadCsvDataset(root: string, spec: DatasetSpec, now = Date.now(), cacheDir?: string): LoadedDataset {
  const file = spec.from?.file ?? spec.file; if (!file) throw new Error(`${spec.id}: no file`);
  const cached = cacheDir ? cachePath(cacheDir, spec) : null;
  let bars = parseCsv(readFileSync(cached && existsSync(cached) ? cached : join(root, 'data', file), 'utf8'));
  if (spec.from && spec.from.tf !== spec.tf) bars = resample(bars, TF_MS[spec.tf]).bars;
  bars = closedOnly(bars, TF_MS[spec.tf], now);
  return { spec, bars, version: versionOf(bars), fetchedAt: now };
}

/**
 * Pull fresh bars for a live-source dataset and merge them into the local cache (`cacheDir/<id>.csv`). Returns the merged dataset
 * plus any restated rows. The base timeframe is fetched and coarser ones are resampled, so 30m, 1h and 4h always agree.
 */
export async function pullDataset(spec: DatasetSpec, adapter: SourceAdapter, o: { cacheDir: string; now: number; years?: number; sourcesMd: string }): Promise<LoadedDataset & { added: number; restated: number[] }> {
  if (!termsOk(o.sourcesMd, adapter.id)) throw new Error(`${adapter.id}: no accepted terms entry in data/SOURCES.md, refusing to fetch`);
  const baseTf = spec.from?.tf ?? spec.tf, path = cachePath(o.cacheDir, spec);
  const stored: Bar[] = existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : [];
  const years = Math.min(o.years ?? 2, adapter.capabilities().maxHistoryYears ?? 50);
  const from = stored.length ? stored[Math.max(0, stored.length - 6)].t : o.now - years * 365.25 * 864e5;         // 5-bar overlap
  const fresh = closedOnly(await adapter.fetchBars({ symbol: spec.ticker ?? spec.symbol, tf: baseTf, from, to: o.now, adj: spec.adj, session: spec.session }), TF_MS[baseTf], o.now);
  const m = mergeBars(stored, fresh);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, toCsv(m.bars));
  const bars = closedOnly(baseTf === spec.tf ? m.bars : resample(m.bars, TF_MS[spec.tf]).bars, TF_MS[spec.tf], o.now);
  return { spec, bars, version: versionOf(bars), fetchedAt: o.now, added: m.added, restated: m.restated };
}
