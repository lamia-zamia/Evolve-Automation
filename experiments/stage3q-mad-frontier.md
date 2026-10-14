# Stage 3Q — MAD progression frontier

## Result

There is no demonstrated Research defect. The first actual obstruction is Steel production under the supplied settings: at period 1,000 the native `tech-steel_containers` offer is present but cannot be paid, and all smelter slots are assigned to Iron. The fixture explicitly sets `autoSmelter: false`. The Steel stock remains 10 through period 4,000, while capacity is 33,516. No production automation change is justified for this replay.

The required upstream gate is Steel Containers 1. Native `tech-industrialization` grants High Tech 3 and requires High Tech 2, Cement 2, and Steel Containers 1. The save already has Cement 3 and High Tech 2. At period 1,000 the Steel Containers offer costs 9,000 Knowledge and 250 Steel; stock is 4,572.66 Knowledge and 10 Steel. By period 4,000 Knowledge has accumulated to 25,975, but Steel is still 10, so the native offer remains unaffordable. No storage cap blocks Steel or Knowledge at period 1,000.

## Native MAD chain at the pinned source

Checked against `D:/work/Evolve-DeadSpace/src/tech.js` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`. Levels and prerequisites come from the native action definitions; route and conditions are retained separately.

| Native action            | Grant        | Native prerequisites                      | Route / extra gate                                                                                                                                          |
| ------------------------ | ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tech-industrialization` | High Tech 3  | High Tech 2, Cement 2, Steel Containers 1 | No path or condition restriction                                                                                                                            |
| `tech-electronics`       | High Tech 4  | High Tech 3, Titanium 1                   | No path restriction; Ice Age post-action advances High Tech to 5                                                                                            |
| `tech-uranium`           | Uranium 1    | High Tech 4                               | Standard or Truepath                                                                                                                                        |
| `tech-fission`           | High Tech 5  | High Tech 4, Uranium 1                    | Standard or Truepath                                                                                                                                        |
| `tech-arpa`              | High Tech 6  | High Tech 5                               | No path restriction                                                                                                                                         |
| `tech-rocketry`          | High Tech 7  | High Tech 6                               | Standard or Truepath                                                                                                                                        |
| `tech-oil_well`          | Oil 1        | High Tech 3                               | No path restriction                                                                                                                                         |
| `tech-anfo`              | Explosives 3 | Explosives 2, Oil 1                       | No path restriction                                                                                                                                         |
| `tech-mad`               | MAD 1        | Uranium 1, Explosives 3, High Tech 7      | Standard or Truepath; excludes Cataclysm, Lone Survivor, Warlord; native condition excludes Sludge and Ultra Sludge, and requires World Control on Truepath |

The MAD action also has native costs: 120,000 Knowledge, 8,500 Oil (10,000 on a dense planet), and 1,250 Uranium. Deep Power in the Magic universe replaces Oil and Uranium costs with Mana 200 and Crystal 8,000. These are downstream gates; none changes the period 1,000 frontier.

## Canonical replay inputs and integrity

The continuous run used one page and advanced through each checkpoint without reloads or setting changes:

| Input                      | Value                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Starting save              | `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`                                         |
| Save SHA-256               | `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`                                                    |
| Settings                   | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`, with `autoResearch: true`         |
| Effective settings SHA-256 | `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`                                                    |
| Seed / epoch               | `42` / `2026-09-21T00:00:00.000Z`                                                                                     |
| Game snapshot              | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553` |
| Upstream source            | `D:/work/Evolve-DeadSpace` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                              |

The diagnostic bundle was built from `src/main.ts` with the existing test surface enabled and a test-only mutable copy of the runner's frozen hook object. The runner's native invocation callback was preserved. The canonical D Gather claim intervention (`resourceClaimMode: "goal-derived-conjunctive"`) was set, as in Stage 3M. Bundle SHA-256: `be8c3a21507911d8596980df92dc28e4999f1c489da95e425d32f3c37911be82`. This affected only the diagnostic replay; no preferred Research target, technology level, or production bundle was injected or altered.

