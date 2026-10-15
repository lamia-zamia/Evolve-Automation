# Full runtime performance attribution — game vs automation

## Answers

1. **Game vs automation renderer CPU.** With normal automation, automation causes **50–58% of renderer CPU**:
   66 / 67 / 130 ms per work tick on the early / mid / late saves (8 periods per work tick). With the master toggle
   off, the installed script costs ≈0.02 ms per period, which the CPU counter cannot resolve, and leaves the game state
   byte-identical.
2. **Where automation spends CPU.** Mostly inside **game code it invokes**, not in its own JavaScript. V8 attributes
   only 3.4 s of the late save's 10.1 s automation-initiated CPU per 100 work ticks to automation functions themselves.
   Control invocations into the game (`invokeControl` in `src/adapters/evolve/vue-capture.ts`) are 44–57% of the
   cycle. Two paths dominate:
   - the **native Research tab draw every work tick**: 12.6 / 15.6 / 32.6 ms, 27–28% of the cycle on every save;
   - **repeated native price probes** through `buildQueue.setData`: 3.7 / 5.4 / 29.2 ms per work tick, with each
     building priced 4–5× per tick by five separate consumers.
3. **What makes a work tick slow.** The work cycle runs synchronously inside the game's period listener. That makes
   every work tick a single long main-thread task: in real-time pacing, 33/50 (mid) and 50/50 (late) work ticks
   exceeded 50 ms, with late p50 92 ms and max 158 ms. Native-only runs produced none. Outliers (top 5%) add a second
   Research draw after a purchase, post-research construction demand preparation, `autoFactory` spikes,
   build-control discovery draws, and, with Market on, one route-operation tick of 203 ms, 174 ms of it in
   `board.isCurrent`.
4. **Time spent without meaningful actions.** On the late save, 190/200 work ticks changed no building, research or
   job, and carried 95% of cycle time. 100% of its Research draws (200/200) led to no purchase. On early/mid, 93–95% of
   draws bought nothing, and 52% / 33% of cycle time fell in no-progress ticks. With Market on, 97% (late) / 51% (mid)
   of work ticks performed zero route operations but still paid 69% / 41% of route-adjustment time.
5. **Largest credible payoff.** One per-cycle owner for native action prices in `captured-action-costs.ts`. The
   measured ceiling is ≈24 ms per late work tick (≈18% of automation CPU) and ≈4.4 ms mid. Validation is a plain
   export-parity A/B. The Research redraw is larger in raw cost, but removing it needs a membership/cost authority
   argument that earlier work showed is not available (section F). Section G specifies the price-memo experiment.

## A. Measurement methodology

### Inputs

| Input              | Value                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream game      | `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f` (`D:/work/Evolve-DeadSpace`, unchanged)                                                                                                                                                                                                                                                                                                                      |
| Game snapshot      | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `29e22dbe9bc80d44997ee6ab87bb1143fc35129d1d89d6241997eec0f79a54f4`; Vue 3.5.22, Buefy 3.0.10                                                                                                                                                                                                                                                                            |
| Automation         | `deadspace` @ `409383b2`; production bundle `fd04d858f69e9173…`                                                                                                                                                                                                                                                                                                                                                            |
| Experiment bundles | built from the same `src/` with production esbuild options: `plain` (byte-identical to production, checked on every run), `empty` (metadata only, native arm, `962d673e…`), `marker` (`2e1b1eb7…`), `phases` (`dfdbd7ed…`; a later build adds the `readCost` id tally). After Prettier reformatted the committed collector, the same injections rebuild as `marker` `e3ceabfd…` and `phases` `25248f4a…` (formatting only) |
| Runner             | `tools/chromium-evolve-runner.mjs` (tools `86785b7`, harness hash `b974ffb9…`), unchanged; HeadlessChrome/151.0.7922.71, Node 24.18.0, puppeteer-core 25.12.0                                                                                                                                                                                                                                                              |
| Settings           | `stage2e-integrated-mad-no-triggers.json` (SHA-256 `a9eacc9e041e…`, the Stage 4F authority settings) with **`autoPrestige=false` in every arm**. The late save is prestige-ready and reset into a new game within 160 periods otherwise. A second configuration adds `autoMarket=true` (section E).                                                                                                                        |
| Seed / epoch       | 42 / runner default (2026-09-21)                                                                                                                                                                                                                                                                                                                                                                                           |

Saves (`test-artifacts/benchmark/slice0/saves/`). Each session's loaded state was checked against the save (species,
day, technology count, resets). All passed; none produced a fresh game.

| Save  | File                               | SHA-256     |     Day | Techs | Stage                          |
| ----- | ---------------------------------- | ----------- | ------: | ----: | ------------------------------ |
| early | `deadspace-early-day14.json`       | `701d69f9…` |      14 |    19 | first civilization             |
| mid   | `stage2f-through-7600-export.json` | `7c25f5ce…` |     394 |    37 | the Stage 4F save, pre-space   |
| late  | `deadspace-late-2026-10-12.txt`    | `e2c9d1d4…` | 502,447 |    99 | space era, 38 space structures |

### Execution modes

- **A, native:** `empty` bundle; the page is served identically, with no automation code.
- **B, inactive:** production bundle, `masterScriptToggle=false`.
- **C, active:** production bundle, intended settings.

Every window is 400 warm-up periods, then 800 measured periods (100 work ticks at `tickRate` 8), in a fresh browser
context. A and B exports were byte-identical at the end of every window. C diverges from the save as automation
acts; the game-listener comparisons in section C therefore use matched short windows, not long timelines.

| Experiment              | Bundle / layer                                       | Repeats                             | Use                                                |
| ----------------------- | ---------------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| Uninstrumented baseline | production / empty, `perf` off                       | 4 per save × arm, alternating order | the CPU authority                                  |
| Latency                 | `marker` + bridge `callbackProfile`                  | 2 per save × arm                    | per-period latency split game / automation / cycle |
| V8 sampling profile     | production / empty, profiler at 250 µs               | 2 per save × arm                    | function and stack attribution                     |
| Phase breakdown         | `phases`, `perf` on                                  | 2 per save (active)                 | per-call / per-tick phase statistics               |
| Overhead                | production, production+`[EA perf]`, marker, phases   | 2 per save (mid, late)              | measurement cost                                   |
| Chrome trace            | production / empty, 200 periods                      | 1 per save × {native, active}       | layout, paint, GC, threads                         |
| Real-time               | native timers and Worker, 400 periods                | 1 per save × {native, active}       | ordinary-gameplay stalls                           |
| Market-on               | `autoMarket=true` baseline ×3, phases ×2, profile ×2 | mid, late                           | Market decomposition                               |

Authority is Stage 4F.3's: **renderer-process CPU** (renderer rows of `SystemInfo.getProcessInfo` summed), with CDP
`TaskDuration` as the cross-check. `ScriptDuration` is recorded only for reference.

### Calibration

Workload: a 250 ms integer loop in the game page, run three ways. The third is the bridge's own shape: an awaited
MessageChannel task, then a promise continuation.

