# P45 — Stock-aware Food sustainability and Weather resilience

**Decision: D — Calibration invalid.** The pinned native Food equation explains local stock transitions, but the retained P43 snapshots do not contain enough phase-level evidence to replay even the P43 B control through the pre-starvation interval. The snapshots include large Food-stock increases that are absent from the recorded Food production and consumption. Consequently, the report does not project hypothetical stock minima, exhaustion, starvation, or required reserves for the three-Farm or two-Farm cases.

This rejects P44's use of negative current flow as a starvation criterion, but it does not establish that the proposed configuration survives. P45 retains negative rates as flow evidence and requires an evidence-backed bounded horizon before classifying a deficit as buffered.

## Inputs and scope

- Automation repository starting point: `8a8aeadc` (P44 report); pinned game checkout: `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- P43 B diagnostic source: [p43-food-safe-jobs-timeline.json](p43-food-safe-jobs-timeline.json), 1,161 observations from p720 through p10000 at eight-period spacing. Source SHA-256: `6a532a6f77753018c50bdc001944e46c99e928c5b4ec196026f7b4854fd88e0f`.
- P43 B worker commitments remain unknown; the P43 diagnostic assumed no commitments. The Weather and military path is held as an exogenous diagnostic input. After the first recorded starvation, later civilian counts, Food demand, construction, capacities, worker availability, and progression can differ under a hypothetical economy.
- The model and status predicate are pure diagnostics. No production policy, saved game, P37 goal, P44 Stone predicate, Jobs assignment, purchase, native game state, or RNG behavior was changed.

## 1. Native Food stock equation and calibration

In the pinned game's ordinary fast loop, the Food tally combines Food generation and all recorded consumption, then calls `grownAt.apply('Food', time_multiplier)` once. With global supply, that applies the aggregate balance through `modRes`; with regional supply, it applies one net balance per shared pool. The ordinary multiplier is 0.25 per fast loop. Offline execution can scale it by `longRatio × offlineScale`, which P43 did not retain per interval.

For a complete **global-pool** input, the model implements the source equation:

```text
Food' = clamp(0, current Food capacity,
              Food + 0.25 × (Food production − Food consumption))
