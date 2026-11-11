import type { Bar } from '@apex/engine/core';
import type { AssetClass } from '@apex/kernel/guard';
export type Tf = '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
export const TF_MS: Record<Tf, number> = { '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
export type DatasetSpec = { id: string; source: string; symbol: string; tf: Tf; assetClass: AssetClass; adj: 'raw' | 'split' | 'total'; session: 'rth' | 'eth' | '24x7';
  calendar: 'XNYS' | 'CRYPTO' | 'FX'; panels: string[]; file?: string; ticker?: string; /* the provider's ticker when it differs, e.g. C:EURUSD */ from?: { file: string; tf: Tf }; costBucket: 'mega' | 'liquid' | 'thin' };
export type LoadedDataset = { spec: DatasetSpec; bars: Bar[]; version: string; fetchedAt: number; second?: { source: string; bars: Bar[] } };
export type HealthStatus = 'ok' | 'warn' | 'blocked';
export type DataHealth = { dataset: string; version: string; at: number; status: HealthStatus; tradable: boolean;
  checks: { id: string; status: HealthStatus; detail: string; bars?: number[] }[];
  provenance: { source: string; second?: string; fetchedAt: number; adj: string; termsRef: string } };
export interface SourceAdapter {
  id: string;
  capabilities(): { tfs: Tf[]; assetClasses: AssetClass[]; maxHistoryYears: number | null; adj: string[] };
  fetchBars(q: { symbol: string; tf: Tf; from: number; to: number; adj: string; session: string }): Promise<Bar[]>;
  rateLimit: { perMinute: number };
}
export type { Bar };
