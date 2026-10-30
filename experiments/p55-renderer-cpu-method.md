# P55 — Renderer CPU measurement redesign

## Decision: B — valid instrumentation, 2% sensitivity not qualified

The within-renderer pilot completed on one long-lived Chromium page with one active renderer PID. All 44 CPU windows had valid boundaries, the renderer PID stayed stable, and the placebo/2%/5% callback parity checks matched exported state, RNG state, native-control usage, native-call trace, and work-cycle count.

The method did **not** qualify for resolving a 2% increment. The 2% renderer-CPU block estimate was +6.03% with a 95% interval of −1.94% to +14.00%; the 5% estimate was +3.49% with a 95% interval of −7.53% to +14.52%. Both intervals include zero. The direct frozen-dose checks measured −9.12% for the estimated 2% dose and +13.46% for the estimated 5% dose, so neither dose was directly verified within the predeclared ±25% relative tolerance. The 2% point estimate is positive, but it is neither dose-consistent nor distinguishable from zero.

Use this result to stop the current measurement-method path. It is not an allocator result, it does not waive the ≤2% requirement, and it does not authorize allocator work. The P55 evidence and raw windows are in [p55-renderer-cpu-method-evidence.json](p55-renderer-cpu-method-evidence.json); the earlier calibration preflight is retained in [p55-renderer-cpu-method-calibration-preflight-evidence.json](p55-renderer-cpu-method-calibration-preflight-evidence.json).

## Stage 1 — P54.1 count correction

P54.1's p720 `buildQueue.setData` trace contained 104 raw rows. The Chromium native-invocation bridge emits two rows per native API call, and the corrected derivation validates each adjacent pair's order, period, element, and method before counting. The report now gives **104 raw trace rows = 52 native API invocations**. It reports the two P53 current-price checks as a separate metric, rather than labeling them as the total `setData` activity.

The same unit audit found other P38 fields that had named raw rows as native invocations. Those labels now distinguish rows from validated API calls. P54 and P53 historical evidence were not changed. D-late retains one pending request reference at p720; its exact replay stops at p720, before any later expiry, so that expiry is explicitly unobserved. `baseline-tuned.json` remains missing and was not fabricated. See the corrected [P54.1 report](p54-1-activation-lifecycle-correction.md) and its evidence generator.

## Stage 2 — What P46 established about variance

P46 used separate page contexts for the paired arms. Reusing a Chromium browser process did not reuse the renderer: each `openSession()` created a new context and page. Its 2% direct loop was measurable, but the paired whole-window CPU interval included zero; the 5% pairs changed with order. The same-process cold-control range was 12.54%, and the controls before versus after the paired sequence shifted by 6.57%.

The retained evidence supports a few distinctions. It does not isolate a single physical cause for the noise.

| Candidate source                      | Evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer creation and warmup          | P46 recreated pages/renderers for arms. Its two explicitly warmed windows were lower, but they also advanced the game by 160 periods before sampling, so warmup and state progression were confounded. A fresh Chromium process did not remove the broader P8 variation.                                                                                                                                                                                      |
| V8 JIT and garbage collection         | P46's first direct calibration read was slower than the next two, which is consistent with a first-call effect but does not prove JIT caused the paired noise. V8 compile-duration stayed at zero and `PerformanceObserver` did not expose GC entries. No tier-change or GC-duration record isolates either source.                                                                                                                                           |
| Game-state progression and owner work | P46 same-save pairs matched exports, RNG state/calls, native-control usage, and assignments, so a gross semantic mismatch was not supported as the cause there. P55 still advances one real game timeline: its state, worker assignments, native calls, and Research level change over time. Those are recorded per block/window and are not treated as interchangeable states.                                                                               |
| OS scheduling and host contention     | P46 host busy percentage moved with run order; correlations were based on small samples and were confounded with the before/after phase. It did not enumerate unrelated processes. P55 records host busy and Node CPU for each window, but they remain covariates rather than explanations.                                                                                                                                                                   |
| CPU frequency and thermal changes     | P46 did not isolate frequency or temperature. P55's `os.cpus().speed` snapshots stayed at 3,593 MHz, but that is a nominal host value, not a thermal or per-window effective-clock measurement. Thermal variation remains unobserved.                                                                                                                                                                                                                         |
| CDP sampling boundaries               | P46 retained raw CPU rows and enforced renderer identity at each read; no boundary defect was demonstrated. P55 uses the same process/TaskDuration sample order on every arm and stores UTC and monotonic start/end timestamps plus query durations. The pilot did not identify boundary corruption as a noise source.                                                                                                                                        |
| Native DOM and Research draw work     | P22 measured `drawTech` plus DOM generation at 32.32 ms per work tick and 103 draws/catalog refreshes per 100 ticks, as elapsed phase time rather than CPU. P55 used that late-many-owners fixture with phase profiling and tracing disabled for CPU windows. It records DOM-node and native-control deltas, but it does not expose an exact per-window `drawTech` count without adding profiling. The native DOM contribution can vary and was not isolated. |

