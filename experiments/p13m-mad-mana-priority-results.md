# P13M — Controlled MAD Mana protection priority experiment

Date: 2026-10-20

Repository branch / starting HEAD: `deadspace` / `4e1085371e69478217d5716d58fdc245fd71ce60`
Result: **B — No meaningful difference**, within this pinned deterministic fixture and 1,000-period horizon.

## Decision

All four arms made the same native Research purchases, reached both mandatory grants at the same periods, ended with byte-identical exports, and used the same Mana. The protection schedules changed the Gather ledger while current claims were admissible, but no Gather action was invoked in any arm. There is no measured strategy advantage or resource-efficiency difference in this run.

The result is scoped to the supplied save, settings, seed, epoch, snapshot, runner, and horizon. It does not establish production allocator behavior or CPU readiness.

## Controlled inputs

The machine-readable observations and full input hashes are in [p13m-mad-mana-priority-results.json](p13m-mad-mana-priority-results.json).

| Input                                             | Value                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinned upstream                                   | `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                                                                                                  |
| Game snapshot SHA-256                             | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`                                                                                                                               |
| Save                                              | `stage2f-fixed-progression-export.json`, SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`                                                                              |
| Settings                                          | Original SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`; effective SHA-256 `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131` (`autoResearch: true`) |
| Seed / epoch                                      | `42` / `2026-09-21T00:00:00.000Z`                                                                                                                                                                |
| Test bundle SHA-256                               | `49713f151a44f01332d9faefad8680643e88da1af69fa420c72c57d6fc20ddbc`                                                                                                                               |
| Source base / working source diff SHA-256         | `4e1085371e69478217d5716d58fdc245fd71ce60` / `89aaa548132c7766e30145d7ee901ab6096d07195de0f42ddfc17274b0740824`                                                                                  |
| Test-only implementation commit                   | `1b6230f6f9c34b93ef37327b7098dcb28b4b55a8`                                                                                                                                                       |
| Exact runner commit / working runner diff SHA-256 | `82d4e4aaf9d91f228e0b8e445d1a1c1341125dd4` / `144227dec54563a96dee86c77eb5899185215906bf7e41309d4d1ce18833a5b9`                                                                                  |
| Chromium                                          | `HeadlessChrome/151.0.7922.71`                                                                                                                                                                   |

The baseline did not use Stage 3I milestone times. A separate bounded preflight admitted both claims before the arms ran: `tech-black_powder` for 100 Mana and `tech-mad_science` for 50 Mana. Both had current native offers, matching offer/control generation 1, and eligible owner status. The preflight classifier reported 135 native path visits in its single call. No Research purchase was made by the preflight.

## Arm results

The common 200-period gate passed for all arms. Their initial exports matched byte for byte. Each arm recorded the expected active Gather protection during the first admitted cycles:

| Arm | Gather protection policy                                 | Protected quantity while active |   Black Powder grant |  Mad Science grant |        Both complete |
| --- | -------------------------------------------------------- | ------------------------------: | -------------------: | -----------------: | -------------------: |
| A   | Ordinary; no goal-directed protection                    |                          0 Mana | period 296, cycle 37 | period 64, cycle 8 | period 296, cycle 37 |
| B   | Concurrent                                               |                        150 Mana | period 296, cycle 37 | period 64, cycle 8 | period 296, cycle 37 |
| C   | Mad Science first, then Black Powder                     |               50 Mana initially | period 296, cycle 37 | period 64, cycle 8 | period 296, cycle 37 |
| D   | Black Powder first, then Mad Science if still incomplete |              100 Mana initially | period 296, cycle 37 | period 64, cycle 8 | period 296, cycle 37 |

The grants are verified native Research-owner results (`disposition: researched`), not forced controls. C recorded a transition to Black Powder protection only after the Mad Science grant was observed and current claim authority returned. In D, Mad Science had already completed before Black Powder, so the second protection was no longer needed. Before current evidence admitted claims again, lifecycle selection recorded its unavailable/suspended reasons and the Gather hook stopped protecting stock; it did not switch silently.

At period 1,000 every arm had Explosives level 2 and High Tech level 2, both starting at level 0, with neither obligation unfulfilled. Their final export SHA-256 was identical: `f6eee2196714d4f285ca6507e7562d6305e7cf5325151ab66541b8dc2dbc040b`. Each ended with 1,165.1144916907672 Mana in 4,200 capacity, at a current production rate of 1. MAD Research was not reached (`tech.mad` remained 0); the MAD reset statistic remained 528 in every arm.

The complete native Research purchase sequence matched across all arms: Rituals, Mad Science, Espionage, Reinforced Crates, Clerics, Magic, Black Powder, Dynamite, Flintlock Rifle, Boot Camp, Slave Market, Alchemy, Spy Training, and Electricity. Actual Mana spending was 475 total: Rituals 25, Mad Science 50, Clerics 100, Black Powder 100, Flintlock Rifle 100, and Alchemy 100. The other eight purchases cost no Mana. Both target grants therefore occurred in the same order and at the same times despite the different Gather protection schedules.

No Gather action was invoked: zero Gather action events and zero Gather Mana spending in each arm. The ledger still showed the intended intervention effect while claims were current: B reserved 150 Mana, C reserved 50, and D reserved 100, leaving zero stock spendable by Gather and different remaining accumulation amounts. The claims later suspended on unavailable current evidence and were ultimately released when verified prerequisite paths no longer required Mana. The starting Mana stock was 0.8498586580167977. Final stock minus starting stock plus observed Research Mana spending gives an implied balance increase of 1,639.2646330327504 Mana; this is an accounting residual, not a direct production counter.

## Work and authority evidence

Each 1,000-period arm recorded 125 mandatory-classifier calls and 13,346 native path visits. Each had 139 native `drawTech` calls, 28 native trace records whose serialized entries matched `research|tech`, 45,938 total native trace invocation records, and 22,969 calls in the automation control ledger. The arm counts matched exactly. The priority selector recorded its policy only after the existing independent claim planner admitted the claims. No intervention invoked or reordered Research controls.

There were 125 Gather ledger observations, 250 claim lifecycle events, and zero Gather action events per arm. One console error was recorded in each arm; there were zero uncaught page errors, promise rejections, or dialogs. No renderer CPU comparison or factorial benchmark was run.

Existing lifecycle and claim regressions exercise stale or absent offers, changed price/binding, root and progression changes, non-Mana shortages, unresolved evidence, queue/permission changes, capacity accounting, and completion/release behavior. The exact-runner regression verifies that the configured claim mode is absent after a page reload; the priority setting shares that one-load test intervention. The experiment evidence records the initial joint admission, deferred claim identity, verified grant transition, native purchase uniqueness, and fail-closed suspension.

## Reproduction and verification

Run from the repository root with the local `tools` checkout. The run used `82d4e4a` plus the recorded working diff; that exact runner support is committed locally as `tools` commit `dba71a9` for reproduction:

```powershell
node experiments/p13m-mad-mana-priority.mjs
node scripts/test.mjs domain/progression/research-prerequisite-obligations evolve/economy/resource-claim-lifecycle evolve/economy/captured-gather-resources
node tools/chromium-evolve-runner-test.mjs
npm run build
npm run check
git diff --check
```

No same-arm repeat was run because the four arms tied exactly and there was no apparent winner. Renderer CPU measurement and the full allocator's less-than-2% requirement remain unresolved; the next work item is the previously identified full-allocator performance work, not another Mana-priority replay.
