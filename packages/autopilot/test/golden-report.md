# Apex daily report, 2021-01-01

Paper mode. Nothing here is proven or guaranteed.

## 1. Status

- Mode: paper. Run `golden` (tick) at commit `abcdef123456`.
- Halts: none.
- Data problems: none.
- Waiting on Jeremy or the validator: nothing.

## 2. Funnel

- Strategy and market pairs: 2. Evaluated this run: 2. New trials this run: 0.
- Trials ever (N): 2. Slots ever locked into paper (M): 1.
- Where the 2 trials stand: in paper 1, rejected 1.

## 3. Paper book

- Equity $12008.38 from a start of $10000.00 (+20.08%, forward, paper, 33 closed trades, costs assumed).
- Today $0.00, this week $0.00, drawdown from peak +0.00%, open risk $92.19.
- Benchmarks: the diversified core is not built yet (it needs the long daily history). No comparison is shown rather than a wrong one.

| Slot | Side | Qty | Entry | Stop | Risk |
|---|---|---|---|---|---|
| marker@csv:TEST:1d:raw | long | 0.424049 | 7075.55 | 6858.14 | $92.19 |

## 4. Slots

| Slot | Status | Weight | Forward months | Forward trades | Forward return | Deflated Sharpe (M / N) | Drift | Graduation |
|---|---|---|---|---|---|---|---|---|
| marker@csv:TEST:1d:raw | paper | 25% | 13.1 | 34 of 50 | +26.8% (n=34, forward) | 100% / 100% | CUSUM 0.00, 0 pauses | held_up: could pass in month 20 at the current pace |

## 5. New intents and blocks

