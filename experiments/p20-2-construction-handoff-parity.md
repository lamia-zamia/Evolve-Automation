# P20.2 Construction handoff parity

## Disposition

**Outcome B.** P19 parity is restored. The corrected generic Construction allocator can make authorized material clicks, but it does not add useful overall progression on the pinned Human fixture. Retire this experimental allocation path rather than promoting it.

## Gather attribution correction

The defect reproduced through the captured Gather adapter: with an active Farm target priced at 20 Lumber and 10 Stone, an Emergency Food operation planned before Lumber and Stone was charged to the Construction handoff and reached the Construction callback. The cause was target-wide executor accounting: it treated every Gather operation as Construction work whenever a target existed.

Construction operations now carry per-operation provenance for the validated target, material, positive shortage, target control generation, and Gather control generation. The executor applies Construction freshness, price, control, Mana, budget, and callback rules only to those operations. Emergency Food remains independent. Target stock must increase after each successful native invocation before the handoff or allocation click is reported; no-op and failed controls cannot count as acquired material.

The captured adapter regressions retain the synthetic Shed scenario and now include the observed Farm boundary at its native price of 20 Lumber / 10 Stone. The Farm case plans emergency Food before both materials, verifies Farm/resource/price/control-generation provenance, and proves Food does not spend either the remaining handoff budget or the separate dynamic allocation budget. A mutable live Farm catalog price is checked through the shared authority validator before the first click and immediately after the first verified click; both reprices stop stale work. A no-stock-change invocation earns no handoff or allocation credit. A stale Farm material operation also cannot prevent the earlier valid Food operation from executing.

## P19 parity and same-bundle comparison

Arms A, B, C, and the duplicate C replay each started from the retained P18 authentic Human fixture, the frozen settings, seed 44, and epoch `2026-09-21T00:00:00.000Z`. They used one freshly built test-surface bundle, SHA-256 `f8f9e4ecf55e4a0e00f4d1930531e9019451c709727988e9e4ea3b09865098ec`. Checkpoints were p8, p64, p72, p80, p112, p272, p1000, and p5000.

| Arm | Configuration                                                    | p5000 population / productive jobs | Construction at p5000            | Research grants by p5000                                              | Allocation material clicks |
| --- | ---------------------------------------------------------------- | ---------------------------------- | -------------------------------- | --------------------------------------------------------------------- | -------------------------: |
| A   | Accepted P19 bootstrap and handoff                               | 3 / 3 Farmers                      | 1 Farm, 3 basic housing          | 11                                                                    |                          0 |
| B   | A plus Construction observation; authorization disabled          | 3 / 3 Farmers                      | 1 Farm, 3 basic housing          | Same grants and periods as A                                          |                          0 |
| C   | Construction allocation enabled with provenance and safety gates | 1 / 1 Farmer                       | 2 Farms, 1 basic housing, 1 Shed | Same 11 grants; several mid-game grants arrive one work cycle earlier |                        140 |

Arm A reproduced P19: ten bootstrap Stone clicks at p8; five handoff Stone clicks at p64 and five at p72; Farm purchased at p72; three Farmers were productive by p1000, producing 4.332 Food against consumption of 3. At p5000 the three residents remained housed, with no starvation or deaths.

Arms A and B have identical native action traces, resource stocks, purchases, RNG calls and state, and exported-save SHA-256 at every checkpoint. The observer made extra `buildQueue.setData` price probes: 2,430 more counted native control calls through p5000. These probes did not change game actions, stocks, purchases, or RNG. The export hash for both is `f10aaf6e4e621fe0d1de976a8c2c347ac0daa2893040c57a6f9c631c9c3a5de9`.

Arm C remained equivalent to A through p72. Its first authorized material click was at p80, after the P19 handoff completed. The earliest divergence is that work cycle: C invoked `undefined-stone.action` ten times and raised Stone from 0 to 5; A made no Gather invocation. C’s duplicate replay reproduced the same checkpoint states, allocation trace, native call counts, RNG, and export hash.

By p5000, C had bought an additional Farm at p96 and a Shed at p1056. It had the same Research grants as A, with Currency, Storage, Mining, and Science arriving one 8-period work cycle earlier; later Garrison, Silo, and Banking grants matched A’s periods. C’s 140 material clicks raised capacity and stocks, but did not add Research grants. It ended with one resident and one productive Farmer, versus A’s three, and Farmer Food production of 2.364 versus 4.332. Food remained sustainable in both runs, with no starvation or deaths. The extra structures and stock did not offset the lost housing and productive jobs.

Through p5000, total counted native control calls were A 21,238, B 23,668, and C 23,622. The totals include `buildQueue.setData` price probes. A/B each made 949 RNG calls and ended at RNG state `4275315887` with identical exports. C made 936 calls and ended at `973489524`; its repeat had the same RNG state and export `cbe45bfbd939ecbd099f72f2fc3ab914eed4a860f82e95708f5ad45427c02fbd`.

## Zero-authorization diagnosis

The P20.1 injected callback referenced the Node-scoped helper `allocationDenialReason`, which was not available in the browser callback scope. This is a plausible source-level explanation for zero authorizations. The historical P20.1 trace did not directly capture a thrown exception, so the report does not treat that explanation as an observed runtime event. The P20.2 callback defines its budget checks in the injected page scope, and its first authorized Farm request occurred at p80. The runtime's callback exception path fails closed; the retained P20.1 record does not show that path firing.

Arm C also records bounded first rejection reasons at the runtime gates. The observed examples were missing or invalid publication epoch at p8, pending P19 handoff at p8 and p64, policy or budget denial after Farm repricing, non-material affordability for the Shed request at p272, and missing or invalid publication epoch for the Rock Quarry request at p1064. Freshness checks remain fail-closed. The P19 handoff is allowed to finish before dynamic authorization can replace its target.

## Final retirement decision

Outcome B remains final. Retain the bounded P19 bootstrap and Construction handoff as a successful test-only capability. Retire generic Construction allocation as an experimental direction; no production integration is authorized. Keep the P20.1 complete-price authority regressions and P20.2 Gather attribution, repricing, stock-postcondition, and handoff safety regressions. No further selector optimization or replay campaign is justified without an independent benefit case.

The observer-only Arm B overhead was 2,430 additional counted `buildQueue.setData` control calls through p5000. This is a control-call count; no renderer CPU percentage was measured from it. The missing legacy native parity fixture remains a documented limitation.

## Verification and limitations

- `npm run test -- captured-gather-resources-test construction-allocation-authority-test` passed, including the Farm attribution/repricing regressions and retained P19 ten-click handoff coverage.
- `node tools/chromium-evolve-runner-test.mjs` passed all Chromium runner contract checks.
- Same-bundle exact Chromium comparison completed through p5000, including a duplicate C replay.
- `npm run build` produced the required byte-identical production bundle SHA-256: `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`.
- Full `npm run check` passed all five stages: type checks, architecture checks, lint, formatting, and 361 test files.
- `git diff --check` passed.
- Native parity using the missing legacy fixture remains unverified. No replacement save or settings were fabricated; the accepted P19 behavior was reproduced with the retained authentic P18 fixture and frozen settings.

Compact machine-readable events and checkpoint parity are in [p20-2-construction-handoff-parity-evidence.json](./p20-2-construction-handoff-parity-evidence.json).
