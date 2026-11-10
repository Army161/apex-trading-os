# Spec: trader rules interview, red team, number tags, review on Fable

Source ideas: archive/chat/33 (Fable 5.2 prompts). Method: archive/chat/34 (outcome, spec, tests, checkpoints, Git).

## 1. "Grill me" trader rules
**Outcome:** Apex's AI tools follow the way Jeremy actually decides trades, written down once, instead of generic advice.
- 20 fixed questions, one at a time, on the Journal tab (goals, risk per trade, max daily loss, markets, timeframes,
  setups he trusts, what he never trades, news and earnings, shorts, when he sits out, how he exits, revenge-trade guard).
- Claude turns the answers into a short rules file (Markdown, under 400 words). He can edit and save it.
- Stored server side (`trader_rules`). Apex AI chat, Telegram chat and Risk Mitigator add it to their instructions.
- House rules always win: paper first, 1% risk cap, stop required. If his answers conflict, the house rule stays and
  the file says so.
- Non-goals: no automatic trading changes, no keys, nothing personal sent anywhere else.

**Tests**
- [ ] `normalizeRules` caps length and strips HTML (self-test).
- [ ] Answers with a "risk 5% per trade" claim come back with the 1% house cap noted (prompt rule; checked by reading output once a key exists).
- [ ] Saving rules with no admin login returns 401; GET returns the saved text.
- [ ] Chat system prompt contains the rules when saved, and is unchanged when none are saved (self-test on the builder function).

## 2. Red team a trade
**Outcome:** before a trade, Jeremy can hear the strongest case against it and the one thing that would change the critic's mind.
- "Red team it" button in Risk Mitigator. Same tools and 3:1 check, but the model argues like a skeptical investor
  who wants to pass, then names one specific, checkable thing that would change its mind.
- **Tests:** [ ] request with `redteam: true` adds the red-team instruction (self-test on `systemFor`); [ ] without it the prompt is unchanged.

## 3. Verified / unverified / suspicious number tags
**Outcome:** every number in an analyst or assistant report shows how far to trust it.
- Analyst team discovery, investor lenses and crowd check tag numbers: `[verified: source]`, `[unverified]`, `[suspicious: why]`.
  Numbers Apex computed from candles count as verified. Models say "not found" rather than guess.
- **Tests:** [ ] research-team test still passes; [ ] `RULES` text contains the three tags (pytest).

## 4. Review chain on Fable 5.2
**Outcome:** the review before a live flag uses the most careful model, since it runs rarely and matters most.
- `APEX_REVIEW_MODEL` default changes from claude-sonnet-5-5 to claude-fable-5-2 (different from the builder, which is Opus).
- Cost: about $0.40-0.60 per three-step review at list price; it only runs when Jeremy presses the button.
- **Tests:** [ ] self-test: `cost('claude-fable-5-2', 1M in, 1M out)` = $48; [ ] tsc and build pass.

## Checkpoints
1. Rules store, API and prompt injection (tests 1). Commit.
2. Interview UI on Journal. UI check passes. Commit.
3. Red team, number tags, review model (tests 2-4). Commit.

## Not doing now
- Parallel sub-agent sweep of 100 tickers: the Deal Seeker screen and `analyst_team.py compare` already rank many names; a
  bigger fan-out waits for a deployed runner (Vercel functions stop at 2 minutes).
- Long unattended jobs with a running log: same limit. Best fit later is a scheduled job on Jeremy's machine or Managed Agents.