- Intent: marker@csv:TEST:1d:raw long 0.721719 TEST, stop 3360.03, risk $75.00, signal bar 2019-12-10 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.72041 TEST, stop 3384.78, risk $75.42, signal bar 2019-12-22 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.695365 TEST, stop 3531.13, risk $75.94, signal bar 2020-01-03 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.672781 TEST, stop 3669.02, risk $76.34, signal bar 2020-01-15 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.656118 TEST, stop 3780.30, risk $76.71, signal bar 2020-01-27 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.659576 TEST, stop 3774.81, risk $77.00, signal bar 2020-02-08 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.657642 TEST, stop 3809.04, risk $77.47, signal bar 2020-02-20 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.646626 TEST, stop 3893.05, risk $77.86, signal bar 2020-03-03 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.619383 TEST, stop 4099.25, risk $78.53, signal bar 2020-03-15 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.605244 TEST, stop 4209.29, risk $78.79, signal bar 2020-03-27 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.585562 TEST, stop 4365.45, risk $79.06, signal bar 2020-04-08 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.569255 TEST, stop 4525.47, risk $79.67, signal bar 2020-04-20 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.566574 TEST, stop 4562.26, risk $79.94, signal bar 2020-05-02 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.54625 TEST, stop 4765.89, risk $80.52, signal bar 2020-05-14 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.538218 TEST, stop 4879.07, risk $81.22, signal bar 2020-05-26 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.536611 TEST, stop 4910.35, risk $81.49, signal bar 2020-06-07 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.530034 TEST, stop 5014.60, risk $82.20, signal bar 2020-06-19 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.523028 TEST, stop 5120.09, risk $82.82, signal bar 2020-07-01 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.519361 TEST, stop 5190.05, risk $83.37, signal bar 2020-07-13 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.540016 TEST, stop 5010.13, risk $83.68, signal bar 2020-07-25 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.516382 TEST, stop 5272.97, risk $84.21, signal bar 2020-08-06 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.50977 TEST, stop 5377.58, risk $84.78, signal bar 2020-08-18 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.502836 TEST, stop 5483.19, risk $85.27, signal bar 2020-08-30 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.501689 TEST, stop 5506.92, risk $85.45, signal bar 2020-09-11 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.483912 TEST, stop 5742.55, risk $85.94, signal bar 2020-09-23 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.477367 TEST, stop 5846.02, risk $86.31, signal bar 2020-10-05 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.476589 TEST, stop 5897.43, risk $86.93, signal bar 2020-10-17 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.464066 TEST, stop 6085.07, risk $87.34, signal bar 2020-10-29 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.455994 TEST, stop 6239.32, risk $87.99, signal bar 2020-11-10 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.44449 TEST, stop 6433.28, risk $88.44, signal bar 2020-11-22 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.43742 TEST, stop 6536.43, risk $88.43, signal bar 2020-12-04 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.437916 TEST, stop 6545.85, risk $88.66, signal bar 2020-12-16 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.42609 TEST, stop 6784.53, risk $89.41, signal bar 2020-12-28 00:00 UTC.
- Intent: marker@csv:TEST:1d:raw long 0.424049 TEST, stop 6858.14, risk $89.94, signal bar 2021-01-09 00:00 UTC.
- Fill: marker@csv:TEST:1d:raw entry 0.721719 at 3466.55 on 2019-12-11 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.721719 at 3550.29 on 2019-12-15 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.72041 at 3492.08 on 2019-12-23 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.72041 at 3596.44 on 2019-12-27 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.695365 at 3643.07 on 2020-01-04 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.695365 at 3727.69 on 2020-01-08 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.672781 at 3785.33 on 2020-01-16 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.672781 at 3865.78 on 2020-01-20 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.656118 at 3900.14 on 2020-01-28 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.656118 at 3967.41 on 2020-02-01 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.659576 at 3894.48 on 2020-02-09 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.659576 at 3997.44 on 2020-02-13 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.657642 at 3929.79 on 2020-02-21 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.657642 at 4015.28 on 2020-02-25 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.646626 at 4016.47 on 2020-03-04 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.646626 at 4162.74 on 2020-03-08 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.619383 at 4229.20 on 2020-03-16 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.619383 at 4295.25 on 2020-03-20 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.605244 at 4342.72 on 2020-03-28 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.605244 at 4410.07 on 2020-04-01 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.585562 at 4503.84 on 2020-04-09 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.585562 at 4653.14 on 2020-04-13 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.569255 at 4668.93 on 2020-04-21 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.569255 at 4741.45 on 2020-04-25 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.566574 at 4706.89 on 2020-05-03 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.566574 at 4851.19 on 2020-05-07 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.54625 at 4916.98 on 2020-05-15 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.54625 at 5097.87 on 2020-05-19 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.538218 at 5033.75 on 2020-05-27 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.538218 at 5112.38 on 2020-05-31 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.536611 at 5066.01 on 2020-06-08 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.536611 at 5252.82 on 2020-06-12 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.530034 at 5173.57 on 2020-06-20 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.530034 at 5339.99 on 2020-06-24 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.523028 at 5282.40 on 2020-07-02 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.523028 at 5431.55 on 2020-07-06 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.519361 at 5354.58 on 2020-07-14 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.519361 at 5445.12 on 2020-07-18 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.540016 at 5168.96 on 2020-07-26 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.540016 at 5311.66 on 2020-07-30 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.516382 at 5440.13 on 2020-08-07 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.516382 at 5598.59 on 2020-08-11 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.50977 at 5548.05 on 2020-08-19 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.50977 at 5687.24 on 2020-08-23 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.502836 at 5657.01 on 2020-08-31 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.502836 at 5714.48 on 2020-09-04 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.501689 at 5681.50 on 2020-09-12 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.501689 at 5825.53 on 2020-09-16 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.483912 at 5924.59 on 2020-09-24 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.483912 at 6037.17 on 2020-09-28 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.477367 at 6031.34 on 2020-10-06 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.477367 at 6215.99 on 2020-10-10 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.476589 at 6084.39 on 2020-10-18 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.476589 at 6211.11 on 2020-10-22 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.464066 at 6277.97 on 2020-10-30 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.464066 at 6479.26 on 2020-11-03 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.455994 at 6437.11 on 2020-11-11 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.455994 at 6580.71 on 2020-11-15 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.44449 at 6637.23 on 2020-11-23 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.44449 at 6647.11 on 2020-11-27 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.43742 at 6743.64 on 2020-12-05 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.43742 at 6826.67 on 2020-12-09 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.437916 at 6753.36 on 2020-12-17 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.437916 at 6995.84 on 2020-12-21 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.42609 at 6999.60 on 2020-12-29 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw time 0.42609 at 7181.86 on 2021-01-02 00:00 UTC (paper).
- Fill: marker@csv:TEST:1d:raw entry 0.424049 at 7075.55 on 2021-01-10 00:00 UTC (paper).

## 6. Closest near misses

In-sample results on past data. None of these is in paper.

| Strategy | Market | Checks | Trades | Return | Hold | Sharpe | Hold Sharpe | Fails |
|---|---|---|---|---|---|---|---|---|
| flip | TEST 1d | 4 of 7 | 159 | +14.9% | +7152.0% | 1.38 | 6.67 | 2 monkey test; 5 double costs; 7 beats hold on risk |

## 7. Research queue

No new items.

## 8. Where the data came from

| Dataset | Source | Second source | Bars | Last bar | Adjustment | Health |
|---|---|---|---|---|---|---|
| csv:TEST:1d:raw | csv | none | 2200 | 2021-01-12 00:00 UTC | raw | ok |

## 9. Costs

Cost model `54c66af099c2`: costs are assumed, not measured.

## 10. Ledger

Entries added this run: 141. Head: seq 123, hash `deadbeef`. Gate version `5fc1ec70c4da`.
