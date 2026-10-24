# P38 — Native Quarry completion and productive employment

## Decision: C — Resource/Construction blocked

The P36 stop was reproduced exactly at p688. In the separate P38 arm, native Construction still targeted the Quarry at 50 Lumber / 10 Stone, but a native Basic Housing purchase consumed 22 Lumber while the bounded Gather authorization was active. P38 stopped at p728 with 27 Lumber / 10 Stone, below the Quarry price. It had used 17 of its separately authorized 18 Gather actions. Quarry was not purchased, so native Quarry Worker unlocking, post-purchase autoJobs, worker transfer, and Quarry production were not reached.

This is the first blocking stage. It does not establish whether the native Construction owner would buy a Quarry after reaching 50 Lumber, whether ordinary autoJobs would assign a Quarry Worker, or whether a one-worker Quarry would sustain positive Stone and Food.

## 1. Native Jobs readiness

The p688 Jobs input is a native capture of the four-resident state. It contains only the managed, unlocked `unemployed` and `farmer` rows; the Quarry Worker remains locked and absent from the live planner input.

| Setting or assignment                    | Captured p688 state                                    | Hypothetical unlocked Quarry catalog            |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Default job                              | Farmer                                                 | Farmer                                          |
| Population                               | 4                                                      | 4                                               |
| Farmer current / minimum / maximum       | 4 / 2 / -1                                             | 4 / 2 / -1                                      |
| Farmer smart maximum                     | 2                                                      | 2                                               |
| Farmer normalized / uncapped breakpoints | MAX_SAFE_INTEGER / MAX_SAFE_INTEGER / MAX_SAFE_INTEGER | Same captured values                            |
| Quarry Worker current / maximum          | Locked; no live row                                    | 0 / -1, hypothetical                            |
| Quarry Worker breakpoints                | Raw settings 4 / 10 / 0; no live row                   | 4 / 10 / 0, copied from captured split settings |
| Managed priority                         | Farmer 5; Quarry Worker 8 while locked                 | Farmer followed by Quarry Worker                |
| Existing assignments                     | 4 Farmers, 0 Quarry Workers                            | 4 Farmers, 0 Quarry Workers before planning     |
| Pure planner result                      | 4 Farmers, 0 unemployed                                | 2 Farmers, 2 Quarry Workers                     |

The actual planner prediction uses the genuine p688 input. The second result uses a clearly labeled hypothetical unlocked row with an optimistic unbounded smart cap; its row and unlock state were not observed in the native game. The result indicates that the current pure Jobs policy would assign Quarry Workers under that projection. It does not establish native post-purchase autoJobs behavior. The hypothetical planner does not retain all four Farmers, so the P37 priority ordering is not a policy-level obstacle in this projection.

The physical transfer of three Farmers to one Quarry Worker was not attempted. Quarry was not purchased, and no claim about manual feasibility or Food after reassignment is made.

## 2. Controlled continuation and parity

The replay used the accepted P19 bootstrap/handoff, P18 standard-human fixture, pinned game, seed 44, and epoch `2026-09-21T00:00:00.000Z`. P36 policy and its limits remained unchanged: 80 Shed clicks, 60 Quarry clicks, 140 total clicks, with a five-click per-cycle maximum. P36 stopped at p688 after 139 total Gather actions, including 60 Quarry-stage actions; its original stop had an 18 Lumber shortage and one total action remaining. P38 created a separate test-only authorization with a maximum of 18 additional Lumber Gather actions.

At p688 the native state was: Shed 1; Quarry 0 and still the current target; Quarry price 50 Lumber / 10 Stone; stock 32 Lumber / 10 Stone; population 4 / capacity 4; 4 Farmers; 0 Quarry Workers. Control arm A made no new Gather actions. Arms B and B-repeat waited until after this stop before using the P38 authorization.

A, B, and B-repeat match the retained P36 state, native action order, control usage, random-call counts, and random states through p688. B and B-repeat also match at every sampled checkpoint through p10000, including final export hash. The independently captured run retains exact native action order and resource transitions.

For each fresh authorization, Construction still published `city-rock_quarry`, price 50 / 10, current stock, current root/progression/control generations, native Gather bindings, empty queues, no competing claims, current permissions, and a current publication. The Gather postcondition required the clicked resource stock to rise. P38 issued at most five clicks in each cycle: 5 at p696, 5 at p704, 5 at p712, and 2 at p720. All 17 clicks increased Lumber by one, from 32 to 49.

