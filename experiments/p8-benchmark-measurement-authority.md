# P8 — Renderer CPU benchmark measurement authority

- Date: 2026-10-18
- Branch: `experiment/p8-benchmark-measurement-authority`
- Starting `deadspace` HEAD: `ed91360d68fa179f831149a041f86d1077d1a39b`
- P7 production bundle SHA-256: `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7`
- DeadSpace snapshot ref: `db38e2af831907d49aeb5348d678d8d8745d6c3f`
- Supporting tools commit: `fb141c709bc019c99b9933f5974e80c5e43f825a`

## Decision: C — unreliable even for substantial differences

The exact runner accurately records substantial synchronous work in renderer CPU and `TaskDuration`, but the same-workload comparisons are too variable to support a 2% decision. The calibrated 10% workload changed from positive to negative when order was reversed in both mid-fixture modes. In fresh late runs, its apparent effect ranged from 12.5% to 37.1%. Historical same-bundle A/A effects reached 35.6% in renderer CPU and 37.4% in `TaskDuration`. A 10% production change cannot be accepted or rejected reliably with this benchmark evidence.

No runner or production automation code was changed. The production bundle remains byte-identical to the P7 baseline. P8 raw runs and the frozen calibration are retained under ignored `test-artifacts/perf-profile/`.

## Measurement call graph

The P8 harness calls `session.evaluate()` on the real Evolve page. Puppeteer sends this through CDP `Runtime.evaluate`. That async page function awaits `window.__EA_RUNNER__.advance(1000)`, then (for positive arms) executes the fixed integer loop before the same `Runtime.evaluate` resolves. The bridge advances its virtual timers, delivers each game timer-worker `{loop: "main"}` message, dispatches the game and automation callbacks, drains microtasks, and awaits a native `MessageChannel` task boundary for each period. The Node harness samples page metrics and browser process counters after the evaluation returns, then reads the exported save and native-control diagnostics.

The production runner normally calls `advance()` through `Page.evaluate` in slices of at most 2,000 periods. P8 wraps the advance and deterministic workload in one awaited evaluation so the known work shares the game-runner execution path and measurement interval. The workload reads or writes no Evolve state, invokes no browser timer, and changes no automation choice. It leaves only an integer sink on `window.__EA_P8_WORK_RESULT__`.

## Measurement semantics

| Metric                          | Source and scope                                                             | P8 use and limits                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer-process CPU            | Browser-target `SystemInfo.getProcessInfo`, `cpuTime` deltas by renderer PID | Direct CPU measure. P8 records raw counter values and PID lists, then sums renderer deltas. The API does not map a page target to one renderer PID, so unrelated renderer work in the same Chromium process can be included. Browser, GPU, and service processes are excluded.                                                                          |
| Page `TaskDuration`             | Page-target `Performance.getMetrics`, cumulative task-duration delta         | Independent page-task cross-check. It includes the controlled `Runtime.evaluate` work. It is page aggregate data, not split by script or callback.                                                                                                                                                                                                      |
| Page `ScriptDuration`           | Same page-target metric API                                                  | Not authoritative. A prior controlled calibration added 250 ms of synchronous work inside `Runtime.evaluate` and recorded 0.000 s `ScriptDuration`, while `TaskDuration` rose 0.251–0.261 s and renderer CPU rose 0.23–0.30 s. Ordinary `setTimeout` work did increase `ScriptDuration`; the gap is specific to the runner's controlled execution path. |
| Wall-clock execution            | Node `performance.now()` around the awaited page evaluation                  | Environmental diagnostic only. It includes CDP round trips, task scheduling, and host delay, and is not CPU time.                                                                                                                                                                                                                                       |
| Native callback/phase durations | Bridge or feature timers using the page's native monotonic clock             | Elapsed callback or phase duration, not CPU. Callback profiling and phase instrumentation were disabled in the P8 timing arms.                                                                                                                                                                                                                          |

P8 samples `TaskDuration` immediately after the evaluation, then queries process CPU. There were two renderer processes at each CPU boundary; PID sets remained stable within all 32 measured arms. The active game renderer accounted for essentially all measured CPU. The other renderer's largest observed per-arm CPU delta was 0.000477 s. P4's raw records likewise show other renderer deltas no larger than 5.4 ms. Process attribution does not explain the multi-second A/A swings.