| Path                              | Renderer CPU | `TaskDuration` | `ScriptDuration` | V8 samples in the workload |
| --------------------------------- | -----------: | -------------: | ---------------: | -------------------------: |
| synchronous `Runtime.evaluate`    |  0.25–0.30 s |  0.250–0.260 s |            **0** |                 244–250 ms |
| MessageChannel task handler       |  0.25–0.26 s |        0.250 s |          0.250 s |                 247–250 ms |
| promise continuation after a task |  0.25–0.26 s |        0.250 s |            **0** |                 242–250 ms |

- The V8 sampling profiler captures controlled execution on every path (97–100%), and **enabling it did not change
  renderer CPU** in the measured windows: late active 23.2–23.3 s profiled vs 23.2–23.7 s unprofiled.
- **Refinement of Stage 4F.3:** `ScriptDuration` misses work that runs in a **promise continuation**, not only work
  inside `Runtime.evaluate`. The bridge resumes every period after `await nextTask()`, so all period work lands
  there.
- **V8 function names are unreliable.** The same calibration function was reported once as
  `globalThis.__eaCalibrationBurn` and once with an empty name. Production's worker wrapper is reported as `wrapper`,
  not `messageListener`. All attribution is therefore keyed by script URL plus line:column. Module ownership comes
  from esbuild's `// src/…` (automation) and `// …/source/src/…` (game snapshot) module markers; neither bundle is
  minified, so names come from the served source.
- **The page's native clock is coarsened to 0.1 ms** (no cross-origin isolation). Every phase timer, including the
  production `[EA perf]` timers, quantizes calls shorter than 0.1 ms. Per-call quantiles below 0.1 ms in section E
  are bucket edges, not measurements.
- Collector clock read: 0.065 µs. Probe wrapper: 0.29 µs per call over a no-op.

### Instrumentation overhead (renderer CPU per 800-period active window)

| Layer         | mid                                       | late                                   |
| ------------- | ----------------------------------------- | -------------------------------------- |
| production    | 13.59, 12.42 s (baseline median 13.36)    | 23.14, 23.43 s (baseline median 23.38) |
| + `[EA perf]` | 13.96, 13.95                              | 23.67, 23.65                           |
| marker        | 13.81, 13.63                              | 22.69, 23.53                           |
| phases        | 13.99, 13.52 (separate run: 14.18, 14.35) | 23.42, 23.19 (separate run: 24.14)     |

`[EA perf]` and both experiment layers stay within about +1–7%, at or near the run-to-run noise. Phase figures are
elapsed wall time under that overhead and are not added to CPU totals. The trace run added +2–7% per period.

### Uncertainty

Repeated baseline windows varied by 0.2–0.6 s (2–5%). A single plain window read 12.42 s against a 13.36 s median,
which is why every comparison below uses medians and paired same-repeat deltas. Real-time spot checks are single runs.

## B. Existing logging audit