P8, P13O, P22, and Stage 4F.3 support the measurement choices and limits: browser-target `SystemInfo.getProcessInfo` is the primary renderer CPU counter; page-target `TaskDuration` is a useful cross-check; `ScriptDuration` misses controlled `advance()` work. P13O's 2% loop added about 2% direct renderer CPU but did not produce a consistent whole-window response. These findings are summarized in [P8](p8-benchmark-measurement-authority.md), [P13O](p13o-cpu-measurement-resolution.md), [P22](p22-production-performance-bottleneck.md), and [Stage 4F.3](stage4f3-performance-measurement-authority.md).

## Stage 3 — Within-renderer protocol

The harness uses the exact headless Chromium runner and its real game/automation `advance()` path. It opens one page once, warms that renderer, performs calibration and every main CPU window in that renderer, and rejects any page reload or renderer-PID change. The schedule is generated with a seeded Node LCG and Fisher–Yates shuffle, independent of the game's RNG.

There are 11 four-window blocks: three 0% A/A blocks, four approximately 2% blocks, and four approximately 5% blocks. Each block is ABBA or BAAB, with each positive condition assigned two of each orientation. The blocks and orientations are fixed in the retained evidence. Every main CPU window advances 48 periods (six work cycles); every calibration window advances 56 periods (seven work cycles). Each window samples process CPU and `TaskDuration` immediately before and after advancement, with state export, hashing, and report writing outside the CPU interval.

This protocol does not rewind or mutate game saves. Between windows the game continues normally. Full state hashes and block-boundary summaries retain changes to day, population, resources, buildings, workers, technology, reset, species, and universe. Per-window native API counts retain action and method-level deltas. ABBA/BAAB balances a linear within-block trend; the state records and placebo blocks expose changes that counterbalancing cannot erase.

The runner exposes work-cycle cadence and per-method native control calls, but no side-effect-free count for each named JavaScript owner callback. I did not add per-owner profiling to CPU windows because that would change the measured work. Therefore fixed work-cycle counts and native action/observation counts are retained, while changes in pure-JavaScript owner invocation mix remain part of the unobserved workload drift. P22's owner profile is prior-run context, not a per-window P55 measurement.

## Stage 4 — Workload in the real callback

The test-only loop is installed at the existing `p32GameAdvanceWorkload` hook in `runCycle`, before the callback's existing state reset and owner phases. It changes only closure-local integer accumulator, sink, and callback-count values. It does not call the game RNG, read or write game state, change settings, invoke controls, or reorder existing work. The loop uses `Math.imul`; it does not use `performance.now`, virtual clock values, `ScriptDuration`, or V8 profile percentages to calibrate its dose.

An initial 400-period warmup includes 50 callback invocations of a 1-million-iteration loop to exercise the callback and loop before calibration. This initialization is excluded from the 4,000-period cap and is separately recorded. High-dose renderer-CPU calibration used 30M, 60M, and 90M iterations in alternating windows with placebo, then froze estimated 2% and 5% doses at 3,256,045 and 8,140,112 iterations per work cycle.

The fitted high-dose renderer-CPU response was monotonic. The direct frozen-dose checks then missed their predeclared targets: 2% read −9.12%, 5% read +13.46%, both outside the ±25% relative tolerance. They were retained and the pilot continued; an inaccurate or noisy low-dose check is evidence against sensitivity, not a reason to relabel the run as invalid. The later placebo/2%/5% semantic parity replay passed every state, RNG, control-usage, native-trace, and callback-count comparison. Native tracing was used only for this separate parity replay, never in the CPU windows.

## Stages 5–6 — Accounting and bounded pilot

The final pilot used `test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json` and `settings/current-full.json`, seed 42, epoch `2026-09-21T00:00:00.000Z`, and the pinned Evolve snapshot. It ran under `HeadlessChrome/151.0.7922.71`. The active renderer was PID 29224, which held 100% of measured renderer CPU over calibration; PID 31956 was the only other renderer. PID sets stayed stable through all 44 CPU windows, the page loaded once, and all windows passed objective boundary/cadence checks.

| Period use                                                                 |           Periods |
| -------------------------------------------------------------------------- | ----------------: |
| Exploratory calibration and frozen-dose checks                             |               672 |
| Main CPU windows (44 × 48 periods)                                         |             2,112 |
| Separate semantic parity (3 × 160 periods)                                 |               480 |
| Final run                                                                  |         **3,264** |
| Earlier calibration preflight that stopped after seven valid windows       |               448 |
| P55 total across both attempts, excluding their 400-period initializations | **3,712 / 4,000** |

