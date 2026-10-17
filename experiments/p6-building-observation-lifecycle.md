# P6 — Repeated Building observation and mutation-boundary audit

## Result

The call graph contains one safe, synchronous duplicate: Construction asks for its complete policy once for cycle options and again for its Building source targets. Both calls occurred inside one `reader.beginCycle()` with no native action or policy input mutation between them. I moved Building control discovery before the first policy sample and pass that exact immutable policy result to both consumers for the lifetime of one `establishOrdering()` or `runCycle()` call.

This is a bounded Construction operation memo, not a worktick cache. It is cleared before and in `finally` after each operation. No other current Building observation is reused. The candidate is ready for independent review; do not merge or push as part of this audit.

## Inputs and method

- Automation base: `2a4b6633` on `deadspace`; experiment branch: `experiment/p6-building-observation-lifecycle`.
- Upstream source and exact-runner snapshot: DeadSpace `db38e2af831907d49aeb5348d678d8d8745d6c3f`, snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Late and mid fixtures, seed 42, 600 warmup periods, 1,000 measured periods. The probe records measured observations and their native availability evaluations. The parity runner reports cumulative control usage across its full 1,600-period session (warmup plus measured periods).
- Probe instrumentation is test-only in `experiments/p6-building-observation-lifecycle.mjs`; exact-runner parity is in `experiments/p6-building-observation-parity.mjs`. Neither changes production at runtime. No end-to-end CPU A/B was run.

## Complete current-observation call graph

All full current observations converge on `createCapturedBuildPolicyReader()` or the explicit progression reader. The common native path is:

```text
initiating runtime phase / feature
  -> readUnlockedStorageBuildTargets(), readManagedBuildTargets(), or readBuildingUnlocks(regions)
  -> readPolicy() when the path needs a managed policy
  -> createCapturedBuildPolicyReader()
  -> derive requested regions from the currently captured Building control IDs
  -> readCurrentOffers(regions)
  -> readBuildingUnlocks(regions)
  -> buildingUnlocks.read(regions)
  -> mechanics.readStructures()
  -> join requested bindings to native structure identities and requested root state records
  -> structure.readAvailability(root) for each requested binding
  -> build the complete region catalog, or return unavailable on an incomplete/invalid region
  -> replace the established sample for that region scope on success; clear overlapping samples on failure
  -> use the result to filter and build the current policy's Building targets
```

`captured-building-unlocks.ts` caches the structure-to-binding index when `mechanics.readStructures()` returns the same immutable structure array. It still calls `mechanics.readStructures()` and reevaluates every requested native availability on every full current observation. `readEstablishedBuildingUnlocks()` and `readEstablishedStorageBuildTargets()` are separate paths: they do not call `buildingUnlocks.read()`. They accept only a compatible region scope at the current progression epoch and retain fail-closed behavior.

Initiators and consumers:

