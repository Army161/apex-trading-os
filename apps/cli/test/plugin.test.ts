// The plugin's skills, commands and agents are instructions only. This lint keeps them honest: the right front matter, the
// fixed sections, a "never" list, and no tool or command named that does not exist (docs/design/10 s2.1, s5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOLS } from '@apex/mcp';
import { COMMANDS } from '../src/main';

const ROOT = resolve(__dirname, '../../..'), P = join(ROOT, 'plugin');
const SKILLS = ['apex-archive', 'apex-claim-check', 'apex-validate', 'apex-daily-review', 'apex-risk-check', 'apex-data-health', 'apex-ledger'];
const toolNames = new Set(TOOLS.map(t => t.name));
function front(file: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(readFileSync(file, 'utf8')); assert.ok(m, `${file}: no front matter`);
  return { meta: Object.fromEntries(m![1].split('\n').map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })), body: m![2] };
}
/** Every tool and every `apex` command a text names must exist. */
function namesExist(file: string, body: string): void {
  for (const m of body.matchAll(/`((?:apex|queue)_[a-z_]+)`/g)) assert.ok(toolNames.has(m[1]), `${file}: names a tool that does not exist: ${m[1]}`);
  for (const m of body.matchAll(/npm run apex -- ([a-z]+)/g)) assert.ok(m[1] in COMMANDS || m[1] === 'help', `${file}: names a command that does not exist: apex ${m[1]}`);
  for (const m of body.matchAll(/`(apex-[a-z-]+)` skill/g)) assert.ok(SKILLS.includes(m[1]), `${file}: names a skill that does not exist: ${m[1]}`);
}

test('skills: the seven in the design, each with front matter, the fixed sections and a never list', () => {
  assert.deepEqual(readdirSync(join(P, 'skills')).sort(), [...SKILLS].sort());
  for (const s of SKILLS) {
    const file = join(P, 'skills', s, 'SKILL.md'), { meta, body } = front(file);
    assert.equal(meta.name, s); assert.match(meta.description, /^Use when /, `${s}: the description starts with when to use it`); assert.ok(meta.description.length <= 400);
    const heads = [...body.matchAll(/^## (.+)$/gm)].map(m => m[1]);
    assert.deepEqual(heads, ['What it is for', 'Steps', 'Wording', 'If a call fails', 'Never'], `${s}: sections`);
    const never = body.slice(body.indexOf('## Never')), bullets = never.split('\n').filter(l => l.startsWith('- Never '));
    assert.ok(bullets.length >= 5, `${s}: the never list`);
    for (const must of [/approve/, /limit/, /without its n and its tag/, /untested rule a signal/]) assert.ok(bullets.some(b => must.test(b)), `${s}: the never list must cover ${must}`);
    assert.ok([...body.matchAll(/`((?:apex|queue)_[a-z_]+)`/g)].length > 0, `${s}: names no tool`);
    namesExist(file, body);
    // Instructions only: a skill holds no result of its own.
    assert.doesNotMatch(body, /Sharpe -?\d|\d%/, `${s}: a skill carries no figures`);
    assert.doesNotMatch(body.replace(/Never use the words scam, fake or proven\.|never call a result proven/g, ''), /\b(scam|fake|proven)\b/i, `${s}: wording`);
  }
});

test('skills, commands and agents: nothing tells an agent to approve, resume, trade or go live', () => {
  const files = [...SKILLS.map(s => join(P, 'skills', s, 'SKILL.md')), ...readdirSync(join(P, 'commands')).map(f => join(P, 'commands', f)), ...readdirSync(join(P, 'agents')).map(f => join(P, 'agents', f))];
  for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!/\b(approve|resume|place an order|go live|withdraw|open a lock|set a live flag)\b/i.test(line)) continue;
    assert.match(line, /\b(never|not|no |cannot|Jeremy|refused|alone)\b/i, `${f}: "${line.trim().slice(0, 120)}" must be a "does not" sentence`);
  }
});

test('commands and agents: front matter, and every tool, command and skill named exists', () => {
  assert.deepEqual(readdirSync(join(P, 'commands')).sort(), ['apex-check.md', 'apex-report.md', 'apex-status.md']);
  for (const f of readdirSync(join(P, 'commands'))) { const file = join(P, 'commands', f), { meta, body } = front(file); assert.ok(meta.description?.length > 10, f); namesExist(file, body); }
  assert.deepEqual(readdirSync(join(P, 'agents')).sort(), ['build-buddy.md', 'goldfish-reviewer.md', 'playbook-distiller.md']);
  for (const f of readdirSync(join(P, 'agents'))) { const file = join(P, 'agents', f), { meta, body } = front(file); assert.equal(meta.name, f.replace(/\.md$/, '')); assert.ok(meta.description?.length > 20, f); namesExist(file, body); }
  // The fresh-eyes reviewer only reads.
  assert.equal(front(join(P, 'agents/goldfish-reviewer.md')).meta.tools, 'Read, Grep, Glob');
});

test('the plugin starts the MCP server from the repo it sits in, and the marketplace entry points at it', async () => {
  const mcp = JSON.parse(readFileSync(join(P, '.mcp.json'), 'utf8')).mcpServers.apex;
  assert.equal(mcp.command, 'node'); assert.deepEqual(mcp.args, ['${CLAUDE_PLUGIN_ROOT}/mcp.mjs']); assert.equal(mcp.env, undefined, 'the plugin passes no key');
  assert.ok(existsSync(join(P, 'mcp.mjs')));
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(market.plugins.length, 1); assert.equal(market.plugins[0].name, 'apex'); assert.ok(existsSync(join(ROOT, market.plugins[0].source, '.claude-plugin/plugin.json')));
  const client = new Client({ name: 'plugin-test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(P, 'mcp.mjs'), '--fixtures'], stderr: 'ignore' }));
  try { const { tools } = await client.listTools(); assert.deepEqual(tools.map(t => t.name).sort(), [...toolNames].sort()); } finally { await client.close(); }
});
