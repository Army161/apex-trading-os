// Guard hook tests (docs/design/10 s5): a table of recorded hook inputs, the sign-off cases, the plugin wiring and the scan score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main } from '../src/main';
import { makeCtx, makeSignoff } from '../src/runtime';

const ROOT = resolve(__dirname, '../../..'), NOW = Date.UTC(2026, 10, 11, 12), KEY = randomBytes(24).toString('hex');
const load = (): Promise<any> => import(pathToFileURL(join(ROOT, 'tools/guard_hook.mjs')).href);
/** A throwaway repo with the real red-path list and one red file in it. */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'apex-guard-'));
  for (const d of ['.github', 'packages/kernel/src', 'tools', 'docs', 'db/migrations', 'ledger/heads']) mkdirSync(join(root, d), { recursive: true });
  cpSync(join(ROOT, '.github/red-paths.txt'), join(root, '.github/red-paths.txt')); writeFileSync(join(root, 'packages/kernel/src/guard.ts'), 'export const riskPct = 0.01;\n'); writeFileSync(join(root, 'docs/notes.md'), 'notes\n');
  return root;
}
const ctxOf = (h: any, root: string, over: object = {}) => ({ root, env: {}, now: NOW, globs: h.readGlobs(root), branchFiles: () => [], currentBranch: () => 'claude/work', ...over });
const sign = (root: string, path: string, key = KEY, now = NOW) => { const s = makeSignoff(root, path, 'tighten the default', key, now); mkdirSync(join(root, '.apex/signoff'), { recursive: true }); return s; };
const save = (h: any, root: string, s: any) => writeFileSync(h.signoffFile(root, s.path), JSON.stringify(s));

test('guard hook: file edits. A red path is refused with what to do instead, a normal edit passes silently', async () => {
  const h = await load(), root = sandbox(), ctx = ctxOf(h, root), edit = (file_path: string, extra: object = { new_string: 'x' }, tool = 'Edit') => h.decide({ tool_name: tool, tool_input: { file_path, ...extra }, cwd: root }, ctx);
  const red = edit('packages/kernel/src/guard.ts'); assert.equal(red.allow, false); assert.match(red.why, /This is a red path\. Write the change as a proposal in docs\/specs\/ or open a pull request for Jeremy/);
  for (const p of ['.env.example', 'packages/kernel/src/new-file.ts', join(root, 'packages/kernel/src/guard.ts'), 'packages/autopilot/src/pipeline.ts', '.github/workflows/ci.yml', '.github/red-paths.txt', 'tools/guard_hook.mjs', 'plugin/hooks/hooks.json', 'db/migrations/0002_x.sql', 'web/lib/policy.ts', './packages/kernel/../kernel/src/gate.ts'])
    assert.equal(edit(p).allow, false, `${p} should be refused`);
  assert.equal(edit('packages/kernel/src/guard.ts', { content: 'x' }, 'Write').allow, false); assert.equal(h.decide({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'packages/kernel/x.ipynb', new_source: 'x' }, cwd: root }, ctx).allow, false);
  for (const p of ['docs/notes.md', 'packages/engine/src/queue.ts', 'packages/claims/src/check.ts', 'README.md', 'deploy/config.yml', '/tmp/outside-the-repo.txt', '../elsewhere/file.ts'])
    assert.deepEqual(edit(p), { allow: true }, `${p} should pass`);
  assert.equal(h.reply({ allow: true }), '', 'an allowed call prints nothing');
  const out = JSON.parse(h.reply(red)); assert.equal(out.hookSpecificOutput.permissionDecision, 'deny'); assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
});

test('guard hook: keys, live flags, environment files and ledger heads are refused, and no sign-off changes that', async () => {
  const h = await load(), root = sandbox(), token = ['ghp', randomBytes(20).toString('hex')].join('_'), model = ['sk', 'ant', 'api03', randomBytes(16).toString('hex')].join('-');
  for (const p of ['.env', 'ledger/heads/main.json']) save(h, root, sign(root, p));
  const ctx = ctxOf(h, root, { env: { APEX_SIGNOFF_KEY: KEY } }), w = (file_path: string, content: string) => h.decide({ tool_name: 'Write', tool_input: { file_path, content }, cwd: root }, ctx);
  assert.match(w('docs/notes.md', `token: ${token}`).why, /looks like a key or token/); assert.match(w('docs/setup.md', `export ANTHROPIC_API_KEY=${model}`).why, /looks like a key/);
  assert.match(w('.env.example', 'APEX_ALLOW_LIVE=1').why, /live-trading flag/); assert.match(w('deploy/config.yml', 'BOT_LIVE: true').why, /live-trading flag/);
  assert.equal(w('docs/notes.md', 'Never set APEX_ALLOW_LIVE in an agent session.').allow, true, 'mentioning the flag in prose is fine'); assert.equal(w('deploy/config.yml', 'APEX_ALLOW_LIVE:').allow, true, 'naming the variable with no value is fine');
  assert.match(w('.env', 'A=1').why, /environment file/); assert.match(w('ledger/heads/main.json', '{}').why, /No sign-off covers it/);
  assert.equal(h.decide({ tool_name: 'Edit', tool_input: { file_path: 'docs/notes.md', edits: [{ new_string: token }] }, cwd: root }, ctx).allow, false);
});

