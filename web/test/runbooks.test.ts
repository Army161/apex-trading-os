// Setup lists the runbooks (build plan P4.14). The list is held to the folder: every page is listed once, under its own title.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RUNBOOKS, RUNBOOK_DIR } from '../lib/runbooks';

const root = resolve(__dirname, '../..'), dir = join(root, RUNBOOK_DIR);
test('runbooks: Setup lists every page in docs/runbooks, by the title the page has, in the order of the index', () => {
  assert.deepEqual(RUNBOOKS.map(r => r.file).sort(), readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').sort());
  for (const r of RUNBOOKS) assert.equal(readFileSync(join(dir, r.file), 'utf8').split('\n')[0], `# ${r.title}`, r.file);
  assert.deepEqual([...readFileSync(join(dir, 'README.md'), 'utf8').matchAll(/\]\(([a-z-]+\.md)\)/g)].map(m => m[1]), RUNBOOKS.map(r => r.file));
  const setup = readFileSync(join(root, 'web/components/screens.tsx'), 'utf8'); assert.match(setup, /id="runbooks"/); assert.match(setup, /RUNBOOKS\.map/);
});
