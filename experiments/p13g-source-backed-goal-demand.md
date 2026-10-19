# P13G — Source-backed goal demand and incumbent coverage

Date: 2026-10-19  
Repository: `deadspace`, starting HEAD `560310bad09910851c8ac8f69acef94e42164f46`  
Game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**B — Current goal signal unavailable at the ordinary Smelter boundary.** The normal work cycle does not publish a universally current Research action/price observation before Smelter. This slice adds a pure signal contract and reconciliation logic, but does not wire an incomplete or stale source into the owner. The smallest missing boundary is an immutable publication from the existing Research owner's normal draw, carrying action and price identity, pool, observation/binding generation, and root/progression freshness through the next Smelter read, with explicit invalidation.

The verified P12G state is a useful historical reconciliation: Steel Containers costs 250 Steel while Construction's incumbent aggregate request is 1,000 Steel. The immediate numeric threshold is already represented by max-target demand (subject to storage clamping). This does **not** prove that eventual Construction spending is harmless, that concurrent future purchases are covered, or that Steel production accelerates terminal MAD. The saved price is not a current offer at a later Smelter boundary. No real positive additional Steel request is supported, so no P13F comparison was constructed from live goal evidence.

## Observation boundary

At the start of each processed cycle, `beginProcessedCycle()` clears the held Research sample and its discovery scope (`src/bootstrap/captured-progression-control.ts:740-752`). The runtime calls that before work (`src/bootstrap/captured-runtime-control.ts:6106-6106`). Smelter then runs at `:6319-6338`; `autoResearch` runs later at `:6390-6414`. Trigger/condition paths can sample offers earlier when configured, but that conditional behavior is not a general Smelter-boundary source. No extra draw or catalog scan was added.

The catalog's native draw joins definitions to rendered rows, requires complete price rows, and records binding generations (`src/adapters/evolve/progression/research/captured-tech-catalog.ts:480-515`). Test-only offer observation IDs and offer-set identities are added at `:517-535`; ordinary offer rows do not carry the complete publication identity required by P13G. The held sample is invalidated on progression changes or changed row bindings (`src/bootstrap/captured-progression-control.ts:581-610`). A valid draw's `nativeAffordable` is a draw-time verdict, not current holdings. The stricter bottleneck model requires matching draw/resource observation identity, period, root/progression, offer generation, cost, and verdict before relying on it (`src/domain/economy/research-bottleneck.ts:193-224`).

There is a distinct retained `lastOwnerOffers` list from the most recent Research owner draw (`src/bootstrap/captured-research-control.ts:147,187,213-239`). It is cleared when the next Research owner cycle starts, not by `beginProcessedCycle()`. It is only exposed through the test surface and represents the prior draw at the next Smelter boundary; it does not publish a production observation ID that proves the price/offer is still current. Therefore the retained list cannot fill the ordinary source boundary.

P12D's Steel Containers route is classified as a conditional contributor; it does not prove a mandatory obligation. A valid native price can establish the immediate action's cost only. It cannot establish that the action will be selected or accelerate terminal MAD (`experiments/p12d1-advisory-route-correctness.md:37-43`).

## Goal-resource signal contract

Added [`goal-resource-signal.ts`](../src/domain/economy/goal-resource-signal.ts), a pure evaluator with explicit goal/action authority, native price provenance and identity, resource/pool, requirement, observation and generation, offer freshness, current stock authority, goal state, incumbent aggregate demand/allocation, Construction target, known commitments, unknown evidence, and unavailable reasons.

The result distinguishes `already-represented`, `additional-target-supported`, `competing-spending-unresolved`, `goal-evidence-unavailable`, `goal-already-satisfied`, and `goal-invalidated`. It never authorizes execution. Advisory contributors and unverified goal/action selection fail closed. A Construction target naming the same resource is recorded but is not treated as a conflict by itself. Known competing commitments or incomplete spender coverage/order keep an otherwise positive gap unresolved. Multiple resources and supply pools are evaluated independently; there is no hardcoded technology/resource selection rule.

This contract remains unconnected to the ordinary owner until its source authorities exist. The P12G historical 250-Steel threshold is represented by the 1,000-Steel incumbent target; it is not promoted to a live signal.

## Existing-demand reconciliation

The captured demand model merges applicable request sources with maximum-target semantics and clamps to storage capacity (`src/adapters/evolve/economy/resources/captured-resource-demand.ts:228-269`). P13D's live owner capture observed a 1,000-Steel Construction saving target and 1,000 aggregate Steel request, with `steelDemanded: true`; Steel was civilization-wide in that capture (`experiments/p13d1-live-smelter-demand-authority.md:20-30`). In the verified P12G replay, the 250-Steel price was first met by period 40, and the ordinary Research action was invoked at period 72 in both arms. Knowledge, not Steel, was the remaining measured threshold (`experiments/p12g-controlled-production-marginal.md:24-26,42-48`).

