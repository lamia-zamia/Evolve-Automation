# P13A — Shared allocation admission and CPU feasibility

| Field                 | Value                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Date                  | 2026-10-19                                                                                   |
| Branch                | `deadspace`                                                                                  |
| Starting HEAD         | `92e564a597138ae68485eb12c455df8514a60332`                                                   |
| Implementation commit | `b81c20f7`                                                                                   |
| Pinned game           | `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`                              |
| Production behavior   | Unchanged; the coordinator is pure domain code used by tests and a test-only browser harness |

## Decision

**C — Owner authority is insufficient.** P12G/P12H/P12I establish a useful comparison for the tested Steel Containers state, but there is no owner request port and no shared fresh snapshot of incumbent plans, commitments, controls, and permission generations. The ordinary owner controls remain authoritative. In particular, the Jobs evidence cannot establish a safe Scientist source or current plan, and P12G's external commitment coverage is incomplete. A shared coordinator must therefore fail closed and cannot submit the required requests safely.

The performance trial did not establish a production CPU pass or a reproducible over-budget coordinator path. Its paired renderer-CPU uncertainty is much larger than 2%, and the in-page timer/harness cost was measurable separately from the pure comparison. The existing P12D.1 dependency search is not needed for the tested no-signal or invalidation checks, but a production recurring-observation design cannot yet be priced because the required common owner boundary does not exist.

## Contract added

`src/domain/economy/owner-coordination.ts` is a bounded, pure evaluator. It keeps the following decisions distinct:

- Requirement identity, goal identity, resource and pool, target quantity, and provenance (`verified-mandatory`, `provisional-advisory`, `explicit-user-instruction`, or `existing-owner-demand`). An advisory cannot request an owner or reserve a resource.
- Incumbent and proposed plan identities and per-pool resource-production/capacity effects. Their difference records target production gained and other production displaced. A negative plan delta alone does not free source capacity.
- Commitment completeness, known affected commitments, conflicting source claims, owner capability, request-port availability, native controls and caps, worker-source safety, permissions, explicit queue precedence, owner reversal, and current root/progression/price/control/snapshot/permission generations.
- Structural validity, physical executability, supported incremental effect, usefulness to a named immediate constraint, comparative preference, and request eligibility. `authorizedToExecute` is always false; owners retain every mutation boundary.

Known coverage that already meets the target is redundant. A supported zero improvement over the incumbent is redundant for that immediate constraint even if the incumbent has not yet accumulated enough stock. Unknown effects, incomplete commitments, stale evidence, unavailable controls, and budget exhaustion do not produce an admitted request. Candidates with different value bases remain incomparable; a stable ID never breaks a strategic tie. A supported equal value on the same basis is reported as a tie.

No owner port, global reservation lock, cross-tick cache, persistent continuation, production scheduler, or control invocation was added. Legacy weighting, job breakpoints, and Smelter modes are not interpreted as terminal-goal scores.

## P12J reusable selection correction

The P12J capture uses `captureCurrent`, `progressionMatchesCapture`, and `priceMatchesCapture` to mean that the archived evidence agrees within its capture. They do not claim that the live game still has the same root, progression, or price. An owner responding to demand is no longer a hard exclusion. That observation establishes what its incumbent plan is doing; it does not prove that the need is fully met or that another increment has no benefit.

P12J now reports executable possibilities in their input order, with `supportedIncrementalEffect`, usefulness, preference, owner-request eligibility, and execution authorization kept separate. The old selector had no utility evidence, so it cannot select a candidate or report a tie. The P12J historical finding remains unchanged: its sampled Smelter intervention did not improve the current Research purchase boundary, and the Jobs sample did not have a safe executable reassignment.

## Reused gameplay evidence

The following are measured P12G–P12I facts, not synthetic alternatives:

