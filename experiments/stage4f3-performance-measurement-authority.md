# Stage 4F.3 — Performance Measurement Authority

## Decision: C — corrected measurements put J over the 2% budget

Do not proceed to Stage 4G or add a production opt-in. The old `ScriptDuration` comparisons did not cover the controlled work performed by the exact runner. After calibrating the counters, matched p8000–p9000 windows showed J using **31–47% more renderer-process CPU** when 122 validations were accepted. A second matched p9000–p10000 window, with no accepted signals or extra Research draws, showed **5.7–7.2% more renderer-process CPU** across 125 work ticks. Both exceed the 2% limit.

The no-signal comparison is the decisive recurring-cost result: the added cost is present when J performs its per-cycle candidate and plan comparison but requests no fresh Research draw. The validation-heavy comparison adds the protected draw, later Research-owner redraw, final authority checks, and associated recaptures. Their paired deltas vary, but remain well above 2%.

## Scope and inputs

The audit and short replays used the exact runner, the unmodified DeadSpace game snapshot at `db38e2af831907d49aeb5348d678d8d8745d6c3f`, and the Stage 4F.2 test bundle (`edf7f42a461f4f591549a822f307035df338fa905b54cb4b5476f9ade86b1a45`). The save, settings, seed, epoch, and intervention match Stage 4F.2. Missed-opportunity diagnostic sampling was disabled. Phase instrumentation was disabled in the corrected G/J CPU windows.

The validation-heavy windows started from the Stage 4F.2 input save, enabled the comparison after p8000, and measured p8000–p9000. This interval contains 122 of the 123 full-run accepted signals. The remaining signal occurred at p21568. For the no-signal windows, a p9000 export from G was loaded into both arms and each was measured for 1,000 periods (125 work ticks); both had zero accepted signals, zero extra Research draws, 817 identical native route operations, and identical resource and Money state. The reverse-order repeat controls for run order.

These short matched windows avoid another p30000 campaign. The full Stage 4F.2 replay remains the source for whole-run functional parity: 123 accepted signals, 109 distinct changed plans, identical Research purchases and route operations, preserved Money floor, and equal final resources. The p9000 windows reproduce 122 accepted signals and 108 distinct changed plans in the active arm.

## Measurement ownership

| Measurement                                                     | Exact scope and meaning                                                                                                                                                                                                          | Use                                                                                                                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CDP `Performance.getMetrics` — `ScriptDuration`, `TaskDuration` | A `CDPSession` created from the game `Page` target, enabled before navigation. Values are cumulative page-target metrics; the runner reports before/after deltas. They are not separated by script, frame, or execution context. | `ScriptDuration` is invalid for controlled-runner comparisons. Calibrated `TaskDuration` responds to the controlled work and is the renderer-task cross-check.                                                     |
| Renderer process CPU                                            | Browser-target `SystemInfo.getProcessInfo`, returning CPU seconds by Chromium process type and id. The runner rounds each reading to 0.01 s and has no API mapping from a page target to its renderer PID.                       | In a one-active-game-page run, the renderer process that gains CPU is identifiable by the controlled workload; the extra `about:blank` renderer stayed at 0.00 s. Sum renderer rows, not browser/GPU/service rows. |
| Research draw / DOM-generation and application phase timers     | With `--perf`, `eaDiagnosticsNow` calls the original native `performance.now`; public page `performance.now` is virtual in controlled mode. These are synchronous elapsed wall-time intervals, not process CPU counters.         | Useful for decomposing work after respecting exclusive nesting; not an independent CPU total.                                                                                                                      |
| `autoMarket` / route adjustment                                 | Both are recorded through the shared `activeRuntimeMeasure` during one work cycle. Nested phase wrappers subtract their children.                                                                                                | `autoMarket` is its **exclusive remainder**, while `autoMarket.adjustTradeRoutes` is a child exclusive phase. They can be different sizes.                                                                         |
| Work-cycle callback profile                                     | `callbackProfile` brackets the page's main-loop listener dispatch with native `performance.now`. It is whole callback latency, including game code and automation, not automation-only CPU.                                      | Used for latency distribution, separately from CPU.                                                                                                                                                                |
| Runner wall time                                                | Node `performance.now` around the controlled `advance` loop.                                                                                                                                                                     | Includes runner/CDP and task-boundary overhead; not a CPU counter.                                                                                                                                                 |

### Page, frame, execution context, and worker

The CDP metrics session is attached to the exact runner's game page target (`tab.createCDPSession()` in `tools/chromium-evolve-runner.mjs`). The pinned upstream page loads `evolve/main.js` into the main document. The runner injects the userscript as a page script in that same main world. The observed game page had one frame; no Evolve iframe or separate game renderer target was present. The runner also has an idle `about:blank` page target, which is not the session whose metrics are read.

The real Evolve `Worker` only paces main-loop messages. In controlled mode the bridge replaces it with an in-page `ControlledWorker`; the game and automation callbacks run in the game page's main execution context as the bridge dispatches those messages. Native-timer calibration used the same page context and its real timer Worker, stopped after period 1. The runner does not attach CDP metrics to workers. No game logic was found executing in a worker or an uncovered iframe.

