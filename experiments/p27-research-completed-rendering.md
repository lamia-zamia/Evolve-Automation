# P27 — Research completed-row rendering bypass

**Decision: C — No safe interception point was established; the prototype was reverted.**

## Scope and pinned inputs

The investigation used `pmotschmann/Evolve` commit `db38e2af831907d49aeb5348d678d8d8745d6c3f` and the same early, progression, and late fixtures used for P26. P22, P25, P26, and `experiments/research-gate-promotion.md` were read before implementation. No native game files, autonomous allocation, preload behavior, or execution timing were changed.

## Diagnostic profile

A separate ignored snapshot of the pinned game was instrumented for attribution only. The temporary instrumentation was not shipped. Measurements use Chromium CDP console-event timestamps because the game's `performance.now()` clock was frozen at zero in this runner. The row callback counts are exact; phase elapsed values are summed over completed draws and include phase setup around each callback loop. Instrumentation output and fixture export hashes are in the ignored `test-artifacts/benchmark/tmp/p27-profile.json`.

| Fixture     | Draws | Registry visits | Offered rows | Completed rows | Registry phase | Offered phase | Completed phase |  Whole draw |
| ----------- | ----: | --------------: | -----------: | -------------: | -------------: | ------------: | --------------: | ----------: |
| Early       |   110 |          91,740 |        1,366 |          3,466 |      694.38 ms |     193.16 ms |       262.50 ms | 1,273.79 ms |
| Progression |   116 |          96,744 |        1,854 |         11,236 |      720.62 ms |     271.24 ms |       814.00 ms | 1,944.34 ms |
| Late        |   103 |          85,902 |          424 |         27,077 |      662.13 ms |     119.49 ms |     2,501.30 ms | 3,408.58 ms |

The registry phase retained path checks, `removeAction`, `checkOldTech`, new-tech qualification and requirements, and offer classification. The completed phase includes category setup and `trickOrTreat` as well as completed-row callbacks. At late progression, completed rows averaged 262.9 per draw, versus 4.1 offered rows; the phase accounts for about 73% of whole draw elapsed time in this instrumented run. This establishes that the callbacks are a material optimization target, but it does not establish a safe way to suppress them.

## Side-effect audit

The second phase invokes `addAction` / `setAction` for completed entries. `setAction` repeats `checkTechQualifications`; when qualified, it repeats `removeAction`, computes native affordability twice, assembles the `.oldTech` markup, appends it to `#oldTech`, and calls `vBind`. The scratch capture discards `#oldTech`; its Vue bind target is absent, but the preceding operations still run.

The first registry phase already calls `removeAction` for every on-path technology before classification. Thus the completed callback's later cleanup is redundant for those entries in the ordinary synchronous draw path, including `clearPopper`. `trickOrTreat` is outside the per-row callback and remains in the completed category loop. Source inspection found no RNG use in the pinned technology definitions; the audited technology condition and cost methods had no game-state assignments or updates (only local loop counters). Qualification and cost functions are still native callbacks evaluated in the second phase, so suppressing them would require relying on their observed purity as well as on repeated cleanup being redundant. No registry membership or `checkOldTech` behavior was changed.

## Interception and parity result

A temporary offers-only prototype intercepted `Array.prototype.forEach` only while the native scratch draw ran, compared the callback's normalized source with the pinned completed-row callback, and restored the original property descriptor in `finally`. It left `includeGranted=true` and ordinary visible draws untouched. The focused catalog harness exposed duplicate binding observations when a catalog read was nested inside an active draw; the candidate did not produce a valid snapshot for that case. Nested draws are explicitly in the required parity set, so the candidate could not be retained without adding another interception or state mechanism. That would expand the scope beyond a reliably distinguished native iteration.

The profile also showed that the callback itself cannot be removed while retaining `forEach` semantics for the entire array: the mechanism relies on identifying a callback by source text through a generic prototype method. Although that signature matched the pinned source in the diagnostic snapshot, it is coupled to the upstream callback's emitted function text and is not a stable native seam. No paired reversed-order CPU benchmark was run: the prototype failed the required nested-draw correctness gate before a valid candidate benchmark existed. Consequently no claims are made about renderer CPU, work-tick latency, TaskDuration, or net improvement over control noise.

The prototype and its regression tests were reverted. The report is the only tracked P27 change.