test('guard hook: sign-offs. Valid passes; unsigned, wrong key, expired, too long, another file, changed file and no key are refused', async () => {
  const h = await load(), P = 'packages/kernel/src/guard.ts';
  const attempt = (prep: (root: string) => void, env: object = { APEX_SIGNOFF_KEY: KEY }, now = NOW) => { const root = sandbox(); prep(root); return h.decide({ tool_name: 'Edit', tool_input: { file_path: P, new_string: 'x' }, cwd: root }, ctxOf(h, root, { env, now })); };
  assert.deepEqual(attempt(r => save(h, r, sign(r, P))), { allow: true }, 'a sign-off made by apex signoff is accepted by the hook');
  const cases: [string, RegExp, (r: string) => void, object?, number?][] = [
    ['no sign-off', /no sign-off for this path/, () => {}],
    ['no key on this machine', /no sign-off key on this machine/, r => save(h, r, sign(r, P)), {}],
    ['signed with another key', /signature does not match/, r => save(h, r, sign(r, P, randomBytes(24).toString('hex')))],
    ['unsigned', /incomplete/, r => { const { sig: _s, ...rest } = sign(r, P); save(h, r, rest); }],
    ['reason edited after signing', /signature does not match/, r => save(h, r, { ...sign(r, P), reason: 'anything at all' })],
    ['expiry edited after signing', /signature does not match/, r => save(h, r, { ...sign(r, P), expires: new Date(NOW + 400 * 3600e3).toISOString() })],
    ['expired', /expired/, r => save(h, r, sign(r, P)), undefined, NOW + 49 * 3600e3],
    ['runs longer than 48 hours', /longer than 48 hours/, r => { const s = { ...sign(r, P), expires: new Date(NOW + 100 * 3600e3).toISOString() }; save(h, r, { ...s, sig: h.signoffSig(KEY, s) }); }],
    ['made for another file', /another path/, r => writeFileSync(h.signoffFile(r, P), JSON.stringify(sign(r, 'packages/kernel/src/gate.ts')))],
    ['file changed since signing', /changed since the sign-off/, r => { save(h, r, sign(r, P)); writeFileSync(join(r, P), 'export const riskPct = 0.5;\n'); }],
    ['not JSON', /cannot be read/, r => { sign(r, P); writeFileSync(h.signoffFile(r, P), 'yes'); }],
  ];
  for (const [name, why, prep, env, now] of cases) { const d = attempt(prep, env, now); assert.equal(d.allow, false, name); assert.match(d.why, why, name); }
});

