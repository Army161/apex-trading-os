// Template catalog tests (build plan P3.5): defaults reproduce the built-ins, references survive a round trip through JSON,
// bounds are enforced without silent clamping, and every parameter actually changes the rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, strategyFingerprint } from '../src/fingerprint';
import { STRATEGIES } from '../src/strategies';
import { TEMPLATES, catalog, instantiate, resolveParams, templateKey } from '../src/templates';
import committed from '../fingerprints.json';

for (const t of TEMPLATES) {
  test(`template ${t.id}: defaults are the built-in ${t.builtin}; round trip; bounds; live parameters`, () => {
    const a = instantiate({ template: t.id }); assert.ok(a.ok, JSON.stringify(a));
    if (!a.ok) return;
    const fp = strategyFingerprint({ build: a.build });
    assert.ok(STRATEGIES.some(s => s.id === t.builtin)); assert.equal(fp, (committed.strategies as Record<string, string>)[t.builtin], 'default parameters must reproduce the built-in exactly');
    const again = instantiate(JSON.parse(JSON.stringify(a.ref))); assert.ok(again.ok && again.id === a.id && templateKey(again.ref) === templateKey(a.ref) && strategyFingerprint({ build: again.build }) === fp, 'round trip through JSON');
    const shuffled = instantiate({ template: t.id, params: Object.fromEntries(Object.entries(a.ref.params).reverse()) }); assert.ok(shuffled.ok && shuffled.id === a.id, 'key order does not change the id');
    for (const [k, d] of Object.entries(t.params)) {
      if (d.kind === 'choice') { assert.match(resolveParams(t, { [k]: 'nope' }).errors.join(), /must be one of/); 
        for (const o of d.options.filter(x => x !== d.default)) { const v = instantiate({ template: t.id, params: { [k]: o } }); assert.ok(v.ok && v.id !== a.id && strategyFingerprint({ build: v.build }) !== fp, `${k}=${o} changes nothing`); }
        continue; }
      assert.match(resolveParams(t, { [k]: d.max + 1 }).errors.join(), /outside/); assert.match(resolveParams(t, { [k]: d.min - 1 }).errors.join(), /outside/); assert.match(resolveParams(t, { [k]: '5' }).errors.join(), /must be a number/);
      if (d.int) assert.match(resolveParams(t, { [k]: d.default + 0.5 }).errors.join(), /whole number/);
      const other = [d.int ? d.default + 1 : d.default * 1.5, d.int ? d.default - 1 : d.default * 0.6, d.int ? d.default + 5 : d.default + (d.max - d.default) / 2].filter(x => x >= d.min && x <= d.max && x !== d.default);
      const changed = other.some(x => { const v = instantiate({ template: t.id, params: { [k]: x } }); return v.ok && v.id !== a.id && strategyFingerprint({ build: v.build }) !== fp; });
      assert.ok(changed, `changing ${k} never changes the signals`);
    }
    assert.match(resolveParams(t, { nope: 1 }).errors.join(), /no parameter "nope"/);
  });
}

test('catalog: unknown templates and cross-parameter rules are refused; the catalog is plain data', () => {
  const r = instantiate({ template: 'nope' }); assert.ok(!r.ok && /no template/.test(r.errors[0]));
  const x = instantiate({ template: 'ma_cross', params: { fast: 50, slow: 20 } }); assert.ok(!x.ok && /shorter than slow/.test(x.errors[0]));
  const y = instantiate({ template: 'breakout_channel', params: { entryN: 20, exitN: 20 } }); assert.ok(!y.ok);
  assert.equal(new Set(TEMPLATES.map(t => t.id)).size, TEMPLATES.length); assert.equal(TEMPLATES.length, 14);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(catalog()))); assert.ok(catalog().every(t => !('build' in t)));
  assert.ok(fixtures().length === 3);
});
