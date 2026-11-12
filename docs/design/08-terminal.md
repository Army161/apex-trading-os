# 08. The `apex` terminal

A command-line tool and a full-screen terminal view. App: `apps/cli`. Binary name: `apex`. It uses the same packages as the web app, so a number in the terminal is the same number as on the dashboard.

## 1. Modes

| Mode | How | Reads and writes through |
|---|---|---|
| **Local** | Default inside a checkout with `DATABASE_URL` set | `packages/store` directly. This is what GitHub Actions uses for full runs |
| **Remote** | `--remote` or `APEX_API_URL` plus `APEX_API_KEY` | REST API v1 through `packages/sdk`. Read and queue only |
| **Offline** | `--fixtures` | Committed fixtures and the memory store. For tests and demos |

No command places an order. No command opens a live lock except `apex live sign`, which only works on a machine that holds `APEX_SIGNOFF_KEY` and asks for a typed confirmation at the keyboard (it refuses when stdin is not a terminal, so no agent or script can run it).

## 2. Conventions

- Human output by default: aligned tables, the status vocabulary from `07` section 3.4 as labels, colour only when stdout is a terminal and `NO_COLOR` is unset.
- `--json` on every command prints one JSON document with the same shape as the API response.
- Every table that shows performance has the columns `n`, `basis` and `net`, matching the `Metric` rule.
- Exit codes: `0` ok, `1` error, `2` usage, `3` halted or blocked (the command refused because the system is halted), `4` verification failed (`ledger verify`, `doctor`).
- The first line of every command that touches the paper book prints `PAPER` and the trial count.
- Secrets are read from env only. No flag accepts a key.

## 3. Commands

```
apex status                         One screen: mode, halts, last run, needs-you count, slots, book
apex run [--full | --budget N] [--dry-run]
                                    Run the pipeline. --dry-run computes and prints, writes nothing
apex board [--status S] [--market M] [--tf T] [--top N] [--sort checks|sharpe]
apex pair <strategy> <dataset>      One evaluation in detail: checks, why, validator runs, receipt
apex slots                          All slots with graduation clocks
apex slot <key> [--trades | --intents | --events | --drift]
apex book [--positions | --trades | --blocked]
apex risk                           Limits (value, ceiling, pending), halts, exposure
apex report [--date YYYY-MM-DD] [--send telegram]
apex queue [list | show <id> | add | approve <id> | drop <id>]
                                    approve works in local mode with an admin session token, or on the dashboard
apex claim <file | -> [--market M] [--tf T] [--wait]
                                    Queue a claim check from a file or stdin; --wait prints the verdict
apex data [health | pull [dataset] | sources | versions <dataset>]
apex ledger [tail [-n N] | show <seq> | verify [--from N] | head | replay --check]
apex strategies [list | show <id> | fingerprint]
apex costs                          Current cost model, measured against assumed
apex regime                         The context panel as a table
apex agents [list | activity | inbox]
apex halt "<reason>"                Pull the andon cord. Always allowed
apex live status [slot]             The four locks, read-only
apex live sign <slot>               Lock 4 signature. Only on Jeremy's machine, interactive only
apex signoff <path> --reason "..."  Sign a guard-hook sign-off for a red path. Interactive only
apex doctor                         Checks config, database, storage, ledger chain, cron health, fingerprints
apex tui                            Full-screen view (section 5)
apex completion <shell>
```

There is no `apex resume`. Resuming is done on the dashboard.

## 4. Example output

These show layout. Run times, receipt numbers, hashes and the check 7 result are illustrative.

```
$ apex status
PAPER · 266 tries counted · data ok · no halts
Last run   full 00:30 UTC ok (266 pairs, 0 errors)      Next tick 14:30 UTC
Needs you  2   (apex queue list, apex agents inbox)

SLOTS
key                        status     fwd mo  fwd trades  fwd net   deflated(M)  clock
dave_prev_range|SPY:1h     checking   -       -           -         -            waits for validator

BOOK (book · net · n=0)
equity $10,000.00   day 0.0% / -2%   week 0.0% / -5%   drawdown 0.0% / -15%   open 0 / 5
```

```
$ apex ledger verify
chain   ok   1 .. 1932
anchors ok   12 heads checked against ledger/heads/
head    1932 9f3c…a1e7   last anchor 2026-11-22 (commit 4c1d2aa)
```

```
$ apex pair turtle_55_20 massive:SPY:1h:split
turtle_55_20 on SPY 1h · no edge · in-sample · net · n=74
 1 enough trades            pass  74 of 50
 2 monkey test              fail  beat 32.0%, needs 95%
 3 locked test window       fail
 4 one bar late             fail
 5 double costs             fail
 6 costs under half moves   fail
 7 beats hold on risk       fail
receipt #418  input 51ab…90fe  result 7c02…11d3
```

## 5. The terminal view (`apex tui`)

A keyboard-driven full-screen view built with Ink. It reads through the same query functions and refreshes every 30 seconds (press `r` to refresh now). It is read-only except for Halt.

```
┌ APEX ─ PAPER ─ 266 tries ─ data ok ───────────────────────────────── 14:02 UTC ─ next tick 14:30 ┐
│ [1] Today  [2] Board  [3] Slots  [4] Book  [5] Risk  [6] Queue  [7] Data  [8] Ledger  [9] Agents  │
├───────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ NEEDS YOU (2)                                 │ BOOK  $10,000.00   n=0                           │
│ > candidate waits for validator               │ day  0.0% ░░░░░░░░ -2%                           │
│   9 tests queued from the plan                │ week 0.0% ░░░░░░░░ -5%                           │
│                                               │ dd   0.0% ░░░░░░░░ -15%                          │
├───────────────────────────────────────────────┴──────────────────────────────────────────────────┤
│ BOARD  status ▾  checks ▾                                                                         │
│ dave_prev_range   SPY 1h   checking    6/6   n=51   +9.1%   dd -8.3%                              │
│ dave_prev_range   SPY 4h   needs data  5/6   n=25  +11.9%   dd -3.7%                              │
│ turtle_55_20      SPY 1h   no edge     1/6   n=74   -2.2%   dd -9.4%                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ↑↓ move  ⏎ open  / filter  r refresh  H halt  ? help  q quit                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Keys: digits switch panes; arrows and `j`/`k` move; Enter opens detail in a right-hand pane; `/` filters; `H` opens the halt prompt (type a reason, confirm); `?` help; `q` quit. On a narrow terminal (under 100 columns) panes stack. Colour is never the only signal: statuses are words.

## 6. Packaging

- `apps/cli` is a workspace package with a `bin` entry. Inside the repo: `npx apex ...`. On Jeremy's machine: `npm link` from the checkout, or `npm i -g` from a packed tarball built by CI. It is not published to a public registry while the repo is private.
- Node 22 or later. No native dependencies.
- Shell completion for bash, zsh and fish.

## 7. Tests

- Snapshot tests of every command's human output and JSON output against fixtures.
- `apex run --dry-run` writes nothing (the store is wrapped in a write-forbidding proxy).
- `apex live sign` and `apex signoff` refuse without a terminal on stdin and without the key.
- The command registry is part of the route and tool inventory test in `02` section 8.
- `apex ledger verify` returns exit code 4 on a tampered fixture.
