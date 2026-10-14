# Stage 3S — goal-directed production pilot

## Decision

**D. Insufficient evidence.** The native offer for Steel Containers is real and currently present, and Industrialization declares Steel Containers 1 as a requirement. The current native graph cannot prove that the offered Steel Containers action is mandatory: other native actions can grant the same technology, and the current evidence leaves several of their requirements conditional or unavailable. The pilot therefore produced no verified, actionable production intent. No strategy was integrated into the release runtime.

The replay also confirms that enabled default Smelter automation already receives an unrelated 1,000-Steel Build commitment at its first Steel allocation. That explains why a goal intent would be redundant at this fixture’s observed allocation decision, but it does not cure the missing mandatory-action proof.

## Pinned inputs and evidence bridge

| Input                             | Value                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository branch / starting HEAD | `deadspace` / `9f857c96af54dd90015597d394adda29d4ea9a38`                                                                                                       |
| Upstream source                   | `D:/work/Evolve-DeadSpace`, `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                                                         |
| Game snapshot                     | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`                                          |
| Save                              | `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`, SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`      |
| Settings                          | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`, SHA-256 `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131` |
| Seed / epoch / horizon            | `42` / `2026-09-21T00:00:00.000Z` / 4,000 periods                                                                                                              |
| Gather intervention               | Existing Stage 3M `goal-derived-conjunctive` test intervention                                                                                                 |

The test-only catalog reader returned current offers, current binding generations, native definitions, grant levels, applicability, root generation, progression epoch, and queue evidence from the shared Research cycle. Sampling did not invoke a native Research action. Upstream `tech.js` at the pinned commit declares `tech-steel_containers` at `tech.js:3139` with native price sampled as 9,000 Knowledge plus 250 Steel, and declares `tech-industrialization` at `tech.js:5879` granting High Tech 3 with requirements High Tech 2, Cement 2, and Steel Containers 1.

At period 1,000, the current Steel Containers offer was generation 138 and `nativeAffordable: false`; Steel was 10 / 33,516 and Knowledge was 5,582.79 / 20,806. The local Industrialization applicability gate was eligible, but Industrialization itself was not offered. The captured actionable frontier contained `tech-steel_containers` and `tech-barns`. The mandatory-obligation classifier returned unavailable because alternatives including `tech-alloy_containers`, `tech-mythril_containers`, and `tech-adamantite_containers` had incomplete native requirement evidence. The classifier did not promote the offer to mandatory merely because it was present.

An immutable input with `mandatoryEvidence: "unavailable"` is therefore not passed to the goal-resource planner. The live bridge reports the missing proof and stops. This is the required fail-closed result; the 250-Steel offer alone is not treated as a goal target.

## Planner and test-surface prototype

`planGoalResourceIntents` now reports global frontier completeness separately from actionability. A locally complete mandatory proof can remain actionable when unrelated graph evidence is partial. It rejects invalid/non-finite or negative figures and identifiers, duplicate offers/holdings/capabilities, duplicate native price resources, inconsistent producer availability, aggregate overflow, and conflicting mandatory actions that require the same resource. Missing mandatory prices withhold actionability. Alternative branches are reported as `not-selected` and can never be actionable.

The isolated adapter experiment in `stage3s-smelter-intent.mjs` requires an enabled owner, a current positive shortfall, matching root/progression/offer identity/generation/price/settings/production fingerprints, complete competing-demand evidence, and an owner-declared resource capability. Existing demand for that resource yields `already-demanded`. Otherwise it only raises the matching native Smelter demand bit; `planSmelter` remains responsible for fuel affordability, production limits, and Iron/Steel trade-offs. The experiment never reserves spending or selects Research. Its output labels allocation-change cost as unknown until the native planner decisions are compared; it does not convert a one-time `resource.diff` sample into a time-to-goal score.

This is a test-only policy contract and shadow adapter, not a production integration. Since the live prerequisite proof was unavailable, scenario D supplied no intent to the native owner and made no change to the runtime planner input.

## Economic evidence

