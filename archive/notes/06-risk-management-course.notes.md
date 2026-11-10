# 06 Risk Management Course - notes
Source: /home/claude/apex/archive/uploads/06-risk-management-course.md (read in full, 0-66127 chars)

## 1. Summary
A free full course on risk management applicable to any market. Core message: survival first, profit second; uncertainty cannot be removed but risk (loss if wrong) can be chosen. Covers four historical figures (Bernoulli expected utility/loss aversion, Markowitz diversification, Kelly optimal bet size, Taleb antifragility), the asymmetry of losses and recovery (10% loss needs 11%, 50% needs 100%, 90% needs 900%), win rate vs risk-to-reward vs expectancy and break-even win rate, compounding (never interrupt it; withdrawing profits is the costliest habit), three kinds of risk per trade (capital, positional, target) which can only be transformed, three stop types (technical, volatility/ATR, combined) and target types (fixed R, technical, dynamic), position-sizing models (fixed fractional, fixed dollar, volatility-based, fixed ratio), the Kelly criterion and why full Kelly is dangerous (use half or quarter), averaging down (smart linear/non-linear vs reckless) and Martingale (dangerous), and a closing nod to antifragile/volatility strategies.

## 2. Codifiable rules
- Loss recovery: gain needed = loss / (1 - loss). Quoted: "a 10% loss will actually require an 11% gain"; "50% loss then we actually require 100%"; "90%... around 900%". BTC example: "77%" drop needs "around 350%".
- R:R = reward / risk. "If you win three times more than you lose then your risk-to-reward is 3 / 1."
- Break-even win rate = 1 / (1 + R). Quote: "one divided by one plus your risk to reward... 1 / 1 + 3... 25%." (R=2 -> 33%.)
- Expectancy = winRate x avgWin - lossRate x avgLoss. Examples: 50% win, $100/$100 -> $0. 66% win, $100/$100 -> about $32/trade. 66% win with 2:1 R -> almost $100/trade ("$2,000 for 20 trades... $23,500 per year if 20 trades per month"). "You don't need to win often. You need your wins bigger than your losses." "win rate alone alone is actually meaningless... a 30% win rate can actually be profitable and an 80% win rate can lose money."
- Fixed fractional sizing: "risk a fixed percent of your capital per trade. A very common number and a very safe number is to only risk 1%... some traders risk 2%, some 4%." $10,000 at 1% = $100 risk; 2% = $200.
- Position size formula (from demo): units = (account x risk%) / |entry - stop|. Example: account 10,000, 1%, entry 100, stop 95 -> 20 units; stop 90 -> 10 units.
- Fixed-dollar sizing: recalc fixed fractional "maybe once a week" then risk that fixed dollar amount per trade until recalculated.
- Volatility-based sizing: "position size shrinks in volatile markets and grows in quiet ones" (stop distance from ATR, size = risk$ / stop distance).
- Fixed ratio (Ryan Jones, speaker said "dry"): size increases only after defined profit milestones; "I don't really recommend for most beginners."
- Technical stop: "placed where the trade idea is invalidated", just beyond swing low/high, S/R level or supply/demand zone. Hammer: stop just below the lowest point of the hammer. Short: stop just above pivot high.
- Volatility stop: "stop loss to be 1.5 to 2x the ATR" (ATR default; demo ATR about 4,200 on BTC daily -> 2x = about $8,000; 1.5x = about $6,000).
- Combined stop: technical level plus "wiggle room... around 0.25 to 0.5x the ATR" (example: 8,200 + 1,000 = 9,200 away).
- Always use hard stops: "you really want to avoid mental stop-loss"; also avoid money stops and time-based stops; focus on technical, volatility and combined.
- Targets: (a) fixed R multiple, "a very common risk-reward is... 2:1", also 3:1 or 1.5; (b) technical target "just below" next resistance (or above support for shorts), because "we do expect... the price to pull back" at the zone; (c) dynamic target - trendline, Bollinger band (example: exit on candle close above band), channels, pitchforks.
- Trade filter: "if your trading setup maybe is technically valid but you have a strong... resistance or any other kind of technical level nearby, you might actually want to skip that trade" (not enough room to target).
- Hammer entry: "most common place to enter a hammer is at the candle close".
- Kelly: "percent you should risk is... your win rate minus your loss rate divided by your risk-to-reward" (speaker's formula, simplified; standard Kelly is W - (1-W)/R). Example: 60% win, 1:1 -> 20%. Needs at least 100 backtested trades for stats ("at least 100 trades"). Recommendations: half Kelly (10% in example), "maybe a quarter Kelly down to around 5%"; if unsure of stats use "2% or 1%".
- Averaging down: only with a pre-made plan and max position size. Linear: add equal size at each predefined level. Non-linear: larger size at deeper levels (example 1 @100 + 2 @90 -> avg 93.33). Averaging into losers without a plan is "one of the main reasons why traders blow up their accounts".
- Martingale: "double the size after every loss"; works only with infinite capital; avoid.
- Compounding: "reinvest... profits"; "never interrupt compounding unnecessarily" (Charlie Munger); "withdrawing profits to live off trading is the most expensive habit a trader can build." Time matters more than return.
- Risk transformation: tighter stop -> lower capital risk, higher positional risk (more likely hit); wider stop -> opposite; moving stop to breakeven removes capital risk but raises positional risk; partial profits (scaling out) increase target risk. "You cannot actually eliminate risk. You can only move it from one type to another."
- Three risk types: capital risk (loss if stop hit, e.g. buy 1 BTC at 100,000 stop 99,000 = $1,000), positional risk (chance stop is hit at all), target risk (chance of making less than the trade could).

## 3. Strategy specs
This course is a risk framework rather than an entry strategy. Specs below are risk/position-management modules the platform can implement.
```json
{
  "id": "fixed-fractional-sizing",
  "name": "Fixed fractional position sizing",
  "market": "any",
  "timeframe": "any",
  "direction": "both",
  "indicators": {},
  "entry": "n/a (sizing module)",
  "stop": "Any technical stop; size = (equity x risk_pct) / |entry - stop|",
  "target": "n/a",
  "filters": ["risk_pct default 1% (range 1-2%, speaker mentions up to 4%)"],
  "notes": "Recalculate on equity; fixed-dollar variant allowed with weekly recalculation."
}
```
```json
{
  "id": "atr-volatility-stop",
  "name": "ATR volatility / combined stop",
  "market": "any (demo BTC daily)",
  "timeframe": "any (demo 1D)",
  "direction": "both",
  "indicators": {"ATR": {"length": "default (14 implied)", "stop_multiple": "1.5 to 2", "combined_wiggle_multiple": "0.25 to 0.5"}},
  "entry": "n/a",
  "stop": "Volatility: entry -/+ 1.5-2 x ATR. Combined: beyond technical level by 0.25-0.5 x ATR.",
  "target": "Fixed R (2:1 common) or technical or dynamic (Bollinger candle close).",
  "filters": ["Skip trade if strong opposing level is close to entry (insufficient room)"],
  "notes": "ATR length not stated; platform default 14 is an assumption."
}
```
```json
{
  "id": "hammer-at-support-long-demo",
  "name": "Hammer at support long (planning demo)",
  "market": "BTC (demo)",
  "timeframe": "1D",
  "direction": "long",
  "indicators": {},
  "entry": "At the close of the hammer candle after a strong downmove.",
  "stop": "Just below the lowest point of the hammer.",
  "target": "R multiples 1, 2, 3, 5 shown with Trading View long/short position tool; 2:1 'most common'.",
  "filters": ["Volume present (mentioned)"],
  "notes": "Used only to demonstrate the R:R tool; not presented as a tested strategy. Short mirror: stop above pivot high."
}
```
```json
{
  "id": "fractional-kelly-sizing",
  "name": "Fractional Kelly sizing (half/quarter)",
  "market": "any",
  "timeframe": "any",
  "direction": "both",
  "indicators": {},
  "entry": "n/a",
  "stop": "n/a",
  "target": "n/a",
  "filters": ["Require >= 100 backtested trades for win rate and R", "Use 0.5x or 0.25x Kelly; cap at 1-2% if stats uncertain"],
  "notes": "Speaker formula: win% - loss% divided by R (not the textbook form). Platform should use f* = W - (1-W)/R and cap, and flag the discrepancy."
}
```

## 4. Risk and psychology rules
- Survival first; avoid big losses at all costs (they need disproportionate recovery).
- Risk 1% (or 2%) per trade; consistent small number; never full Kelly.
- Always hard stop-loss; no mental stops.
- Loss aversion (Bernoulli): losses hurt more than gains; be aware of it.
- Averaging down only per pre-planned scale-in with max size; never to "make the money back"; no Martingale.
- Do not withdraw profits routinely; reinvest to compound.
- Diversification (Markowitz): uncorrelated risks offset (umbrella/sunscreen example).
- Antifragility (Taleb): systems that gain from stress; option-like/volatility strategies (Black-Scholes) mentioned as future topic.
- Backtest to get real stats before using Kelly; stats are never constant.
- No explicit max drawdown, daily loss limit or cooldown numbers are given. Journaling is not covered here (see 07).

## 5. Tools, repos, apps, APIs mentioned
- TradingView (price range tool; long position / short position tool under "forecasting and measurement tools"; ATR, Bollinger Bands, rectangle tool; affiliate link 30-day Premium, $15 bonus).
- MindMath trading toolkit (paid channel membership, gold tier+): expected value calculator, position size calculator, drawdown recovery tool.
- Books/people: Charlie Munger "Poor Charlie's Almanack"; Bernoulli (1738), Markowitz, Kelly (1956), Taleb (2012 antifragile), Black-Scholes (Nobel 1997), Larry Williams (1987 Robbins Cup).
- No commands or APIs.

## 6. Claims to treat with caution
- "around 90% of traders lose money" (unsourced statistic).
- Larry Williams: "turn around $10,000 to roughly $1.1 million in the 1987 Robbins Cup" using full Kelly - speaker notes he "admitted that he was super lucky".
- Calculator outputs: "$7,680 per year if you take 20 trades per month"; "$23,500 per year" at 66% win, 2:1 - illustrative expectancy math, not performance claims; assumes stable stats.
- "Rich people really understand the magic of compounding" (opinion).
- Speaker says Kelly "in theory" grows account fastest; real markets violate assumptions.
- Speaker's loose arithmetic: Kelly formula as stated (win - loss)/R differs from textbook Kelly.