The bridge handles every due virtual timer before completing a period and awaits a `MessageChannel` task after each worker dispatch. This establishes the runner's intended per-period task boundary. There is no separate CDP command proving that arbitrary browser-native work outside the bridge queue is absent after the final boundary; such activity remains within the metric's page/process scope. The before/after CPU PID identities were stable, and no P8 arm reported a page failure.

The CLI report rounds its final aggregate renderer CPU values to hundredths of a second. The experiment harness calls the runner's raw process and page metric methods directly and retained the available sub-millisecond values in JSON. Counter precision is far finer than the observed variability; no rounding correction was warranted.

## Reused A/A evidence

The P4.2 reliability run already contains 96 same-bundle arms: six A/A pairs for each of two bundles, two fixtures, and two browser modes. It was reused as requested and was not repeated. Its paired false effect is `(first − second) / first × 100`; positive values are apparent speedups. All paired windows matched their final state hashes and expected worktick counts. CPU and `TaskDuration` directions agreed, with correlation 0.9998 across the arms.

| Mode / fixture    | Baseline CPU mean ± SD | Candidate CPU mean ± SD | Baseline A/A effect SD; range | Candidate A/A effect SD; range |
| ----------------- | ---------------------: | ----------------------: | ----------------------------: | -----------------------------: |
| Persistent / late |         26.07 ± 2.73 s |          26.79 ± 2.91 s |    17.81%; −35.61% to +18.94% |     11.15%; −14.95% to +21.33% |
| Persistent / mid  |         14.85 ± 2.28 s |          14.58 ± 1.79 s |    17.39%; −33.68% to +18.32% |     19.92%; −30.03% to +20.67% |
| Fresh / late      |         26.27 ± 3.55 s |          25.99 ± 3.27 s |     12.80%; −33.89% to +3.55% |      8.74%; −16.76% to +11.09% |
| Fresh / mid       |         12.96 ± 0.73 s |          12.61 ± 0.40 s |       5.98%; −8.19% to +7.72% |       4.25%; −11.39% to +1.17% |

The full per-arm CPU and `TaskDuration` readings, process identities, wall times, and run order are in `test-artifacts/perf-profile/p4-reliability-aa.json`. Within each fixture/mode, the largest absolute historical false effect across the two identical bundles was 35.61% persistent late, 33.68% persistent mid, 33.89% fresh late, and 11.39% fresh mid for renderer CPU. The corresponding `TaskDuration` maxima were 37.04%, 37.44%, 34.01%, and 11.98%.

The P4 sequence also recorded a 20.9% first-half to second-half renderer CPU decline for fresh late baseline arms and a 15.7% decline for candidate arms. Fresh mid was quieter but still had false effects above 8%. New browser processes did not remove late drift.

## Positive-control calibration

Calibration used the P7 production bundle, seed 42, `autoPrestige=false`, and the same late/mid saves as P4. Each fixture first ran 600 warmup and 1,000 measured periods to measure its current renderer CPU baseline. A fixed 30,000,000-iteration integer-arithmetic loop was then run three times in the page via `Runtime.evaluate`; each result was accumulated on the page global. The median iterations per measured renderer CPU second set the iteration counts for 2%, 5%, and 10% doses. The counts were frozen before detection in `p8-frozen-doses.json` (SHA-256 `92f92142257d21c18df60a59abccba0561c6be6f655147b13a366a6f7ad6fd4e`).

| Fixture | Baseline renderer CPU / `TaskDuration` | Calibration CPU repeats        | Calibration `TaskDuration` repeats |                 Frozen rate |       Frozen iterations for 2% / 5% / 10% |
| ------- | -------------------------------------: | ------------------------------ | ---------------------------------- | --------------------------: | ----------------------------------------: |
| Late    |                      28.279 / 25.222 s | 0.043862, 0.043745, 0.044332 s | 0.042859, 0.042843, 0.043406 s     | 683.96 M iterations / CPU-s | 386,840,158 / 967,100,394 / 1,934,200,789 |
| Mid     |                      12.089 / 10.270 s | 0.044773, 0.044035, 0.043991 s | 0.043695, 0.043315, 0.043278 s     | 681.28 M iterations / CPU-s |   164,712,501 / 411,781,254 / 823,562,507 |

