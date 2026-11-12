#!/usr/bin/env node
// Starts the Apex MCP server (`apex mcp`) over stdio from the repo this plugin sits in. It reads the local ledger. It can
// read, record a halt and nothing else. It makes no network call and installs nothing.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = join(root, 'node_modules/tsx/dist/cli.mjs'), bin = join(root, 'apps/cli/src/mcp-bin.ts');
if (!existsSync(tsx) || !existsSync(bin)) { process.stderr.write('apex mcp: run `npm install` in the Apex repo first.\n'); process.exit(1); }
const child = spawn(process.execPath, [tsx, bin, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', e => { process.stderr.write(`apex mcp: ${e.message}\n`); process.exit(1); });
