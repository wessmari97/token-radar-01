# Token Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/wessmari97/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/wessmari97/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: a web dashboard ranking token-less DeFi protocols by implied value, with a detail view and a farm plan for every protocol. Built for the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01) on make.fun.

[Join make.fun with my referral link](https://make.fun/r/jrnh2cfm?ref=jrnh2cfm)

## What it does

`main.ts` reads the sealed DeFiLlama snapshot (758 protocols, 40 on the watchlist), scores every pre-token protocol with the **radar-2** model, and writes a ranked board of 200 rows: the 40 watchlist protocols plus the 160 pre-token protocols below the watchlist floor with the highest implied value. It also writes the static dashboard, three screenshots, and the dossier the judge reads.

## The model

Implied value follows only from the snapshot's own figures — TVL, seven-day growth, age with no token, and chain count. No protocol name is ever special-cased.

- **Size:** `clamp((tvl_usd / $1B) ^ -0.15, 0.5, 2.0)` — diminishing returns on TVL, so the board is a ranking, not a TVL list. A protocol ten times smaller scores ~1.4x its TVL share; one ten times larger scores ~0.7x.
- **Growth:** `1 + clamp(change_7d, -60, 120) / 100 x 1.2` — momentum matters. Up 11% in a week scores 1.13x; down 28% scores 0.66x.
- **Maturity:** `0.7 + min(age_days, 1460) / 1460 x 0.5` — a premium for having run up to four years with no token (unknown age: 365 days).
- **Chains:** `1 + min(chains - 1, 10) x 0.02` — wider reach, up to 1.18x.
- **Implied value:** `round(tvl_usd x 0.25 x size x growth x maturity x chains)`.

The board is not a TVL sort: the top 50 mixes 12 early rows among the watchlist, and 91 of the 160 early rows would not have made a TVL top-160 cut at all.

## The dashboard

A static page (`dashboard/`, no network, no framework) that reads `data.js`:

- A sortable board table (rank, name, TVL, 7d change, age, implied value) with an implied-value bar per row.
- Filters by category and by chain, plus a text search, all kept in the URL hash.
- A detail view per protocol (click a row): the implied-value breakdown — TVL, growth, age, chains, and all four multipliers — with the page recomputing the row and confirming it matches `board.json`.
- A farm plan per protocol: six steps, each with a concrete action, a cost in dollars, and a time. Two steps are category-specific (lending, DEX, bridge, staking, perps, curators, stablecoins, RWA, insurance, and more); capital tiers are $50/$100/$150/$250 by TVL and the hold is 30/45/60 days by age.
- A separate Live token view: the 24 protocols that already trade, shown with their market caps and set aside from the pre-token ranking.

## Screenshots

`screenshots/` holds three views of the dashboard, re-rendered from this code (1440x900 each):

1. `1-board.png` — the board: 200 rows, strongest implied value first.
2. `2-detail.png` — the detail view for the top row (Steakhouse Financial): the implied-value breakdown and its six-step farm plan.
3. `3-filtered.png` — the board filtered to the Risk Curators category.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22, standard library only. `main.ts` fails loudly if the board is invalid, if a dashboard file reaches for the network, or if fewer than three screenshots are present — instead of shipping an entry the gate refuses.