`Performance.getMetrics` is a page-target aggregate, not a guaranteed measure of every possible out-of-process iframe or worker. That limitation does not hide Evolve logic on this pinned page because the game has no such separate execution surface.

## Calibration

The known workload was a local integer-arithmetic loop in the actual game page, with no game-state reads or writes. Each run was bounded to 250 ms using the original native clock. Five controlled `session.evaluate` repetitions and three real page `setTimeout` callback repetitions were measured. Chromium was `HeadlessChrome/151.0.7922.71`.

| Context and execution path           | Repeats | `ScriptDuration` delta | `TaskDuration` delta | Active renderer CPU delta | Local page clock                                            |
| ------------------------------------ | ------: | ---------------------: | -------------------: | ------------------------: | ----------------------------------------------------------- |
| Controlled runner `session.evaluate` |       5 |           0.000 s each |        0.251–0.261 s |               0.23–0.30 s | `eaDiagnosticsNow`: 250 ms; virtual `performance.now`: 0 ms |
| Native page timer callback           |       3 |      0.25002–0.25012 s |    0.25055–0.26351 s |               0.23–0.29 s | Native `performance.now`: 250 ms                            |

The controlled runner invokes `window.__EA_RUNNER__.advance()` through an awaited `Runtime.evaluate`. Its timer callbacks, worker-message dispatch, game code, and automation work execute while that inspector evaluation is active. The controlled calibration proves `ScriptDuration` does not account for this work: a known 250 ms workload added no `ScriptDuration`, while adding about 250 ms to `TaskDuration` and renderer CPU. The native page timer calibration proves the same `ScriptDuration` counter does respond to ordinary event-loop script execution. Thus the counter itself works, but its scope does not cover the exact runner's controlled work path.

`TaskDuration` rose by the known workload in both paths. Renderer process CPU tracked the same workload to roughly the expected 250 ms, with 10 ms reporting granularity and some process/scheduling noise. For the short G/J windows, both `TaskDuration` and renderer CPU moved in the same direction. This selects renderer process CPU as the direct CPU measurement and `TaskDuration` as its calibrated page-task cross-check. `ScriptDuration` is rejected for the 2% gate.

## Timer boundaries and the historical inconsistencies

`createExclusivePhaseMeasure` owns one shared nesting stack for a work cycle. Its named `measure` phases record elapsed time minus their measured child phases. `captured-runtime-control.ts` supplies the shared `measurePhase` bridge to feature/application timers. Therefore the draw and route subtotals are exclusive phase contributions. The separate `tick` entry is recorded around the complete cycle and is inclusive; do not add `tick` to its child phase totals. Phase summaries flush every 25 measured work ticks. The 3,750-tick Stage 4F.2 instrumented run contains 150 such complete summary windows.

- **62–70 seconds of Research draw work versus 1.6–1.8 seconds of `ScriptDuration`:** the Research timer records elapsed time around real synchronous draw/DOM code while `advance()` is inside `Runtime.evaluate`; calibrated CDP `ScriptDuration` omits that controlled execution. The values are from incompatible scopes, not proof that the draw timer is 40 times too large. Stage 4F.2's phase timer recorded 62.123 s for G and 70.438 s for J across 3,830 and 4,076 total draws. The calibrated J-specific draw-and-DOM phase difference was 8.314 s for 246 additional draws (123 protected draws plus 123 later owner redraws), or 33.8 ms per additional draw. These are elapsed phase observations, not standalone renderer CPU totals.
- **Route adjustment larger than `autoMarket`:** Stage 4F.2 reported 10.322/11.162 s for the exclusive `autoMarket` phase and 34.149/37.570 s for its exclusive `autoMarket.adjustTradeRoutes` child (G/J). The parent excludes that child and other nested phases. The old wording made the parent subtotal sound inclusive; the timer stack and source show why the child can be larger.
- **Large full-run timing reversals:** the two prior diagnostics-free pairs reported G/J `ScriptDuration` of 1.582/1.716 s and 1.793/1.623 s, while `TaskDuration` reversed from 662.67/735.97 s to 790.11/680.10 s. `ScriptDuration` is incomplete for this runner. `TaskDuration` includes broad page task occupancy and varies between fresh runs; the prior data do not isolate a single cause for that variation. The new same-save short repeats show 3.7–7.4% variation in the G and J window totals and 17.8–29.8% variation in the paired CPU delta, despite matching resources and operations. J's CPU delta stayed positive in both orders and was far above 2%. Run order, process scheduling, JIT/GC, and browser task work are plausible contributors; the available counters do not distinguish among them.

The phase figures are not added to corrected CPU deltas. They describe work ownership and explain the former contradictions; the CPU decision below uses the calibrated renderer-process counter with `TaskDuration` as a cross-check.

## Corrected matched measurements

