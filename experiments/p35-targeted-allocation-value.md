# P35 — Target-specific autonomous allocation value

## Preflight decision

**Negative Stage 1 preflight. No target was selected, and no treatment was run.** The only currently authorized saving targets in P33/P34 were another Farm and a Shed. The Farm repeats existing infrastructure in a sustainable P19 economy. The Shed fits the click ceiling but only increases storage; reaching a productive Quarry would require another target episode that this experiment would not authorize. No defensible progression path fits the requested one-target, stop-at-purchase contract.

The user’s stop rule for a target without a defensible progression hypothesis applies here. Stages 2–5 were therefore not run. The A/B/C treatment decision is not reached: this is not evidence that an executed target policy was safe or ineffective, and it is not outcome B. P20’s generic allocator remains retired, production allocation remains blocked, and the 2% CPU gate remains unresolved.

## Replay inputs and reproducibility

The preflight reducer consumes the retained exact replay artifacts. It does not change game state or execute Gather. P33 and P34 each recorded 625 live shadow observations from p8 through p5000. Their target, complete price, period, and eligibility-reason signatures match for all 625 observations.

| Input                 | Value                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| Pinned game           | `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`          |
| Pinned game SHA-256   | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`     |
| Fixture               | `test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt` |
| Fixture SHA-256       | `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`     |
| Settings SHA-256      | `fa28e3da0ee97c4b7ed51c38f9ae98148e24631a6e497b0bd6ffb76aac334691`     |
| Seed / epoch          | `44` / `2026-09-21T00:00:00.000Z`                                      |
| P19 baseline window   | p0–p10000                                                              |
| P33/P34 shadow window | p0–p5000                                                               |

Recreate the deterministic evidence and run its regression with:

```text
node experiments/p35-targeted-allocation-preflight.mjs
npm test -- p35-targeted-allocation-preflight-test
```

The reducer source is [p35-targeted-allocation-preflight.mjs](p35-targeted-allocation-preflight.mjs). Its machine-readable output, including hashes of the four source evidence files, is [p35-targeted-allocation-value-evidence.json](p35-targeted-allocation-value-evidence.json). Source replay scripts are [P19](p19-civilization-bootstrap-exact.mjs), [P20.2](p20-standard-human-sustained-allocation-exact.mjs), [P33](p33-p19-live-authority-exact.mjs), and [P34](p34-allocation-execution-cost.mjs).

## Live target observations

The P33/P34 records group as follows. Eligibility is the live shadow predicate; it establishes authority evidence, not usefulness.

| Current target and complete cost      | Observed periods | Records | Eligible | Finding                                                                                                                        |
| ------------------------------------- | ---------------: | ------: | -------: | ------------------------------------------------------------------------------------------------------------------------------ |
| No target                             |           p8–p56 |       7 |        0 | No current pre-Gather Construction target.                                                                                     |
| Farm, 20 Lumber / 10 Stone            |          p64–p72 |       2 |        0 | P19 handoff was active.                                                                                                        |
| Farm, 27 Lumber / 14 Stone            |         p80–p272 |      25 |       25 | First eligible at p80, after P19 bought one Farm at p72. The first eligible shortage was 14 Stone; one Farm was already owned. |
| Shed, 75 Money / 55 Lumber / 45 Stone |       p280–p5000 |     591 |      570 | Money was unaffordable in the first 21 observations. The first eligible observation was p448.                                  |

The Farm at p80 is not a useful target merely because it passes the authority predicate. P19 already had one Farm and used all three residents as Farmers by p1000, p5000, and p10000. P20.2’s generic allocation bought another Farm but ended p5000 with one resident and one Farmer, versus P19’s three. That replay warns against treating a second Farm purchase as progress.

The Shed was first observed at p272. Its $75 Money requirement was still short at p440 (Money 74.4); it was affordable at p448 (Money 76.8). At that point, the P19 stock implied shortages of 35 Lumber and 45 Stone. Available capacities were 180 Lumber and 200 Stone, so those shortages fit in 80 material clicks, within the 80-click target ceiling. The historical P20.2 generic run used 79 Shed-target clicks and bought a Shed at p1056.

The Shed is storage infrastructure: it adds 300 Lumber and 300 Stone capacity and provides no job, housing, direct production, or Research. A Rock Quarry can enable the productive `quarry_worker` job, but it was not the current P33/P34 saving target. P20.2’s run transitioned to a Quarry target only after its Shed purchase, spent 48 Quarry-target clicks, and did not buy the Quarry. P19’s Lumber and Stone production differences were both zero at p5000 and p10000, so the baseline cannot passively accumulate the missing materials after a Shed-only intervention. Selecting the Quarry before it is the current saving target would violate the target-specific authorization contract; stopping at Shed purchase would leave no demonstrated path to the productive building.

## P19 sustainable baseline

P19’s exact replay used the same pinned game, authentic P18 Standard/Human fixture, seed, settings, and epoch. It purchased one Farm at p72 and three Cabins at p96, p104, and p112. It recorded native Research grants at:

| Period | Research    |
| -----: | ----------- |
|     16 | Sundial     |
|     56 | Agriculture |
|     96 | Housing     |
|    192 | Currency    |
|    272 | Storage     |
|    456 | Mining      |
|    672 | Irrigation  |
|    936 | Science     |
|   1216 | Garrison    |
|   1536 | Silo        |
|   1896 | Banking     |

| Checkpoint | Population | Farmers | Farm output / Human food use | Starvation / deaths |  Food | Lumber | Stone |
| ---------: | ---------: | ------: | ---------------------------: | ------------------: | ----: | -----: | ----: |
|       p500 |          3 |       3 |                    3.732 / 3 |               0 / 0 | 110.9 |     20 |     0 |
|      p1000 |          3 |       3 |                    4.332 / 3 |               0 / 0 | 257.8 |     20 |     0 |
|      p5000 |          3 |       3 |                    4.332 / 3 |               0 / 0 |  1000 |     20 |     0 |
|     p10000 |          3 |       3 |                    4.332 / 3 |               0 / 0 |  1000 |     20 |     0 |

Stocks were at caps for Food, Money, and Knowledge by p5000; Lumber was 20/200 and Stone 0/200. Research continued to the recorded p1896 Banking grant, with no additional Research grant or Construction purchase through p10000. The baseline therefore supplies no Lumber or Stone production that would turn a storage-only Shed into a Quarry path.

## Controlled comparison and executor status

There is no P35 A/B/C comparison. No P35 arm was started, so there is no P35 first-divergence period or action. P33/P34 previously observed the accepted P19 policy with a shadow observer and found matching eligibility signatures; that historical parity is not presented as a new P35 A/B run. P20.2’s generic allocation treatment is prior negative evidence, not P35 arm C.

No target-specific executor was implemented or invoked. The Stage 1 stop condition means there is no target or time window to bind the P20.2 price, authority, queue, reservation, Gather postcondition, and budget protections to. This avoids introducing an executor with a generic selector after the value hypothesis failed preflight. No P35 native price probes, authorization fences, Gather calls, or treatment callback latency were measured.

P34’s earlier 107.3 ms shadow total and 280 hypothetical fresh-price probes (10.3 ms) are reference measurements only. P34’s 583.3 ms figure was a modeled direct-cost envelope. None is the measured cost of a P35 executor, and none establishes the 2% end-to-end CPU gate.

## Decision and verification

**Decision: negative preflight; stop before treatment.** No target-specific policy was authorized, so execution safety, causal progression gain, and repeat determinism are unmeasured. The request’s outcome A or B cannot be assigned without a treatment; outcome C is also not indicated because the preflight did not encounter an execution-contract failure.

The generated evidence and regression assert P33/P34 live parity, the first Farm and Shed eligibility conditions, the Shed material budget and nonproductive effect, the separate Quarry episode, P19 sustainability, and the unresolved CPU gate. The requested verification commands are retained for the completed preflight artifact:

```text
npm test -- p35-targeted-allocation-preflight-test construction-allocation-authority-test captured-gather-resources-test p20-allocation-budget-test
npm run build
node tools/chromium-evolve-runner-test.mjs
npm run check
git diff --check
```

The full verification results are recorded in the commit summary accompanying this report. Production behavior is unchanged; the generic P20 allocator remains retired.