test('guard hook: shell commands. Each write pattern on a red path is caught; reading, building and pushing a branch pass', async () => {
  const h = await load(), root = sandbox(), ctx = ctxOf(h, root), sh = (command: string, over: object = {}) => h.decide({ tool_name: 'Bash', tool_input: { command }, cwd: root }, { ...ctx, ...over });
  const G = 'packages/kernel/src/guard.ts';
  const denied = [`sed -i 's/0.01/0.5/' ${G}`, `perl -pi -e 's/a/b/' ${G}`, `echo "x" > ${G}`, `echo x >> .github/red-paths.txt`, `cat patch.txt | tee ${G}`, `mv /tmp/new.ts ${G}`, `cp /tmp/new.ts ${G}`, `rm ${G}`, 'rm -r packages/kernel', `git checkout -- ${G}`,
    `git restore ${G}`, `git apply fix.patch && touch ${G}`, `patch ${G} < fix.patch`, `npm test && sed -i s/a/b/ tools/guard_hook.mjs`, `cd packages && truncate -s 0 kernel/src/guard.ts`.replace('cd packages && truncate -s 0 kernel', 'truncate -s 0 packages/kernel'),
    'echo A=1 >> .env', 'rm -rf db/migrations', 'git rm db/migrations/0001_ledger.sql', 'git push origin main', 'git push origin HEAD:main', 'git push --force origin claude/work', 'APEX_ALLOW_LIVE=1 npm run apex -- run', 'export BOT_LIVE=true', 'env PAPER=0 EXEC_LIVE=1 node bot.js',
    'echo "APEX_ALLOW_LIVE=1" >> deploy.env', 'gh secret set APEX_ALLOW_LIVE --body APEX_ALLOW_LIVE=1'];
  for (const c of denied) assert.equal(sh(c).allow, false, `should be refused: ${c}`);
  const allowed = [`cat ${G}`, `grep -n riskPct ${G}`, `cat ${G} > /tmp/copy.ts`, `git diff -- ${G}`, `cp ${'docs/notes.md'} /tmp/x`, 'npm run typecheck && npm test', 'git status --short', 'git add -A && git commit -m "touch packages/kernel later"', 'git push -u origin claude/project-thread-x4wxvb',
    'git push --force-with-lease origin claude/work', 'grep -rn "APEX_ALLOW_LIVE=1" docs', 'sed -i s/a/b/ docs/notes.md', 'echo done > /tmp/out.txt', 'git merge origin/main', 'git fetch origin main', 'ls packages/kernel/src'];
  for (const c of allowed) assert.deepEqual(sh(c), { allow: true }, `should pass: ${c}`);
  assert.match(sh('git merge claude/work', { currentBranch: () => 'main' }).why, /do not merge into main/);
  assert.match(sh('gh pr merge 2 --squash', { branchFiles: () => ['packages/kernel/src/gate.ts', 'README.md'] }).why, /An agent never merges those\. Jeremy reviews and merges/); assert.equal(sh('gh pr merge 7', { branchFiles: () => ['README.md'] }).allow, true);
  save(h, root, sign(root, G)); assert.equal(sh(`sed -i 's/0.01/0.005/' ${G}`, { env: { APEX_SIGNOFF_KEY: KEY } }).allow, true, 'a signed-off file may be written from the shell too');
});

test('guard hook: fails closed on input it cannot read, and ignores tools it does not guard', async () => {
  const h = await load(), root = sandbox(), ctx = ctxOf(h, root);
  for (const bad of [null, {}, { tool_name: 'Edit' }, { tool_name: 'Bash', tool_input: {} }, { tool_name: 7, tool_input: {} }]) assert.equal(h.decide(bad, ctx).allow, false);
  assert.deepEqual(h.decide({ tool_name: 'Read', tool_input: { file_path: 'packages/kernel/src/guard.ts' }, cwd: root }, ctx), { allow: true });
  assert.match(h.run('not json', {}, root, NOW), /"permissionDecision":"deny"/); assert.match(h.run('{}', {}, mkdtempSync(join(tmpdir(), 'apex-empty-')), NOW), /red-path list .* cannot be read/);
});

test('guard hook: run as a process, through the plugin launcher, exactly as Claude Code runs it', () => {
  const root = sandbox(); cpSync(join(ROOT, 'tools/guard_hook.mjs'), join(root, 'tools/guard_hook.mjs'));
  const hook = (input: object, dir = root) => spawnSync('node', [join(ROOT, 'plugin/hooks/guard.mjs')], { input: JSON.stringify(input), encoding: 'utf8', env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: dir } });
  const red = hook({ tool_name: 'Edit', tool_input: { file_path: join(root, 'packages/kernel/src/guard.ts'), old_string: '0.01', new_string: '0.5' }, cwd: root });
  assert.equal(red.status, 0); assert.equal(JSON.parse(red.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const fine = hook({ tool_name: 'Edit', tool_input: { file_path: join(root, 'docs/notes.md'), old_string: 'notes', new_string: 'more notes' }, cwd: root }); assert.equal(fine.status, 0); assert.equal(fine.stdout, '');
  const other = mkdtempSync(join(tmpdir(), 'not-apex-')), elsewhere = hook({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, cwd: other }, other); assert.equal(elsewhere.status, 0); assert.equal(elsewhere.stdout, '', 'outside Apex the plugin does nothing');
  writeFileSync(join(root, 'tools/guard_hook.mjs'), 'this is not javascript ((('); const broken = hook({ tool_name: 'Edit', tool_input: { file_path: join(root, 'docs/notes.md'), new_string: 'x' }, cwd: root });
  assert.equal(JSON.parse(broken.stdout).hookSpecificOutput.permissionDecision, 'deny', 'rules that cannot load mean the call is refused');
  const start = spawnSync('node', [join(ROOT, 'plugin/hooks/session_start.mjs')], { encoding: 'utf8', env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: ROOT } }); assert.equal(start.stdout.trim().split('\n').length, 3); assert.match(start.stdout, /paper first/);
});

