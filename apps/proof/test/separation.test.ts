// The product stays apart from the personal trading system (docs/design/12 s13, build plan P5.1). The check itself is
// tools/separation_check.mjs. Here it is run on the real tree, and then on the tree with one bad file added at a time,
// so each rule is shown to catch what it is for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ALLOWED, FORBIDDEN, findings, imports } from '../../../tools/separation_check.mjs';

const ROOT = resolve(__dirname, '../../..');
const real = (p: string) => readFileSync(join(ROOT, p), 'utf8');
function ls(dir: string, out: string[] = []): string[] { let names: string[] = []; try { names = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const n of names) { if (['node_modules', '.next', '.git', 'ui-check'].includes(n)) continue; const p = join(ROOT, dir, n); if (statSync(p).isDirectory()) ls(join(dir, n), out); else if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(n)) out.push(relative(ROOT, p).split('\\').join('/')); } return out; }
/** The real tree with extra or replaced files. */
// Fixture lines are written with IMPORT, EXPORT, FROM and REQUIRE in capitals and lowered here, so that the check, which also
// reads this file, does not take them for this file's own imports.
const code = (s: string) => s.replace(/\b(IMPORT|EXPORT|FROM|REQUIRE)\b/g, m => m.toLowerCase());
const withFiles = (raw: Record<string, string>) => { const extra = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, code(v)])); return findings(ROOT, { read: p => extra[p] ?? real(p), files: dir => [...new Set([...ls(dir), ...Object.keys(extra).filter(k => k.startsWith(dir + '/') && /\.(ts|tsx|mjs)$/.test(k))])] }); };

test('separation: the real tree is clean, and the allowed list is the one in the design', () => {
  assert.deepEqual(findings(ROOT), []);
  assert.deepEqual([...ALLOWED].sort(), ['claims', 'data', 'engine', 'kernel', 'sdk', 'store', 'ui']);
  for (const f of ['packages/autopilot/src/broker/', 'web/', 'bots/']) assert.ok(FORBIDDEN.includes(f), f);
  const pkg = JSON.parse(real('apps/proof/package.json')); assert.deepEqual(Object.keys(pkg.dependencies).filter(d => d.startsWith('@apex/')).sort(), ALLOWED.map(a => `@apex/${a}`).sort());
  for (const d of Object.keys(pkg.dependencies)) assert.doesNotMatch(d, /anthropic|alpaca|ccxt|stripe|telegram/i, 'the skeleton adds no provider SDK');
});

test('separation: a file in the product cannot import the broker, the dashboard, a bot or a package off the list', () => {
  const bad: [string, RegExp][] = [
    ["IMPORT { stepBar } FROM '@apex/autopilot/broker/barsim';", /imports @apex\/autopilot\/broker\/barsim, which is outside the product/],
    ["IMPORT { run } FROM '@apex/autopilot';", /imports @apex\/autopilot, which is outside the product/],
    ["IMPORT { TOOLS } FROM '@apex/mcp';", /imports @apex\/mcp/],
    ["IMPORT { gate } FROM '../../../web/lib/policy';", /imports \.\.\/\.\.\/\.\.\/web\/lib\/policy, which is outside the product/],
    ["const b = REQUIRE('../../../bots/polymarket/executor');", /outside the product/],
    ["EXPORT * FROM '../../../packages/kernel/src/ledger';", /reaches into packages\/kernel\/src\/ledger\.ts by path/],
    ["const x = await IMPORT('@apex/api');", /imports @apex\/api/],
    ["IMPORT Anthropic FROM '@anthropic-ai/sdk';", /not in apps\/proof\/package\.json/],
  ];
  for (const [line, want] of bad) { const f = withFiles({ 'apps/proof/lib/bad.ts': line }); assert.ok(f.some(x => want.test(x)), `${code(line)}\n${f.join('\n')}`); }
  // The allowed ones pass, including the claim checker, which itself uses the cost model from the autopilot package and nothing else of it.
  assert.deepEqual(withFiles({ 'apps/proof/lib/ok.ts': "IMPORT { checkClaim } FROM '@apex/claims';\nIMPORT { Ledger } FROM '@apex/kernel';\nIMPORT { TOKENS } FROM '@apex/ui';\nIMPORT { join } FROM 'node:path';\nIMPORT Link FROM 'next/link';\nIMPORT { COPY } FROM '@/lib/copy';\nexport const x = [checkClaim, Ledger, TOKENS, join, Link, COPY];" }), []);
  // A commented-out import is not an import.
  assert.deepEqual(imports(code("// IMPORT x FROM '@apex/mcp';\n/* IMPORT y FROM 'web'; */\nIMPORT z FROM './z';")), ['./z']);
});

test('separation: what the product reaches through a package is checked too', () => {
  // If the claim checker started to use the broker, the product would reach it without a line of the product changing.
  const claims = real('packages/claims/src/check.ts'), f = withFiles({ 'apps/proof/lib/uses.ts': "IMPORT { checkClaim } FROM '@apex/claims';\nexport const c = checkClaim;", 'packages/claims/src/check.ts': `IMPORT { stepBar } FROM '@apex/autopilot/broker/barsim';\n${claims}` });
  assert.ok(f.some(x => /apps\/proof reaches packages\/autopilot\/src\/broker\/barsim\.ts \(through packages\/claims\/src\/check\.ts\)/.test(x)), f.join('\n'));
});

test('separation: only lib/env.ts reads the environment, and nothing outside the product imports from it', () => {
  assert.ok(withFiles({ 'apps/proof/lib/sneaky.ts': 'export const k = process.env.STRIPE_SECRET_KEY;' }).some(x => /apps\/proof\/lib\/sneaky\.ts reads the environment/.test(x)));
  assert.ok(withFiles({ 'apps/proof/app/x/page.tsx': "EXPORT default function P() { return process . env['A'] ?? null; }" }).some(x => /reads the environment/.test(x)));
  assert.ok(withFiles({ 'web/lib/borrow.ts': "IMPORT { readEnv } FROM '../../apps/proof/lib/env';\nexport const r = readEnv;" }).some(x => /web\/lib\/borrow\.ts imports .* from the product/.test(x)));
  assert.ok(withFiles({ 'apps/proof/package.json': real('apps/proof/package.json').replace('"@apex/ui": "*"', '"@apex/ui": "*", "@apex/autopilot": "*"') }).some(x => /package\.json depends on @apex\/autopilot/.test(x)));
});
