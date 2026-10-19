# P13C — Owner-local observation performance

## Decision: C — measurement authority remains insufficient

The available measurements cannot establish either that the owner-local
snapshot stays below the 2% renderer-CPU budget or that it exceeds it. Do not
use them to enable a production opt-in. Ordinary gameplay parity was observed
in the P13B shadow cells; CPU feasibility remains open.

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

## Required equivalent-code experiment

P13B does not provide the requested G/H/S/C matrix. A meaningful next run must
compile one bundle once and switch only a test observer control at runtime:

- G: observer publication disabled at the existing owner boundary.
- H: same hook lookup and callback boundary, callback returns without reading
  owner data or retaining a snapshot.
- S: callback constructs and retains the frozen same-cycle snapshot.
- C: one bounded comparison against the captured snapshot after the timed
  interval, with no native Smelter write.

Use a single verified post-warm-up save as the input to every cell, rather than
replaying the 1,784-period fixture setup. Run repeated reversed/interleaved
same-save windows and G/G and S/S controls. Preserve bundle hash, settings,
save hash, seed, browser version, and page target identity in every row. The
existing runner's process-wide CPU sample must also preserve renderer process
IDs and sample all renderer rows before/after each window; identify the active
game renderer and report any background renderer activity. Its 10 ms rounded
CPU granularity, renderer PID attribution gap, process/task scheduling, and
JIT/GC noise are material at a 2% threshold. Calibrate a bounded small CPU
workload in the same page execution context before accepting the counter.

Instrument only the owner boundary in a dedicated test bundle, with no
always-on production instrumentation and no added worktick callback. Record
counts and native-clock durations separately for input acquisition, the
existing `planSmelter()` call, eligibility check, snapshot construction,
additional authority reads, publication, pure comparison, and native command
execution. Use renderer-process CPU as primary and calibrated CDP `TaskDuration`
as cross-check; do not use `ScriptDuration` for the controlled runner path.
Retain callback-latency distributions as a separate responsiveness result.

The comparison must also exercise the listed no-signal and invalidation states
with counts showing no advisory-route recomputation, Research redraw, catalog
scan, second owner plan, needless large snapshot, cross-tick continuation, or
stale native control retention. Assert native invocation sequences, random
calls, exported state, and Research draws match shadow G. Test C must prove
that comparison cannot execute native allocation when the control is absent.

This is the smallest change that would make a decision possible: runtime
observer control on one bundle, a reusable warm state, and renderer-process
sampling that identifies the active renderer at adequate precision. If
same-save G/G variation still spans the 2% budget after calibration and
interleaving, the process CPU authority must be improved before deciding.

## Verification and scope

This report is an audit of existing P13B artifacts and harness source. It does
not claim that the new G/H/S/C experiment ran, that owner-phase timings were
collected, or that the no-signal matrix was measured. No production allocator,
request port, reservation system, recurring planner, or production opt-in was
added. `quantitativeComparison`, native feasibility, command changes,
production marginals, and economic benefit remain separate claims.
