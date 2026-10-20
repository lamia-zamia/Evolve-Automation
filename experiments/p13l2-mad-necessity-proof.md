# P13L.2 — Scoped MAD prerequisite necessity proof

Date: 2026-10-20
Repository: `deadspace`, starting HEAD `2dbcdd33fe4a4237b6ba503bcbaf52a7c768e09c`
Pinned upstream: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`
Runner: nested `tools` checkout at `82d4e4a` (runner fingerprint `3ece7df32a7506f061120579aaa8fa80a2b712813feaaba3a04e89609cacd89d`)

## Decision

The P13L.1 cycle-1 result remains valid as a fail-closed result: it admitted zero claims because the classifier treated conditional and unavailable grant actions as unknown before examining their same-technology prerequisites.

The scoped P13L.2 correction establishes both structural obligations in the same pinned cycle-1 state. A single bounded 8-period positive-control replay selected both existing Research claims. The priority comparison remains suspended: this proof establishes current claim admission, not that either later research action can currently be purchased or executed.

| MAD obligation                             | Structural necessity | Current native actionability                                                                  | Independent claim admission                  |
| ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Black Powder → Explosives 1 → Explosives 3 | **Proven**           | **Verified offer and matching binding**; native affordability is false at observed Mana stock | **Verified** in the P13L.2 cycle-1 selection |
| Mad Science → High Tech 1 → High Tech 7    | **Proven**           | **Verified offer and matching binding**; native affordability is false at observed Mana stock | **Verified** in the P13L.2 cycle-1 selection |

## Rejection mechanism

`classifyMandatoryNativeResearchObligations()` previously returned `unknown` in `solveAction()` as soon as a non-offered alternative had graph status `conditional` or `unavailable`. That return preceded the check of the action's effective native prerequisite declaration. The retained cycle-1 graph already records `tech-anfo → research:explosives:2`, `tech-dynamite → research:explosives:1`, and `tech-super_tnt → research:explosives:3`. It also records the same-technology edges from Rocketry through the higher High Tech grants. These graph states describe execution or evidence availability; they do not erase the declared prerequisite edges.

The correction evaluates declared same-technology prerequisites before using conditional action status. A proven predecessor makes the alternative structurally dependent even when its side requirements or later execution conditions remain unresolved. An action with no relevant same-technology prerequisite is still unknown when its conditional status or native conditions are unresolved. A higher grant whose same-technology declaration requires the threshold under analysis (or a higher threshold) cannot be the first grant to that threshold; it is not a bypass. Exception boundaries remain unknown. Cycles and missing grant levels no longer collapse to an assumed zero or an impossible route.

The traversal budget is 512 action visits per classification. It is reported in the classifier work result. No global graph depth or action limit changed.

## Black Powder obligation

The cycle-1 snapshot records `explosives:0`, with no missing level, and the terminal Explosives requirement is level 3. The effective native alternatives are:

| Action           | Grant        | Effective prerequisites         | Declaration                    | Cycle-1 route evidence              | Necessity result                                                                          |
| ---------------- | ------------ | ------------------------------- | ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `tech-anfo`      | Explosives 3 | Explosives 2 **AND** Oil 1      | Static in pinned `src/tech.js` | Conditional; applicability eligible | Requires Black Powder: Explosives 2 requires Dynamite, which requires Explosives 1        |
| `tech-super_tnt` | Explosives 4 | Explosives 3 **AND** Science 23 | Static in pinned `src/tech.js` | Conditional; applicability eligible | Cannot first grant Explosives 3 because Explosives 3 is already a prerequisite; no bypass |

`tech-dynamite` grants Explosives 2 and statically requires Explosives 1. `tech-black_powder` grants Explosives 1. The captured terminal route is `tech-mad → tech-anfo → tech-dynamite → tech-black_powder`.

The current `actions.js` requirement skip applies only to Cement for the Flier trait. This cycle is on the standard route, and none of these same-technology requirements is Cement. The unresolved Oil, Science, queue-precognition, and later execution conditions do not offer a route around the Explosives predecessor chain. They do not prove that ANFO or Super TNT is executable now.

## Mad Science obligation

The cycle-1 snapshot records `high_tech:0`, with no missing level, and the terminal High Tech requirement is level 7. All applicable grants at level 7 or higher in the captured candidate set are covered below. Current route exclusions are listed as excluded paths, rather than treated as missing offers.

| Action                        |        Grant | Effective same-technology prerequisite | Declaration                  | Cycle-1 route evidence                                                                                      | Necessity result                       |
| ----------------------------- | -----------: | -------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `tech-rocketry`               |  High Tech 7 | High Tech 6                            | Static                       | Conditional; applicability eligible                                                                         | Requires the chain back to High Tech 1 |
| `tech-surface_breach`         |  High Tech 7 | —                                      | Static route-specific action | Excluded: standard route                                                                                    | Excluded; not a bypass                 |
| `tech-robotics`               |  High Tech 8 | High Tech 7                            | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-lasers`                 |  High Tech 9 | High Tech 8                            | Computed `reqs(r)`           | Unavailable; same-cycle effective declaration contains High Tech 8, Supercollider 1, Space 3, and Elerium 1 | Cannot first grant level 7             |
| `tech-artifical_intelligence` | High Tech 10 | High Tech 9                            | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-quantum_computing`      | High Tech 11 | High Tech 10                           | Computed `reqs(r)`           | Conditional; same-cycle effective declaration contains High Tech 10 and Nano 1                              | Cannot first grant level 7             |
| `tech-virtual_reality`        | High Tech 12 | High Tech 11                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-virtual_reality_tp`     | High Tech 12 | —                                      | Static route-specific action | Excluded: standard route                                                                                    | Excluded; not a bypass                 |
| `tech-plasma`                 | High Tech 13 | High Tech 12                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-shields`                | High Tech 14 | High Tech 13                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-ai_core`                | High Tech 15 | High Tech 14                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-metaphysics`            | High Tech 16 | High Tech 15                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-orichalcum_analysis`    | High Tech 17 | High Tech 16                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-cybernetics`            | High Tech 18 | High Tech 17                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |
| `tech-divinity`               | High Tech 19 | High Tech 18                           | Static                       | Conditional; applicability eligible                                                                         | Cannot first grant level 7             |

The lower chain is `tech-mad_science` (High Tech 1), `tech-electricity` (2, requires 1), `tech-industrialization` (3, requires 2), `tech-electronics` (4, requires 3), `tech-fission` (5, requires 4), `tech-arpa` (6, requires 5), and Rocketry (7, requires 6). Those declarations are static in the pinned upstream source. The two computed declarations that occur in higher grants were observed as effective same-cycle edges in the retained native graph; no computed prerequisite function was called by this proof.

Side requirements remain separate. For example, Lasers also requires Supercollider, Space, and Elerium in the captured standard-era declaration; Quantum Computing requires Nano; AI Core requires Science and Blackhole; later actions require Xeno, Chthonian, Hell Ruins, Elysium, or Isle. These do not bypass the High Tech chain, and their unresolved affordability or eligibility does not make those later actions presently executable.

## Snapshot, actionability, and claim safeguards

The retained P13L.1 cycle-1 evidence binds the selected MAD goal to a fresh terminal eligibility observation, root generation 0, the captured progression epoch, `research-offers-1`, and offer/control generation 1. Both target offers were native eligible and current. Their prices were Black Powder 100 Mana plus its captured non-Mana costs, and Mad Science 50 Mana plus its captured non-Mana costs. The retained grant levels were `explosives:0` and `high_tech:0`; neither level was inferred from absence.

P13L.1's first-cycle outcome was `unavailable`, with zero claims and no Research-owner selection. P13L.2 ran the bounded positive control once, advanced periods 0–8, retained MAD, and reported `selected` with both `tech-black_powder` and `tech-mad_science` as candidates. The selection reason was `independent current verified native prerequisite obligations`. The runtime reaches this record only after current offer/control checks, non-Mana affordability checks, empty player queues, and successful `planIndependentResearchResourceClaims()` admission for every eligible candidate. No native Research purchase was made by the probe.

The offer catalog and probe use the existing native Research draw. The classifier is pure; it adds no native control call or Research draw. Native tracing was enabled at document start and its callback remained present, non-writable, and non-configurable. The bounded replay advanced 8 periods. The upstream prices and offer IDs matched the retained positive-control inputs.

## Adversarial coverage

The focused synthetic tests cover conditional ANFO and Super TNT with declared predecessor chains, conditional High Tech progression with independent side requirements, a genuine currently offered higher-level bypass, missing computed declarations, requirement-exception boundaries, excluded versus conditional alternatives, missing grant levels, cycles, incomplete candidate sets, stale offer binding, and separate Black Powder and Mad Science proofs. Existing runtime and goal-resource signal tests cover current and unknown/stale control-generation bindings. The P13L.2 cycle-1 selection verifies that both independent claims pass existing admission together.

The fail-closed behavior remains when a relevant grant alternative has a missing declaration, or a computed declaration without an adequate current native observation; when a conditional alternative could still bypass the candidate; when the candidate set is incomplete; or when stale eligibility/offer binding, a missing grant level, or an exception boundary prevents the universal proof. Unrelated graph incompleteness does not by itself defeat this scoped proof. Resource claims still require the current offer, matching control generation, owner eligibility, affordability evidence, empty queues, and current goal/permission authority.

## Work and verification

| Measure                                                |      Result |
| ------------------------------------------------------ | ----------: |
| Retained cycle-1 graph action nodes                    |         124 |
| Retained cycle-1 requirement gates                     |         129 |
| Retained graph depth-limit records                     |         140 |
| P13L.1 mandatory classifier calls / native-path visits |      1 / 17 |
| P13L.2 cycle-1 mandatory classifier calls              |           1 |
| P13L.2 per-classification action-visit budget          |         512 |
| Additional native calls from the proof helper          |           0 |
| Full renderer CPU factorial                            |     Not run |
| Full-allocator CPU readiness                           | Not claimed |

The P13L.2 runner streams a large JSON record to stdout and does not persist that run's record. The first-cycle selection and both admitted candidates were visible in the single run's output; its exact `nativePathVisits` field was not retained after the console stream was truncated. The auditable retained graph counts and prior 17-visit baseline above are therefore reported separately from the new explicit 512-visit cap. No second replay was run to recover that field.

Validation completed:

- Focused obligation and goal-candidate tests passed.
- Build passed.
- Full `npm run check` passed all 359 test files, type checks, architecture checks, lint, format, and bundle syntax.
- `git diff --check` passed.

## Recommendation

Both scoped obligations now have a current-cycle necessity proof and passed existing independent claim admission, so this proof slice does not require suspending the Mana allocation comparison on prerequisite uncertainty. Any resumed comparison should remain a separate, explicitly bounded experiment. No 200-period or 1,000-period comparison, full renderer CPU factorial, or full-allocator CPU readiness claim is included here.
