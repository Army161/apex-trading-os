// A claim check from the dashboard (docs/design/05, 07 s4.10). Two steps, and only the second writes:
//   plan: intake, extraction (the one model call, or a saved answer), then a dry run that counts the tries and writes nothing.
//   run:  the same extraction is sent back, checked against the source again, and the check is run and recorded under the run lock.
// The checker in packages/claims decides everything. This file only finds the data and the ledger for it. Server only.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EXTRACT_FAILED, dataLabel, intake, runClaimCheck, validateExtraction, type ClaimExtraction, type ClaimResult, type Extracted, type SourceKind } from '@apex/claims';
import { checkData, loadCsvDataset, loadRegistry, type DataHealth, type LoadedDataset } from '@apex/data';
import { PRIOR_COSTS } from '@apex/autopilot/costs';
import { fixtures } from '@apex/engine/fingerprint';
import { GATE_V1 } from '@apex/kernel';
import { Ledger } from '@apex/kernel/ledger';
import { loadConfig } from '@apex/kernel/config';
import { ledgerStore } from './ledger';
import { extractClaims } from './claims';

/** The folder that holds `data/registry.json`: APEX_ROOT when set, otherwise the nearest one above where the server runs. */
export function repoRoot(start = process.env.APEX_ROOT || process.cwd()): string | null {
  for (let d = start, i = 0; i < 5; i++, d = dirname(d)) { if (existsSync(join(d, 'data', 'registry.json'))) return d; if (dirname(d) === d) break; }
  return null;
}
/** The engine fingerprint from the committed file. CI fails when that file and the code disagree, so the two are the same on any build that passed. */
function engineFingerprint(root: string): string | null {
  try { const e = JSON.parse(readFileSync(join(root, 'packages/engine/fingerprints.json'), 'utf8')).engine; return typeof e === 'string' && e ? e : null; } catch { return null; }
}
function loadData(root: string, now: number): { datasets: LoadedDataset[]; health: DataHealth[] } {
  const datasets: LoadedDataset[] = [], health: DataHealth[] = [], cache = process.env.APEX_STATE_DIR ? join(process.env.APEX_STATE_DIR, 'data') : undefined;
  for (const spec of loadRegistry(root).datasets) {
    if (spec.source !== 'csv') continue;
    try { const d = loadCsvDataset(root, spec, now, cache && existsSync(cache) ? cache : undefined); datasets.push(d); health.push(checkData(d.bars, spec, d.version, GATE_V1.firewall, { now, fetchedAt: d.fetchedAt, termsRef: 'data/SOURCES.md#csv' })); }
    catch { /* a dataset that cannot be read is left out; the check then says which market it could not find */ }
  }
  return { datasets, health };
}

export type ClaimRequest = { text: unknown; kind?: unknown; extraction?: unknown; run?: boolean };
/** What a check would do, before it is run. It names each reading and its data and counts the tries. It carries no result:
 *  a result that has not been counted as a try is never shown. */
export type ClaimPlan = { id: string; title: string; waiting: boolean; headline: string | null; tries: ClaimResult['tries']; flags: ClaimResult['flags'];
  readings: { ruleSet: number; label: string; strategyId: string; data: string; proxy: string | null; newTrial: boolean }[]; untested: { ruleSet: number; label: string; missing: string[] }[] };
export function planOf(r: ClaimResult): ClaimPlan {
  const tested = r.ruleSets.flatMap(s => s.tested), nothing = r.status === 'waiting_budget' || tested.length === 0;
  return { id: r.id, title: r.title, waiting: r.status === 'waiting_budget', headline: nothing ? r.headline : null, tries: r.tries, flags: r.flags,
    readings: tested.map(t => ({ ruleSet: t.ruleSet, label: t.label, strategyId: t.strategyId, data: dataLabel(t.data), proxy: t.proxy, newTrial: t.newTrial })), untested: r.ruleSets.flatMap(s => s.untested) };
}
export type ClaimAnswer = { ok: true; step: 'plan'; plan: ClaimPlan; extraction: ClaimExtraction | null; extractionErrors: string[] }
  | { ok: true; step: 'run'; result: ClaimResult; seq: number | null }
  | { ok: false; status: number; error: string };

