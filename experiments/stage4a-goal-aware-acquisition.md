# Stage 4A — Goal-aware resource acquisition

Date: 2026-10-15
Decision: **A — goal-derived demand improved meaningful progression in this saved run.**
Scope: test-only experiment; no production strategy integration.

## Result

Feeding the existing Market planner a short-lived demand signal for a currently offered native Research prerequisite changed its ordinary route decisions and materially advanced the MAD prerequisite chain. With the same pinned save, settings, seed, epoch, game snapshot, and Gather intervention, F purchased Hunter Process at p9368 and Electronics at p11016. At p30000, F had High Tech 6, Smelting 6, Titanium 2, Uranium 1, and two factories; corrected Stage 3Y baseline B had High Tech 3, Smelting 5, no Titanium or Uranium technology, and one factory. Neither run had completed MAD.

F's economic cost is visible: at p30000 its Money was $1.286m against B's $2.752m, and its Knowledge was 42,852 against 60,616. The sampled Money minimum remained positive in both runs: $10,305.63 at p11500 for F and $3,628.48 at p14300 for B. F ended with 47,903 Titanium versus B's 278, and reached High Tech 6 versus 3. Under the requested success criterion, this is a meaningful progression gain with controlled native Market execution, while not establishing that the policy is safe or optimal for other saves, races, or settings.

## Reproduction inputs

- Repository branch and starting HEAD: `deadspace`, `978619241a35cf9854e1eb3ddd7f29c57911dd46`.
- Pinned upstream and exact game snapshot: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`; `test-artifacts/game/evolve-deadspace.js`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`.
- Exact runner SHA-256: `f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`.
- Test bundle SHA-256 for the final B/F replay: `558385fdc2ef600187de314c0f508f5cf7f3d4a8d8a66a42c2b6c1826804a721`.
- Save: `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`, SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`.
- Settings: `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`, SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`; effective settings SHA-256 `7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804`.
- Seed `42`, epoch `2026-09-21T00:00:00.000Z`, Gather intervention `goal-derived-conjunctive`; `autoMarket`, `autoSmelter`, and `buyTitanium` enabled in both runs.
- F activates its test-only signal after the identical p8000 checkpoint. Both runs execute 3750 application ticks through p30000. F's extension followed the predeclared rule: continue when High Tech remained below 7 and sampled/current Money stayed positive through p20000.

## Phase 1 — Missing coordination in B

At p8000 the selected prestige is MAD, research control is permitted, root generation is 0, and the progression epoch is captured from current game state. Native Market owner and controls are enabled. Titanium import is permitted, current capacity is 33,516, stock is 44.554, and its ordinary quote is 154.5 Money at about 1.034 units per period. Market reports Titanium `demanded=false` and `requestedQuantity=0`. The p8008 baseline planner nevertheless proposes its ordinary 10-route Titanium import based on its existing priorities; it does not receive a Research-derived request.

The current native Research offer is `tech-hunter_process`, granting Titanium level 1 at native price Knowledge 45,000 plus Titanium 1,000. The native catalog declares High Tech 3 and Smelting 2 prerequisites. B has High Tech 3 and Smelting 4 at p8000, so those prerequisites are met. The action remains offered and unaffordable at p8000, p12000, p16000, and p20000. Titanium stock at those checkpoints is respectively 44.554, 149.975, 193.383, and 216.121. Knowledge is 43,512 at p8000, then 53,908, 58,667, and 58,667; after p8000, Titanium remains the binding cost. Titanium production is positive but small: B reaches only 278.133 by p30000.

At p8000, the current native offer set also includes `tech-anfo`, grant Explosives 3, price Knowledge 42,000 plus Oil 2,500. Research spending reservation semantics intentionally do not turn an unaffordable offer's costs into general resource reservations. The missing coordination is goal selection: nothing currently tells Market that a valid, offered prerequisite for the selected prestige is an acquisition target. Stage 4A leaves spending reservation behavior unchanged.

At p8008, B's planner chooses zero Lumber, remove 78 Iron routes, remove 2 Steel routes, and add 10 Titanium routes. It preserves the configured Money floor: sell excess enabled, minimum Money rate 500, minimum Money percentage 50. The route plan is executable under the existing owner. Current route count/capacity is 93/93. The Market does not request the full Hunter Process price: Titanium is not marked demanded and requested quantity is zero. This reconciles the native offer's price with the Market input without inventing a Research reservation.

The offer and prerequisite observations at later checkpoints corroborate that the Titanium price stays 1,000 while the Hunter Process action remains unavailable for purchase. B's native Research sequence does not purchase Hunter Process by p30000; the selected run purchases ANFO at p10232 instead.

## Phase 2 — Candidate selection

