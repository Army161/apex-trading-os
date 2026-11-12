# 07. UI and UX: dashboard, installable app, Telegram

The visual mockups for the main screens are on the design canvas "Apex dashboard design" (https://claude.ai/artifact/UDxXdWCkin1TFrvj3ZaYHC). This file is the specification the canvas illustrates. Where they differ, this file wins.

## 1. Design principles

1. **Evidence before profit.** The hero of every screen is how much evidence exists, not how much money was made. A P&L figure never appears alone.
2. **Every number carries its context.** Sample size, net of costs, in-sample or forward, and how many tries it took. If the context is missing the component does not render the number.
3. **Every number has a receipt.** Clicking a result opens the ledger entry behind it, with its hashes.
4. **The safe action is always one tap away. The risky one is never one tap.** Halt is in the header on every screen. Resume, approve and loosen need a typed confirmation.
5. **Say "nothing passed" plainly.** Empty states are real states, written in full sentences, with what happens next.
6. **Always answer "why not?"** Every rejected pair, blocked intent and paused slot shows the rule and the number that caused it.
7. **Paper is loud.** The mode badge is in the header on every screen and on every order row. If a slot is ever live, the whole header changes colour and says so.
8. **Calm.** No tickers, confetti, flashing prices or streaks. The psychology material in the archive is clear about what those do.

## 2. Information architecture

Eleven flat tabs become six sections. Desktop: a left rail (icons with labels, collapsible). Phone: a bottom bar with the first four sections and "More".

| Section | Screens | Replaces |
|---|---|---|
| **Today** | Home | Command |
| **Autopilot** | Funnel and board, Paper book, Slot detail, Risk, Research queue, Data health, Reports, Ledger | new |
| **Claim check** | New check, Result, History | new |
| **Research** | Strategies (builder), Lab, Signals, Library, Council, Assistants | Strategies, Strategy Lab, Signals, Library, Council, Assistants |
| **Agents** | Roster, Activity, Inbox, Outbox, Automations | Agents |
| **You** | Journal and rules, Settings (limits, live locks, API keys, notifications, receipts page), Setup | Journal, Setup |

Global, on every screen:
- **Header**: brand, mode badge (`PAPER`), trial counter (`N tries counted`), data status dot, the Halt button, the command palette trigger, the Apex AI drawer trigger.
- **Command palette** (Ctrl or Cmd K): go to a screen, a slot or a strategy; run safe commands (halt, run a tick, open today's report, new claim check).
- **Apex AI drawer**: the existing chat, docked right, aware of the current screen (it receives the screen's data through the read API). It can explain and queue research. It cannot approve, resume or change limits, and it says so when asked.

Routes: `/` Today; `/autopilot`, `/autopilot/book`, `/autopilot/slots/[key]`, `/autopilot/risk`, `/autopilot/queue`, `/autopilot/data`, `/autopilot/reports/[id]`, `/autopilot/ledger`, `/autopilot/ledger/[seq]`; `/claims`, `/claims/[id]`; `/research/...`; `/agents/...`; `/you/...`; `/receipts` (public when enabled). The single-page tab state in `App.tsx` moves to real routes so screens are linkable from Telegram, reports and the terminal.

## 3. Design system

Package `packages/ui`. Tokens are CSS variables (the existing ones in `globals.css`, extended). Both themes are first class; dark is the default for the installed app.

### 3.1 Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f7f9` | `#0a0d12` | Page |
| `--panel` | `#ffffff` | `#11161d` | Cards |
| `--panel-2` | `#f0f3f6` | `#161d26` | Nested areas, table header |
| `--ink` | `#0f1720` | `#e6edf3` | Text |
| `--mute` | `#566170` | `#93a0b0` | Secondary text (4.5:1 on its panel in both themes) |
| `--line` | `#e3e7ec` | `#222b36` | Borders |
| `--acc` | `#0b7a5c` | `#2fd59b` | Brand, primary button, "ok" |
| `--info` | `#2456d6` | `#6ea8ff` | Links, neutral highlights, forward data |
| `--warn` | `#8a5600` | `#f0b54a` | Warnings, near miss, paused |
| `--bad` | `#b42323` | `#ff7b72` | Failures, blocks, halt |
| `--live` | `#b4520b` | `#ff9f43` | Anything live. Used nowhere else |
| `--chip` | `#eef2f5` | `#17202a` | Chips |

Rules: status is never colour alone. Every status has a label and a shape (section 3.4). Gains and losses use a sign and an arrow as well as colour. `--live` is reserved so a live state can never be mistaken for anything else.

### 3.2 Type

- UI: Inter (system fallback). Numbers and code: JetBrains Mono (fallback `ui-monospace`), with tabular figures everywhere a column of numbers appears.
- Scale (px): 12 label, 13 table, 14 body, 16 card title, 20 section title, 28 page figure. Line height 1.45 for text, 1.2 for figures.
- Labels are sentence case. No all-caps except the mode badge and three-letter status codes.

### 3.3 Space, shape, motion

- 4 px grid. Card padding 16. Gaps 12 or 16. Page gutter 16 on phones, 24 on desktop. Content max width 1360.
- Radius: 12 cards, 8 controls, 999 chips.
- Motion: 120 ms ease-out for hover and reveal. No looping animation except a single pulsing dot on "run in progress". `prefers-reduced-motion` removes all of it.
- Touch targets at least 44 px.

### 3.4 Status vocabulary

One vocabulary across the web, the terminal, Telegram and reports.

| Status | Label | Shape | Colour |
|---|---|---|---|
| Rejected | No edge | ✕ in circle | mute |
| Watch | Near miss | half-filled circle | warn |
| Needs data | Needs data | hourglass | info |
| Pending validation | Checking | two arrows | info |
| Paper | Paper | hollow circle | acc |
| Paused (drift, data) | Paused | pause bars | warn |
| Live eligible | Eligible | circle with tick | acc |
| Micro-live and above | LIVE 1% (and 10, 50, 100) | solid diamond | live |
| Retired | Retired | square | mute |
| Shadow | Shadow | dashed circle | mute |

### 3.5 Components

| Component | Purpose | Notes |
|---|---|---|
| `Metric` | A figure with its context | Props: `value`, `unit`, `n` (sample size), `basis` (`in-sample`, `forward`, `book`), `net` (boolean), `receipt` (ledger seq). Renders the figure, a basis chip, `n = 51`, and a receipt link. Throws in development if `n` or `basis` is missing |
| `StatusChip` | Status vocabulary | Label, shape, colour |
| `CheckRow` | One gate check | Name, pass or fail mark, the number behind it, one-line why |
| `ChecksStrip` | Seven small marks in a row | For tables: filled for pass, hollow ✕ for fail, with a text alternative ("6 of 7; failed: enough trades") |
| `Funnel` | Counts by stage | Horizontal bars with counts and labels, not a 3D funnel |
| `GraduationClock` | Progress to eligibility | Three rows: forward months against 6, forward trades against 50, deflated probability against 95%, plus "earliest possible: Mar 2028 at the current pace" |
| `EquityChart` | Book against benchmarks | Lines for the paper book, diversified core, SPY hold. Direct labels at line ends, no legend box. Marks where the lock and any pause happened |
| `DriftChart` | CUSUM over trades | Line with the alarm threshold; alarm points marked |
| `LockPanel` | The four live locks | Four rows with open or closed padlock, who can open it, and why it is closed. No action on lock 4 |
| `WhyNot` | Reasons | List of rule ids with plain-words text and numbers |
| `Receipt` | Ledger entry | Seq, kind, time, actor, hashes (monospace, copyable), verify command |
| `ProvenanceTable` | Where data came from | Source, second source, fetched, adjustment, health chip |
| `DataTable` | All tables | Sticky header, sortable, column chooser, row click opens detail, horizontal scroll inside its box on narrow screens, CSV export |
| `ConfirmTyped` | Risky action dialog | States the consequence, needs the object's name typed, shows the ledger entry that will be written |
| `HaltButton` | Header | One tap opens a sheet with three choices: pause new entries (andon), kill switch, cancel. Then one confirm |
| `Banner` | System states | Halted, data blocked, storage not persistent, budget reached, run failed |
| `EmptyState` | Nothing yet | Sentence, reason, next step |
| `ClaimCompare` | Claimed and measured | Two columns per metric |
| `SourceQuote` | Extracted rule with its quote | Rule text, highlighted excerpt, jump to position in the source |

## 4. Screens

Wireframes show desktop. Phone layouts stack the same blocks in the same order.

Figures in the wireframes are illustrative of a later state (one slot in paper). The canvas shows today's real state instead: the 10 Nov 2026 stress board ran six checks on 266 pairs, the seventh check (beats hold on risk) has not been run across the board, and the one candidate (`dave_prev_range` on SPY 1h, +9.1% against +25.4% for SPY hold, drawdown −8.3% against −20.5%) is still waiting for that comparison and for the validator. Nothing is in paper yet.

### 4.1 Today

The answer to "what is going on and do you need me?" in one screen.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ APEX   [PAPER]   266 tries counted   ● data ok          [⌘K]  [Ask Apex]        [ Halt ]   │
├──────┬─────────────────────────────────────────────────────────────────────────────────────┤
│Today │  Paper mode. Nothing here is proven or guaranteed.                                   │
│Auto  │  ┌ Needs you (2) ─────────────────────────────────────────────────────────────────┐ │
│Claim │  │ • Scout proposed 3 tests (would add 5 tries)                  [Review]         │ │
│Resrch│  │ • IWM 30m data: second source disagrees on 2 bars             [Open]           │ │
│Agents│  └────────────────────────────────────────────────────────────────────────────────┘ │
│You   │  ┌ Evidence ───────────────────┐ ┌ Paper book ─────────────────────────────────────┐│
│      │  │ 266 tried                   │ │ $10,000.00   book · since 10 Nov · 0 trades     ││
│      │  │   1 passed all 7 checks     │ │ vs core  +0.0%    vs SPY hold  +0.0%            ││
│      │  │   1 in paper                │ │ [equity chart: book, core, SPY]                 ││
│      │  │   0 eligible   0 live       │ │ Day 0.0% of −2%   Week 0.0% of −5%   DD 0% /15% ││
│      │  └─────────────────────────────┘ └─────────────────────────────────────────────────┘│
│      │  ┌ Slots ─────────────────────────────────────────────────────────────────────────┐ │
│      │  │ dave_prev_range · SPY 1h   ○ Paper   forward 0.0 mo · 0/50 trades   clock ▸    │ │
│      │  └────────────────────────────────────────────────────────────────────────────────┘ │
│      │  ┌ Last run ───────────┐ ┌ Closest near misses ───────────────────────────────────┐ │
│      │  │ 00:30 full · ok     │ │ dave_prev_range SPY 4h   6/7   failed: enough trades    │ │
│      │  │ next tick 14:30     │ │ ...                                                     │ │
│      │  └─────────────────────┘ └─────────────────────────────────────────────────────────┘ │
└──────┴─────────────────────────────────────────────────────────────────────────────────────┘
```

- "Needs you" is first. If empty it collapses to one line: "Nothing needs you."
- The Evidence card is the funnel in five numbers. Each is a link to the board filtered to that status.
- The paper book card never shows a P&L figure without the trade count and the two benchmarks beside it.
- States: halted (red banner with reason and who pulled it; Halt button becomes "Halted"), no database (banner, autopilot off), first run not yet done (empty state with "Run now").

### 4.2 Autopilot: funnel and board

```
 Funnel   266 pairs ▸ 266 evaluated ▸ 1 passed ▸ 1 validated ▸ 1 paper ▸ 0 eligible ▸ 0 live       [Run tick]
 Filters  [status ▾] [style ▾] [market ▾] [timeframe ▾]   search…                      columns ▾   CSV
 ┌──────────────────┬─────────┬────────┬─────────┬────────┬────────┬────────┬────────┬──────────┐
 │ Strategy         │ Market  │ Status │ Checks  │ Trades │ Net    │ Hold   │ Sharpe │ Deflated │
 │ dave_prev_range  │ SPY 1h  │ ○Paper │ ●●●●●●● │ 51     │ +9.1%  │ …      │ …      │ …        │
 │ dave_prev_range  │ SPY 4h  │ ⧗Data  │ ✕●●●●●● │ 25     │ …      │ …      │ …      │ …        │
 │ turtle_55_20     │ SPY 1h  │ ✕None  │ ●✕✕✕✕✕✕ │ 74     │ −2.2%  │ …      │ …      │ …        │
 └──────────────────┴─────────┴────────┴─────────┴────────┴────────┴────────┴────────┴──────────┘
```

- Default sort: status rank, then checks passed, then Sharpe. Never by return.
- Row click opens a side panel: the seven `CheckRow`s, equity curve with the holdout shaded, the monkey-test histogram with the strategy marked, the cost breakdown, regime split, `WhyNot`, validator runs with level badges, and the receipt.
- A grid view (strategy by market heat map of checks passed) is the second tab; it is the gap map with results on it.
- Column header tooltips define every term in one sentence.

### 4.3 Slot detail

```
 dave_prev_range · SPY 1h        ○ Paper · primary        locked 10 Nov 2026 · lock a3f9…c21     [Pause]
 ┌ Graduation clock ───────────────────────────┐ ┌ Live locks ───────────────────────────────────┐
 │ Forward months     0.0 / 6    ▱▱▱▱▱▱        │ │ 🔒 1 Evidence        not yet (clock)          │
 │ Forward trades       0 / 50   ▱▱▱▱▱▱▱▱▱▱    │ │ 🔒 2 Independent check   waits for 1          │
 │ Deflated probability  — / 95% (M = 1)       │ │ 🔒 3 Your approval       waits for 1 and 2    │
 │ Earliest possible: about Nov 2028 at the    │ │ 🔒 4 Your machine        cannot be opened     │
 │ backtest pace of 25 trades a year           │ │       from the dashboard                      │
 └─────────────────────────────────────────────┘ └───────────────────────────────────────────────┘
 ┌ Forward record (strategy) ──────┐ ┌ In-sample (what it was selected on) ─────────────────────┐
 │ no trades yet                   │ │ 51 trades · +9.1% net · 7/7 checks · receipt #412        │
 └─────────────────────────────────┘ └──────────────────────────────────────────────────────────┘
 [price chart: entries, exits, the lock line]   [drift chart]   [regime context]
 Tabs: Trades · Intents and blocks · Validator runs · Shadows · Events · Receipts
```

- In-sample and forward are always in separate cards with different chips (`in-sample` grey, `forward` blue). They are never added together.
- The clock's "earliest possible" line is computed, not hand-written; when the forward Sharpe is too low to ever pass it says "At the current forward Sharpe this will not pass. It stays in paper and is re-checked monthly."
- Pause is one tap. Resume and Retire use `ConfirmTyped`.
- When lock 1 and 2 are open, lock 3 shows "Review for micro-live", which opens the approval flow: checklist, stage and size cap, expiry, typed slot name, password. The dialog states that nothing trades until lock 4 is opened on his machine, and shows the exact command.

### 4.4 Paper book

Equity chart (book, core, SPY hold) with direct labels; open positions table (symbol, slot, side, quantity, entry, stop, risk in dollars and percent, bars held, mode badge); closed trades; blocked intents with rule ids; a small table of the day's and week's loss against limits. Export CSV. A "Costs" card says measured or assumed.

### 4.5 Risk

- **Limits table**: each limit, its value, its ceiling, where it is set (`env`), and any pending loosen with the time it takes effect. Read-only. A note explains how to change one (set the env var; loosening waits 24 hours).
- **Halts**: current state of each level, history of pulls with who and why.
- **Exposure**: open risk by asset class and by correlation cluster against caps.
- **Drift**: every slot's CUSUM as small multiples.
- **Guard activity**: last 100 intents with pass or block and rules.

### 4.6 Research queue

Kanban by status (proposed, approved, running, done, dropped). Each card: title, why, source, needs, cost ("2 tries, about $0.20 of AI"), and for proposals an Approve and a Drop button. The header shows the weekly trial budget: "7 of 25 tries used this week". Approving is safe (paper, counted) so it is one tap with an undo within 10 seconds.

### 4.7 Data health

One row per dataset: status chip, last bar, source and second source, rows, gaps, last check, and the checks that are not `ok`. Row click: the check list with the offending bars charted, restatement history, version hashes. A "Recorder" card shows the order-book recorder's last manifest and gaps.

### 4.8 Reports

List by date; a report renders as the Markdown the pipeline wrote, with links from every figure to its receipt. Buttons: copy link, download Markdown, send to Telegram again.

### 4.9 Ledger

A table of entries (seq, time, kind, actor, summary) with filters by kind and slot, a detail view using `Receipt`, the chain status ("verified to #1,932; last anchor 23:55 yesterday, commit abc123"), and a "How to verify" box with the CLI command.

### 4.10 Claim check

**New check**: one large text area ("Paste a transcript, a Pine script or a sales page"), file drop, optional fields (market, timeframe), and a cost line that updates after extraction: "This will use up to 3 tries. Tries so far: 266." Steps show as a short progress list: Reading, Extracting rules, Planning, Testing, Done.

**Result**:

```
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │  NO EDGE                                                                                  │
 │  On SPY 1h, these rules did not beat random entries, costs and buy and hold.              │
 │  The rules as extracted · 1 interpretation · 1 try · receipt #418                         │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
 ┌ Claimed ───────────────────────┬ Measured ─────────────────────────────────────────────────┐
 │ "+729% on the turtle system"   │ −2.2% net, 74 trades, 2 years (SPY 1h)                    │
 │ no win rate given              │ win rate …, profit factor …                               │
 └────────────────────────────────┴──────────────────────────────────────────────────────────┘
 Checks   ●enough trades  ✕monkey test  ✕locked window  ✕one bar late  ✕double costs  ✕costs  ✕beats hold
 Rules as extracted                         │ Source
  Entry: close above the 55-day high  ❝…❞   │ …transcript with the quoted passages highlighted…
  Stop: 2× ATR(20) below the signal close   │
  Assumptions (1): exit on 20-day low…[edit]│
 Not tested: alerts to email (not a rule)   Flags: results shown as screenshots only
 Data: massive:SPY:1h · costs assumed · [Send to queue] [Export] [Edit and re-run (uses 1 try)]
```

Verdict colours: holds up uses `--acc`, near miss `--warn`, no edge neutral ink on `--panel-2` (not red: "no edge" is the normal result, not an alarm), untestable `--info`.

### 4.11 Agents, Research, You

Agents: section 6 of `06`. Research: the existing screens, restyled with the shared components; the Strategies builder gains a "Run the full gate" action (pre-registers, counts a try) next to the quick preview, and the preview is labelled "quick look, not a test". You: Journal and rules as today; Settings adds API keys (create with scopes, shown once, revoke), notifications, the receipts page switch, and the read-only limits and locks.

## 5. Cross-cutting states

| State | Treatment |
|---|---|
| Loading | Skeleton rows the shape of the content; no spinners over whole pages |
| Run in progress | Header dot pulses; "Run tick" disabled with "a run is in progress" |
| Stale view | Data older than its refresh interval shows "updated 14 min ago" in warn colour and a refresh action |
| Error | Inline card with what failed, the id to quote, and retry; never a blank screen |
| Halted | Red banner on every screen, reason, who, when; all "run" actions disabled; Halt button shows state |
| Data blocked | Warn chip on every figure that depends on the dataset; slot shows `paused_data` |
| No database | Banner; autopilot screens show the empty state "Storage is not set up, so nothing is recorded and nothing runs" |
| AI budget reached | Banner on AI features; everything non-AI keeps working |
| Offline (PWA) | Last cached read-only data with an "offline" chip; all actions disabled except viewing |

## 6. Responsive and installable app

- Breakpoints: 640 (phone), 1024 (rail collapses to icons), 1360 (max content).
- Phone: bottom bar (Today, Autopilot, Claim check, Agents, More); header keeps the mode badge and Halt; tables become cards with the three most important fields and a chevron; charts are full width and 180 px tall; side panels become full-screen sheets.
- **PWA**: `manifest.webmanifest` (name "Apex", standalone display, theme colour from `--bg`, maskable icons 192 and 512, shortcuts to Today, New claim check, Halt), a service worker that caches the shell and the last successful read-only API responses (stale-while-revalidate, 24-hour cap), and never caches or queues writes. Install prompts: none automatic; Settings has "Install the app" with per-platform steps.
- Share target: the manifest registers a share target so sharing text or a link from another phone app opens "New claim check" with the text filled in.
- Notifications: Telegram remains the alert channel. Web push is added only after it is tested on Jeremy's phone; the design does not depend on it.
- Desktop: the same PWA installed from the browser. No separate build.

## 7. Accessibility

- All text 4.5:1; large figures 3:1. Checked in both themes in CI (a script reads the tokens).
- Every control reachable and operable by keyboard; visible focus ring (`2px solid var(--info)`, 2 px offset).
- Charts have a table alternative ("View as table") and a one-sentence summary for screen readers.
- Status is label plus shape plus colour.
- Tables use real `<table>` markup with scoped headers. Dialogs trap focus and return it.
- Language is plain. Every term of art (deflated Sharpe, monkey test, holdout) has a one-sentence definition on hover or tap and a glossary page.

## 8. Words

- Sentence case. Short sentences. No exclamation marks.
- Fixed phrases, used verbatim everywhere: "Paper mode. Nothing here is proven or guaranteed." / "Nothing has passed yet. The diversified core is the benchmark." / "Going live is your switch, on your machine."
- Never: "guaranteed", "risk-free", "winning", "signal" (for an untested rule), "proven".
- Numbers: percentages to one decimal; money to cents; Sharpe to two decimals; always a sign on returns; thousands separators; times in Jeremy's local zone with UTC on hover; hashes shortened to first 4 and last 4 with copy.
- Buttons say what happens: "Pause new entries", not "OK".

## 9. Telegram

Read and safe actions only. Commands: `/state`, `/report` (today's summary with a link), `/board` (top 10), `/slots`, `/book`, `/risk`, `/data`, `/queue`, `/check <text or file>` (queue a claim check), `/halt <reason>` (pulls the andon cord, confirms with a second tap on an inline button), `/help`. Resume and approvals answer: "That needs the dashboard" with a link. Alerts: halt pulled, slot paused, data blocked, intent blocked by a loss limit, graduation reached, report ready, budget reached, a job needing Jeremy.

## 10. Build notes for the UI

- Move screens from the one-file `App.tsx` to route folders one at a time; each move keeps `npm run check:ui` green and adds the screen to it.
- Components in `packages/ui` are plain React with CSS variables; no CSS framework is needed.
- All screens read through the same v1 API the terminal and MCP use (server components may call the repository layer directly, but through the same query functions), so the three surfaces cannot disagree.
- Playwright checks per screen: renders in both themes at 390 and 1360 wide, no horizontal page scroll, Halt reachable, mode badge present, no `Metric` without context (a test hook counts them).
