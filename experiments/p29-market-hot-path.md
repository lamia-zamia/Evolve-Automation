# P29 — Market hot-path cost isolation

## Decision C — no runtime prototype

Repeated `readRoundedValues()` setup/restoration and pure `planTradeRoutes()` are small in the measured late workload. Route-operation execution and postcondition checks are the largest isolated segment, with input preparation/validation next. Neither Stage 2 optimization condition was met, so no runtime candidate, candidate tests, or uninstrumented CPU comparison was run. The alternative is to isolate the per-operation freshness fences and native calls inside the execution segment before proposing a change.

## Inputs and method

- Automation: `lamia-zamia/Evolve-Automation@deadspace`, starting source commit `ab665c72343501e49c72aa92fd0223958fa2c060`.
- Pinned Evolve: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`; game snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Late fixture: `mad-tech-offered-blocked.json` and `current-full.json`, seed 42, epoch `2026-09-21T00:00:00.000Z`, 800 periods / 100 work ticks. It has 18 unlocked Market rows and both import/export settings enabled for all observed rows.
- Exact runner: `tools/chromium-evolve-runner.mjs`, HeadlessChrome `151.0.7922.71`. Phase timing used the runner bridge's `eaDiagnosticsNow` native `Performance.now()` hook (`perf: true`), not the game's virtual performance clock.
- The production bundle remained unchanged at SHA-256 `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`. The diagnostic-only test-surface bundle was `4ce3ed9d69f982cb5121ec1d4f3a176a51f55a989e8364751b8736708853c779`.
- Reproduce Stage 1 with `node experiments/p29-market-hot-path.mjs`. It writes detailed timing samples and the full per-pass planner operation trace under ignored `test-artifacts/benchmark/tmp/p29-stage1.json`.

Three instrumented baseline runs used the same fixture, source, bundle construction and 100-tick window. They matched the P28 late fixture's native invocation, RNG, state and exported-save evidence. Timings below are summed over 100 passes; per-pass values divide those totals by 100.

| Non-overlapping segment                                                                      | Run 1 total / pass | Run 2 total / pass | Run 3 total / pass | Median pass |
| -------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | ----------: |
| Trade-route input preparation and validation                                                 |   501.1 / 5.011 ms |   797.5 / 7.975 ms |   512.8 / 5.128 ms |    5.128 ms |
| Native `aSell` and `aBuy` execution                                                          |   131.1 / 1.311 ms |   238.6 / 2.386 ms |   134.2 / 1.342 ms |    1.342 ms |
| `readRoundedValues()` setup, observation, validation and restoration, excluding native calls |     5.4 / 0.054 ms |    12.9 / 0.129 ms |     6.5 / 0.065 ms |    0.065 ms |
| Pure `planTradeRoutes()`                                                                     |    21.7 / 0.217 ms |    32.8 / 0.328 ms |    23.0 / 0.230 ms |    0.230 ms |
| Native route operations and postcondition verification                                       |   604.4 / 6.044 ms |   938.2 / 9.382 ms |   645.5 / 6.455 ms |    6.455 ms |

The full pass totals were 12.637, 20.200 and 13.220 ms. Run 2 was a slower sample; its same-control variance means these timings support phase selection, not a CPU improvement claim. The repeated-rounding setup segment is roughly 0.4–0.6% of the median full pass, and pure planning is about 1.7%. Route execution is largest; input preparation is second. P22's whole late route phase was 13.61 ms/work tick, consistent with the P29 full-pass median. P28's instrumented baseline route phase was 15.85 ms/tick.

## Planner and quote counters

- 100 pure planner calls, 18 candidates/call (1,800 total), maximum route capacity 914 each, and 914 routes used per call (91,400 total).
- 91,400 allocation-loop iterations each performed a fresh `trades.sort(resSorter)`; there were 100 initial priority-group sorts, for 91,500 total array sorts. The planner returned 14 operation records across the window. Their ordered operation/result trace SHA-256 is `a50d26398b837ca32b5ebfefd8b1dadebc7df1d6a20dc7f1cdf4d1658e7905bd`.
- Each of the 18 resources had 100 successful `aSell` and 100 successful `aBuy` calls: 1,800 per method, 3,600 quote invocations total. There were no thrown quote calls.
- The 100-pass execution segment contains the existing operation authority checks and per-unit native calls. The exact native control trace had 4,583 successful route-control calls: 3,208 `autoBuy`, 1,371 `autoSell`, and 4 `zero` (matching P28).

## Control parity and limits

The diagnostic build preserved the late fixture's ordered native invocation SHA-256 `88f247327e9a7c53a86ca4d71acac7c0d7e52b23bef2ead662408fa5de36dc42`, 2,194 RNG calls, state SHA-256 `26f08bef03ea462ce0a1237249b4aed4a9f8b85ee46d325a85c9fe5ee42361a8`, and exported-save SHA-256 `a99e0f35aa7cb5b4c9f3f3a7ed93963f5b3382cf4194737218474e927c48168a`. Its quote counts match the existing P28 baseline. No inactive-row filtering was repeated.

Stage 2 did not select a prototype. Consequently no candidate was available for the early/progression/late adversarial parity matrix (missing callbacks, stale generations, nested captures, prototype replacement/restoration failure, root replacement, or regional Market paths). No runtime or test files changed, and no candidate timings exist. Stage 4's reversed-order renderer CPU and `TaskDuration` comparison, including identical-bundle controls, was correctly not started because neither optimization met its measured-bottleneck gate.

## Repository cleanup and commits

The P26/P27 report table normalization was committed separately as `c7ef23d1` (`docs: normalize P26 and P27 report tables`). P29's diagnostic harness and report are a separate report commit. No implementation or test commit was needed, and nothing was pushed.