| Owner / requirement                 | Evidence and coordination conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smelter / Construction Steel demand | At period 1,784, the enabled native Smelter plan saw Construction saving 1,000 Steel and assigned Steel `+1` / Iron `−1`. In the matched P12G 100-period replay, the Steel-oriented alternative ended with 54.94 more Steel than the native baseline, but 23.48 less Iron and 1 less Coal. It changed neither the Steel Containers Research action period (72) nor its affordability boundary. The supported current Research constraint was Knowledge: Steel cleared its 250 price by period 40, while Knowledge crossed 9,000 in `(60, 70]`. Thus the coordinator recognizes no supported incremental benefit for that Research constraint; it does not declare future Steel requests universally redundant. Other external commitments remain incompletely observed. |
| Jobs / Scientist                    | Scientist was at its native cap (1/1); unemployed/default-pool workers were 0, and no safe worker source was established. P12I did not run an intervention. Native target-control binding, a current complete Jobs plan, and a safe source displacement cannot be inferred. No executable reassignment is produced.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Research / Steel Containers         | The last observed priced-resource threshold was 9,000 Knowledge; the offer also cost 250 Steel. That relationship establishes the immediate constraint for this purchase only. It does not establish that Smelter or Jobs can accelerate it. P12H's protected fresh draw was diagnostic and created a new offer observation/rebound 15 offer controls; it is not a recurring coordinator input.                                                                                                                                                                                                                                                                                                                                                                         |

The generic alternatives in `tests/domain/economy/owner-coordination-test.mjs` cover future owner combinations, equal and incomparable utility, pool separation, commitments, and caps. They establish contract behavior only and are not gameplay improvements.

## Observation boundary inventory

| Input                                                  | Existing observation point and cost                                                                                                                                                                    | Freshness and reuse limit                                                                                                                                                                     | Missing evidence behavior                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Research offer, native price and current affordability | Existing Research owner reads the current catalog on its own cycle. P12H's extra protected draw was a one-off diagnostic; P13A does not require it.                                                    | Tied to the Research draw/catalog generation, current root and price. A draw rebinds offer controls; do not force it from a no-op goal check. A mutation invalidates the captured offer.      | No fresh shared offer means no proposal.                                                                                  |
| Smelter incumbent plan and Construction demand         | Captured together by the existing Smelter-cycle observation in P12G (`readSmelterPlanForTest` and current demand); one plan read at the selected boundary.                                             | The decision is useful only with that demand, current Smelter assignment, fuel/input and control generation. Reuse cannot cross assignment, resource-pool, permission or owner-plan mutation. | Missing current plan or source obligations means unavailable; a negative Iron delta does not grant Iron to another owner. |
| Jobs assignment, worker pools, plan and target control | P12I reused captured assignments and traced the ordinary Jobs cycle; its 100-per-arm Research samples were diagnostic reads. The pure job-pair evaluator timing is not an owner observation frequency. | Assignment and plan are cycle-specific. P12I did not establish Scientist headroom, safe source surplus, target control binding, or that Jobs would retain a proposed allocation.              | At the verified state, cap and zero idle workers suppress reassignment; unknown source/plan remains unknown.              |
| Other owner commitments                                | P12G only recorded the known 1,000-Steel Construction demand; complete external commitment coverage was unavailable.                                                                                   | A source or target mutation can change the commitment set. No cross-owner snapshot or reservation lock exists.                                                                                | Incomplete coverage blocks admission rather than assuming spare capacity.                                                 |

The normal owner cycles already pay for their local facts. The cheapest safe extension is to publish a small immutable snapshot from each existing cycle, tagged with the current root, progression, price, pool, control, permission, and owner-plan generations. A consumer must reject it after any matching mutation. No additional full Research draw, DOM scan, control rebinding, or P12D.1 search belongs in a no-signal check. Until there is an established owner request port, an eligible proposal is diagnostic only.

## Bounded Chromium shadow CPU experiment

`experiments/p13a-owner-coordination-feasibility.mjs` replays the same P12G captured save at period 1,784, settings, seed 42, epoch, pinned snapshot and production bundle in all cells. Each cell ran 800 exact-runner periods (100 workticks). Three repeats used both `G, H, S0, S1, S2` and reversed `S2, S1, S0, H, G` order.