The calibrated work varied by under 2% across the three repeats in each fixture. The 30-million-iteration loop added about 44 ms to renderer CPU and 43 ms to `TaskDuration`, with matching direction and close magnitude. The earlier 250 ms control independently showed that the runner's metrics include synchronous `Runtime.evaluate` work. These results establish measurement accuracy for known work; they do not establish comparison precision.

## Sensitivity experiment

Before detection, the decision rule was fixed: a dose would be considered supported only if both its CPU and `TaskDuration` changes were positive in every fixture and process mode, and every CPU percentage increase exceeded the largest absolute same-bundle A/A placebo effect observed for that fixture and mode. This is a deliberately empirical envelope from the observed false-control data, not a statistical significance threshold. An isolated large effect does not qualify if its reversed-order replicate does not. The calibrated target and observed magnitude are compared descriptively; no numeric tolerance was selected after seeing the detection results.

The initial batch used one control/positive pair per dose and fixture in a persistent Chromium process and another pair in a newly launched Chromium process block. Each arm used a new browser context. Pair order was counterbalanced across doses and reversed between process modes. Because the 10% results varied, one additional 10% pair was run in reversed order in each fixture and mode. Renderer CPU and `TaskDuration` are shown as seconds per 1,000 periods; the final columns are positive versus control relative percentages.

| Fixture | Process mode                | Dose | Pair order     | Control CPU / task | Positive CPU / task | CPU / task effect |
| ------- | --------------------------- | ---: | -------------- | -----------------: | ------------------: | ----------------: |
| Late    | Persistent                  |   2% | Control first  |    20.709 / 18.105 |     21.312 / 18.724 |   +2.91% / +3.42% |
| Late    | Fresh process block         |   2% | Positive first |    21.722 / 18.998 |     22.231 / 19.517 |   +2.34% / +2.73% |
| Mid     | Persistent                  |   2% | Control first  |    12.368 / 10.478 |     11.793 / 10.036 |   −4.65% / −4.22% |
| Mid     | Fresh process block         |   2% | Positive first |     11.713 / 9.756 |     11.846 / 10.044 |   +1.14% / +2.96% |
| Late    | Persistent                  |   5% | Positive first |    22.060 / 19.386 |     22.133 / 19.599 |   +0.33% / +1.10% |
| Late    | Fresh process block         |   5% | Control first  |    21.506 / 18.709 |     22.928 / 20.188 |   +6.61% / +7.91% |
| Mid     | Persistent                  |   5% | Positive first |    11.879 / 10.007 |     12.089 / 10.306 |   +1.77% / +2.99% |
| Mid     | Fresh process block         |   5% | Control first  |    11.964 / 10.143 |     12.512 / 10.595 |   +4.58% / +4.45% |
| Late    | Persistent                  |  10% | Control first  |    21.764 / 18.983 |     24.153 / 21.447 | +10.98% / +12.98% |
| Late    | Persistent, repeat          |  10% | Positive first |    22.483 / 19.968 |     23.666 / 21.041 |   +5.26% / +5.38% |
| Late    | Fresh process block         |  10% | Positive first |    21.674 / 18.957 |     24.392 / 21.596 | +12.54% / +13.92% |
| Late    | Fresh process block, repeat |  10% | Control first  |    20.889 / 18.364 |     28.639 / 25.822 | +37.10% / +40.61% |
| Mid     | Persistent                  |  10% | Control first  |    12.136 / 10.253 |     13.267 / 11.386 |  +9.32% / +11.05% |
| Mid     | Persistent, repeat          |  10% | Positive first |    16.285 / 14.242 |     14.977 / 12.954 |   −8.03% / −9.04% |
| Mid     | Fresh process block         |  10% | Positive first |    12.614 / 10.752 |     13.050 / 11.237 |   +3.46% / +4.51% |
| Mid     | Fresh process block, repeat |  10% | Control first  |    15.313 / 13.342 |     13.156 / 11.647 | −14.08% / −12.70% |

