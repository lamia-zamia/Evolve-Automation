# Native Price Observation A/B — safety gate

## Decision: stop before candidate variants

Neither proposed observation window is proven safe against the pinned upstream game. The experiment therefore stops at the freshness gate, as required. No A, B, or AB reuse code was added; there are no candidate bundles, candidate probe reductions, candidate parity results, or candidate CPU measurements. This is a correctness decision, not a performance rejection.

## Baseline preservation

- Production baseline branch and commit: `deadspace` at `409383b2e7325be1ba5a93fa300daa2a7338a1e8`.
- Experiment source: `experiment/shared-native-price-observation` at `2589b5bb`; requested work branch: `experiment/shared-native-price-ab`.
- The ordinary generated bundle in the new worktree was rebuilt before any source edits. Its SHA-256 is `FD04D858F69E917367EFEBA3A725CCD2C810E838C613705B1F423500B39E7C20`, matching the stated production hash.
- The pinned upstream checkout `D:/work/Evolve-DeadSpace` is at `db38e2af831907d49aeb5348d678d8d8745d6c3f` (`DeadSpace`). It was not modified.
- Corrected trace and CPU-profiler tools from the starting experiment branch are retained. Detailed trace/profiler instrumentation was not enabled for renderer CPU measurement; no renderer CPU benchmark was run in this slice.

## Native authority and shared proof gaps

At the pinned commit, `src/functions.js` `buildQueue.setData(index, prefix)` (lines 669–716) resolves the action from the current indexed queue row. It calls `adjustCosts(c_action)`, invokes each returned cost closure, and for the `data` prefix separately calls `actionPool(c_action)`. `adjustCosts` (2453–2486) composes live adjustments; its inputs include current race/traits, government, technology, action/building state, and resource-related effects. Closures can read state when `setData` invokes them. `actionPool` (1232–1235) reads current supply mode and action supply. Thus a previously parsed `GameActionPrice` is a snapshot of both a dynamic cost result and its paying pool.

An unchanged player queue or `actionCostEpoch` does not prove that those inputs, closures, current action binding, or paying pool stayed unchanged. A stale observation is prohibited after any relevant mutation, a possible mutation, an exception/partial execution, a root or control-generation replacement, or an unavailable source price. Execution-time freshness must still be checked even if an observation is captured.

## Window A — Construction saving to pre-Gather Demand

**Source.** `progression.establishConstructionOrdering()` calls `createCapturedBuildSource.beginCycle()`; each eligible managed building is priced by `costs.readCost(target.elementId)` in `src/adapters/evolve/progression/build/captured-build.ts` (168–201). The native `buildQueue.setData` result, including its pool, is the authority. The construction saving observation retains the price for ordering. `readSavingCost()` (148–165) itself performs a fresh price read and is not an eligible reuse source.

**Destination.** `readDemand("pre-Gather")` samples managed building targets and calls `sampleCosts.readCost(target.elementId)` in `src/adapters/evolve/economy/resources/captured-resource-demand.ts` (1799–1845). Demand needs the same current native cost and pool to form its storage targets; an old but numerically matching amount is not sufficient evidence.

**Intervening operations.** The runtime invokes construction ordering at `src/bootstrap/captured-runtime-control.ts` (5832–5842), then reaches the demand branch (5884–5897). Between the last construction price and managed-build demand prices:

1. Construction processes its Build source before its Project source (`src/adapters/evolve/progression/captured-construction.ts` 347–359). After the building prices, the Project source may call `catalog.readProjects()` (`captured-project.ts` 191–207), which can force a Physics draw on first capture (`captured-arpa-mechanics.ts` 507–537). Pinned `src/arpa.js` `physics()`/`addProject()` (1878–1885 and 3466+) initializes missing `global.arpa[project]` entries. This is a real root-state write between the building price source and Demand. `adjustCosts` does not directly read `global.arpa`, but native action cost closures are not proven independent of it. Construction also reads the queue to mark queued actions (`captured-build.ts` 203–215); it does not purchase a candidate in this ordering step.
2. A resource-claim hook may sample offered technologies, but only on the test-surface path (`captured-runtime-control.ts` 5848–5882). Production hooks are inert unless the test surface is enabled.
3. The runtime checks construction-order readiness, then calls `readDemand`. Its `ensureDemandResearchObservation` invokes `progression.sampleOfferedTechs("resource-demand")` (`captured-runtime-control.ts` 3528–3550) before managed-building prices are read. On a first catalog sample this reaches `captured-tech-catalog.ts` 148–204, forces native discovery/drawing, and may restore the player tab with another draw (`captured-tab-discovery.ts` 513–620). Pinned `actions.js` `drawTech()` checks paths/qualifications/requirements and runs `addAction()`/`setAction()` (6328–6422, 6555–6675, 6677–6737); this removes/recreates DOM actions and evaluates native condition, affordability, and cost closures. The powered-action `initStruct`/`on` write in `setAction()` (6696–6704) is not reachable for pinned Research actions because none of their definitions has `powered`, but the full condition/cost closure graph and fallback redraw path are not certified read-only for native building prices. Demand also samples current project and managed-building catalogs.
4. Gather runs only after pre-Gather Demand completes (5895–5897). Therefore Gather's possible resource changes are downstream of this particular source/destination pair.

