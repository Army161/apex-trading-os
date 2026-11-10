<!-- source: project chat message cmsg_01UG5ujmQ3eWK7x4hDW3fVZ67MfcjWHmfh1uZi8w33hziL | sent 2026-11-10T16:47:10Z | verbatim -->

0:00 There is no telling how many industries
0:01 this AI will disrupt. The trading
0:03 terminal you see here is an
0:04 algo-trading platform I built for Delta
0:06 Exchange, where you can create your own
0:07 algo strategies. You can paper trade
0:09 them and also live trade with them. So,
0:11 in this video today, I am going to
0:12 explain how I built this platform.
0:14 Although I built this for Delta
0:15 Exchange. But if you want, you can
0:16 build it for any broker. If you trade
0:18 in the Indian market, you can build a
0:20 similar type of platform for Zerodha,
0:21 Upstox, or whichever platform you trade
0:23 on. Or if you trade in Forex, even then
0:25 , by following this kind of procedure,
0:26 you can build an algo-trading platform
0:27 for yourself. So, in this video today,
0:29 I am going to show you its features.
0:30 You can build similar features like
0:31 these for yourself too. For example, on
0:33 the first login screen, you can log in
0:35 or register. I will log in and show you
0:37 what features it has. So, as soon as
0:38 you log in, first of all, you see a
0:40 trading terminal. You will see your own
0:42 trading terminal where you can paper
0:43 trade as well. You can also live trade.
0:45 Here you see an option that you can
0:46 toggle. Here you can manage your
0:49 portfolio. Here you can see the option
0:51 chain. But the most important thing, if
0:53 this is an algo-trading platform, how
0:54 can you build your own strategies in it
0:55 ? So, if I click on strategies here,
0:58 look, I have provided some strategies
1:00 built-in by default. Like Short
1:01 Strangle, Straddle, Iron Fly, Iron
1:03 Condor. So, you can directly click on
1:05 edit here and change its parameters,
1:07 such as what time to enter and what
1:09 time to exit. This kind of setup is
1:11 there by default. You can save this and
1:13 simply deploy it. You don't have to put
1:14 in any effort for this. But if you want
1:16 to build a specific strategy, then how
1:17 can you do that? That's very
1:19 interesting. If you look here, what is
1:20 written? Build your own strategy using
1:23 DIA. What is DIA? Just like FYERS named
1:25 their intelligent assistant FIA (Fyers
1:28 Intelligent Assistant), in the same way
1:30 , I have named the Delta Bot's
1:31 intelligent assistant DIA. This is a
1:33 name given by me. In this, if you open
1:36 DIA, you will see it looks like a
1:37 chatting platform, just like ChatGPT,
1:39 which you can chat with. So, in this
1:41 way, you can build things by chatting.
1:42 But the main thing is, to chat here,
1:44 you will need to connect it to any one
1:47 of your AI tools. Okay? By default, it
1:49 does not have any intelligence of its
1:51 own. You have to provide it with
1:52 intelligence. Whatever AI tool you use,
1:54 whether it's ChatGPT or Claude, see
1:56 what is written here: go to settings
1:58 and connect your AI tool first. So, if
2:00 you click here, the settings page will
2:02 open. If you look here, this settings
2:04 page will open up. What things are in
2:06 the settings here? First is the Delta
2:07 Exchange API key. The API key is very
2:09 important. It will connect Delta
2:11 Exchange to this terminal. So, you can
2:13 enter the API key. Here, for real
2:15 trades, you can change your password.
2:17 But the main thing is this. Here,
2:21 whether it is ChatGPT, if you have a
2:23 ChatGPT API key, or Claude, you can
2:25 connect all these things via API. And
2:28 you can also connect ChatGPT directly
2:30 by using 'Sign in with ChatGPT'. So,
2:33 you will click here on 'Sign in with
2:35 ChatGPT'. Then, you can simply connect
2:37 by signing in with your ChatGPT account
2:39 . Like, a code is visible here. This
2:41 code right here. Copy this. Copy code
2:45 here, and go to your ChatGPT account to
2:47 connect it. Continue, and paste that
2:53 code here. Continue. So now, what will
2:57 happen? Your DIA now has intelligence.
3:00 And now ChatGPT is the brain with which
3:02 you can build your strategies. You can
3:04 also select different ChatGPT models
3:06 here. Like ChatGPT Luna is selected
3:08 right now. 5.5 Tera or Luna, you can
3:10 select them here. And now when you go
3:13 to 'Strategy' here, 'Build Your Own
3:15 Strategy', or you can also go to 'DIA
3:17 AI Builder', just explain your strategy
3:20 in simple English in this chatting
3:22 interface. It will create that strategy
3:25 for you in the strategy section. Like
3:26 there are some strategies here right
3:28 now. Here, let's suppose I create a
3:31 strategy. Uh, let's suppose I ask it to
3:34 create a simple strategy. A Super Trend
3:36 strategy. Create a Super Trend-based
3:38 option buying strategy, which will buy
3:40 the at-the-money BTC USD weekly call
3:42 option when the 15-minute candle closes
3:44 above the Super Trend. And it should
3:47 buy the put option when the 15-minute
3:49 candle closes below the Super Trend
3:50 line. Let's give a stop loss of 10%and
3:53 a target of 30%. So, I gave it a prompt
3:56 for a simple strategy and sent it. So,
3:58 this will build the algo for the
4:00 strategy here for us. See, it has
4:02 created the strategy, and if you look
4:04 here, the description of the strategy
4:06 is provided. But what do we need to do
4:07 here? Save to My Strategies. If I click
4:10 on Save to My Strategies, this strategy
4:12 will be saved here in the My Strategies
4:14 section. In the Strategies section here
4:16 , you will see a new strategy. Look, it
4:18 is visible here as Super Trend. It is
4:21 written here: BTC Super Trend Weekly
4:23 Option Buyer Strategy. Now, if you look
4:25 here, it also says "Show Rules." What
4:27 the rules are. If you want, you can
4:29 also edit its configuration here. For
4:30 example, here the Super Trend default
4:32 is 10 ATR length and the Super Trend
4:34 multiplier is 3. So, if you want, you
4:35 can change that too. I want the Super
4:37 Trend ATR length to be 20. And let's
4:39 suppose the multiplier to be 2. So, I
4:41 can change its settings like this, and
4:42 if I want to adjust the stop loss, I
4:44 can do that too. I want the stop loss
4:46 to be 15%and the target to be, let's
4:48 suppose, 45%. So, I can change things
4:50 like this here and save it. It has been
4:52 saved. But if you want to see how this
4:54 strategy trades, we will have to deploy
4:56 it to check. So, you will click on
4:58 Deploy here. All these things are
5:01 written here. What are the things
5:02 included? Deploy it here. First, paper
5:04 trade it. Then, it will be real trading
5:06 . So, if you look down here, this
5:07 strategy has been deployed. And in the
5:09 status, it shows as running. So, this
5:11 strategy is running. You can pause it
5:13 here. Stop it, or perform a total exit.
5:15 If you click on this strategy, the
5:17 chart for the instrument related to
5:19 this strategy will open here. Its
5:21 indicator will be applied. Whatever
5:23 indicator you are using, whenever the
5:25 conditions related to it are satisfied,
5:27 the corresponding position will be
5:28 visible to you here in the order
5:30 section. For example, if I show you
5:32 another strategy, perhaps its
5:34 conditions are not being met right now.
5:36 Like this short straddle strategy. So,
5:38 in this short straddle, where the buy
5:40 is happening and where the sell is
5:41 happening, you can see on the live
5:43 chart that a call and put were sold
5:44 here, and a call and put were bought
5:46 here. So, all of this is visible to you
5:48 here on the chart. And along with the
5:50 chart, you will also see it below here.
5:51 If I scroll down, look here at which
5:54 positions are open. How many positions
5:57 have been closed. How your P&L curve is
5:59 performing for this strategy, and if
6:00 you want, you can also change the
6:02 settings from here. You can also change
6:05 the settings for this short straddle
6:06 from here and save them. So, all the
6:08 features that a full-fledged algo
6:09 trading platform has are definitely
6:11 included. Along with that, I have also
6:12 added a very good feature. I will tell
6:14 you about that feature. For instance,
6:15 if you want to see notifications for
6:17 the trades happening here. So, for
6:19 notifications, I have used a Telegram
6:22 bot here. You can connect your Telegram
6:24 here. You just need to provide the
6:26 bot's token ID here. Then, you will
6:28 receive all trade notifications on your
6:31 Telegram. Go to the Telegram bot
6:33 configuration here. You need to enter
6:36 the bot's token here and save it. Once
6:38 saved, you will not only get
6:40 notifications for your strategy. You
6:42 will also see that it will show you all
6:44 these things here. Start it. You can
6:47 ask it which positions are active.
6:50 Which orders have been placed, and what
6:51 the current P&L is. So, all these slash
6:53 commands will also work in it. And how
6:55 to create a bot? It is written here.
6:58 The instructions for it are provided.
6:59 How you need to do it. So, all these
7:00 things are here. If you want, you can
7:02 also make one for WhatsApp. But it is
7:03 comparatively easier to create one on
7:05 Telegram. And when you look at the
7:06 strategies, you will see all your
7:08 running strategies here. And look, in
7:09 the strategies section, you can see
7:11 your net PnL, what is unrealized? What
7:12 is realized? How much fee have you been
7:14 charged? How many orders were filled,
7:15 how many positions are closed, and what
7:17 is your strategy's win rate? All these
7:18 things are also visible to you here at
7:20 a glance. So, how do you build this? I
7:22 have written the detailed procedure for
7:24 it in a PDF here. It is a complete PDF
7:26 with a detailed guide on how you can
7:27 build it step-by-step. It's a full,
7:29 detailed guide. Which prompts you need
7:30 to provide, and what you need to do?
7:31 Everything is written in it in detail.
7:32 So, if you want this PDF, simply follow
7:34 me on Instagram and DM me. And I will
7:35 send you this PDF. Or subscribe to my
7:37 YouTube channel and check my
7:39 description or the pinned comment. I
7:40 will put the link to this PDF there as
7:42 well. Thank you so much. See you in the
7:43 next video.