At p720 the native action trace also records a Basic Housing action. By the p728 P38 stop, Lumber was 27 rather than the expected 49, while Stone remained 10. The 22-Lumber decrease and the new Basic Housing count identify the competing purchase. P38 stopped with `competing-purchase-consumed-resources`, 17 clicks used, and one P38 click unused. No additional clicks were authorized after that stock conflict.

## 3. Native completion and sustained outcome

Native Construction did not purchase the Quarry during this experiment. There is no Quarry purchase period, Quarry purchase action, post-purchase price/stock observation, or native Quarry Worker control-unlock observation. Ordinary autoJobs was observed through p10000, but never had an unlocked Quarry Worker row to assign: B had 5 Farmers and 0 Quarry Workers at sampled periods 1000 through 10000.

The competing Housing purchase raised population and capacity from 4 to 5. At p10000, B had one Farm, five Basic Housing buildings, one Shed, population 5 / capacity 5, 5 Farmers, and no deaths or starvation. A remained at population 4 / capacity 4 and 4 Farmers. B's Food output was 6.300 against consumption 5; A's was 5.316 against consumption 4. These are sustained positive Food margins in the observed no-Quarry states. They do not measure Food after a worker transfer.

Stone remained at stock 10 with output 0 in both arms. No Quarry Worker was assigned, so neither instantaneous positive Stone production nor a stable positive-Stone interval was observed. Native research progressed by p10000, including Agriculture 3 and Science 1; B also completed the extra Basic Housing purchase. The production chain is not called successful based on housing, food, or Quarry target selection.

The manual C arm was not applicable because B did not purchase a Quarry. The required three-Farmer / one-Quarry-Worker native-control transfer and its ordinary-Jobs follow-up were therefore not run. The experiment does not infer whether autoJobs would preserve or reverse such a transfer.

## 4. Diagnostic graph and provenance

The P37 diagnostic analyzer received actual p10000 native state, Job settings, generation-tagged controls, Food/Stone measurements, and the pinned-game mechanics evidence. Its source snapshot is period 10000 and includes its actual root, progression, and control generations. It does not use the broad retained-window epoch as execution freshness and creates no new goal authority.

For arm B the analyzer reports Quarry ownership unsatisfied, Quarry Worker assignment unsatisfied, and positive Stone production unsatisfied against the native p10000 capture. Food after reassignment is unavailable because no reassignment occurred. The current Job settings permit Quarry Worker management only provisionally; that is not evidence of an actual assignment. The pure hypothetical Jobs result remains separate from native automatic progression.

Evidence provenance remains distinct: ordinary native Construction and Jobs progression; P38 test-authorized Gather actions; the unperformed test-authorized worker transfer; and the pure Jobs formula projection. No resources or civic fields were directly written, no Quarry purchase was forced, and no new native catalog draw was performed.

## 5. Performance observations

Counts cover the complete replay arm. Synchronous phase times come from the Chromium runner's instrumented phase samples; no whole-window CPU comparison or 2% production CPU claim was made.

| Arm       | P36 / P38 Gather clicks | Validation fences | Fresh native price probes | Ordinary Jobs control calls | Construction action phase | Jobs catalog phase | Ordinary Jobs assignment phase |
| --------- | ----------------------: | ----------------: | ------------------------: | --------------------------: | ------------------------: | -----------------: | -----------------------------: |
| A control |                 139 / 0 |               688 |                       899 |                        2500 |                  646.5 ms |           348.1 ms |                        96.0 ms |
| B         |                139 / 17 |               753 |                      1980 |                        2500 |                  861.5 ms |           344.5 ms |                        95.0 ms |
| B-repeat  |                139 / 17 |               753 |                      1980 |                        2500 |                  903.6 ms |           362.2 ms |                       107.2 ms |

The added arm accounts for 65 more validation fences and 1081 more fresh native price probes than A. In-page elapsed timers for the synchronous validation, price-read, and Jobs-control callbacks returned 0 ms throughout, so those fine-grained durations are reported as unavailable. The runner-measured phase times above are retained as observed execution costs. The independent 2% production CPU gate remains unresolved.

## Evidence files

- [Exact replay evidence](p38-quarry-production-validation-evidence.json) contains checkpoints, hashes, state, production, native actions, controls, RNG traces, and deterministic comparisons.
- [Authorization evidence](p38-quarry-production-validation-authority.json) contains the fresh Construction authorities, each authorized Gather action and postcondition, stop conditions, and performance counts.
- [Production evidence](p38-quarry-production-validation-production.json) contains the decision, purchases, Food/Stone observations, Jobs outcome, and graph analysis.
- [Jobs planner evidence](p38-quarry-production-validation-jobs.json) contains the genuine p688 planner input and the explicitly hypothetical unlocked-Quarry input and prediction.
