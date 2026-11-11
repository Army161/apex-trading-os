# Branch protection: two minutes, once

Only the repo owner can do this. Until it is done, the red-path rule is a check that reports, not a lock.

GitHub, `apex-trading-os`, Settings, Branches, Add branch ruleset (or classic rule) for `main`:

1. Require a pull request before merging.
2. Require review from Code Owners. `.github/CODEOWNERS` lists the red paths.
3. Dismiss stale approvals when new commits are pushed.
4. Require status checks to pass: `types, unit, parity, fingerprints, golden, db`, `python`, `invariants`, `check` (protected-paths).
5. Do not allow bypassing the above, and block force pushes.

Also, Settings, Actions, General: set workflow permissions to read by default. The nightly workflow asks for write on contents itself, to save state to the `apex-state` branch.

## Secrets for the nightly paper run

Settings, Secrets and variables, Actions. All optional. None can trade.

| Secret | What it does | Without it |
|---|---|---|
| `MASSIVE_API_KEY` | Fresh bars each night | The committed files are used, they go stale, and stale data cannot open paper orders |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Short report each night | The report is saved on the `apex-state` branch and in the run summary |
| `DATABASE_URL` | Postgres ledger | The file ledger on the `apex-state` branch is used |

Never add a broker key, `APEX_ALLOW_LIVE`, `ALPACA_LIVE` or `APEX_SIGNOFF_KEY` to GitHub or Vercel.
