#!/usr/bin/env node
// Three lines at the start of a session (docs/design/10 s3.4). It installs nothing and makes no network call.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const REMINDER = [
  'Apex is paper first. Going live is Jeremy\'s switch, with his own keys. No agent has a tool that can trade or move money.',
  'Red paths (.github/red-paths.txt) need Jeremy\'s review. Propose the change in a pull request; never merge it yourself.',
  'Start with AGENTS.md, then docs/design/00-README.md. Read a folder\'s README "Invariants" before changing it.',
].join('\n');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
if (existsSync(join(root, '.github/red-paths.txt')) && existsSync(join(root, 'AGENTS.md'))) process.stdout.write(REMINDER + '\n');
