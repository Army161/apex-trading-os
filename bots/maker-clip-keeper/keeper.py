"""Apex Clip Keeper: the MakerDAO keeper guide (archive/chat/01) modernised.

The guide targets `auction-keeper --type flip`, but flip auctions were retired by Liquidations 2.0 (2021).
Today the Maker / Sky protocol liquidates through:
  * Dog.bark(ilk, urn, kpr)  - starts a Dutch auction on an unsafe vault; the keeper earns tip + chip*tab in DAI.
  * Clipper.take(id, amt, max, who, data) - buys collateral from a running auction at the current falling price.
  * Clipper.redo(id, kpr)    - restarts a stale auction (also pays the incentive).
This keeper WATCHES every Clipper in the Chainlog, prices each auction against the market, and logs when
take() would be profitable after gas. Default mode is watch-only: it never sends a transaction.
LIVE mode (--live) additionally needs ETH_RPC_URL, KEEPER_PRIVATE_KEY in env and DAI already joined to the Vat
(vat.hope(clipper) done once). Profit is never guaranteed: competition from MEV searchers is intense.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request

from web3 import Web3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "engine"))
try:
    from apex_engine.reporter import Reporter
except Exception:  # noqa: BLE001
    Reporter = None

CHAINLOG = "0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F"
RAY, WAD, RAD = 10**27, 10**18, 10**45
ABI = {
    "chainlog": [{"name": "getAddress", "inputs": [{"type": "bytes32"}], "outputs": [{"type": "address"}], "stateMutability": "view", "type": "function"},
                 {"name": "list", "inputs": [], "outputs": [{"type": "bytes32[]"}], "stateMutability": "view", "type": "function"}],
    "clip": [{"name": "list", "inputs": [], "outputs": [{"type": "uint256[]"}], "stateMutability": "view", "type": "function"},
             {"name": "getStatus", "inputs": [{"type": "uint256"}], "outputs": [{"name": "needsRedo", "type": "bool"}, {"name": "price", "type": "uint256"}, {"name": "lot", "type": "uint256"}, {"name": "tab", "type": "uint256"}], "stateMutability": "view", "type": "function"},
             {"name": "ilk", "inputs": [], "outputs": [{"type": "bytes32"}], "stateMutability": "view", "type": "function"},
             {"name": "tip", "inputs": [], "outputs": [{"type": "uint192"}], "stateMutability": "view", "type": "function"},
             {"name": "chip", "inputs": [], "outputs": [{"type": "uint64"}], "stateMutability": "view", "type": "function"},
             {"name": "take", "inputs": [{"type": "uint256"}, {"type": "uint256"}, {"type": "uint256"}, {"type": "address"}, {"type": "bytes"}], "outputs": [], "stateMutability": "nonpayable", "type": "function"},
             {"name": "redo", "inputs": [{"type": "uint256"}, {"type": "address"}], "outputs": [], "stateMutability": "nonpayable", "type": "function"}],
    "vat": [{"name": "dai", "inputs": [{"type": "address"}], "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"}],
}
# Collateral -> CoinGecko id for an independent market price (the auction price comes from the protocol's own oracle).
CG = {"ETH": "ethereum", "WSTETH": "wrapped-steth", "WBTC": "wrapped-bitcoin", "RETH": "rocket-pool-eth", "LINK": "chainlink", "UNI": "uniswap"}


def market_prices():
    url = "https://api.coingecko.com/api/v3/simple/price?ids=" + ",".join(CG.values()) + "&vs_currencies=usd"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "apex-keeper"}), timeout=15) as r:
        j = json.loads(r.read())
    return {k: j.get(v, {}).get("usd") for k, v in CG.items()}


def b32(s: str) -> bytes:
    return s.encode().ljust(32, b"\0")


class ClipKeeper:
    def __init__(self, w3: Web3, live: bool, min_profit_usd: float, gas_take: int = 450_000):
        self.w3, self.live, self.min_profit, self.gas_take = w3, live, min_profit_usd, gas_take
        self.log = w3.eth.contract(CHAINLOG, abi=ABI["chainlog"])
        self.vat = w3.eth.contract(self.log.functions.getAddress(b32("MCD_VAT")).call(), abi=ABI["vat"])
        keys = [k.rstrip(b"\0").decode() for k in self.log.functions.list().call()]
        self.clips = {k.replace("MCD_CLIP_", ""): w3.eth.contract(self.log.functions.getAddress(b32(k)).call(), abi=ABI["clip"])
                      for k in keys if k.startswith("MCD_CLIP_") and not k.startswith("MCD_CLIP_CALC")}
        self.acct = w3.eth.account.from_key(os.environ["KEEPER_PRIVATE_KEY"]) if live else None
        self.rep = Reporter("maker-clip-keeper", "keeper", "Maker/Sky Clip Keeper", "live" if live else "watch") if Reporter else None

    def scan(self) -> list[dict]:
        mk = market_prices()
        gas_price = self.w3.eth.gas_price
        eth = mk.get("ETH") or 0
        gas_usd = self.gas_take * gas_price / 1e18 * eth
        opps = []
        for ilk, clip in self.clips.items():
            try:
                ids = clip.functions.list().call()
            except Exception:  # noqa: BLE001
                continue
            for aid in ids:
                needs_redo, price, lot, tab = clip.functions.getStatus(aid).call()
                sym = ilk.split("-")[0]
                mkt = mk.get(sym)
                auction_px = price / RAY
                lot_amt = lot / WAD
                debt = tab / RAD
                row = {"ilk": ilk, "id": aid, "auction_price": auction_px, "lot": lot_amt, "tab_dai": debt,
                       "market_price": mkt, "needs_redo": needs_redo, "gas_usd": round(gas_usd, 2)}
                if needs_redo:
                    tip, chip = clip.functions.tip().call() / RAD, clip.functions.chip().call() / WAD
                    row["redo_incentive_dai"] = tip + chip * debt
                    row["action"] = "redo" if row["redo_incentive_dai"] > gas_usd + self.min_profit else "watch"
                elif mkt:
                    buy_amt = min(lot_amt, debt / auction_px) if auction_px else 0
                    edge = (mkt - auction_px) * buy_amt
                    row.update({"discount": round(1 - auction_px / mkt, 4), "est_profit_usd": round(edge - gas_usd, 2)})
                    row["action"] = "take" if edge - gas_usd > self.min_profit else "watch"
                opps.append(row)
        return opps

    def act(self, row: dict):
        if not self.live or row.get("action") not in ("take", "redo"):
            return None
        clip = self.clips[row["ilk"]]
        me = self.acct.address
        if row["action"] == "redo":
            fn = clip.functions.redo(row["id"], me)
        else:
            vat_dai = self.vat.functions.dai(me).call() / RAD
            amt = min(row["lot"], vat_dai / row["auction_price"]) if row["auction_price"] else 0
            if amt <= 0:
                return "no DAI in Vat: join DAI and vat.hope(clipper) first"
            max_px = int(row["auction_price"] * 1.001 * RAY)
            fn = clip.functions.take(row["id"], int(amt * WAD), max_px, me, b"")
        tx = fn.build_transaction({"from": me, "nonce": self.w3.eth.get_transaction_count(me), "gas": self.gas_take,
                                   "maxFeePerGas": int(self.w3.eth.gas_price * 1.5), "maxPriorityFeePerGas": self.w3.to_wei(1, "gwei")})
        signed = self.acct.sign_transaction(tx)
        return self.w3.eth.send_raw_transaction(signed.raw_transaction).hex()

    def run(self, every: int):
        while True:
            try:
                opps = self.scan()
                for r in opps:
                    r["tx"] = self.act(r)
                    if self.rep and r.get("action") != "watch":
                        self.rep.event("opportunity", json.dumps(r))
                if self.rep:
                    self.rep.heartbeat({"auctions": len(opps), "actionable": sum(r.get("action") != "watch" for r in opps),
                                        "clippers": len(self.clips), "top": sorted(opps, key=lambda r: -(r.get("est_profit_usd") or -1e9))[:5]})
                print(json.dumps({"t": time.time(), "auctions": len(opps), "opps": [r for r in opps if r.get("action") != "watch"]}, default=str))
            except Exception as e:  # noqa: BLE001
                print("scan error:", e)
            time.sleep(every)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--live", action="store_true", help="send take/redo transactions (default: watch only)")
    p.add_argument("--min-profit", type=float, default=25.0)
    p.add_argument("--every", type=int, default=15)
    a = p.parse_args()
    w3 = Web3(Web3.HTTPProvider(os.environ.get("ETH_RPC_URL", "https://ethereum-rpc.publicnode.com"), request_kwargs={"timeout": 30}))
    if a.live and os.environ.get("APEX_ALLOW_LIVE") != "yes":
        sys.exit("refusing --live without APEX_ALLOW_LIVE=yes in env (deliberate second switch)")
    k = ClipKeeper(w3, a.live, a.min_profit)
    print(f"watching {len(k.clips)} clippers: {', '.join(sorted(k.clips))}")
    k.run(a.every)


if __name__ == "__main__":
    main()