The selector reads the live selected prestige, existing prerequisite graph, current Research offer set, native price/grant, current holdings, and current applicability evidence. At p8008 it finds two credible, eligible, verified prerequisite candidates:

| Native candidate                            | Grant and relation to MAD                                                                                                                    | Native cost                      | Missing at p8008                     | Selection                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------ | -------------------------------------------- |
| `tech-anfo`, offer generation 350           | Explosives 3; verified prerequisite path `tech-mad → tech-anfo`; currently eligible and actionable                                           | Knowledge 42,000; Oil 2,500      | Oil 637.085                          | Selected: shorter prerequisite chain         |
| `tech-hunter_process`, offer generation 532 | Titanium 1; verified prerequisite path `tech-mad → tech-uranium → tech-electronics → tech-hunter_process`; currently eligible and actionable | Knowledge 45,000; Titanium 1,000 | Knowledge 1,488 and Titanium 955.446 | Credible alternative, not silently discarded |

The graph reports conditional/partial completeness, so the result is not a proof that this is the only or mandatory path to MAD. Candidate ranking is transparent: verified relationship and eligibility first, then shorter prerequisite chain; equal top-ranked candidates remain ambiguous. Once ANFO is purchased at p8032, Hunter Process becomes the selected actionable candidate at p8040. Later the current candidate changes to Fission/Uranium when that offer is the selected eligible frontier. No resource or technology order is hardcoded.

## Phases 3–4 — Bounded signal and native Market economics

For the selected currently offered candidate, the test selector computes `max(native price − current holding, 0)` only for resources the current Market can import. It emits at most one resource signal per sample. The signal is tied to the offer identity/generation, goal, root generation, progression epoch, current holding and capacity, Market owner/board/control, resource import permission, and current quote. It expires on purchase, offer or goal invalidation, or stale identity/evidence. It does not alter spending reservations, storage demand, Research purchase decisions, queues, construction commitments, prices, or routes.

F's first signal is Oil 2,500 for ANFO, shortfall 637.085, at p8008. After ANFO is researched, the selected Hunter Process signal is Titanium 1,000, initially shortfall 955.446. Later a Fission candidate produces a Uranium target of 10, with a 9.111 shortfall. Across F there are 76 active signal samples, 7 candidate-already-affordable outcomes, and 2,667 samples where the selected candidate has no permitted import shortfall. The signal does not persist when no current valid candidate needs a marketable resource.

Only a copy of the Market planner input gets the test resource's demanded flag. Captured native demand remains false/zero; the signal affects priority interpretation for `planTradeRoutes`, and the resulting operations pass through the normal owner controls. At p8008 the ordinary B plan imports 10 Titanium routes, while F's goal signal selects Oil and its plan imports 73 Oil routes after removing 15 Iron and 2 Steel routes. At p8040 the Hunter Process signal changes the planner's baseline proposal from zero Steel plus 3 Lumber routes to zero Steel, remove 73 Lumber and 60 Iron routes, add 16 Titanium routes. Existing owner reallocation remains active; F later makes ordinary alternations as priorities and state evolve.

No route-count override or Money-floor modification was used. The plan inputs retained the same 500 Money/second and 50% Money floor. Of F's 76 signal-bearing plan samples, 70 produced planner operations different from the ordinary-input baseline plan. The ordinary plan and application controls produced no captured native-control refusal events; selector and Market capture failures were both zero. Thus this replay records no refused route action to explain. A planner may still return an empty operation list when its native inputs do not warrant a change; the experiment does not force one.

## Phase 5 — Deterministic B/F comparison

Checkpoint amounts (Money rounded to whole units; resource amounts rounded for readability):

| Period |   B Money |   F Money | B Knowledge | F Knowledge |  B Oil |  F Oil | B Titanium | F Titanium | B/F High Tech |
| -----: | --------: | --------: | ----------: | ----------: | -----: | -----: | ---------: | ---------: | ------------: |
|  8,000 |    92,995 |    92,995 |      43,512 |      43,512 |  1,857 |  1,857 |         45 |         45 |         3 / 3 |
|  9,000 |   213,316 |   216,428 |      33,037 |      17,991 |  1,789 |    672 |         86 |      1,044 |         3 / 3 |
| 10,000 |   317,401 |   352,540 |      28,801 |      20,157 |  2,381 |  1,262 |        107 |      1,804 |         3 / 3 |
| 12,000 |   108,265 |   406,542 |      53,908 |      50,908 |    897 |  1,583 |        150 |      5,526 |         3 / 4 |
| 16,000 |   285,951 | 1,501,055 |      58,667 |      56,352 |  2,956 |  5,354 |        193 |     15,150 |         3 / 4 |
| 20,000 |   214,908 |   604,269 |      58,667 |      32,369 |  7,901 | 13,931 |        216 |     27,993 |         3 / 4 |
| 24,000 | 1,458,342 | 2,572,434 |      58,667 |      55,857 | 15,781 | 22,617 |        257 |     26,720 |         3 / 5 |
| 28,000 | 1,162,821 | 1,603,423 |      59,642 |      93,910 | 27,486 | 30,933 |        278 |     41,335 |         3 / 6 |
| 30,000 | 2,751,827 | 1,286,154 |      60,616 |      42,852 | 33,206 | 34,959 |        278 |     47,903 |         3 / 6 |

