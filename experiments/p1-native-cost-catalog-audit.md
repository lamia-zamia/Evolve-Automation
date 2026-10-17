# P1 native action cost and catalog audit

**Date:** 2026-10-17
**Branch:** `perf/p1-native-cost-audit`
**Starting automation commit:** `90e8ca7558da6c2940c845d01ea41e77703b582b`
**Pinned game commit:** `db38e2af831907d49aeb5348d678d8d8745d6c3f`

This is an audit only. No production source was changed and no price cache was enabled.

## Inputs and measurement method

The exact runner used the pinned `test-artifacts/game/evolve-deadspace.js` snapshot (SHA-256
`05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`, snapshot metadata reports commit
`db38e2af`), HeadlessChrome `151.0.7922.71`, and ordinary generated bundle SHA-256
`b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540`. Exact runner SHA-256 was
`f672e0fb6fe955835aa25c8b9e0c90d12b7740e3ed9277b0452a14f489531f0f`.

Performance fixtures were the fixed late save `deadspace-late-2026-10-12.txt` and mid save
`stage2f-through-7600-export.json`; both used `stage2e-integrated-mad-no-triggers.json`, seed 42, a 600-period
warmup and a 1,000-period measured window. The fixture has `autoPrestige` enabled, which resets the late save at
p849. For every reported arm, `autoPrestige` was therefore set false in memory before loading; all other settings
were identical. The invalid reset run is excluded. Each measured window has 125 workticks at the runner's
8-period worktick cadence.

Renderer CPU is the sum of renderer rows from browser-target `SystemInfo.getProcessInfo`; CDP `TaskDuration` is
the page-target cross-check. `ScriptDuration` and runner wall time are not used as performance authorities. The
CPU runs had no phase or per-probe instrumentation. A separate profiling replay enabled the existing phase and
callback diagnostics. Callback p50/p95 below are whole page work-cycle callback latency, not automation-only CPU.

The bounded probe trace is built by `p1-native-price-trace.mjs` into a temporary bundle. Its test-only wrapper is
at the immediate captured `buildQueue.setData` invocation and records the phase, caller stack, read method,
action ID, result, price, epoch, and native-clock duration in memory. It emits no per-call console output. It
replays the ordinary bundle with the same save, seed, settings, and periods, then compares exported save and
control usage. The test trace is not used for CPU measurement. The ordinary generated bundle does not contain
the trace hook.

## 1. Current execution and call graph

| Order / consumer             | Producer and path                                                                                                                                                                                                                       | Native price behavior                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction ordering        | `captured-runtime-control.ts` establishes ordering before demand; `captured-construction.ts` calls each source's `beginCycle`; `captured-build.ts` enumerates uncapped building targets.                                                | One `readCost` / `setData` call per priced target. The candidate and its native price are retained in the construction cycle.                                                                                                         |
| Pre-Gather demand            | `captured-runtime-control.ts` reads `pre-Gather`; `captured-resource-demand.ts` reads queue reservations and managed-build storage demand through its `sampleCosts` wrapper.                                                            | One native call on a cache miss per action ID and `actionCostEpoch`; demand's queue and managed-build paths share this local map. The tested saves had empty player queues, so there were no direct queued-action reservation probes. |
| Storage                      | `captured-storage.ts` requests prices with `readCosts`; `captured-action-costs.ts` appends all temporary rows, then invokes native `setData` once for each row.                                                                         | Batch append/removal reduces queue splices; it does not batch native price computation. Each action still calls `adjustCosts` through `setData`.                                                                                      |
| Construction execution       | `captured-construction.ts` begins another cycle for `autoBuild`; `captured-build.ts` prices candidate targets and re-reads the saving target through `readSavingCost`. Demand reservation evaluation can call `readSavingTarget` again. | Candidate sampling plus saving-cost reads are all scalar `readCost` probes. This is the only measured same-phase duplicate opportunity selected below.                                                                                |
| Factory                      | Factory's building-weighting input samples the managed build costs.                                                                                                                                                                     | Scalar `readCost` for every priced target.                                                                                                                                                                                            |
| Jobs and Craftsmen           | Full Jobs wraps build-cost reads; `captured-craftsmen.ts` locally deduplicates repeated target IDs only within one `readBuildingCosts` call.                                                                                            | Scalar `readCost` for each target per input sample. Later Jobs/Craftsmen input samples may read them again.                                                                                                                           |
| Other action-price consumers | The runtime also wires managed costs to progression/mech paths and queue reservation readers.                                                                                                                                           | These were not active price consumers in the two bounded trace windows.                                                                                                                                                               |

