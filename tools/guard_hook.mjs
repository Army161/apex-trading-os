#!/usr/bin/env node
// Guard hook (docs/design/10 s3, P0.4). A Claude Code PreToolUse hook: an agent working in this repo cannot quietly edit a red
// path, a live flag, the ledger heads or this file. Plain rules, no model, no network.
//
// This is the weakest of three layers, and it says so: a determined shell command can get around the command check. The layers
// that decide are CODEOWNERS with branch protection and the protected-paths CI job. This one stops the ordinary case early and
// tells the agent what to do instead.
//
//   stdin:  the hook input as JSON ({ tool_name, tool_input, cwd })
//   stdout: nothing when the call is allowed; a "deny" decision with the reason when it is not
//   exit:   always 0 for a decision. A broken input is denied, not waved through (fail closed).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = t => t.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
export const toRegex = glob => new RegExp('^' + glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');
export const readGlobs = (root = ROOT) => lines(readFileSync(join(root, '.github/red-paths.txt'), 'utf8'));
export const sha256 = s => createHash('sha256').update(s).digest('hex');

export const SIGNOFF_HOURS = 48;
export const HOW = 'This is a red path. Write the change as a proposal in docs/specs/ or open a pull request for Jeremy. A sign-off is created by Jeremy with `apex signoff`.';
// Shapes of common credentials. Writing one into any file is refused, sign-off or not.
const KEY_SHAPES = [/sk-ant-[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/, /xox[abp]-[A-Za-z0-9-]{20,}/, /\b\d{8,}:[A-Za-z0-9_-]{35}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/];
// APEX_ALLOW_LIVE=..., FOO_LIVE=true, export BAR_LIVE=1. Reading or mentioning the name is fine; giving it a value is not.
const LIVE_ASSIGN = /\b(APEX_ALLOW_LIVE|[A-Z][A-Z0-9_]*_LIVE)\b\s*[:=]\s*["']?\w/;
const ENV_FILE = /(^|\/)\.env(\.[\w.-]+)?$/;
const NEVER = [{ re: /^ledger\/heads\//, why: 'ledger/heads/ is written only by the ledger itself' }];

/** The signature Jeremy's `apex signoff` writes and this hook checks. */
export const signoffSig = (key, s) => createHmac('sha256', key).update(`${s.path}|${s.baseHash}|${s.reason}|${s.expires}`).digest('hex');
export const signoffFile = (root, path) => join(root, '.apex/signoff', `${sha256(path)}.json`);
/** The content hash a sign-off is made against. A file that does not exist yet hashes as "new". */
export const baseHashOf = (root, path, fs = { existsSync, readFileSync }) => (fs.existsSync(join(root, path)) ? sha256(fs.readFileSync(join(root, path))) : 'new');

/** Why a sign-off does not count, or null when it does. No key in the environment means no sign-off is valid. */
export function signoffProblem(root, path, env, now, fs = { existsSync, readFileSync }) {
  const key = env.APEX_SIGNOFF_KEY; if (!key) return 'no sign-off key on this machine';
  const f = signoffFile(root, path); if (!fs.existsSync(f)) return 'no sign-off for this path';
  let s; try { s = JSON.parse(String(fs.readFileSync(f))); } catch { return 'the sign-off file cannot be read'; }
  if (!s || s.path !== path || typeof s.sig !== 'string' || typeof s.reason !== 'string' || typeof s.expires !== 'string' || typeof s.baseHash !== 'string') return 'the sign-off is for another path or is incomplete';
  const want = Buffer.from(signoffSig(key, s), 'hex'), got = Buffer.from(s.sig, 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'the sign-off signature does not match';
  const exp = Date.parse(s.expires); if (!Number.isFinite(exp) || exp <= now) return 'the sign-off has expired';
  if (exp - now > SIGNOFF_HOURS * 3600e3) return `the sign-off runs longer than ${SIGNOFF_HOURS} hours`;
  if (s.baseHash !== baseHashOf(root, path, fs)) return 'the file has changed since the sign-off was made';
  return null;
}

/** A path as the repo sees it, or null when it is outside the repo. */
export function repoPath(root, cwd, p) {
  if (typeof p !== 'string' || !p) return null;
  const rel = relative(resolve(root), isAbsolute(p) ? resolve(p) : resolve(cwd || root, p)).split('\\').join('/');
  return rel.startsWith('..') || isAbsolute(rel) ? null : rel;
}

const WRITE_VERBS = /(^|[\s(])(sed\s+(-[a-zA-Z]*i|--in-place)|perl\s+-[a-zA-Z]*i|tee\b|mv\b|cp\b|rm\b|rmdir\b|truncate\b|dd\b|install\b|ln\b|chmod\b|touch\b|patch\b|git\s+(checkout|restore|apply|rm|mv|stash\s+(pop|apply))\b)/;
const words = seg => seg.split(/[\s()<>"'`=]+/).filter(Boolean);
/** Best effort: the red paths and environment files a shell command looks like it writes. In a part of the command that uses
 *  a writing verb, every path counts. Anywhere else only the target of a redirect counts, so reading a red file is not a write. */
export function shellHits(cmd, root, cwd, rx) {
  const hits = new Set(), consider = w => { const p = repoPath(root, cwd, w.replace(/^["'`]+|["'`,:]+$/g, '')); if (p && (rx.some(r => r.test(p)) || rx.some(r => r.test(`${p}/x`)) || ENV_FILE.test(p))) hits.add(p); };
  for (const seg of cmd.split(/&&|\|\||[;|&\n]/)) {
    for (const m of seg.matchAll(/>{1,2}\s*([^\s;&|<>]+)/g)) consider(m[1]);
    if (WRITE_VERBS.test(seg)) words(seg).forEach(consider);
  }
  return [...hits];
}
const WRITES = cmd => WRITE_VERBS.test(cmd) || />{1,2}/.test(cmd);
// A live flag given a value where the shell would act on it: at the start of a command, after export/env, or sent to a file or a secret store.
const LIVE_SET = /(^|&&|\|\||[;|&\n(])\s*((export|declare|env|set|setx)\s+)?(\w+=\S*\s+)*(APEX_ALLOW_LIVE|[A-Z][A-Z0-9_]*_LIVE)=/;

const deny = why => ({ allow: false, why }), ALLOW = { allow: true };
/**
 * The decision. `ctx`: root, env, now, globs (red-path globs), fs ({ existsSync, readFileSync }), branchFiles() (files this
 * branch changes against main) and currentBranch(), for the merge rules. Everything is passed in so the tests can drive it from a table.
 */
export function decide(input, ctx) {
  const tool = input?.tool_name, ti = input?.tool_input;
  if (typeof tool !== 'string' || !ti || typeof ti !== 'object') return deny('the hook input could not be read, so the call was refused');
  const { root, env, now } = ctx, fs = ctx.fs ?? { existsSync, readFileSync }, rx = ctx.globs.map(toRegex), cwd = input.cwd || root;

  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit' || tool === 'MultiEdit') {
    const p = repoPath(root, cwd, ti.file_path ?? ti.notebook_path); if (p === null) return ALLOW;               // outside this repo: not ours to guard
    const text = [ti.content, ti.new_string, ti.new_source, ...(Array.isArray(ti.edits) ? ti.edits.map(e => e?.new_string) : [])].filter(x => typeof x === 'string').join('\n');
    if (KEY_SHAPES.some(r => r.test(text))) return deny('This writes something that looks like a key or token into a file. Keys never go in the repo; they live in the environment of the machine that needs them.');
    if (LIVE_ASSIGN.test(text) && (ENV_FILE.test(p) || /\.(ya?ml|json|toml|sh|env)$/.test(p))) return deny('This sets a live-trading flag. Going live is Jeremy\'s switch, with his own keys. No agent sets it.');
    for (const n of NEVER) if (n.re.test(p)) return deny(`${p}: ${n.why}. No sign-off covers it.`);
    if (ENV_FILE.test(p) && !p.endsWith('.env.example')) return deny(`${p} is an environment file. Agents do not edit it; list the variable in .env.example and tell Jeremy.`);
    if (!rx.some(r => r.test(p))) return ALLOW;
    const bad = signoffProblem(root, p, env, now, fs);
    return bad ? deny(`${p}: ${HOW} (${bad}.)`) : ALLOW;
  }

  if (tool === 'Bash') {
    const cmd = typeof ti.command === 'string' ? ti.command : null; if (cmd === null) return deny('the hook input could not be read, so the call was refused');
    if (KEY_SHAPES.some(r => r.test(cmd)) && WRITES(cmd)) return deny('This command writes something that looks like a key or token. Keys never go in the repo.');
    if (LIVE_SET.test(cmd) || (LIVE_ASSIGN.test(cmd) && (/>{1,2}|\btee\b/.test(cmd) || /\b(gh\s+(secret|variable)|vercel\s+env)\b/.test(cmd)))) return deny('This sets a live-trading flag. Going live is Jeremy\'s switch, with his own keys. No agent sets it.');
    if (/\bgit\s+push\b/.test(cmd) && /(\s|:)(main|master)(\s|$)/.test(cmd)) return deny('Agents do not push to main. Push your branch and open a pull request.');
    if (/\bgit\s+push\b[^;&|]*\s(-f|--force)(\s|$)/.test(cmd) && !/--force-with-lease/.test(cmd)) return deny('A plain force push can destroy history. Use --force-with-lease on your own branch, never on main.');
    if (/(^|[\s;&|])rm\b[^;&|]*db\/migrations/.test(cmd) || /\bgit\s+rm\b[^;&|]*db\/migrations/.test(cmd)) return deny('Migrations are never deleted. Add a new migration that undoes the old one.');
    if (/\bgit\s+merge\b/.test(cmd) && !/--abort/.test(cmd) && /^(main|master)$/.test(ctx.currentBranch?.() ?? '')) return deny('Agents do not merge into main. Open a pull request.');
    if (/\bgh\s+pr\s+merge\b/.test(cmd)) { const red = (ctx.branchFiles?.() ?? []).filter(f => rx.some(r => r.test(f))); if (red.length) return deny(`This branch changes red paths (${red.slice(0, 5).join(', ')}${red.length > 5 ? ', ...' : ''}). An agent never merges those. Jeremy reviews and merges.`); }
    const hits = shellHits(cmd, root, cwd, rx);
    for (const p of hits) { for (const n of NEVER) if (n.re.test(p)) return deny(`${p}: ${n.why}. No sign-off covers it.`); }
    const blocked = hits.filter(p => (ENV_FILE.test(p) && !p.endsWith('.env.example')) || signoffProblem(root, p, env, now, fs) !== null);
    if (blocked.length) return deny(`${blocked.slice(0, 5).join(', ')}: ${ENV_FILE.test(blocked[0]) && !blocked[0].endsWith('.env.example') ? 'an environment file. Agents do not edit it.' : HOW}`);
    return ALLOW;
  }
  return ALLOW;
}

/** The hook's reply in Claude Code's PreToolUse format. Nothing is printed for an allowed call. */
export const reply = d => (d.allow ? '' : JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: d.why } }));

const git = (root, args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
export function run(stdin, env = { APEX_SIGNOFF_KEY: process.env.APEX_SIGNOFF_KEY }, root = ROOT, now = Date.now()) {
  let input = null; try { input = JSON.parse(stdin); } catch { /* denied below */ }
  let globs; try { globs = readGlobs(root); } catch { return reply(deny('the red-path list (.github/red-paths.txt) cannot be read, so the call was refused')); }
  return reply(decide(input, { root, env, now, globs, branchFiles: () => git(root, ['diff', '--name-only', 'origin/main...HEAD']).split('\n').filter(Boolean), currentBranch: () => git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let buf = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => { buf += c; }); process.stdin.on('end', () => { const out = run(buf); if (out) process.stdout.write(out + '\n'); process.exit(0); });
}
