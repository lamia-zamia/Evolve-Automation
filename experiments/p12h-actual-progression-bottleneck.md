# P12H — Actual progression bottleneck

## Decision

**A — Cached affordability explains the discrepancy**

The period-70 replay sample paired a cached generation 9 false verdict with later resource holdings of Knowledge 9425.91, Steel 944.21. In an isolated replay from the same verified capture and settings, a protected fresh draw at period 70 kept root generation 0, progression epoch, action identity and native price unchanged. The fresh generation 10 verdict was true against the current stock. The apparent contradiction is therefore explained by cached affordability evidence being joined to newer holdings; generation-9 draw-time holdings were not recorded, so they are not inferred. Knowledge was the last resource threshold to clear: it was below 9,000 at period 60 and at or above 9,000 by period 70. Steel had already cleared its 250 threshold by period 40. The ordinary paired replay selected and invoked Research at period 72, consistent with the observed stock accumulation and subsequent owner selection. This establishes the final resource threshold, not the entire terminal MAD critical path.

## Replay provenance

- Verified capture contract: v1; capture period 1784.
- Upstream: `db38e2af831907d49aeb5348d678d8d8745d6c3f`; game snapshot SHA256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Starting save SHA256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`; settings SHA256 `3a8bf71d16dd5347f151bfbb67b7f8db786e95b6746f16b8d24d9c2a605e1132`.
- Seed 42; epoch 2026-09-21T00:00:00.000Z; capture export SHA256 `db69d2de864b1344998ec291c457d168b5fa699a8d4edadd2d14a67ec9c3da27`.
- Observation identity: `p12g-smelter-1784-db69d2de864b1344998ec291c457d168b5fa699a8d4edadd2d14a67ec9c3da27`; Smelter observation: `p12g-smelter-1784-db69d2de864b1344998ec291c457d168b5fa699a8d4edadd2d14a67ec9c3da27`.
- Action: `tech-steel_containers`; price: {"Knowledge":9000,"Steel":250}.
- Current capture demand: {"period":1784,"observationIdentity":"p12g-smelter-1784-db69d2de864b1344998ec291c457d168b5fa699a8d4edadd2d14a67ec9c3da27","value":{"requestedSteel":1000,"isSteelDemanded":true,"savingTarget":{"name":"city-coal_power","cost":{"Money":10000,"Crystal":125,"Copper":800,"Cement":480,"Steel":1000}}},"source":"readSmelterDemandForTest in Smelter observation callback"}. Replay demand was checked against the restored native state in each arm.

## Matched resource and Research observations

Each resource row is a periodic sample. The invocation is a separate native event at period 72 in baseline and 72 in the Steel-oriented arm. The bridge emits two trace rows for that same native action call.

### Baseline

| Period | Offer generation / observation | Priced resource stock / price (capacity; net rate)                                                     | Native affordable; permission; eligibility; queue |
| -----: | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
|     20 | 3 / research-offers-3          | Knowledge 4229.04/9000 (cap 20806; net 415.75/period); Steel 64.94/250 (cap 33516; net 27.48/period)   | false; true; eligible; empty                      |
|     30 | 4 / research-offers-4          | Knowledge 5268.41/9000 (cap 20806; net 415.75/period); Steel 154.24/250 (cap 33516; net 41.22/period)  | false; true; eligible; empty                      |
|     40 | 6 / research-offers-6          | Knowledge 6307.79/9000 (cap 20806; net 415.75/period); Steel 284.76/250 (cap 33516; net 54.95/period)  | false; true; eligible; empty                      |
|     50 | 7 / research-offers-7          | Knowledge 7347.16/9000 (cap 20806; net 415.75/period); Steel 463.36/250 (cap 33516; net 82.43/period)  | false; true; eligible; empty                      |
|     60 | 8 / research-offers-8          | Knowledge 8386.54/9000 (cap 20806; net 415.75/period); Steel 683.18/250 (cap 33516; net 96.17/period)  | false; true; eligible; empty                      |
|     70 | 9 / research-offers-9          | Knowledge 9425.91/9000 (cap 20806; net 415.75/period); Steel 944.21/250 (cap 33516; net 109.91/period) | false; true; eligible; empty                      |

### Steel-oriented

| Period | Offer generation / observation | Priced resource stock / price (capacity; net rate)                                                     | Native affordable; permission; eligibility; queue |
| -----: | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
|     20 | 3 / research-offers-3          | Knowledge 4229.04/9000 (cap 20806; net 415.75/period); Steel 64.94/250 (cap 33516; net 27.48/period)   | false; true; eligible; empty                      |
|     30 | 4 / research-offers-4          | Knowledge 5268.41/9000 (cap 20806; net 415.75/period); Steel 154.24/250 (cap 33516; net 41.22/period)  | false; true; eligible; empty                      |
|     40 | 6 / research-offers-6          | Knowledge 6307.79/9000 (cap 20806; net 415.75/period); Steel 284.76/250 (cap 33516; net 54.95/period)  | false; true; eligible; empty                      |
|     50 | 7 / research-offers-7          | Knowledge 7347.16/9000 (cap 20806; net 415.75/period); Steel 463.36/250 (cap 33516; net 82.43/period)  | false; true; eligible; empty                      |
|     60 | 8 / research-offers-8          | Knowledge 8386.54/9000 (cap 20806; net 415.75/period); Steel 683.18/250 (cap 33516; net 96.17/period)  | false; true; eligible; empty                      |
|     70 | 9 / research-offers-9          | Knowledge 9425.91/9000 (cap 20806; net 415.75/period); Steel 944.21/250 (cap 33516; net 109.91/period) | false; true; eligible; empty                      |

At the Research owner selection, baseline used offer generation 10 (observation `research-offers-10`) with price {"Knowledge":9000,"Steel":250}; Steel-oriented used generation 10 (observation `research-offers-10`) with price {"Knowledge":9000,"Steel":250}. Native affordability was **true** / **true** and recorded observed resources were {"Knowledge":{"amount":9633.787905736554,"max":20806,"rateOfChange":415.75},"Steel":{"amount":999.1641113525067,"max":33516,"rateOfChange":109.91}} / {"Knowledge":{"amount":9633.787905736554,"max":20806,"rateOfChange":415.75},"Steel":{"amount":999.1641113525067,"max":33516,"rateOfChange":109.91}}. At the owner boundary, current-catalog validity, Research permission, eligibility and queue were true, true, eligible, empty / true, true, eligible, empty. Reservation evidence was `none` / `none`; both selections were recorded as `researched` / `researched`. There was one native action invocation per arm at periods 72 / 72; two bridge trace rows represent each invocation.

### What each freshness signal means

- **Timeline periods:** periods in the tables are when the cached offer and current resources were read. The offer observation ID, generation, native price and verdict originated at a native Research draw. For generations 3–9, the exact render period and draw-time holdings are not present in the replay. Generation 10 was directly redrawn and observed at period 70 in the isolated diagnostic; its draw-boundary stock was Knowledge 9425.912794218431 and Steel 944.209854479947.
- **Offer binding freshness:** generation 9 matched the current target control at the cached read, and generation 10 matched after redraw. This establishes which control is callable. It does not establish when the row's affordability class was computed.
- **Root/progression freshness:** both diagnostic reads used root generation 0 and progression epoch `0|45:105|22:58|51|human|magic|178|0|anarchy|1|0|0|0`. Those stayed current across the draw.
- **Affordability calculation time:** pinned `drawTech()` calls `setAction()`; `setAction()` assigns `cna` from `checkAffordable(c_action, false, ...)`, which evaluates `adjustCosts()` and `checkCosts()` against the then-current supply pool. The captured `nativeAffordable` field is read from that rendered row's same-draw `cna` verdict. The row keeps that verdict until the next native draw. The cached generation-9 draw timestamp and its draw-time holdings were not recorded.
- **Current resource sample time:** `readCurrentOfferedTechs()` returns the held offer after checking progression epoch and binding generations. `readCurrentResearchCatalog()` joins those offers to a separate read of the current root's resources. A current binding and current root therefore do not make the cached `cna` verdict contemporaneous with those newer holdings.

The isolated period-70 diagnostic read cached generation 9 as false, then made exactly one protected fresh native draw. It produced offer observation `research-offers-10`, generation 10, at the same price and same root/progression, with `nativeAffordable=true`. The diagnostic stock sample was unchanged before and after the draw; the saved-state SHA-256 was unchanged. The draw rebound the Research offer controls from generation 9 to 10. This resolves the apparent contradiction without claiming generation 9's draw-time holdings.

## Attribution and competing commitments

- Baseline attribution: `attributed`; last observed constraint {"kind":"resource-shortage","resourceId":"Knowledge","period":70,"priorInsufficientPeriod":60,"intervalAmbiguous":false}; last observed resource threshold {"kind":"resource-shortage","resourceId":"Knowledge","clearInterval":{"afterPeriod":60,"byPeriod":70},"decisionPeriod":72}.
- Steel-oriented attribution: `attributed`; last observed constraint {"kind":"resource-shortage","resourceId":"Knowledge","period":70,"priorInsufficientPeriod":60,"intervalAmbiguous":false}; last observed resource threshold {"kind":"resource-shortage","resourceId":"Knowledge","clearInterval":{"afterPeriod":60,"byPeriod":70},"decisionPeriod":72}.
- Last observed non-resource constraint: baseline {"kind":"stale-affordability-evidence","firstObservedPeriod":70,"clearedByPeriod":72,"intervalAmbiguous":true}; Steel-oriented {"kind":"stale-affordability-evidence","firstObservedPeriod":70,"clearedByPeriod":72,"intervalAmbiguous":true}.
- Both observations preserve commitments as **unknown**. The owner’s event reports no reservation conflict for the Research selection, while the capture/replay separately records Construction Steel demand. This does not quantify all external commitments or establish that the Construction demand was unnecessary.
- The periodic replay has its final pre-purchase sample at period 70 and owner selection/invocation at period 72. The action is selected two periods after the stock threshold is observed clear. The exact draw-time stock for generation 9 and exact first evaluation time are unavailable; a current protected draw at period 70 shows that no additional native gate is needed to explain the verdict change.

## Why Steel acceleration did not change timing

Steel stock exceeded the action price by period 40 in both arms. The arms had identical sampled Steel stocks and net rates through the period 72 purchase boundary; the Steel-oriented arm’s higher later Steel stock appears only after the Research action was already purchased. At period 70 the cached generation-9 verdict was false even though the later stock sample exceeded both prices. A current generation-10 draw at the same state returned true, while both paired replay arms selected and purchased at period 72. Steel had cleared by period 40; Knowledge was below 9,000 at period 60 and above it by period 70. The interval **(60, 70]** is the final observed resource-threshold interval. This establishes the Knowledge threshold as the last priced resource to clear, not the full terminal MAD critical path.

## Observation cost and scope

- Capture used one same-boundary Research catalog read and one same-boundary Smelter plan read.
- Each ordinary replay uses bounded catalog reads at restore validation, the initial natural boundary, and the existing ten-period samples. The separate isolated diagnostic used one additional protected Research draw only.
- Periodic observation adds one Research evidence read alongside the existing Smelter/sample read; the selection event comes from the existing Research owner observer. Renderer task time and observation read timings are recorded in the P12G replay artifact at `test-artifacts/benchmark/tmp/p12i-p12g-replay.json`.
- Matched replay parity checks pass: identical start state, equal non-Smelter native invocation ordering, equal Research draw count and the same action period in both arms. The P12G replay also records renderer task/script times (baseline 1.546s / 0.0031s; Steel-oriented 1.514s / 0.0026s).
- The single diagnostic draw created one new Research offer observation across 15 offers and rebound 15 offer controls (generation 9 to 10), left the saved economic state and sampled resources unchanged, and added 0.075 s renderer TaskDuration and 0.000046 s ScriptDuration in this runner measurement. It made no Research purchase, production change, claim, reservation or job change. Ordinary Research behavior and draw frequency are unchanged.

## Reproduction

Input artifact: `test-artifacts/benchmark/tmp/p12i-p12g-replay.json`. The replay verifies capture contract, game/save/settings inputs, offer validity and matched arm restore evidence before this report is generated.