The preflight used 3M/9M/15M callback doses. All seven raw process/TaskDuration windows had valid boundaries and stable PID attribution, but the short-window CPU noise made the fitted workload slope nonpositive. It stopped before any treatment/control measurement blocks. The higher calibration dose plan and shorter main windows were then frozen before the final run. Both raw datasets are retained; the final run still remained under the overall 4,000-period budget when the preflight periods are included.

Every final window retains the raw browser-target process rows, per-PID deltas, page-target `TaskDuration` and diagnostic `ScriptDuration`, before/after UTC and monotonic timestamps, host CPU snapshots, Node CPU deltas, heap and DOM-node deltas, callback and period counts, native control deltas, and lifecycle indicators. Main CPU windows had `perf`, callback profiling, and native tracing disabled. Fifteen of 44 windows had lower sampled JS heap usage at the end; this is only a heap-drop proxy, not a GC event count. `os.cpus().speed` was constant at 3,593 MHz; no thermal counter was available. Node process CPU over the main windows totaled 0.188 s user and 0.031 s system. Mean host busy was 11.85% (range 9.09–18.73%).

The final run retained a cumulative 2,164,711,775 injected loop iterations across 458 callback invocations: 1,260,000,000 during exploratory calibration, 79,773,099 during frozen-dose verification, 547,015,536 during CPU measurement, and 227,923,140 during semantic parity, plus 50,000,000 initialization iterations. The raw evidence records cumulative dose by phase and window; the zero-dose measurement controls remain zero-dose after initialization.

The callback's added execution time was visible in Node runner cadence. Main-window runner advancement averaged 39.48 periods/s in placebo windows, 37.99 in 2% windows, and 37.80 in 5% windows. Block-level scheduling effects were −2.09% for 2% (95% CI −9.09% to +4.91%) and −5.69% for 5% (95% CI −10.79% to −0.58%). The high calibration doses slowed advancement further, as expected. These are runner scheduling covariates, not CPU substitutes.

## Stage 7 — Results and statistical qualification

The balanced four-window block is the experimental unit. Work cycles and windows are correlated subsamples, not independent replicates. Effects use two-sided 95% Student-t intervals over block-level relative CPU effects. No valid window was removed as an outlier.

| Condition   | Blocks | Renderer CPU effect (mean; 95% CI) | `TaskDuration` effect (mean; 95% CI) | Result                                                                      |
| ----------- | -----: | ---------------------------------: | -----------------------------------: | --------------------------------------------------------------------------- |
| Placebo A/A |      3 |         +3.22%; [−32.99%, +39.44%] |           −0.84%; [−21.87%, +20.20%] | No false positive detected; interval is too wide to establish a tight null. |
| Approx. 2%  |      4 |          +6.03%; [−1.94%, +14.00%] |            +2.61%; [−4.81%, +10.04%] | Not distinguishable from zero; point estimate is not dose-consistent.       |
| Approx. 5%  |      4 |          +3.49%; [−7.53%, +14.52%] |            +6.15%; [−0.02%, +12.33%] | Not distinguishable from zero.                                              |

The 2% treatment's ABBA mean was +8.03% versus +4.02% for BAAB, a 4.01 percentage-point order difference against the predeclared 1-point materiality threshold. The 5% order difference was 0.18 points. Placebo block effects were −1.43%, +19.56%, and −8.46%. Across all 44 windows, mean renderer CPU per work cycle increased from 0.2269 s in the first half to 0.2334 s in the second half; the simple linear trend had low R² (0.014). These variations remain unexplained; the report does not attribute them to JIT, GC, host scheduling, frequency, state changes, or a sampling bug.

Game progress was real: each block advanced 9–10 in-game days and population by 3–9. Worker assignments changed in every block; one block changed a building count. `supercollider` advanced three levels, from 38 to 41, in three blocks; none changed reset, species, or universe. Per 48-period window the runner recorded 3–6 native `action` calls (mean 4.02), 0–5 Jobs `setDefault` calls (mean 2.11), and 6,828–7,927 other native control API calls by method key. No `tech-*.action` Research purchase call occurred in these windows. The Research level transitions are retained as state progression, not assigned a cause. Research DOM draw count itself is not exposed by the non-instrumented CPU path.

The dose-fit calibration predicts about 2% and 5%, but the direct checks did not verify those low doses. Thus the known 5% control was not detectable, 2% was not distinguishable from zero, and the 2% point estimate cannot be used as a pass. The three-block A/A interval includes zero but is far too broad to establish that false positives are controlled. Stable PID and successful semantic parity validate measurement placement and instrumentation; they do not make the windows state-identical or establish sensitivity.

