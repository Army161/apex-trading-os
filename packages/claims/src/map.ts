// Claim checker step 3 (docs/design/05 s4): one interpretation becomes something the gate can run, or a plain list of what is
// missing. Templates are checked against the catalog bounds, specs against the rule language's own validator. Nothing is
// clamped, rounded or guessed here: a refused parameter is a reason the check could not run.
import type { Bar, Sig } from '@apex/engine/core';
import { compile, fromModel, validate, TFS, type Spec } from '@apex/engine/spec';
import { instantiate, type TemplateRef } from '@apex/engine/templates';
import { strategyFingerprint } from '@apex/engine/fingerprint';
import { hashOf } from '@apex/kernel';
import type { ClaimExtraction, Interpretation } from './extract';

export type Tf = typeof TFS[number];
export type Runnable = {
  id: string; fingerprint: string; kind: 'template' | 'spec'; label: string; tf: Tf; direction: 'long' | 'short' | 'both';
  rules: TemplateRef | Spec;                 // what the reader is shown
  canonical: object;                         // the same rules without free text: what goes in the ledger, enough to rebuild the strategy
  build: (b: Bar[]) => Sig; notTested: string[];
};
export type Mapped = { ok: true; runnable: Runnable } | { ok: false; missing: string[] };

const TF_WORDS: [RegExp, Tf][] = [[/^(5 ?m(in(ute)?s?)?|five[- ]minute)$/, '5m'], [/^(15 ?m(in(ute)?s?)?|fifteen[- ]minute)$/, '15m'], [/^(30 ?m(in(ute)?s?)?|thirty[- ]minute|half[- ]hour(ly)?)$/, '30m'],
  [/^(1 ?h(our)?|60 ?m(in(ute)?s?)?|hourly|one[- ]hour)$/, '1h'], [/^(4 ?h(our)?s?|240 ?m(in)?|four[- ]hour)$/, '4h'], [/^(1 ?d(ay)?|d|daily|day)$/, '1d'], [/^(1 ?w(eek)?|w|weekly|week)$/, '1w']];
/** "daily", "1 hour", "5 minute chart" -> a timeframe Apex has, or null. */
export function parseTf(s: string): Tf | null {
  const x = s.toLowerCase().replace(/\b(chart|candles?|bars?|time ?frame|tf)\b/g, '').replace(/\s+/g, ' ').trim();
  for (const [re, tf] of TF_WORDS) if (re.test(x)) return tf; return null;
}

export function mapInterpretation(x: ClaimExtraction, it: Interpretation): Mapped {
  const rs = x.ruleSets[it.ruleSet], missing: string[] = [];
  // Any entry or stop rule that cannot be expressed is essential, whatever the model marked (05 s4.3).
  const essential = it.unsupported.filter(u => u.essential || u.rule === 'entry' || u.rule === 'stop'), notTested = it.unsupported.filter(u => !essential.includes(u)).map(u => u.text);
  for (const u of essential) missing.push(`${u.rule} rule that cannot be expressed: ${u.text}`);
  if (it.target === 'none') { if (!missing.length) missing.push('no template or rule format fits these rules'); return { ok: false, missing }; }
  if (missing.length) return { ok: false, missing };
  if (it.target === 'template') {
    const t = instantiate({ template: it.template!.id, params: Object.fromEntries(it.template!.params.map(p => [p.name, p.value])) });
    if (!t.ok) return { ok: false, missing: t.errors.map(e => `the rules could not be fitted to a known strategy family: ${e}`) };
    const named = rs.timeframe.map(parseTf).find(Boolean) ?? null, tf = (named ?? t.template.tf) as Tf;
    if (!named && rs.timeframe.length) notTested.push(`the source's timeframe (${rs.timeframe.join(', ')}) is not one Apex has; ${t.template.tf} was used`);
    // Default parameters are, by the catalog's own test, exactly a built-in strategy. It keeps the built-in's id, so a claim that
    // restates a strategy Apex already tried lands on the same trial instead of spending a new try on the same rules.
    const builtin = Object.entries(t.template.params).every(([k, d]) => t.ref.params[k] === d.default);
    return { ok: true, runnable: { id: builtin ? t.template.builtin : t.id, fingerprint: strategyFingerprint({ build: t.build }), kind: 'template', label: it.label, tf, direction: t.template.direction === 'both' ? 'both' : 'long', rules: t.ref, canonical: t.ref, build: t.build, notTested } };
  }
  let spec: Spec; try { spec = fromModel(it.spec); } catch { return { ok: false, missing: ['the rules could not be written in the rule format'] }; }
  let errors: string[]; try { errors = validate(spec); } catch (e) { errors = [`malformed: ${String((e as Error).message).slice(0, 120)}`]; }
  if (errors.length) return { ok: false, missing: errors.slice(0, 6).map(e => `the rules could not be written in the rule format: ${e}`) };
  // The id depends on the rules only, so the same rules under another title or symbol are the same strategy and the same trial.
  const { name: _n, description: _d, symbol: _s, unsupported, ...core } = spec, build = compile(spec);
  for (const u of unsupported ?? []) if (!notTested.includes(u)) notTested.push(u);
  return { ok: true, runnable: { id: `spec:${hashOf(core).slice(0, 12)}`, fingerprint: strategyFingerprint({ build }), kind: 'spec', label: it.label, tf: spec.tf, direction: spec.direction, rules: spec, canonical: core, build, notTested } };
}
