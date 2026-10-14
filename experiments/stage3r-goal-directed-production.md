# Stage 3R — goal-directed resource production

## Result

The Stage 3Q replay stalls because its effective settings explicitly disable `autoSmelter`; the captured `iSmelter` control is never discovered and no Smelter decision executes. The proposed Research circularity is not the cause in the enabled-Smelter replay. At the first Steel allocation, a separate automatic build commitment (`city-coal_power`) requests 1,000 Steel. The Smelter planner sees that commitment, assigns one smelter to Steel, and Steel Containers is then purchased from its native offer.

This demonstrates that an unrelated commitment can bridge progression into production. It does not prove every route has such a commitment, and it does not authorize overriding `autoSmelter`. No Steel-specific runtime fix or production activation was made.

## Inputs and integrity

The three exact-runner sessions used the same Stage 3Q save, seed, game snapshot, epoch, and Stage 3M Gather intervention. Each started from a fresh session. B changes only `autoSmelter`; C changes `autoSmelter` and the existing `productionSmelting` policy.

| Input                    | Value                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Save                     | `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`                                         |
| Save SHA-256             | `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`                                                    |
| Settings                 | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`; effective `autoResearch: true`    |
| Settings SHA-256         | `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`                                                    |
| Seed / epoch             | `42` / `2026-09-21T00:00:00.000Z`                                                                                     |
| Game snapshot            | `test-artifacts/game/evolve-deadspace.js`; SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553` |
| Upstream                 | `D:/work/Evolve-DeadSpace` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                              |
| Gather test intervention | `resourceClaimMode: "goal-derived-conjunctive"`                                                                       |

The source settings explicitly set `autoSmelter: false`, and the domain default is also false. The earlier Stage 3Q report incorrectly described the fixture key as absent; that statement has been corrected. No native Research target, technology grant, or resource stock was injected.

## Stage 3Q checkpoint and production evidence

The original-settings checkpoint at period 1,000 has these holdings, capacities, and live game `resource.*.diff` samples:

| Resource |  Holding / capacity | Live `diff` sample |
| -------- | ------------------: | -----------------: |
| Iron     | 81,482.50 / 370,625 |              61.98 |
| Steel    |         10 / 33,516 |                  0 |
| Coal     | 24,616.30 / 222,364 |              14.46 |
| Titanium |              0 / 52 |                  0 |

`resource.*.diff` is the upstream value read at the last script cycle, not the serialized `resource.rate` field (which is 1) and not a long-run average. The Steel cap is ample for the 250 Steel native price.

At that checkpoint the smelter has 14 units of capacity: Wood fuel 14, Coal/Oil fuel 0, Iron allocation 14, Steel allocation 0. Captured demand reports `requestedQuantity("Steel") === 0` and `isDemanded("Steel") === false`. The currently sampled saving target is `city-hospital`, which has no Steel cost. The native Steel Containers offer is present at 9,000 Knowledge plus 250 Steel and is unaffordable. The exact captured `iSmelter` control handle is unavailable, with no callable methods. Because permission is false, the runtime does not run the owner or discover this control; its live planner input and decision are therefore unavailable, not a physical “cannot produce” result.

The 1,000 period enabled run shows why the hypothesis is route- and cycle-dependent. Immediately before the Smelter command at period 1,000, its captured sample is different from the post-cycle checkpoint: `city-coal_power` is the current saving target and costs 1,000 Steel. The planner input has Steel demanded, `requestedQuantity("Steel") === 1,000`, Iron allocation 14, Steel allocation 0, and policy `productionSmelting: "required"`. Coal and Iron rates are 10.96 and 61.98; the live holdings are 23,757.13 Coal and 83,021.25 Iron. The captured `iSmelter` handle is available and includes `addMetal` and `subMetal`. `planSmelter` emits Steel `+1`. After this action the target changes; the period 1,000 post-cycle sample reads Steel demand 0 and the current decision is Steel delta 0, because the allocation is already 1.

The planner event reports the exact source of that 1,000 Steel request: the selected `city-coal_power` build saving target. It is not a Research request. In the original-settings A run, that Coal Power target appears later (first observed at period 1,888) and requests 1,000 Steel, while Steel remains 10 and Smelter remains disabled. The Research queues and triggers are empty; unaffordable Steel Containers is not itself contributing to the request.

### Distinguishing the three causes

- **Permission:** A leaves `autoSmelter` false, so the owner is skipped. This is the direct cause of no autonomous Steel allocation in A.
- **Demand:** A has no Steel demand at the period 1,000 checkpoint, but later the build-saving target requests 1,000 Steel. B has that build target at the pre-execution decision that allocates Steel. The demand is incidental to the Coal Power commitment.
- **Physical production:** B proves that one current Steel allocation is feasible with the observed Coal fuel, Coal rate, Iron rate, and Steel capacity. A’s zero output does not prove infeasibility.

