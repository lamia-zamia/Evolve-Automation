# P13D — Owner-local goal-demand admission

## Outcome

**C — Authority or measurement incomplete.** The test-only proposal reached the existing Smelter observation callback and was valid for its same-cycle evaluation scope. In all ten measured Q owner cycles, however, the captured incumbent demand failed the comparator's supported pool/target check (`incumbent-demand-pool-or-target-unsupported`). No hypothetical `planSmelter()` call ran in those Q cycles, so this does not establish the requested supported G → Q comparison path. The final-bundle performance run also failed its repeated-control sensitivity gate: maximum matched control variation was 23.77%. Its G → Q windows are exploratory and cannot support a 2% claim.

## Boundary and authority

The existing Smelter owner still reads native input and Construction demand once, calculates its incumbent `planSmelter()` decision once, and sends that decision through its existing native control and postcondition path. Test-surface modes Q and U are evaluated from the same callback after the incumbent plan is formed. The owner callback builds a same-cycle incumbent snapshot, validates the supplied proposal, and reports a shadow result. It does not replace or modify the decision used for native execution.

The proposal contract carries goal and requirement identities, provenance, optional native action/price identity, resource/pool, finite positive additional quantity, root and progression identities, owner-cycle demand generation, player permission, originating owner, validity/expiry and required invalidation conditions, known competing commitments, and unknown commitment coverage. Only city Steel is supported. The test-only Q fixture is explicitly `provisional-advisory`; it is not verified mandatory MAD evidence. The unknown external commitment flag stays true. Goal-request authorization is always false, and the diagnostic contains no reusable native control handle.

The real warmed state did not support comparison. Q proposals were valid in all ten sampled owner cycles, but all ten returned unavailable quantitative comparison for `incumbent-demand-pool-or-target-unsupported`. They therefore had zero hypothetical planner calls and zero represented additional quantity. The test provider includes a `test-only:` symbolic Construction commitment to exercise the blocked diagnostic; that label is not captured Construction evidence. Unknown commitment coverage remains true. P12H.1 Research authority was not consumed: the path performs no Research draw or catalog scan.

The captured-owner unit fixture retains a 1,000 Steel Construction target and adds 10 Steel to the hypothetical target. The existing Steel demand remains represented; the generic supported fixture also demonstrates a changed hypothetical allocation. The ordinary game replay separately confirms Q does not change commands or state. These synthetic test fixtures establish neither autonomous strategy benefit nor execution authority.

## Correctness and parity

The G, S, Q, and U correctness cohort used one byte-identical test bundle (`f681efb30fe3cf73fdeb9075937384a414015b2394f893739532c7073def2a3c`) and the same saved game, settings, seed, epoch, and 1,784-period source-save warm-up. The attempted exported warm fixture did not reproduce assignments, the next boundary, or the next-worktick export, so it was rejected.

All four modes ended with export SHA-256 `36524514089e64ce22342fd56095d2d239c6f3483809d134ea3e2cb8a22dded7`, 94,940 native invocations with identical ordered invocation hashes and control usage, and 1,746 random calls. The correctness trace recorded ten owner outcomes per mode and matching postconditions. The test observer records a `no-op` postcondition with an empty allocation map because no allocation command ran; verified outcomes retain their exact allocation maps. The runner does not expose an independent Research-draw count; the callback path itself makes no draw. No mode produced page errors. Q and U made no additional native input or demand reads, native control calls, Research draws, or catalog scans. S/Q/U each added one progression-generation read per published owner cycle. At 100 workticks per measured window, Q validated 100 proposals but made zero hypothetical planner calls because authority was unavailable.

The short callback-duration cohort recorded 10 samples per mode. Q's values were 40.7–124.4 ms (median 43.9 ms); they cover the runner's selected worktick callback and are not an isolated proposal-only latency estimate. The CPU windows ran without trace or callback profiling. Q does not retain comparison results during those windows; the correctness hook retained only its short diagnostic cohort. Heap allocation was not measured.

## Performance experiment

The executable is `node experiments/p13d-owner-local-demand-admission-benchmark.mjs`. It ran on branch `deadspace`, starting HEAD `c9aea466575e0eb896354fbf15b430b1c6f0e916`, against `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`. It reuses the P13C.1 Chromium runner, renderer-PID attribution workload, CDP `TaskDuration`, 1,784-period replay warm-up, 800-period/100-worktick windows, byte-identical runtime-mode bundle, and four reversed/interleaved G/S/Q/U quartets. Raw process rows, task metrics, state hashes, call counts, and timings are in `test-artifacts/benchmark/tmp/p13d-owner-observation-benchmark.json`; the matching command and hashes are in `test-artifacts/benchmark/tmp/p13d-owner-observation-command.txt`.

Repeated G/G and S/S controls varied by as much as 23.77%, so the experiment correctly withheld a calibrated 2% conclusion. It still collected the four reversed matched quartets as exploratory data. Their G → Q renderer-CPU estimate was −6.82%, with an approximate 95% paired interval of −25.45% to +11.81%; CDP `TaskDuration` was −7.36%, with an interval of −28.66% to +13.94%. These wide, uncalibrated intervals are not a performance pass or fail. They also measure proposal validation and fail-closed comparison setup, not the missing hypothetical plan calculation.

P13C.1 measured one pure comparison after each S CPU window. It did not measure one comparison per owner worktick; that frequency distinction is corrected in `p13c-owner-observation-performance.md`.

## Remaining boundary

The next authority input needed is a current Smelter-boundary demand sample whose pool and Steel target satisfy the existing comparator, plus current goal/requirement evidence and observable invalidation facts for offer price, Construction queue, and external commitments. Until those inputs are available, no complete Q path or 2% G → Q gate is established. No ordinary production integration, autonomous Research purchase, worker transfer, construction order, Smelter reassignment, or shared reservation was added.

## Verification

- Focused Smelter, owner-coordination, and P12G capture/marginal tests passed.
- P13B.1 incumbent-authority replay passed with its output under `test-artifacts/benchmark/tmp/`.
- `npm run build` passed; the generated ordinary userscript had no diff and contained no P13D test hooks.
- `npm run check` passed all five checks and 356 test files.
- `node tools/chromium-evolve-runner-test.mjs` passed determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- The P13C.1 benchmark regression ran, but its fresh G/G and S/S controls varied by 10.09%; it withheld the factorial and reported measurement insufficient. Its historical calibrated result remains separate.
- The P13D G/S/Q/U run completed four reversed matched quartets as exploratory windows after its 23.77% control-variation gate failed. Its matching outcome-parity artifact records ten owner outcomes per mode under the same bundle hash. `git diff --check` passed.

Code and tests are committed separately from this characterization and the P13C.1 frequency correction. No changes were pushed.
