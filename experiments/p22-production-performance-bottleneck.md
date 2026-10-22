# P22 — Production performance bottleneck audit

## Decision: C — no production optimization retained

The late-game ordinary workload is substantial, but this audit did not establish a safely removable duplicate operation. The largest script-owned costs either represent current owner observations/actions or have no measured evidence of redundancy. Three same-bundle renderer CPU controls varied by 3.23% over a 100-work-tick window, so this run cannot admit a small CPU improvement. No production code or test was changed. This report and its compact evidence are report-only deliverables; the 2% future-allocator gate remains separate.

## Starting point and workload

- Repository: `deadspace`, starting HEAD `a0b282a6fcc616718d41cf9998f9e2abd2319949`.
- Pinned Evolve: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Built production bundle SHA-256: `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`.
- Game snapshot SHA-256: `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Retained fixture: `test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json`, with `settings/current-full.json`, seed 42, epoch `2026-09-21T00:00:00.000Z`.
- The selected fixture is the existing Stage 3N `late-many-owners` workload. It exercised ordinary Construction, Research, Jobs, Market, storage, factory and power owners. The P18 Human fixture was not used as a late-game proxy.
- The historical Stage 4F.3 p9000 no-signal checkpoint was not present as a retained input fixture; it was allocator-specific and was not needed for this ordinary-production profile. No replacement save was made.

The controlled window advanced 800 game periods (100 work ticks). All uninstrumented controls and the separate latency run reached the same exported state and save hashes, used 2,194 RNG calls and 121,695 native control calls. The active renderer accounted for 29.45–30.41 CPU seconds; other renderer CPU was at most 0.0006 seconds. The compact per-run evidence is in [p22-production-performance-evidence.json](p22-production-performance-evidence.json). Full runner output remains in ignored `test-artifacts/benchmark/tmp/` files.

## Measurement authority and reusable evidence

- Stage 4F.3 establishes renderer process CPU as the direct CPU measure for controlled `Runtime.evaluate`/`advance()` work, with CDP `TaskDuration` as a supporting renderer-task counter. Its calibration added about 250 ms of controlled integer work, which appeared in renderer CPU and `TaskDuration` while `ScriptDuration` stayed at zero. Do not use CDP `ScriptDuration` as CPU for this path.
- P13O shows the sensitivity limit: identical controls varied 7.9–9.3%, and a known 364.6–366.8 ms workload (about 2% of the window) did not produce a consistent CPU or `TaskDuration` response. Earlier allocator CPU estimates were therefore inconclusive.
- P13C.1 shows the exact runner can detect a larger/cleaner result under favorable controls: its maximum repeated-control difference was 1.025%, and a 250 ms calibration affected renderer CPU by 0.181 s and `TaskDuration` by 0.251 s. Its later sensitivity rerun had 10.09% control variation, so that result does not make every fixture/window sufficiently precise.
- Stage 3N's retained `early`, `progression` and `late-many-owners` runs remain useful for workload selection, owner counts and phase attribution. They used the runner's real timer path and report JavaScript/task timing; they are not renderer-process CPU results for this controlled `advance()` window. P13N's catalog/selector elapsed figures and Stage 3N phase timings remain attribution only.
- The exclusive phase timer subtracts nested children. `tick` is inclusive and must not be summed with its children. Work-cycle latency includes the game callback and automation. Profiling, native tracing and callback profiling were kept out of the CPU controls.

## Current workload profile

The separate instrumented pass recorded exclusive elapsed time and counts across the same 100 work ticks. Largest relevant measured contributions, in milliseconds per work tick:

| Operation                                     | Exclusive elapsed ms/tick |         Count / observations |
| --------------------------------------------- | ------------------------: | ---------------------------: |
| Native Research `drawTech` and DOM generation |                     32.32 |  103 draws/catalog refreshes |
| Market trade-route adjustment                 |                     13.61 |              100 owner calls |
| Jobs building-weighting price reads           |                      7.76 | 7,200 fresh build-cost reads |
| Construction saving discovery                 |                      7.53 |             100 observations |
| Construction `beginCycle` candidate refresh   |                      7.32 |                   100 cycles |
| Resource-demand build sampling                |                      6.86 |                  477 samples |
| Build-control capability checks               |                      4.17 |                 1,605 checks |
| Native batch action-cost work                 |                      4.34 |                   100 phases |
| Power cycle read                              |                      3.64 |             100 owner cycles |
| Construction demand preparation               |                      3.01 |             100 preparations |

Construction examined 7,550 candidates, sampled 727 conflicts and 464 competition sets, and executed 58 clicks. Jobs planned 100 times and read 7,200 build prices plus 1,100 craft prices. Storage made 7,200 building-target price probes. Demand sampling ran 159 times. These counts and the related phase details are recorded in the evidence JSON.

Research redraw is the largest phase but is a native owner observation; catalog registry reads averaged 0.25 ms/tick and offer acquisition 0.86 ms/tick. Build-control capability checks averaged 4.17 ms/tick across 1,605 checks. They re-read current root coverage for two shown tabs; the profile does not show that those checks are redundant within a stable root/control authority, and owners can run after mutations. I left them in place rather than reuse a potentially stale root or coverage result.

Market route adjustment is expensive, but the current captured owner reads current route/resources, plans, checks root/board/control freshness and verifies each requested mutation. This profile did not isolate a redundant pass that can be removed while preserving those freshness checks. Jobs made 7,200 fresh building-cost reads, and Storage made 7,200 building-target price probes in its own earlier owner phase. They sit on opposite sides of Build and Factory execution; matching counts do not make them duplicate observations because the native prices/control state can change between owners. Construction's candidate/weight refresh and resource-demand reconstruction were similarly current-state observations. No cache, skipped owner observation, or changed decision rule is justified by these measurements.

The work-tick callback latency run collected 100 work-cycle callbacks: p50 161.8 ms, p95 234.4 ms, p99 346.9 ms, maximum 637.4 ms. These are callback latency samples, not automation-only time or CPU.

## Controlled CPU controls and stop condition

Three `perf=false`, `callbackProfile=false`, `nativeTrace=false` runs used the same bundle, fixture, settings, seed, epoch and 800-period window. Their renderer CPU readings were 30.4134 s, 29.4969 s and 29.4525 s (range 3.23% of the 29.7876 s mean). `TaskDuration` was 26.7008 s, 25.7122 s and 25.6821 s (range 3.91% of the mean). All three had matching RNG counts, native control counts, state hashes and exported-save hashes.

Controlled-runner `ScriptDuration` was only 0.045–0.057 s while `TaskDuration` was 25.68–26.70 s, consistent with the Stage 4F.3 sensitivity finding. It is included in raw evidence only and was not used as a CPU measure.

The 3.23% same-bundle renderer spread is above the 2% allocator budget and larger than the putative improvement this audit could justify. The CPU comparison therefore stops here. No candidate-vs-baseline run was performed, and no CPU benefit is claimed. Phase timings identify expensive work but do not establish CPU savings.

## Candidate assessment

The sampled workload reveals significant ordinary CPU demand, especially native Research redraw, route adjustment, and fresh building-price/weighting observations. None met the bounded-optimization admission test: there was no demonstrated duplicate whose removal preserved owner observations, current prices, root/control freshness, RNG, and native actions. Cross-cycle reuse would violate the no-stale-cost constraint; skipping a required owner refresh would change its observation schedule. Accordingly there is no optimization attempt or regression test to retain.

P19 test-only bootstrap remains accepted. P20 generic Construction allocation remains retired. P21 found no supported Construction weighting defect. This audit adds no autonomous allocation behavior, Construction weighting rules, or resource-gathering strategy and makes no claim that ordinary automation performance admits a future allocator.

## Validation and preservation

The production source and exact runner were not modified. The runner used for measurement has a pre-existing one-line diagnostic-only `rngState` change in its separate `tools/` Git checkout; it was left untouched and is represented in the recorded runner input hash. Final validation commands and results are listed in the commit summary.

Validation passed:

- `npm run build`.
- Focused tests: `captured-ordinary-jobs`, `trade-routes`, `script-build-policy`, and `captured-resource-demand` (5 test files plus bundle syntax).
- `node tools/chromium-evolve-runner-test.mjs` (CPU accounting, callback attribution, trace hooks, determinism, isolation, reload, pause and cleanup contracts).
- `npm run check` (typecheck, architecture, lint, formatting, all 361 test files and bundle syntax).
- `git diff --check`; compact evidence JSON parsed successfully.

Reproduce the P22 controlled run from the repository root after `npm run build`:

```text
node experiments/p22-production-performance.mjs --mode=profile --periods=800 --repeats=1
node experiments/p22-production-performance.mjs --mode=cpu --periods=800 --repeats=3 --out=test-artifacts/benchmark/tmp/p22-production-cpu-controls.json
node experiments/p22-production-performance.mjs --mode=latency --periods=800 --repeats=1 --out=test-artifacts/benchmark/tmp/p22-production-latency.json
```