The first two rows compare the validation-heavy 125-work-tick window; J accepted 122 signals in each. The latter two use the saved p9000 G state and have zero accepted signals. Values are seconds; percent is J relative to G in that row.

| Window / order                     | G renderer CPU | J renderer CPU |       CPU delta | G `TaskDuration` | J `TaskDuration` |      Task delta |
| ---------------------------------- | -------------: | -------------: | --------------: | ---------------: | ---------------: | --------------: |
| p8000–p9000, G then J, 122 signals |          25.95 |          38.20 | +12.25 (+47.2%) |           22.954 |           32.795 | +9.841 (+42.9%) |
| p8000–p9000, J then G, 122 signals |          27.86 |          36.59 |  +8.73 (+31.3%) |           24.260 |           31.631 | +7.372 (+30.4%) |
| p9000 save, G then J, zero signals |          24.86 |          26.65 |   +1.79 (+7.2%) |           21.211 |           22.838 |  +1.627 (+7.7%) |
| p9000 save, J then G, zero signals |          26.13 |          27.63 |   +1.50 (+5.7%) |           22.372 |           23.646 |  +1.273 (+5.7%) |

The validation-heavy G/J output matched at p9000: 122 accepted signals, 108 distinct changed plans, 2,101 native route operations, the same 78 resource entries, and Money 242,902.95. The no-signal p9000-save pair had no accepted or proposed signal, no final fence recapture, 817 native route operations in each arm, and the same final resources and Money (353,077.86). Research missed-opportunity sampling was off in both.

The 122-validation CPU delta is 71.6–100.4 ms per accepted signal if left inclusive of J's repeated per-cycle work. Subtracting the same-order no-signal delta estimates 59.3–85.7 ms of additional renderer CPU per accepted validation, including its protected draw, secondary owner redraw, final fence, and route/control recapture work. The corresponding `TaskDuration` estimate is 50.0–67.3 ms per accepted validation. These are combined path costs; the experiment does not claim a CPU split among those synchronous substeps.

The no-signal windows isolate the recurring J work: 125 `noHintCalls`, zero accepted candidates, and no extra Research draws. J added 12.0–14.3 ms of renderer CPU and 10.2–13.0 ms of `TaskDuration` per active work tick. The interval contains normal Market execution in both arms; the 817 route operations match. This recurring comparison/capture path alone is 5.7–7.7% of the matched G window.

### Work-cycle latency, reported separately

With `callbackProfile` enabled on the p9000-save window, the bridge recorded 1,000 main-loop callback durations per arm. With `tickRate: 8`, every eighth callback is the work-tick callback (125 samples). These durations include the whole page callback, not only the automation. They are elapsed latency, and the profiling clock calls add small measurement overhead.

| Work-tick callback latency |        G |        J |
| -------------------------- | -------: | -------: |
| p50                        | 104.9 ms | 117.6 ms |
| p95                        | 148.6 ms | 176.7 ms |
| p99                        | 180.4 ms | 222.7 ms |
| maximum                    | 302.4 ms | 448.4 ms |

This is a no-signal latency window, not the latency distribution of the 122 validation callbacks. The CPU table above measures the validation-heavy window as a separate aggregate.

## Amortization and budget

There are 3,750 work ticks through p30000; J is active for 2,750 after p8000. The no-signal paired delta scales to approximately **28.0–35.8 s `TaskDuration`** across those 2,750 J-active ticks. The 122 measured validation cycles add another **6.1–8.2 s** after subtracting the recurring no-signal cost; the one later signal adds an estimated 0.05–0.07 s using the observed per-signal range. The resulting full-run projection is **34.1–44.1 s `TaskDuration`**, or **9.1–11.8 ms per each of the 3,750 total work ticks**.

Stage 4F.2's two full G baselines measured 662.67 s and 790.11 s `TaskDuration`. Comparing the projected increment to that observed baseline range gives **about 4.3–6.7%**. This is an extrapolation from two repeated short windows, not a new full-run measurement. The matching renderer-process CPU projections are about 40–50 s over the run; no full-run renderer-process denominator was recorded, so that CPU projection is reported in seconds, not as a percentage.

The decision does not depend on the projection: both repeated no-signal windows exceed 2% directly, and both repeated validation-heavy windows exceed it by a much larger margin. The corrected evidence therefore establishes that J misses the agreed budget.

## Verification and preservation

- Stage 4F.2 functional invariants remain unchanged; this slice made no production or `tools/` source edits and fabricated no native-parity fixture.
- The production bundle SHA-256 before verification was `d069e37683bca3b1c56aae519538e5321bbba7d8fa3f2648269b13e3f2c01a08`; the DeadSpace snapshot SHA-256 was `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`.
- Short replay output and the p9000 checkpoint are scratch artifacts under `test-artifacts/benchmark/tmp/`; they are not committed. No p30000 replay was run for this audit.
- `tools/` and `D:/work/Evolve-DeadSpace` remained unchanged at the pinned upstream commit.
- Verification commands and final hashes are recorded in the dated progress log.
