// `apex mcp`: the MCP server over stdio, for Claude Code and Claude Desktop (docs/design/10 s1). It serves packages/mcp over
// the same Source the other commands read from. Standard output belongs to the protocol here, so this file prints nothing
// there; its one note goes to standard error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '@apex/mcp';
import type { Ctx } from './runtime';
import type { Source } from './source';

/** The two documents the stdio server can hand out because it runs inside the repo. */
export const repoDocs = (root: string) => { const file = (p: string) => () => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);
  return { 'apex://playbook': { name: 'Trading playbook', about: 'The rules distilled from the archive, each with its source and whether it has been tested.', read: file('docs/trading-playbook.md') },
    'apex://design/README': { name: 'Design overview', about: 'How Apex is put together and where each part is specified.', read: file('docs/design/00-README.md') } }; };

export async function serveStdio(s: Source, ctx: Ctx): Promise<number> {
  const server = buildServer(s, { docs: repoDocs(ctx.root) }), transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`apex mcp: serving over stdio (${s.mode}: ${s.where}). It reads, can start a claim check and can pull the halt. Nothing else.\n`);
  return new Promise<number>(done => { transport.onclose = () => done(0); process.stdin.on('end', () => done(0)); process.stdin.on('close', () => done(0)); });
}
