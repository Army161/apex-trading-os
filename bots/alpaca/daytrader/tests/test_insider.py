import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from insider import parse_form4, qualifies, plan, backtest_holds

XML = """<?xml version="1.0"?><ownershipDocument>
<issuer><issuerTradingSymbol>abcd</issuerTradingSymbol></issuer>
<reportingOwner><reportingOwnerId><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship><isDirector>0</isDirector><isOfficer>1</isOfficer><officerTitle>CEO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable>
<nonDerivativeTransaction><transactionDate><value>2026-11-04</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>12.5</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-04</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>5000</value></transactionShares><transactionPricePerShare><value>12.5</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-04</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>12.5</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
</nonDerivativeTable></ownershipDocument>"""


def test_parse_and_filter():
    tx = parse_form4(XML)
    assert len(tx) == 3 and tx[0]["ticker"] == "ABCD" and tx[0]["usd"] == 12500
    q = [t for t in tx if qualifies(t)]
    assert len(q) == 1 and q[0]["code"] == "P"          # the sale and the $1,250 buy are dropped


def test_plan_skips_weekend_and_holds_five_sessions():
    p = plan(parse_form4(XML)[0], "2026-11-06")          # a Friday
    assert p["enter_at"] == "2026-11-09 open" and p["exit_at"] == "2026-11-16 open" and p["mode"] == "paper"


def test_backtest_counts_fees_and_flags_small_samples():
    rows = [(f"2026-11-{d:02d}", 10.0 + d * 0.1, 10.0) for d in range(9, 20)]
    r = backtest_holds({"ABCD": rows}, [plan(parse_form4(XML)[0], "2026-11-06")], fee=0.001)
    assert r["trades"] == 1 and not r["enough"] and r["avg"] < (rows[5][1] / rows[0][1] - 1)
