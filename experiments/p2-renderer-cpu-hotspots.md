# P2 renderer CPU hotspot attribution

| Field                          | Value                                      |
| ------------------------------ | ------------------------------------------ |
| Date                           | 2026-10-17                                 |
| Branch                         | `codex/perf-p2-renderer`                   |
| Production baseline            | `90e8ca7558da6c2940c845d01ea41e77703b582b` |
| P1 audit commit on `deadspace` | `abd08fc` (audit files only)               |
| Game snapshot                  | `db38e2af831907d49aeb5348d678d8d8745d6c3f` |

## Method

The profiler is [p2-renderer-cpu-hotspots.mjs](p2-renderer-cpu-hotspots.mjs). It opens the exact Chromium runner's real game page, advances 600 warmup periods, then attaches CDP `Profiler` at a 1,000 μs interval for the 1,000-period measurement. It profiles the ordinary production userscript; the profiler and optional heap sampler run outside the bundle. Inputs are the existing late and mid fixtures from `p1-native-cost-baseline.mjs`, seed 42, and `autoPrestige=false`.

V8 sample counts are weighted by CDP `timeDeltas` to estimate exclusive leaf and inclusive ancestor time. These weights are estimates, not exact CPU milliseconds. A profile's 100% weighted sample-window coverage means the sample deltas span its CDP profile window; it does not mean the profile measured 100% of renderer CPU. Stack and script shares describe sampled work. Renderer process CPU from `SystemInfo.getProcessInfo` and page CDP `TaskDuration` remain the authoritative totals. Inclusive function and stack values overlap and must not be added.

## Original and sampled totals

The P1 original baseline below was captured with the same fixtures, bundle, seed, warmup, and measurement window. P2 also made a fresh ordinary-bundle baseline to compare profiler overhead under the current host load. Every ordinary and profiled repeat within each scenario exported the same state hash.

| Source / scenario                   | Renderer CPU per 1,000 periods | CDP `TaskDuration` | Export hash prefix |
| ----------------------------------- | -----------------------------: | -----------------: | ------------------ |
| P1 original, late (2 repeats)       |               19.93 s, 18.98 s | 17.739 s, 16.854 s | `77b357153516`     |
| P1 original, mid (2 repeats)        |               11.11 s, 11.53 s |  9.624 s, 10.031 s | `82292f32e3b3`     |
| P2 fresh ordinary, late (2 repeats) |               30.28 s, 27.15 s | 27.518 s, 24.447 s | `77b357153516`     |
| P2 fresh ordinary, mid (2 repeats)  |               12.33 s, 13.18 s | 10.505 s, 11.312 s | `82292f32e3b3`     |
| P2 CPU profile, late (2 repeats)    |               28.41 s, 26.54 s | 24.994 s, 23.468 s | `77b357153516`     |
| P2 CPU profile, mid (2 repeats)     |               14.58 s, 15.60 s | 12.424 s, 13.378 s | `82292f32e3b3`     |

Against the fresh ordinary medians, the profiled late medians were 4.3% lower in renderer CPU and 6.7% lower in `TaskDuration`; mid medians were 18.3% higher in both. The variation by fixture and the broad P1-to-P2 late shift show that these short repeat sets cannot establish a stable scalar “profiler overhead” correction. Keep the totals in separate columns and use the function profile for path ranking, not as an unprofiled CPU baseline. The source-mapped P1 active profiles from 2026-10-15 corroborate the main function ranking but are not used to replace these totals.

## CPU attribution

P2 produced two 1 ms CPU profiles per fixture. The late weighted sample windows were 24.93 s and 23.44 s; mid were 12.42 s and 13.37 s. Top exclusive functions were stable in rank:

