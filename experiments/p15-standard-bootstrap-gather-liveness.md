# P15 — Standard bootstrap Gather liveness

## Outcome: A — useful targeted Gather intervention demonstrated

The existing Gather owner can unblock the Standard Shroomi’s early Research when it is given a current, explicit `tech-sundial` target. With unchanged `current-full.json`, the targeted test intervention bought Sundial at period 16 using ten verified native Stone actions, then reached the same downstream Research grants as P14’s ten-click manual reference by period 5,000. A matched unchanged-settings arm remained at the starting state through period 10,000.

The experiment did not make routine production active. At period 10,000 the targeted run still had no Market, Quarry, or assigned production workers; Stone was again zero. It retained all three population, recorded no deaths, and had 25 starvation events with 17 Food. This bounded result demonstrates early Research liveness, not a self-sustaining economy.

## Phase 1 — ordinary Gather policy and native action

`autoBuild` is enabled in `current-full.json`, so the runtime calls the existing Gather owner. This is not missing owner authority. In [captured-gather-resources.ts](/D:/work/Evolve-Automation/src/adapters/evolve/economy/resources/captured-gather-resources.ts:338), `buildingAlwaysClick=false` and Primitive level 1 or higher set `stopped=true`. The domain planner then skips every routine direct target except Food at zero stock in [gather-resources.ts](/D:/work/Evolve-Automation/src/domain/economy/resources/gather-resources.ts:73). At the P14 boundary Primitive is level 2, Food is 40, and Stone is 0, so the planner deliberately omits Stone even though the captured `undefined-stone.action` control is live. `buildingAlwaysClick=true` clears that cutoff and restores all routine Gather targets.

For ordinary gathering, the planner computes a click amount from the resource capacity gap, `resourcesPerClick`, and the configured click limit. The captured adapter invokes the native control once per click, requires the same root and pre-click stock, and compares post-click stock with the planned native yield. The pinned game’s Stone action is created by `buildTemplate("stone", region)` at [evolve-deadspace.js](/D:/work/Evolve-Automation/test-artifacts/game/evolve-deadspace.js:116190): it adds `this.val(true)` through `modRes` while Stone is below capacity and returns `false`. That return value is not an invocation failure; stock change is the postcondition. In this Standard Shroomi state the native action yields one Stone per click, as independently shown by P14’s ten native clicks.

## Phase 2 — existing-policy comparison

Arms A and B used the same P14 Standard Shroomi export, seed, pinned game, and normal automation bundle. B changed only `buildingAlwaysClick` to `true`.

| Measure                            | A — `current-full.json` |                                                                                                                       B — `buildingAlwaysClick=true` |
| ---------------------------------- | ----------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------: |
| Sundial native Research action     |     None through p5,000 |                                                                                                                                                  p16 |
| p5,000 day / population            |                   0 / 0 |                                                                                                                                              250 / 6 |
| p5,000 Research grants             | None beyond Primitive 2 | Primitive 3, Composting 2, Housing 1, Currency 1, Basic Storage 1, Stone Axes 1, Mining 1, Scientific Method 1, Military 2, Banking 1, Stone Lodge 1 |
| Native Gather calls through p5,000 |                       0 |                                                                                                                Food 1,911; Lumber 2,287; Stone 1,739 |
| Gather calls that threw            |                       0 |                                                                                                                                                    0 |
| p5,000 Food / Lumber / Stone       |             40 / 72 / 0 |                                                                                                                                  2,400 / 1,000 / 700 |
| Active jobs / Market               |         None / inactive |                                                                                                 Lumberjack 3, Quarry worker 3, Garrison 2 / inactive |
| Starvation events / deaths         |                   0 / 0 |                                                                                                                                                0 / 0 |

B resolves the bottleneck, but it spends 5,937 routine Gather clicks across Food, Lumber, and Stone. The large recurring resource surplus and unrelated Food/Lumber clicks make that setting too broad for this target; it is diagnostic evidence for the stop policy, not the recommended configuration.

P14’s retained reference used ten direct native Stone clicks before 5,000 periods of unchanged automation. It ended at day 250 with the same downstream grants, population 3, no deaths, 6 starvation events, Food 47, Lumber 17, and Stone 0. P15’s owner-driven target reached those same grants at day 250, population 3, and no deaths, with 9 starvation events, Food 17, Lumber 17, and Stone 0. The small Food/starvation difference is retained as observed; no cause is assigned to it.

## Phase 3 — targeted test intervention

The test-surface-only `tech-sundial` target is sampled at the Gather boundary. It reuses the current-cycle offered-tech observation when present, otherwise samples once; the ordinary Research owner reuses that cycle’s catalog. Admission requires the current root and progression generations, an offered Sundial row with complete current native price, matching Research action generation, and the current Stone action generation. The adapter also requires current Stone stock and its pre-action quantity to match.

Only the existing Gather planner and executor can perform the work. The target supplies the exact current Stone price and a ten-click maximum. The planner computes only the Stone shortage, caps clicks by that budget and the ordinary click limit, and leaves normal Food safety policy in place. The executor checks the current offer/control generations, verifies native stock after Gather, and stops once the price is covered. The target, price, and stock are sampled again on the next cycle. No Research action, selection, reservation, or runner-side game click was added.

## Phase 4 — controlled validation

The exact Chromium runner compared an unchanged-settings arm with two identical target arms from the same fixture. The target invoked `undefined-stone.action` ten times, with zero native control throws, and bought `tech-sundial.action` at p16. By p5,000 it had the grants listed in the P14 reference; the unchanged arm remained at day 0 with original stocks and no Gather or Research action calls. At p10,000 the target still retained those grants, all three population, and zero deaths; Food was 17, Lumber 17, Stone 0, the Market was inactive, no Quarry existed, and three workers remained unemployed. The continued low Food and starvation count show that this intervention does not repair the later economy bottleneck.

The two target contexts produced identical exports and native control counts at both p5,000 and p10,000. The first Sundial action was at the same exact period in both contexts. Exact period, export, control-use, diagnostic-count, and input-hash evidence is retained in the JSON evidence files.

## Reproduction and evidence

Run from the repository root:

```powershell
node experiments/p15-standard-bootstrap-gather.mjs
node experiments/p15-standard-bootstrap-gather-exact.mjs
```

The phase 2 comparison and controlled replay evidence are in [p15-standard-bootstrap-gather-policy-comparison.json](/D:/work/Evolve-Automation/experiments/p15-standard-bootstrap-gather-policy-comparison.json) and [p15-standard-bootstrap-gather-evidence.json](/D:/work/Evolve-Automation/experiments/p15-standard-bootstrap-gather-evidence.json). They record source, test bundle, normal bundle, exact runner, save, settings, game, hashes, native control usage, states, execution counts, and deterministic export parity. P14’s offer and manual-click evidence are linked from the controlled replay JSON.

No renderer CPU campaign was run. Production CPU admission remains unresolved.
