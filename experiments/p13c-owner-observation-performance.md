# P13C.1 — Owner-observation performance gate

| Field                  | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Date                   | 2026-10-19                                                         |
| Branch / starting HEAD | `deadspace` / `80b8eb815b2b87f8dfcfb747309d15d647f0419a`           |
| Game                   | `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`    |
| Game snapshot SHA-256  | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` |
| Test bundle SHA-256    | `d0c6119f023f59f5f619f504249a27beb365b90dd127afc75104e1ba8e33400f` |

## Decision: C — measurement insufficient

The calibrated repeated controls cleared the sensitivity gate, so the benchmark ran four matched G/H/S triplets, including reversed order. The resulting contrasts and uncertainty still do not support a conclusion below 2%: the G-to-S renderer-CPU estimate is −1.82% with an approximate 95% matched-window interval of −6.35% to +2.70%. Decision C reflects unresolved measurement uncertainty, not an observed performance regression.

Each cell used the same source save, settings, seed, epoch, game snapshot and byte-identical bundle. It replayed the 1,784-period warm-up and measured 800 periods (100 workticks) with tracing and callback profiling disabled. Each row identifies its active renderer PID from a known workload in that page. There was no PID churn in measured cells, and other renderer activity is preserved per PID in the raw rows.

| Control pair | Renderer CPU difference | TaskDuration difference |
| ------------ | ----------------------: | ----------------------: |
| G/G 1        |                  +0.95% |                  +1.02% |
| G/G 2        |                  +0.80% |                  +0.62% |
| S/S 1        |                  −0.72% |                  −0.60% |
| S/S 2        |                  +0.19% |                  +0.72% |

The largest absolute repeated-control difference was 1.025%, the conservative detection floor. A 250 ms page workload added 0.181070 s to the identified renderer and 0.251115 s to CDP `TaskDuration`; `ScriptDuration` moved 0 s and is excluded as a CPU denominator. The renderer CPU response was 72.4% of injected wall time while `TaskDuration` tracked it at 100.4%. The gate allowed the factorial to run, but contrast uncertainty remained wider than the 2% decision boundary.

## Starting boundary and correctness

A post-warm-up export was tested and rejected as a fixture. Reloading it preserved effective settings, an available native control and root/progression authority, but did not reproduce Smelter assignments, the owner snapshot or the deterministic next-worktick export. Every valid control cell therefore replayed the established warm-up from the source save; warm-up was outside each measured window. The observed Construction Steel target at period 1,784 was 1,000.

The short correctness cohort used the same bundle in G, H and S. All three exports matched (SHA-256 `36524514089e64ce22342fd56095d2d239c6f3483809d134ea3e2cb8a22dded7`). Each had 94,940 native invocations with the same invocation-order SHA-256, 1,746 random calls, and identical control usage. G made no observer callback; H entered the empty callback 10 times and published no snapshot; S published 10 snapshots. The runner does not expose a separate Research-draw counter in this cohort; matching random-call counts and the full native invocation order are the independent parity evidence.

The test-only mode control is applied after page startup and changes neither saved settings nor ordinary native execution. H immediately returns without clock reads, counts or data retention in CPU windows. S constructs snapshots from the already-computed owner input and decision and retains only the latest immutable snapshot plus a publication count. Snapshot and callback timings are collected only in the short instrumented correctness cohort. No separate timer or worktick callback was added.

## Separate comparison and owner timing

Each of the eight S windows ran one pure source-backed comparison after its CPU window. Elapsed time was 0.3–0.5 ms; renderer CPU deltas were 0.00–0.10 s and `TaskDuration` deltas were 0.00–0.01 s at the counter’s reported precision. The comparison frequency was one per worktick (once every 8 periods, or 0.125 per period). These post-window samples are recorded separately and are not charged to recurring S CPU.

The correctness-cohort clock has 0.1 ms resolution: snapshot construction and callback elapsed samples were 0–0.1 ms. In measured windows, owner calls were 100 per cell; G had 0 callbacks, H had 100 callback entries inferred from the enabled owner schedule and separately verified H correctness cohort, and S had 100 publications. S made 100 additional progression-generation reads. No mode added a second input read, demand read, owner planner call, native planner call, native control call, Research draw or catalog scan. These snapshot-only measurements do not estimate a future complete allocator.

## No-signal and invalidation characterization

The focused Smelter tests exercise: an empty goal request; changed hypothetical demand; disabled permission; uninitialized Smelter input; unavailable native control; unavailable Construction demand authority; a no-adjustment owner decision; and root, progression, permission, demand, control, allocation and capacity invalidation. The tests assert empty planned commands and zero native calls for uninitialized/missing-authority cases, and verify a replaced root or control becomes stale. The owner-boundary count test confirms observation adds no input read, demand read, control resolve or native call; S adds only its one progression-generation read. These test-only cases do not replace the rejected CPU factorial.

## Reproducibility and raw evidence

Run from the repository root with:

```text
node experiments/p13c1-owner-observation-benchmark.mjs
```

The script compiles one bundle and asserts its SHA-256 is identical in all correctness and measurement cells. Inputs are the Stage 2F save (`6eff4a9720f333e7d5736b298d5b355e81e6d964027089fd49541b32a7de1b33`), Stage 2E settings (`3a8bf71d16dd5347f151bfbb67b7f8db786e95b6746f16b8d24d9c2a605e1132`), seed `42`, and epoch `2026-09-21T00:00:00.000Z`. Every raw row retains its page-target ID, active renderer PID, all renderer PID deltas, and process lifecycle changes.

Raw per-window process rows, task metrics, timing samples, counts and controls are under `test-artifacts/benchmark/tmp/p13c1-owner-observation-benchmark.json`. The command and bundle/input hashes are in `p13c1-owner-observation-command.txt`. Two rejected calibration attempts are retained separately and marked `invalid`; neither is part of the final controls. The final report makes no G/H/S factorial overhead claim because calibration did not support one.

## P13C audit history

## Audit of P13B

The checked-in `experiments/p13b-smelter-incumbent-authority.mjs` rebuilds two
bundles from the same `src/main.ts` during the same run. Both use the same
esbuild options and test-surface define. G has the normal metadata banner; S
adds `observerPrelude`, which installs two callbacks before the shared compiled
bundle runs. The recorded bundle hashes differ (`4c0931…16fbb` and
`96d3a9…1de41`), so they are not byte-identical. The source and build options
are otherwise the same in this script. The checked-in script does **not** use
an earlier production bundle as G. Any older comparison that paired an earlier
production artifact with a P13B test artifact must not be attributed solely to
snapshot publication; its exact historical bundle pair is not identified by
this script or report.

The costs in an equivalent-source comparison separate as follows:

| Cost                           | P13B behavior                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P13B owner refactor            | Present in the shared current source bundle: test-surface-gated dependency wiring, hook lookup/eligibility, and the observation-aware owner path. It is part of the baseline implementation and cannot be charged to the S callback. An older production bundle would omit some or all of this work.                                                                                                                                                   |
| Conditional observer checks    | The owner resolves `observeSmelterPlanForTest` at the diagnostic boundary and calls it only when it is a function. S's injected prelude makes that check succeed; G's does not. The outcome hook is also installed by the prelude.                                                                                                                                                                                                                     |
| Snapshot construction          | S calls `createCapturedSmelterIncumbentSnapshot` once for each measured owner publication and retains the snapshot. This is in the measured window.                                                                                                                                                                                                                                                                                                    |
| Extra authority reads          | Each S publication reads `progression.readRootGeneration()` once. P13B reports 100 such reads per 100 workticks; it reports no additional input/demand reads, planner calls, native calls, Research draws, or catalog scans.                                                                                                                                                                                                                           |
| Diagnostic callback            | S's callback reads the native clock, constructs/retains diagnostic state, appends a build-time sample, and stores the selected P12G boundary. These costs are mixed into the reported S delta. They are not snapshot-only costs.                                                                                                                                                                                                                       |
| Native commands and simulation | Both arms run the native game and ordinary Smelter owner. P13B reports equal state hashes, random calls, control usage, and 138,948 native invocations per pair, with no Research action invocation.                                                                                                                                                                                                                                                   |
| Harness and instrumentation    | Both arms use `perf`, `callbackProfile`, `nativeTrace`, the same `advance(1784)` warm-up, and an 800-period measured window. The warm-up is outside the CPU window but is repeated as fixture reconstruction in every cell. Tracing, callback profiling, export/hash, and CDP work add harness overhead; only work inside the controlled `advance(800)` is in the sampled CPU/TaskDuration interval. The one-shot C comparison is after that interval. |

P13B's renderer-CPU cells were 12.414 s (G) and 13.155 s (S), then 13.639 s
(S) and 18.359 s (G) in reverse order: +5.97% and −25.71% within-order
deltas. `TaskDuration` also reversed direction. Those observations establish
neither a pass nor a fail. Snapshot construction's clock samples (0 ms p50,
0.1 ms p95 at 0.1 ms resolution) and one 0.7–0.8 ms comparison cannot repair
the CPU attribution.

## P13C.1 calibrated paired result

The benchmark compiled one bundle and switched modes at runtime. It calibrated
the page workload, renderer PID and `TaskDuration`, then ran two repeated pairs
each of G/G and S/S. Their largest matched difference was 1.025%, so four
interleaved and reversed G/H/S triplets followed. Individual window results,
per-PID CPU rows and comparison samples are in the raw JSON.

- G: observer publication disabled at the existing owner boundary.
- H: same hook lookup and callback boundary; during CPU windows the callback
  returns immediately without clock reads, counters or retained data.
- S: callback constructs and retains the frozen same-cycle snapshot.
- C: one bounded comparison against the captured snapshot after the timed
  interval, with no native Smelter write.

The post-warm-up save equivalence check failed, so every valid cell instead
replayed the same deterministic 1,784-period warm-up from the source save.
Every page had its active renderer identified by a bounded same-page workload.
All per-PID before/after rows and process churn flags are retained. The
calibrated matched estimates were:

| Contrast | Renderer CPU mean | Approx. 95% matched interval | TaskDuration mean |
| -------- | ----------------: | ---------------------------: | ----------------: |
| G → H    |            −0.71% |              −7.31% to 5.89% |            −1.07% |
| H → S    |            −1.11% |              −3.60% to 1.39% |            −0.73% |
| G → S    |            −1.82% |              −6.35% to 2.70% |            −1.81% |

Intervals use the four matched windows and a small-sample t multiplier. The
total G → S interval still includes overhead above the 2% target, so these
results cannot establish the required bound. Negative point estimates do not
count as a pass.

Instrument only the owner boundary in a dedicated test bundle, with no
always-on production instrumentation and no added worktick callback. Record
counts and native-clock durations separately for input acquisition, the
existing `planSmelter()` call, eligibility check, snapshot construction,
additional authority reads, publication, pure comparison, and native command
execution. Use renderer-process CPU as primary and calibrated CDP `TaskDuration`
as cross-check; do not use `ScriptDuration` for the controlled runner path.
Retain callback-latency distributions as a separate responsiveness result.

The owner-level no-signal and invalidation cases are covered by focused
regressions, and the correctness cohort matched state exports, native
invocation order, control usage and random-call counts. Since the CPU gate
failed, those tests are not represented as measured performance cells.

The remaining measurement problem is the width of the matched G → S estimate
across fresh isolated pages: its approximate 95% interval extends to +2.70%.
The benchmark therefore leaves the 2% gate unresolved and does not claim that
snapshot-only observation or a complete future allocator meets the budget.

## Verification and scope

Verification completed: focused Smelter and owner-coordination regressions,
`npm run build`, `npm run check`, Chromium runner contracts, the executable
P13C.1 benchmark and `git diff --check`. The run measured repeated G/G and S/S
controls, calibrated renderer CPU and `TaskDuration`, ran four matched G/H/S
triplets with separate post-window C samples, and verified G/H/S correctness
parity. It returned C because the matched total-overhead interval did not
resolve the 2% bound. No production allocator, request port, cross-owner
reservation, recurring planner or opt-in was added. `quantitativeComparison`,
native feasibility, command changes, production marginals and economic
benefit remain separate claims.