```

There is no negative-stock debt. A negative requested balance is clamped to zero and makes `grownAt.apply` report an unpaid Food balance. Excess above the current capacity is discarded. The base Food cap is 250, but the observed P43 cap is 1,000; the transition uses the capacity supplied for each step. If capacity shrinks, the current stock is clipped to the new cap. Regional mode is explicitly unavailable to this aggregate model without stock, capacity, and shortage evidence for every pool.

Food payment and starvation are separate phases. If the balance cannot be paid, the native code performs a one-in-eleven randomized check. On that check, a non-fasting citizen dies only when gross generated Food is below `consume / threshold`; the threshold starts at 1.25 and can be changed by race effects. Death changes the population and subsequent Food demand but does not refill Food. Thus stock exhaustion is not itself a death, and stock recovery cannot be inferred from starvation. The model consumes an explicitly supplied starvation result and draws no randomness.

Food stock also has writers outside the captured producer/consumer rows: actions and trades, event effects, other native phases, race effects, and direct resource operations. These can occur at phases not preserved by P43. The complete source-writer list and transition assumptions are in the JSON evidence.

### Calibration checks

| Native boundary | Model or observed result                                                                                                                                  | Assessment                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| p728 → p736     | p728 stock 158.841620, production 4.33, consumption 4.00. Eight ordinary fast loops predict +0.660000; observed change is +0.664000 (residual +0.004000). | Close local boundary check; not a full-interval replay.                         |
| p5624 → p5625   | Stock 0.718579, production 5.54, consumption 8.00. One loop predicts 0.103579; observed 0.102561 (residual −0.001018).                                    | Close one-loop check.                                                           |
| p5625 → p5626   | Stock 0.102561 with the same rates predicts a negative request, clamped to zero; observed stock is zero.                                                  | Exact exhaustion boundary match. No starvation is recorded yet.                 |
| p5626 → p5629   | Food remains zero.                                                                                                                                        | Exhaustion alone does not trigger death.                                        |
| p5630           | First observed starvation; count rises to 1 and civilians fall from 4 to 3.                                                                               | Native randomized starvation event.                                             |
| p5632           | Food is 50, consumption is 7, and civilians are 3.                                                                                                        | Stock increase is not produced by the stock-at-zero/starvation mechanics above. |

The attempted boundary-held pre-starvation control uses 613 P43 B samples from p728 to p5624. It predicts an unbounded end stock of −101.238380 (zero after clamping), while the retained endpoint is 0.718579. More decisively, p5384→p5392 begins at a negative Food rate of −0.82: the held-rate model predicts −1.64 Food across the gap, but the observed stock rises by 48.758725 to exactly 50, a +50.398725 residual. Across the retained P43 B stock points, there are 39 transitions from below 40 to exactly 50; 28 have no accompanying starvation-count or civilian-population change. P43 A independently shows zero Food and starvation at p1589, followed by stock 50 at p1592.

These are not errors that can be corrected by fitting another time multiplier. The native 0.25 factor is source-backed and matches local boundaries. The missing evidence is the intervening Food stock writes/phases, all per-fast-loop inputs, and P43's global-versus-regional pool mode. Stock projection therefore stops at calibration. An exact replay was not run: it would execute additional native ticks and RNG draws, which this task forbids, and would not restore the missing historical event inputs.

Pinned source references: [fast-loop scaling](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/main.js#L1737-L1745), [Food tally and starvation](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/main.js#L4111-L4378), [resource clamping](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/functions.js#L854-L898), [global and regional tally application](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/functions.js#L929-L976), [supply mode](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/supply.js#L12-L20), and [base Food capacity](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/resources.js#L933).

## 2. Retained Weather and P43 B exposure

All 1,161 retained Weather observations were processed in time order. There are 51 contiguous sampled-state runs and 50 observed transitions. The rows are eight periods apart, so these totals are _boundary-held exposure estimates_, not exact within-gap Weather durations. The machine timeline retains every point and interval.

The `Food flow` column sums the native P43 B boundary Food rate held to the next observed boundary for that Weather state. It is a flow integral, not a stock change; population, military demand, Food modifiers, and other economic conditions also change across the same intervals.

| Sampled Weather | Observations | Boundary-held exposure | Boundary-held P43 B Food flow |
| --------------: | -----------: | ---------------------: | ----------------------------: |
|            −30% |           66 |            528 periods |                       −411.30 |
|            −15% |           51 |            408 periods |                       −236.26 |
|           −6.5% |          193 |          1,544 periods |                       −743.66 |
|              0% |          523 |          4,184 periods |                       −667.26 |
|            +10% |          328 |          2,616 periods |                       −102.70 |
|       **Total** |    **1,161** |      **9,280 periods** |                 **−2,161.18** |

The period sequence matters. P43 B has positive flow in early 0% and +10% runs, then negative flow during some later 0% and +10% intervals as military demand and modifiers evolve. Weather alone does not identify the cause or duration of a flow interval.

Actual P43 B Food rate was negative at 791 sample points in two runs: one point at p3472, then 790 points from p3688 through p10000 (8-period spacing; 6,312-period observed span). Its minimum sampled native rate was −4.05. Holding those sampled rates to their next boundary gives −2,161.18 net Food flow and a 2,472.12 maximum rate-integral drawdown. The actual stock changed by −121.913801 from p720 to p10000, because the retained stock includes the unexplained non-flow writes above.

P43 B stock ranged from 0 to 465.943293. Its maximum observed drawdown was 465.943293 from p3680 to p5626. Exact captures show Food at zero from p5626 through p5631, starvation first at p5630, then Food at 50 at p5632. The timeline ends at 36.263819 with 14 cumulative starvation events and four civilians. There are 33 observed civilian, Garrison, and consumption transitions; Garrison rises from 0 to 4 before the first long negative-rate run, and demand rises from 4 to 8. Civilian losses and returns later change observed demand between 6–8, which is counterfactual-sensitive. The stream also records 7 research transitions and 102 production-modifier transitions. Observed `foodFormulaModifier` ranges 0.794376–1.321330; `globalProductionModifier` 0.945064–1.001007; effective other Food production 0–1.334445.

### Three-Farm / three-Farmer / one-Quarry-Worker negative-rate runs

The table shows the 15 negative-rate runs from the earliest comparison boundary, p728. `Held loss` is the P44/P45 scenario Food rate held across the observed eight-period gaps. Counts are sampled observations, not counts of consecutive native periods. Some input rows are unavailable or the fixed Jobs allocation is physically infeasible; they are excluded from the negative-flow count and remain visible in the JSON.

| Sampled interval | Negative samples | Minimum Food rate | Held-rate Food change |
| ---------------- | ---------------: | ----------------: | --------------------: |
| p4448–p4480      |                5 |            −1.733 |                −17.33 |
| p4848–p4896      |                7 |            −0.066 |                 −0.92 |
| p5488–p5624      |               18 |            −1.031 |                −26.96 |
| p5640–p5720      |               11 |            −1.043 |                −12.79 |
| p5736–p6056      |               41 |            −2.044 |                −90.01 |
| p6080–p6168      |               12 |            −0.306 |                 −7.34 |
| p6184–p6272      |               12 |            −0.307 |                 −7.34 |
| p6288–p6488      |               26 |            −0.307 |                −15.90 |
| p6504–p6696      |               25 |            −2.044 |                −95.92 |
| p6712–p6896      |               24 |            −0.470 |                −20.92 |
| p6920–p7008      |               12 |            −0.470 |                 −7.67 |
| p7024–p7336      |               40 |            −0.470 |                −25.77 |
| p7352–p7440      |               12 |            −1.708 |                 −7.56 |
| p7456–p7480      |                4 |            −1.708 |                −11.64 |
| p7664–p8040      |               48 |            −1.708 |                −83.26 |

The 3F/3F/1Q formula has 297 negative observations among 1,150 physically feasible observations, a minimum of −2.0443235116 at p5768, and a final sampled rate of +1.133346 at p10000 under +10% Weather. In the high-demand sample set, 296 of 751 eligible points are at or below the old strict +0.01 margin. This is evidence that negative flow is recurring, not that those samples represent 297 consecutive periods or that stock exhausts.

## 3. Conditional scenarios and reserves

The scenarios use the retained Weather, modifiers, and military-demand rows as exogenous input. P43's post-starvation path is not asserted as the future of an economy that prevents some or all of those deaths. Since calibration is invalid, the requested stock fields—minimum, peak reserve, cumulative stock surplus/deficit, drawdown, exhaustion count/duration, recovery, projected starvation, minimum starting reserve, and final reserve—are **unavailable** for all counterfactuals. The candidate start-stock ranges are retained below, but were not replayed.

| Scenario                                               | Food-flow diagnostic over sampled trajectory                                        | Earliest boundary and candidate initial stock                                                                                                                                                                 | Stock result                                                                                                                                                                                                                                                                               | Stone evidence                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **A. Historical P43 B**                                | Actual allocations; 791 negative flow samples, 2 runs; final rate −0.82.            | p728: actual stock 158.841620, cap 1,000. Other tested boundaries: p2000 282.308780; p4000 429.727739; p5000 79.871675; p5768 22.191940. Each candidate range was zero through that authentic boundary stock. | Native observed control: min 0, peak 465.943293, final 36.263819; stock change −121.913801 from p720; drawdown 465.943293; zero p5626–p5631; first recorded starvation p5630. These are observations, not a calibrated replay.                                                             | Historical Stone only; no counterfactual Quarry path.                                                                       |
| **B. Three Farms / three Farmers / one Quarry Worker** | 297 negative samples / 1,150 feasible; 15 runs; minimum −2.044324; final +1.133346. | Same five boundaries and authentic reserve ranges as A. p728 is the optimistic Farm-availability upper bound; later boundaries are conditional and do not imply a purchase period.                            | Unavailable under Decision D. A separate p728 boundary-held _flow-only_ integral is +2,632.16 net with a maximum drawdown of 364.40; it is not a stock or reserve requirement. At p4000, 429.73 actual Food exceeds that diagnostic drawdown, but this is not validated survival evidence. | One Quarry Worker is a formula scenario only. Hypothetical Stone production and use cannot reuse historical Stone stock.    |
| **C. Three Farms / storage-aware labor**               | Same 3F/3F/1Q primary case as B.                                                    | Same five boundaries and reserve ranges.                                                                                                                                                                      | Unavailable under Decision D. The conditional 3F/4F/0Q Food-rate sensitivity is recorded separately, but cannot be enabled because fresh Stone demand/capacity evidence is incomplete.                                                                                                     | Stone demand completeness is false at sampled boundaries; projected Stone stock after a hypothetical Quarry worker is null. |
| **D. Two Farms / four Farmers / zero Quarry Workers**  | 487 negative samples / 1,150 feasible; 18 runs; minimum −2.306468; final +0.697803. | Same five boundaries and reserve ranges.                                                                                                                                                                      | Unavailable under Decision D. At p728 the held-boundary flow diagnostic is +1,731.27 net with 579.31 maximum drawdown; neither value is a calibrated reserve threshold.                                                                                                                    | No Quarry production; future Stone supply is not evaluated.                                                                 |

The five authentic starting stocks are an upper bound on the tested starting reserve at each boundary, not proof that extra Farms could be acquired then. The optimistic p728 case assumes the Farms already exist at that first synchronized eligible sample; p2000, p4000, p5000, and p5768 are conditional observation boundaries. Farm acquisition timing is unsupported. The JSON marks the reserve sweep from zero to each boundary's actual P43 stock as **not simulated**.

The storage-aware Food-rate sensitivity illustrates the possible value and limit of moving the Quarry worker. At p5768 (−30% Weather, four civilians, demand 8), 3F/3F/1Q gives −2.044 Food per native rate unit; 3F/4F/0Q gives −1.393, still negative. At p5488 (−6.5% Weather, demand 8), the formula changes from −0.306 to +0.583. This does not validate the stock result or authorize that reassignment. The storage-aware alternative remains unavailable pending complete evidence that Stone production is not useful.

Stone storage itself caps additions, so production at a full cap would be discarded. That makes pausing a Quarry while storage is full mechanically non-wasteful for that instant, but it does not prove that suspension is safe for later Construction or other demand. Fresh Stone demand and future stock/capacity transitions are incomplete. P44's existing capacity-aware Stone predicate is unchanged.

## 4. Stock-aware Food predicate

`evaluateP45FoodStatus` is a separate pure diagnostic. It requires explicit confidence and current provenance. It does not replace P37's goal or alter P44's Stone predicate.

| Status                | Predicate evidence                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currently-positive`  | Complete current stock, capacity, pool ownership, production, consumption, modifier, and supply-pool evidence; current production exceeds consumption. This is a current rate statement, not a guarantee. |
| `buffered-deficit`    | Negative flow plus a complete, provenance-backed deficit horizon and stock-transition-complete evidence; current reserve covers that horizon's maximum cumulative deficit.                                |
| `recovering`          | A provenance-backed prior deficit and current stock above the prior observed stock.                                                                                                                       |
| `structural-deficit`  | Negative flow plus the same complete bounded horizon, with current reserve below the supported maximum deficit.                                                                                           |
| `starvation-observed` | A fresh observed starvation-count increase. It is checked after current provenance/confidence and before requiring a complete flow ledger.                                                                |
| `unavailable`         | Stale/incomplete provenance, missing confidence, inputs, modifiers, owner, pool mode/pools, storage, or a complete bounded horizon.                                                                       |

