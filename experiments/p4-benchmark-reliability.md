# P4.2 — Benchmark reliability decision

Date: 2026-10-17  
Branch: `codex/p4-demand-building-candidate` at `f4cc655d`  
Production baseline: `93476e36`  
Game snapshot: DeadSpace `db38e2af831907d49aeb5348d678d8d8745d6c3f`, SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`  
Baseline bundle SHA-256: `b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540`  
Candidate bundle SHA-256: `d3d618a49f9cb48d49e359470d1b5863f7274f7c5b8ad6a21a71bcd53a015e9a`

Settings file SHA-256: `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`  
Late save SHA-256: `e2c9d1d4bb5656e9808a68df68455a7edc8fbe4d5b24933efd71520ffbbaefc3`  
Mid save SHA-256: `7c25f5cec06c88316675665d521bfc368d60c0c4a72ea0a2bde35bcc7d3069a3`

## Decision

The P4.1 CPU result is not a reliable estimate of the candidate effect. Identical baseline bundles and identical candidate bundles both produced apparent speedups and regressions much larger than 2%. Renderer CPU and page `TaskDuration` moved together, so the main drift is associated with work in the measured page renderer. A fresh Chrome process per arm did not remove it.

No independent A/B confirmation was run. The A/A controls fail the stated stability gate, so more A/B blocks would repeat a comparison the controls already show is not dependable. Preserve the production candidate unchanged and stop for independent review.

## Direct answers

1. **Baseline versus baseline shows false speedup and regression.** The six same-bundle pair effects ranged from −35.61% to +18.94% in persistent late mode, −33.68% to +18.32% in persistent mid, −33.89% to +3.55% in fresh late, and −8.19% to +7.72% in fresh mid. Positive is a false speedup; negative is a false regression.
2. **Candidate versus candidate shows the same problem.** Its paired effects ranged from −14.95% to +21.33% (persistent late), −30.03% to +20.67% (persistent mid), −16.76% to +11.09% (fresh late), and −11.39% to +1.17% (fresh mid).
3. **Drift tracks page execution cost and time order.** Identical final game-state hashes and work windows did not prevent large CPU and `TaskDuration` changes. Fresh late baseline CPU fell 20.9% from the first six runs to the second six, and fresh late candidate CPU fell 15.7%. Renderer CPU and `TaskDuration` correlated at 0.9998 over all 96 controls. JIT and garbage collection were not instrumented, so neither is identified as the cause. Host scheduling or other renderer-local runtime effects remain possible; unrelated renderers did not account for the changes.
4. **No mode is reliable across both fixtures.** Fresh Chrome reduced the descriptive mid-fixture A/A spread, but mid false effects still reached 8.19% for baseline and 11.39% for candidate. Fresh late remained highly variable and strongly time-trended. The mode comparison is not enough to claim a stable general improvement.
5. **A 2% end-to-end improvement is not distinguishable from this noise.** Even the quieter fresh-mid controls had 5.98% baseline and 4.25% candidate standard deviations in six paired A/A effects. Late controls were substantially noisier.
6. **There is no credible evidence of an actual P4 regression from these measurements.** P4.1's −8.69% mid estimate is within the same-bundle control swings, including a −11.39% candidate A/A effect on fresh mid. The old 12-pair interval does not overcome the demonstrated non-stationarity and serial dependence.
7. **The removed switch observations have a small plausible CPU budget.** Historical baseline attribution measured 145 ms of full `controls.invoke` time for 53,625 late calls and 9.1 ms for 1,261 mid calls during the measured 1,000 periods. A controlled instrumented estimate of the whole switch-reader path extrapolates to about 213 ms late (about 0.8% of the A/A renderer CPU level) and 16 ms mid (about 0.1%). These are diagnostic estimates, not production CPU savings; timing-hook overhead is excluded from the claimed benefit.

## Measurement method

`experiments/p4-benchmark-reliability.mjs` ran six baseline/baseline pairs and six candidate/candidate pairs for each fixture in each isolation mode: 96 arms total. It retained seed 42, the existing late and mid saves, the pinned game snapshot, the established settings file with `autoPrestige=false`, 600 warmup periods, and 1,000 measured periods (125 expected work ticks). Each indexed pair ran its two baseline arms, then its two candidate arms. Same-bundle arms have no distinct treatment order, and the baseline/candidate group order was not counterbalanced; group means are therefore not treated as an A/B estimate. Browser-mode order was reversed for the second fixture.

- **Persistent:** one Chrome process for the experiment, a new browser context per arm, and each context closed after measurement.
- **Fresh:** a new Chrome process per arm. The runner creates its local page server with each browser instance; pages and assets are otherwise the same. Setup and page-load time are recorded outside the measured interval.
- Renderer CPU is the delta of `SystemInfo.getProcessInfo` counters, retained per PID at CDP precision. The previous runner rounded each cumulative counter to 0.01 seconds; that precision loss has been removed in `tools/chromium-evolve-runner.mjs`.
- `TaskDuration` is the page-target delta from `Performance.getMetrics`. The virtual game work is executed inside the page's `Runtime.evaluate` advance call; it is not 1,000 seconds of elapsed game time. Measurements sample after the advance returns and before save/state readback.
- Wall time is recorded as an environmental diagnostic and is not used for performance decisions.
- Chrome was `HeadlessChrome/151.0.7922.71` for all arms. The launcher disables background timer throttling, renderer backgrounding, extensions, component updates, sync, and first-run checks. The page server serves the pinned snapshot locally, and request interception blocks other origins.

The complete individual run record is `test-artifacts/perf-profile/p4-reliability-aa.json` (ignored scratch output). It includes every arm's order/index, timestamps, wall time, browser version and PID, context/load timings, renderer PIDs and per-process before/after counters, page metrics, work window, state hashes, and failures. `experiments/p4-benchmark-reliability.mjs` regenerates it.

## A/A summary

Paired false effect is `(first identical run − second identical run) / first × 100`; positive means a false speedup. A/A aggregate effect compares the mean baseline-labelled runs with the mean candidate-labelled runs. Neither is a treatment estimate.

| Mode / fixture    | Baseline renderer CPU mean ± SD (s) | Candidate renderer CPU mean ± SD (s) | Baseline A/A false-effect SD; range | Candidate A/A false-effect SD; range | False aggregate baseline→candidate |
| ----------------- | ----------------------------------: | -----------------------------------: | ----------------------------------: | -----------------------------------: | ---------------------------------: |
| Persistent / late |                        26.07 ± 2.73 |                         26.79 ± 2.91 |          17.81%; −35.61% to +18.94% |           11.15%; −14.95% to +21.33% |                             −2.75% |
| Persistent / mid  |                        14.85 ± 2.28 |                         14.58 ± 1.79 |          17.39%; −33.68% to +18.32% |           19.92%; −30.03% to +20.67% |                             +1.85% |
| Fresh / late      |                        26.27 ± 3.55 |                         25.99 ± 3.27 |           12.80%; −33.89% to +3.55% |            8.74%; −16.76% to +11.09% |                             +1.07% |
| Fresh / mid       |                        12.96 ± 0.73 |                         12.61 ± 0.40 |             5.98%; −8.19% to +7.72% |             4.25%; −11.39% to +1.17% |                             +2.75% |

TaskDuration showed the same A/A directions. Across all 96 arms, its correlation with renderer CPU was 0.9998. Each same-bundle/mode/fixture group had one stable final state hash; all arms reached 1,000 measured periods and 125 expected work ticks, with no captured page failures or parity failures.

### Per-pair raw measurements

Each cell lists the two identical arms in that A/A pair. Values are seconds. These are all 96 individual CPU and TaskDuration readings; the JSON record additionally contains the diagnostic process and wall-clock fields.

| Browser mode | Fixture | Pair | Baseline CPU A/A | Candidate CPU A/A | Baseline TaskDuration A/A | Candidate TaskDuration A/A |
| ------------ | ------- | ---: | ---------------: | ----------------: | ------------------------: | -------------------------: |
| persistent   | late    |    1 |  30.078 / 24.381 |   25.161 / 23.411 |           27.399 / 21.789 |            22.475 / 20.829 |
| persistent   | late    |    2 |  23.245 / 28.105 |   30.298 / 23.836 |           20.504 / 25.318 |            27.324 / 21.187 |
| persistent   | late    |    3 |  28.879 / 27.284 |   26.461 / 30.417 |           26.114 / 24.572 |            23.674 / 27.666 |
| persistent   | late    |    4 |  26.969 / 27.276 |   25.168 / 21.995 |           24.317 / 24.367 |            22.252 / 19.366 |
| persistent   | late    |    5 |  23.141 / 23.347 |   29.453 / 25.807 |           20.370 / 20.621 |            26.661 / 23.070 |
| persistent   | late    |    6 |  21.283 / 28.862 |   30.850 / 28.600 |           18.991 / 26.026 |            28.006 / 25.624 |
| persistent   | mid     |    1 |  15.622 / 13.015 |   13.722 / 16.251 |           13.609 / 11.163 |            11.749 / 14.209 |
| persistent   | mid     |    2 |  13.260 / 12.992 |   13.264 / 17.247 |           11.378 / 11.064 |            11.324 / 15.192 |
| persistent   | mid     |    3 |  17.089 / 13.958 |   16.175 / 13.314 |           15.137 / 12.047 |            14.191 / 11.417 |
| persistent   | mid     |    4 |  19.216 / 17.896 |   17.235 / 13.673 |           16.913 / 15.768 |            15.237 / 11.802 |
| persistent   | mid     |    5 |  12.729 / 17.016 |   16.068 / 13.041 |           10.867 / 14.936 |            14.008 / 11.238 |
| persistent   | mid     |    6 |  12.425 / 12.992 |   12.057 / 12.863 |           10.707 / 11.321 |            10.304 / 11.044 |
| fresh        | late    |    1 |  29.053 / 29.746 |   27.793 / 32.451 |           26.329 / 26.882 |            24.974 / 29.446 |
| fresh        | late    |    2 |  29.294 / 28.256 |   30.224 / 29.919 |           26.411 / 25.454 |            27.281 / 26.963 |
| fresh        | late    |    3 |  29.090 / 30.610 |   24.440 / 24.381 |           26.169 / 27.643 |            21.763 / 21.801 |
| fresh        | late    |    4 |  20.524 / 27.479 |   25.460 / 25.848 |           18.441 / 24.712 |            22.594 / 22.943 |
| fresh        | late    |    5 |  21.550 / 25.450 |   23.617 / 21.927 |           18.990 / 22.717 |            20.975 / 19.336 |
| fresh        | late    |    6 |  22.035 / 22.211 |   24.276 / 21.583 |           19.415 / 19.633 |            20.903 / 19.058 |
| fresh        | mid     |    1 |  12.326 / 13.241 |   12.299 / 12.590 |           10.501 / 11.372 |            10.515 / 10.732 |
| fresh        | mid     |    2 |  12.788 / 13.445 |   12.479 / 12.333 |           10.844 / 11.561 |            10.640 / 10.523 |
| fresh        | mid     |    3 |  12.813 / 12.277 |   12.448 / 12.302 |           11.006 / 10.471 |            10.573 / 10.471 |
| fresh        | mid     |    4 |  12.710 / 11.728 |   12.477 / 12.839 |           10.850 / 10.121 |            10.655 / 11.040 |
| fresh        | mid     |    5 |  12.957 / 12.894 |   12.557 / 12.690 |           11.168 / 10.977 |            10.685 / 10.821 |
| fresh        | mid     |    6 |  13.624 / 14.740 |   12.418 / 13.833 |           11.683 / 12.760 |            10.521 / 11.781 |

## Drift and contamination checks

| Mode / fixture    | Baseline CPU first 6 → last 6 (s) | Candidate CPU first 6 → last 6 (s) | Run-index CPU correlation, baseline / candidate |
| ----------------- | --------------------------------: | ---------------------------------: | ----------------------------------------------: |
| Persistent / late |                     27.00 → 25.15 |                      26.60 → 26.98 |                                   −0.33 / +0.37 |
| Persistent / mid  |                     14.32 → 15.38 |                      15.00 → 14.16 |                                   −0.00 / −0.39 |
| Fresh / late      |                     29.34 → 23.21 |                      28.20 → 23.79 |                                   −0.77 / −0.84 |
| Fresh / mid       |                     12.81 → 13.11 |                      12.41 → 12.80 |                                   +0.41 / +0.56 |

Run-level lag-1 correlations were mixed rather than a clean independent series: persistent late baseline/candidate +0.09/−0.27; persistent mid −0.07/−0.17; fresh late +0.23/+0.68; fresh mid +0.34/−0.12. The small sample makes these descriptive only, but the fresh-late trend and the same-bundle pair swings invalidate a paired t interval's stationarity assumption.

Process and harness evidence narrows the likely source:

- `SystemInfo.getProcessInfo` did include every renderer in the browser, as suspected from the old helper. The new log preserves the IDs and per-PID counters. Each persistent arm had a fresh active page-renderer PID and a stable idle renderer; all other renderer deltas combined were at most 5.4 ms in a measured interval. This is too small to explain multi-second changes. The fresh mode also had one active renderer per measured page.
- Browser process CPU is not part of the renderer CPU metric. Chrome background work can still affect the host, but there is no evidence here that it caused the page `TaskDuration` shifts.
- The page's final state hash was identical within each bundle/fixture/mode group. Period count and expected work ticks were fixed. This rules out changed game state and a shorter game workload as explanations.
- All arms used the same Chrome build. The fixed 600-period warmup did not stabilize late-game CPU. Each arm has a new page context, so per-context JIT and garbage-collection histories can differ; neither was measured directly.
- The virtual periods execute inside page `Runtime.evaluate` work. `TaskDuration` records that target's task time. Save export, state decoding, and diagnostics happen after the metrics sample and are outside the measured task window. The new CPU sample follows `TaskDuration` by the small CDP process-query interval; high CPU/TaskDuration correlation shows that interval is not the source of the observed spread.
- Chrome's disabled background timers and local-only page server reduce timer/network noise. They cannot rule out runtime collection or system-level CPU frequency/scheduling effects.

The old P4.1 late results already showed order sensitivity: reported CPU reduction was +6.55% for baseline-first pairs and −0.93% for candidate-first pairs; its first six mean was +8.72% and last six was −3.10%. The fresh late A/A series now shows a common first-half/second-half decline for both identical bundles. Its mid regression, −8.69% with the old paired interval −13.96% to −3.42%, is comparable to the fresh-mid A/A false-effect tails and does not establish a treatment regression.

## Native observation cost

The candidate's offer sample still performs Building offer discovery. The new read-only diagnostic timed `buildingUnlocks.read(regions)` at 1,010 ms over 1,000 late calls and 560 ms over 878 mid calls. That work remains in both versions and is not a P4 saving. A controlled million-hit `Set.has` batch on the captured offer set took 6.7 ms late and 6.6 ms mid (about 6–7 ns per membership check at the timer's resolution).

On the actual captured native controls, 100 controlled switch-reader calls used the live root, resolved current handles, called the real native `on_cap()`, and made no game-state changes:

| Fixture | Switches per reader | Whole reader / 100 reads | `controls.resolve` | `controls.invoke` | Native method body | Reader work outside resolve/invoke |
| ------- | ------------------: | -----------------------: | -----------------: | ----------------: | -----------------: | ---------------------------------: |
| Late    |                  39 |                  15.8 ms |             2.9 ms |            7.4 ms |             2.3 ms |                       about 5.5 ms |
| Mid     |                   1 |                   0.9 ms |       below 0.1 ms |            0.3 ms |       below 0.1 ms |                       about 0.6 ms |

The `controls.invoke` wrapper consists of about 5.1 ms late and at least 0.2 ms mid beyond the native body over those batches. The timer reports values below 0.1 ms as 0.0 ms. These timings use instrumentation and one controlled batch; they identify scale and ownership, not clean production CPU. The uninstrumented historical attribution measured 145.0 ms of `controls.invoke` calls over 53,625 late invocations and 9.1 ms over 1,261 mid invocations. The historical numbers and call counts are in `test-artifacts/perf-profile/p4-late-baseline.json` and `p4-mid-baseline.json`.

Applying the controlled whole-reader average to the historical number of removed reads gives roughly 217 ms late (`1,375 × 0.158 ms`) and 11 ms mid (`1,261 × 0.009 ms`). Against the A/A baseline renderer means, that is about 0.8% late and 0.1% mid. It is an intentionally generous attribution ceiling: the controlled timers themselves add work, and it is not an observed end-to-end saving. The direct captured invocation component is about 0.55% late and 0.07% mid. The offer-sample and set-membership costs are not included as saved CPU because P4 does not remove them.

The diagnostic adds aggregate timers to `experiments/p4-native-observation-attribution.mjs`, writes its transformed bundle under ignored `test-artifacts/perf-profile/`, and reports instrumented timing separately from production CPU. No trace/profiler duration is counted as a production saving.

## Reproduction

The A/A run used:

```text
node experiments/p4-benchmark-reliability.mjs --phase aa --baseline test-artifacts/perf-profile/p4-baseline.user.js --candidate evolve_automation.user.js --out test-artifacts/perf-profile/p4-reliability-aa.json
```

It asserts the baseline and game snapshot hashes, fixes seed 42 and the 600/1,000 windows, checkpoints raw rows after every arm, and fails on incomplete or failed page runs. `--phase ab` runs the balanced ABBA/BAAB blocks only; it was deliberately not used after the A/A controls failed the stability gate.

The controlled native diagnostic used:

```text
node experiments/p4-native-observation-attribution.mjs --bundle evolve_automation.user.js --save test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt --periods 1000 --warmup 600 --expected-workticks 125 --out test-artifacts/perf-profile/p4-cost-late.json
node experiments/p4-native-observation-attribution.mjs --bundle evolve_automation.user.js --save test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json --periods 1000 --warmup 600 --expected-workticks 125 --out test-artifacts/perf-profile/p4-cost-mid.json
```

## Verification and scope

`node tools/chromium-evolve-runner-test.mjs` passed. `npm run check` passed all 347 test files, type checks, lint, format, and bundle syntax after moving the instrumented bundle into the ignored profiling directory. `git diff --check` is recorded after final report edits.

No production optimization logic, merge, push, Research Gate B2 change, or autonomous-allocation work was performed. The candidate branch is preserved as the local review target.
