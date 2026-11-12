# Data outage

## How you notice
The header shows "Data blocked" or "Data stale". The Data health screen lists the dataset with its status. A report says slots were skipped for data.

## Safe first step
Nothing. A blocked dataset already stops its own slots from opening positions, and a stale one stops new orders until it is refreshed. Do not halt everything for one symbol.

## Steps
1. Read the reason: `npm run apex -- data health`. The warnings say which check failed (gaps, a bad bar, a split that was not adjusted, too old).
2. If it is only old, refresh: `npm run apex -- data pull`. This needs `MASSIVE_API_KEY`, which is a data key and cannot trade. The nightly workflow does this every night, and ends red at its last step when the pull was not complete or a bar is too old (`run-failed.md`).
3. If a check failed, compare with the second source named on the Data health screen, where one is configured.
4. Never fill a gap by hand and never edit a bar file. A corrected pull makes a new data version, and the ledger records it.
5. If a source is gone for good, the dataset stays blocked and its slots stay idle. Marking a dataset retired is not built yet.

## How to confirm
`npm run apex -- data health` shows the dataset as ok. The header's data mark is clear after the next run.

## What to write down
The new `data_version` entry is written by the pull (`npm run apex -- ledger tail --kind data_version`). Write an incident note only if a bad bar reached a result.
