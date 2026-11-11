// The runbooks, as Setup lists them. The pages themselves live in the repository under docs/runbooks, where their commands
// are rehearsed by a test (apps/cli/test/runbooks.test.ts). web/test/runbooks.test.ts holds this list to that folder.
export const RUNBOOK_DIR = 'docs/runbooks';
export const RUNBOOKS: { file: string; title: string; when: string }[] = [
  { file: 'halt-and-resume.md', title: 'Halt and resume', when: 'You want everything to stop, or want to start again after a halt' },
  { file: 'data-outage.md', title: 'Data outage', when: 'A dataset is blocked or stale' },
  { file: 'run-failed.md', title: 'The run failed', when: 'The nightly run failed or did not happen' },
  { file: 'ledger-verify-failed.md', title: 'The ledger does not verify', when: 'The ledger check reports a broken chain or a saved head that does not match' },
  { file: 'validator-disagrees.md', title: 'The validator disagrees', when: 'The independent re-run does not reproduce a result' },
  { file: 'drift-pause.md', title: 'A slot was paused for drift', when: 'A slot was paused by the drift alarm' },
  { file: 'restore.md', title: 'Restore the ledger', when: 'The ledger was lost or damaged and has to come back from a copy' },
  { file: 'rotate-keys.md', title: 'Rotate keys', when: 'A key or password may have leaked, or it is time to change them' },
  { file: 'going-live.md', title: 'Going live', when: 'Before any real money. Most of it cannot be done yet' },
  { file: 'incident-template.md', title: 'Incident note', when: 'After any of the above: the note to write' },
];