F's relevant native purchases were ANFO p8032 (Explosives 3), Hunter Process p9368 (Titanium 1), Electronics p11016 (High Tech 4), Titanium Drills p13808, Uranium p21432, Fission p21720 (High Tech 5), Kroll Process p22008 (Titanium 2), Electric Arc Furnace p23896 (Smelting 6), and ARPA p26496 (High Tech 6). B bought ANFO p10232 and had no Hunter Process, Electronics, Titanium, or Uranium grant by p30000. Both remain short of MAD at p30000.

F's final route assignment is 49 Crystal and 49 Lumber routes; B has 50 Crystal and 51 Lumber routes. All changes came from normal Market planning and execution. F's native titanium production following Hunter Process contributes alongside imports, so the 47,903 final Titanium stock is not attributed to imports alone. F's final Money is lower despite its higher Money minimum; this is a real opportunity cost, not hidden by the progression result. Remaining resources and production were captured in the replay JSON but are not collapsed into a claim that every economy dimension improved.

At p30000, F also ended with 254,114 Lumber vs B's 868,453, 99,727 Stone vs 465,588, and 18,022 Iron vs 167,005; F held 963,579 Steel vs B's 50,225. Crystal was 103,896 vs 80,784, and Aluminium 82,007 vs 61,626. These are end-stock differences from the whole strategy trajectory, not isolated route imports. The harness's per-resource `rate` field was zero in both final snapshots, so it does not provide a reliable separate production-loss measurement; avoid interpreting the stock deltas as production-rate deltas.

Both runs execute 3,750 work ticks. Final-run harness wall time was 578.8 seconds for B and 608.4 seconds for F; renderer task time was 577.5 vs 607.1 seconds and renderer script time 1.167 vs 1.132 seconds. These end-to-end wall figures include Chromium/game simulation and do not isolate the incremental selector cost. The experiment therefore reports a 29.6 second run-time difference, not a causal per-tick performance estimate. Test signal logic ran only behind the test hook.

## Phase 6 — Adaptability and evidence limits

`tests/experiments/stage4a-goal-aware-acquisition-test.mjs` exercises pure synthetic contracts for a different candidate/resource (Steel), multiple prerequisite routes and tied candidates, already-affordable price, offer disappearance, price changes, race and challenge exclusions, disabled Market owner, disabled resource import, unavailable or inadequate storage, stale root generation, achieved goal, and already-sufficient unrelated demand. `tests/evolve/space/captured-trade-routes-test.mjs` also verifies that a signal with a stale native Research offer generation leaves the ordinary planner result unchanged. These are deterministic contract tests, not Chromium evidence. The real Chromium run used one human MAD save and does not establish optimality for other races or challenges.

The live adapter validates the upstream native Research definition shape before mapping it into the existing graph/candidate evaluator. This matters because the live `eligibility` is nested in the native definition. The offer selection is test-only, consumes the real offer generation, and fails closed when its capture is stale or incomplete.

## Phase 7 — Decision and production boundary

**Decision A.** In this controlled replay, goal-derived acquisition demand changes Market decisions and advances the MAD prerequisite chain substantially sooner. It reaches Hunter Process, Electronics and High Tech 6 while B remains at High Tech 3 through p30000. The evidence is sufficient for the experiment's success criterion and insufficient to claim universal safety, optimality, or completed MAD.

For separate review, the smallest production integration would be an explicit opt-in that supplies one currently selected native prerequisite's bounded missing importable-resource demand to the existing Market planner. It should preserve ordinary Research purchase permission, planner ordering and Money-floor refusal behavior, and require the same freshness and invalidation evidence demonstrated here. This report does not authorize or implement that integration.

## Verification record

Recorded after the implementation is stable: focused Stage 4A and Market contracts; full `npm run check` (346 test files plus type checks, architecture checks, lint, and format); production `npm run build`; Chromium runner contracts; deterministic B/F run through p30000; and `git diff --check`. The release build substitutes an undefined test proposal with the production test-surface flag set false; release-bundle checks confirm that the test selector callback and hook names are absent, so the guarded demand copy cannot execute. Final command outcomes and commit identifiers are recorded in the dated local progress log.