## Controlled settings outcomes through period 4,000

| Scenario                                              |                     Steel allocation |       First positive Steel | 250 Steel / Containers                                     | Industrialization | Period 4,000 progression                                 |
| ----------------------------------------------------- | -----------------------------------: | -------------------------: | ---------------------------------------------------------- | ----------------: | -------------------------------------------------------- |
| A. Original settings                                  |                  Never; 0 throughout |                      Never | Never / never                                              |             Never | High Tech 2, Explosives 2, Uranium 0                     |
| B. `autoSmelter: true` only                           |               Period 1,000; first +1 | Period 1,008; `diff` 13.92 | Reaches 250 during periods 1,064–1,072; purchased at 1,072 |      Period 3,600 | High Tech 3, Explosives 2, Uranium 0                     |
| C. `autoSmelter: true`, `productionSmelting: "steel"` | First Steel allocation by period 100 |     Positive by period 100 | Above 250 and purchased by period 100                      |      Not by 4,000 | High Tech 2, Explosives 2, Uranium 0; Steel Containers 2 |

“Positive Steel” in B is the first 8-period sample after allocation. At period 1,008 Steel rises from 10 to 37.84, and the live resource diff is 13.92. In C, the first 100-period sample already holds 1,678.97 Steel; the exact within-window crossing is not claimed. A never produces Steel because its owner remains disabled.

At period 1,000, resource stocks and live rate samples compare as follows:

| Scenario | Iron stock / diff | Steel stock / diff | Coal stock / diff | Smelter fuel and metal allocation |
| -------- | ----------------- | ------------------ | ----------------- | --------------------------------- |
| A        | 81,482.50 / 61.98 | 10 / 0             | 24,616.30 / 14.46 | Wood 14; Iron 14, Steel 0         |
| B        | 83,021.25 / 61.98 | 10 / 0             | 23,757.13 / 10.96 | Coal 14; Iron 13, Steel 1         |
| C        | 74,070.15 / 32.16 | 33,516 / 80.63     | 22,711.37 / 9.09  | Coal 14; Iron 9, Steel 5          |

B’s current required policy uses about 3.50 less Coal diff at this sample than A, while Iron diff matches. C’s Steel-first policy lowers Iron diff by 29.82 and Coal diff by 5.37 versus A, while driving Steel to its 33,516 cap. These are instantaneous game samples, not isolated causal rate estimates; the runs also change construction, Research, capacity, and resource spending.

At period 4,000, A still has 10 Steel, 17 Iron smelters, and 17 Wood fuel. B has 354.56 Steel, 15 Iron and 1 Steel smelter, and 16 Coal fuel. C has 113,995.77 Steel, 0 Iron and 14 Steel smelters, and 14 Coal fuel. Steel Containers expanded C’s Steel capacity to 300,768.

AutoBuild has zero Coal Power in A and one powered Coal Power in both B and C at period 4,000; all three build and Research queues are empty. This is consistent with the Steel cost on the Coal Power saving target: A cannot produce it, while B/C complete it. No runner errors were reported. The unrelated Steel-oriented C policy produces far more Steel than the 250 needed but does not reach Industrialization by period 4,000. B reaches Industrialization while preserving an Iron allocation and progresses to High Tech 3. No Explosives or Uranium milestone follows within the remaining 400 periods.

The ordered distinct native Research actions in B include Steel Containers at period 1,072 and Industrialization at period 3,600. Its earlier actions remain the same accepted progression order through Electricity and Spy Gadgets; after Steel Containers it continues through Steel Saw, Apartment, Steel Hoe, Diplomacy, Radio, Windmill, Socialist, Republic, Bessemer Process, Jackhammer, Merchandising, Zealotry, Mine Conveyor, Industrialization, Magocracy, and Steel Beams. Invocation diagnostics contain repeated calls per action; this list collapses those duplicates while preserving first occurrence.

The positive control C reaches Steel Containers earlier, then follows a different affordable-offer order (including Steel Vault, Steel Saw/Beams/Hoe, Barns, Mine Conveyor, EEBonds, Cranes, and Gantry Crane) but does not purchase Industrialization. This is a strategy trade-off, not evidence that Steel production alone is a useful universal priority.

The exact runner recorded 500 automation work ticks in each 4,000 period session. This count is not wall-clock CPU time. Stage 3R adds no production planner to the production bundle, so there is no new per-tick planning cost; the only diagnostic callbacks are gated behind the test surface.

## Why Research demand stays affordable-only