`captured-action-costs.ts:98-200` is the native probe boundary. `readCost` calls `probePrice` once; `readCosts`
calls it once per submitted row and stops at the first unavailable result. `readCosts` is therefore a queue-mutation
batch, not a price-computation batch. This distinction matters: optimizing the batch splice alone cannot remove
`adjustCosts` work.

The phase sequence in the late trace was Construction ordering → demand → Storage → Build → Factory → Jobs /
Craftsmen. Runtime ordering and post-mutation invalidations are in `captured-runtime-control.ts:5958-6306`.
Construction can be sampled again after research at `:6195`, and storage/build target preparation is repeated at
`:5923`, `:6195`, and `:6535` depending on the active branch.

## 2. Native probe counts

Counts below come from eight bounded workticks at the current HEAD. Every native invocation returned a parseable
price; no unavailable or failed native probes occurred.

| Scenario / owner phase       | `readCost` | `readCosts` | Probes / worktick | Unique action IDs / worktick | Approx. native `setData` time / worktick |
| ---------------------------- | ---------: | ----------: | ----------------: | ---------------------------: | ---------------------------------------: |
| Late — Construction ordering |        568 |           0 |              71.0 |                           71 |                                   3.4 ms |
| Late — Pre-Gather demand     |        584 |           0 |              73.0 |                           72 |                                   3.0 ms |
| Late — Storage               |          0 |         576 |              72.0 |                           72 |                                   3.1 ms |
| Late — Build                 |        661 |           0 |              82.6 |                           71 |                                   4.1 ms |
| Late — Factory               |        576 |           0 |              72.0 |                           72 |                                   3.3 ms |
| Late — Jobs/Craftsmen        |        576 |           0 |              72.0 |                           72 |                                   3.3 ms |
| **Late total**               |  **2,965** |     **576** |         **442.6** |               **72 overall** |                              **20.2 ms** |
| Mid — Construction ordering  |        184 |           0 |              23.0 |                           23 |                                   0.7 ms |
| Mid — Pre-Gather demand      |        200 |           0 |              25.0 |                           23 |                                   0.7 ms |
| Mid — Storage                |          0 |         184 |              23.0 |                           23 |                                   0.8 ms |
| Mid — Build                  |        417 |           0 |              52.1 |                           23 |                                   1.4 ms |
| Mid — Jobs/Craftsmen         |        184 |           0 |              23.0 |                           23 |                                   0.6 ms |
| **Mid total**                |    **985** |     **184** |         **146.1** |               **23 overall** |                               **4.0 ms** |

The direct probe timer has sub-0.1 ms resolution for many calls and is an approximate elapsed-time attribution,
not a renderer CPU measurement. The phase timers are a separate, higher-level view. For example, over the 125
measured late workticks, exclusive phase time averaged 6.36 ms for `construction saving discovery`, 3.16 ms for
`action-cost.native-batch`, 6.21 ms for `autoBuild.beginCycle`, 5.24 ms for `jobs.full.buildWeighting`, and
2.17 ms for `construction demand preparation`. Mid equivalents were 2.36, 0.64, 2.37, 1.67, and 1.24 ms.
The timers measure elapsed phase contribution and include work beyond native `setData`; do not add parent and child
timers together.

Per 8-worktick trace:

| Scenario | Native probes | Unique IDs | Repeats of an ID within a worktick | Repeats with the same `actionCostEpoch` | `readCost` / `readCosts` | Outcomes                               |
| -------- | ------------: | ---------: | ---------------------------------: | --------------------------------------: | -----------------------: | -------------------------------------- |
| Late     |         3,541 |         72 |             2,965 (370.6/worktick) |                                   2,965 |              2,965 / 576 | 3,541 success; 0 unavailable; 0 failed |
| Mid      |         1,169 |         23 |               985 (123.1/worktick) |                                     962 |              1,169 / 184 | 1,169 success; 0 unavailable; 0 failed |

