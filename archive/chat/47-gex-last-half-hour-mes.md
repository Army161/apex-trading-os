<!-- source: project chat message cmsg_01UG5ujmQ3eWK7x4hDW3fVZ6Rg2DMS8CGVrnJsoBCeLk5A | sent 2026-11-10T18:17:54Z | verbatim -->

Gamma exposure, also known as
GEX, is everywhere right now. Part of the reason is zero day options. In July, a record two thirds of S&P 500 index
options volume expired the same day it traded. So dealer hedging has become
a real force on the index. In this video I will show you an
automated strategy that trades MES, the Micro E-mini S&P 500 future, and it
runs through the Interactive Brokers API and decides using two things: which way the S&P has moved
during the day, and dealer gamma, from options data. I will also explain in detail
how the trading mechanism works and the whole methodology behind it,
even if you have never heard about GEX. Here's an example of it running. This is an automated engine I built
on the Interactive Brokers API. You can also connect it to Alpaca or
TradingView, connected with your broker. And it trades Micro E-mini S&P 500 futures, on a paper account. On the left, the
engine. On the right, Trader Workstation. Once a day, at 15:30 New York, it
reads dealer gamma and the day's move. It makes one decision, sends the order
and closes everything before the bell. At the end of this video I walk
through a full session, step by step. So first, let's build everything from zero. I built this dashboard to explain all the
dynamics and the graphs of what happens in GEX. This dashboard pulls the whole S&P
500 options chain, SPX specifically. These are the SPX chains from Cboe. About 19,000 contracts, and it turns
them into a handful of numbers. Let's go step by step. We
start with a single option. Here you have gamma exposure, GEX: gamma times
open interest times 100 shares per contract, times the spot squared, times 1%. That's the dollar amount dealers have
to trade when the index moves 1%. And this is the dealer sign: dealers
are long the calls and short the puts. So calls count as positive
and puts as negative. Now you do that for every contract. Each row is one
strike: calls in blue, puts in red, net on the right. Click a strike and you see the
same formula with the real numbers. So here you have the total GEX
for every option in the chain. Add every strike together
and you get net gamma. And here it is: minus
13.7 billion per 1% move. When it's negative, it means
dealers are short gamma. Net gamma only holds at today's price. So reprice every contract as if
the index were somewhere else, add again, do it at every
price, and you get this curve. Where it crosses zero is
called the gamma flip. Here it is 7,647. Above it, dealers are long
gamma. Below it, they are short. The last two levels: above spot, the strike
with the most positive gamma is the call wall. Below spot, the most
negative one is the put wall. That's where most of the
dealer hedging is parked. Now moving the variables:
move the index down 3%. The curve stays put, the spot marker
slides along it, and net gamma follows. Raise implied volatility and gamma spreads
out across the strikes, so the curve flattens. Jump to the last half hour of the day. Same day options get very sharp gamma near their
strike, and the curve gets steeper around spot. Remember the gamma mechanism: what happens to
gamma close to expiration and near the strike. Then open interest: triple it, the zero
day effect, and see how the curve moves. And if the assumption is wrong and dealers
sit on the other side, everything flips sign. That's the weak spot of every GEX chart:
nobody knows the positioning for sure. People assume it, take it from
a paper, or go by gut feeling. So how do you trade it? I'm going to
mention some papers, like this one. Baltussen, Da, Lammers and Martens,
Journal of Financial Economics, 2021. The main finding: when dealers are short
gamma, the last half hour keeps going in the direction of the day. When they
are long gamma, that effect disappears. A second paper, Barbon and Buraschi,
finds moves tend to reverse. Let's turn that into trades,
with our numbers from before: the S&P at 7,638 and the gamma flip at 7,647. Right below the flip, so dealers are short
gamma. Above the flip, it would be long gamma. Say it's 15:30 and the S&P
is up 1% from the open. Short gamma dealers have to buy
into that rise to stay hedged. So the engine buys, on the
same side as the dealers, and it closes at 15:59. Same day, but the S&P is down at
15:30. Now dealers sell into the fall, so the engine sells. Now the other case: if the index opens
above the flip, dealers are long gamma. Up at 15:30, they sell into the rise, so the engine sells. When it's down, they buy, so the engine buys. The
whole rule fits in one line: at 15:30, trade the same side as the
dealer hedge, and close at 15:59. On a flat day there's no trade. One detail:
gamma is read once, before the open. If the price crosses the flip during the
day, like here, the side stays the same. On SPY from 2023 to 2026 this
rule has a Sharpe of about 1.37, and without the gamma filter it loses money. The edge is small, though, about 3
basis points a day, so costs matter. In the live engine, gamma comes from the SqueezeMetrics
daily series, the same one the backtest used, because I'm using free
data here, no paid source. Now let's watch the full session.
I'm going to open the terminal and connect to the trading engine, with
the command that runs the Python script. First it pulls the options
data and the dealer gamma, which comes from the SqueezeMetrics daily
series, the same one the backtest used. Here it is, plus 8.4 billion,
so dealers are long gamma. It also computes its own number from
the full Cboe chain as a cross check. Today the two disagree in sign, and
the engine trusts the tested series. Then it states the rule it is
about to apply: at 15:30 New York, look at the S&P move since the 9:30 open. Short gamma, go
with it. Long gamma, go against it. Flat before the bell. Account and contract: the paper account, the
December Micro E-mini, 5 dollars a point. September expires this week,
a short term expiration, so the engine already rolled to the
next contract. Position now: flat. Then the decision. It compares
where the S&P is now with the open. Up 0.38% so far. Long gamma and
the day is up, so the rule goes against the move. It sells one Micro E-mini. You see it selling. This one is a
midday test with a single contract. At full size it sizes to the account: net
liquidation divided by 5 times the price, which today would be 26
contracts, and it runs at 15:30. Execution: the market order
goes out, and 2 seconds later it fills at 7,699. Everything
on this screen is read back from the broker's execution log, so the
fill and the commission are the real ones. It's a paper portfolio, but the trading costs
come from this broker, not an assumption. On the right, Trader Workstation,
the broker side of the same trade. Here's the position, short 1 MES, here's the P&L
block, and here is the fill in the trades tab. While it holds, the engine marks
the open P&L every 10 seconds, so I can follow the trade from the terminal or the platform.
Here the hold is 2 and a half minutes for the test. In the real session it holds the last half hour and closes
at 15:59, and if anything fails, a market order flattens it. Then it buys back at 7,700.25, one and a quarter points against me, minus 7
dollars 47 after commission. Flat and logged. Every session ends as one line in a CSV:
regime, leg, action, contracts, entry and exit. And that was a short demonstration. You can play
with it as much as you want on a paper portfolio. Again, this is not a trading
or investment recommendation. This is a test of a strategy
that has become very popular, and this engine is a way
to automate some of it. But it is made for a paper portfolio, not tested in live
trading, and everything will be available on GitHub. So you can download it, do the git clone
and test it with Interactive Brokers. I will also create a version for Alpaca and
other platforms that does the same thing. Thank you for your time, and I hope
you understood the GEX mechanism.