Exports matched byte-for-byte within all 16 pairs. Native control-usage maps also matched within every pair: 68 control kinds late and 60 mid. The full raw records include per-PID counters, process counts, exact iteration counts, work-result sinks, export hashes, and diagnostics in `p8-detection.json` and `p8-detection-replicate10.json`.

Renderer CPU and `TaskDuration` agreed on direction in all 16 paired comparisons, and their run-level totals correlated at 0.9996. This is evidence that both observe the page work. It is not evidence that paired differences are stable: 2% was negative in one mid pair; 5% late/persistent measured only +0.33%; and the 10% mid estimate reversed to −8.0% persistent and −14.1% in a fresh-process block after reversing order. Fresh late 10% rose from +12.5% to +37.1% under reversed order. The one fresh-mid positive-first 10% comparison was +3.46%, below its frozen target, while its order-reversed repeat was negative.

No dose passed the predeclared placebo-envelope rule. The isolated late/fresh +37.1% repeat exceeded that fixture's 33.89% historical maximum by 3.2 points, but its same-dose order-reversed pair was +12.54%, and the mid repeat went negative. This is not reproducible detection. The 2% and 5% doses are plainly within historical placebo variation; the 10% workload is too.

## Variability causes: evidence and limits

- **Order and run drift are demonstrated.** Reversing the order changed the 10% mid estimate from +9.32% to −8.03% persistent and from +3.46% to −14.08% in fresh-process blocks. The late/fresh repeat changed from +12.54% to +37.10%. P4's fresh-late sequence also declined substantially across run index. The effect does not have one universal sign, but its magnitude depends on run order.
- **The page renderer is where the variability appears.** P4 CPU and `TaskDuration` correlated at 0.9998; all P8 paired CPU and task effects shared direction. The idle renderer's sub-millisecond deltas cannot explain it. Browser-process CPU is not included in renderer CPU, though host scheduling can still affect execution.
- **Different game work is not supported as the cause.** P8 exports and native control-usage maps matched within every pair, and each arm advanced the same 600 warmup plus 1,000 measured periods.
- **PID attribution and metric quantization are not supported causes.** Renderer PID sets were stable across each window, raw counters were retained, and the idle renderer contributed less than 0.5 ms. The earlier CLI rounding to 0.01 s is below 0.1% of even the smallest measured window; the P8 harness did not use the rounded CLI summary.
- **JIT, garbage collection, CPU frequency scaling, host scheduling, and unrelated page tasks remain hypotheses.** P4 observed GC in separate CPU profiles, and each arm had a new page context; neither P4 nor P8 measured JIT tier changes, GC duration, CPU frequency, or host scheduling. The measurements do not identify any one as the cause. A fresh Chromium process did not remove the noise.
- **No concrete runner defect was demonstrated.** `ScriptDuration` is invalid for this execution path, but this behavior is known and the benchmark already uses renderer CPU and `TaskDuration`. No speculative changes were made to the supporting tools repository; its working tree remained clean.

## Verification and recommendation

P8 used only the P7 production bundle, unmodified pinned game snapshot, and test harness. `evolve_automation.user.js` remained byte-identical to the starting SHA-256. No Evolve source, settings behavior, automation policy, or production artifact was changed. The calibrated loop was absent from the userscript and active only in this experiment script's positive-control arms.

Use the exact runner for correctness, save parity, and large descriptive differences, but do not use it as a 2%, 5%, or 10% CPU acceptance gate. Subsequent optimization work should establish value from profiled call paths and correctness evidence, and report exact-runner CPU as exploratory until a redesigned measurement setup passes both same-bundle controls and frozen positive controls on an isolated, stable host. More repetitions alone are not evidence of improved authority.

P8 experiment driver: `experiments/p8-benchmark-measurement-authority.mjs`. Raw data are ignored scratch artifacts under `test-artifacts/perf-profile/` and are not committed.

**C. Unreliable even for substantial differences:** the measured 10% control changed direction under reversed order, and its observed effects overlapped the same-bundle placebo range. Keep the exact runner as the correctness authority; establish a different CPU measurement setup before using CPU results to accept or reject production optimizations.
