// What the next run would find for a slot brought back to paper (docs/design/04 s2). Red path. Server only.
// The strategy's fingerprint now, worked out the way the run works it out, against the one in the slot's lock, and whether the
// slot's dataset is in the registry and its bars load. Anything that cannot be worked out is null or false, never true.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { STRATEGIES } from '@apex/engine/strategies';
import { fixtures, strategyFingerprint } from '@apex/engine/fingerprint';
import { loadCsvDataset, loadRegistry } from '@apex/data/registry';
import type { Checked } from './change';

export function checkAgainstRun(root: string | null, s: { strategy: string; dataset: string; fingerprint: string }, now: number, stateDir?: string): Checked {
  if (!root) return { fingerprintMatches: null, datasetReadable: null };
  let fingerprintMatches: boolean | null = null, datasetReadable = false;
  try { const def = STRATEGIES.find(x => x.id === s.strategy); fingerprintMatches = !!def && !!s.fingerprint && strategyFingerprint(def, fixtures(join(root, 'packages/engine/src/fixtures'))) === s.fingerprint; } catch { /* unknown */ }
  try { const spec = loadRegistry(root).datasets.find(x => x.id === s.dataset), cache = stateDir ? join(stateDir, 'data') : undefined;
    datasetReadable = !!spec && spec.source === 'csv' && loadCsvDataset(root, spec, now, cache && existsSync(cache) ? cache : undefined).bars.length > 0; } catch { /* missing */ }
  return { fingerprintMatches, datasetReadable };
}
