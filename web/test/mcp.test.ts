// /api/mcp end to end: the official MCP client over Streamable HTTP into the real route, with a real API key and a file
// ledger. A tool call is an API call: the key's scopes, the halt and the limits apply to it unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { READ_SCOPES } from '@apex/sdk';

const root = join(import.meta.dirname, '../..'), dir = mkdtempSync(join(tmpdir(), 'apex-mcp-http-')), file = join(dir, 'ledger.jsonl'), URL_ = 'https://apex.test/api/mcp';
copyFileSync(join(root, 'apps/cli/fixtures/ledger.jsonl'), file);
process.env.APEX_LEDGER_FILE = file; process.env.APEX_ROOT = root; process.env.APEX_API_KEYS_PEPPER = 'p'.repeat(24);
for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'APEX_ADMIN_PASSWORD']) delete process.env[k];
const route = () => import('../app/api/mcp/route'), keys = () => import('../lib/api/keys');      // loaded after the environment above is set
const entries = () => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const textOf = (r: any): string => r.content.map((c: any) => c.text).join('\n');
async function connect(key: string) { const { POST, GET, DELETE } = await route(), seen: string[] = [];
  const f = (async (url: string | URL, init: RequestInit = {}) => { const m = init.method ?? 'GET'; seen.push(m); return (m === 'POST' ? POST : m === 'GET' ? GET : DELETE)(new Request(url, init)); }) as typeof fetch;
  const client = new Client({ name: 'apex-http-test', version: '1' }); await client.connect(new StreamableHTTPClientTransport(new URL(URL_), { fetch: f, requestInit: { headers: { authorization: `Bearer ${key}` } } })); return { client, seen }; }
const rpc = (body: unknown, headers: Record<string, string> = {}) => new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } };

test('mcp over http: no key and a wrong key get nothing, not even the list of tools', async () => {
  const { POST, GET, DELETE } = await route();
  for (const h of [{}, { authorization: 'Bearer apx_nope_' + 'n'.repeat(24) }, { authorization: 'Basic abc' }] as Record<string, string>[]) for (const body of [INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'apex_halt', arguments: { reason: 'no key' } } }]) {
    const r = await POST(rpc(body, h)); assert.equal(r.status, 401); assert.equal(r.headers.get('www-authenticate'), 'Bearer'); const j = await r.json(); assert.ok(j.error && !j.result); }
  assert.equal((await GET()).status, 405); assert.equal((await DELETE()).status, 405);
  assert.equal(entries().length, 22, 'nothing was written');
});

test('mcp over http: a read key reads through the same checks as the API, and cannot halt or queue', async () => {
  const { createKey } = await keys(), made = await createKey('mcp read', [...READ_SCOPES]); assert.ok(made.ok);
  const { client, seen } = await connect(made.key); assert.equal((await client.listTools()).tools.length, 13); assert.equal(client.getServerVersion()?.name, 'apex');
  const s: any = await client.callTool({ name: 'apex_status', arguments: {} }); assert.ok(!s.isError, textOf(s)); assert.deepEqual([s.structuredContent.status.mode, s.structuredContent.status.trials, s.structuredContent.status.ledger], ['paper', 3, 'file']);
  const p: any = await client.callTool({ name: 'apex_pair', arguments: { strategy: 'demo_beta', dataset: 'csv:SPY:1h:split' } }); assert.equal(p.structuredContent.pair.status, 'watch'); assert.match(textOf(p), /<apex-data>\ndemo_beta on SPY 1h/);
  const v: any = await client.callTool({ name: 'apex_ledger', arguments: { view: 'verify' } }); assert.deepEqual([v.structuredContent.verify.ok, v.structuredContent.verify.checked], [true, 22]);
  assert.match(((await client.readResource({ uri: 'apex://glossary' })).contents[0] as { text: string }).text, /Apex words/); assert.deepEqual((await client.listResources()).resources.map(r => r.uri), ['apex://report/latest', 'apex://glossary']);
  for (const [name, args, scope] of [['apex_halt', { reason: 'a read key tries to halt' }, 'halt'], ['queue_claim_check', { text: 'Buy when the close is above the 55 day high. Sell when it closes below the 20 day low.' }, 'queue:claims'], ['apex_claim_check_result', {}, 'queue:claims']] as [string, Record<string, unknown>, string][]) {
    const r: any = await client.callTool({ name, arguments: args }); assert.equal(r.isError, true, name); assert.match(textOf(r), new RegExp(`Apex said no \\(forbidden_scope\\): .*${scope}`), name); }
  assert.equal(entries().length, 22, 'a read key wrote nothing'); assert.ok(seen.includes('POST')); await client.close();
  const out = JSON.stringify([s, p, v]); assert.ok(!out.includes(made.key), 'the key is in no answer');
});

test('mcp over http: a key with the halt scope pulls the cord once, and a halted Apex refuses a claim check', async () => {
  const { createKey, revokeKey } = await keys(), made = await createKey('mcp ops', ['read:status', 'halt', 'queue:claims']); assert.ok(made.ok);
  const { client } = await connect(made.key);
  const h: any = await client.callTool({ name: 'apex_halt', arguments: { reason: 'mcp http test' } }); assert.ok(!h.isError, textOf(h)); assert.deepEqual(h.structuredContent.halt, { halted: true, already: false, ledger: 'recorded' });
  const last = entries().pop(); assert.deepEqual([entries().length, last.kind, last.payload.level, last.payload.reason], [23, 'halt', 'andon', 'mcp http test']); assert.match(String(last.payload.by), /^api:/, 'the entry names the key that pulled it, not the key itself');
  const again: any = await client.callTool({ name: 'apex_halt', arguments: { reason: 'mcp http test, again' } }); assert.equal(again.structuredContent.halt.ledger, 'already'); assert.equal(entries().length, 23, 'a second pull is not a second entry');
  const s: any = await client.callTool({ name: 'apex_status', arguments: {} }); assert.equal(s.structuredContent.status.halted, true); assert.match(textOf(s), /HALTED: andon/);
  const c: any = await client.callTool({ name: 'queue_claim_check', arguments: { text: 'Buy when the close is above the 55 day high. Sell when it closes below the 20 day low. Risk one percent of the account.' } }); assert.equal(c.isError, true); assert.match(textOf(c), /Apex said no \(halted\)/);
  assert.equal(entries().length, 23);
  // A revoked key stops working at once, mid-session.
  assert.equal(await revokeKey(made.info.id), true); await assert.rejects(client.callTool({ name: 'apex_status', arguments: {} }));
});
