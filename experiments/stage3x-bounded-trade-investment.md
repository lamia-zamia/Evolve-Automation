# Stage 3X — Bounded trade investment pilot

## Decision

**D — current observations do not establish a safe autonomous investment.** The experimental evaluator is pure and fails closed when it lacks a unique current acquisition target, a conservative native import-cost/volume bound, and a complete Money commitment/obligation sample. It does not reserve cash or write game state. The test-only Market override did not receive a candidate to execute.

The Stage 3W p8000 intervention is not reproducible with the existing enabled Market owner on the corrected DeadSpace quote contract: the live p8000 Market has all 93 available route slots occupied, so the freshness- and permission-checked test adapter refuses before invoking native Titanium `autoBuy`. The run also observes Titanium below a reported storage requirement while the Market demand flag is false. Those facts do not identify an eligible import goal.

## Reproducible replay inputs

The executable harness is [stage3x-bounded-trade-investment.mjs](stage3x-bounded-trade-investment.mjs). It runs B, C, and D in separate Chromium contexts with the exact runner, original save, seed, epoch, effective settings, Gather intervention, and pinned game snapshot. It checks the starting HEAD and the snapshot sidecar commit before running. The current replay bundle is test-only; the generated report is kept under ignored `test-artifacts/benchmark/tmp/`.