| Sampled function / script         | Late sample share |                Mid sample share | Attribution                                                                                                   |
| --------------------------------- | ----------------: | ------------------------------: | ------------------------------------------------------------------------------------------------------------- |
| Vue `get` in `vue.global.prod.js` |        27.4–27.6% |                      22.6–23.0% | Dominant reactive property-read path; many stacks enter from captured automation operations.                  |
| Vue `set`                         |          2.2–2.4% |                        1.8–1.9% | Reactive writes and resulting page work.                                                                      |
| Game `sizeApproximation`          |          2.8–5.7% |                        5.7–5.8% | Upstream game calculation.                                                                                    |
| Game `fastLoop`                   |          2.6–3.8% |                        2.7–4.2% | Upstream per-period work.                                                                                     |
| Native `querySelectorAll`         |          2.6–2.7% |                        3.8–4.1% | DOM discovery and game rendering; a portion is initiated by automation.                                       |
| Game `adjustCosts`                |          1.0–1.1% | below the top-40 exclusive list | Native action-price calculation reached through game action controls and automation price reads.              |
| Automation `readCost`             |          0.7–0.8% | below the top-40 exclusive list | Adapter path in `captured-action-costs.ts`; this is its exclusive sample share, not its full downstream cost. |
| Garbage collector                 |        about 1.0% |                  about 0.9–1.0% | GC frames were observable in the CPU profiles.                                                                |

On the separate late CPU-plus-heap diagnostic, exclusive sample shares were Vue 34.4%, game 35.7%, automation 17.3%, native/DOM 5.8%, and the profiler's `(program)` frame 6.3%. This confirms script attribution but is not merged into the two-repeat CPU result because HeapProfiler adds separate instrumentation.

### Price computation and adapter cost

P2 samples show the game-side `setData` frame at about 0.6–0.8% exclusive sampled time and `adjustCosts` at about 1.0–1.1%. `costMultiplier2` and `spaceCostMultiplier` add roughly another 2% combined exclusive time late. The automation-side `readCost` is roughly 0.7–0.8% exclusive. These are separate self-sample estimates along the same call paths; the inclusive `readCost`, `setData`, and `adjustCosts` stacks overlap and should not be summed. The source-mapped P1 profile measured about 12.5% inclusive stack share at each of `readCost`, game `setData`, and `adjustCosts`, illustrating that the full price stack is materially larger than any single function's self time.

The profile distinguishes the automation wrapper (`readCost` / `invokeControl`) from the upstream computation (`setData` / `adjustCosts` / cost multipliers). CDP's JavaScript sampling does not provide a separate native engine time breakdown for the nested price call; do not interpret the `setData` frame as the entire cost of a probe. P1's targeted trace counted 36,862 `buildQueue.setData` calls over the late warmup plus measurement and 2,938 mid. In an eight-worktick measurement it observed 661 late and 184 mid native probes per interval. A `readCosts` batch still invokes native `setData` per row.

### Feature paths named for P2

| Area                   | Sample evidence and limits                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction           | `readSavingCost` repeats were measured directly by P1, but their individual call stacks and invalidation ordering were not retained. The safe local-reuse ceiling from P1 was only 0.60 ms/worktick late and 0.58 ms/worktick mid. Construction `beginCycle` is visible in the heap allocation stacks, not a dominant CPU self-time function. |
| Catalog / availability | Late P2 exclusive estimates: `readCapturedActionAvailability` ~0.9–1.0%, `readCapturedBuildingUnlockStateRecords` ~0.6–0.7%, `countKeys` ~0.6–0.7%. Mid `readCapturedActionAvailability` is lower (~0.6%). Catalog construction itself was not isolated, so these are measured neighboring observations, not a catalog-generation total.      |
| Demand                 | `hasCapturedProjectStorageDemand` is ~0.6–0.7% late and ~1.2–1.3% mid exclusive. A representative stack is `hasCapturedProjectStorageDemand → sample → readDemand → runPhase → runCycle`. Demand's ID cache already shares reads within its reader and `actionCostEpoch`; it does not prove safety for cross-owner reuse.                     |
| Jobs / Craftsmen       | `readCapturedJobCatalog` was ~0.05% late in the source-mapped profile. A Craftsmen stack through `resolveResourceId` was about 0.5% in mid. The named Jobs/Craftsmen paths are not a leading total-CPU target for these two fixtures; JSON equality and catalog scans need call-site isolation before being blamed.                           |
| Power                  | The stack `querySelectorAll → powerBadge → fastLoop → execGameLoops` was ~0.6% late and ~1.6% mid in the sampled stack tables. `powerBadge` itself had low exclusive time; this is mostly the DOM/upstream game path.                                                                                                                         |
| Runtime scheduling     | `runPhase` / `runCycle` appear high in stacks because they are common ancestors of feature work. Inclusive scheduler time would double-count the feature leaves. The CPU profile did not isolate scheduling overhead from its children, and the `(program)` bucket is not automation scheduling.                                              |

