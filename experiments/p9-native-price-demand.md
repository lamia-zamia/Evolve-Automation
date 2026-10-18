# P9 — Native action-price demand audit

- Date: 2026-10-18
- Branch: `experiment/p9-native-price-demand`
- Base: P8 tip `f5c64c3441abcbf550e84885f43f48f097245372`, on local `deadspace` `ed91360d`
- Game: DeadSpace `db38e2af831907d49aeb5348d678d8d8745d6c3f`
- Tools: `fb141c709bc019c99b9933f5974e80c5e43f825a`
- Production bundle SHA-256: `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7`

## Decision

**Audit only; stop for independent review.** The measured probes all feed a current candidate, reservation, storage-demand, or weighting input. Existing action, control, settings, and cap gates already run before their affected probes. **Zero measured probes were proven removable by an earlier price-independent exclusion gate.** The repeated calls are not evidence that their prices can be reused or omitted.

The largest apparent exclusion candidate is a managed build target with zero construction weight. Its price still enters complete Storage and resource-demand samples, and may also select a Factory or Craftsmen weighting result. Removing those probes would change downstream completeness or decisions. Keep them until one consumer can prove exclusion across the full ordered consumer chain. No production change or regression test was warranted.

## Inputs and measurement

The exact runner used the pinned game snapshot at `test-artifacts/game/evolve-deadspace.js` (SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`). Both fixtures used seed 42, 600 warm-up periods, and 1,000 measured periods; `autoPrestige` was set to false in memory. The late save was `deadspace-late-2026-10-12.txt`; the mid save was `stage2f-through-7600-export.json`. The shared settings file was `stage2e-integrated-mad-no-triggers.json`.

`experiments/p9-native-price-trace.mjs` builds temporary instrumented bundles with the shared production esbuild configuration. After warm-up it records each native price event's action ID, scalar/batch-row reader, worktick, scoped phase, runtime action-cost epoch sampled immediately before native `setData`, price/pool result, duration, and caller stack. Phase context is restored in `finally`, including when phases nest or throw; each worktick resets the context to `outside-runPhase`. A test-only hook at the captured control invocation boundary records the native call sequence. The comparison arm uses the same bundle with price-event recording disarmed. The raw per-event traces are reproducible under ignored `test-artifacts/perf-profile/p9-native-price-trace-{late,mid}.json`; no hook is present in the ordinary production bundle.

One probe makes exactly one `buildQueue.setData` control invocation. The native implementation at `src/functions.js:669-716` calls `adjustCosts`, evaluates each positive adjusted resource cost, and reads `actionPool` for the `data` prefix. Those nested function calls vary by action and live modifiers; the probe ledger counts the one native control callback per probe, not each internal cost-function invocation separately.

## Probe totals

Counts below cover only the 1,000 measured periods. Each repeat column is counted independently as probes beyond the first occurrence of the action ID within that grouping. Epoch transitions compare the actual epoch of each action's current probe with that action's previous probe in event order; no repeat count is subtracted from another.

| Fixture | Native probes | `readCost` rows | `readCosts` rows | Unique IDs | Repeated within worktick | Repeated within epoch | Repeated within worktick and epoch | Same-action epoch transitions | Probes/worktick |
| ------- | ------------: | --------------: | ---------------: | ---------: | -----------------------: | --------------------: | ---------------------------------: | ----------------------------: | --------------: |
| Late    |        55,373 |          46,373 |            9,000 |         72 |                   46,373 |                46,229 |                             46,229 |                         9,072 |         442.984 |
| Mid     |        15,505 |          12,505 |            3,000 |         24 |                   12,505 |                12,025 |                             12,025 |                         3,456 |         124.040 |

Every measured probe succeeded; there were no unavailable prices or thrown `setData` calls. Each probe performed one `buildQueue.setData` callback. The epoch reader observed 127 distinct epochs late and 145 mid. The corrected repeat classifications do not establish that a price is reusable within an epoch; they are instrumentation counts only.

### Phase and caller attribution

| Initiating phase / call path                                                         | Consumer                                                        | Late probes (IDs) | Mid probes (IDs) | Decision effect                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------: | ---------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construction ordering → `captured-build.ts` `beginCycle`                             | Construction candidate ordering and price completeness          |        8,875 (71) |       3,000 (24) | Candidate cost and pool feed competition, affordability/conflict handling, and candidate completeness. Capped or excluded targets are removed before this loop.                                                                                                 |
| Pre-Gather demand → `captured-resource-demand.ts` sampling and saving-target readers | Resource demand, reservations, managed-build storage demand     |        9,126 (72) |       3,125 (24) | Native prices and pool feed demand/reservation values; missing input makes affected samples unavailable. Caller stacks include `readSavingCost` 126 late / 125 mid times. The fixture queues are empty, so queued-action reservation probes were not exercised. |
| `autoStorage` → `captured-storage.ts` `readBuildingTargets` → `readCosts`            | Storage allocation and capacity targets                         |        9,000 (72) |       3,000 (24) | Complete price list is required; an incomplete batch withholds the target sample. Batching changes queue splices, not native price computations.                                                                                                                |
| `autoBuild` → `captured-build.ts` `beginCycle` and `readSavingCost`                  | Construction candidate execution and current saving reservation |       10,370 (71) |       3,361 (24) | Candidate prices feed build selection; the saving price feeds the current reservation. Caller stacks identify `readSavingCost` 1,495 late / 289 mid times in this phase.                                                                                        |
| `autoFactory` → `captured-factory.ts` `readBuildingCosts`                            | Factory building-weight mode                                    |        9,002 (72) |   0 (not active) | Complete cost samples choose the first applicable building weight for each resource. Finite zero weights still participate in the ordered scan.                                                                                                                 |
| `autoJobs` with Craftsmen → `captured-craftsmen.ts` via the ordinary Jobs wrapper    | Craftsmen/foundry building weighting                            |        9,000 (72) |       3,019 (24) | Prices accumulate claimed-resource costs; incomplete samples stop the weighting decision. Mid caller stacks include 19 saving-cost reads.                                                                                                                       |
| **Total**                                                                            |                                                                 |        **55,373** |       **15,505** |                                                                                                                                                                                                                                                                 |

The trace recorded each event's exact action ID and stack; the table reports phase-level ID cardinality. Other direct native-price sites were inactive in these fixtures and are not folded into these counts: trigger build-target costs, condition-context costs, building-settings cost expressions, Power Spire costs, fuel/grant prices, and Mech expansion prices.

Scoped attribution preserved every existing phase row count in both fixtures: 0 measured events were left under `outside-runPhase`, and no probes moved between the phase rows in the corrected trace. This indicates that the old aggregate phase totals happened to remain stable; the new scoped hook now makes that attribution explicit and safe across nested/throwing phases.

## Required, excluded, and unknown work

### Required in the measured traces

All 55,373 late and 15,505 mid observed probes supplied a price or completeness result to the corresponding current consumer above. In particular:

- Construction samples only targets surviving its enabled-target and current-cap checks. Candidate prices are then used by construction policy and retained as current-cycle candidate evidence.
- Saving-cost reads check the candidate's `bat…`, `autoBuild`, and zero-weight settings, then read its current building count/cap before requesting a price. A surviving price supplies current reservation costs.
- Storage requires a complete unlocked target price list. Demand's local per-sample action-ID map shares demand reads only within that sample and epoch; it does not cover Storage, Construction, Factory, or Jobs.
- Factory and Craftsmen use ordered cost comparisons. A zero weight does not prove that the price is irrelevant to the first matching target or to Storage/demand consumers.

### Proven unnecessary

**0 measured probes.** Existing gates already prevent calls when they can exclude an action independent of price: disabled build switches, `autoBuild` disabled where the setting defaults closed, completed/capped targets, missing controls in gated trigger/mission readers, and ineligible or completed mission actions. These are exclusions before the probe, not unnecessary calls counted in the traces.

### Unknown; retain

The traces did not execute the other native-price call sites listed above, so they contribute no fixture count and remain unknown for this audit. Power Spire is a notable case: it computes `autoBuildable` before reading price, but the cost fields also feed its non-buildability model. That flag alone does not prove price irrelevance. No demand or reservation reader may be pruned until its complete-input and missing-price behavior is preserved.

## Freshness and side effects

`captured-action-costs.ts` appends a synthetic row to the live queue, invokes native `setData(index, "data")`, parses native cost/pool output, and removes the appended queue suffix in `finally`. `readCosts` appends a contiguous batch and makes one `setData` call per ID; it stops on the first unavailable result and still removes the suffix. The tested probes had no failures, while existing contracts cover cleanup and unavailable/malformed results.

Prices are live: `adjustCosts` reads current game modifiers and the pool depends on current supply/world state. Root/control replacements, research/construction effects, and feature mutations are freshness boundaries. Exact equality across calls or an unchanged epoch cannot bridge them. P9 adds no cross-phase or cross-worktick price cache.

## Parity and verification

For both fixtures, traced and trace-disarmed runs had identical exported saves, control-usage maps, and ordered native invocation sequences after removing `buildQueue.setData` entries. There were no eliminated probes, so the unfiltered control-usage maps also matched. The untouched ordinary production bundle matched the traced export and native control-usage map. Since that bundle has no native invocation observer, a telemetry-only build using the same production configuration added only the test callback at the captured invocation boundary; its export and control-usage map matched the ordinary bundle, and its non-price native invocation sequence and total `buildQueue.setData` calls matched the traced run.

| Fixture | Export SHA-256                                                     | Native calls, traced and telemetry arms | Non-price sequence matches | `buildQueue.setData`, both arms | Throws |
| ------- | ------------------------------------------------------------------ | --------------------------------------: | -------------------------: | ------------------------------: | -----: |
| Late    | `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2` |                                 163,461 |                        yes |                          88,694 |      0 |
| Mid     | `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab` |                                  32,513 |                        yes |                          25,471 |      0 |

Whole-session callback counts include warm-up and measurement. The ordinary production bundle SHA-256 remained `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7` before and after the build-options extraction. The instrumentation telemetry overlay is test-only; it does not alter the ordinary userscript artifact.

Verification passed: focused action-cost/build/Storage/Factory/resource-demand tests (5 files), `npm run build`, the full `npm run check` suite (347 test files and all five checks), `node tools/chromium-evolve-runner-test.mjs`, and `git diff --check`. The instrumentation work changed no production runtime source or generated bundle; this is deterministic native-work measurement, not a CPU-performance claim.

## Recommendation

Stop at the audit for independent review. Do not merge or push. Do not begin Research Gate B2 or autonomous allocation. Revisit only with a candidate whose exclusion gate is proven ahead of all consumers and whose complete demand/reservation behavior remains authoritative.
