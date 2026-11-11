#!/usr/bin/env node
// Launcher for the guard hook. The rules live in the repo they guard (tools/guard_hook.mjs), so they are reviewed with it and
// are themselves a red path. In a project that is not Apex this does nothing. In Apex, if the rules cannot be loaded, the
// call is refused: a guard that fails open is not a guard.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let buf = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => { buf += c; });
process.stdin.on('end', async () => {
  let cwd = process.cwd(); try { cwd = JSON.parse(buf).cwd || cwd; } catch { /* the rules refuse an unreadable input */ }
  const root = process.env.CLAUDE_PROJECT_DIR || cwd, rules = join(root, 'tools/guard_hook.mjs');
  if (!existsSync(rules) || !existsSync(join(root, '.github/red-paths.txt'))) process.exit(0);
  let out;
  // The rules get the one variable they need, not the whole environment.
  try { out = (await import(pathToFileURL(rules).href)).run(buf, { APEX_SIGNOFF_KEY: process.env.APEX_SIGNOFF_KEY }, root); }
  catch (e) { out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `The Apex guard hook could not load its rules (${String(e?.message ?? e).slice(0, 120)}), so the call was refused.` } }); }
  if (out) process.stdout.write(out + '\n');
  process.exit(0);
});