Representative demand discovery stack: `parseHTML → toNodes → setAction → addAction → drawTech → loadTab → invokeControl → captureTechDefinitionsDuring → sampleOfferedTechs → ensureDemandResearchObservation → readDemand → runPhase`. It accounted for about 1.6% of a late sampled profile and connects expensive DOM parsing to a demand-triggered native draw. Another hot stack is `querySelectorAll → powerBadge → fastLoop → execGameLoops`.

## Allocation and garbage collection

The separate late HeapProfiler sampling run reported 95 allocation samples and approximately 3.51 MB of sampled allocation sizes. Largest sampled functions were upstream `setAction` (about 15%), V8 bytecode compilation (14%), V8 external idle work (8%), SortableJS (6%), and upstream `popover` (5%). Automation allocation sites included `createDisposableApp` (~4%), `materializeSettings` (~3%), and sample/cycle helpers below 1% each. Heap samples estimate allocations by stack; they are not total heap growth and do not establish CPU saved by reducing them. GC CPU samples were under 1% in the source-mapped profiles, so GC is not currently the largest opportunity.

## P1 Construction reuse eligibility correction

| Scenario | Repeated probes cited by P1 | Proven eligible | Proven ineligible | Unknown |
| -------- | --------------------------: | --------------: | ----------------: | ------: |
| Late     |                          93 |               0 |                 0 |      93 |
| Mid      |                         210 |               0 |                 0 |     210 |

The per-event P1 JSON was not retained, so the 303 probes cannot be classified from event-level evidence. Same phase, same `actionCostEpoch`, and matching observed cost/pool do not satisfy the requested reuse proof:

- `captured-build.ts` assigns `savingCycle = cycle` in `finishCycle`, while `beginCycle` later replaces `cycle`. The captured trace does not prove which map supplied each repeated candidate or that it equals the current build cycle.
- `captured-construction.ts` separately keeps `completedIntent`, produced only after a completed ordering cycle. Its candidates may outlive a later in-progress build cycle.
- P1's trace did not record whether any native command ran after the candidate sample. An unchanged epoch is insufficient because not every game-side or external mutation is guaranteed to advance it.
- The existing `readSavingCost` check compares the pool, but does not compare target identity, full price, or a control generation. Equal returned cost/pool was observed, but the target/settings/root/control-generation tuple was not retained per event.
- Root replacement clears `completedIntent`; settings are re-read; failures and exceptions fail closed. The trace did not prove those inputs stayed stable for each repeat.

Therefore none of the 93 late or 210 mid probes is proven eligible or proven ineligible. Do not implement caching from these counts.

## Five next candidates

Shares are estimated from weighted sample shares and the ordinary renderer CPU denominator. They are screening estimates; profiler overhead varied by fixture, so each candidate needs a matched unprofiled A/B before acceptance.