Repository safety check before the run:

- Parent checkout: `deadspace` at `15013614fce578d01051670dcecb61c7668845a0`, clean before this report.
- `tools/` is a physical directory at `D:/work/Evolve-Automation/tools`, not a junction or symbolic link. Its nested Git root is that directory, HEAD `f10aaed8bf8176fc5691499b831cea8f8c103a7e`, origin `https://github.com/lamia-zamia/tools.git`, clean before and after the run.
- The upstream checkout remained at the pinned commit. Its pre-existing untracked `automation-local.html` was left untouched.
- No worktrees were created. No files under the nested `tools/` repository or upstream checkout were changed.

## Period 1,000 frontier

The test-only catalog read was `current: true` from the shared Research cycle. The current race is on Standard; the MAD condition and its captured route/restriction applicability both evaluate eligible. `tech-mad` is not offered because its three direct technology requirements are unmet. The native graph was built from the captured native definitions, live grant levels, applicability, and offer IDs. It reports partial dependency evidence because some native requirements are dynamic; this does not make the current offer sample unavailable. The graph's current frontier includes `tech-steel_containers`; its live gate is an offered action, not an inferred target.

| Direct MAD requirement | Live level at 1,000 | Gate                                                            |
| ---------------------- | ------------------: | --------------------------------------------------------------- |
| Uranium                |               0 / 1 | Unsatisfied; `tech-uranium` requires High Tech 4                |
| Explosives             |               2 / 3 | Unsatisfied; `tech-anfo` requires Oil 1 as well as Explosives 2 |
| High Tech              |               2 / 7 | Unsatisfied; the next High Tech grant is Industrialization 3    |

The derived High Tech chain stops first at Industrialization: High Tech 2 and Cement 3 satisfy two requirements, while Steel Containers is 0 / 1. The derived Oil branch stops at Oil Wells, which requires High Tech 3. The Electronics branch is later and also requires Titanium 1. Current `tech-steel_containers` native requirements (Smelting 2 and Container 1) are satisfied: it appears in the current native offer list.

### Complete current native Research offer sample

All 19 offers were present at period 1,000 and all had native affordability `false`. Costs are the captured current native offer costs; no displayed or reconstructed price was substituted.

| Native offer            | Current cost                                   | Native affordable |
| ----------------------- | ---------------------------------------------- | ----------------- |
| `tech-flintlock_rifle`  | 5,400 Knowledge; 100 Mana                      | No                |
| `tech-steel_vault`      | 30,000 Money; 6,750 Knowledge; 3,000 Steel     | No                |
| `tech-steel_containers` | 9,000 Knowledge; 250 Steel                     | No                |
| `tech-alchemy`          | 100 Mana; 10,000 Knowledge; 250 Crystal        | No                |
| `tech-steel_saw`        | 10,800 Knowledge; 400 Steel                    | No                |
| `tech-steel_beams`      | 11,250 Knowledge; 2,500 Steel                  | No                |
| `tech-steel_hoe`        | 12,600 Knowledge; 500 Steel                    | No                |
| `tech-crafting_ritual`  | 100 Mana; 15,000 Knowledge; 2,500 Crystal      | No                |
| `tech-barns`            | 15,750 Knowledge; 3,000 Aluminium; 3,000 Steel | No                |
| `tech-apartment`        | 15,750 Knowledge                               | No                |
| `tech-mine_conveyor`    | 16,200 Knowledge; 2,250 Copper; 1,750 Steel    | No                |
| `tech-diplomacy`        | 16,200 Knowledge                               | No                |
| `tech-radio`            | 16,200 Knowledge                               | No                |
| `tech-windmill`         | 16,200 Knowledge                               | No                |
| `tech-cranes`           | 18,000 Knowledge; 1,000 Copper; 2,500 Steel    | No                |
| `tech-bessemer_process` | 19,800 Knowledge; 5,000 Coal                   | No                |
| `tech-jackhammer`       | 22,500 Knowledge; 5,000 Copper                 | No                |
| `tech-merchandising`    | 25,000 Knowledge                               | No                |
| `tech-zealotry`         | 25,000 Knowledge                               | No                |

