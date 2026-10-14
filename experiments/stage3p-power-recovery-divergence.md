# Stage 3P — Power recovery divergence attribution

**Decision: A — expected divergence.** Keep the Stage 3O project-catalog freshness fix. The first state difference is the Power cycle that became authorized after the same-root Democracy-to-Technocracy transition. Native project demand was current and complete, and the Power executor applied its planned counts within native limits. The resulting production timing explains the later stock and building-timer differences.

## Reproduction

Replayed exact detached worktrees for `496a4d34` (baseline), `206e4773` (Stage 3O), and `18eba399` (current HEAD) with the exact Chromium runner. Each revision received a locally built production bundle. The current HEAD and Stage 3O production bundles are byte-identical; HEAD only changes the performance harness. Each 200-period run captured state after every period, including checkpoints 16 and 40. A second run of each revision reproduced the same state and export hashes at periods 16, 40, and 200.

| Input                                                         | SHA-256                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Save `mad-tech-offered-blocked.json`                          | `7eb43bc6cd1e7267561ceb21aaaa7b8c5eee9a4aa7c700ef9d579063a26cf090` |
| Settings file `current-full.json`                             | `f7fd9286607695d8716359f20f1f5a680264832de36879f84a7a67c4bd970042` |
| Effective settings (`SHA256(JSON.stringify(parsedSettings))`) | `ecaf13f665c1029cacdb544f21f070ebdd5cc709f07bec852489b26aa7333b7c` |
| Pinned game snapshot                                          | `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553` |
| Baseline bundle                                               | `78a066b4600e99af6b58d74808c825b42c3171d0ac3e16bd53203ce52ad370fc` |
| Stage 3O and current HEAD bundles                             | `ac4d65bccc208ecd441686807e1c5c90a14414a6558e169238d1988f5b0be3c8` |

Seed was `42`; epoch was `2026-09-21T00:00:00.000Z`; the upstream checkout remained at `db38e2af831907d49aeb5348d678d8d8745d6c3f`.

| Period | Baseline export SHA-256                                            | Stage 3O and HEAD export SHA-256                                   | First state difference  |
| -----: | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------- |
|     16 | `a79dde827db80aa1b93879199d34b071817d67200af5452d4def9d54083f24b6` | `4ced6c9485beb3a5bc20aac60c7099d34b4b45cc56cbb45a9bc6499c14a0d375` | 13 building `on` fields |
|     40 | `2899fd8aee52efaec7498ae7dca75f3a36cfbd1ee1e6ae080e277c111e9e5c94` | `42d8961acebafd39ebd36cbdca8f44241457f75b0a259261740225b35b341b94` | 65 fields               |
|    200 | `f27a34a5b2aa984fa1dee9a28543713222c2f905ecb2b9a22d79ddf187cd2380` | `9ff2f022b00b926bb699bc691a71539285980f1462c324d904d57cfd1f2b34ac` | 59 fields               |

## First divergence and authority

At period 16, both exports show the government changing to Technocracy. The baseline records one fail-closed Power diagnostic at that point: `exact demand unavailable: enabled project-storage catalog unavailable`. Its project sample belonged to the Democracy progression epoch. It makes no Power adjustment. The candidate refreshes the A.R.P.A. offers after the government change, then Power receives a ready exact-demand sample and its command outcome is `succeeded`.

The candidate’s before-and-after offer observations contain five current native offers. Their per-percent prices change with the government where the game changes them:

| Project        | Democracy price                                                                                                                      | Technocracy price                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| LHC            | Money 97,547.568; Knowledge 19,509.512; Copper 4,877.376; Cement 7,803.81; Aluminium 13,656.656; Titanium 1,950.952; Polymer 468.232 | Money 97,547.568; Knowledge 17,948.75; Copper 4,974.92; Cement 7,959.89; Aluminium 13,929.79; Titanium 1,989.97; Polymer 477.6 |
| Stock Exchange | Money 535,616.44; Plywood 4,463.472; Brick 3,570.776; Wrought Iron 1,785.392                                                         | Money 535,616.44; Plywood 4,552.74; Brick 3,642.19; Wrought Iron 1,821.1                                                       |
| Monument       | Crystal 54,000.896                                                                                                                   | Crystal 55,080.91                                                                                                              |
| Railway        | Money 448,326.032; Lumber 134,497.808; Iron 53,799.128; Steel 80,698.688                                                             | Money 448,326.032; Lumber 137,187.76; Iron 54,875.11; Steel 82,312.66                                                          |
| Nexus          | Money 254,526.344; Crystal 3,054.32; Iridium 1,781.688                                                                               | Money 254,526.344; Crystal 3,115.41; Iridium 1,817.32                                                                          |