“Repeated” is an observation count: it means an ID was priced more than once in the sampled window. It does not
by itself mean a repeated read was safe to remove. Epoch values stay constant inside most measured workticks;
the mid trace had one intra-cycle transition, from epoch 18 to 19 in cycle 17. Before that transition, 71 calls
had run (Construction, demand, and Storage); 97 ran afterward (Build and Jobs/Craftsmen). The 23 mid repeats
outside one unchanged epoch are legitimate repricing candidates and are excluded from the same-epoch count.
Late had no intra-cycle epoch transition in its eight sampled ticks.

The fixed saves had empty `queue.queue` arrays. Direct player-queue reservation probes were therefore zero in
these windows. Demand's 584 late / 200 mid calls are the shared demand sample's managed-build reads plus saving
target reads; the separate queue-reservation reader was not exercised by a player queue. Construction saving
reservations are distinct: caller stacks show 93 late and 210 mid `readSavingCost` probes in the `autoBuild`
phase. All are called for `city-university` late; mid uses `city-coal_mine` and `city-basic_housing`.

## 3. Matched CPU and latency baseline

Two uninstrumented measurements per scenario used the same fixture and deterministic settings. Exports match
exactly within each scenario across both repeats.

| Scenario | Repeat | Renderer CPU delta | CDP `TaskDuration` delta | Export hash (prefix) | Day / reset after window |
| -------- | -----: | -----------------: | -----------------------: | -------------------- | ------------------------ |
| Late     |      1 |            19.93 s |                 17.739 s | `77b357153516`       | 502527 / 848             |
| Late     |      2 |            18.98 s |                 16.854 s | `77b357153516`       | 502527 / 848             |
| Mid      |      1 |            11.11 s |                  9.624 s | `82292f32e3b3`       | 474 / 846                |
| Mid      |      2 |            11.53 s |                 10.031 s | `82292f32e3b3`       | 474 / 846                |

Median per-window CPU was 19.455 s late and 11.32 s mid; median `TaskDuration` was 17.296 s late and 9.828 s
mid. Repeat spread was 4.9% CPU / 5.1% TaskDuration late and 3.7% / 4.1% mid. These spreads are the noise
floor for any later A/B in this setup.

Separate phase-and-callback runs recorded 125 worktick callbacks in each 1,000-period measured interval:

| Scenario | Work-cycle callback p50 | Work-cycle callback p95 |
| -------- | ----------------------: | ----------------------: |
| Late     |                 84.8 ms |                 96.0 ms |
| Mid      |                 40.4 ms |                 60.0 ms |

These are whole game-page callback latencies and profiling runs, not automation-only latency or the CPU baseline.
The measurements remain comparable: late and mid repeats produced identical export hashes; traced bundles also
matched the ordinary bundle's export and `controlUsage` exactly. The late trace had 36,862 `buildQueue.setData`
calls over warmup plus measurement and the mid trace had 2,938; the bounded trace calls and baseline production
bundle hashes were captured separately.

## 4. Duplicate-work evidence and existing caches

The strongest duplicate evidence is exact call-level observation, not repeated high-level phase entry:

- Construction ordering and Pre-Gather demand priced 71 common late IDs in the same `actionCostEpoch` (576
  destination probes across eight ticks). Demand and Storage then priced 72 common IDs in the same epoch (576
  Storage probes). These are real repeated `setData` calls, not wrapper-only hits.
- Build execution priced 661 IDs for 71 action IDs late. The excess 93 calls are `readSavingCost` rereads of
  already sampled Construction-cycle prices. The eight-worktick mid trace found 210 of these calls across two
  IDs. In both traces, every such call was in the `autoBuild` phase, had the same epoch as its preceding Build
  sample, and returned the same cost and pool as that current-cycle sample. Their approximate native time was
  0.60 ms/worktick late and 0.58 ms/worktick mid.
- AutoBuild → Factory repriced 71 common IDs late; Factory → Jobs/Craftsmen repriced 72. Those are separate
  later consumers and native invocations. Price and pool equality in the trace is only an observation, not
  proof that the source result remained authoritative between phases.