1. **Cycle-start demand preparation** — `capturedRuntimeWorkTick` calls `progression.readUnlockedStorageBuildTargets()` in `construction demand preparation`. It ensures Building controls, makes one current policy observation, then gives Storage/Build demand an established catalog. The current catalog is consumed to create the managed targets; subsequent demand reads use established data.
2. **Construction saving discovery** — runtime `runPhase("construction saving discovery")` calls `progression.establishConstructionOrdering()`, which calls `construction.establishOrdering()` and `reader.beginCycle()`. `beginCycle()` calls `readOptions()` first, then each `source.beginCycle()`. Baseline `readOptions: readPolicy` makes the first full observation at `construction-options`. The Building source then invokes `readTargets`, whose baseline closure called `readPolicy()` again at `construction-build-source`; its result supplies candidate Buildings. The source's `ensureControls` callback ran between the two reads. Both results were consumed by the same cycle: options govern cycle rules and `policy.buildings` supplies candidates.
3. **Storage execution** — `storageAutomation.run()` calls its `readBuildTargets` port, wired to `progression.readUnlockedStorageBuildTargets()`. This makes a fresh current observation in `autoStorage`; the returned targets are consumed by storage allocation. A successful assignment or expansion invalidates dependent demand after the phase. It is not covered by the Construction memo.
4. **AutoBuild execution** — runtime `runPhase("autoBuild")` calls `progression.runConstructionCycle()` → `construction.runCycle()` → `runBuildAutomation()` → the same `reader.beginCycle()` ordering as saving discovery. Baseline it performs one full observation through `readOptions` and one through Building `readTargets`, then the executor may attempt construction actions. The executor actions occur after the complete cycle sample.
5. **Factory** — the captured Factory automation reads managed Building targets through `progression.readManagedBuildTargets()` (wired at `captured-runtime-control.ts` Factory composition). It ensures controls and requests a fresh policy observation in `autoFactory`; those targets gate Factory decisions. Factory mutation invalidates downstream demand; the read is not reused by Jobs.
6. **Jobs and craftsmen** — full Jobs and the combined `autoJobs with autoCraftsmen` path use `progression.readManagedBuildTargets()`. They request their own current policy in their Jobs phase and consume it for building-dependent decisions. Ordinary jobs/craftsmen paths can also call this port depending on settings.
7. **Post-Research preparation** — when Research changes the progression epoch, runtime invalidates the prior sample, resets the Building unlock sample, then calls `readUnlockedStorageBuildTargets()` in `post-research construction demand preparation`. That fresh read follows the Research action and establishes the new catalog. Three such reads occurred in the mid fixture.
8. **Pre-Power preparation** — if enabled and required, the pre-Power phase calls `readUnlockedStorageBuildTargets()` after earlier mutators. It establishes current demand inputs before Power; it is not reused across the mutator boundary.
9. **Trigger paths** — trigger demand/target readers can call `progression.readBuildingUnlocks(regions)` or a policy-backed managed target read. A successful trigger, or a failed phase that may have clicked earlier triggers, invalidates demand. Trigger automation was disabled by the measured fixture settings, so these current reads were not observed.
10. **Mech bay expansion** — the non-established path in `readCapturedMechBayExpansion(false)` reads managed targets and separately requests the Mech region via `readBuildingUnlocks()`. This can produce two observations in that feature when enabled; its inputs and mutation behavior are not part of the Construction-only reuse. The established Mech path does not call `buildingUnlocks.read()`.
11. **Prestige reset actions** — the Prestige reader's `readBuildingResetActions(regions)` callback calls `progression.readBuildingUnlocks(regions)` to determine currently offered reset actions. It is separate from construction policy reuse and was disabled in these runs.

Every successful full read replaces the established sample for its exact region scope, even where the resulting membership is semantically unchanged. A failed read removes any established scope overlapping the requested regions. The policy consumes current membership immediately; later established readers consume only compatible current-epoch samples. Within the duplicate Construction pair, the established sample was refreshed but its scope, epoch, regions, and unlocked membership did not change.

## Per-phase and per-call-site counts

Counts below are measured-window counts from the P6 probe. Regions are City for mid (63 bindings) and City+Space for late (158 bindings). The `construction-build-source` row disappears as a full-observation call site in the candidate because it receives the memoized policy's `buildings` value.

| Fixture | Phase / call site                                           | Baseline | Candidate | Requested regions |
| ------- | ----------------------------------------------------------- | -------: | --------: | ----------------- |
| Late    | construction demand preparation                             |      125 |       125 | City, Space       |
| Late    | construction saving discovery / `construction-options`      |      125 |       125 | City, Space       |
| Late    | construction saving discovery / `construction-build-source` |      125 |         0 | City, Space       |
| Late    | autoStorage                                                 |      125 |       125 | City, Space       |
| Late    | autoBuild / `construction-options`                          |      125 |       125 | City, Space       |
| Late    | autoBuild / `construction-build-source`                     |      125 |         0 | City, Space       |
| Late    | autoFactory                                                 |      125 |       125 | City, Space       |
| Late    | autoJobs with autoCraftsmen                                 |      125 |       125 | City, Space       |
| Mid     | construction demand preparation                             |      125 |       125 | City              |
| Mid     | construction saving discovery / `construction-options`      |      125 |       125 | City              |
| Mid     | construction saving discovery / `construction-build-source` |      125 |         0 | City              |
| Mid     | autoStorage                                                 |      125 |       125 | City              |
| Mid     | autoBuild / `construction-options`                          |      125 |       125 | City              |
| Mid     | autoBuild / `construction-build-source`                     |      125 |         0 | City              |
| Mid     | autoJobs with autoCraftsmen                                 |      125 |       125 | City              |
| Mid     | post-research construction demand preparation               |        3 |         3 | City              |

The totals are 1,000 → 750 late and 878 → 628 mid, over 125 measured workticks per fixture. No trigger, Mech, Prestige, or pre-Power current observation occurred in these fixture settings. Established-read events are traced separately and are not included in these full-observation counts.