| Input                  | Value                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / starting HEAD | `deadspace` / `6bc642190a2735866f91feb9501b043d3b493c3a`                                                                                                                               |
| Upstream               | `D:/work/Evolve-DeadSpace` / `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                                                                                |
| Save                   | `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`; SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`                              |
| Settings               | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`; raw SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`                     |
| Effective settings     | Base compact JSON SHA-256 `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`; with Market overrides `7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804` |
| Effective overrides    | `autoMarket: true`, `buyTitanium: true`, `autoSmelter: true`; preserve `res_trade_buy_Titanium: true`                                                                                  |
| Seed / epoch           | `42` / `2026-09-21T00:00:00.000Z`                                                                                                                                                      |
| Gather intervention    | `resourceClaimMode: "goal-derived-conjunctive"`                                                                                                                                        |
| Snapshot               | `test-artifacts/game/evolve-deadspace.js`; SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`                                                                  |
| Scenarios              | B: existing Market owner; C: same plus one native route attempt at p8000; D: test-only evaluator on the existing Market plan                                                           |

The old Stage 3W report was made at starting HEAD `6b33fd392d8ddcd54c9718afe550b8a56bc1a509` and supplied no tracked replay harness. Its p8000 state and its claim that the Market planner had complete native quotes do not match a replay from the requested HEAD.

## Native route economics and baseline rule

Pinned `resources.js` defines `tradeRatio.Titanium` as `0.25`. The native import row computes its volume from `tradeRatio × tradeVolumeBonus()` and its current native trade price from `tradeBuyPrice(Titanium)`. The volume modifiers affect quantity; resource value and the native race, Wharf, railway, GPS, inflation, and other applicable modifiers affect price. Both can change as the game progresses. The p8000 quote in this replay is `$154.50` per route at the `aBuy` display precision and `1.033531436...` Titanium per route per native game-time unit.

Pinned `main.js` executes a positive route by charging `tradeBuyPrice(res) × routes × time_multiplier`, crediting `routes × time_multiplier × tradeRatio[res] × tradeVolumeBonus()`, and capping paid routes to available Money. The replay's native loop uses the pinned `0.25 × longRatio(20)` multiplier, or 5 native game-time units per runner period. A quote-times-assigned-routes estimate therefore describes a modelled maximum charge, not a directly observed debit: affordability can lower the paid route count, and other Money effects share the balance.

The existing pure planner is unchanged. For demanded Titanium while Money is not demanded, it lowers `minimumAllowedMoneyPerSecond` to zero. The next-import guard still requires `currentMoneyPerSecond - tradeBuyPrice >= minimumAllowedMoneyPerSecond`. Thus demand removes the configured positive Money floor but does not permit negative projected Money flow. This is the planner's source-level import gate. It was not the first live p8000 blocker in the corrected replay: Titanium demand was false and all 93 global route slots were occupied. Because the old quote reader failed before planning, Stage 3W's attribution of its zero-route state to this Money-flow gate is not verified.

Native `autoMarket` ownership and `res_trade_buy_Titanium` are explicit permissions. `no_trade` hides/refuses direct `purchase` and `sell`, but does not remove the route row's `autoBuy`/`autoSell` controls or the global route-execution loop. Route availability is the native `city.market.mtrade` capacity minus `city.market.trade`; per-resource import caps are 25 normally, 100 at Currency 4, and 1,000,000 at Currency 6. Overall route capacity also changes with native technology, buildings, traits, and progression.

## Quote capture correction

The exact runner exposed a pre-existing adapter mismatch. The pinned DeadSpace `aBuy` call rounds the volume to three decimals, rounds `tradeBuyPrice` internally to one decimal, then formats the displayed price to two decimals. The prior quote reader expected the final pair to be three and one decimals, so the adapter reported `capture-unavailable` for Steel and Titanium and the Market owner skipped route planning. The test trace counted 445 Steel and 556 Titanium native quote failures in the diagnostic run.

`captured-trade-quote.ts` now validates the pinned `aBuy` sequence and reads the displayed two-decimal answer, preserving the existing route planner. The focused captured-route test covers this native contract. With quote capture restored, Market plans and applies its existing route decisions; this changes the observed B baseline from the Stage 3W report and is not a change to the planner algorithm or Market defaults.

## p8000 native capture and Stage 3W reproducibility

The p8000 C setup capture, before attempting any route call, recorded:

| Observation                          |                                                                                        Value |
| ------------------------------------ | -------------------------------------------------------------------------------------------: |
| Native control                       | `market-Titanium`, generation 13; `autoBuy`, `autoSell`, `zero`, `aBuy`, and `aSell` present |
| Root / Market board                  |                                                               Current / current global board |
| Permissions                          |                                           `autoMarket: true`, `res_trade_buy_Titanium: true` |
| Titanium                             |                                                     44.5544 held / 33,516 capacity; 0 routes |
| Market demand quantity / demand flag |                                                                             3,373.25 / false |
| Import quote                         |                       `$154.50`, `1.033531436...` volume per route per native game-time unit |
| Money                                |                                `$92,994.89`; Market planner projected Money rate `$2,009.88` |
| Route capacity                       |                                            93 routes used / 93 maximum; zero slots available |

C captures the current native `autoBuy` identity and quote through a test-only adapter, then reports eligibility without invoking it. The native helper refuses while `routeCount === maximumRoutes`; it did not invoke or mutate a route. Before and after captures include identity, route count, quote and result. The p8001 state after the refused attempt is identical to B. C is therefore a positive-control attempt, not a successful Stage 3W route reproduction.

The historical Stage 3W manual route's persistence is explained by the old capture failure: while `readRouteInput` cannot obtain the quote, `adjust()` returns before planning or applying route operations. The route was neither deliberately preserved by a successful planner decision nor reacquired; Market adjustment was skipped. With corrected capture, the current planner is demonstrably active: at p8008 it adds 10 Titanium routes, and at p8016 it zeroes the Titanium route and reallocates to Lumber. The p8000 plan itself requests no Titanium route and instead requests removal of 3 Lumber and 3 Steel routes. Thus current automation dynamically acquires and removes routes; it does not pin the Stage 3W route. The p8000 plan is sampled before its operations are applied, which explains differences from the p8000 post-adjustment state.

## Cash safety and economic evidence

The B/C exact-runner report samples p8000, p8001, every 100 periods from p8000, and p20000. The current D-only run also samples every 100 periods from p100 through p8000. Minimum and negative counts apply to those checkpoints only and cannot rule out within-interval lows. D first observes Titanium at p4000 and the already-existing Factory at p4700. Hunter Process and High Tech 4 are absent through p20000. B/C had the Factory and Titanium present at p8000; their earlier acquisition times are not in that combined run's stored checkpoints.

The D report includes a modelled `$8,102,228` `tradeBuyPrice × Titanium route count × 5 × elapsed periods` estimate from its sampled route/quote trace. This is not a complete upper bound or an actual debit ledger: native affordability can reduce paid routes, quotes and assignments change, and other income, spending, construction, research, and progression also change Money. There is no native per-period debit ledger here that isolates recurring route charges from the full economy. At p8000 and p20000 the observed build and Research queues are empty, but the captured Market input contains no complete protected cash or ongoing obligation total; the test policy deliberately supplies those fields as unknown. No final B/C/D Money difference is treated as the pure route cost.

The runner diagnostics preserve message text and aggregate counts; the completed B/C/D report below records their classification. No error event is dismissed solely because the final replay completed.

The corrected B/C run records two error events each, with identical messages and periods. D records the same two events:

- p8: `progression skipped arpa: native A.R.P.A. capture failed: the native project registry was not observed on the Physics draw`.
- p16: `progression skipped arpa: native A.R.P.A. capture failed: the native A.R.P.A. capture already failed for this root`.

These are repeated native A.R.P.A. capture failures. They skip that automation feature and could affect A.R.P.A.-dependent progression, but no A.R.P.A. offer or purchase is observed in this comparison; the messages and counts are common to B/C/D and do not indicate a Market failure. The three-error count from the old Stage 3W report cannot be reconciled because it did not preserve messages or periods. An earlier replay attempt passed the ISO epoch string where the runner requires epoch milliseconds; it produced astrology `time itself is broken` TypeErrors and was discarded. Passing `Date.parse("2026-09-21T00:00:00.000Z")` removes those harness errors. The corrected replay's two A.R.P.A. events remain unresolved and are recorded in the feature backlog.

## Experimental evaluator and test-only execution

[stage3x-bounded-trade-investment.ts](stage3x-bounded-trade-investment.ts) is an experimental pure evaluator. It accepts the selected goal, resource holding/capacity/production/import observations, current native quote and route counts, route limits, Market and resource permissions, Money holding/flow, protected commitments, ongoing obligations, and root/board/quote/demand/control freshness. It returns the requested statuses, including `unknown-economics` and `candidate-investment`, and explicit exit conditions. It creates no reservation and mutates no state.

The test-only D callback runs after each complete Market sample. It uses a unique current native Market demand shortfall as a target proxy; this does not establish that the resource is a selected or committed downstream acquisition goal. It supplies conservative production, future price/volume bounds, full protected Money commitments, and ongoing obligation bounds as unknown, and does not credit future income as guaranteed. Consequently it abstains; it cannot turn the live route-capacity observation or a prior replay's survival into an investment budget. The only route executor is the native Market row control. Production composition is guarded by the test-surface build flag, and a bundle isolation test checks that production output has no active Stage 3X hook or policy.

Synthetic policy tests are separate from replay evidence. They cover a differently priced/volumed resource, fulfilled demand, capacity, existing imports, owner and resource permissions, no control, route capacity, insufficient Money and protected cash, negative flow with insufficient runway, positive flow without treating future income as certain, changing quotes, stale root/control, competing exports, and goal completion.

## B/C/D result and final recommendation

The combined B/C run and the later D-only run use the same save, settings, seed, numeric epoch, Gather intervention and pinned snapshot. B/C used fresh Chromium contexts, as did D. B and C are identical at every stored checkpoint from p8000 through p20000, with identical Market operation counts and two common A.R.P.A. errors. D matches B at p8000, p8001, each overlapping 100-period checkpoint, p20000, and every Market route operation count. D's evaluator therefore made no applied route operation and its full observed trajectory is the existing automation trajectory.

| Measure                                           |                                  B: baseline |            C: native route attempt | D: bounded evaluator |
| ------------------------------------------------- | -------------------------------------------: | ---------------------------------: | -------------------: |
| p8000 Money / Titanium / routes                   |        `$92,994.89` / `44.5544` / `93 of 93` | same; route attempt `not-eligible` |                 same |
| p8001 Money / Titanium routes                     |                           `$93,522.94` / `0` |       same; no native control call |                 same |
| p20000 Money / Titanium / routes                  |      `$214,908.48` / `216.1206` / `97 of 97` |                               same |                 same |
| Minimum sampled Money p8000–p20000                |                                  `$3,628.48` |                        `$3,628.48` |          `$3,628.48` |
| Negative sampled Money checkpoints                |                                          `0` |                                `0` |                  `0` |
| Money change p8000–p20000                         |                               `+$121,913.59` |                     `+$121,913.59` |       `+$121,913.59` |
| Titanium routes planned / applied over run        | `901 / 901` adds; `640` removes; `18` zeroes |                               same |                 same |
| p20000 Factory / High Tech / Hunter Process       |                             `1 / 3 / absent` |                               same |                 same |
| Market plans / applied operations / skipped plans |                         `2,500 / 27,197 / 2` |                               same |                 same |

At p8000 the captured Market planner input has projected Money flow `$2,009.88` (the selected raw Money.diff was `0` at this checkpoint) and demanded Titanium is false, so it requests no Titanium import; the p8000 planner operations are removal of 3 Lumber and 3 Steel routes. At p8008 it plans 10 Titanium routes; at p8016 it zeroes Titanium and reallocates routes to Lumber. The current baseline is therefore actively managing Titanium rather than holding a route indefinitely. The native route assignment totals remain at the global cap as other resources are reprioritized. Market route execution, not direct purchases, remains authoritative.

C captures the `market-Titanium` control, generation 13, current root and board, native quote, resource and global route caps, route count before and after, and the result. At p8000 it sees 93/93 routes and returns `not-eligible`; it never invokes `autoBuy`. This does not reproduce the historical C intervention or its progression effects. The corrected B and C trajectories are identical, so the old Stage 3W progression result is not a current positive control.

D evaluates 2,500 times. It returns `unknown-economics` 6 times, `capacity-blocked` 2,323 times, and `permission-disabled` 171 times; it returns no `candidate-investment`. Its first `unknown-economics` result (p8, Aluminium) explicitly lacks conservative production, future price and volume bounds, complete protected commitments, ongoing obligations, and current Money income/outflow/net-flow observations. The repeated capacity blocks reflect full global route capacity; permission-disabled events reflect resource-level settings. No test-only investment route was applied, no candidate-owned route was later removed, and the native controller reported no refusal or quote capture failure. B/C/D each have 27,197 applied owner operations and two plans skipped for the same `native-result-mismatch`; those skipped plans are not attributed to D.

This run does not show that an import improves meaningful progression or that cash is safe to commit. The minimum sampled Money remains positive, but it is an observed outcome of a divergent economy with no intervention in D, not a budget proof. C could not place its route; the Market planner already imported Titanium temporarily in B; and no Hunter Process or High Tech 4 milestone appeared. The correct classification is **D — current observations are insufficient for safe autonomous execution**. The missing evidence is a uniquely identified active committed acquisition target and its remaining amount, plus conservative bounded future native quote/volume and complete protected Money/ongoing spending observations over the target's acquisition runway. A saved historical cash minimum does not substitute for those inputs. This single race/save does not support cross-race or cross-challenge optimality claims.

### Next slice

Do not integrate this policy into production. First expose, at the narrow Market boundary, (1) the unique current committed acquisition target and its remaining amount, and (2) a complete native Money commitment/obligation observation with a conservative horizon, including queued construction and Research purchases. Only then can a resource-agnostic evaluator establish a budget that protects existing commitments. Keep uncertain future income at zero in the safety bound; do not infer safe runway from this one save.