Construction's first Physics capture has a proven `global.arpa` write, although the audited `adjustCosts` body does not directly read that store. Research drawing is mostly DOM work for the pinned Research actions, but it invokes native `condition()` and cost closures and can restore through another draw; the adapter has no effect contract proving those arbitrary closures and capture operations are read-only for all building price/pool inputs. The trace's equal prices, pools, queue, and epoch are observations, not proof for other states or executions. A is therefore not enabled.

**Cases that prohibit reuse:** building count/razed-state change; technology unlock or grant; race, trait, gene, or government change; action/queue/binding replacement; supply mode, supply pool, or relevant world change; any dynamic cost closure whose inputs were not proven stable; missing or failed source price; root/control-generation replacement; native discovery or Research drawing without a read-only proof; exception or partial execution. Any later purchase also requires a fresh execution-time price.

## Window B — pre-Gather Demand to Storage

**Source and destination.** Demand's managed-building `readCost` probes are the source. Storage calls the same native-cost adapter through `readCosts()` in `src/adapters/evolve/economy/storage/captured-storage.ts` (277–352); it requires an ordered result array, each available price's pool, and native first-failure behavior.

**Intervening operations.** After pre-Gather Demand, `src/bootstrap/captured-runtime-control.ts` (5895–5994) may execute Gather (`buildingAlwaysClick`), Market, Hell, Galaxy Market, Mining Droid, Graphene Plant, Alchemy, Pylon, quarry/mine/extractor ratio controllers, and Smelter before Storage. These phases can execute game-facing controls; their active-state setting alone does not establish that all discovery, redraw, and execution paths were read-only. Gather can collect resources; Market and other automation can trade, buy, assign, or otherwise change game state. No complete typed price-mutation revision classifies these operations. `storageMutationObserved` is raised only after Storage (5995–5999) and cannot establish freshness before Storage.

Pinned `buildQueue.setData` selects the action by queue index (669–697). Storage appends all temporary rows, probes them in order, stops on the first unavailable price, and removes the appended suffix in `finally` (`captured-action-costs.ts` 282–379). This preserves action selection and queue integrity, but later rows are evaluated after earlier native calls and against then-current globals. Index selection does not prove independent prices. Reusing Demand results through the phases would change whether the current native cost closure and `actionPool` are evaluated at Storage time. B is therefore not enabled.

**Cases that prohibit reuse:** any Gather, Market, Hell, Galaxy Market, Mining Droid, Graphene, Alchemy, Pylon, ratio-controller, Smelter, or other intervening operation not positively classified as read-only for all cost and pool inputs; any purchase, grant, trade, assignment, structure/race/tech/government/trait/supply change; player queue or root/control replacement; failed price; exception or partial phase; and any Storage batch whose ordered row or first-failure semantics cannot be preserved. Storage must otherwise retain result order, pool, availability, first failure, and suffix cleanup.

## Measurement and parity status

The corrected trace on the starting experiment branch estimated 5.86 ms per late work tick for Construction→Demand and 4.75 ms per late work tick for Demand→Storage (10.61 ms combined); its mid-game estimates were 0.63 ms and 0.60 ms. Those are measured destination-probe durations that could be skipped if reuse were valid, not renderer CPU savings. Trace observations showed no price/pool, root, player-queue, or tracked-epoch changes in the matched windows, but the trace explicitly did not observe every upstream pricing input. It also found temporary Storage prefixes changed in 568/576 late Demand→Storage matches; this does not establish that the live pricing inputs stayed fixed.

Actual avoided native calls in A/B/AB: **0** (no variants were built). Behavioral parity across variants: **not run**. Renderer-process CPU, `TaskDuration`, work-cycle latency distributions, instrumentation overhead during performance runs, and candidate run-to-run variance: **not measured**. No diagnostic shadow-pricing was run. The baseline bundle hash above was verified; `deadspace` remains untouched.

The original acceptance gates (late ≥8 ms/work tick, mid ≥2 ms or justified late-only result, corroborating `TaskDuration`, no tail regression, exact parity, no freshness violations, and `npm run check`) are not evaluated because there is no correct candidate to benchmark. The 10.61 ms trace estimate cannot be converted into renderer CPU savings without a valid implementation and the specified paired runs.

## Recommendation

Investigate the Research/discovery drawing boundary first: it is the principal unresolved read-only question in Window A and could determine whether that otherwise short interval has usable authority. Do not proceed to Market-board validation or implement A/B until the effect classification is explicit and testable. No follow-on work was started here.