export async function claimCheck(req: ClaimRequest, o: { now?: number; aiEnabled?: boolean } = {}): Promise<ClaimAnswer> {
  const a = intake(req.text, req.kind ?? 'transcript'); if (!a.ok) return { ok: false, status: 422, error: `Not checked: ${a.error}.` };
  const root = repoRoot(); if (!root) return { ok: false, status: 503, error: 'The market data files are not readable from this server, so nothing can be tested here. Run the check from the terminal instead.' };
  const opened = await ledgerStore(); if (!opened) return { ok: false, status: 503, error: 'No ledger is connected, so a check could not be counted or recorded. Nothing was run.' };
  let extracted: Extracted;
  if (req.extraction !== undefined && req.extraction !== null) {
    const v = validateExtraction(req.extraction, a.intake);       // a saved or returned answer is checked against the source like a fresh one
    extracted = v.ok ? { ok: true, extraction: v.extraction, attempts: 1 } : { ok: false, reason: EXTRACT_FAILED, errors: v.errors, attempts: 1 };
  } else {
    if (req.run) return { ok: false, status: 422, error: 'Plan the check first. The run uses the rules the plan showed you.' };
    if (!(o.aiEnabled ?? Boolean(process.env.ANTHROPIC_API_KEY))) return { ok: false, status: 503, error: 'No model key is set, so the rules cannot be extracted here. Add ANTHROPIC_API_KEY (see You, Setup), or paste a saved extraction.' };
    try { const r = await extractClaims(a.intake.text, a.intake.kind as SourceKind); if (!r.ok) return { ok: false, status: 422, error: r.error }; extracted = r.extracted; }
    catch (e) { return { ok: false, status: 502, error: `The extraction did not finish: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` }; }
  }
  // A reading's fingerprint is taken on the engine's frozen fixture bars. A built server cannot find them beside its own code, so they are read from the repo once.
  try { fixtures(join(root, 'packages/engine/src/fixtures')); } catch { return { ok: false, status: 503, error: 'The fixture bars that fingerprint a strategy are not readable from this server. Nothing was run.' }; }
  const engine = engineFingerprint(root); if (!engine) return { ok: false, status: 503, error: 'The engine fingerprint file is not readable from this server, so a result could not be tied to the code that produced it. Nothing was run.' };
  const cfg = loadConfig(process.env), now = o.now ?? Date.now(), data = loadData(root, now), run = Boolean(req.run);
  const lock = !run ? async () => {} : opened.kind === 'postgres' ? await (opened.store as unknown as { runLock: () => Promise<(() => Promise<void>) | null> }).runLock()
    : await import('@apex/store/file').then(m => { const rel = m.fileLock(join(dirname((opened.store as unknown as { path: string }).path), 'run.lock')); return rel ? async () => rel() : null; });
  if (!lock) return { ok: false, status: 409, error: 'A run is in progress. Nothing was done. Try again when it has finished.' };
  try {
    const entries = await opened.store.read();
    const out = runClaimCheck({ now, intake: a.intake, extracted, datasets: data.datasets, health: data.health, entries, gate: GATE_V1, costModel: PRIOR_COSTS, engineFingerprint: engine, capital: cfg.paperCapital, trialsPerWeek: cfg.trialsPerWeek });
    if (!run) return { ok: true, step: 'plan', plan: planOf(out.result), extraction: extracted.ok ? extracted.extraction : null, extractionErrors: extracted.ok ? [] : extracted.errors };
    let seq: number | null = null;
    if (out.appends.length) { const written = await new Ledger(opened.store, () => now).appendAll('claim-checker', out.appends); seq = written[written.length - 1]?.seq ?? null; }
    return { ok: true, step: 'run', result: out.result, seq };
  } catch (e) { return { ok: false, status: 500, error: `The check stopped: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` }; }
  finally { await lock(); }
}