- The demand cache at `captured-resource-demand.ts:1293-1397` is local to one demand reader and one supplied
  `actionCostEpoch`. It caches by ID, including unavailable `undefined`, and shares reads between demand's
  queue reservations and managed-build sampling. It does not cover Construction's independent reader,
  Storage's `readCosts`, Factory, or Jobs/Craftsmen. Jobs' local Map in `captured-craftsmen.ts:169-192` removes
  repeated IDs within one input only; it does not share across later Jobs samples.
- Existing counters are partial: `action-cost.native-batch.probes` counts batch input rows, demand counts its
  cache misses/hits, Storage counts building target IDs, and Jobs counts wrapper reads. No ordinary production
  counter currently reports all native `setData` calls by owner and outcome.

Catalog generation is also repeated in code: `readManagedBuildTargets` and
`readUnlockedStorageBuildTargets` are separately called by construction, demand, and the runtime preparations
(`captured-progression-control.ts:1076-1122`; `captured-runtime-control.ts:5923,6195,6535`). Phase observations
show that discovery capability checks and construction demand preparation recur, but the current instrumentation
does not isolate `readPolicy().buildings` time or exact per-consumer catalog generation counts. Treat catalog
deduplication as a follow-up measurement candidate, not as an established CPU saving.

## 5. Price dependencies and invalidation correctness

At the pinned upstream commit, `src/functions.js` `buildQueue.setData` at `:669-716` selects the live queue row,
calls `adjustCosts`, evaluates the returned cost closures, and evaluates `actionPool`. `adjustCosts` at
`:2453-2483` composes current action structure and modifiers. Its closures reach `costMultiplier` (`:1050-1105`),
`spaceCostMultiplier` (`:1120-1149`), `razedAdjust` (`:2500-2512`), government and technology logic, and other
live state. Inputs include current building counts and razed counts, population for citizen actions, race/traits,
genes, technology, government, universe, Harmony/achievements, supply mode/pool, and additional action-specific
state. Probe ID alone is not a price key.

`captureNativePriceAuthority` in `captured-runtime-control.ts:3888-3952` snapshots own fields from race, tech, and
government plus a short list of gene/city/civic/achievement fields. It misses important live building counts,
razed state, citizen population, Harmony/achievement inputs, and other closure dependencies. Its nested values
are shallow references, so an in-place nested change can also escape a comparison. It is not complete enough to
authorize shared reuse across its present scope.

| Event type                                   | Observed or explicit handling                                                                                                                                                                                                                                                                                                                                             | Cache consequence                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price-affecting                              | Root replacement/reset invalidates both samples; selected research, trigger, Jobs/Craftsmen, Genetics, and Government mutations bump `actionCostEpoch` (`captured-runtime-control.ts:3850-4002,6151-6180,6297-6407,6487+`). A purchase/building count, razed count, population, tech, race, trait, gene, government, supply, or action-specific change can affect prices. | Keep current `setData` reads across such changes. External player/game mutations that do not pass these wrappers remain unknown.                                                 |
| Demand-only, not price-affecting by contract | Settings changes clear demand/planning inputs with no action-cost epoch bump (`:3857-3869`). Storage, Factory, fleet target, Mech pending-work paths use demand invalidation with price flag false (`:6120-6121,6288-6290,6358,6372`).                                                                                                                                    | Demand may need a new sample while action prices can remain the same under the stated contract. This does not authorize a global cache because other price inputs are untracked. |
| Catalog/availability-affecting               | Settings refresh, progression/research changes, root replacement, and build-control discovery can change enabled or available targets.                                                                                                                                                                                                                                    | Refresh offers/catalogs separately from price observations; an unavailable target must not reuse a stale price.                                                                  |
| Unknown — fail closed                        | Player interactions and mutations outside instrumented wrappers; any cost-closure dependency not represented in the authority snapshot; queue/control/catalog replacement; exceptions or partial execution.                                                                                                                                                               | Probe natively or return unavailable. Same `actionCostEpoch` alone is not sufficient.                                                                                            |

Batch `readCosts` does not reduce native recomputation and also observes each row after prior temporary rows were
appended. Any future batch/reuse design must preserve per-row ordering, pool, first-unavailable behavior, and
queue cleanup.

## 6. Ranked candidates

Savings below are measured repeat-call durations or upper bounds; no optimization variant was run, so none is an
observed renderer CPU saving.

