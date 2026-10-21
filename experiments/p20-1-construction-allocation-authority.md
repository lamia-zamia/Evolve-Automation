# P20.1 Construction allocation authority and replay correction

## Decision: C

Construction allocation remains disabled at boundaries where the current publication cannot be tied to the active progression authority. The P20.1 replay made no experimental allocation authorizations and did not improve native progression over the accepted P19 candidate. The native price agreement alone is insufficient to spend Gather clicks.

## Correction

The P20 contract compared the pre-Gather request with the live saving-target read, but did not require the current native catalog price to equal the request. The new shared validator requires the same `city-*` action and exact complete price (same resource names and quantities) across the current request, the captured Construction publication, and the native cost catalog. It also requires valid finite nonnegative prices, complete current resource observations, compatible pool authority, affordable non-gatherable costs, and an immediately preceding Construction publication under the current root and progression generation.

The validator is used while constructing the allocation contract and again in the `isCurrent` check immediately before every native Gather click. The existing bounded P19 bootstrap and Construction handoff remain intact. Experimental allocation remains available only on the compile-time test surface; the production bundle is unchanged.

## Construction publication chronology

The P20 p5000 comparison is phase-mixed. Its allocation contract is a `pre-Gather` observation; the separately captured Construction target is read after the native Construction cycle (`post-Construction`). P20 did not persist cycle IDs or phase stamps on both sides, so its historical Quarry/University pair cannot establish that the University publication was consumed by the Quarry contract. The capture point itself explains how two different observations can appear at the same displayed period. This is category A (different valid observations at different phases), not evidence that the observer associated the same publication with the Gather request. The old record is insufficient to prove execution-time authority, so it is inadmissible for allocation.

In the corrected P20.1 replay, p5000 is work cycle 625, `pre-Gather`; its target is Farm at 20 Lumber / 10 Stone. It consumes the Farm publication captured after work cycle 624 at period 4992. Both carry root generation 0 and the same progression epoch. The current catalog agrees exactly, and the recorded material shortage is 10 Stone. The sampled contract evidence shows all three price sources agree, the Build control and permissions are current, queues are empty and no competing claim exists. Even so, the replay records no experimental authorization at this point. Since the exact runner does not retain a per-cycle denial reason for this sampled contract, the reason remains unresolved; the P20.1 result does not claim a Gather admission here.

At period 8304, work cycle 1038, the captured publication is the prior cycle 1037, target Farm, price 20 Lumber / 10 Stone. Request, publication, live saving-target read and catalog agree on action, complete price and pool. The publication epoch ends in `|27|`, while current progression ends in `|28|`; the current-authority check fails and no contract is admitted. This is a concrete execution boundary that cannot be proven current from the available Construction publication authority. Allocation is therefore disabled there. The corrected replay records phase and cycle IDs; it does not infer freshness from an unchanged catalog price.

## Controlled replay

The exact Chromium runner used the P19 Standard/Human fixture, seed 44, frozen 2026-09-21 epoch and frozen settings. It ran the corrected candidate and a duplicate through 10,000 periods. The P19 accepted candidate is retained as the comparator; P20 original results are retained as historical, non-admissible evidence.

| Checkpoint                             |                                                                                P19 accepted |                                          P20.1 corrected |
| -------------------------------------- | ------------------------------------------------------------------------------------------: | -------------------------------------------------------: |
| p5000 population                       |                                                                                           3 |                                                        0 |
| p10000 population                      |                                                                                           3 |                                                        0 |
| p10000 buildings                       |                                                                            1 Farm, 3 Cabins |                                                 4 Cabins |
| p10000 research                        | Agriculture 3, Housing 1, Currency 1, Storage 1, Mining 1, Science 1, Military 1, Banking 1 |                                 Same listed technologies |
| Gather calls attributable to candidate |                                                                                    20 Stone | 15 Stone total; no experimental allocation authorization |
| Experimental material Gather clicks    |                                                                              Not applicable |                                                        0 |

At p5000 / p10000, P20.1 had Food 0/1000, population 0, no assigned jobs, no Farmer production, and cumulative starvation counts 4 / 8 with zero deaths. The corrected replay adds one Cabin purchase but no Farm, Shed, or Research purchase; it has no progression gain over P19. P20's earlier Shed and progression claims are not admissible under the corrected price and publication checks.

The corrected candidate and duplicate matched their final export hash, RNG call count (2,007), final RNG state (2,778,716,633), and native control-usage trace. The exact run recorded 1,242 Construction allocation owner cycles, no authorization event, zero native control failures, and one stale publication-authority disagreement at p8304. Native control, export, RNG and invocation parity checks passed for the corrected candidate replay.

## Verification and limits

- Focused Construction authority, Gather resource, runtime-control and P20 budget regressions passed.
- Exact Chromium replay completed at p5000 and p10000 with duplicate deterministic replay.
- `npm run build` preserved production bundle SHA-256 `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`.
- Native parity could not start: `test-artifacts/benchmark/settings/baseline-tuned.json` and the legacy `test-artifacts/benchmark/saves` inputs are absent. The available `slice0/settings/current-full.json` is not an authoritative substitute for the missing pinned baseline and saves; no configuration was fabricated.

Machine-readable bounded evidence: [p20-1-construction-allocation-authority-evidence.json](p20-1-construction-allocation-authority-evidence.json).