## Mutation-boundary classification

### A. Proven immutable interval and accepted reuse

The baseline pair `construction-options` → `construction-build-source` occurred 250 times in each fixture. Each interval was one synchronous `reader.beginCycle()` operation, requested the same complete region coverage, and was followed by consumption in that same cycle. Trace facts for the pair:

- zero native `action` calls and zero build-control sweeps;
- one `ensureBuildControls()` call, before the second baseline observation;
- zero changes in observed settings fingerprint, control revision, root generation, or progression epoch;
- zero changes in established scope/epoch/region/unlocked membership;
- all 500 pair observations were complete; no page errors.

The `on_cap` checks and `buildQueue.setData` price probes in this interval are reads. Upstream's bound `on_cap` route calls the action's `on_cap()` callback (or reads its count), and the relevant callback paths are getters. The pinned game `buildQueue.setData` computes queue cost data and returns it; it does not click or buy. More importantly, the candidate moves the existing control ensure before the one current sample, so if that ensure discovers or regenerates a control, the shared policy is sampled after discovery. Reuse is only between two consumers of that completed sample within the same synchronous cycle.

### B. Potentially mutable intervals retained as fresh reads

| Boundary                                                  | Evidence / handling                                                                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction attempt or failure                           | Native build actions occur only after `reader.beginCycle()` has completed. The operation memo is cleared in `finally`; the next operation observes again. No action result can leak into a later cycle. |
| Storage assignment/expansion                              | `autoStorage` has its own fresh observation. Confirmed capacity mutations invalidate demand, and later Construction reads remain fresh.                                                                 |
| Research grant                                            | Mid trace has three Research actions with progression epoch changes; each invalidates/reset samples and is followed by the post-Research current read.                                                  |
| Trigger action, including partial success before an error | Runtime explicitly invalidates after an active or failed trigger phase. Trigger settings were off in the trace; no cross-phase reuse is introduced.                                                     |
| Factory mutation                                          | Factory has its own current policy; after its mutation, downstream demand and Jobs remain separately sampled.                                                                                           |
| Native availability changes without epoch change          | Existing adapter regression verifies that a later fresh observation sees an `on_cap` answer change with the same epoch. Current reads in separate operations/features are retained.                     |
| Settings change                                           | The memo is operation-local and cleared on return/throw. Each subsequent policy operation reads settings anew. No settings fingerprint change occurred inside a duplicate pair.                         |
| New or regenerated controls                               | Build controls are ensured before the one sample. Any later phase calls its own ensure and current read. No sweep occurred inside the measured duplicate pair.                                          |
| Root replacement/game reset                               | Root replacement invalidates established samples and control coverage; operation memo cannot span operations. No root replacement occurred in either fixture.                                           |

### C. Unknown or incomplete intervals retained as fresh reads

An unknown native availability result, invalid catalog, incomplete requested region, or thrown native structure read must remain fail-closed. The optimization stores the policy object returned by `readPolicy()` even when it contains no Building candidates; it does not convert an unavailable result into an empty successful catalog or query a narrower scope. There is no cross-operation fallback. Candidate control discovery runs before sampling, and region coverage is still derived once from the controls captured after that discovery. No unrelated regions are combined.

## Candidate decisions

| Opportunity                                                                                         | Decision        | Reason                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse policy across `readOptions` and Building `readTargets` inside one Construction `beginCycle()` | **Implemented** | Same policy factory, same cycle, same complete region set, no intervening action. Ensure was moved before sampling, preserving the most current answer after control discovery. |
| Reuse between construction saving discovery and autoBuild                                           | Rejected        | These are separate operations and phases. Storage, triggers, Research, settings, controls, prices, and native offers may change in between.                                     |
| Reuse through Storage, Factory, or Jobs                                                             | Rejected        | These features run after different mutation and control-discovery boundaries and can request current state independently.                                                       |
| General worktick or epoch cache                                                                     | Rejected        | Native availability may change without a progression epoch; a same-tick cache would cross actions and external state changes.                                                   |
| Reuse an established read as a current observation                                                  | Rejected        | Established reads have intentionally weaker freshness and scope semantics; current consumers keep the native authority.                                                         |

## Production change

