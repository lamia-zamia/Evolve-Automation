# P12C — Reconcile native MAD eligibility and prerequisite graph authority

Date: 2026-10-18

Branch: `deadspace`

Starting HEAD: `1559e4accbec22cbbdf358fe1f2c72bb4c148fdf`

Pinned game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**A — Eligibility reconciled, prerequisites still incomplete.**

The P12B blocker was a classification error. `nativePrerequisiteInputsMatchGraph()` returned false whenever `graph.unavailableFacts` was nonempty, then described that failure as a contradiction. In the P12B fixture, those three facts were the unoffered MAD terminal's unevaluated native condition, route restrictions, and trait exclusions. They were missing terminal eligibility evidence, not disagreement between graph edges and native requirements.

The classifier now reports input consistency as `consistent`, `incomplete`, or `inconsistent`. Missing facts, partial definitions, and graph limits remain incomplete. Differences in action grants, requirement identities, observed levels, or candidate grant sets remain inconsistent and fail closed. Current terminal eligibility is a separate evidence value bound to the target action, graph snapshot identity, cycle, root generation, progression epoch, and native offer generations.

The pinned MAD terminal condition and static eligibility are established for this run. Prerequisite authority is not: direct MAD gates remain conditional, and the native obligation classifier and adaptive selector return no mandatory actions and no selection.

## Native MAD semantics and captured evidence

The pinned `tech-mad` declaration has direct requirements Uranium 1, Explosives 3, and High Tech 7; path restrictions `standard` and `truepath`; `not_trait` exclusions for Cataclysm, Lone Survivor, and Warlord; and a condition that excludes Sludge and Ultra Sludge and, on Truepath, requires World Control. The P12B/P12C exact runner asserts these semantics against the pinned game snapshot before running.

`readCapturedTechApplicability()` establishes the current route and the three trait exclusions from captured race/tech state. `readCapturedMadTargetCondition()` mirrors the pinned condition without invoking a native callback. The combined MAD observation is `eligible` for the current Standard-route root. The graph still retains its “not evaluated” notes; those notes are now classified as incomplete graph metadata, not contradictions. The observation is bound to the same graph snapshot and freshness tuple used by obligation classification. Missing or malformed root evidence remains `unknown`.

The tests exercise Standard eligibility, Truepath without World Control, Truepath with World Control, Sludge and Ultra Sludge, each listed trait exclusion, missing/invalid roots, stale root generations, progression epochs, offer generations, and graph snapshot identity. They also exercise valid native offers, conditional OR paths, and a graph/definition prerequisite contradiction. A current offer does not make an unoffered conditional intermediate authoritative.

## P12C prerequisite characterization

The explicit independent request captured 12 complete and valid native computed-requirement observations from 834 definitions. Eleven additional actions had missing callbacks; zero observations were invalid. The read was current at root generation `0`, progression epoch `0|39:86|22:58|49|human|magic|178|0|anarchy|1|0|0|0`, capture generation `1`, and offer binding generation `1`.

The native offer set had 13 actions. The current graph frontier was `tech-mad_science`, `tech-steel_containers`, `tech-barns`, and `tech-black_powder`. None of the direct MAD grant alternatives was currently offered.

| MAD requirement | Current / required | Candidate grant actions                                                                                                                                                                                                                                                                                                | Excluded on Standard                             | Unresolved candidates | Verified mandatory actions |
| --------------- | -----------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------: | -------------------------- |
| Uranium 1       |              0 / 1 | `tech-uranium`, `tech-uranium_storage`, `tech-uranium_ash`, `tech-breeder_reactor`                                                                                                                                                                                                                                     | none                                             |                     4 | none                       |
| Explosives 3    |              0 / 3 | `tech-anfo`, `tech-super_tnt`                                                                                                                                                                                                                                                                                          | none                                             |                     2 | none                       |
| High Tech 7     |              0 / 7 | `tech-rocketry`, `tech-surface_breach`, `tech-robotics`, `tech-lasers`, `tech-artifical_intelligence`, `tech-quantum_computing`, `tech-virtual_reality`, `tech-plasma`, `tech-shields`, `tech-ai_core`, `tech-metaphysics`, `tech-orichalcum_analysis`, `tech-cybernetics`, `tech-divinity`, `tech-virtual_reality_tp` | `tech-surface_breach`, `tech-virtual_reality_tp` |                    13 | none                       |

