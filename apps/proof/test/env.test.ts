// The product's settings (docs/design/12 s13): its schema refuses every variable of the personal app, refuses a live payment
// key before the paid stage, and never prints a value. The public wording is held to the rules for public pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BANNED } from '@apex/claims/report';
import { SHARED_NAME, VARS, guard, isPersonal, readEnv } from '../lib/env';
import { COPY, allCopy } from '../lib/copy';

const ROOT = resolve(__dirname, '../../..'), names = (text: string) => [...new Set([...text.matchAll(/^#?\s?([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]))];
// Built here so that no key-shaped text sits in the repository.
const key = (kind: 'test' | 'live') => ['sk', kind, 'x'.repeat(24)].join('_');

test('env: every variable of the personal app is refused, by name, and no value is ever printed', () => {
  const personal = names(readFileSync(join(ROOT, '.env.example'), 'utf8')).filter(n => n !== SHARED_NAME);
  assert.ok(personal.length > 40, 'the root .env.example was read');
  for (const n of personal) { assert.ok(isPersonal(n), `${n} is a personal variable the product's schema does not know`);
    const e = readEnv({ [n]: 'value-that-must-not-appear' }); assert.equal(e.ok, false, n); assert.match(e.problems[0], new RegExp(`\\b${n}\\b`)); assert.doesNotMatch(e.problems.join(' '), /value-that-must-not-appear/);
    assert.throws(() => guard({ [n]: '1' }), /Proof will not run with these settings/); }
  // An empty value is not a setting. The names the product uses itself are never refused.
  assert.equal(readEnv({ APEX_ALLOW_LIVE: '' }).ok, true);
  for (const v of VARS) assert.equal(isPersonal(v.name), false, v.name);
  // The platform's own variables are left alone.
  assert.equal(readEnv({ NODE_ENV: 'production', VERCEL: '1', VERCEL_URL: 'x.example', PATH: '/bin' }).ok, true);
});

test('env: the two example files share one name only, and the product\'s lists exactly what the schema reads', () => {
  const mine = names(readFileSync(join(ROOT, 'apps/proof/.env.example'), 'utf8')), theirs = names(readFileSync(join(ROOT, '.env.example'), 'utf8'));
  assert.deepEqual([...mine].sort(), VARS.map(v => v.name).sort());
  assert.deepEqual(mine.filter(n => theirs.includes(n)), [SHARED_NAME]);
  // No value is filled in.
  assert.doesNotMatch(readFileSync(join(ROOT, 'apps/proof/.env.example'), 'utf8'), /^[A-Z_]+=\S/m);
});

test('env: a live payment key is refused before the paid stage, and the stage must be one of three', () => {
  assert.deepEqual(readEnv({}).problems, []); assert.equal(readEnv({}).stage, 'internal');
  assert.equal(readEnv({ STRIPE_SECRET_KEY: key('test') }).ok, true);
  for (const stage of [undefined, 'internal', 'beta']) { const e = readEnv({ PROOF_STAGE: stage, STRIPE_SECRET_KEY: key('live') }); assert.equal(e.ok, false); assert.match(e.problems[0], /not a test-mode key/); assert.doesNotMatch(e.problems.join(' '), /xxxx/); }
  assert.equal(readEnv({ PROOF_STAGE: 'paid', STRIPE_SECRET_KEY: key('live') }).ok, true);
  assert.match(readEnv({ PROOF_STAGE: 'paid', STRIPE_SECRET_KEY: key('test') }).problems[0], /stage is paid but/);
  const bad = readEnv({ PROOF_STAGE: 'live' }); assert.equal(bad.ok, false); assert.equal(bad.stage, 'internal', 'an unknown stage is treated as the most closed one');
  assert.equal(readEnv({ PROOF_BASE_URL: 'http://proof.example' }).ok, false); assert.equal(readEnv({ PROOF_BASE_URL: 'https://proof.example' }).ok, true); assert.equal(readEnv({ PROOF_BASE_URL: 'http://localhost:3200' }).ok, true);
  assert.equal(readEnv({ PROOF_AI_GLOBAL_DAILY_USD: 'lots' }).ok, false);
  assert.deepEqual(readEnv({ SUPABASE_URL: 'https://x.example' }).has.SUPABASE_URL, true);
  // The health route says ok and the stage, and nothing about any setting.
  const health = readFileSync(join(ROOT, 'apps/proof/app/api/health/route.ts'), 'utf8'); assert.match(health, /\{ ok: e\.ok, stage: e\.stage \}/); assert.doesNotMatch(health, /problems|\.has\b/);
  // Every request is refused first by the middleware, which runs in the Node runtime and lets only the health route answer for itself.
  const mw = readFileSync(join(ROOT, 'apps/proof/middleware.ts'), 'utf8'); assert.match(mw, /runtime: 'nodejs'/); assert.match(mw, /matcher: \['\/\(\(\?!api\/health\$\)\.\*\)'\]/); assert.match(mw, /status: 503/); assert.doesNotMatch(mw, /process\.env/);
  // Every page is behind the guard as well.
  assert.match(readFileSync(join(ROOT, 'apps/proof/app/layout.tsx'), 'utf8'), /export default function RootLayout[^]*?\{\s*guard\(\);/);
});

test('copy: no promise, none of the words Apex never uses, seven checks, and the not-advice line on every page', () => {
  const all = allCopy(); assert.ok(all.length > 20);
  for (const s of all) { assert.doesNotMatch(s, BANNED, s); assert.doesNotMatch(s, /\b(guarantee\w*|risk[- ]free|get rich|profitable|winning|beat the market|passive income|sure thing|\d+ ?% (a|per) (day|week|month|year))\b/i, s); }
  assert.equal(COPY.method.checks.length, 7);
  assert.match(COPY.notAdvice, /not investment advice/); assert.match(COPY.notAdvice, /Nothing here is a promise about the future/);
  const layout = readFileSync(join(ROOT, 'apps/proof/app/layout.tsx'), 'utf8'); assert.match(layout, /\{COPY\.notAdvice\}/); assert.match(layout, /\{COPY\.never\}/);
  // The pages show only that fixed text: no sentence is written in a page file.
  for (const p of ['app/page.tsx', 'app/method/page.tsx']) { const body = readFileSync(join(ROOT, 'apps/proof', p), 'utf8'); for (const m of body.matchAll(/>([^<>{}]{25,})</g)) assert.fail(`${p} has its own sentence: ${m[1]}`); }
});