`src/bootstrap/captured-construction-control.ts` now has a local `constructionPolicyForCycle`. `readConstructionPolicy()` ensures controls, reads the policy once, and returns the same immutable result to options and Building targets. `establishOrdering()` and `runCycle()` each clear it before entry and in `finally`. The build source no longer performs its own later control ensure. No prices, priorities, Research, allocation, Trigger behavior, invalidation rules, or catalog adapter behavior changed.

## Parity and deterministic work reduction

The exact runner used baseline A/A and candidate arms with seed 42, 600 warmup periods, and 1,000 measured periods. Both baseline A/A checks passed. Candidate exports are byte-identical to baseline for both fixtures; capture was complete, with zero runner/page errors. All native control usage except expected `on_cap` availability reads matched exactly; action and other method counts match.

| Measure                                                       | Late baseline → candidate | Mid baseline → candidate |      Eliminated |
| ------------------------------------------------------------- | ------------------------: | -----------------------: | --------------: |
| Full Building observations                                    |               1,000 → 750 |                878 → 628 |        250 each |
| `structure.readAvailability(root)` evaluations                |         158,000 → 118,500 |          55,314 → 39,564 | 39,500 / 15,750 |
| `mechanics.readStructures()` catalog calls                    |               1,000 → 750 |                878 → 628 |        250 each |
| Requested state-record resolutions                            |         158,000 → 118,500 |          55,314 → 39,564 | 39,500 / 15,750 |
| Instrumented native `on_cap` invocations in measured trace    |           53,586 → 43,836 |            1,260 → 1,010 |     9,750 / 250 |
| All instrumented native control invocations in measured trace |         111,752 → 102,002 |          20,262 → 20,012 |     9,750 / 250 |

The 158 and 63 availability/state-record counts are the exact requested binding coverage per observation. `on_cap` is lower because some captured availability readers answer from captured root facts without invoking a bound control. In the full exact-parity session (200 total workticks including warmup), the `on_cap` delta is 15,600 late and 400 mid, exactly 39 and 1 reads per eliminated observation across 400 pairs. Non-availability control usage remains equal.

Reuse overhead is bounded: one memo hit branch on the second policy request, operation-entry clearing and `finally` clearing, and no additional control ensure (still once per operation). It adds no registry scan, map clone, invalidation lookup, or worktick state. The one full policy reconstruction and current observation that it replaces are each removed once per paired Construction operation.

Behavioral parity hashes:

| Fixture | Baseline export SHA-256                                            | Candidate export SHA-256                                           | Exact equality |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------- |
| Late    | `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2` | `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2` | Yes            |
| Mid     | `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab` | `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab` | Yes            |

## Performance claim

No production CPU improvement is claimed. P4.2's 96 same-bundle arms showed false effects above 2% in both persistent and fresh modes, with late drift that fresh Chrome did not remove. The runner's exact CPU precision correction does not repair the A/A stability gate. This P6 result is deterministic work reduction and exact behavioral parity, not an end-to-end CPU percentage. No large A/B was repeated.

## Regression coverage and verification

The new Construction tests verify control discovery precedes policy sampling, only one policy is read per Construction operation, the next operation takes a fresh policy, and a successful first native action followed by a stale later candidate still clears the operation scope before the next run. Existing focused regressions cover invalid/incomplete availability, failed native reads and recovery, root replacement, epoch change, same-epoch native availability change, and region coverage (`captured-building-unlocks-test.mjs`, `captured-building-discovery-test.mjs`, and `captured-progression-control-test.mjs`). Construction success, stale/missing controls, affordability, and action outcomes remain covered by `captured-build-test.mjs`. Exact late/mid replay covers exported state and native controls.

Verified on the candidate:

- `npm test -- captured-build-test`
- `npm test -- captured-building-unlocks-test`
- `npm run build`
- `npm run check` — all 347 test files, bundle syntax, type checks, lint, and format checks passed
- `node tools/chromium-evolve-runner-test.mjs` — callback attribution, determinism, isolation, reload continuity, paused game, and cleanup passed
- `git diff --check`

## Commits and recommendation

- `e97a4bb6` — initial test-only P6 lifecycle instrumentation.
- `5b7c4f26` — Construction-scoped policy reuse and generated bundle.
- `4eb2dddb` — focused policy-reuse regression.
- Follow-up commits hold the corrected instrumentation/parity script and this report separately.

Recommendation: keep the isolated candidate for independent review. Do not merge or push until that review is complete. The production branch was not modified, P4 remains excluded, and the related tools repository was not changed.
