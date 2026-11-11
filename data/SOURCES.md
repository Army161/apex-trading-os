# Data sources and their terms

This file is the gate from `docs/design/03-data.md` section 3. An adapter refuses to fetch from a source that has no entry
here with a `Terms checked:` date, or whose status is `not accepted`. Jeremy accepts terms; an agent never does it for him.

## csv
Committed fixtures under `data/`, pulled earlier through the Massive connector for personal research. Used by tests and CI only.
- Terms checked: 2026-11-10
- Status: in use (fixtures)

## massive
Massive (formerly Polygon.io) aggregates, on Jeremy's existing plan. The plan limits history to two years, not the number of symbols.
- Terms checked: 2026-11-10 (Jeremy's existing subscription, recorded from the approved plan; the build did not re-read the terms)
- Status: in use for personal research. Not licensed for the product (see `docs/design/12-saas-product.md` section 8).

## alpaca
Alpaca market data, free IEX feed, with paper keys. Second source for the validator and the firewall.
- Status: not accepted yet. Jeremy needs to confirm he has read the current market data terms, then replace this line with `Terms checked: <date>`.

## tiingo
Long daily history. Not used.
- Status: not accepted yet. Open item for Jeremy (`docs/design/14-build-plan.md` section 4).
