<!-- source: project chat message cmsg_01UG5ujmQ3eWK7x4hDW3fVZ6Vk1Nr4gc78NQtEejvAh4xp | sent 2026-11-10T12:20:38Z | verbatim -->

How to Connect Claude to TradingView (Step-by-Step, No Coding Required)
Jul 2
By Mind Math Money | Last updated: July 2, 2026
You can connect Claude directly to TradingView using a free, open-source tool called the [TradingView MCP](https://github.com/tradesdontlie/tradingview-mcp). Once connected, Claude reads your live charts as actual price data, not screenshots. It can analyze market structure, find support and resistance levels, switch symbols and timeframes, and even help you backtest, all from a normal chat conversation.
The best part: you don't need to follow a long technical tutorial. In this guide, I give you a single copy-paste prompt that makes Claude itself walk you through the entire installation, step by step, fixing errors along the way. That is exactly how I set it up on my own computer.
Key Takeaways

* Claude connects to the TradingView desktop app through a free open-source bridge called the TradingView MCP, and reads real price data instead of screenshots
* Instead of following a manual tutorial, you paste one prompt into Claude and it guides you through the full installation interactively
* You need the TradingView desktop app (paid plan), the Claude desktop app, and Node.js, all of which the guided install covers
* Once connected, Claude can analyze market structure, read indicator values, switch charts, draw levels, and assist with backtesting
* This is an unofficial community tool. It reads and controls your own charts locally and cannot place real trades

What This Connection Actually Does
The TradingView MCP is an open-source bridge that connects the Claude desktop app to the TradingView desktop app running on your computer. Everything happens locally on your machine.
Once it's running, you can ask Claude things like:

* "What symbol and timeframe do I have open right now?"
* "Analyze the market structure on this chart"
* "What are the most important support and resistance levels, and why?"
* "Switch to BTCUSD on the 4-hour and add the RSI"
* "Give me the OHLC values of the last 50 candles"
* "Draw a horizontal line at the swing high"

The key difference from uploading chart screenshots: Claude reads the actual numbers. Open, high, low, close, volume, indicator values. No misread price levels, no guessing from pixels. When I asked Claude to find support and resistance on my Gold chart, it pulled 180 daily candles of real data and based every level on actual swing points and volume.
One important limitation to be clear about: this connection reads and controls charts. It does not place real trades, and I would not want it to. Analysis is the job here.
What You Need Before Starting
Three things, and the guided install checks all of them for you:

* The TradingView desktop app. The browser version does not work for this. You also need a paid TradingView plan (any tier works, including the cheapest one). If you don't have TradingView yet, you get a bonus and 30 days of free Premium [through my link](https://www.tradingview.com/pricing/?aff_id=25412), then download the desktop app from the TradingView desktop page.
* The Claude desktop app. The browser version of Claude does not support local connections. Download the desktop app for Windows or Mac from the [official Claude download page](https://claude.ai/download).
* [Node.js](https://nodejs.org/). A free program that runs the bridge in the background. The guided install tells you exactly how to get it.

Total time: around 15 to 30 minutes, mostly waiting for downloads.
Important: Read This Before You Start
This exact process worked on my machine, and the prompt below includes fixes for every problem I personally ran into. But AI language models can make mistakes. Never run a command or take an action you are not certain about. If Claude ever suggests something that looks wrong, deletes files, or touches anything unrelated to this setup, stop and ask it to explain first. You are always the one in control.
Also worth knowing: the TradingView MCP is an independent open-source project. It is not made by TradingView or Anthropic, and a future TradingView update could temporarily break it until the community patches it. It reads your own charts on your own computer for personal use.
How the Setup Works (The Simple Version)
Understanding the four pieces makes the whole install make sense:

1. Node.js is the engine. It runs the bridge program in the background.
2. The TradingView MCP is the bridge. A small program that translates between Claude and TradingView.
3. TradingView in debug mode is the open door. You launch TradingView with one extra instruction that lets the bridge talk to it. TradingView looks and works completely normally.
4. One line in Claude's settings file tells Claude the bridge exists.

That's the entire architecture. Engine, bridge, open door, and a note telling Claude where the door is.
The Install: Let Claude Guide You
Instead of twenty manual steps, there is exactly one thing to do in this section: copy the prompt in the box below and paste it into a new conversation in the Claude desktop app. Claude will check your system, give you one step at a time, wait for you to confirm, and diagnose any error you paste back. It knows the common failure points because I hit most of them myself.
📋 The Install Prompt
Copy this entire prompt and paste it into a new conversation in the Claude desktop app
Copy Prompt

```
I want you to guide me through connecting Claude to my TradingView Desktop app using the open-source TradingView MCP from https://github.com/tradesdontlie/tradingview-mcp so Claude can read and analyze my live charts.

I may not be technical at all. Follow these rules strictly:

RULES
1. Guide me ONE step at a time. Give me a single step, then wait for me to confirm it worked before giving the next one.
2. Never assume a step succeeded. After every step, ask me what I see. If I paste an error, diagnose it before moving on.
3. Use plain language. Explain briefly what each step does and why, in one or two sentences, like you are teaching a beginner.
4. If a command fails, ask me to paste the exact error message. Do not guess blindly.
5. Commands must be given one per message block so I can copy them one at a time. Never combine two commands on one line.

WHAT WE ARE BUILDING (explain this to me first in simple terms)
Four pieces: Node.js (the engine that runs the connector), the TradingView MCP (the bridge), TradingView Desktop launched with a debug flag (the open door), and one line in Claude's settings file (telling Claude the bridge exists).

STEPS TO GUIDE ME THROUGH
Step 0. Ask me: (a) Windows or Mac? (b) Do I have the TradingView DESKTOP APP installed, or do I use TradingView in the browser? The browser version does NOT work. If I only use the browser, first send me to https://www.tradingview.com/desktop/ to install the desktop app and sign in. Note: a paid TradingView plan is required. (c) Confirm I am using the Claude DESKTOP app, not claude.ai in a browser, since local connections only work in the desktop app.

Step 1. Check if Node.js is installed: have me run "node -v" in Command Prompt (Windows) or Terminal (Mac). If not recognized, send me to https://nodejs.org to install the LTS version with default options, then have me CLOSE and REOPEN the terminal before checking again (the old terminal window will not see the new install).

Step 2. Have me download the ZIP from https://github.com/tradesdontlie/tradingview-mcp (green Code button, Download ZIP) and extract it. IMPORTANT known gotcha: the ZIP often extracts as a folder inside a folder (tradingview-mcp-main inside tradingview-mcp-main). Have me confirm the folder that directly contains package.json and a src folder, and have me tell you the full path to that folder. Use that exact path for everything that follows.

Step 3. Have me open a terminal, cd into that folder, and run "npm install" (two separate commands, one at a time). Tell me that npm warnings about vulnerabilities are normal and safe to ignore, and that I should NOT run npm audit fix.

Step 4. Launch TradingView with the debug port. Have me fully close TradingView first (including the system tray on Windows or the dock on Mac).
- Windows: try "%LOCALAPPDATA%\TradingView\TradingView.exe" --remote-debugging-port=9222
- If path not found on Windows, TradingView is often installed as a Microsoft Store package. Have me run: powershell -c "Get-AppxPackage *trading* | Select-Object Name, InstallLocation" and build the launch command from the InstallLocation result: "<InstallLocation>\TradingView.exe" --remote-debugging-port=9222
- Mac: open -a TradingView --args --remote-debugging-port=9222
Once TradingView opens, have me sign in and open a real chart (not the welcome tab). Explain that from now on TradingView must always be started this way for Claude to see it, and offer to create a small launcher script (.bat on Windows) so I can start it with a double click. On Windows the launcher should look up the install location dynamically with Get-AppxPackage so TradingView updates do not break it.

Step 5. Connect Claude. Have me open Claude Desktop, go to Settings, then Developer, then Edit Config. This opens a file called claude_desktop_config.json. CRITICAL: if the file already has content, do NOT let me replace it. Have me paste the entire current contents of the file to you, and you produce the merged version with an "mcpServers" section added containing:
"tradingview": { "command": "node", "args": ["<full path to the folder from Step 2>/src/server.js"] }
On Windows the path in JSON needs double backslashes (C:\\Users\\...). Editing with Notepad or any plain text editor is fine.

Step 6. Restart Claude COMPLETELY. On Windows: right-click the Claude icon in the system tray (bottom right, behind the ^ arrow) and choose Quit. Closing the window is NOT enough. Then reopen Claude and check Settings, then Developer: a server called "tradingview" should now be listed. If it says "No servers added", the app was not fully quit; have me check Task Manager for leftover Claude processes.

Step 7. Verify. Have me start a NEW conversation (existing chats do not pick up new tools) and ask: "Run tv_health_check and tell me if TradingView is connected." Success looks like cdp_connected: true and api_available: true. Then celebrate by having Claude read my current chart symbol and price.

KNOWN FIXES
- "npm is not recognized": Node not installed, or terminal opened before Node was installed. Install Node, then open a NEW terminal.
- "Could not read package.json": wrong folder, usually the nested ZIP folder issue from Step 2.
- "The system cannot find the path specified" when launching TradingView: use the PowerShell Get-AppxPackage method from Step 4.
- tradingview server not showing in Claude settings: Claude was not fully quit (system tray), or a typo in the JSON. Ask me to paste the config file and check it.
- tv_health_check fails: TradingView is not running, was started the normal way instead of with the debug command, or no chart tab is open.

Start now with Step 0.
```

This process worked on my machine. AI models can make mistakes: never run a command or take an action you are not certain about.
That's it. Claude takes it from there. On my machine the whole process took about 25 minutes, including the problems.
What to Ask Once You're Connected
The moment the health check comes back green, try these to see what the connection can do:

1. "What chart am I looking at right now?" Claude reads the symbol, timeframe, and any indicators you have on.
2. "What are the most important support and resistance levels on this chart, and why?" Claude pulls the raw candle data and reasons from actual swing highs, swing lows, and volume.
3. "Analyze the market structure. Are we in an uptrend, downtrend, or range?" If you've watched my market structure course, you'll recognize the concepts. Now you can watch an AI apply them to live data and check its work.

That last part matters. Your own technical analysis knowledge is what lets you verify what the AI tells you. AI is the assistant. You are still the analyst.
If you want the foundations first, my [full library of free trading courses](https://www.youtube.com/playlist?list=PLqJjKuP8g79xgdI8SvWfe7LndcqKE_yUC) covers market structure, [Smart Money Concepts](https://youtu.be/mRuohN6NzBA), Fibonacci, and more. And if you want more AI trading workflows like this one, my [free weekly newsletter](https://www.mindmathmoney.com/) is where I share them first.
Frequently Asked Questions
Is it safe to connect Claude to TradingView?
The bridge runs entirely on your own computer and talks only to your own TradingView app. Your TradingView login details are never shared with Claude or Anthropic. Anything you ask Claude to analyze is processed like a normal Claude conversation. The tool cannot access your broker or place real trades.
Does this work with the free version of TradingView or Claude?
You need the TradingView desktop app with a paid plan (the cheapest tier works). On the Claude side you need the free desktop app; the connection works on Claude's free tier, though heavier use benefits from a paid plan.
Does it work on both Windows and Mac?
Yes. The bridge supports Windows, Mac, and Linux. The guided prompt above handles the differences automatically, including the Microsoft Store version of TradingView on Windows, which is installed in a hidden folder that trips up most manual tutorials.
Can Claude place trades through this connection?
No. The connection reads chart data and controls the chart view (symbols, timeframes, indicators, drawings). It has no access to your broker or any order execution. In my opinion that is the right boundary: use AI for analysis, keep execution in your own hands.
What happens when TradingView updates?
Two things. First, your launch shortcut can break if it contains a version number, which is why the guided install creates a launcher that finds TradingView automatically. Second, in rare cases a TradingView update can temporarily break the bridge itself, since it uses TradingView's internal interface. If that happens, download the newest version of the bridge from the GitHub page and run the install prompt again.
Why does TradingView need to be started in "debug mode"?
Debug mode just means TradingView starts with one extra instruction that opens a local connection point on your computer. That connection point is how the bridge reads your charts. TradingView looks and behaves completely normally. If you start TradingView the regular way, Claude simply cannot see it until you relaunch it the debug way.

[Affiliate disclosure] This article contains affiliate links. Mind Math Money only recommends tools personally used and trusted.
[Financial disclaimer] This is educational content, not financial advice. Markets involve risk. Do your own research before making investment decisions.
A note on AI tools: this process worked on my machine, and the guided prompt includes fixes for every issue I personally encountered. AI language models can still make mistakes. Never run a command or take an action you are not certain about, and stay in control of every step.
Mind Math Money is an independent trading and markets educator.
[connect claude to tradingview](https://www.mindmathmoney.com/articles/tag/connect%20claude%20to%20tradingview)[tradingview mcp](https://www.mindmathmoney.com/articles/tag/tradingview%20mcp)[ai trading](https://www.mindmathmoney.com/articles/tag/ai%20trading)[claude ai trading](https://www.mindmathmoney.com/articles/tag/claude%20ai%20trading)[ai chart analysis](https://www.mindmathmoney.com/articles/tag/ai%20chart%20analysis)[tradingview ai](https://www.mindmathmoney.com/articles/tag/tradingview%20ai)[ai trading assistant](https://www.mindmathmoney.com/articles/tag/ai%20trading%20assistant)
