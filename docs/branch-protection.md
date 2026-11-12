# Branch protection: two minutes, once

Only the repo owner can do this. Until it is done, the red-path rule is a check that reports, not a lock.

GitHub, `apex-trading-os`, Settings, Branches, add a rule for `main`:

1. Require a pull request before merging.
2. Require status checks to pass: `types, unit, parity, fingerprints, golden, db`, `python`, `invariants` and `check` (protected-paths).
3. Block force pushes.
4. Leave "Do not allow bypassing the above settings" **off**. You are the only admin, and you need the bypass for red-path pull requests (next section).

## How a red-path pull request gets merged

Agents open pull requests under your GitHub account. GitHub does not let an author approve their own pull request, so no approving review is possible on those. This is what happens instead:

- The `protected-paths` check lists the red-path files and stays red. That is on purpose.
- Because it is a required check, the normal merge button is blocked for everyone.
- You read the red-path changes. If you agree, tick "Merge without waiting for requirements to be met" and merge. Only an admin sees that box.
- An agent never merges a red-path pull request, and never uses the bypass.

This is weaker than a second reviewer, because an agent acting with your account could in principle call the merge API. The agents' own rules forbid it, and the merge shows in the pull request history under your name with the time. If you want a hard lock, create a second GitHub account for agents (a machine user), have agents open pull requests from it, and turn on "Require review from Code Owners". Then the check goes green only on your approval of the exact commit, and `.github/CODEOWNERS` is enforced by GitHub itself.

Also, Settings, Actions, General: set workflow permissions to read by default. The nightly workflow asks for write on contents itself, to save state to the `apex-state` branch.

## Secrets for the nightly paper run

Settings, Secrets and variables, Actions. None can trade. `MASSIVE_API_KEY` is required; the others are optional.

| Secret | What it does | Without it |
|---|---|---|
| `MASSIVE_API_KEY` | Fresh bars each night. Required | No new bars arrive, so no paper slot gets a new bar and the forward clock never moves. The nightly workflow ends red at its last step every night until it is set |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Short report each night | The report is saved on the `apex-state` branch and in the run summary |
| `DATABASE_URL` | Postgres ledger | The file ledger on the `apex-state` branch is used |

Never add a broker key, `APEX_ALLOW_LIVE`, `ALPACA_LIVE` or `APEX_SIGNOFF_KEY` to GitHub or Vercel.
