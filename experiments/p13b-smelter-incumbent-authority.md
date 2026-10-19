# P13B — Smelter incumbent authority

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Date                  | 2026-10-19                                                         |
| Branch                | `deadspace`                                                        |
| Starting HEAD         | `02aa9449b4259901fdcae8fb4c69f410e0960ab6`                         |
| Pinned game           | `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`    |
| Game snapshot SHA-256 | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` |

## Decision

**A — Incumbent authority established.** A test-only observer at the ordinary Smelter owner boundary can publish the actual input, demand, plan, normalized native command intention, root reference, progression and control generations, effective permission, and expected pre-command allocations. The owner records the native outcome and checked post-command allocations separately. A read-only hypothetical Steel-demand comparison reuses `planSmelter()` and does not execute its proposal.

**CPU feasibility: C — unresolved.** The matched renderer CPU and CDP `TaskDuration` pairs disagree in direction and vary far beyond the 2% budget. The evidence does not support a CPU pass or an overhead rejection.

Cross-owner commitment coverage remains explicitly unavailable. This Smelter observation does not authorize another owner, reserve stock, or establish a measured future production marginal.

## Same-cycle P12G observation

The experiment rebuilt the verified Stage 2F starting save and settings, seed `42`, epoch `2026-09-21T00:00:00.000Z`, and pinned DeadSpace snapshot, then observed the ordinary owner at the P12G boundary. The test-only observer reused the `run()` input, demand sample and computed decision; it did not call `readPlanForDiagnostics()`.

| Observation             | Captured value                                                    |
| ----------------------- | ----------------------------------------------------------------- |
| Owner / capability      | `smelter` / `smelter-allocation`                                  |
| Boundary                | after `planSmelter()` and before native execution                 |
| Permission              | `autoSmelter: true`                                               |
| Construction demand     | `city-coal_power`, city pool, 1,000 Steel requested               |
| Smelter capacity        | 15; pre-command allocation was Iron 15, Steel 0, Iridium 0        |
| Fuel                    | 15 Coal fuelers; captured Coal amount and rate constraints        |
| Planned native commands | `subMetal(Iron)`, then `addMetal(Steel)`                          |
| Control binding         | source-backed `iSmelter` generation 1; required methods available |
| Progression generation  | source-backed generation 0 at capture                             |
| Native result           | succeeded                                                         |
| Separate postcondition  | verified: Iron 14, Steel 1                                        |

The capture reproduces P12G’s ordinary decision and actual native postcondition. The read-only additional-Steel comparison returns the same planned allocation and no changed commands because the ordinary incumbent already consumes the current Steel demand. Its `productionEffectKnown` result is false: allocation commands do not establish future resource production.

The known P12G Steel-oriented alternative remains a separate measured result. Over its matched 100-period replay it added 54.94 more Steel, displaced 23.48 Iron and 1 Coal, and did not advance the Steel Containers purchase: both arms first met the 250-Steel price at period 40 and purchased at period 72. This result applies to that tested boundary only; it does not establish that future Steel requests are redundant.

## Contract and invalidation

The pure evaluator now derives final request admissibility after all blockers are known and reports physical feasibility separately. It orders candidates only when objective, immediate constraint, metric identity and units, direction, scope, freshness, collateral, and opportunity-cost authority agree. Smaller time-to-purchase wins only under a shared basis; a larger value wins only for a metric explicitly defined as a saving. Different labels are irrelevant: complete ordered native command intentions establish whether commands change, and missing intentions return unknown.

Capacity authority is owner-specific. Jobs require source assignment, protected minimum, default pool, worker capacity and Foundry coupling. Smelter requires available capacity, source/target assignments, fuel allocation and supported displacement. Other owners remain unavailable until characterized. Planned commands are not production marginals; missing resource rows are zero only under an explicit complete measured-effect scope.

The focused regressions cover root replacement, progression change, control replacement, permission change, allocation change, demand change, capacity change, partial command execution, command rejection, missing methods, disabled Smelter, and unavailable Construction demand. They also cover command identity, pool separation, unknown collateral, incomplete coverage, no hypothetical request, a conflicting Iron demand, and fuel/displacement constraints. Stale snapshots remain descriptive but fail currentness checks after any changed authority or state input.

## G/S performance experiment

`experiments/p13b-smelter-incumbent-authority.mjs` compares G (ordinary Smelter cycle without publication) and S (the same cycle with minimal immutable test-only publication) on the same rebuilt Stage 2F input. Both arms run the same 1,784-period warm-up to restore Construction’s runtime saving target, then a matched 800-period window (100 workticks). The order is reversed once. Both use the same test bundle lineage, game snapshot, settings, seed, root state and starting phase for each paired window.

| Order    | G renderer CPU | S renderer CPU | CPU delta | G `TaskDuration` | S `TaskDuration` | Task delta |
| -------- | -------------: | -------------: | --------: | ---------------: | ---------------: | ---------: |
| G then S |       12.414 s |       13.155 s |    +5.97% |         11.068 s |         11.488 s |     +3.79% |
| S then G |       18.359 s |       13.639 s |   −25.71% |         16.107 s |         11.925 s |    −25.96% |

Each pair had identical state hashes, random-call counts, control usage and all 138,948 native invocations. Both had zero Research action invocations. S published exactly once for each of its 100 measured Smelter owner cycles. It made 100 additional source-backed progression-generation reads. It made zero additional input reads, demand reads, owner planner calls, native control calls, Research draws, or full catalog scans. The one read-only comparison ran after the timed window and made one planner call.

The worktick callback latency distributions also varied between order groups: G/S p50 was 60.0/61.3 ms in the first order and 87.2/65.9 ms in the reverse order. Snapshot construction measured p50 0 ms and p95 0.1 ms; the clock resolution is 0.1 ms. The one-shot pure comparison measured 0.7–0.8 ms on that clock. These local elapsed-time readings do not resolve a 2% CPU delta. Following the calibrated [Stage 4F.3 measurement authority](stage4f3-performance-measurement-authority.md), renderer-process CPU is primary and `TaskDuration` is the cross-check. The opposite-signed, noisy pairs are inconclusive.

## Verification

- Focused owner-coordination, captured Smelter, P12G contract, P12J, P13A-related and runtime regressions.
- `npm run build`
- `npm run check`
- `node tools/chromium-evolve-runner-test.mjs`
- P12G same-cycle G/S performance replay above.
- `git diff --check`