`toOfferedTechs` in `captured-resource-demand.ts` uses the current native offer price and current holdings to mark affordability. `prepareDemandPrioritization` requests ordinary Research costs only from offers marked affordable. This makes an affordable action a current spending commitment. The filter prevents every mutually exclusive, unaffordable offer from becoming a simultaneous reserve that can divert production, trade, crafting, and storage toward technologies AutoResearch has not selected and may never select.

The three quantities have different meanings:

- **Spending demand** preserves resources for current commitments such as a selected build target, queue, trigger, mission, or affordable Research action. These requests feed the existing max-combined demand model.
- **Storage demand** tells capacity planning how much room a price or future commitment needs.
- **Production intent** describes the shortfall between a selected goal’s current native price and available holdings. It must not be added to spending demand automatically.

In the Stage 3Q sample, the 250 Steel price of unaffordable Steel Containers produces no ordinary Research request. In B, the Coal Power build saving target supplies the Steel demand seen by the Smelter. The suspected circularity can occur when no other commitment requests a resource, but it did not block this fixture once the existing Smelter owner was enabled.

## Generic goal-to-resource intent prototype

Added the pure `planGoalResourceIntents` component in `src/domain/economy/production/goal-resource-intent.ts` with focused tests in `tests/domain/economy/goal-resource-intent-test.mjs`. It consumes a selected goal, a completeness-marked mandatory/alternative prerequisite frontier, current offers and native prices, holdings/capacity, current spending commitments, and explicitly observed production availability and owner permission.

For one mandatory current offer priced at 250 units, 10 held, capacity 500, and no commitments, the output is a 240-unit intent. A 40-unit concurrent spend commitment increases the target holding to 290 and the production shortfall to 280. The result never becomes a spending reservation. A disabled owner reports `permission-disabled`; missing current production or fuel can be reported as unavailable with its observed reason; capacity below the required holding reports `capacity-insufficient`; missing price or incomplete prerequisite evidence stays unavailable/partial. Alternative prerequisite paths are returned as separate options, not combined as mandatory costs.

The prototype has no technology, resource, race, route, or action-name special cases. It does not infer that a static native action has a producer. It emits diagnostics only and is not called from production composition.

The model tests cover observed-data shapes for:

- Standard production available with the owner enabled.
- Different current native prices, as would be supplied after route or challenge cost modifiers.
- An unavailable production control or capability, including an observed insufficient-fuel reason.
- Storage capacity below the goal plus commitments.
- An explicitly disabled production owner.
- Incomplete native prerequisite evidence and multiple alternative actions.

These are pure planner fixtures, not live True Path, Ice Age, or unusual-race replays. The repository had no corresponding Stage 3Q save for those routes, so this stage makes no claim that their native observations have already been captured. The algorithm can use those routes when the current native frontier, live offer price, capacity, producer capability, and permission samples are complete; otherwise it reports the unknown fact.

## Strategy estimates and limits

The exact run grounds current holdings, capacity, live `diff` samples, native prices, and whether a current captured control can act. A shortfall is therefore reportable. A time-to-goal estimate is supportable only while a representative net production rate remains positive and stable; a single instantaneous `diff` sample is insufficient when fuel, competing costs, construction, or storage saturation can change it. Capacity expansion, new production buildings, acquiring prerequisites, and waiting need separate native cost/control observations. No heuristic score or optimal strategy is claimed.

## Smallest justified next production integration

Keep this planner observational. The next integration should be a narrow adapter sample of the selected goal’s current native prerequisite frontier and authoritative offered price, joined to live resource capacity and an actually available producer control plus its explicit automation setting. Pass that immutable snapshot to the pure planner and surface the diagnostic. Preserve `autoSmelter: false` as a hard stop. Only a later, explicitly selected strategy mode may coordinate enabled production owners, and it must not enable a disabled owner implicitly.

## Verification

The focused intent planner test passed. The 4,000 period A/B/C sessions used seed 42, the pinned snapshot, and the canonical Stage 3M Gather intervention; each was deterministic in its own fresh context, with no console errors. B and C final building snapshots confirmed one powered Coal Power and empty queues. The canonical Stage 3M p200 and p1000 export hashes matched (`d683be0bf2a4ce69e407117388efdaa77ba3ca8bfafbf1f28cfbe13a8ee742cf` and `acd51350fbc0bb8a3f03138a801660bd8f6007ca8bd762f918a662d061c59def`); the full `npm run check` passed, including the existing Stage 3P Power integration coverage in `tests/integration/runtime/captured-arpa-runtime-test.mjs`. The production build, Chromium runner contract test, and `git diff --check` also passed. The only route-specific live replay was the Standard Stage 3Q save; alternate-route coverage here is synthetic planner data, not a live game replay.