At period 1,000, Knowledge was 4,572.66 / 20,806; Steel 10 / 33,516; Cement 28,001.47 / 296,521; Coal 24,616.30 / 222,364; Titanium 0 / 52; Oil 0 / 0; Uranium 0 / 10. Knowledge and Steel were both below the Steel Containers cost, while neither was storage-cap blocked. At period 4,000 Knowledge was 25,975 / 25,975, but Steel remained 10 / 33,516 and the native Steel Containers offer was still unaffordable.

`autoResearch` is enabled; triggers are disabled; the build and research queues are empty. The captured Research sample is current, and the owner successfully invoked native Research offers through period 1,000 (last selection was `tech-spy_gadgets`, period 952). At period 1,000 no current offer was natively affordable, so there was no affordable candidate for the owner to select. There is no evidence of a selected action being refused or of a missing native invocation.

## Continuation milestones

Checkpoint export hashes below are from the same continuous session. The 200 and 1,000 hashes match the accepted Stage 3M D replay. The 1,000 checkpoint also matches the accepted technology levels, Black Powder cycle 79, and Dynamite cycle 80.

| Period | Export SHA-256                                                     | High Tech | Explosives | Uranium |          Knowledge |       Steel |              Cement |
| -----: | ------------------------------------------------------------------ | --------: | ---------: | ------: | -----------------: | ----------: | ------------------: |
|    200 | `d683be0bf2a4ce69e407117388efdaa77ba3ca8bfafbf1f28cfbe13a8ee742cf` |         1 |          0 |       0 |    590.04 / 20,638 | 10 / 33,516 | 34,569.28 / 296,521 |
|  1,000 | `acd51350fbc0bb8a3f03138a801660bd8f6007ca8bd762f918a662d061c59def` |         2 |          2 |       0 |  4,572.66 / 20,806 | 10 / 33,516 | 28,001.47 / 296,521 |
|  1,500 | `075e6e4d2ee9c071a4f07eaec405259b688208b218c006479aec4e42faa5bd56` |         2 |          2 |       0 |  5,159.25 / 20,806 | 10 / 33,516 | 24,248.16 / 296,521 |
|  2,000 | `2db037c1a239243d6498e815304a4e4687cb9657ad4c1ce36da91b4eb94e5c38` |         2 |          2 |       0 |  4,234.45 / 21,806 | 10 / 33,516 | 23,140.42 / 296,521 |
|  3,000 | `1c65733caea8b43e3c89ec69416c74da53a8a02494dfe56785d035b37ee53615` |         2 |          2 |       0 | 16,493.61 / 25,806 | 10 / 33,516 | 21,433.31 / 309,408 |
|  4,000 | `ea2aa26087d3fbfbf18321b5cb8abf83b9b29ad0281011f1a326504d83468b7f` |         2 |          2 |       0 |    25,975 / 25,975 | 10 / 33,516 | 20,040.22 / 322,296 |

First-grant observations use native Research invocation periods and the captured grant levels. Cement was already level 3 in the starting save, so Cement 2 predates this run.