| Instrument                                                       | What it is                                                                              | Accuracy and limits                                                                                                                                                                                                                     | Missing or misleading                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[EA perf]` phase samples (`diagnostics.ts` `recordPerformance`) | exclusive elapsed ms per phase name: count, total, `maxMs`; flushed every 25 work ticks | wall time on the native clock (0.1 ms coarsening); nested exclusive subtraction works: the cycle wrapper equals `tick` within 0.02 ms, and exclusive phases sum to `tick` + 0.26–0.29 ms (0.2–0.6%), a small double count not localized | `maxMs` is per call, not per tick; no distribution; 25-tick averages hide outliers (late p50 cycle 122 ms vs max 141; Market-on max 319 ms); with `masterScriptToggle` off `runCycle` returns before its `try`, so `tick` is never recorded and no summary ever flushes |
| `perTickMs`                                                      | phase total ÷ work ticks in the batch                                                   | right for cycle phases                                                                                                                                                                                                                  | `period.*` phases run on every period (1,600 calls per 200 work ticks) but are divided by work ticks, so the column is 8× the per-period cost; it is a per-work-tick amortization, not a per-period value                                                               |
| counters (`recordCount`)                                         | `ticks` = number of calls, `total`, `max` = largest single amount                       | —                                                                                                                                                                                                                                       | `ticks` is misnamed (calls); `max` is per call, not per work tick; tallies made outside a cycle (`period.*`) are divided by work ticks too                                                                                                                              |
| `tick`                                                           | elapsed `runCycle` body                                                                 | covers the synchronous cycle only                                                                                                                                                                                                       | misses that period's `period.wake`, the game listener's extra time with automation present, post-listener microtasks (Vue flush), layout/paint, GC. Measured share of the automation CPU delta: 62% early, 76% mid, 85% late                                            |
| `tick.scaffolding`                                               | cycle elapsed minus every recorded exclusive phase                                      | correct by construction                                                                                                                                                                                                                 | 1.6 / 2.0 / 2.6 ms per work tick (3.4 / 3.7 / 2.3% of the cycle), small but unattributed                                                                                                                                                                                |
| `period.wake` and subphases                                      | per-period cadence and settings refresh                                                 | 0.012–0.019 ms mean per skipped period, max 0.2 ms                                                                                                                                                                                      | effectively free; its normal summary is 8× inflated (see `perTickMs`)                                                                                                                                                                                                   |
| bridge `callbackProfile`                                         | native-clock bracket around the main-loop dispatch                                      | equals the marker's listener total within 0.01 ms (one listener, so no task boundary inside)                                                                                                                                            | synchronous only: excludes the listener's microtasks, rendering and GC; whole callback, not automation-only                                                                                                                                                             |
| CDP `ScriptDuration`                                             | page-target script time                                                                 | **invalid here:** 0 for promise-continuation work                                                                                                                                                                                       | not usable for any comparison on the exact runner                                                                                                                                                                                                                       |
| CDP `TaskDuration`                                               | page task occupancy                                                                     | tracked a 250 ms workload to ±1%; 0.86–0.91× renderer CPU in long windows                                                                                                                                                               | page-wide; not per script                                                                                                                                                                                                                                               |
| renderer process CPU                                             | all renderer threads, 10 ms granularity                                                 | the authority                                                                                                                                                                                                                           | includes compositor and thread-pool work; the V8 sampler sees 84–89% of it (late active 19.66 s sampled vs 23.4 s CPU)                                                                                                                                                  |
| control ledger (`controlUsage`)                                  | calls per `<element>.<method>`                                                          | exact                                                                                                                                                                                                                                   | no per-tick split in production; reads and mutations are mixed in one ledger                                                                                                                                                                                            |

Work per work tick (production ledger / phases collector):

- early: 379 control calls, 1.07 native Research draws, 87 price probes;
- mid: 482 control calls, 1.05 draws, 126 probes;
- late: 1,491 control calls, 1.0 draws, 443 probes, 429 `on_cap` calls (11 per space structure).

Exact runner vs ordinary pacing: real-time native periods cost more renderer CPU (mid 14.3 vs 8.3 ms per period),
because real animation frames and paint run at display rate. The automation increment per work tick was 83 ms (mid)
and 85 ms (late) in real time, against 67 / 130 ms controlled. The late real-time window started 200 periods earlier
and its cycle was shorter (mean 82.5 ms vs 110.5 ms), so the late pair is not matched state; treat it as a spot check
of stall behaviour, not a CPU comparison.

**Recommended permanent-logger changes** (not made here):

- report `period.*` per period;
- add a per-work-tick maximum and a p95 for `tick`;
- rename counter `ticks`→`calls` and `max`→`maxPerCall`;
- record `tick` and flush when the master toggle is off;
- state the 0.1 ms clock resolution in the summary.

None is a correctness defect in automation behaviour.

## C. Overall runtime cost

Uninstrumented, median of 4 alternating-order repeats, 800 periods = 100 work ticks.

| Save  | Arm               | Renderer CPU | ms/period | `TaskDuration` | DOM nodes (end) | JS heap |
| ----- | ----------------- | -----------: | --------: | -------------: | --------------: | ------: |
| early | native            |       4.77 s |      5.96 |         4.21 s |           2,427 | 20.8 MB |
| early | inactive          |       5.07 s |      6.33 |         4.44 s |           4,084 | 24.7 MB |
| early | active            |      11.45 s |     14.31 |        10.07 s |          58,852 | 48.3 MB |
| mid   | native            |       6.62 s |      8.27 |         5.73 s |           3,419 | 21.5 MB |
| mid   | inactive          |       6.64 s |      8.30 |         5.74 s |           5,010 | 25.6 MB |
| mid   | active            |      13.36 s |     16.70 |        11.73 s |         114,735 | 69.4 MB |
| late  | native            |      10.47 s |     13.09 |         9.26 s |           2,966 | 29.2 MB |
| late  | inactive          |      10.25 s |     12.81 |         9.15 s |           4,813 | 37.2 MB |
| late  | active            |      23.38 s |     29.23 |        21.05 s |          46,290 | 45.3 MB |
| mid   | active, Market on |      14.67 s |     18.34 |        12.83 s |         69–121k |       — |
| late  | active, Market on |      24.65 s |     30.81 |        22.13 s |          58–62k |       — |

| Save  | Active − native, paired, per work tick | Share of active CPU | Inactive − native, paired (s per window) |
| ----- | -------------------------------------: | ------------------: | ---------------------------------------- |
| early |                        65.9 ms (63–69) |               57.6% | 0.00, 0.02, 0.57, 0.05                   |
| mid   |                        66.7 ms (65–71) |               49.9% | 0.02, 0.04, 0.26, −1.14                  |
| late  |                     130.5 ms (127–132) |               55.8% | −0.21, −0.34, −0.31, 0.18                |

- **Inactive automation** still subscribes, wakes on every period, refreshes effective settings, and runs a stub
  cycle that draws the settings container and planning panels. Measured with the marker: 0.012–0.017 ms per skipped
  period and a 0.12 ms stub cycle. Its CPU difference is below the counter's resolution, and its exports equal
  native.
- **DOM node counts are a secondary diagnostic.** The counter includes detached nodes awaiting GC. Within single
  windows they grew 16k→37k (mid real time) and 12.7k→62k (late Market-on), and fell back on major GC in one window
  (heap 66→36 MB). That is churn from discarded draw DOM; a leak is not established.

### Latency (marker + callback profile, 1,600 periods, 200 work ticks per row)

| Save / arm   | All periods p50 / p95 / p99 / max | Work-tick listener p50 / p95 / p99 / max | Work cycle p50 / p95 / p99 / max (mean) | Automation on skipped periods (mean / max) | Long tasks > 50 ms |
| ------------ | --------------------------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------ | -----------------: |
| early native | 2.9 / 9.2 / 19.1 / 20.2           | —                                        | —                                       | —                                          |                  2 |
| early active | 3.6 / 51.9 / 64.0 / 116.8         | 50.1 / 74.9 / 109.2 / 116.7              | 39.6 / 63.4 / 101.6 / 107.1 (41.0)      | 0.013 / 0.1                                |                160 |
| mid native   | 3.7 / 11.1 / 21.4 / 23.2          | —                                        | —                                       | —                                          |                  2 |
| mid active   | 4.1 / 63.2 / 75.0 / 118.3         | 62.0 / 79.8 / 113.3 / 118.3              | 51.0 / 64.8 / 102.4 / 107.8 (50.4)      | 0.012 / 0.2                                |                220 |
| late native  | 5.8 / 18.9 / 30.9 / 32.5          | —                                        | —                                       | —                                          |                  2 |
| late active  | 6.2 / 138.0 / 152.0 / 166.4       | 135.9 / 153.3 / 156.0 / 166.4            | 117.3 / 124.1 / 130.4 / 137.1 (110.5)   | 0.019 / 0.2                                |                302 |

All values in ms. The game's own listener is heavier on work-tick periods even when automation is off: early
inactive 9.1 ms on work-tick periods vs 3.6 ms otherwise. The game's longer loops fall on the same cadence.

**Window reconciliation.** Per work tick, the automation CPU delta splits into:

|                                                   |    early |      mid |    late |
| ------------------------------------------------- | -------: | -------: | ------: |
| synchronous work cycle                            |     41.0 |     50.4 |   110.5 |
| extra game-listener time with automation present  |      9.4 |      4.9 |     5.7 |
| extra post-listener work (microtasks, render, GC) |     13.4 |     12.1 |    15.6 |
| **total**                                         | **63.9** | **67.5** | **132** |

Each total equals the latency-run CPU delta. The middle row is the game listener measured on the same periods with
and without automation.

**Real time**, the page's own timers and Worker, 400 periods: period cadence was undisturbed (250 ms mid, 200 ms
late; gap p99 265 / 206 ms).

|                     |          Long tasks |   p50 / max | Work cycle mean / max |
| ------------------- | ------------------: | ----------: | --------------------: |
| mid active          | 33 of 50 work ticks |  66 / 90 ms |            46 / 69 ms |
| late active         |            50 of 50 | 92 / 158 ms |           83 / 125 ms |
| native, either save |                   0 |           — |                     — |

**The controlled results correspond to real stalls:** one main-thread block of 60–160 ms every 1.6–2 s of play.

## D. CPU hotspot ranking

V8 sampling at 250 µs, two 800-period profiles per save and arm, averaged; ms per profile window = per 100 work
ticks. Sampled totals per window:

| Save  |   native |    active |
| ----- | -------: | --------: |
| early | 4,303 ms |  9,381 ms |
| mid   | 5,671 ms | 11,207 ms |
| late  | 8,510 ms | 19,660 ms |

Causal split of active samples. A sample is _automation-initiated_ when any automation frame other than the
worker-capture pass-through wrapper is on its stack. Values are game / automation-initiated / program / GC:

| Save  |  game | automation-initiated | program |  GC |
| ----- | ----: | -------------------: | ------: | --: |
| early | 4,814 |                3,786 |     670 |  86 |
| mid   | 5,567 |                4,677 |     845 |  90 |
| late  | 8,255 |               10,076 |   1,108 | 189 |

The native arm's game time is 3,901 / 5,049 / 7,628. Self time in automation JS is only 1,722 / 2,083 / 3,358 of
those samples; the rest of automation-initiated time is game and Vue code that automation invokes.

Vue's reactive proxy traps (`get`/`set`/`has`/`ownKeys`) take 2.5 / 3.0 / 6.2 s per window, against 1.4 / 1.8 / 3.1 s
native. Of the automation-initiated part (0.9 / 1.1 / 3.1 s), direct automation reads such as `readProperty`,
`readCapturedActionAvailability` and `readCost` account for only ≈0.3–0.6 s; the rest is game code automation calls
(draws, `setData`).

The chrome trace (200 periods) adds little rendering on top: style + layout + paint + commit grew from 203 to 273 ms
(mid) and 313 to 343 ms (late), +1.2–2.8 ms per work tick. Main-thread `ParseHTML` rose from 0 to 29k events, 65 ms
(late), from game templates built during draws. GC on the main thread rose by +1.6 ms per late work tick.
Compositor and thread-pool threads stayed under 75 ms each. Automation cost is main-thread JavaScript.

Top 30 by self time (late active; the mid column matches on location). _% auto-initiated_ is the share of that
function's self time with an automation frame on the stack:

|   # | Function                                 | Owner              | Module:line                                                                    | Self late | % auto-initiated | Incl late | Self mid | Attribution               |
| --: | ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------ | --------: | ---------------: | --------: | -------: | ------------------------- |
|   1 | `get`                                    | vue (game library) | —                                                                              |   5593.69 |              51% |    5614.4 |  2630.29 | high: URL                 |
|   2 | `(program)`                              | program            | —                                                                              |   1108.39 |               0% |   1108.39 |   844.61 | medium: V8 non-JS bucket  |
|   3 | `sizeApproximation`                      | game               | vars.js:4150                                                                   |     711.5 |               8% |    758.62 |   646.56 | high: URL + module marker |
|   4 | `fastLoop`                               | game               | main.js:148204                                                                 |    542.54 |               0% |   4100.87 |   431.15 | high: URL + module marker |
|   5 | `querySelectorAll`                       | native             | —                                                                              |    533.23 |              53% |    533.23 |   463.51 | medium: builtin           |
|   6 | `set`                                    | vue (game library) | —                                                                              |    506.94 |              22% |    584.65 |   234.65 | high: URL                 |
|   7 | `govActive`                              | game               | governor.js:99182                                                              |    479.26 |              74% |   1005.87 |    20.78 | high: URL + module marker |
|   8 | `parseHTML`                              | game               | dom.js:3                                                                       |    361.46 |             100% |    378.18 |   166.03 | high: URL + module marker |
|   9 | `costMultiplier2`                        | game               | functions.js:137103                                                            |     266.9 |              78% |    725.59 |   115.57 | high: URL + module marker |
|  10 | `modRes`                                 | game               | functions.js:136916                                                            |    241.63 |               6% |    842.69 |     59.8 | high: URL + module marker |
|  11 | `spaceCostMultiplier`                    | game               | functions.js:137174                                                            |    227.19 |              74% |    951.63 |        — | high: URL + module marker |
|  12 | `readMechanicsEntry`                     | automation         | adapters/evolve/captured-game-mechanics.ts:2356                                |    212.74 |             100% |    212.74 |   156.57 | high: URL + module marker |
|  13 | `render`                                 | native             | —                                                                              |    194.56 |               0% |   1279.49 |        — | medium: builtin           |
|  14 | `adjustCosts`                            | game               | functions.js:138384                                                            |    190.09 |              86% |   2389.25 |    83.15 | high: URL + module marker |
|  15 | `(garbage collector)`                    | gc                 | —                                                                              |    189.42 |               0% |    189.42 |    90.27 | high: V8 GC bucket        |
|  16 | `readCapturedActionAvailability`         | automation         | adapters/evolve/progression/build/captured-building-availability.ts:1854       |    180.45 |             100% |    361.14 |     72.3 | high: URL + module marker |
|  17 | `technocracy`                            | game               | civics.js:101266                                                               |    169.22 |              86% |    582.11 |        — | high: URL + module marker |
|  18 | `toNodes`                                | game               | dom.js:8                                                                       |    159.82 |              98% |    802.96 |   132.36 | high: URL + module marker |
|  19 | `invokeControl`                          | automation         | adapters/evolve/vue-capture.ts:3989                                            |    149.96 |             100% |   5761.25 |    21.42 | high: URL + module marker |
|  20 | `harmonyEffect`                          | game               | functions.js:137223                                                            |    144.62 |              73% |    327.01 |        — | high: URL + module marker |
|  21 | `readCost`                               | automation         | adapters/evolve/captured-action-costs.ts:6371                                  |    133.31 |             100% |   2503.84 |     6.21 | high: URL + module marker |
|  22 | `countKeys`                              | automation         | adapters/evolve/progression-epoch.ts:4817                                      |    132.81 |             100% |    168.96 |    129.9 | high: URL + module marker |
|  23 | `hasCapturedProjectStorageDemand`        | automation         | adapters/evolve/economy/resources/captured-resource-demand.ts:26659            |     131.9 |             100% |     131.9 |   145.99 | high: URL + module marker |
|  24 | `setData`                                | game               | functions.js:136740                                                            |    128.13 |             100% |   2470.73 |    23.24 | high: URL + module marker |
|  25 | `serialize`                              | game               | save.js:1139                                                                   |    126.54 |               0% |     306.7 |   102.55 | high: URL + module marker |
|  26 | `readCapturedBuildingUnlockStateRecords` | automation         | adapters/evolve/progression/build/captured-building-unlock-observation.ts:9565 |    124.07 |             100% |    194.38 |    85.92 | high: URL + module marker |
|  27 | `tallyRecord`                            | automation         | adapters/evolve/progression-epoch.ts:4808                                      |    123.08 |             100% |    165.25 |    51.74 | high: URL + module marker |
|  28 | `execGameLoops`                          | game               | main.js:147896                                                                 |    116.43 |               0% |   6741.42 |    79.98 | high: URL + module marker |
|  29 | `technoAdjust`                           | game               | functions.js:138562                                                            |     109.3 |              84% |    1019.4 |     7.42 | high: URL + module marker |
|  30 | `forEach`                                | game               | main.js:159778                                                                 |    108.81 |               0% |    123.43 |   150.93 | high: URL + module marker |

|   # | Automation function (inclusive)   | Module:line                                                            | Incl late | Incl mid | Self late |
| --: | --------------------------------- | ---------------------------------------------------------------------- | --------: | -------: | --------: |
|   1 | `runCycle`                        | bootstrap/captured-runtime-control.ts:61004                            |  10060.08 |  4661.77 |      0.84 |
|   2 | `invokeControl`                   | adapters/evolve/vue-capture.ts:3989                                    |   5761.25 |  2124.22 |    149.96 |
|   3 | `read`                            | adapters/evolve/discovery-scope-cache.ts:4780                          |   3125.55 |  1584.64 |      0.28 |
|   4 | `sampleOfferedTechs`              | bootstrap/captured-progression-control.ts:12200                        |   3064.46 |  1580.05 |      1.14 |
|   5 | `invoke`                          | adapters/evolve/vue-capture.ts:4181                                    |   3058.06 |   1590.1 |      4.38 |
|   6 | `ensureDemandResearchObservation` | bootstrap/captured-runtime-control.ts:59884                            |   3049.22 |  1570.83 |       0.3 |
|   7 | `read`                            | adapters/evolve/progression/research/captured-tech-catalog.ts:5218     |   3016.69 |  1541.02 |      1.98 |
|   8 | `captureNativeDraw`               | adapters/evolve/progression/research/captured-tech-catalog.ts:5233     |   2994.51 |  1516.71 |         0 |
|   9 | `discover`                        | adapters/evolve/captured-tab-discovery.ts:774                          |   2994.23 |  1542.01 |      4.82 |
|  10 | `probePrice`                      | adapters/evolve/captured-action-costs.ts:6358                          |   2576.68 |   435.83 |     38.64 |
|  11 | `readCost`                        | adapters/evolve/captured-action-costs.ts:6371                          |   2503.84 |   453.24 |    133.31 |
|  12 | `beginCycle`                      | adapters/evolve/progression/construction/captured-construction.ts:7224 |   1790.27 |   672.73 |         5 |
|  13 | `return`                          | adapters/evolve/progression/build/captured-build-policy.ts:6179        |   1703.37 |   871.47 |     55.92 |
|  14 | `beginCycle`                      | adapters/evolve/progression/build/captured-build.ts:6778               |   1414.94 |   452.19 |     11.24 |
|  15 | `runCycle`                        | bootstrap/captured-construction-control.ts:8370                        |   1332.22 |   512.52 |      0.53 |
|  16 | `runConstructionCycle`            | bootstrap/captured-progression-control.ts:12517                        |   1332.22 |   512.81 |         0 |
|  17 | `runBuildAutomation`              | application/build.ts:8163                                              |   1331.69 |   512.52 |      0.72 |
|  18 | `runBuildCycle`                   | application/build.ts:8171                                              |   1327.53 |   509.99 |      6.29 |
|  19 | `readBuildingUnlocks`             | bootstrap/captured-progression-control.ts:12301                        |   1241.34 |   616.07 |       7.2 |
|  20 | `sample`                          | adapters/evolve/economy/resources/captured-resource-demand.ts:27801    |    1024.3 |   516.43 |      0.56 |
|  21 | `sample`                          | adapters/evolve/economy/resources/captured-resource-demand.ts:27355    |   1023.46 |   516.43 |      2.57 |
|  22 | `read`                            | adapters/evolve/progression/build/captured-building-unlocks.ts:9607    |    946.99 |   521.61 |     82.26 |
|  23 | `runPriceSensitivePhase`          | bootstrap/captured-runtime-control.ts:60042                            |    946.51 |   521.95 |         0 |
|  24 | `run`                             | application/storage-allocation.ts:39363                                |     934.2 |   421.24 |      0.84 |
|  25 | `sampleMeasure`                   | adapters/evolve/economy/resources/captured-resource-demand.ts:27359    |    928.39 |     1.72 |      1.15 |
|  26 | `(anonymous 61163:11)`            | bootstrap/captured-runtime-control.ts:61163                            |    916.82 |   503.98 |      0.78 |
|  27 | `runUnmeasuredJobs`               | adapters/evolve/civic/captured-ordinary-jobs.ts:24028                  |    906.25 |    497.3 |         0 |
|  28 | `establishOrdering`               | adapters/evolve/progression/construction/captured-construction.ts:7409 |     903.2 |   335.31 |       0.5 |
|  29 | `establishOrdering`               | bootstrap/captured-construction-control.ts:8361                        |     903.2 |   335.31 |         0 |
|  30 | `prepare`                         | adapters/evolve/civic/captured-ordinary-jobs.ts:24739                  |    902.47 |   468.95 |      0.28 |

| Automation frame → game callee (late)                                                                                                 |      ms |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------: |
| `invokeControl (adapters/evolve/vue-capture.ts) -> swapTab (index.js)`                                                                | 2938.34 |
| `invokeControl (adapters/evolve/vue-capture.ts) -> setData (functions.js)`                                                            | 2470.73 |
| `readCapturedActionAvailability (adapters/evolve/progression/build/captured-building-availability.ts) -> get (lib:vue)`               |  154.48 |
| `invokeControl (adapters/evolve/vue-capture.ts) -> action (actions.js)`                                                               |  134.18 |
| `readCost (adapters/evolve/captured-action-costs.ts) -> e0 (lib:vue)`                                                                 |  108.45 |
| `function (adapters/evolve/progression/research/captured-arpa-mechanics.ts) -> forEach (arpa.js)`                                     |   97.33 |
| `readProperty (adapters/validation.ts) -> get (lib:vue)`                                                                              |    83.8 |
| `readCapturedBuildingUnlockStateRecords (adapters/evolve/progression/build/captured-building-unlock-observation.ts) -> get (lib:vue)` |   70.31 |
| `readCapturedResourceView (adapters/evolve/captured-affordability.ts) -> get (lib:vue)`                                               |    52.1 |
| `observe (adapters/evolve/vue-capture.ts) -> e.watch (lib:vue)`                                                                       |    51.4 |

| Game function (late, inclusive) | Module:line         |    Incl |   Self |
| ------------------------------- | ------------------- | ------: | -----: |
| `fastLoop`                      | main.js:148204      | 4100.87 | 542.54 |
| `swapTab`                       | index.js:28505      | 2938.34 |   0.56 |
| `loadTab`                       | index.js:28829      | 2937.78 |   2.73 |
| `drawTech`                      | actions.js:118233   |    2862 |  21.65 |
| `setData`                       | functions.js:136740 | 2470.73 | 128.13 |
| `adjustCosts`                   | functions.js:138384 | 2389.25 | 190.09 |
| `forEach`                       | actions.js:118317   | 2178.71 |   5.01 |
| `addAction`                     | actions.js:118331   | 2175.79 |  11.26 |
| `setAction`                     | actions.js:118335   | 2163.68 |  49.66 |
| `forEach`                       | actions.js:118326   | 2107.62 |   1.61 |
| `midLoop`                       | main.js:155380      | 2077.81 |   80.4 |
| `newCosts.<computed>`           | functions.js:138577 | 1366.26 |  16.05 |

| Phase (exclusive)                                                 | early ms/tick | mid ms/tick | late ms/tick | calls/tick late | per-tick p95 late | per-tick max late | % of cycle late |
| ----------------------------------------------------------------- | ------------: | ----------: | -----------: | --------------: | ----------------: | ----------------: | --------------: |
| `research.draw.native-switch-drawTech-and-dom-generation`         |         12.59 |      15.598 |       32.599 |               1 |             37.21 |              48.8 |           28.12 |
| `autoBuild.beginCycle`                                            |         3.139 |       3.706 |        9.785 |               1 |            11.705 |              12.5 |            8.44 |
| `construction saving discovery`                                   |          2.87 |       3.472 |        9.524 |               1 |              10.9 |              12.7 |            8.22 |
| `jobs.full.buildWeighting`                                        |         2.146 |       2.604 |        8.055 |              73 |               9.4 |                11 |            6.95 |
| `demand.sample.build`                                             |         1.536 |       1.973 |        6.913 |            3.06 |              8.12 |              13.5 |            5.96 |
| `autoFactory`                                                     |         0.437 |       0.482 |        7.832 |               1 |               9.1 |              10.9 |            6.76 |
| `autoStorage`                                                     |         2.798 |       3.311 |        4.221 |               1 |                 5 |               6.7 |            3.64 |
| `action-cost.native-batch`                                        |             — |       1.016 |        5.116 |               1 |               5.8 |               7.8 |            4.41 |
| `autoStorage.read.building-targets`                               |             — |       1.949 |        3.223 |               1 |               3.7 |               5.6 |            2.78 |
| `construction demand preparation`                                 |         1.609 |        1.78 |        3.074 |               1 |               3.5 |               5.1 |            2.65 |
| `tick.scaffolding`                                                |         1.589 |       2.044 |        2.639 |               1 |             3.005 |               4.5 |            2.28 |
| `buildingAlwaysClick`                                             |         2.263 |       2.261 |        1.927 |               1 |               2.2 |               3.9 |            1.66 |
| `demand.sample.inputs`                                            |         1.572 |       1.401 |        1.153 |             5.1 |               1.3 |               2.5 |            0.99 |
| `discovery.capability-check build-controls civTabs:1/spaceTabs:0` |         1.084 |        1.26 |        1.259 |               6 |               1.6 |               3.2 |            1.09 |
| `jobs.full.craftCosts`                                            |         1.381 |       1.256 |        1.259 |              11 |               1.6 |               3.1 |            1.09 |
| `demand.sample.total`                                             |         1.324 |       1.179 |        0.955 |            1.02 |               1.2 |               2.1 |            0.82 |
| `demand.sample.research-observation`                              |          0.77 |       0.938 |        1.065 |            1.02 |               1.3 |              10.8 |            0.92 |
| `discovery.capability-check build-controls civTabs:1/spaceTabs:1` |             — |           — |        1.989 |               6 |               2.3 |               4.1 |            1.72 |
| `project demand discovery`                                        |         0.637 |       0.585 |        1.223 |               1 |               1.4 |               3.1 |            1.06 |
| `autoBuild.sampleConflict`                                        |         1.385 |       0.201 |        1.553 |           11.85 |                 2 |               2.3 |            1.34 |
| `autoBuild.sampleCompetition`                                     |         0.042 |        0.13 |        1.396 |           10.15 |                 2 |               3.8 |             1.2 |
| `demand.sample.projects`                                          |         0.139 |       0.143 |        1.133 |            2.04 |               1.3 |               2.6 |            0.98 |
| `goal.mad.research-candidates`                                    |         1.381 |       1.131 |        0.023 |               1 |               0.1 |               0.1 |            0.02 |
| `autoStorage.plan`                                                |             0 |       0.503 |         0.63 |               1 |               0.8 |               2.4 |            0.54 |
| `autoStorage.read.resource-inputs`                                |             — |       0.518 |        0.533 |               1 |               0.7 |               0.7 |            0.46 |
| `autoBuild.sampleCandidate`                                       |         0.099 |       0.251 |        0.725 |              71 |               1.1 |               1.5 |            0.63 |
| `autoResearch`                                                    |         0.418 |       0.399 |         0.51 |               1 |               0.6 |               2.1 |            0.44 |
| `jobs.full.catalog`                                               |         0.372 |       0.389 |        0.416 |               1 |               0.5 |               0.6 |            0.36 |

Exclusive-phase sums: early 46.82, mid 55.75, late 116.15 ms/tick; recon {"early":{"cycleWrapperMsPerTick":46.549,"tickTimerMsPerTick":46.531,"sumExclusivePhasesMsPerTick":46.824,"scaffoldingMsPerTick":1.589},"mid":{"cycleWrapperMsPerTick":55.489,"tickTimerMsPerTick":55.469,"sumExclusivePhasesMsPerTick":55.75,"scaffoldingMsPerTick":2.044},"late":{"cycleWrapperMsPerTick":115.918,"tickTimerMsPerTick":115.897,"sumExclusivePhasesMsPerTick":116.155,"scaffoldingMsPerTick":2.639}}

| Research subphase                                         | early ms/tick |    mid |   late | calls/tick (e/m/l) |
| --------------------------------------------------------- | ------------: | -----: | -----: | ------------------ |
| `research.draw.native-switch-drawTech-and-dom-generation` |         12.59 | 15.598 | 32.599 | 1.07 / 1.05 / 1    |
| `research.catalog.registry-read`                          |         0.214 |  0.234 |  0.247 | 1.07 / 1.05 / 1    |
| `research.computed-requirements.read`                     |             — |      — |      — | — / — / —          |
| `research.dom.capture.granted`                            |             — |      — |      — | — / — / —          |
| `research.binding.restate`                                |         0.011 |  0.017 |  0.008 | 1.07 / 1.05 / 1    |
| `research.binding.generation-capture`                     |          0.02 |  0.028 |  0.017 | 1.07 / 1.05 / 1    |
| `research.binding.capture`                                |         0.003 |  0.011 |  0.002 | 15.4 / 23.73 / 6   |
| `demand.sample.research-observation`                      |          0.77 |  0.938 |  1.065 | 1.4 / 1.24 / 1.02  |
| `demand.sample.research`                                  |         0.228 |  0.237 |  0.238 | 2.8 / 2.48 / 2.04  |
| `autoResearch.read`                                       |          0.02 |  0.025 |  0.011 | 1 / 1 / 1          |
| `autoResearch.plan`                                       |         0.003 |  0.005 |  0.002 | 1 / 1 / 1          |
| `autoResearch.execute`                                    |         0.083 |  0.038 |      — | 0.07 / 0.05 / —    |
| `discovery.draw research-catalog civTabs:3`               |         0.062 |  0.072 |  0.111 | 1.07 / 1.05 / 1    |

Ownership confidence: high for automation and game rows (served URL plus module marker, unminified source), high for
GC, medium for `(program)` (non-JS browser work V8 does not break down) and for builtins (charged to the nearest JS
caller). No row was named from an unclear profile. Profiler costs locate work; they are not a promise of savings.

## E. Automation phase breakdown

Phases bundle, 2 × 800 periods = 200 work ticks per save; elapsed ms under ≈1–7% instrumentation overhead.
Reconciliation and the 28 largest exclusive phases are in the table above. Cycle mean / p95 / max: early 46.5 / 79.5
/ 109.6, mid 55.5 / 69.8 / 117.1, late 115.9 / 127.6 / 141.0 ms.

### Research and discovery

The Research subphase table above holds the per-phase timings.

- **Fresh native Research draws:** 1.07 / 1.05 / 1.00 per work tick. Every work tick draws once
  (`research.observation.invalidated.processed-cycle` = 1 per tick). It draws a second time only on the 14 / 10 / 0
  ticks that bought a technology (post-purchase redraw).
- **Requester:** the resource-demand sampler (`research.observation.sample-requester.resource-demand`, offers-only).
  `autoResearch` reuses that draw (`research.observation.cache-hits` ≈1 per tick).
- **Draws without a purchase:** 200 / 214, 200 / 210 and 200 / 200. 2,188 of 2,518 ms (early), 2,836 of 3,120 ms
  (mid) and 6,520 of 6,520 ms (late) of draw time fell on ticks with no Research purchase.
- **Draws producing no new control:** 1.04 / 1.01 / 1.00 per tick (`discovery.observation-only-draw`).
- **Registry validation:** 0.21–0.25 ms per draw; the identity-only change already landed. Binding capture and
  restatement total ≤0.03 ms. DOM row parsing and control-generation capture happen inside the draw phase and are not
  separable without game instrumentation. In V8 the draw is `drawTech` → `addAction` / `setAction` → `adjustCosts`
  inside the game's `swapTab` → `loadTab` (2.9 s per late window), plus `parseHTML` / `toNodes`.
- **Source of the per-tick redraw:** `beginProcessedCycle()` (`src/bootstrap/captured-progression-control.ts:737`)
  calls `clearResearchSample()` and invalidates `RESEARCH_SCOPE` unconditionally, every cycle. The epoch and
  row-binding invalidation in `invalidateStaleCapturedResearchObservation()` would otherwise keep the observation.

### Market and trade routes (`autoMarket=true`, mid and late)

Market adds ≈13 ms per work tick of renderer CPU on both saves (paired medians: mid 14.67 vs 13.36 s, late 24.65 vs
23.38 s per window). Per work tick:

| Item                                                                 |             mid |                             late |
| -------------------------------------------------------------------- | --------------: | -------------------------------: |
| `autoMarket` inclusive                                               |        10.56 ms |             17.19 ms (max 207.8) |
| — ordinary Market loop (exclusive)                                   |            3.56 |                             4.36 |
| — `autoMarket.adjustTradeRoutes`                                     |            6.99 |                  12.82 (max 203) |
| `board.isCurrent` calls / inclusive ms                               |     73.3 / 5.56 | 144.5 / 10.09 (max per tick 174) |
| `marketDiscoveryEpoch` calls / ms (exclusive)                        |     76.3 / 4.50 |                     147.5 / 7.99 |
| `readRouteInput` calls / inclusive ms                                |        1 / 5.16 |                         1 / 8.21 |
| `readCapturedTradeQuote` calls (= unlocked resources) / inclusive ms |       11 / 4.04 |                        18 / 6.56 |
| native `aSell` + `aBuy` probes                                       |              22 |                               36 |
| `planTradeRoutes` (pure)                                             |        0.045 ms |                         0.365 ms |
| route operations (`autoBuy`/`autoSell`/`zero`) per tick              |             7.7 |                25.8 (in 6 ticks) |
| work ticks with zero route operations                                |       102 / 200 |                        194 / 200 |
| route-adjust time in zero-operation ticks                            | 575 of 1,398 ms |                1,776 of 2,564 ms |

- **Market-board freshness checks** (`isCurrent`) recompute `marketDiscoveryEpoch()` on every call: a `display`
  scan of every resource plus a `JSON.stringify`, then a control-generation check per board row. That is 64% (mid)
  and 62% (late) of route adjustment. V8 agrees: 4.1 / 7.6 ms per tick in `marketDiscoveryEpoch`. Calls run 6–8 per
  quoted resource, plus one after every route operation, which turns a 25-operation tick into the 174 ms validation
  spike.
- **Quote collection** costs ≈0.36 ms per resource, including the scoped `toFixed` observation. It is collected for
  every unlocked resource each tick. The unmanaged-resource count (neither buy nor sell enabled) was not instrumented;
  the minimum addition is one counter in `readRouteInput()`.
- **Route planning is negligible.** Pre-execution validations are the `isCurrent` calls above, and post-operation
  validation is the max-per-tick figure.

### Construction, demand, jobs, power

- **Native price probes** (`captured-action-costs.ts`):

  |                                             |          mid |          late |
  | ------------------------------------------- | -----------: | ------------: |
  | single `readCost()` calls per work tick     |          102 |           371 |
  | distinct action ids per work tick           |         24.4 |            72 |
  | most probes of one id in a tick             |           13 |            19 |
  | batch probes per tick                       |           24 |            72 |
  | V8 inclusive cost per tick (single + batch) | 4.5 + 0.9 ms | 25.0 + 4.2 ms |

  By V8 caller attribution the five consumers each cost about the same, ≈4.8 ms per late tick:
  - `captured-resource-demand` sample;
  - `captured-build` `beginCycle` via `establishOrdering`;
  - `captured-build` `beginCycle` via `runBuildCycle`;
  - `captured-craftsmen` `readBuildingCosts`;
  - `captured-factory` `readBuildingCosts2`.

  Each single probe also pushes and splices the game's reactive queue array.

- **Building unlock and availability scans** (`readBuildingUnlocks`, `readCapturedActionAvailability`): 5.0 / 6.2 /
  12.4 ms per tick (V8 inclusive), mostly reactive reads. They are reset every period and every cycle.
- **Demand preparation:** `demand.sample.*` runs 1.0–7 times per tick per sub-sample; `demand.sample.build` is
  6.9 ms late, mostly price probes.
- **Jobs:** `jobs.full.buildWeighting` is called 73× and costs 8.1 ms per late tick.
- **Power:** reads are ≤0.4 ms per tick in V8, despite 429 `on_cap` calls.
- **Negligible:** settings refresh and override evaluation (0.1 ms), planning panels (0.1–0.25 ms), State Log
  (≈0 ms), period wake (0.013 ms per period). `tick.scaffolding` is 1.6–2.6 ms.

## F. Optimization opportunities (ranked by credible saving × confidence ÷ risk)

Savings are per work tick, from the measurements cited; they are ceilings, not promises.

|   # | Opportunity                                                                                            | Source                                                                                                                       | Measured cost (early / mid / late)                                        | Estimated saving                                                        | Complexity / risk                                                                                                                                   | Confidence                                                |
| --: | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
|   1 | One per-cycle owner for native action prices, shared by all five consumers and the batch path          | `captured-action-costs.ts` `createCapturedActionCostReader` (`readCost`, `readCosts`)                                        | 3.7 / 5.4 / 29.2 ms                                                       | late ≈24 ms (≈18% of automation CPU); mid ≈4.4 ms; early ≈3 ms (est.)   | low / low–medium: invalidate on any state-changing control call, root replacement, cycle start                                                      | high on cost and repetition (counted); medium on hit rate |
|   2 | Stop the unconditional per-cycle Research redraw                                                       | `captured-progression-control.ts` `beginProcessedCycle`; `captured-tech-catalog.ts` `captureNativeDraw`                      | 12.6 / 15.6 / 32.6 ms + ParseHTML/GC/DOM churn                            | up to ≈90% of that if draws followed real change                        | high / high: offer membership depends on arbitrary game conditions, and the draw is the cost/affordability authority (headless-research experiment) | high on cost; **speculative** on achievable saving        |
|   3 | Memoize the Market board fingerprint between control invocations                                       | `captured-market-board.ts` `isCurrent` → `marketDiscoveryEpoch`                                                              | Market on: 4.5 / 8.0 ms; 174 ms spike                                     | ≈4 / ≈7.5 ms; removes the post-operation spike                          | low / low: same fence, keyed by root identity + control revision                                                                                    | high                                                      |
|   4 | Construction `beginCycle` computed twice per tick                                                      | `captured-construction.ts` `establishOrdering` and `application/build.ts` `runBuildCycle` → `captured-build.ts` `beginCycle` | autoBuild.beginCycle + construction saving discovery: 6.0 / 7.2 / 19.3 ms | part of #1's probes; ≈2–5 ms on top if the second pass reuses the first | medium / medium: mutations between the two passes                                                                                                   | medium                                                    |
|   5 | Retain the building unlock/availability sample across periods while the progression epoch is unchanged | `captured-progression-control.ts` `readBuildingUnlocks`, `captured-building-availability.ts`                                 | 5.0 / 6.2 / 12.4 ms                                                       | speculative, ≤50%                                                       | medium / medium: conditions over arbitrary state                                                                                                    | low                                                       |
|   6 | Skip quotes and route adjustment when nothing they read changed; skip unmanaged resources              | `captured-trade-routes.ts` `readRouteInput`, `captured-trade-quote.ts` `readCapturedTradeQuote`                              | Market on: 4.0 / 6.6 ms quotes; 41–69% of adjust time in zero-op ticks    | ≈2–5 ms                                                                 | medium / medium                                                                                                                                     | medium (unmanaged count unmeasured)                       |
|   7 | Read raw (non-reactive) game objects at the root-state adapter for pure reads                          | `adapters/validation.ts` `readProperty` callers, `captured-affordability.ts`, `captured-building-availability.ts`            | direct automation proxy-trap time ≈3–6 ms late                            | ≈3–6 ms late                                                            | medium / low–medium                                                                                                                                 | medium                                                    |
|   8 | `jobs.full.buildWeighting` called 73× per tick                                                         | `captured-ordinary-jobs.ts` / jobs planner                                                                                   | 2.1 / 2.6 / 8.1 ms                                                        | speculative; locate inside first                                        | low–medium / low                                                                                                                                    | low                                                       |
|   9 | `autoStorage` building-target reads                                                                    | `captured-storage.ts`, `storage-allocation.ts`                                                                               | 2.8 / 3.3 / 4.2 ms (+3.2 building targets)                                | partly via #1                                                           | low / low                                                                                                                                           | medium                                                    |
|  10 | Draw DOM churn: ParseHTML, GC, DOM node growth                                                         | consequence of #2 and other discovery draws                                                                                  | ParseHTML 1.3–2.6 ms, GC +1.6 ms per late tick                            | follows #2                                                              | —                                                                                                                                                   | medium                                                    |

**High-confidence** savings are #1 and #3. Of the rest, #4, #7 and #9 are plausible but unmeasured in isolation, and
#2, #5, #6, #8 and #10 are speculative. The largest _raw_ cost (#2) is not the largest _credible_ one: it needs the
membership argument the headless-research experiment could not supply, and an earlier (2026-10-11) Research
cache-freshness prototype fell back to a redraw on every reuse because native affordability (`cna`) cannot be read
from off-panel rows without the game's debug exposure.

## G. Next experiment — per-cycle native price owner

- **Change.** Make `createCapturedActionCostReader()` (`src/adapters/evolve/captured-action-costs.ts`) the single
  owner of a price memo:
  - it maps action id → frozen `GameActionPrice`;
  - it is valid only within one synchronous automation cycle, for the same game root and an unchanged
    state-mutation revision;
  - `readCost` and `readCosts` both read and fill it;
  - failed probes are not cached;
  - the cycle boundary comes from the existing `runCycle` start in `captured-runtime-control.ts`;
  - the mutation revision is bumped by every control invocation other than the probe's own `buildQueue.setData`.
    That is conservative: `on_cap`, `aSell` and `aBuy` reads also invalidate.
  - Consumers stay unchanged: `captured-resource-demand.ts`, `captured-build.ts`, `captured-craftsmen.ts`,
    `captured-factory.ts`, `captured-construction.ts` saving reads.
- **Expected benefit.** Price probes drop from 102→≈24 (mid) and 371+72→≈72 (late) per work tick when no mutation
  intervenes. That is ≈20–24 ms per late work tick (≈8–10% of total late renderer CPU) and ≈3–4.4 ms mid, with fewer
  reactive queue push/splice cycles as an unmeasured bonus.
- **Correctness tests:**
  - unit: a repeated id is served from the memo; any non-probe control invocation, root replacement or new cycle
    invalidates it; a failed probe is retried; batch and single paths share entries; returned prices are frozen;
  - parity: same-bundle control first, then `tools/perf/ab.mjs` on all three saves × 2,000 periods. Exports must be
    identical except `stats.current` and `city.market.mtrade`. `controlUsage` must be identical except a lower
    `buildQueue.setData` count.
- **Measurement.** Stage 4F.3 authority. This experiment's `baseline` mode on early/mid/late, 4 alternating-order
  repeats each, production vs candidate. The `phases` mode adds hit, miss and invalidation counters.
- **Keep if** all of these hold:
  1. the late paired median saving is ≥12 ms per work tick in both orders, and mid ≥2 ms;
  2. `TaskDuration` moves the same way in every pair;
  3. parity is exact as defined above;
  4. `npm run check` passes and the bundle diff is confined to the memo.

  **Revert otherwise.**

## Artifacts and reproduction

Raw output is under `test-artifacts/perf-profile/` (git-ignored; that directory is shared with the main checkout
through the worktree junction and was newly created, overwriting nothing):

- baseline, latency, phases, overhead, trace, realtime and market JSON reports;
- `cpuprofiles/*.cpuprofile` (18 profiles) and `market/cpuprofiles/` (4);
- `traces/*.json` (4);
- `summary-*.json` and `cpu-*.json` analyses;
- `readcost/` (the distinct-id tally);
- experiment bundles in `bundles/`.

```text
node experiments/full-runtime-profile.mjs bundles|validate|calibrate|baseline|latency|profile|phases|overhead|trace|realtime
     [--saves early,mid,late] [--repeats N] [--set autoMarket=true] [--label name] [--out-dir dir]
node experiments/full-runtime-profile-summary.mjs baseline|latency|phases|realtime <report.json> [--json out]
node experiments/full-runtime-profile-cpuprofile.mjs <a.cpuprofile> <b.cpuprofile> [--top N] [--json out]
node experiments/full-runtime-profile-callers.mjs <function> <module-substring> <a.cpuprofile> [...]
node experiments/full-runtime-profile-trace.mjs <trace.json>
node experiments/full-runtime-profile-vue-traps.mjs <a.cpuprofile> [...]
```

No production source, game snapshot, upstream checkout, `tools/` file or shared benchmark save was modified.