Completeness is established by the native authority path, not by the count of observed offers. The pinned `arpa.js::physics()` enumerates the full private `arpaProjects` registry. `captured-arpa-mechanics.ts::readOffers` walks every captured registry key, applies the native offer and rank gate, and fails the whole sample if any offered state or adjusted cost is unreadable. The exact-demand adapter includes every currently offered project whose `arpa_<id>` setting is enabled; an unavailable catalog makes exact demand unavailable. At this checkpoint all five observed offers are enabled. Other enabled project toggles with no current native offer do not represent a priced current commitment.

At period 16 the Power plan contained 13 building adjustments: 12 increases and one decrease, with each planned target no greater than its current native `on_cap` (or native count fallback). The set-on targets were re-read before and after execution. The resulting state matched the plan: fission power 5→10, E-reactors 0→9, iridium mines 0→19, iridium ships 0→1, iron ships 1→0, elerium containment 7→8, mass drivers 11→14, city casinos 1→15, space casinos 0→14, quarries 1→42, sawmills 0→46, mines 0→35, and coal mines 0→36. The executor mirrors upstream `actions.js::setAction` power semantics: integer changes one unit at a time, checks the native cap, and queues the native `postPower` callback. It does not invoke Vue `power_on`/`power_off` methods, so those names are absent from the control-usage ledger; the adapter outcome and before/after root values are the effect evidence.

The native resource state reflects the new on-counts on the next game period: candidate `city.power` rises from `0.8` to `83.8` at period 17, while baseline remains at `0.8`. Candidate Power then adds five E-reactors at period 24 and three at period 32; baseline catches up in Power by period 40. No forced Physics redraw occurs for the epoch refresh. The integration regression asserts one initial Physics draw, a current Technocracy price, and a ready project-storage demand at the Power handoff.

## Final export delta

The first differing serialized state is period 16 and consists solely of the 13 planned building on-count changes. Period 17 adds the first production consequences (`city.power`, `city.power_total`, and building production fields) and ten resource stock differences. By period 200:

| State group                               | Result                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Power output and building on-counts       | Equal; `city.power` is `308.8` on both sides                                                                                  |
| Resource stocks                           | 24 amount fields differ; examples: Money `+185,875.42`, Knowledge `−7,537.41`, Lumber `+38,807.24`, Stone `+20,046.72`        |
| Resource production rates                 | Equal at period 200; they differed immediately after the period-16 adjustment                                                 |
| Technology, A.R.P.A. progress, government | Equal                                                                                                                         |
| Construction                              | Building counts equal; 35 city/space construction timer (`time`) fields differ because production advanced at different times |
| Jobs                                      | Equal at period 200; several worker assignments differed temporarily after the first production changes                       |
| Other material state                      | No additional differing fields after excluding the runner’s known wall-clock and market-trade noise                           |

The export mismatch is therefore a stable timing consequence of restoring the authorized Power cycle. Equal final Power does not erase the stock accumulated or spent while the two runs had different production and spending rates.

## Regression and measurement checks

The durable same-root integration regression lives in `tests/integration/runtime/captured-arpa-runtime-test.mjs`. It changes Democracy to Technocracy from an A.R.P.A. build callback during the current automation cycle, confirms the root identity is unchanged, verifies the native price is refreshed to 9.42, confirms the Power demand handoff contains project storage, and asserts no second Physics draw. `tests/bootstrap/core/captured-progression-control-test.mjs` asserts exactly one fresh native offer sample for a progression-epoch change and refuses stale offers when the new observation fails. Unreadable native project costs fail the whole catalog in the ARPA integration test; `captured-resource-demand-test.mjs` covers unavailable project catalogs and enabled current offers. Existing Power runtime cases cover authorized execution and refusal when prerequisite evidence is unavailable.

`stage3n-captured-runtime-performance.mjs` now reports, for each run, the accepted-window coverage denominator and total JavaScript duration per covered period. It keeps median/p95/maximum labeled as polling-window statistics, excludes and explains boundary-crossing windows, records state and control-usage hashes to reveal workload changes, and states that diagnostics-on timings include instrumentation overhead.

Production bundle check: after rebuilding, the bundle contains no Stage 3P observer code. The observer used for the bounded trace was compiled only into a local test-surface bundle and was removed with its temporary worktree.
