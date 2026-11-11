#!/usr/bin/env node
// Protected-paths check (docs/design/02 s9, P0.3). Plain rules, no model.
//   node tools/protected_paths.mjs --self-check          red-paths.txt and CODEOWNERS list the same paths
//   node tools/protected_paths.mjs --files a b c         which of these files are red (prints them, exit 0)
//   node tools/protected_paths.mjs --pr                  in CI: fail when the pull request touches a red path and the code
//                                                        owner has not approved the current head commit
// This check reports. The lock itself is branch protection with "Require review from Code Owners", which only Jeremy can set.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = t => t.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
export const toRegex = glob => new RegExp('^' + glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');
export const redOf = (files, globs) => { const rx = globs.map(toRegex); return files.filter(f => rx.some(r => r.test(f))); };
export const readGlobs = (root = ROOT) => lines(readFileSync(join(root, '.github/red-paths.txt'), 'utf8'));
export function ownersOf(root = ROOT) { const p = join(root, '.github/CODEOWNERS'); return existsSync(p) ? [...new Set(lines(readFileSync(p, 'utf8')).flatMap(l => l.split(/\s+/).slice(1)).map(o => o.replace(/^@/, '').toLowerCase()))] : []; }
/** CODEOWNERS writes a directory as /dir/ and red-paths writes it as dir/**. Compare them in one form. */
export function selfCheck(root = ROOT) {
  const norm = s => s.replace(/^\//, '').replace(/\/\*\*$/, '/'), red = new Set(readGlobs(root).map(norm)), own = new Set(lines(readFileSync(join(root, '.github/CODEOWNERS'), 'utf8')).map(l => norm(l.split(/\s+/)[0])));
  return [...[...red].filter(x => !own.has(x)).map(x => `${x}: in red-paths.txt, missing from CODEOWNERS`), ...[...own].filter(x => !red.has(x)).map(x => `${x}: in CODEOWNERS, missing from red-paths.txt`)];
}
/** The latest review of each person; approved means an owner's latest review is APPROVED on the head commit. */
export function approvedBy(reviews, owners, headSha) {
  const latest = new Map(); for (const r of reviews) if (r.state !== 'COMMENTED') latest.set(String(r.user?.login ?? '').toLowerCase(), r);
  return owners.filter(o => { const r = latest.get(o); return r && r.state === 'APPROVED' && r.commit_id === headSha; });
}

function main(argv) {
  if (argv[0] === '--self-check') { const bad = selfCheck(); for (const b of bad) console.log(b); console.log(bad.length ? 'CODEOWNERS and red-paths.txt disagree.' : 'CODEOWNERS and red-paths.txt agree.'); return bad.length ? 1 : 0; }
  if (argv[0] === '--files') { for (const f of redOf(argv.slice(1), readGlobs())) console.log(f); return 0; }
  if (argv[0] === '--pr') {
    const { BASE_SHA, HEAD_SHA, PR_NUMBER, GITHUB_REPOSITORY, RULES_ROOT } = process.env;
    if (!BASE_SHA || !HEAD_SHA || !PR_NUMBER || !GITHUB_REPOSITORY) { console.log('BASE_SHA, HEAD_SHA, PR_NUMBER and GITHUB_REPOSITORY are required.'); return 2; }
    const changed = execFileSync('git', ['diff', '--name-only', `${BASE_SHA}...${HEAD_SHA}`], { cwd: ROOT }).toString().split('\n').filter(Boolean);
    // The rules come from the base branch when it has them, joined with the pull request's own, so a pull request cannot
    // take a path off the list for itself.
    const rulesRoot = RULES_ROOT && existsSync(join(RULES_ROOT, '.github/red-paths.txt')) ? RULES_ROOT : ROOT;
    const globs = [...new Set([...readGlobs(rulesRoot), ...readGlobs(ROOT)])], owners = [...new Set([...ownersOf(rulesRoot)])].length ? ownersOf(rulesRoot) : ownersOf(ROOT), red = redOf(changed, globs);
    if (!red.length) { console.log(`No red path touched (${changed.length} files changed).`); return 0; }
    console.log(`This pull request touches ${red.length} red-path files:`); for (const f of red.slice(0, 60)) console.log(`  ${f}`); if (red.length > 60) console.log(`  and ${red.length - 60} more`);
    const reviews = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/reviews`], { cwd: ROOT }).toString()).flat();
    const ok = approvedBy(reviews, owners, HEAD_SHA);
    if (ok.length) { console.log(`Approved on this commit by ${ok.join(', ')}.`); return 0; }
    console.log(`Waiting for an approving review of commit ${HEAD_SHA.slice(0, 12)} from: ${owners.join(', ') || 'a code owner (none listed)'}. Red paths never merge without it.`); return 1;
  }
  console.log('usage: protected_paths.mjs --self-check | --files <paths> | --pr'); return 2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