| Rank | Candidate and exact sites                                                                                                                                                                                                                                                                                                             | Measured opportunity                                                                                                                                                                                                                                                                                                                   | Freshness, invalidation, and failure behavior                                                                                                                                                                                                                                                                                                                                                                                                                            | Risk / test complexity                                                                                                                                                                                      |
| ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Reuse the current Construction cycle's sampled price for its own `readSavingCost` calls during the same pre-execution `autoBuild` planning/reservation scope. Producer: `captured-build.ts:168-192` / `captured-construction.ts:325-399`; consumer: `captured-construction.ts:634-675` through Build conflict/reservation evaluation. | 93 repeats / 8 late ticks (11.6/tick), 210 / 8 mid ticks (26.3/tick); all paired with a same-phase/same-epoch current sample and numerically identical cost/pool. Approximate direct native time removed: 0.60 ms/tick late, 0.58 ms/tick mid. Upper-bound CPU share is about 0.4% late and 0.6% mid against measured median CPU/tick. | Only use the current immutable Build-cycle sample inside that same synchronous construction execution before any command runs. Start a fresh scope on each `beginCycle`; discard it on incomplete sample, new cycle, root/control replacement, explicit price-affecting mutation, exception, or if the consumer falls outside the scope. Fall back to existing native probe on uncertainty. Do not reuse across ordering → demand, Storage, Factory, Jobs, or workticks. | Medium. Requires an explicit adapter-owned scope/cycle identity and tests that force each fallback. End-to-end benefit is small but directly grounded and avoids extending the incomplete global authority. |
|    2 | Reuse Construction ordering prices in managed-build demand; `captured-build.ts:168-192` → `captured-resource-demand.ts:1799-1836`.                                                                                                                                                                                                    | 71 matching late IDs/tick; about 3.4 ms/tick of destination native elapsed time. Mid: 23 matches/tick, about 0.7 ms/tick.                                                                                                                                                                                                              | Construction ordering is followed by project discovery and demand research/catalog capture; cost closures have untracked live inputs. `actionCostEpoch` can stay unchanged. A price, pool, availability, failure, or root change requires a fresh result.                                                                                                                                                                                                                | High correctness risk; high authority/test burden. Reject for the first implementation.                                                                                                                     |
|    3 | Reuse demand prices in Storage; demand `sampleCosts` → `captured-storage.ts` / `captured-action-costs.ts:153-200`.                                                                                                                                                                                                                    | 72 matches/tick late (~3.1 ms/tick), 23 mid (~0.8 ms/tick).                                                                                                                                                                                                                                                                            | Gather, Market, Hell, trade and other phases run between the samples; several can change price or pool inputs. Storage's ordered batch semantics matter.                                                                                                                                                                                                                                                                                                                 | High. Reject without a complete mutation authority and ordered-failure tests.                                                                                                                               |
|    4 | Share Build/Factory/Jobs prices.                                                                                                                                                                                                                                                                                                      | 71–72 matches/tick in late trace; approximately 3.0–3.3 ms/tick per later consumer.                                                                                                                                                                                                                                                    | Construction purchases and intervening automation can change building counts and price functions.                                                                                                                                                                                                                                                                                                                                                                        | High and broad. Reject.                                                                                                                                                                                     |
|    5 | Broaden demand's epoch cache or add a reader-wide per-worktick map.                                                                                                                                                                                                                                                                   | Theoretical cross-owner ceiling is large, but current per-call timings and old invalidate-on-any-invocation A/B do not support it: prior A/B hit only 2.8% late and 3.8% mid and saved 1.3–1.75 ms/tick late with no mid gain.                                                                                                         | Current `captureNativePriceAuthority` is incomplete. Any unknown event must evict all affected observations.                                                                                                                                                                                                                                                                                                                                                             | Very high correctness risk; do not implement from epoch alone.                                                                                                                                              |
|    6 | Avoid duplicate build-target catalog generation in progression preparation.                                                                                                                                                                                                                                                           | Repeated call sites are established; isolated function CPU and catalog hit counts were not measured. Construction demand preparation is 2.17 ms/tick late and 1.24 ms/tick mid, but that includes other work.                                                                                                                          | Needs an explicit per-cycle settings/root/catalog revision; invalidate on unlock, settings, root, and availability changes.                                                                                                                                                                                                                                                                                                                                              | Low-to-medium if a current catalog snapshot already exists; measure before prioritizing.                                                                                                                    |
|    7 | Consolidate `readCosts` batches.                                                                                                                                                                                                                                                                                                      | The batch rows still call native `setData` once each; no price probes are eliminated by current batching.                                                                                                                                                                                                                              | Must preserve row ordering, pool, first unavailable result, and temporary queue suffix cleanup.                                                                                                                                                                                                                                                                                                                                                                          | Not a CPU candidate absent evidence that append/removal dominates.                                                                                                                                          |

