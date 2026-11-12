#!/usr/bin/env -S npx tsx
// apex-mcp: the same as `apex mcp`. A name of its own so an MCP client can start it with one word.
import { resolve } from 'node:path';
import { main } from './main';
import { makeCtx } from './runtime';
main(['mcp', ...process.argv.slice(2)], makeCtx(resolve(process.env.APEX_ROOT || process.cwd())), s => process.stderr.write(`${s}\n`)).then(c => process.exit(c), e => { process.stderr.write(`apex-mcp: ${(e as Error).message}\n`); process.exit(1); });
