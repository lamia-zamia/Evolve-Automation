# P17 — Standard Shroomi Compost production bootstrap

## Decision

**C — the current Construction owner does not keep Compost as its supported target long enough to activate it safely.** The first post-Stone-Axe Construction decision selected Compost, and its live native price was verified as 12 Lumber and 12 Stone. The bounded Gather intervention supplied the Stone cost; however, the owner had selected `city-shed` by period 800, before any native `city-compost.action` purchase. The intervention stopped when Compost ceased to be the current saving target. It did not call Build or force Compost into the plan.

The B replay therefore built no Compost, produced no Food from Compost, and did not improve Food gathering or starvation versus P16. This run does not establish whether Compost would have improved sustainability after purchase; the always-click reference shows its measured native marginal output.

## Native mechanics audit

The pinned source is `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`.

- `src/races.js`: Shroomi uses the `fungi` genus. The genus grants Detritivore rank 1, which returns a 60% production modifier.
- `src/main.js`: outside Ice Age, operating Compost consumes 0.5 Lumber per structure per second (subject to available Lumber) and produces `1.2 + Compost technology × Detritivore factor` Food per operating structure per second, before environment and other modifiers. Population consumption is separately entered in the native Food consumption breakdown.
- `src/actions.js`: `city-compost` requires Composting technology 1. At count zero its current native price is 12 Lumber and 12 Stone. Buying it pays that cost, increments both `count` and `on`, and adds 200 Food storage. The price scales for later purchases.
- The existing Construction observation publishes its current saving target and cost; native Build remains the only path that buys a building. Composting technology 2 is only an unlock and does not build or operate Compost.

Native observations confirm these mechanics. In the always-click reference, Compost was first bought at period 64. At p5,000 it had `count=7`, `on=7`; the native Food breakdown reported `Compost Heap=23.52v`, population Food consumption `-8v`, and Compost Lumber consumption `-3.5v`. At p10,000 it had `count=12`, `on=12`; the breakdown reported `40.32v` Compost Food, `-14v` population Food consumption, and `-6v` Compost Lumber consumption. The Food storage cap was 2,400 and 3,400, respectively. These values come from the pinned game's exposed `debug.js` breakdown clone, not technology level, `on_cap`, or `resource.diff`.

## Boundary and intervention

At period 696, immediately after the verified Stone Axe purchase at 688, the existing Construction observation showed:

| Observation                              | Value                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Saving target and current native price   | `city-compost`; 12 Lumber, 12 Stone                                                            |
| Root generation / progression generation | `0` / `0\|8:9\|4:0\|26\|shroomi\|standard\|0\|0\|anarchy\|1\|0\|0\|0`                          |
| Board control revision                   | 957                                                                                            |
| Compost / Gather control generations     | 6 / Lumber 8, Stone 8                                                                          |
| Gather controls                          | `city-lumber`, `undefined-stone`                                                               |
| Holdings at boundary                     | Lumber 6/200; Stone 0/200                                                                      |
| Construction commitments                 | Lumber requested 12 (max cost 55); Stone requested 12 (max cost 45)                            |
| Construction / Research queues           | empty / empty                                                                                  |
| Permissions                              | master script, autoBuild, autoARPA, autoResearch and autoJobs enabled; buildingAlwaysClick off |
| Protected resource claim                 | none                                                                                           |
| Compost count / on                       | 0 / 0                                                                                          |

The intervention read that live owner target and live native price, validated the current root, progression and control generations, queue state, Gather permissions, reservations, and protected claims, then used the existing Gather owner with a strict five-click-per-resource cap. It required no new Research draw or prerequisite search. It did not gather extra Lumber when the live inventory already covered that price, did not retain prices or control handles across cycles, and did not call Build.

The target trajectory shows the owner's next selection. By period 800, the saving target was `city-shed`, with a live saving cost of 75 Money, 55 Lumber and 45 Stone. At that observation, Holdings were 67.875 Lumber and 12 Stone, queues remained empty, and permissions were unchanged. The owner had therefore moved its current plan away from Compost even though Compost's 12 Stone had been supplied. The test intervention correctly stopped targeting Compost; it did not replace the owner's `city-shed` choice.

## Controlled replays

All arms use the authentic P14 Standard Shroomi save, game snapshot, seed 42 and epoch `2026-09-21T00:00:00.000Z`.

- **A — P16 targeted Research bootstrap:** retained P16 replay evidence. It used the same fixture and settings hashes. At p5,000 it had 5 population, 58 starvation events, 50 Food, 200 Lumber, 0 Stone, 0 Compost, and 6,750 Food Gather calls. At p10,000 it had 8 population, 155 starvation events, 3.25 Food, 200 Lumber, 0 Stone, 0 Compost, and 14,250 Food Gather calls.
- **B — P16 plus bounded Compost demand:** replayed with the P17 test surface. Its duplicate replay matched exported saves, native control usage and the sampled Construction-target trajectory at both checkpoints.
- **C — always-click reference:** replayed at p5,000 and p10,000. Its first Compost purchase was at period 64; its retained counts and native output are above.

The game save was changed in memory only to set its debug-only `settings.expose` flag, which causes the pinned source to publish cloned native state and breakdowns. The saved fixture on disk and its hash were unchanged. All arms used the same observation setting. This exposes genuine Food production, Food consumption, and Lumber consumption values.

### Checkpoints