| Rank | Candidate and estimated renderer CPU share                                                                                                                                                                                                            | Correctness / invalidation risk                                                                                                                                   | Complexity  | Regression-test burden                                                                    | Assessment                                                                                                                                                                   |
| ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Reduce repeated Vue reactive getter work caused by captured reads. Vue `get` alone was 23–28% of weighted samples; the source-mapped profile attributed 51% of getter samples to automation-initiated stacks, a rough 12–15% total renderer CPU path. | Medium-high: values are live and game mutations happen between feature phases; any reuse must stay within one synchronous adapter capture.                        | Medium-high | High: adapter contracts plus exact late/mid state/control parity.                         | Largest credible path and comfortably large enough to test for a 2–3% end-to-end gain. The initiated-stack estimate is not an achievable-savings claim.                      |
|    2 | Reduce redundant native action-price work across consumers. The full sampled `readCost`/`setData`/`adjustCosts` stack is about 10–13% inclusive; distinct self samples across the major price frames are about 4–5%.                                  | High: cost inputs include building/razed counts, population, research, race, traits, government, supply, and action-specific state; epoch coverage is incomplete. | High        | Very high: ordering, mutations, control generations, target/pool/price and failure cases. | Credible only as a tightly bounded measurement and authority project. The proven Construction-local upper bound is 0.4% late / 0.6% mid and all cited probes remain unknown. |
|    3 | Reduce repeated demand, availability, and progression observation. Named measured leaves range from ~0.6% to ~1.3% each, with a possible combined 2–4% path if call stacks prove overlap is avoidable.                                                | High: unlocks, root/settings replacement, and feature ordering can invalidate observations.                                                                       | Medium      | High: settings/root changes and same-tick ordering coverage.                              | Plausible, but current profiles do not isolate a 2% removable slice.                                                                                                         |
|    4 | Avoid redundant technology discovery redraw/parsing from demand preparation. `parseHTML` self was ~1.8% late and fully automation-initiated in the source-mapped stack; automation-initiated `querySelectorAll` adds roughly 1% or more.              | Medium: offered actions and computed costs depend on live game state and current rendering.                                                                       | Medium      | Medium-high: offer transitions and draw/control capture parity.                           | Could approach 2–3% when combined, but the profile's stack groups and fresh CPU variance leave the size uncertain.                                                           |
|    5 | Trim Jobs/Craftsmen and Power observation. The largest specific Jobs catalog leaf was ~0.05% late; a mid Craftsmen resource-resolution path was ~0.5%; the Power DOM stack was ~0.6% late / ~1.6% mid.                                                | Medium: controls, reservations, and exact native answers must stay current.                                                                                       | Low-medium  | Medium                                                                                    | Measured contributions are too small or too mixed with upstream game work to support a 2–3% target on their own.                                                             |

### Precise next implementation prompt

> On `deadspace`, investigate the Vue reactive `get` hotspot in `src/adapters/evolve/vue-capture.ts` and its highest-weight captured automation callers. First add a bounded test-only call-site attribution to identify which caller repeats reads of the same Vue-backed record during one synchronous observation. Then make one adapter-local batching change at that caller so a record is read once and its fields are consumed from that local observation. Do not cache across feature phases, ticks, control generations, settings changes, or root replacement, and do not change the upstream game or capability-port contract. Add adapter contract coverage for getter failure, root replacement, and changed values; verify ordinary-bundle export and control-usage parity on both P2 fixtures. Measure at least four matched unprofiled pairs per fixture after warmup (600 periods) and measurement (1,000 periods), seed 42, `autoPrestige=false`; accept only if median renderer CPU improves by at least 2% in both fixtures and `TaskDuration` agrees in direction. Keep profiling off for those timing runs.

## Verification and artifacts

- `node --check experiments/p2-renderer-cpu-hotspots.mjs` — passed.
- `node tools/chromium-evolve-runner-test.mjs` — passed callback attribution, determinism, isolation, reload continuity, paused-game handling, and cleanup checks.
- `npm run build` — passed. `npm run check` — passed type checks, architecture checks, lint, formatting, and all 347 test files.
- The ordinary bundle hash was `b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540`; profile and ordinary exports/control usage matched for both fixture scenarios.
- P2's ordinary run hashes matched the P1 originals: late `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2`, mid `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab`.
- The P2 profiler and allocation sampler are external CDP sessions. No profiler hook was added to source or production output; the post-build userscript SHA-256 matches the starting production bundle.
- Raw CPU/heap profiles and run JSON are under ignored `test-artifacts/perf-profile/` and are reproducible with the script. Example: `node experiments/p2-renderer-cpu-hotspots.mjs --scenario both --repeats 2 --warmup 600 --periods 1000 --sampling-us 1000`. From this managed worktree, the script resolves the sibling nested `tools/` repository automatically; `EA_TOOLS_ROOT` can override that path.
- P1 event-level price trace output was absent; the reuse eligibility table above records that missing evidence instead of reconstructing it from counts.

P2 is ready for review. No production optimization was implemented.
