# P20 — Standard/Human sustained allocation

## Decision: C — late Construction authority is stale

The test-only allocator executed bounded post-bootstrap Gather actions. It purchased a Shed at p568 and an additional Cabin at p664, raising population and Farmer employment from three to four. No Research grant beyond P19 occurred.

The decision is C because late owner observations disagree. At p5,000 and p10,000, the pre-Gather Construction contract reports a Rock Quarry request priced at 50 Lumber / 10 Stone, while the latest captured Construction publication reports a University request priced at 400 Money / 300 Lumber / 400 Stone. The contract's freshness check compared two pre-Gather reads, which agreed with each other, but did not match the separately captured latest publication. Owner identity and price are therefore insufficiently fresh for safe continued intervention.

## Reproduction

The exact Chromium runner used the retained P18 Standard/Human fixture, P18 settings, seed 44, epoch `2026-09-21T00:00:00.000Z`, and pinned game `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`. The fixture SHA-256 is `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`. P19's candidate and always-click reference are reused from its evidence.

P20 ran two identical 10,000-period candidate replays and compared exports, RNG, native control traces, Research and Construction invocation traces, and saving-target observations. It sampled the existing Construction owner work at p272, p1,000, p5,000, and p10,000 without extra catalog draws. Checkpoints, contracts, traces, input hashes, and replay results are in [p20-standard-human-sustained-allocation-evidence.json](p20-standard-human-sustained-allocation-evidence.json); the runner is [p20-standard-human-sustained-allocation-exact.mjs](p20-standard-human-sustained-allocation-exact.mjs).

## Plateau and current owner observations

P19 bought Cabins through p112 and Research through Banking at p1,896. No additional Research or Construction purchase occurred from p5,000 through p10,000. The economic plateau began after the last P19 Cabin, though ordinary Research continued through p1,896.

At p272, the current pre-Gather Construction request and captured Construction target both identify Farm, priced at 27 Lumber / 14 Stone. Stock is 24 Money, 20 Lumber, and 0 Stone; the material shortage is 7 Lumber / 14 Stone, with capacity to obtain it. This replaces P19's historical p272 Shed observation as the P20 target.

At p1,000 both observations identify Rock Quarry, priced at 50 Lumber / 10 Stone. Stock is 31 Lumber / 10 Stone, leaving 19 Lumber short. At p5,000 and p10,000, the pre-Gather owner contract still reports Rock Quarry at the same price and stock, but the latest captured Construction publication reports University at 400 Money / 300 Lumber / 400 Stone. This mismatch is retained in the machine evidence and drives the C decision.

The Construction contract records owner/target identity, current price and stock, pool, resource authority, root/progression/control generations, queue state, autoBuild and action permissions, Gather bindings, material shortage, obtainable capacity, claims, and expiration conditions. The test policy used at most five Gather clicks per owner cycle, 80 per episode, 140 total, and three episodes. It never filled resource caps or directly invoked Construction or Research purchases.

Research offers were sampled with native costs, affordability and conflict evidence. Research actions through Banking at p1,896 match P19; additional Research grants: zero. Gather does not choose a Research target.

## Controlled progression results

| Checkpoint | Population / capacity | Jobs      | Buildings                | Food stock / cap | Food production / consumption | Starved / deaths |
| ---------- | --------------------: | --------- | ------------------------ | ---------------: | ----------------------------- | ---------------: |
| p272       |                 3 / 3 | 3 Farmers | 1 Farm, 3 Cabins         |     73.9 / 1,000 | Farmer 3.732 / Human −3       |            0 / 0 |
| p1,000     |                 4 / 4 | 4 Farmers | 1 Farm, 4 Cabins, 1 Shed |    257.5 / 1,000 | Farmer 5.316 / Human −4       |            0 / 0 |
| p5,000     |                 4 / 4 | 4 Farmers | 1 Farm, 4 Cabins, 1 Shed |    1,000 / 1,000 | Farmer 5.316 / Human −4       |            0 / 0 |
| p10,000    |                 4 / 4 | 4 Farmers | 1 Farm, 4 Cabins, 1 Shed |    1,000 / 1,000 | Farmer 5.316 / Human −4       |            0 / 0 |

The allocator spent 140 dynamic clicks: 85 Lumber and 55 Stone, distributed across the Shed episode (80 clicks) and Quarry episode (60 clicks). P19's 20 startup Stone clicks remain separate. The native trace records the Shed purchase at p568 and a further Cabin purchase at p664. While the current pre-Gather target was Quarry, Construction purchased the Cabin and spent materials from the same pool; queues and claims were empty. The Quarry remained short 19 Lumber at p1,000 and was not purchased.

No new productive building or non-Farmer job activated. The extra Cabin increased capacity and population to four, and the Farm's Food production increased. From p5,000 to p10,000 the candidate remained stable without starvation, but the Quarry request did not advance. The always-click diagnostic remains P19's 16,253 Gather clicks by p5,000.

The candidate made 48,643 captured native control calls at p10,000 versus P19's 46,218, with 1,252 deterministic Construction-owner cycle evaluations. Native control errors and stale/throwing controls were zero. Candidate and duplicate exports matched at SHA-256 `8d302ad989ccbde0af07d40bd62f21f0dbfe390938ccafe5455e3d5976182821`; both used 1,919 random calls and ended at RNG state `3258279233`. These are bounded work counts, not a renderer CPU measurement. P13O's inconclusive CPU protocol was not rerun; the less-than-2% renderer CPU criterion remains unresolved.

## Implementation boundary and validation

P20's allocator and contract hooks are test-surface-only. P19's one-time startup behavior and tests remain intact. Focused regressions cover target change during Gather, price/control rebinding, partial affordability, retained bootstrap handoff accounting, insufficient capacity, Mana protection, root replacement, owner disablement, queued and competing Construction work, native action failure, and a successful action without the expected stock change. The late Construction target mismatch means this experiment does not establish authority for production integration.

The production bundle remains byte-identical to P19 at SHA-256 `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`. Full validation and the native-parity test's missing fixture are recorded in the final run summary.