| Arm / period | Population | Starvation events | Deaths | Food stock / cap | Compost count / on | Food Gather calls | Lumber Gather calls | Stone Gather calls |
| ------------ | ---------: | ----------------: | -----: | ---------------: | -----------------: | ----------------: | ------------------: | -----------------: |
| A p5,000     |          5 |                58 |      0 |       50 / 1,000 |              0 / 0 |             6,700 |                   3 |                 30 |
| B p5,000     |          5 |                58 |      0 |       50 / 1,000 |              0 / 0 |             6,700 |                   8 |                 42 |
| C p5,000     |          6 |                 0 |      0 |    2,400 / 2,400 |              7 / 7 |             1,911 |               2,287 |              1,739 |
| A p10,000    |          8 |               155 |      0 |     3.25 / 1,000 |              0 / 0 |            14,200 |                   3 |                 30 |
| B p10,000    |          8 |               155 |      0 |     3.25 / 1,000 |              0 / 0 |            14,200 |                   8 |                 42 |
| C p10,000    |         12 |                 0 |      0 |    3,400 / 3,400 |            12 / 12 |             2,405 |               6,717 |              3,246 |

The P17 B Stone count is 42 versus P16's 30: the extra 12 native Stone Gather actions supplied the current 12 Stone Compost price. B also made five more Lumber Gather actions than P16 by p5,000 (8 versus 3), with Lumber at its 200 cap at both checkpoints. It bought no Compost: native `city-compost.action` calls were zero, and Compost `count` and `on` remained zero.

At p5,000, the B Food breakdown reported `Compost Heap=0v`, population consumption `-5v`, Food stock 50/1,000, and no Compost Lumber consumption. At p10,000 it reported `Compost Heap=0v`, population consumption `-8v`, Food stock 3.25/1,000, and no Compost Lumber consumption. The always-click reference's corresponding native output was 23.52v and 40.32v Food; its population consumption was -8v and -14v, with -3.5v and -6v Lumber consumed by Compost.

Starvation increments were 58 for A and B through p5,000, then another 97 for each through p10,000. C had zero in both windows. B's manual Food Gather call count was identical to A at both checkpoints. The per-population checkpoint ratios were 1,340 and 1,775 Food Gather calls for A/B, versus 318.5 and 200.4 for C. Using 100-period native samples, B recorded 19.97 and 20.08 Food Gather calls per 100 population-periods at p5,000 and p10,000; C recorded 7.64 and 4.20. Per sampled unit of native population Food demand, B was 0.2036 and 0.2027 calls; C was 0.0714 and 0.0349. A's retained P16 evidence does not include the same native-demand samples, so no demand-normalized A value is inferred.

At p5,000, B had four Lumberjack workers and had purchased eight Basic Housings; at p10,000 it had eight Lumberjacks and still no Compost, Lumber Yard or Rock Quarry. The observed Research sequence remained the P16 sequence, including Stone Axe at period 688 and Composting technology 2. No B native failures or stale-action rejections were recorded. No broken resource claim or queue was observed. The always-click arm had three Lumberjacks, three Quarry Workers and two Garrison workers at p5,000; at p10,000 it had six Lumberjacks, five Quarry Workers, one Miner and two Garrison workers.

## Reproducibility and parity

Machine-readable inputs, current native offer, authority snapshots, 100-period state and breakdown trajectories, native actions, checkpoints, duplicate comparison and P16 retained evidence are in [p17-standard-production-bootstrap-evidence.json](p17-standard-production-bootstrap-evidence.json). The exact runner is [p17-standard-production-bootstrap-exact.mjs](p17-standard-production-bootstrap-exact.mjs).

| Input                                  | SHA-256 / identity                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| P14 fixture save                       | `96e6afc6384267a6d83402a863a033be40674f335432c6f4601614b2664cf882`           |
| Current-full automation settings       | `f7fd9286607695d8716359f20f1a5f680264832de36879f84a7a67c4bd970042`           |
| Pinned game snapshot                   | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`           |
| Test-surface replay bundle             | `0e7ba02c5fcb9b43e8aefea50551c84be5090a8700e865c89fc30bb0599f10fd`           |
| Starting and rebuilt production bundle | `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`           |
| Game / seed / epoch                    | `db38e2af831907d49aeb5348d678d8d8745d6c3f` / 42 / `2026-09-21T00:00:00.000Z` |

The two B exports and action traces match at p5,000 and p10,000. Production bundle bytes match the starting P16 bundle. P17's intervention and trajectory hooks are test-surface only. Routine existing Gather behavior and the P15 Sundial / P16 Stone Axe experiments remain unchanged.

The B test surface records one Construction-target boundary sample at period 696, then samples the current Construction saving target every 100 periods (29 records by p5,000 and 58 by p10,000; same-period duplicate reads are retained). Native Food/Lumber breakdown snapshots are sampled every 100 periods (50 by p5,000 and 100 by p10,000). Each Gather input reads the current Construction target once; before each target-material action it revalidates the target and price, root/progression generations, queues, Build control, and Gather control generations. Native Gather call totals and counts by action are retained in the machine evidence. No routine Food Gather actions were saved: B made the same 6,700 and 14,200 Food calls as A.

## Validation

Focused Gather tests passed. The final exact P17 runner passed with deterministic duplicate exports and action traces. `npm run build` passed and retained the starting production bundle SHA-256 `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`. `npm run check` passed all 359 test files plus bundle syntax, type checks, architecture checks, lint, and formatting. `git diff --check` passed.