### Approximate sample-size and run-budget estimate

Using the observed 2% block SD of 5.01 percentage points, the predeclared normal approximation for 80% power at a 2-point effect and two-sided 95% confidence gives **50 independent 2% blocks**, versus four observed. That is about 46 more 2% blocks, or 8,832 additional periods at four 48-period windows per block. For a true 5-point effect and observed 5% block SD of 6.93 points, the analogous estimate is 16 blocks. Both are optimistic: the variance estimate is based on four sequential blocks, the sample-size formula ignores the t correction and possible serial correlation, and direct dose verification failed.

A balanced 50-block-per-condition three-way run would use 28,800 periods for one fixture; completing the current counts to 50 blocks per condition would add about 26,688 periods. At the observed runner cadence that is roughly 11–12 minutes of advancement alone, but it would move this single game timeline from about p3,184 toward p29,872. The extra progression would add many more Research, worker, and owner transitions, with no save rewind allowed. It is mechanically runnable but not a practical way to claim comparable late-game workload under this protocol. Stop here rather than expand the same sequence by roughly seven times and assume counterbalancing repaired the drift.

**Decision B** is appropriate: the process accounting and injection path are valid, but the bounded within-renderer comparison cannot resolve 2%, directly verify the low doses, or detect 5%. It is not decision A. We do not choose C because the instrumentation itself did not break and the positive workload preserved gameplay semantics; natural game changes are retained as variance and workload context, not treated as matched states. This result does not qualify the method for an allocator.

## Stage 8 — Conditional future allocator CPU gate

If a separate measurement redesign first qualifies, an allocator candidate should be tested with this acceptance rule:

- **Metric and rule:** renderer-process CPU from browser-target `SystemInfo.getProcessInfo`, attributed to a stable active page renderer; use `TaskDuration` as a supporting counter and retain `ScriptDuration` as diagnostic only. For each representative fixture, compute the relative incremental CPU effect and require its one-sided 95% upper confidence bound to be **below 2%**. A point estimate below 2%, a CI that includes zero, or a nonsignificant result does not pass.
- **Configurations:** baseline is the current allocator-disabled behavior; treatment is the proposed allocator enabled in an otherwise identical test build. A same-page runtime gate may be used only if enabling/disabling it preserves all non-allocator behavior, ordering, settings, RNG, and native controls. Measure warmup/setup outside the windows and report it separately.
- **Workloads:** representative early and late fixtures, each with a fixed save, settings, seed, epoch, ordinary automation enabled, and the same window cadence. The late workload must retain expensive Research/native DOM activity. Keep placebo and frozen renderer-CPU 2%/5% positive controls, stable PID checks, and all raw process/TaskDuration rows.
- **Parity:** for read-only planning comparisons, require identical exported state, RNG, owner decisions, native action/observation counts, and Research sequence at the same period boundaries. If no gameplay mutation is expected, any divergence invalidates the comparison. Do not compare state-changing windows as if they were interchangeable.
- **Legitimate actions and attribution:** separate read-only planning from authorized native actions where the architecture allows it. Report the planning CPU delta independently. If the allocator legitimately changes actions or game state, include the resulting downstream game/DOM work in the enabled-workload CPU result; do not subtract it as noise. A gameplay-mutating allocator needs a separate stateful comparison design because P55 did not qualify such comparisons.
- **Process and budget:** require one attributable stable renderer per window, no reload/PID churn, same CDP sample order, valid callbacks and positive controls. A future qualification attempt should have a hard cap of **32,000 measured periods per fixture** (64,000 for early plus late), excluding separately recorded initialization; at the observed cadence this is roughly 27 minutes of advancement total. Stop if the cap cannot produce the required upper bound.

P55 itself does not meet that acceptance rule. Any allocator-overhead validation remains a separate follow-up after the measurement method is reworked and requalified.

## Reproduction and validation

Rebuild the test-surface bundle, then run the retained harness:

```text
npm run build:test-surface
node experiments/p55-renderer-cpu-method.mjs --out=test-artifacts/benchmark/tmp/p55-renderer-cpu-method-pilot.json
node tests/experiments/p55-renderer-cpu-method-test.mjs
```

The raw evidence records the pinned game, save/settings/bundle hashes, harness/runner/bridge hashes, browser version, page target, renderer PID, schedule seed, every retained window, and the missing `baseline-tuned.json` fixture. The ordinary production bundle remained byte-identical at SHA-256 `74a1771669986b1a7ef65657b25cbacc1e693a3a1533a59cb45522e3c3d321dd`. No production allocator or runtime behavior was changed, and no changes were made to the already-dirty `tools/` checkout for P55.