The remaining branches are:

- **Uranium 1:** `tech-uranium` declares High Tech 4; `tech-uranium_storage` declares Uranium 1; `tech-uranium_ash` declares Uranium 2; `tech-breeder_reactor` declares High Tech 5, Uranium 3, and Space 3. All four are unoffered and conditional/unavailable in the graph.
- **Explosives 3:** `tech-anfo` declares Explosives 2 and Oil 1; `tech-super_tnt` declares Explosives 3 and Science 23. Both are unoffered and conditional. The graph cannot prove either route viable or excluded.
- **High Tech 7:** the 13 nonexcluded alternatives are all unoffered and conditional/unavailable. Their retained requirements range from same-technology High Tech levels 6 through 18, with side requirements on some routes. The two Truepath/Ice Age-specific candidates are excluded on Standard by their native route restrictions.

The valid computed captures for `tech-lasers` and `tech-quantum_computing` agree with the pinned game: Lasers requires High Tech 8, Supercollider 1, Space 3, and Elerium 1; Quantum Computing requires High Tech 10 and Nano 1. These two observations do not settle their route viability or eliminate the other High Tech alternatives. The remaining evidence needed is current native offer/eligibility evidence or complete native prerequisite/queue-evaluation evidence for the unresolved candidates and their side branches, plus current levels and offer generations as those facts change. No action is considered mandatory merely because it lies on one declared route.

The graph reports `targetStatus: conditional`, `dependencyEvidence: partial`, and all three direct requirements as conditional. The native obligation classifier reports `unavailable`, `inputConsistency: incomplete`, no verified mandatory actions, and no resolved alternative groups. Its remaining reasons identify unresolved High Tech alternatives for Mad Science and unresolved Explosives alternatives for Black Powder. The graph-side obligation proof independently finds incomplete paths, so the adaptive evaluator returns `blocked-by-missing-native-authority` with no compared action IDs. No provisional selection is produced; resource feasibility and shared spending authority therefore remain unconsidered.

## Exact replay and production parity

The P12C exact replay reused `experiments/p12b-native-prerequisite-capture.mjs`, preserving its single explicit fresh-catalog request and adding no capture path. It used the established Stage 2F fixture, seed `42`, epoch `2026-09-21T00:00:00.000Z`, 200 periods, pinned game commit `db38e2af831907d49aeb5348d678d8d8745d6c3f`, and immutable pre-P12A baseline commit `a69d615f09cd012caddd0235d70ce036ea1dda53`. The baseline bundle SHA-256 was `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7`; the current candidate bundle SHA-256 was `42847ac3cf56c6fa065bbefa9c8f9debd7a9939d7c3fe87f7ce5bbab932916bc`.

The P12A replay used the same Stage 2F save (SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`) and immutable baseline. It reproduced the 0-capture ordinary observation mode and blocked selector. The explicit P12C read was performed once in its separate diagnostic evaluation; the capture request is cleared in `finally`, even when the read throws.

Ordinary production parity was asserted separately from diagnostic capture:

- Baseline and candidate exported save SHA-256 both equal `9b4a3e7364571db6c6fc858e743ee3610dde162a921132641f1d17c155e7ec67`.
- Native control usage, ordered native invocation sequence, and Research draw counts match exactly. Each ordinary run made 30 `research-catalog` draws and 30 Research observation samples.
- The diagnostic capture made no Research action invocation, configured no Gather intervention, and introduced no reservation or resource claim. The capture property is absent from the ordinary production bundle.

The Stage 2F graph and obligation result was current at the recorded root, epoch, and offer generations. P12A, P12B, and P12C exact runner replays completed; the Chromium runner contracts passed.

## Verification

- Focused prerequisite-obligation, goal-candidate, and captured-applicability tests passed.
- `npm run build` passed.
- `npm run check` passed all 348 test files and bundle syntax.
- `node tools/chromium-evolve-runner-test.mjs` passed callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- P12A, P12B, and P12C exact replays passed their parity and read-only assertions.
- `git diff --check` passed.

No Research purchases, Gather intervention, reservations, resource claims, autonomous spending, or shared claim enforcement were enabled.
