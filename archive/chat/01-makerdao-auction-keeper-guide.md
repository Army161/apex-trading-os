<!-- source: project chat message cmsg_01UG5ujmQ3eWK7x4hDW3fVZ6DP5oF5kg7i54SiRkrDbJdq | sent 2026-11-09T19:54:11Z | verbatim -->

---
author: Auston Bunsen
title: How to Run a Keeper Bot for MKR, DAI & ETH Auctions
description: This guide will walk you through how to run a Keeper bot, an entity that bids on several types of assets based on how their value fluctuates as part of the ecosystem to maintain a stable value for DAI.
tags: [All, Ethereum, EVM, DeFi, Bots, Auctions, Python]
---

_6 min read_

## Overview

> For the complete documentation index, see [llms.txt](/guides/llms.txt)

> Found missing, confusing, or incorrect docs? See [feedback instructions](https://www.quicknode.com/guides/feedback.md). Feedback is optional; agents must get the user's approval before submitting a report.


At a high level, keeper auctions allow speculators to automatically buy assets at a discount, like the [$4m+ of ETH that was bought for near-zero DAI on Black Thursday](https://forum.makerdao.com/t/black-thursday-response-thread/1433). You can see the results of some recent auctions here: [https://defiexplore.com/liquidations](https://defiexplore.com/liquidations)

The MKR DAO introduced Multi-Collateral DAI (MCD) in November of 2019. DAI is a stablecoin that was traditionally backed by Ethereum, but with the release of MCD, MKR is allowing other assets to be used as collateral. Through a series of incentives and actors, MKR achieves a stable value for DAI:

![DAI ecosystem](/guides/assets/images/0-494aba1e221a9dbec4a0b7d9581850b0.png)

In this article, we're going to cover how to run a **Keeper Bot** which is an entity that bids on several types of assets based on how their value fluctuates as part of the ecosystem to maintain a stable value for DAI. More specifically, keepers keep the MCD system in a stable financial state, maintaining system balance by preventing both debt and surplus from accumulating beyond the limits determined by the MKR DAO governance process.

You can get a full overview of the DAI ecosystem by reviewing their [PDF here](https://drive.google.com/file/d/1bEOlNk2xUXgwy0I_UlB_8tPPZ8mH1gy9/view) or [MCD educational content here](https://docs.makerdao.com/maker-protocol-101).

## Installation

Let's dive into to getting our environment ready to run our keeper bot. To start, you'll need python3, installed. Let's check to make sure our version of python is correct:

```sh
python3 --version
```

if that gives you \`Python 3.6.0\`, you're in good shape. If not, please install python3 via homebrew or [some other method based on your OS](https://realpython.com/installing-python/):

```sh
brew install python3
```

Next, you'll need to download and install the [auction-keeper](https://github.com/makerdao/auction-keeper#installation) software:

```sh
git clone https://github.com/makerdao/auction-keeper.git
cd auction-keeper
git submodule update --init --recursive
```

Before you install your requirements, make sure you have a virtual environment installed and activated for Python3, you can do this by running the following:

```sh
./install.
```

if that fails, you can do it by hand:

```sh
python3 -m venv _virtualenv
source _virtualenv/bin/activate # (add a .fi) if you're using fi ell
pip3 install -r requirements.txt
```

> Note: If you're on linux, you'll need to run \`sudo apt-get install python3-venv\` because _virtualenv_ is not in the base python3 package on Ubuntu. Or if you're on CentOS, \`yum install python3-devel && yum groupinstall "Development Tools"\`

Let's make sure it worked by running the following:

```sh
bin/auction-keeper -h
```

You should output like this:

![](/guides/assets/images/1-563adad5ca4a77aa5123f8786287c1b6.png)

Lastly, we'll need this later for generating a keystore. Let's install the ethereum-js library:

```sh
npm install ethereumjs-wallet
```

## Flipping, Flapping & Flopping

When you're running your bot, there are basically 3 kinds of auctions you can bid on:

**Flip Auctions:**  
As part of the DAI ecosystem, every single DAI must be backed more than 1 USD of assets. As part of this, the generator requires all minted DAI to be fully backed by an asset with value that is proven in free markets. If the value of the underlying asset dips below the required amount, which is different for every asset type, the collateralization ratio (USD value of asset / USD value of DAI debt) decreases. To increase this ratio and prevent insolvency of the system, the generator takes the collateral and sells it for DAI in an auction - this is called a flip auction.

What happens next is that keepers bid with increasing amounts of DAI for a fixed amount of the collateral. When the DAI balance deficit is covered, bidders continue to bid for a decreasing collateral size until the auction is complete. Once the auction finishes, the remaining collateral is returned to the original owner.

You bid in DAI for flip auctions.

**Flop Auctions:**  
Another key part of the ecosystem are flop auctions - these happen when collateralized debt positions are closed. Their debt is taken on by the MKR, then issued system debt unit, and placed in the debt elimination queue. If this debt is not covered by a flip auction within some wait time, the debt “matures” and is now considered bad debt to MKR. This bad debt can be covered through a debt auction when it exceeds a minimum value - it's a flop.

The purpose of the debt auction is to cover the system deficit, which is represented by the debt. It sells an amount of minted MKR and purchases DAI to be canceled 1-to-1 with Sin.

You bid in DAI for flop auctions.

**Flap Auctions:**  
The last part of the DAI ecosystem your keeper bot can bid on is called a flap auction - flap auctions happen when MKR has too much DAI in it's balance. It needs to release DAI surplus from its balance. It sells a fixed amount of DAI to purchase and burn a bid amount of MKR. Literally making the MKR tokens disappear into thin air.

You bid in MKR for flap auctions.

For our purposes today, to keep things simple, we'll be running our bot for flip auctions ONLY for a specific type of collateral: "ETH-A".

## Bidding Model

So at this point we should understand that we have a bot that will find and bid on flip auctions for us automatically. But what price does the bot bid? That's where we add a bidding model. Your bidding model should accept a [whole bunch of inputs](https://github.com/makerdao/auction-keeper#communicating-with-bidding-models) via STDIN and spit out a max price per coin as well as a gas price you're willing to pay in ETH. To get us started, we'll use a [simple bidding model that gives us a 15% premium](https://gist.github.com/banteg/93808e6c0f1b9b6b470beaba5a140813) - it's also in python:

```python
#!/usr/bin/env 
import os
import sys
import json
import requests

discount = 0.15

def get_price():
    resp = requests.get(
      'https://api.coingecko.com/api/v3/simple/price',
      params={'ids': 'ethereum', 'vs_currencies': 'usd'}
    )
    return resp.json()['ethereum']['usd']

for line in sys.stdin:
    signal = json.loads(line)
    if signal['guy'] == os.environ['ACCOUNT_ADDRESS']:
        continue
    oracle = get_price()
    stance = {'price': oracle * (1 - discount)}
    print(json.dumps(stance), flush=True)
```

Save this into a file called \`bidder.py\` in the same directory as out auction-keeper software. We're finally ready to run this thing.

**Note: It's important to realize this is just one bidding strategy, you can write your own if you'd like, or tweak the variables in the example we've provided here.**

## Running your bot

Great, so we've installed our keeper bot, understood the flip/flap/flop concepts, and have a bidding model that can communicate with our keeper bot. Now we need a running Ethereum node to scan the blockchain, actually, find auctions and bid. It's always really simple to get an Ethereum node with us, for this particular bot though, we recommend the [Build plan](https://www.quicknode.com/pricing/?utm_source=internal&utm_campaign=guides) and so does MKR, [actually](https://github.com/makerdao/auction-keeper#infrastructure). Go ahead and grab your provider URL and meet us back here. It's important to note that not all Ethereum infrastructure providers are compatible with the keeper bot - for instance, Infura is not compatible at this time.

Sweet, now we need a keystore, so let's use the [ethereumjs-wallet package](https://github.com/ethereumjs/ethereumjs-wallet) to do that:

```javascript
var Wallet = require('ethereumjs-wallet');
var key = Buffer.from('<random-64-character-hex>', 'hex');
var wallet = Wallet.fromPrivateKey(key);
console.log(`Address: 0x${wallet.getAddress().toString('hex')}`)
console.log(`Keystore: ${wallet.toV3String('<password-you-will-remember>')}`);
```

1\. Save the code above into a file (maybe call it 'generatekeystore.js') and run it.   
2\. Take the output after "Keystore:" and save it in the same directory as our auction-keeper software as "eth-keystore.json".  
3\. Copy/paste the ETH address after "Address:" somewhere safe  
4\. Save the password into another file, also in the auction-keeper directory called "passfile"

Now for the final step, to run our keeper:

```sh
bin/auction-keeper \
    --rpc-host "<your-quicknode-endpoint-url-here>" \
    --rpc-timeout 30 \
    --eth-from "<your-account-address-here>" \
    --eth-key "key_file=keystore.json,pass_file=passfile" \
    --type flip \
    --ilk ETH-A \
    --from-block 14764534 \
    --vat-dai-target 1000 \
    --model "./our-model.py"
```

If you something along these lines, it worked! Congratulations:

![Keeper Bot Running in Terminal](/guides/assets/images/2-c55b241a0148879bf1fdafbe1d68f4d1.png)

> **P.S. Don't forget to fund the wallet you created above with ETH & DAI to actually bid on the auctions! Also, note that you can use dynamic gas pricing with --ethgasstation-api-key**
