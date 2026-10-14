# Stage 3W — Titanium bootstrap and progression recovery

## Result

The save has a native Titanium import pathway before Hunter Process: a Market trade route. The Human-in-Magic save has `no_trade`, which removes direct Market buy/sell controls and makes their direct methods no-op. It does not remove the native import-route control. With `autoMarket`, `buyTitanium`, and Titanium route imports enabled, the existing Market automation still assigns zero routes because it rejects the import on projected Money flow. A one-time test-only assignment through the real native route control acquired Titanium and led to Hunter Process, High Tech 4, and the Factory by p20,000. This is a narrow strategy gap under this fixture, not a missing game channel or broken native control. No release behavior changed.

## Pinned inputs and integrity

| Input                              | Value                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Repository branch / starting HEAD  | `deadspace` / `6b33fd392d8ddcd54c9718afe550b8a56bc1a509`                                                                |
| Upstream checkout / commit         | `D:/work/Evolve-DeadSpace` / `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                 |
| Save                               | `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`                                           |
| Save SHA-256                       | `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`                                                      |
| Settings                           | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`; scenario B adds `autoSmelter: true` |
| Settings SHA-256                   | `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`                                                      |
| Seed / epoch / Gather intervention | `42` / `2026-09-21T00:00:00.000Z` / `resourceClaimMode: "goal-derived-conjunctive"`                                     |
| Game snapshot                      | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`   |
| Execution                          | Exact `tools/chromium-evolve-runner.mjs`, fresh Chromium context per comparison                                         |

The save, pinned snapshot, epoch, seed, and Gather intervention were held constant. A is the Stage 3V scenario B setting. B changes only the existing Market permissions to enabled. C starts from B and invokes the current native Titanium import-route control once at p8000. No resource, technology, price, queue, or game-build value was injected or edited.

## Native bootstrap chain and other acquisition channels

- **Industrialization reveals Titanium.** Its native action sets `resource.Titanium.display = true` and initializes the Factory. It does not grant Titanium.
- **Hunter Process is the technology gate.** The offer requires High Tech 3 and Smelting 2, grants Titanium technology 1, and costs 45,000 Knowledge plus 1,000 Titanium. Its action resets Titanium's market value to the base resource value.
- **Steel smelting is later production.** `main.js` adds a Titanium byproduct only after Titanium technology is at least 1. The output is divided by 25 until Titanium technology 3, then by 10. Enabling the Steel allocation alone cannot bootstrap the first Titanium.
- **Trade-route import is the applicable native bootstrap.** The native Market row exposes `autoBuy("Titanium")` when Trade technology is present and the race is not Terrifying. Route execution buys the resource from shared Money, capped by affordability, and credits the native trade volume. `no_trade` hides direct Market purchase/sale controls but does not remove this route control or route execution.
- **Direct Market purchase** otherwise costs the resource's current value per unit, capped by Money and free capacity. It is unavailable here: this race has `no_trade`, and the native `purchase` method checks that flag. At p8000 the resource value was $745.65; the direct sell formula would quote about $46.60 per Titanium with the save's current base ratio and no Wharf, but neither direct control is available.
- **The import route's p8000 quote** uses Titanium's native trade ratio 0.25 and current value $745.65, giving about $186.41 per route before the native trade-volume bonus. The route adds `0.25 × tradeVolumeBonus()` Titanium per active route per game time unit. p8000 has 97 available routes and zero assigned. The route was affordable from held Money.
- **Combat loot is conditional, not available to this race.** Garrison loot can include Titanium for Terrifying races outside government 3, or Truepath government-3 loot. This Human save is neither Terrifying nor Truepath. Its combat tactic therefore cannot put Titanium in the loot pool.
- **Core miners and planetary sources are later routes.** Core miners produce Titanium if a Core Mine is built and staffed, but the Core Mine itself costs 14,000 Titanium (plus Money, Alloy, and Aluminium), so it is not a first-source bootstrap. Space red-mine and Tau Ceti sources require later space/colony progression absent from this save. No combat, craft, or enabled producer grants a first unit in this fixture.
- **Iron-smelting Titanium is also later production.** It is gated on Titanium technology 2, after Hunter Process. Other downstream buildings and crafts consume Titanium rather than create it.

Thus the only demonstrated, currently usable first-source path in this save is a native trade-route import. Steel smelting, iron smelting, core mining, and space production must not be described as bootstrap sources for this state.

## Exact p8000 state and permissions

The p8000 sample reproduces Stage 3V scenario B:

| Fact                                            | p8000 observation                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Race / challenge rules                          | Human in Magic; `no_trade: 1`, `no_craft: 1`; no Terrifying or Truepath loot exception                                                                                                      |
| Titanium visibility / holding / capacity / rate | Visible; 0 / 33,516; rate 0                                                                                                                                                                 |
| Titanium technology                             | 0                                                                                                                                                                                           |
| High Tech / Smelting                            | 3 / 4; Hunter Process prerequisite Smelting 2 is met                                                                                                                                        |
| Money / rate / capacity                         | $108,957.17 / rate 0 / $10,124,018 capacity                                                                                                                                                 |
| Market controls / routes                        | Market board generation 11; Titanium row binding generation 11 is current and exposes the native route control; no `market-qty` binding for a direct order. 0 Titanium routes; 97 available |
| Build target                                    | `city-factory`: Money 25,000, Cement 800, Steel 7,500, Titanium 2,500                                                                                                                       |
| Current queues                                  | Research queue empty; Build queue empty                                                                                                                                                     |
| Hunter Process                                  | Current offer price Knowledge 45,000 + Titanium 1,000; not affordable because Titanium is zero (Knowledge is also below price at 19,369.52)                                                 |
| Other current income/commitments                | No Research offer purchase in queue. Factory is the active Build saving target; held Money already exceeds its 25,000 request.                                                              |

The demand capture showed `Titanium requested: 2,500`, `Titanium demanded: true`, and the `city-factory` saving target. Money requested was 25,000 but Money was not demanded because held cash exceeded it. Demand therefore reaches the Market route planner; the gap is not a lost Factory request. Ordinary Research demand only requests offers that are already affordable, so Hunter Process itself did not generate the initial Titanium request. The Build target independently did.

## Market owner and the first blocker

At p8000 in A, `autoMarket` is false and direct `buyTitanium` is false. The Stage 3V settings file also has `res_trade_buy_Titanium: true` and `res_buy_r_Titanium: 0.5`; the effective `autoMarket` default is false. A does not activate a disabled owner.

B explicitly enables the existing `autoMarket` and `buyTitanium` permissions while preserving the route-buy permission. Captured Market evidence shows the Titanium row/control generation is current and includes native route methods such as `autoBuy`; there is no native quantity binding for the direct buy/sell widget. Direct Market purchase is independently refused by the race's `no_trade` check. The Market application still calls route adjustment before its direct-Market `noTrade` early return, so the route planner can use the native import control.

The captured demand adapter passes `demand.isDemanded(resourceId)` to the trade-route planner. Demanded Titanium receives top priority. The planner nevertheless rejects allocating the route because Money's sampled rate at p8000 is zero: even with Money itself not demanded, the planner will not allow projected Money rate to fall below zero; with the configured minimum floor it also cannot meet the $500/s target. One native route costs about $186.41 per game time unit, so the planner treats the import as a negative-flow route. It does not use available Money stock or the bounded $25,000 Factory cash commitment as a runway calculation.

The first blocker is therefore **selection by the enabled route planner**, after a real native route exists and demand is correctly captured. It is not lack of Titanium visibility, storage, current cash, route capacity, row freshness, or Build demand. The configured direct Market path cannot help this race. In the requested categories, A is an owner-disabled configuration; B is an owner-enabled, demand-present purchase suppressed by route economics. C demonstrates a beneficial route in this bounded horizon, with an opportunity cost that must be considered before generalizing.

## Controlled progression comparison

| Checkpoint | A: Stage 3V settings                                                       | B: permissions enabled                                                                                              | C: B plus one native import route at p8000                                                                           |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| p8000      | 0 Ti / cap 33,516; no route; $108,957.17; High Tech 3; Knowledge 19,369.52 | Same state; settings `autoMarket=true`, `buyTitanium=true`, `res_trade_buy_Titanium=true`; planner assigns no route | Same starting state before the native route-control intervention                                                     |
| p8001      | —                                                                          | —                                                                                                                   | First native Titanium: 0.25838; route 1                                                                              |
| p12000     | Not run                                                                    | 0 Ti, routes 0, Money $45,031.19; High Tech 3, Explosives 3, Oil 3                                                  | 283.53 Ti; Money $339,025.81; High Tech 3, Explosives 3, Oil 2                                                       |
| p16000     | Not run                                                                    | 0 Ti, routes 0, Money $148,099.47; High Tech 3, Smelting 5, Oil 3, Wharf 1                                          | 817.06 Ti; Money $115,308.47; High Tech 3, Smelting 5, Oil 3; Hunter Process not yet reflected in sampled technology |
| p20000     | Not run                                                                    | 0 Ti, routes 0, Money $137,406.03, Knowledge 51,231; High Tech 3; Factory 0                                         | 6,554.96 Ti, routes 1, Money $59,176.51, Knowledge 52,731; Titanium tech 1, High Tech 4, Factory 1                   |

C's Hunter Process purchase occurred between p16000 and p20000. Its exact purchase period was not frozen by the p4,000 checkpoint schedule. Titanium holdings rose by 5,737.90 between p16000 and p20000 after Titanium technology became 1; the native Steel byproduct is the applicable positive production source in this save. The sampled p20000 `diff` is 0, so the report does not infer a first-positive-rate period from that field. C had no observed Oil Wells (`oil_well`) technology grant, ANFO technology grant, or MAD grant by p20000. The separate Oil technology reached 3 in B by p12000 and in C by p16000; B did not reach High Tech 4 or the next measured MAD milestone. B's money remained higher than C's by about $78,230 at p20000, while C had paid the prerequisite and built the Factory with about $59,177 cash remaining. This is a real opportunity cost, not a free gain. The exact runner did not emit comparable per-period performance metrics for A/B/C, so no runtime-overhead difference is claimed; B reported 2,500 work ticks across its replay.

The explicit native `autoBuy("Titanium")` call returned successfully through the current captured row control; it did not throw. B's repeated tooltip quote calls (`aBuy`/`aSell`) also did not throw and did not assign routes. Both B and C reported three runner error-count events; their messages were not captured in this comparison, so they are not attributed to Market or treated as evidence of a failed native control. The runner recorded no thrown Market control calls. The first native route import itself is proven by the p8001 stock increase and the native route count.

### Channel and state classification

| Category                              | Finding                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — native method unavailable         | Direct Market buy/sell are unavailable/refused by `no_trade`; trade-route import remains available.                                                            |
| B — owner disabled                    | A has effective `autoMarket: false`; its unchanged configuration cannot run the owner.                                                                         |
| C — enabled but suppressed            | In B the Market owner and Titanium route permission are enabled, Build demand is visible, yet the planner selects zero routes under its Money-flow check.      |
| D — affordability/storage/competition | Not the first blocker: B has $108,957 against $25,000 reserved for Factory, 33,516 Titanium capacity, 97 route slots, and an affordable ~$186.41 route charge. |
| E — execution refused                 | Not demonstrated for import. The tested native route-control call succeeded; direct `purchase` is refused by native `no_trade`.                                |
| F — not strategically selected        | Confirmed in B. One test-only route in C progressed to Hunter Process and Factory by p20,000, at a measurable cash opportunity cost.                           |

## Decision and next slice

Classification: **B — a narrow strategy gap is demonstrated for this fixture**, not an absent native channel or an adapter/control defect. Enabling existing Market settings alone does not recover progression. A goal-demanded resource can be affordable to import while the current route-flow guard declines it because it looks only at marginal Money rate/floor, not available cash runway and the existing saving target. The controlled C route preserves the Factory's $25,000 Money requirement and reaches the next High Tech/Factory milestones, while finishing with less cash. The evidence justifies a bounded future experiment, not a release-time Titanium rule or an automatic settings default.

Smallest justified next implementation: a test-surface-only, resource-agnostic evaluation of **one** currently demanded native import route against the current route plan. It should read the fresh native row and quote, explicit route-buy permission, desired resource shortfall/capacity, available route slots, Money stock and native cost, and current protected spending target. Keep the current native route control as executor. Compare milestone progress, cash remaining, competing output, and starvation risk against this B baseline. Do not change global reservation semantics or change Market defaults in this stage.

Generalizable pattern: a future technology can require a resource whose ordinary producer is unlocked by that technology. The first source may be another native acquisition mechanism, while the normal producer is circularly gated. Automation should discover the current native prerequisite and source from observations, then coordinate the existing acquisition owner with current permissions, price, affordability, capacity, and spending commitments. The evidence supports investigating that coordination pattern; it does not justify a general strategy framework or literal Hunter Process/Titanium logic.

## Verification and artifacts

Both exact replay runs used fresh sessions and the pinned inputs above. C used the game's real import-route control; no save state or technology was directly written. Experiment-only hook wiring was removed before finalization and is absent from release execution. No production policy or generated bundle behavior changed.

Verification recorded for this handover: exact A p8000 reproduction from Stage 3V; B with enabled Market settings to p20000; C with one native route intervention to p20000; focused Chromium runner contracts; repository checks and build; generated-bundle hook scan; and `git diff --check`. The bounded comparison includes a single starting intervention and checkpoints at p8000, 12000, 16000, and 20000; it does not establish long-horizon MAD completion or prove that importing is optimal across other saves.
