# Stage 3Y — Goal-aware trade route reallocation

## Decision

**C — the existing Market planner already makes an equivalent or better route choice.** A permitted Steel export reduction and Titanium import addition can be executed through native controls while preserving the full route cap. In the pinned replay, however, the planner expanded Titanium to nine routes at p8008 in E (ten in B), then both runs converged to the same assignments and essentially identical Titanium holdings by p9000. Neither run advanced High Tech beyond 3 or researched Hunter Process through p20000. Do not add a production setting or strategy execution from this stage.

## Reproduction

Run `node experiments/stage3y-trade-route-reallocation.mjs`. It creates separate fresh Chromium sessions for B (corrected baseline) and E (baseline plus one test-only swap), uses the exact `tools/chromium-evolve-runner.mjs`, and writes its scratch report under ignored `test-artifacts/benchmark/tmp/`. The report includes the complete native Research evidence and trade-route plan observations at named checkpoints, assignments at every checkpoint, and Money snapshots at p8000, p8001, each 100 periods through p20000, and p20000.

| Input                              | Pinned value                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Branch / starting HEAD             | `deadspace` / `3abd7b3a43780a1f0120f049dcd1b9b6291b1b25`                                                        |
| Upstream                           | `D:/work/Evolve-DeadSpace` / `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                         |
| Game snapshot SHA-256              | `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`                                              |
| Exact runner SHA-256               | `f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`                                              |
| Save / SHA-256                     | `stage2f-fixed-progression-export.json` / `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`    |
| Settings / raw SHA-256             | `stage2e-integrated-mad-no-triggers.json` / `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`  |
| Effective settings SHA-256         | `7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804`                                              |
| Effective overrides                | `autoMarket: true`, `autoSmelter: true`, `buyTitanium: true`; native Titanium import permission remains enabled |
| Seed / epoch / Gather intervention | `42` / `2026-09-21T00:00:00.000Z` / `goal-derived-conjunctive`                                                  |
| Experiment limit                   | estimated route charge at most `$7,000`, at most eight periods; one cycle only                                  |

The executable asserts the branch, starting commit ancestry, and pinned upstream snapshot before replay. No game source or game-state variables are modified. The temporary E control uses the native `market-Steel.autoBuy` and `market-Titanium.autoBuy` actions.

## Corrected evidence contracts

- The captured Market observation is now `storageRequiredQuantity`: it is sourced from native `demand.storageRequired()`. It is a storage threshold, not proof of an active spend request. The existing global demand-completeness gate remains intact.
- The experimental investment evaluator now names the current import rate `existingImportQuantityPerPeriod` and requires an `acquisitionHorizonPeriods`. It compares the stock shortfall with `rate × horizon`; missing, invalid, or overflowing cumulative quantity yields unknown economics. Tests cover the old unit mismatch, a partial existing import, a sufficient cumulative import, and overflow.
- The test-only route control supports one-route removal followed by one-route addition at a full cap. Each step recaptures the current board and control, checks player permissions and exact before/after route counts, invokes the native button, and checks the root, board, and global route count. Positive imports are removed with native `autoSell`; negative exports are reduced with native `autoBuy`. Tests cover a full-cap swap, an export reduction, disabled permissions, and preservation of an unmanaged route.
- Production bundling removes the test-only override normalizer, route-operation resolver, and route-control surface. The Stage 3X Market quote fix and native quote contract tests remain in place.

## Native target and prerequisites

At the selected checkpoints (p8000, p8001, p8008, p9000, p10000, p12000, p15000, p20000), the native catalog keeps Hunter Process offered and unaffordable; Electronics and MAD are not current offers. The settings select the MAD prestige path, but MAD itself is `not-offered` in this catalog.

The pinned catalog reports Hunter Process costs of 45,000 Knowledge and 1,000 Titanium, is affordable only when both stocks cover those costs, grants Titanium technology 1, and declares High Tech 3 plus Smelting 2 prerequisites. The native definition has no extra condition or restriction. It is therefore a real step on a plausible route: Electronics declares High Tech 3 plus Titanium technology 1 and grants High Tech 4; the native MAD definition declares Uranium 1, Explosives 3, and High Tech 7. This graph justifies inspecting the route to Titanium, but it does not make Hunter Process a selected or committed purchase. It remains diagnostic evidence, not an automatic spending target.

Electronics costs `traitCostMod('stubborn', 50000)` Knowledge in the pinned `src/tech.js`; since Electronics is not offered here, the native catalog supplies no current offer quote. At p8000 the run has 43,512 Knowledge and 44.554 Titanium. By p15000 and p20000 it has 58,667 Knowledge, but only 170.645 and 216.121 Titanium respectively. Hunter Process stays unaffordable through p20000 because Titanium remains the binding resource. The native target still needs Uranium 1 and High Tech 7; Explosives reaches 3 by p12000. Factory count is 1 by p8000 and stays 1; build and research queues are empty at the recorded checkpoints.

## Route choice, permissions, and costs

At p8000 all 93 of 93 global Market routes are assigned: Lumber `+90` imports and Steel `-3` exports. The exact owner plan sample also proposed reducing Lumber by 3 and Steel by 3. Lumber is actively demanded by the Market sample and has priority 3; it was left unchanged. Steel was not actively demanded and the native owner itself planned to reduce it, making one Steel route an evidenced eligible choice under the current controls.

| Resource at p8000 | Assignment / controls                                     | Native quote and observed value                                                             | Storage / active request                                                      |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Lumber            | `+90`; import and export enabled; priority 3, weighting 1 | Import `$22.60`, export `$6.80`; route volume `1.9`                                         | 226,209 held / 2,340,154 capacity; storage threshold 233,242; demanded `true` |
| Steel             | `-3`; import and export enabled; priority 7, weighting 1  | Import `$38.40`, export `$11.50`; route volume `0.475`; net production `+129.82` per period | 86,732 held / 288,739 capacity; storage threshold 16,191; demanded `false`    |
| Titanium          | `0`; import and export enabled; priority 8, weighting 1   | Import `$154.50`; `1.033531` Titanium per route per game-time unit                          | 44.554 held / 33,516 capacity; storage threshold 3,373; demanded `false`      |

Money at p8000 is `$92,994.89`, with sampled net rate `+$2,009.88` per period and no active Money demand. The build and research queues are empty. This is not a complete protected-commitment or ongoing-obligation ledger, so the cash data cannot establish general autonomous affordability or financial safety.

E removed one of the three Steel export routes, revalidated Steel at `-2` and the global count at 92, then added one Titanium import and revalidated Titanium at `+1` and the count at 93. Both steps returned `applied` using current native controls; all route slots were conserved. The current Titanium quote times the harness's native multiplier 5 and eight periods gives a `$6,180` estimated ceiling, below the experiment's `$7,000` limit. This estimate is not an isolated actual debit ledger and omits the lost export revenue, quote changes, and other economy changes. It is only a bounded research intervention, not evidence of general financial safety.

## Baseline versus reallocation

| Measure                             |                   B: corrected baseline |                 E: one test-only swap |
| ----------------------------------- | --------------------------------------: | ------------------------------------: |
| p8000 Money / Titanium / route use  |    `$92,994.89` / `44.554` / `93 of 93` |              same before intervention |
| p8001 Money / Titanium              |                 `$93,522.94` / `44.554` |               `$93,481.44` / `44.813` |
| p8008 route assignment              |  Iron `-78`, Steel `-5`, Titanium `+10` | Iron `-79`, Steel `-5`, Titanium `+9` |
| p8008 Money / Titanium              |                 `$70,254.25` / `44.554` |               `$69,922.25` / `46.621` |
| p9000 route assignment / Titanium   |  Crystal `+48`, Lumber `+47` / `85.896` |                       same / `85.896` |
| p10000 route assignment / Titanium  | Crystal `+48`, Lumber `+47` / `106.566` |                      same / `106.566` |
| p12000 route assignment / Titanium  |                Lumber `+95` / `149.975` |                      same / `149.975` |
| p15000 route assignment / Titanium  | Crystal `+48`, Lumber `+48` / `170.645` |                      same / `170.645` |
| p20000 route assignment / Titanium  |                Lumber `+97` / `216.121` |                      same / `216.121` |
| p20000 Money / Factory / High Tech  |               `$214,908.48` / `1` / `3` |             `$214,914.88` / `1` / `3` |
| Minimum sampled Money, p8000–p20000 |                   `$3,628.48` at p14300 |                 `$3,634.88` at p14300 |

Each minimum is over 122 samples (p8000, p8001, every 100 periods through p20000), not every native tick. Both remain positive at every sample. B and E each have two common runner errors; no Market-control failure was reported. The two paths are otherwise closely matched after p9000: Titanium holdings, technologies, and route assignments match, with only `$6.40` difference in Money at the recorded checkpoints. No time-to-Hunter or downstream Research milestone improved; neither run reached one.

Both runs used 2,500 harness work ticks and reported the same 53,455 log / 2 error counts. E added 25 returned calls to each of the Steel and Titanium native quote controls while the intervention refreshed and validated the board. The runner had no performance summary sample, so these call counts do not support a wall-clock overhead claim.

The Market owner did not preserve E's one-route allocation as a distinct choice: at p8008 it set Titanium to nine routes while B set ten, and by p9000 both had removed Titanium routes and selected the same Lumber/Crystal allocation. Later native route planning continued to make large ordinary allocation changes. The experiment did not reapply the swap. This is a coordination/ownership signal, and the baseline already makes a temporary ten-route Titanium allocation without a full-cap failure.

## Conclusion and next step

Decision **C**. Reallocation is natively feasible and Steel had evidence supporting a one-route reduction, but its temporary Titanium gain disappeared into the existing planner's choices without improving a technology, construction, or Research milestone by p20000. Do not add a production strategy, setting, priority, or Hunter Process commitment. The smallest justified next work is to improve observation of native selected progression goals and complete protected Money commitments before evaluating any future spending strategy. Any such strategy needs a separate stage and fresh evidence that its decision survives the current Market owner and improves a downstream milestone.
