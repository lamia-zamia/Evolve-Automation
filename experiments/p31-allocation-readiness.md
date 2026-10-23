# P31 — Performance headroom and allocation-authority readiness

## Decision: C — performance unresolved

P30 reduces Market route work on its retained late-MAD workload, but the repeated production-bundle comparison here cannot resolve a 2% whole-window CPU increment reliably across the required fixture set. A calibrated 2% page workload was visible in each fixture's renderer CPU and `TaskDuration`, while same-bundle production windows varied by 0.76%–18.82%. P30/pre-P30 paired effects also changed sign. The test-only shadow check needs no new native probe or capture pass, but its estimated cost is below the runner's counter resolution. Do not start a spending experiment yet.

Construction has a safe observation to build on: the current pre-Gather saving target produced after `establishConstructionOrdering()`. It must carry its own ordering-generation stamp and current-cycle evidence. The historical Rock Quarry/University disagreement compares different owner phases without those stamps, so it does not prove that one target overwrote the other. P20.1 later recorded a coherent Farm request/publication at p5000, and also a concrete stale-generation rejection at p8304.

## Inputs and method

- Repository revision: `cb3a892a` (`deadspace`); P30 implementation `e04590d4`; pre-P30 baseline `a092cb90`.
- The only source change between the baseline and P30 implementation commits is `captured-trade-routes.ts`. The baseline bundle replaces that module with its exact `a092cb90` contents and builds all other source from the same checkout as P30.
- Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`; game snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Ordinary production bundles (test surface disabled), same current Chromium runner (`06d1ede0bed3179ff8a6538024208f7f20a28fddf8f2c365b9c841becfd97ea9`), same seed, settings, and pinned epoch within each fixture. Every CPU window had a 100-period warmup followed by 800 measured periods. Three rounds alternated `pre-P30 → P30` and `P30 → pre-P30`, with a same-bundle P30 control in each round.
- Retained fixtures: `deadspace-early-day14.json`, `stage2f-fixed-progression-export.json`, `mad-tech-offered-blocked.json`, and the authentic P18 Standard/Human `p18-standard-human-fixture.txt`. Their exact paths and hashes, all 36 CPU windows, calibration rows, and summarized phase captures are retained in [p31-allocation-readiness-evidence.json](p31-allocation-readiness-evidence.json).
- The CPU comparison reads Chromium renderer-process CPU. CDP `TaskDuration` is supporting evidence; `ScriptDuration` is not treated as CPU. The separate phase profile is instrumented elapsed time, not renderer CPU.

The controlled run used 36 CPU windows (three windows per bundle/control per fixture). The game exports were not included in this CPU harness, so this is timing evidence, not a new gameplay-parity claim. P30's existing route-parity regression and P20.2 provenance/postcondition regressions remain the correctness evidence. P22's older un-warmed CPU totals are not compared to these warmed totals or credited to batching.

## Production profile: elapsed phase attribution

One ordinary P30 production bundle profiled 800 periods per fixture (100 work ticks). The figures below are exclusive phase elapsed time per work tick. They identify work; they do not estimate CPU savings. A dash means the phase did not run in that fixture.

| Phase / observation                                             |    Early | Progression | Late MAD | Standard/Human |
| --------------------------------------------------------------- | -------: | ----------: | -------: | -------------: |
| Native Research `drawTech` and DOM generation                   | 13.63 ms |    19.34 ms | 41.88 ms |        7.64 ms |
| Market route adjustment                                         |        — |           — | 10.68 ms |              — |
| Construction saving discovery                                   |  1.87 ms |     2.72 ms |  9.60 ms |        0.85 ms |
| Construction candidate setup / refresh (`autoBuild.beginCycle`) |  1.96 ms |     2.67 ms |  9.33 ms |        0.93 ms |
| Jobs building-weighting cost sampling                           |  1.91 ms |     2.88 ms |  9.77 ms |              — |
| Jobs catalog sampling                                           |  0.39 ms |     0.42 ms |  0.49 ms |        0.32 ms |
| Resource-demand total preparation                               |  1.47 ms |     1.34 ms |  1.57 ms |        0.98 ms |
| Construction demand preparation                                 |  1.58 ms |     1.94 ms |  3.75 ms |        1.03 ms |
| Storage owner total                                             |  2.88 ms |     3.65 ms |  0.80 ms |        0.02 ms |
| Native batch cost sampling                                      |        — |     1.21 ms |  5.54 ms |              — |

In late MAD, measured native-cost probe counters were 18 per work tick for both `autoStorage.building-target-price-probes` and `jobs.full.buildCostReads`; the two owners sample at different phases. Progression recorded 7 per tick for each. These matching counts do not establish redundant work. Early and Standard/Human did not run those same late-game probe paths. Research redraw, demand preparation, candidate refresh, and owner-specific prices remain observations of current native state.

## Matched CPU and 2% calibration

Renderer CPU medians use the three matched 800-period windows. The control range is max-minus-min divided by its mean. Calibration injected a synchronous, inert page workload equal to 2% of that fixture's median P30 renderer CPU window; each calibration alternated an idle page window and the workload window three times.

| Fixture        | pre-P30 median | P30 median | P30 median delta | P30 same-bundle control range | Injected work | Mean renderer CPU increase | Mean `TaskDuration` increase |
| -------------- | -------------: | ---------: | ---------------: | ----------------------------: | ------------: | -------------------------: | ---------------------------: |
| Early          |       11.775 s |   11.651 s |           −1.06% |                         0.76% |        232 ms |                     215 ms |                       227 ms |
| Progression    |       14.701 s |   14.660 s |           −0.28% |                        17.48% |        276 ms |                     266 ms |                       276 ms |
| Late MAD       |       29.687 s |   32.402 s |           +9.15% |                        18.82% |        644 ms |                     620 ms |                       625 ms |
| Standard/Human |        5.453 s |    5.527 s |           +1.35% |                         4.72% |        108 ms |                     109 ms |                       108 ms |

P30/pre-P30 paired renderer CPU effects by alternating round were early `+2.37%, −1.23%, −1.79%`; progression `+4.11%, −2.56%, +1.75%`; late MAD `+9.79%, −6.05%, −7.57%`; Standard/Human `+9.13%, +4.07%, −1.70%`. Positive values mean P30 used more CPU. The calibration shows the counters respond to a deliberate 2% page workload, but the production-window control spread and inconsistent paired effects prevent a reliable 2% treatment estimate across these workloads. In particular, a visible calibration is not a substitute for stable matched whole-window controls.

The P30 route-batching result remains supported on its own retained late-MAD experiment: batched route controls lowered the observed route work there. This P31 matrix does not reproduce a stable whole-window benefit, and it does not attribute P22-to-P30 differences to batching.

## Construction observation timeline

The P20.1 corrected trace already annotates the existing cycle boundaries. This analysis reuses it; it adds no Research or Construction catalog draw.

1. Before Gather, `captured-runtime-control.ts` calls `progression.establishConstructionOrdering()`. `captured-construction.ts` starts an ordering-only cycle, refreshes candidates and prices, sorts them, then `finishCycle(true)` replaces `completedIntent`. The subsequent pre-Gather saving-target read selects from that current intent and calls the building source's `readSavingCost`, which reads the current cost.
2. Construction runs later in the same work tick. A successful `runConstructionCycle()` ends its own candidate cycle and updates `completedIntent` through `finishCycle(true)`. The existing post-Construction observation is emitted only on success and carries the automation work-cycle, root generation, and progression generation.
3. `constructionCycleId` increments for a normal Construction `beginCycle()`, but not for the ordering-only pre-Gather refresh. Thus the existing `workCycleId` and phase stamps identify the observed automation boundary; they do not independently name the precise pre-Gather ordering refresh. A new allocation contract must stamp the ordering generation at the pre-Gather boundary itself.

The old P20 Rock Quarry pre-Gather / University post-Construction pair lacked a shared cycle ID, phase, or progression-generation comparison. It is a phase-mixed pair of valid observations, not evidence that the University target replaced the Quarry target in the same observation. Neither target from that old pair can authorize spending by itself.

P20.1's corrected p5000 sample is coherent:

| Field                       | Pre-Gather request   | Prior post-Construction publication |
| --------------------------- | -------------------- | ----------------------------------- |
| Automation work cycle       | 625                  | 624                                 |
| Target                      | Farm (`city-farm`)   | Farm (`city-farm`)                  |
| Price                       | 20 Lumber / 10 Stone | 20 Lumber / 10 Stone                |
| Root generation             | 0                    | 0                                   |
| Progression generation      | `…                   | 27                                  | human | standard | …`  | same |
| Current native target price | 20 Lumber / 10 Stone | same validated price                |

The request had a 10-Stone shortage and 200 obtainable Stone capacity, with 21 Lumber already held. Both queues were empty, `autoBuild` and the target action control were current, there were no competing claims, and both Gather bindings had generation 12. This sample meets the observed pre-Gather authority predicates. At p8304, the prior publication was from work cycle 1037 while the request was cycle 1038; its progression stamp ended in `|27|` and the current generation ended in `|28|`. That publication is stale even if its target and quoted price appear unchanged. P20.1 correctly denied it.

The P20.2 fix remains necessary: operation-level provenance must keep Emergency Food independent from Construction materials, and each native Gather action must show the target stock increased before its material credit or remaining budget advances. The retained regressions cover repricing and no-op postconditions.

## Minimum allocation authority contract

This is an evidence contract, not a spending policy. Meeting it would authorize a separately budgeted experiment; it would not show that spending on a target improves progression.

| Evidence at authorization and each revalidation | Required condition                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current target and full price                   | Target identity, complete resource/quantity map, and pool come from the current pre-Gather ordered intent; price is finite, nonnegative, complete, and current.                                                                       |
| Owner/order generation                          | Observation phase is `pre-Gather`; order generation, automation work cycle, root generation, and progression generation are captured together. No post-Construction observation from another phase substitutes for it.                |
| Shortage and capacity                           | At least one gatherable material has a positive shortage; each shortage fits current obtainable capacity; non-gatherable costs are affordable.                                                                                        |
| Controls                                        | Target and Gather action bindings exist at their captured generations; `autoBuild` and Gather permissions remain enabled.                                                                                                             |
| Queue, reservation, spending authority          | Both queues are compatible; no conflicting reservation, claim, active handoff, or other spending authority overlaps the target/material.                                                                                              |
| Budgets                                         | Explicit per-cycle, per-target episode, and total episode ceilings. P20.2's retained limits provide a test example of 5 clicks/cycle, at most 80/episode, and 140 total; a new experiment must state its own bounds before execution. |
| Before each native action                       | Re-read or validate target/order/root/progression and control generations, full price, stock/capacity, queue/reservations, permission, and remaining budgets. Reject if any differ.                                                   |
| After each native action                        | Require native success and a positive target-material stock increase; revalidate the next action against fresh state. A no-op or failed action earns no budget or shortage credit.                                                    |

Authorization answers “may this operation run under the current owner's intent?” Progression value answers “did this resource spend improve a measured progression outcome?” The second requires its own P19-controlled replay and cannot be inferred from safe authorization or a Farm/University preference.

## Shadow authority cost

The test-only shadow check evaluated the retained P20.1 pre-Gather observation in the ordinary P30 bundle. It checked target identity, target/publication/native price agreement, root and progression generations, positive shortage, obtainable capacity, queues, permissions, competing claims, Gather-control generations, and explicit budgets. Seven batches of 20,000 checks each all returned the same authorized result.

- Incremental native probes: **0**.
- Incremental native capture passes: **0**; the check consumed the already captured observation.
- Renderer CPU for 20,000 checks: 15.4–18.3 ms (median 16.9 ms), or an extrapolated 0.08 ms per 100 checks. `TaskDuration` was 8.8–9.4 ms per batch.
- The in-page timer rounded the batch duration below its resolution. The renderer process counter resolves the batched workload, but cannot resolve the extrapolated sub-millisecond per-cycle increment. Treat this as a cost estimate, not proof that the 2% overhead gate passes.

The existing P20 observer/allocator branch is not a suitable shadow implementation: it re-reads native costs during validation and P20.2 records 2,430 additional `buildQueue.setData` probes in the observer-only 5,000-period replay. A new shadow path should consume only the current cycle's stored order, price, resource, queue, reservation, and control observations. If any required value is missing, it must fail closed instead of drawing another full catalog.

## Recommendation

Keep P20's generic allocator retired. First add an explicit, test-only pre-Gather ordering-generation stamp at the existing ordering and demand observation boundaries, then run the shadow check from that single immutable observation without native probes. Establish a CPU comparison protocol whose identical-bundle controls stay below the 2% budget on the authentic Standard/Human and late-MAD windows. Only after both are demonstrated should a new bounded allocation experiment be proposed; that experiment must independently beat the accepted P19 progression outcome.

## Reproduction and verification

- `node experiments/p31-allocation-readiness.mjs` builds ordinary production bundles from the same source, profiles the four fixtures, runs reversed-order CPU windows, same-bundle controls, and calibration. Detailed raw results are retained in [p31-allocation-readiness-evidence.json](p31-allocation-readiness-evidence.json); the unfiltered console capture remains under ignored `test-artifacts/benchmark/tmp/`.
- `node experiments/p31-shadow-authority.mjs` microprofiles the non-mutating shadow predicate from the retained P20.1 observation. Its per-iteration browser timer is below resolution; renderer process CPU is the reported batch measure.
- P20.2 provenance and postcondition regressions are to be run with the validation suite recorded in the task completion commit.
- No spending policy was implemented. No upstream game file, `debug.js`, preload tab, or Worker was changed.
