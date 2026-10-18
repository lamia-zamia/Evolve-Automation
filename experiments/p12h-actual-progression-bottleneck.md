# P12H — Actual progression bottleneck

## Decision

**A — Binding constraint established**

The last observed requirement to clear was **Knowledge**. It was below price after period 60 and sufficient by period 70; the owner selected and invoked the action at period 72. Steel had already exceeded its 250 price at sampled period 40 in both arms. This establishes the Knowledge threshold as the final resource threshold observed before the purchase; it does not establish an unobserved owner decision during periods 70–72.

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

| Period | Offer generation / observation | Priced resource stock / price (capacity; net rate)                                                     | Permission; eligibility; queue |
| -----: | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
|     20 | 3 / research-offers-3          | Knowledge 4229.04/9000 (cap 20806; net 415.75/period); Steel 64.94/250 (cap 33516; net 27.48/period)   | true; eligible; empty          |
|     30 | 4 / research-offers-4          | Knowledge 5268.41/9000 (cap 20806; net 415.75/period); Steel 154.24/250 (cap 33516; net 41.22/period)  | true; eligible; empty          |
|     40 | 6 / research-offers-6          | Knowledge 6307.79/9000 (cap 20806; net 415.75/period); Steel 284.76/250 (cap 33516; net 54.95/period)  | true; eligible; empty          |
|     50 | 7 / research-offers-7          | Knowledge 7347.16/9000 (cap 20806; net 415.75/period); Steel 463.36/250 (cap 33516; net 82.43/period)  | true; eligible; empty          |
|     60 | 8 / research-offers-8          | Knowledge 8386.54/9000 (cap 20806; net 415.75/period); Steel 683.18/250 (cap 33516; net 96.17/period)  | true; eligible; empty          |
|     70 | 9 / research-offers-9          | Knowledge 9425.91/9000 (cap 20806; net 415.75/period); Steel 944.21/250 (cap 33516; net 109.91/period) | true; eligible; empty          |

### Steel-oriented

| Period | Offer generation / observation | Priced resource stock / price (capacity; net rate)                                                     | Permission; eligibility; queue |
| -----: | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
|     20 | 3 / research-offers-3          | Knowledge 4229.04/9000 (cap 20806; net 415.75/period); Steel 64.94/250 (cap 33516; net 27.48/period)   | true; eligible; empty          |
|     30 | 4 / research-offers-4          | Knowledge 5268.41/9000 (cap 20806; net 415.75/period); Steel 154.24/250 (cap 33516; net 41.22/period)  | true; eligible; empty          |
|     40 | 6 / research-offers-6          | Knowledge 6307.79/9000 (cap 20806; net 415.75/period); Steel 284.76/250 (cap 33516; net 54.95/period)  | true; eligible; empty          |
|     50 | 7 / research-offers-7          | Knowledge 7347.16/9000 (cap 20806; net 415.75/period); Steel 463.36/250 (cap 33516; net 82.43/period)  | true; eligible; empty          |
|     60 | 8 / research-offers-8          | Knowledge 8386.54/9000 (cap 20806; net 415.75/period); Steel 683.18/250 (cap 33516; net 96.17/period)  | true; eligible; empty          |
|     70 | 9 / research-offers-9          | Knowledge 9425.91/9000 (cap 20806; net 415.75/period); Steel 944.21/250 (cap 33516; net 109.91/period) | true; eligible; empty          |

At the Research owner selection, baseline used offer generation 10 (observation `research-offers-10`) with price {"Knowledge":9000,"Steel":250}; Steel-oriented used generation 10 (observation `research-offers-10`) with price {"Knowledge":9000,"Steel":250}. Native affordability was **true** / **true** and recorded observed resources were {"Knowledge":{"amount":9633.787905736554,"max":20806,"rateOfChange":415.75},"Steel":{"amount":999.1641113525067,"max":33516,"rateOfChange":109.91}} / {"Knowledge":{"amount":9633.787905736554,"max":20806,"rateOfChange":415.75},"Steel":{"amount":999.1641113525067,"max":33516,"rateOfChange":109.91}}. At the owner boundary, current-catalog validity, Research permission, eligibility and queue were true, true, eligible, empty / true, true, eligible, empty. Reservation evidence was `none` / `none`; both selections were recorded as `researched` / `researched`. There was one native action invocation per arm at periods 72 / 72; two bridge trace rows represent each invocation.

## Attribution and competing commitments

- Baseline attribution: `attributed`; last observed constraint {"kind":"resource-shortage","resourceId":"Knowledge","period":70,"priorInsufficientPeriod":60,"intervalAmbiguous":false}; proven critical path {"kind":"resource-shortage","resourceId":"Knowledge","clearInterval":{"afterPeriod":60,"byPeriod":70},"decisionPeriod":72}.
- Steel-oriented attribution: `attributed`; last observed constraint {"kind":"resource-shortage","resourceId":"Knowledge","period":70,"priorInsufficientPeriod":60,"intervalAmbiguous":false}; proven critical path {"kind":"resource-shortage","resourceId":"Knowledge","clearInterval":{"afterPeriod":60,"byPeriod":70},"decisionPeriod":72}.
- Both observations preserve commitments as **unknown**. The owner’s event reports no reservation conflict for the Research selection, while the capture/replay separately records Construction Steel demand. This does not quantify all external commitments or establish that the Construction demand was unnecessary.
- The periodic cadence has the final pre-purchase resource sample at period 70 and owner selection/invocation at period 72. There is no periodic affordability/selection observation inside that two-period interval. The exact time at which the Research owner first evaluated the now-affordable action is therefore unavailable.

## Why Steel acceleration did not change timing

Steel stock exceeded the action price by period 40 in both arms, while Knowledge remained below price at period 60 and exceeded it by period 70. Over the matched horizon, the Steel-oriented arm changed Steel net rate by +0.5494 per period and Iron net rate by -0.2348 per period. Neither arm crossed the Steel threshold later than the other, and both invoked the Research action at period 72. The observed price, permission, eligibility and queue evidence match through period 70; the selection event then records the same action as natively affordable in both arms. This supports Knowledge as the final observed resource threshold, with an unresolved two-period owner scheduling interval; it does not attribute that interval to a specific scheduling policy.

## Observation cost and scope

- Capture used one same-boundary Research catalog read and one same-boundary Smelter plan read.
- Each replay uses bounded catalog reads at restore validation, the initial natural boundary, and the existing ten-period samples. It does not force a Research draw each period.
- Periodic observation adds one Research evidence read alongside the existing Smelter/sample read; the selection event comes from the existing Research owner observer. Renderer task time and observation read timings are recorded in the P12G replay artifact at `test-artifacts/benchmark/tmp/p12h-final-replay.json`.
- Matched replay parity checks pass: identical start state, equal non-Smelter native invocation ordering, equal Research draw count and the same action period in both arms. The P12G replay also records renderer task/script times (baseline 1.938s / 0.0040s; Steel-oriented 1.721s / 0.0039s).
- The diagnostic is a pure attribution over observed current offers, native resource evidence and decision events. It makes no production, claim or purchase changes.

## Reproduction

Input artifact: `test-artifacts/benchmark/tmp/p12h-final-replay.json`. The replay verifies capture contract, game/save/settings inputs, offer validity and matched arm restore evidence before this report is generated.
