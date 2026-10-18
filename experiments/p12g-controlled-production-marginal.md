# P12G — Controlled production marginal in a reachable game state

| Field            | Value                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Date             | 2026-10-18                                                                                                            |
| Branch           | `deadspace`                                                                                                           |
| Code/test commit | `b74c97c3c93387fb43e307451319682ca386c312`                                                                            |
| Pinned game      | `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                       |
| Game snapshot    | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` |

## Decision

**B — Intervention redundant or not useful.** A reachable, permitted Smelter already reacts to the current 1,000-Steel Construction saving demand. In matched isolated replays, the existing native policy and the alternative Steel-oriented policy made Steel Containers affordable at the same runner period and invoked the Research action at the same period. The alternative ended with more Steel, but that extra stock did not advance this goal action and came with less Iron. No production intervention was enabled in ordinary runtime.

## Inputs and reachable state

The search used the established Stage 3S B inputs: seed `42`, epoch `2026-09-21T00:00:00.000Z`, the Stage 2F save (SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`), and the Stage 2E settings file (SHA-256 `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`). The Stage 3S setting `autoResearch: true` and enabled-Smelter B setting `autoSmelter: true` were retained. The Stage 3F Gather intervention was disabled. The 4,000-period exact replay completed with 500 workticks and no runtime errors.

The effective settings used in the paired counterfactuals, including those two overrides, have SHA-256 `3a8bf71d16dd5347f151bfbb67b7f8db786e95b6746f16b8d24d9c2a605e1132`.

The experiment selected the state from observations at runner period `1,784`, before the captured native Smelter adjustment. It was not selected by assuming a fixed period. At that point:

- `autoSmelter` was enabled; captured input was initialized; the current `iSmelter` handle exposed `addMetal`, `subMetal`, `addFuel`, and `subFuel`.
- The live Steel Containers offer was generation `244`, priced at 9,000 Knowledge and 250 Steel. Steel was 10 / 33,516, a 240-Steel shortfall for that action.
- Construction's current saving target was `city-coal_power`, with 1,000 Steel requested. That was the observed Steel demand; it was not attributed to Research.
- The input had 15 smelters, 15 on Coal fuel, 15 on Iron, and 0 on Steel. The native planner emitted Steel `+1` and Iron `-1`. Iron held 63,701.68; Coal held 26,045.06. The observed fuel/input constraints were available and no smelter capacity was free.

## Matched native counterfactual

Both isolated sessions loaded the same captured save, root generation, seed, epoch, permissions, controls, and Construction demand. The only changed setting was the existing `productionSmelting` policy: `required` for the native baseline and `steel` for the alternative. Each arm ran 100 exact-runner periods. Only the isolated sessions used the alternative; the shipped runtime setting and policy were unchanged.

`iSmelter.addMetal` and `iSmelter.subMetal` made the requested assignment changes. The pinned native methods only reassign smelter counts; they take no immediate resource payment. Operational and displaced effects were measured from the matched stock trajectories, not inferred from allocation counts or a single `resource.diff` value.

| Resource | Baseline stock change | Steel-policy stock change | Paired marginal over 100 periods | Capacity change |
| -------- | --------------------: | ------------------------: | -------------------------------: | --------------: |
| Steel    |               +373.15 |                   +428.09 |                       **+54.94** |               0 |
| Iron     |               +990.74 |                   +967.26 |                       **−23.48** |               0 |
| Coal     |               +231.31 |                   +230.31 |                        **−1.00** |               0 |

Other tracked resource holdings and capacities matched. Coal fuel allocation stayed at 15 in both arms. The serialized `resource.diff` values for Iron, Steel, and Coal were zero in the observation samples, so the paired finite-horizon stock changes above are provisional observed marginals, not stable per-second rates.

At the end of the paired period the baseline used 5 Iron / 10 Steel smelters; the alternative used 3 Iron / 12 Steel, with 15 Coal fuelers in each. The native Smelter control ledger recorded 20 calls in the baseline and 24 in the alternative. Non-Smelter control usage, ordered non-Smelter native invocations, Research invocations, and random-draw counts matched. Both arms first had the 250 Steel action requirement at runner period 40 and invoked `tech-steel_containers` at period 72. The additional Steel therefore produced no observed next-action acceleration; the 9,000-Knowledge requirement remained part of that action's affordability.

## Strategy comparison and limits

`compareGoalStrategies()` received the 250-Steel action requirement, the observed 1,000-Steel Construction request, the paired stock deltas, and incomplete external-commitment coverage. It returned no winner. The captured stock could not cover the full known Construction commitment, other owner commitments remained unknown, and the stored single-sample rates did not provide a stable forecast. No terminal MAD completion time was estimated.

This establishes the current native response and the measured 100-period collateral for the tested alternative. It does not establish a stable production forecast across changing fuel, stock, storage, or demand conditions. The complete comparison does establish that the tested Steel-focused intervention does not improve the current Steel Containers action time in this reachable state.

## Performance and safety

- Captured input-plus-plan diagnostic reads were below the exact runner's timer resolution in the 10-read samples. Pure `planSmelter()` generation measured 0.0044 ms median and 0.301 ms maximum across 25 calls.
- Pure marginal comparison measured 1.61 ms. Goal-intent processing is not scheduled in ordinary runtime; no cross-worktick cache, continuation, worker, reservation, Research purchase policy, or shared claim enforcement was added.
- Renderer work for each 100-period isolated session was 2.90 / 2.63 task seconds and 5.59 / 5.81 script milliseconds (baseline / alternative). Exact-runner timings are harness measurements, not live-page timing.
- The ordinary production bundle is unchanged from `HEAD`. The P12F exact regression also retained equal baseline/candidate exports, control usage, ordered native invocations, and Research draw counts, with no Research action calls in either arm.

## Dynamic regressions and verification

The new captured-state regression covers the observed Steel `+1` / Iron `−1` decision, a satisfied Steel need, competing Iron demand, constrained fuel, no available Smelter capacity, and fail-closed comparison under the known Steel commitment and unknown external commitments. Existing intent, planner, and captured-owner regressions cover permission changes, already-demanded resources, stale goal/offer facts, missing controls, changed production, capacity and incomplete commitment cases.

Verified:

- Focused goal-feasibility, goal-resource-intent, Stage 3S intent, captured Smelter, advisory projection, and P12G tests.
- `npm run build` and `npm run check` (351 test files plus bundle syntax; all five check steps passed).
- `node tools/chromium-evolve-runner-test.mjs` (determinism, isolation, reload continuity, pause, and cleanup passed).
- `node experiments/stage3s-strategy-pilot.mjs B --periods=4000 --no-gather`.
- `node experiments/p12f-live-economic-intervention.mjs`.
- `node experiments/p12g-controlled-production-marginal.mjs --capture=test-artifacts/benchmark/tmp/p12g-reachable-capture.json`.
- `git diff --check`.