No P43/P44 negative rate becomes a buffered or structural stock conclusion by itself. In particular, a positive current stock without a reserve horizon cannot establish survival.

## 5. Economic questions

1. **Does 3F/3F/1Q survive under any supported initial reserve?** Not established. The flow-only envelope includes a p4000 case whose authentic 429.73 Food exceeds its 364.40 held-rate drawdown, but the underlying stock equation fails calibration and p4000 Farm availability is conditional. No supported survival claim follows.
2. **Minimum reserve?** Unavailable. The 364.40 and 316.32 held-rate drawdowns at the p728 and p5768 boundaries are sensitivity values, not required reserves. P45 does not publish them as thresholds.
3. **Can two Farms suffice with managed reserves?** Unavailable. The two-Farm/4F flow formula has more negative samples (487) and a larger flow-only p728 drawdown (579.31), but cannot be converted to starvation risk without a calibrated stock replay.
4. **Does a structural shortage remain after Weather improves?** The last 3F scenario rate at sampled +10% Weather is +1.133 and the 2F rate is +0.698; the actual one-Farm P43 B rate remains −0.82. These endpoint rates do not establish a long-run balance because modifiers, demand, and future economy are not held constant.
5. **Would moving the Quarry worker help during severe Weather?** The 4F/0Q formula increases the p5768 rate by about 0.651 but leaves it negative; at p5488 it moves the rate from −0.306 to +0.583. This is conditional rate sensitivity, not an instruction to reassign.
6. **Can Stone production be suspended safely at full storage?** At the capacity boundary, excess production is discarded. Safe suspension beyond that instant still depends on forthcoming Stone demand; the retained evidence does not establish that demand or a counterfactual Stone stock path.
7. **Does this depend on unsupported military, Construction, or ownership changes?** Yes. The scenario holds P43's military/demand trajectory fixed and applies hypothetical Farm and worker configurations. Changed starvation can change civilians, Construction, resource stocks/caps, Jobs smartMaximum, Stone, progression, and RNG outcomes. P43 worker ownership is not authoritative, and P42 Construction priority substitution was test-only.
8. **What observations would validate causally?** At each native fast loop: Food amount and cap before/after; time multiplier/offline scale; supply mode and per-pool Food stock/cap/shortage when regional; unrounded Food producers and consumers with Weather and modifiers; every Food `modRes`, direct write, action, event, trade, and phase; starvation roll/outcome and population change; military assignments; Construction purchases/stock deltas; worker ownership/commitments and smartMaximum; and Stone stock, cap, consumers, and Quarry production. These would need to continue under the actual economy so counterfactual decisions and RNG are observed rather than inherited from P43.