At the B Smelter decision near period 1,000, native Build saving target `city-coal_power` requested 1,000 Steel. The same sample had 14 smelters, 14 allocated to Iron, zero to Steel, 10.96 Coal/s and 61.98 Iron/s, with the captured Smelter input and `autoSmelter` permission available. The current Steel capacity was ample for both the 250 native offer and the 1,000 build target. The build target—not Research—was the sampled Steel demand.

At period 4,000, B had 15 Iron and 1 Steel smelter, fueled by 16 Coal smelters, and had one powered Coal Power. C had 0 Iron and 14 Steel smelters, fueled by 14 Coal smelters; it held 113,995.77 Steel and had one powered Coal Power. A kept 17 Iron smelters on Wood fuel and never produced Steel. These observed differences show the opportunity cost of C’s Steel-heavy allocation. They do not justify an exact time estimate: instantaneous `resource.diff` changes with fuel, demand, construction, storage, and allocation.

## A/B/C/D outcomes

The A/B/C values reproduce the Stage 3R exact-runner comparison; A/C were replayed again for this stage. B/D were replayed together from fresh contexts with the same pinned inputs. The finer Stage 3R native invocation trace supplies the exact B Research period; the Stage 3S periodic samples resolve stock changes at 100-period intervals.

| Scenario                            | First Steel allocation / positive stock | Steel Containers         | Industrialization (High Tech 3) | Period 4,000: High Tech / Explosives / Uranium | Result                                                                  |
| ----------------------------------- | --------------------------------------- | ------------------------ | ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| A. Original, Smelter disabled       | None                                    | Never                    | Never                           | 2 / 2 / 0                                      | Steel remains 10; no Coal Power built                                   |
| B. Smelter enabled, required policy | Period 1,000 / positive by 1,008        | Native purchase at 1,072 | 3,600                           | 3 / 2 / 0                                      | One Steel smelter supports the build demand, then progression continues |
| C. Existing Steel-oriented policy   | By 100 / positive by 100                | By 100                   | Not by 4,000                    | 2 / 2 / 0                                      | 113,995.77 Steel, no Iron smelters, no Industrialization                |
| D. B plus verified-intent shadow    | Same as B                               | Same as B                | Same as B                       | 3 / 2 / 0                                      | No intent was admitted; native Research calls and final state equal B   |

All four 4,000-period runs recorded 500 automation work ticks and no console or page errors. B and D had identical native Research invocation sequences and final tracked resources, allocations, and technology levels. D’s parity is not evidence that a goal-derived override would help; the shadow correctly refused to invent an intent, while native Build demand already caused the same Steel allocation. No timing claim is made from the instrumented runner; its work-tick count is the comparable work measure here.

B’s ordered Research sequence includes Steel Containers, then the existing progression actions, then Industrialization. C purchases Steel Containers earlier but diverts all Smelters to Steel and does not reach Industrialization during the horizon. This is a strategic regression relative to B for the selected progression metric, despite its much larger Steel stock.

## Generality and verification limits

Synthetic contract tests exercise changed native costs, a different producer resource (Iron), race-style producer unavailability, a capacity-changing cost modifier, explicit owner disablement, unaffordable fuel, existing commitments, unknown demand, stale root/progression/offer/price/settings/production evidence, incomplete prerequisite evidence, and unavailable producer capability. They verify contract behavior only; there is no second live race or challenge replay, so this stage makes no universal adaptability claim.

Focused planner and experiment tests passed. The exact Chromium runner contracts passed determinism, isolation, reload continuity, pause, and cleanup. Stage 3M accepted 200/1,000-period checkpoints remain the same inputs and intervention; Stage 3P Power freshness tests remain part of the full suite. Full repository check/build results are recorded in the dated progress log for this stage.

## Recommendation

Do not integrate goal-directed execution into the release production runtime, and do not change the default Smelter policy. The smallest future opt-in design would be an explicit setting that lets an already-enabled owner accept only a current, locally verified mandatory intent through its native planner, after the prerequisite classifier can resolve or safely exclude the current alternative grants. The present fixture does not provide that evidence and does not justify activating the option.