- **G:** ordinary production baseline.
- **H:** test-only 2,000-virtual-ms timer and callback counter, no coordinator. This isolates the recurring timer harness.
- **S0:** H plus an empty no-signal coordinator evaluation once per worktick.
- **S1:** consume the captured P12G/P12I evidence once at the exact restored boundary; subsequent workticks use invalidated evidence (S2 behavior), never a stale capture.
- **S2:** fail-closed stale Jobs evidence once per worktick; no rediscovery loop.

The validity fixture is measured actual P12G/P12I evidence. The resulting S1 classification is redundant for the current Steel Containers constraint, but external commitment coverage and an owner request port remain absent; it is not an admitted production request. All 30 cells had the same export hash, random-call count, native control-usage ledger, and native invocation trace. Every cell recorded zero native Research action calls; the pure coordinator code requests no Research draw and performs no DOM scan or control rebinding. The ordinary bundle does not expose a direct native `drawTech` counter, so base-game draw counts were not separately attributed in this run. P12G/H's measured draw-count parity remains the relevant gameplay evidence.

Renderer process CPU is the primary measure; calibrated CDP `TaskDuration` is the cross-check, following Stage 4F.3. `ScriptDuration` is reported only as a non-authoritative counter. Six paired CPU deltas were noisy:

| Cell versus same-order G | Mean renderer CPU delta | Pair standard deviation |              Range | Mean TaskDuration delta |
| ------------------------ | ----------------------: | ----------------------: | -----------------: | ----------------------: |
| H timer harness          |                  +0.67% |                13.39 pp | −20.96% to +16.78% |                  +0.74% |
| S0 versus G              |                  +3.31% |                 9.71 pp | −12.00% to +15.37% |                  +3.60% |
| S1 versus G              |                  −3.17% |                 4.91 pp |  −10.50% to +1.94% |                  −2.65% |
| S2 versus G              |                  +2.44% |                12.68 pp | −15.05% to +19.57% |                  +2.56% |

After subtracting the matched H cell, S0's mean CPU difference was +3.46% (sample SD 10.53 pp), S1 was −2.61% (11.61 pp), and S2 was +2.50% (11.82 pp). These are not production estimates: their spread is several times the 2% target. The six G windows ranged from 14.54 to 17.72 renderer CPU seconds. The paired 95% t intervals are broad (for S0 versus H, approximately −7.6% to +14.5%); they do not establish either a pass or a stable over-budget coordinator cost.

The 100 native-clock coordinator samples per recurring cell had 0 ms p50 and generally 0.1 ms p95/p99; S1's 101 samples had p99 up to 0.2 ms. The clock reports at 0.1 ms granularity, so these values are resolution-limited. Whole worktick callback p50/p95/p99 also varied materially across reversed cells. End-of-window heap and DOM-node deltas varied substantially with the game run and garbage collection and cannot isolate allocations from this tiny shadow evaluator. The benchmark harness timer, callback profiling, and page activity dominate the available measurement resolution; it is not evidence of production overhead.

The coordinator adds zero owner-capture calls in all cells. It preserves state and native behavior in this shadow run, but the 800-period capture did not invoke Research or another native action, so it cannot show reaction latency at an action boundary. A production feasibility pass requires a repeated, lower-noise renderer-CPU result for the eventual normal-cycle observation and owner-request ports; this test does not meet that bar.

## Verification

- Focused owner-coordination, P12J, P12G, captured Smelter, Jobs and Research regressions passed (11 test files plus bundle syntax).
- `npm run build` passed; generated production bundle remained unchanged.
- `npm run check` passed all five checks and all 356 test files.
- `node tools/chromium-evolve-runner-test.mjs` passed callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- `git diff --check` passed.

No production integration was enabled and no push was performed. Work stops for independent review.