## 6. Authority, limits, and performance

- No Farm purchase, Worker commitment, reassignment, gathering, Construction priority change, or production planner is authorized by this result. P43's worker assignment assumption is not authoritative; P42 Construction priority substitution remained test-only.
- No new native draws, Worker/tab preloads, direct game-state changes, or browser reads were performed. The stock timeline and source evidence establish the calibration gap; exact replay would violate the no-new-draw boundary.
- Renderer CPU performance at the 2% gate remains unresolved.
- P45 simulation loop time was **52.208 ms** across 1,161 normalized observations. The source file was **15,589,234 bytes**; file read took **3.669 ms**, JSON parsing **51.629 ms**, and normalization **20.778 ms**. Pure loop timing excludes file read, JSON parsing, normalization, and evidence serialization/formatting.
- Focused P45 regression, Chromium contracts, ordinary build, full `npm run check`, and `git diff --check` are run for this change and recorded in the final handoff.

## Deliverables

- [Calibrated pure transition model and stock-aware predicate](p45-food-stock-resilience.mjs)
- [Machine-readable Food stock timeline](p45-food-stock-timeline.json)
- [Machine-readable Weather timeline](p45-weather-timeline.json)
- [Machine-readable calibration and scenario evidence](p45-food-stock-resilience.json)
- [Focused regressions](../tests/experiments/p45-food-stock-resilience-test.mjs)