test('plugin: the hooks file points at files that exist, the hook is itself a red path, and the scan score has not risen', async () => {
  const h = await load(), hooks = JSON.parse(readFileSync(join(ROOT, 'plugin/hooks/hooks.json'), 'utf8')).hooks, rx = h.readGlobs(ROOT).map(h.toRegex);
  for (const ev of ['PreToolUse', 'SessionStart']) for (const g of hooks[ev]) for (const x of g.hooks) { const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/.exec(x.command); assert.ok(m && existsSync(join(ROOT, 'plugin', m[1])), x.command); }
  assert.match(hooks.PreToolUse[0].matcher, /Edit\|Write/); assert.match(hooks.PreToolUse[0].matcher, /Bash/);
  for (const p of ['tools/guard_hook.mjs', 'plugin/hooks/guard.mjs', 'plugin/hooks/hooks.json', '.github/red-paths.txt']) assert.ok(rx.some((r: RegExp) => r.test(p)), `${p} must be a red path`);
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8')).name, 'apex');
  const recorded = JSON.parse(readFileSync(join(ROOT, 'plugin/SCAN.json'), 'utf8'))[0].score, scan = spawnSync('python3', [join(ROOT, 'tools/skill_scan.py'), join(ROOT, 'plugin'), '--json'], { encoding: 'utf8' });
  if (scan.status !== null && scan.stdout.trim().startsWith('[')) assert.ok(JSON.parse(scan.stdout)[0].score <= recorded, `scan score rose above the recorded ${recorded}`);
});

test('apex signoff: refuses without the key or without a person at a terminal; with both it writes a sign-off the hook accepts', async () => {
  const h = await load(), root = sandbox(), out: string[] = [], P = 'packages/kernel/src/guard.ts';
  const run = (env: Record<string, string>, confirm?: (q: string, expect: string) => Promise<boolean>, ...argv: string[]) => { out.length = 0; return main(argv, { ...makeCtx(root, { APEX_STATE_DIR: join(root, '.apex'), ...env }, () => NOW), confirm }, s => out.push(s)); };
  assert.equal(await run({}, async () => true, 'signoff', P, '--reason', 'tighten'), 2); assert.match(out.join('\n'), /APEX_SIGNOFF_KEY is not set/);
  assert.equal(await run({ APEX_SIGNOFF_KEY: KEY }, undefined, 'signoff', P, '--reason', 'tighten'), 2); assert.match(out.join('\n'), /needs a person at a real terminal/);
  assert.equal(await run({ APEX_SIGNOFF_KEY: KEY }, async () => true, 'signoff', P), 2); assert.equal(await run({ APEX_SIGNOFF_KEY: KEY }, async () => true, 'signoff', '../outside.ts', '--reason', 'x'), 2);
  assert.equal(await run({ APEX_SIGNOFF_KEY: KEY }, async () => false, 'signoff', P, '--reason', 'tighten'), 2); assert.ok(!existsSync(h.signoffFile(root, P)), 'a wrong confirmation signs nothing');
  let asked = ''; assert.equal(await run({ APEX_SIGNOFF_KEY: KEY }, async (q, expect) => { asked = `${q}|${expect}`; return true; }, 'signoff', P, '--reason', 'tighten the default'), 0); assert.match(asked, /Type the path to confirm: \|packages\/kernel\/src\/guard\.ts$/);
  assert.ok(!out.join('\n').includes(KEY), 'the key is never printed'); assert.ok(!readFileSync(h.signoffFile(root, P), 'utf8').includes(KEY), 'or stored');
  const edit = { tool_name: 'Edit', tool_input: { file_path: P, new_string: 'x' }, cwd: root };
  assert.deepEqual(h.decide(edit, ctxOf(h, root, { env: { APEX_SIGNOFF_KEY: KEY } })), { allow: true }); assert.equal(h.decide(edit, ctxOf(h, root)).allow, false, 'the same sign-off is worth nothing on a machine without the key');
});