| Milestone                       | First grant / final state                                          |
| ------------------------------- | ------------------------------------------------------------------ |
| Cement 2                        | Already satisfied at load (Cement 3)                               |
| Steel Containers 1              | Not granted by period 4,000; native offer is resource-insufficient |
| High Tech 2                     | Electricity at period 784                                          |
| Industrialization / High Tech 3 | Not granted by period 4,000; Steel Containers 1 missing            |
| Oil Wells / Oil 1               | Not granted by period 4,000; High Tech 3 missing                   |
| Electronics / High Tech 4       | Not granted by period 4,000; High Tech 3 and Titanium 1 missing    |
| Uranium 1                       | Not granted by period 4,000; High Tech 4 missing                   |
| Fission / High Tech 5           | Not granted by period 4,000; High Tech 4 and Uranium 1 missing     |
| A.R.P.A. / High Tech 6          | Not granted by period 4,000; High Tech 5 missing                   |
| Rocketry / High Tech 7          | Not granted by period 4,000; High Tech 6 missing                   |
| ANFO / Explosives 3             | Not granted by period 4,000; Oil 1 missing                         |
| Titanium 1                      | Not granted by period 4,000; Electronics has not been reached      |

The last successful Research-owner selection was `tech-zealotry` at period 2,848. No later owner selection or research invocation occurred through period 4,000. The native current offers at 4,000 remained unaffordable, and none of the tracked MAD prerequisites had advanced.

## First obstruction and ownership

At period 1,000, the next High Tech action `tech-industrialization` is not natively offered because Steel Containers 1 is unmet. Its own declared prerequisites already have High Tech 2 and Cement 2. The missing Steel Containers research is currently offered and its native cost is captured as 9,000 Knowledge plus 250 Steel. The existing stock covers neither payment at period 1,000. By period 4,000 the Knowledge requirement is covered, but Steel remains below the native price.

The game has 14 smelters at period 1,000, all allocated to Iron (`smelter.Iron=14`, `smelter.Steel=0`); at period 4,000 it has 17 allocated to Iron and zero to Steel. This is not a missing-building or storage-cap problem. The fixture explicitly sets `autoSmelter: false`; the code default is also false. The runtime runs the captured smelter owner only when `autoSmelter` is enabled. `autoBuild`, `autoJobs`, and `autoResearch` are enabled, but they do not enable the separate smelter production owner. No setting was changed for this experiment.

Classification at the first frontier:

1. Industrialization is not yet native-eligible because Steel Containers 1 is missing.
2. Steel Containers is currently offered by the native game.
3. Its offer is resource-insufficient (Knowledge and Steel at period 1,000; Steel alone still blocks it at period 4,000).
4. No relevant storage cap blocks the period 1,000 payment.
5. No affordable prerequisite offer was skipped by AutoResearch.
6. No selected Research invocation was unavailable or refused.
7. The necessary Steel production allocation is not being managed because the profile leaves `autoSmelter` off.
8. Thus this is an economic/settings obstruction, not evidence of an automation defect; the bounded run is insufficient to reach MAD without changing that owner setting.

There is no runtime correction, test change, or production automation change in this stage. The existing Stage 3P Power regression remains untouched. The 200-period accepted Gather counters remain 1,700 clicks, 183 Mana, first Gather at period 72; the 1,000-period accepted counters remain 8,512 clicks and 1,270 Mana. The only test intervention was the established D Gather claim mode; no preferred Research target or technology level was injected.

## Remaining path to MAD

Enable or otherwise supply Steel production under the user's chosen configuration, then the native offer can be evaluated again at its live price. The native graph still needs to pass the separate declared gates: Industrialization for High Tech 3; Oil Wells then ANFO for Explosives 3; Electronics/Titanium and Uranium for High Tech 4/Uranium 1; Fission for High Tech 5; A.R.P.A. for High Tech 6; Rocketry for High Tech 7. Native eligibility and affordability continue to decide each action. MAD additionally checks its native trait/Sludge/Truepath conditions and its own costs.

## Verification

No production source or nested tool code changed. The focused Research planner, obligation, goal-candidate, Research affordability/invocation, and captured-smelter tests passed. `npm run check` passed all 339 test files and all five checks; `npm run build` passed; `node tools/chromium-evolve-runner-test.mjs` passed determinism, isolation, reload continuity, pause, and cleanup cases. The canonical exact-runner checkpoints reproduced the accepted 200- and 1,000-period hashes and the continuous 1,500/2,000/3,000/4,000 observations above. The report-only change passes `git diff --check`.