## 7. P1 implementation recommendation

Implement only the Construction-local reuse in rank 1. It removes the clearest same-owner duplicate evidenced in both
scenarios while keeping demand, Storage, Factory, Jobs/Craftsmen, and action-cost epoch semantics unchanged. The
expected direct probe reduction is 93 late / 210 mid native calls per eight workticks; the approximate native
elapsed-time ceiling is 0.6 ms per worktick. Renderer CPU and TaskDuration must decide whether that saving is
material; this audit does not claim that it is.

Do not broaden reuse across consumers until price authority covers the upstream dependency graph or each reuse
boundary has a proven no-mutation contract. Do not change `actionCostEpoch` to stand in for that missing authority.

## 8. Follow-up Codex implementation prompt

> On branch `deadspace` (starting from the reviewed P1 audit commit), implement only the Construction-local reuse
> described in `experiments/p1-native-cost-catalog-audit.md` rank 1. Preserve current behavior for every call outside
> the current synchronous `autoBuild` planning/reservation scope. Reuse the immutable price/pool already sampled for
> the same target by the current Construction `beginCycle`; do not add a cross-consumer, per-worktick, or global
> action-price cache and do not treat `actionCostEpoch` as complete freshness authority. Give the reuse an explicit
> cycle/scope identity owned by the Construction adapter. Fall back to the existing native `readCost` when the
> scope is missing, incomplete, invalidated, or uncertain, and discard scope on a new cycle, root/control
> replacement, explicit price-affecting mutation, exception, or before execution can mutate game state.
>
> Add focused adapter tests for exact same-cycle reuse and for each fallback/invalidation path, including pool
> mismatch, unavailable/throwing source price, a root replacement, and a price-affecting mutation between sample
> and read. Add an exact-runner replay on the pinned `db38e2af831907d49aeb5348d678d8d8745d6c3f` snapshot using the
> late and mid fixtures in this report, seed 42, 600-period warmup, 1,000 measured periods, and `autoPrestige=false`.
> Require identical exports and control usage except for the expected `buildQueue.setData` reduction. Run two
> matched uninstrumented base/candidate pairs in alternating order and report renderer-process CPU and CDP
> `TaskDuration`; do not use `ScriptDuration` or runner wall time as the performance result. If either scenario
> changes price output or exceeds the behavior/performance gate, revert the candidate and report the evidence.
> Do not touch other consumers, catalog readers, production diagnostic hooks, Research Gate B2, or autonomous
> allocation.

## Reproduction artifacts and verification

Measurement tools: `experiments/p1-native-cost-baseline.mjs` and `experiments/p1-native-price-trace.mjs`. The
bounded JSON traces and performance runs are in ignored `test-artifacts/perf-profile/p1-native-cost-*` files in
the working checkout; they are not committed. The scripts accept `EA_TOOLS_ROOT` when the ignored nested `tools/`
repository is not present in the audit worktree. The ordinary CPU baseline command was:

```powershell
$env:EA_TOOLS_ROOT = 'D:/work/Evolve-Automation/tools'
node experiments/p1-native-cost-baseline.mjs --scenario both --periods 1000 --warmup 600 --repeats 2 --out test-artifacts/perf-profile/p1-native-cost-baseline.json
```

The native trace commands were `node experiments/p1-native-price-trace.mjs --scenario late --warmup 600 --periods 64`
and `--scenario mid --warmup 100 --periods 64`. Each test-only bundle matched the ordinary export and
`controlUsage`. No runtime optimization or behavior change was tested. Final build, tests, generated-artifact
check, and `git diff --check` results are recorded in the dated progress log and final handoff.
