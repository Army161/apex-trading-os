#!/usr/bin/env node
// Keeps the product (apps/proof) apart from Jeremy's own trading system (docs/design/12 s4 and s13).
// The only thing the two share is code in a short list of packages. This check fails when:
//   1. a file in apps/proof imports anything outside its own folder, its own dependencies and the allowed packages
//   2. anything apps/proof reaches, through any chain of imports, is a broker, the order pipeline, the personal dashboard,
//      a bot, the terminal or the executor
//   3. a file in apps/proof other than lib/env.ts reads the environment
//   4. apps/proof's package.json or next.config.mjs names a package that is not allowed
//   5. anything outside apps/proof imports from it
// Run: node tools/separation_check.mjs        Exit 0 clean, 1 with one line per finding.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

export const ALLOWED = ['engine', 'kernel', 'claims', 'data', 'store', 'sdk', 'ui'];
/** Paths (from the repository root) the product must never reach, directly or through a package. */
export const FORBIDDEN = ['packages/autopilot/src/broker/', 'packages/autopilot/src/pipeline.ts', 'packages/autopilot/src/index.ts', 'packages/mcp/', 'packages/api/', 'web/', 'bots/', 'apps/cli/', 'apps/executor/'];
const ENV_FILE = 'apps/proof/lib/env.ts';
const CODE = /\.(ts|tsx|mts|mjs|js|jsx)$/, SKIP = new Set(['node_modules', '.next', '.git', 'dist', '__pycache__', '.venv', 'ui-check']);
const posix = p => p.split(sep).join('/');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) { if (SKIP.has(n)) continue; const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (CODE.test(n)) out.push(p); }
  return out;
}
/** Every module a file names: import, export from, dynamic import and require. Comments are dropped first. */
export function imports(text) {
  const t = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'), out = new Set();
  for (const re of [/\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g])
    for (const m of t.matchAll(re)) out.add(m[1]);
  return [...out];
}
const tryFile = p => { for (const c of [p, `${p}.ts`, `${p}.tsx`, `${p}.mjs`, `${p}.js`, join(p, 'index.ts'), join(p, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return c; return null; };
/** Where a module name leads, as a path from the root; null for a package from npm, a built-in or a stylesheet. */
export function resolveImport(root, from, spec) {
  if (/\.(css|json)$/.test(spec) && !spec.startsWith('.')) { const m = /^@apex\/([\w-]+)\/(.+)$/.exec(spec); return m ? posix(join('packages', m[1], 'src', m[2])) : null; }
  if (spec.startsWith('.')) { const f = tryFile(resolve(dirname(join(root, from)), spec)); return f ? posix(relative(root, f)) : posix(relative(root, resolve(dirname(join(root, from)), spec))); }
  if (spec.startsWith('@/')) { const app = from.startsWith('apps/proof/') ? 'apps/proof' : from.startsWith('web/') ? 'web' : null; if (!app) return null; const f = tryFile(join(root, app, spec.slice(2))); return f ? posix(relative(root, f)) : `${app}/${spec.slice(2)}`; }
  const m = /^@apex\/([\w-]+)(?:\/(.+))?$/.exec(spec);
  if (m) { const f = tryFile(join(root, 'packages', m[1], 'src', m[2] ?? 'index')); return f ? posix(relative(root, f)) : `packages/${m[1]}/src/${m[2] ?? 'index.ts'}`; }
  return null;
}
const pkgName = spec => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
const isBuiltin = spec => spec.startsWith('node:') || builtinModules.includes(spec);
const hit = p => FORBIDDEN.find(f => p === f || p.startsWith(f));

/** All findings, as plain sentences. `read` and `files` can be replaced in tests. */
export function findings(root, o = {}) {
  const read = o.read ?? (p => readFileSync(join(root, p), 'utf8')), list = o.files ?? (dir => walk(join(root, dir)).map(p => posix(relative(root, p))));
  const out = [], proof = list('apps/proof'), pkg = JSON.parse(read('apps/proof/package.json')), deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const allowed = new Set(ALLOWED.map(a => `@apex/${a}`));
  // 4. The package list.
  for (const d of deps) if (d.startsWith('@apex/') && !allowed.has(d)) out.push(`apps/proof/package.json depends on ${d}, which the product may not use`);
  const cfg = 'apps/proof/next.config.mjs'; try { for (const m of read(cfg).matchAll(/@apex\/[\w-]+/g)) if (!allowed.has(m[0])) out.push(`${cfg} names ${m[0]}, which the product may not use`); } catch { /* no config yet */ }
  // 1 and 3. Each file of the product.
  for (const f of proof) {
    const text = read(f), test = f.startsWith('apps/proof/test/');
    if (!test && f !== ENV_FILE && f !== cfg && /\bprocess\s*\.\s*env\b|\bimport\.meta\.env\b/.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'))) out.push(`${f} reads the environment. Only ${ENV_FILE} may`);
    for (const spec of imports(text)) {
      const to = resolveImport(root, f, spec);
      if (to) { if (!to.startsWith('apps/proof/') && !(to.startsWith('packages/') && allowed.has(`@apex/${to.split('/')[1]}`)) && !(test && to.startsWith('tools/'))) out.push(`${f} imports ${spec}, which is outside the product and not an allowed package`);
        if (spec.startsWith('.') && to.startsWith('packages/')) out.push(`${f} reaches into ${to} by path. Use the package name`); }
      else if (!isBuiltin(spec) && !deps.has(pkgName(spec)) && !/\.css$/.test(spec)) out.push(`${f} imports ${spec}, which is not in apps/proof/package.json`);
    }
  }
  // 2. Everything reachable.
  const seen = new Map(), queue = proof.filter(f => !f.startsWith('apps/proof/test/')).map(f => [f, f]);
  while (queue.length) { const [f, via] = queue.shift(); if (seen.has(f)) continue; seen.set(f, via);
    const bad = hit(f); if (bad) { out.push(`apps/proof reaches ${f} (through ${via}), and ${bad} is off limits to the product`); continue; }
    let text; try { text = read(f); } catch { continue; }
    if (!CODE.test(f)) continue;
    for (const spec of imports(text)) { const to = resolveImport(root, f, spec); if (to && !seen.has(to)) queue.push([to, f]); } }
  // 5. Nothing leans on the product.
  for (const dir of ['packages', 'web', 'apps/cli', 'tools']) for (const f of list(dir)) { if (f === 'tools/separation_check.mjs') continue;
    for (const spec of imports(read(f))) { const to = resolveImport(root, f, spec); if ((to && to.startsWith('apps/proof/')) || spec === 'proof-app' || spec.startsWith('proof-app/')) out.push(`${f} imports ${spec} from the product. Shared code belongs in packages/`); } }
  return [...new Set(out)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), f = findings(root);
  if (f.length) { for (const x of f) console.log(x); console.log(`separation check: ${f.length} finding${f.length === 1 ? '' : 's'}`); process.exit(1); }
  console.log('separation check: clean');
}
