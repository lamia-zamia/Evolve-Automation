# P13N — Recurring goal-allocation CPU investigation

## Decision: stop without an optimization

The current no-signal J path is reproducible, but the exact runner cannot distinguish its incremental renderer CPU cost at the required 2% scale. Same-bundle controls moved 2.3–4.3% in renderer CPU and 1.8–5.3% in `TaskDuration`; the two reversed B/J pairs reported +2.24%/+3.74% renderer CPU. The apparent J increment is inside observed control variation. No measured benefit or safely removable dominant CPU cost is established, so this slice makes no allocation or owner change and does not admit the complete allocator through the CPU gate.

The requested G control means ordinary behavior. Stage 4A calls that scenario **B**; its Stage 4F scenario **G** still runs the goal selector and is not an ordinary baseline. The current-source measurements below therefore compare B (ordinary) with J. The earlier G/J runs are retained only to identify work shared by that historical selector comparison.

## Inputs and reproduction

| Input                              | Value                                                                                                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / source revision           | `deadspace`, starting HEAD `d383292a5769131bdd1649c8c393fff04f3f6ff4`                                                                                                                                                |
| Pinned upstream                    | `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                                                                                                                        |
| Current game snapshot              | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`                                                                                                |
| Exact runner checkout              | `lamia-zamia/tools@dba71a91ea4928e049847e7b399bd54f112ac8f6`; runner artifact SHA-256 `dddb85b6306907904512a31dc4e9a96da82b26178b9e5bf9f9e683a6bc00ffc8`                                                             |
| Current-source test bundle         | SHA-256 `c17d0ade1c004a40b1b0fce2d5a89b5fe8dae6fb7a6be188434b55085250b66b`                                                                                                                                           |
| Initial save                       | Stage 4F.3 p9000 G checkpoint, `test-artifacts/benchmark/tmp/stage4f3-p9000-save.json`, SHA-256 `8ef0c4b8c4d4259e40c86e505d89b3e149b09789543d6a1ecae50b2de64b2000`                                                   |
| Settings                           | `stage2e-integrated-mad-no-triggers.json`, SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`; effective settings SHA-256 `7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804` |
| Seed / epoch / Gather intervention | `42` / `2026-09-21T00:00:00.000Z` / `goal-derived-conjunctive`                                                                                                                                                       |
| Measured window                    | 1,000 periods, 125 work ticks, no warm-up; phase and callback profiling disabled during CPU runs                                                                                                                     |

All arms loaded the same save using the current game snapshot, current-source bundle, settings, seed, epoch, and runner. No absolute timing was compared with Stage 4F’s older generated game bytes. The old p9000 checkpoint is only an identical input state for each current-source arm. Exact per-run hashes and summaries are retained in [p13n-recurring-allocation-cpu-evidence.json](p13n-recurring-allocation-cpu-evidence.json).

The bounded-window mode added to `stage4a-goal-aware-acquisition.mjs` starts J at the checkpoint and ends CPU/task sampling immediately after the requested period advance. It performs the state export and diagnostic reads after the timing boundary. Full replay defaults and existing checkpoints are unchanged.

## Current hot path and work ownership

The no-signal J hook runs once during every Market work phase. In the 125-tick window it evaluated a candidate 125 times; all 125 results were `candidate-not-marketable` (`no-importable-shortfall`). It proposed and accepted no signal, requested no protected fresh Research read/draw, and performed no final-fence recapture.

For each J selection, `experiments/stage4a-goal-aware-acquisition.mjs` calls `readCurrentResearchCatalog()` in `src/bootstrap/captured-runtime-control.ts`. That adapter reads the current root, root generation, progression epoch, offered Research actions and definitions, current settings, grant levels, applicability, queue evidence, resource holdings/capacities, and each offer’s control generation. `evaluateGoalAwareAcquisition()` in `experiments/stage4a-goal-aware-acquisition.ts` then normalizes definitions, rebuilds prerequisite graph inputs and lookup maps, evaluates current offered candidates, projects missing resources, and ranks the candidates. Phase diagnostics measured 116.5 ms catalog-capture elapsed and 252.3 ms selector elapsed across the 125 calls. These are elapsed instrumentation figures, not renderer CPU.

The repeated capture is fresh by design. Root/progression identity alone does not prove that offers, control generations, settings, queues, resource holdings/capacities, or market import/price evidence stayed unchanged. There is no cross-cycle invalidation token covering those dependencies, so caching the catalog or selector result would weaken freshness. The evaluator’s separate maps serve different graph, applicability, holding, offer, and Market lookups; combining a map traversal is a small candidate cleanup, not evidence of a dominant renderer CPU reduction. No plan comparison ran in this no-signal window because no candidate produced a permitted import shortfall.

Normal native-owner work remained active in both arms. The Research owner still performed its normal catalog and draw lifecycle; the measured phase diagnostics counted 131 native Research draws in each arm. Market executed 125 route plans/completions and 422 ordered native route operations in both arms. The ordered Market operation sequence, control-usage map, resource snapshot, and final exported save matched exactly. Gather, Smelter, Construction, and Jobs remained behind their existing owner phases in `captured-runtime-control.ts`; no owner boundary or spending authority was moved. The phase profile also counted 125 MAD prerequisite-obligation classifications per arm. That is current Research-owner prerequisite work, not J’s incremental selector, and P13J/P13K claims and native Research selection were left untouched.

The test/diagnostic layer is distinct from production: this J selector and its per-cycle preflight/category recording are enabled only in the Stage 4A test bundle. The current no-signal production path does not invoke this test selector. Timed CPU runs disabled phase summaries and callback profiling. A separate callback-profile run measured latency; a separate phase-profile run measured the capture/selector breakdown.

P5–P9 evidence remains relevant: P6 established only operation-scoped Construction policy reuse; P8 found substantial false A/A effects even after counter calibration; P9 found no native price probes removable by an earlier safe gate and rejected cross-phase/worktick price reuse. Those findings rule out treating repeated arguments, stable epoch, or elapsed phase time as proof that native reads are redundant.

## Matched no-signal measurements

Renderer process CPU is primary. CDP `TaskDuration` corroborates. `ScriptDuration` is included only as a non-authoritative diagnostic. Results are paired in both orders:

| Pair / order | B renderer CPU | J renderer CPU | CPU delta | B `TaskDuration` | J `TaskDuration` | Task delta | B / J `ScriptDuration` |
| ------------ | -------------: | -------------: | --------: | ---------------: | ---------------: | ---------: | ---------------------: |
| 1 — B then J |       19.232 s |       19.664 s |    +2.24% |         16.289 s |         16.613 s |     +1.99% |      0.0431 / 0.0373 s |
| 2 — J then B |       20.157 s |       20.910 s |    +3.74% |         17.057 s |         17.741 s |     +4.01% |      0.0427 / 0.0427 s |

Same-bundle controls over the same window varied by B/B −4.32% renderer CPU and −5.25% `TaskDuration`; J/J varied by +2.27% and +1.76%. The B/J direction remained positive in these two pairs, but its magnitude cannot be separated from this observed control spread. The calibrated CPU and TaskDuration counters did respond to the workload; this result is a comparison-precision failure, not a claim that the counters are uncalibrated. No favorable single run or `ScriptDuration` result is used as evidence of savings.

### Functional and operation parity

Across both B/J timing pairs and the separate phase-count pair:

- Final export SHA-256 matched: `44b3417fe3db8b81c4d55e0899f6bc50e72098dea62e7ecb919ee7535cf0e622`.
- Resource snapshot SHA-256 matched: `de831eaf8982f2cedb1bf68a97c47502450b075e43e89594db1500c15ffbbc76`.
- Native control-usage map SHA-256 matched: `9c6ad485fee4c4d9904d89942cc101d4eb985f70740c74922570a31d42a3dbff`.
- Ordered Market route-operation SHA-256 matched: `c6a8a63fefccbfe8b8c5e756383431320ffb425401fdbbec168899d1d7a3cd71`; each arm made 422 operations.
- Native Research draws were 131 per arm; J requested zero additional draws.
- Runner `Math.random` call count was 1,194 in each arm; final Market assignments matched (46 Crystal routes, 47 Lumber routes).
- Accepted signals and final-fence recaptures were zero in J.

No allocator postcondition, player queue, resource reservation, Jobs assignment, purchase, random-call count, or export divergence was observed. The existing Stage 4A test-surface contract also passed.

## Work-cycle callback latency

Callback profiling ran separately from CPU measurement. The runner recorded 125 work-tick callbacks per arm; these are whole page callback latencies, not automation-only time.

| Callback latency |        B |        J |
| ---------------- | -------: | -------: |
| p50              |  75.3 ms |  76.8 ms |
| p95              | 100.2 ms | 105.4 ms |
| p99              | 128.4 ms | 117.3 ms |
| maximum          | 238.5 ms | 254.3 ms |

## Optimization decision and remaining budget gap

Removed work: none. Reused work: none. The largest visible J-only recurring operation is the fresh catalog capture plus candidate/graph evaluation, but its phase elapsed time is not CPU, and current-root/offer/control/resource freshness makes cross-cycle reuse unsafe. No narrower reduction was shown to be both dominant and measurable. A hypothetical within-call map consolidation would remove small temporary projections but has no demonstrated end-to-end effect; it was not implemented as a speculative second-best change.

Therefore there is no J-after measurement and the complete allocator has **not passed** the less-than-2% renderer CPU gate. Current B/J paired deltas are +2.24% and +3.74%, while same-bundle controls vary by up to 4.32% renderer CPU and 5.25% TaskDuration. The remaining budget gap is unresolved, not zero. The historical Stage 4F.3 no-signal +5.7–7.2% remains diagnostic context only.

The validation-heavy comparison was not run. P13N’s stop rule allows it only after a measurable no-signal improvement, which this slice did not establish; no 30,000-period campaign was run.

## Validation and recommendation

- Focused `stage4a-goal-aware-acquisition` test: passed.
- `npm run build`: passed.
- `npm run check`: passed, all five checks and 359 test files.
- `node tools/chromium-evolve-runner-test.mjs`: passed determinism, isolation, reload continuity, pause, cleanup, PID CPU accounting, callback attribution, and runner trace contracts.
- Current-source exact-runner B/J replay: matching final exports, resource state, native control counts, Research draw counts, and ordered Market route operations as listed above.
- `node tools/chromium-native-parity-test.mjs`: could not run because its required legacy fixtures `test-artifacts/benchmark/settings/baseline-tuned.json` and `test-artifacts/benchmark/saves/*` are absent from this checkout. It failed before opening Chromium; no fixture substitution was made.
- Prettier, Node syntax check, and `git diff --check`: passed after the bounded-window harness edit.

No independent J optimization is recommended until a lower-noise comparison can resolve a 2% renderer CPU effect. After that, instrument candidate-definition, offer, and cost-entry transforms per call, then consider one within-call elimination with full-decision differential coverage. Do not cache root, offer, price, control, resource, or prerequisite observations across work cycles without a complete lifecycle token. Validation-heavy measurement remains deferred until no-signal improvement is actually measured.

Stop here for independent review. The work is a benchmark extension and diagnostic report only; native owner and spending-authority semantics are unchanged.