P13D's +10 rows were synthetic comparison inputs. All 10 were numerically represented by the incumbent 1,000 target and took the proven-invariant path with zero hypothetical planner calls. P13F likewise marks Q as synthetic. Those results validate the owner-local comparison mechanics; they are not evidence for an autonomous progression improvement or an extra request.

The bounded review of P12E/P12F/P12G/P12H/P12J observations found no other natural Research observation that supplies all of: a current goal-selected or verified mandatory action, current native price/pool identity, and same-boundary incumbent demand authority. The available observations are historical/advisory or do not establish selection. No full dependency traversal or producer search was performed.

## P13F trusted input boundary

`createCapturedSmelterOwnerIncumbentSnapshot()` is now module-private and runs only inside the Smelter owner after it reads the current input. Its private marker is added only when the complete input graph is recursively frozen; mutable or incomplete graphs remain unmarked and use the strict proof path. The diagnostics callback receives no snapshot constructor or branding capability. A separate test-only result projection supports P13F baseline capture without exporting the trusted snapshot. Existing currentness validation still rejects changed root, progression, permission, control, demand, allocations, capacity, stock/rate, and input signature; focused tests cover stale snapshot invalidation. The P13F owner replay confirms the owner-created Q input takes the exact-variant shortcut, while the synthetic sensitive required-mode fixture takes the reference planner.

## Deterministic work and bounded cost

The source-backed signal is not invoked in production while its source boundary is unavailable:

| Additional work on ordinary runtime path                                   |     Count |
| -------------------------------------------------------------------------- | --------: |
| Native Research draws                                                      |         0 |
| Catalog scans                                                              |         0 |
| Owner input reads                                                          |         0 |
| Native control calls                                                       |         0 |
| P12D dependency traversals                                                 |         0 |
| Goal-signal evaluations / no-signal evaluations                            |     0 / 0 |
| Quantitative comparisons / invariance proofs / sensitive planner fallbacks | 0 / 0 / 0 |

The separate Chromium contract measured 16,000 calls to the pure evaluator on a synthetic, already-represented input in `HeadlessChrome/151.0.7922.71`, renderer PID 19844. Aggregate renderer CPU was 54.82 ms and CDP `TaskDuration` was 16.91 ms. The runner's native stopwatch was quantized (median 0.30 ms per 1,000-call batch). These values characterize bounded pure computation only; they do not estimate recurring runtime cost or satisfy the 2% renderer-CPU gate.

## Correctness and comparison authority

P13D correctness-only replay completed using the verified Stage 2F save, seed 42, and the pinned game source. Its 10 synthetic +10 owner comparisons remained represented; all 10 used the invariant proof and zero hypothetical planner calls. G/S/Q/U ordinary parity passed: equal exports, 94,940 ordered native invocations, equal control usage, owner outcomes/postconditions, and random-call counts.

P13F correctness-only replay completed across G, N, Q-I, Q-P, and U. All five cells had the same export hash, 95,388 ordered native invocations, and 1,746 random calls. N performed ten proposal-provider reads and zero validations/snapshots/comparisons. Synthetic Q-I performed ten invariant proofs and zero planner calls; Q-P performed ten reference planner calls; the sensitive fixture fell back to the planner. The full end-to-end CPU factorial was skipped. The earlier full renderer-CPU gate remains unresolved and is not claimed passed.

The P13G contract tests cover represented versus supported targets, incomplete spending authority, Construction overlap without an invented conflict, multi-resource/pool inputs, advisory goal/action evidence, stale Research/price/binding/root/progression/demand/stock/control/permission/capacity evidence, goal satisfaction/invalidation, and fail-closed reasons. Chromium checks these classes in the pinned runner. Existing P13D/P13F tests retain the actual sensitive planner fallback and strict untrusted-graph proof.

Verification:

- Focused owner and goal-signal tests: passed.
- P13G Chromium contract and bounded pure measurement: passed.
- P13D correctness-only replay: passed; CPU cells skipped.
- P13F correctness-only replay: passed; full renderer-CPU factorial skipped.
- `npm run build`: passed.
- `npm run check`: passed all five stages, 358 test files plus bundle syntax.
- `git diff --check`: passed.

Native comparison authority is therefore **correctness-only for the synthetic owner comparison**. CPU authority is **unresolved**. No autonomous execution readiness is claimed.
