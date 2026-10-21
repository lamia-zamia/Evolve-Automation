# P16 — Standard bootstrap to active production

## Outcome

**B. Native production improves, but sustainability remains blocked by Food supply.** The explicit, test-only Stone Axe Gather target purchased Stone Axe and the native Research owner assigned Lumberjack workers. That job remained active through p10,000. The replay did not activate a food-producing job or a Lumber Yard, and population starvation worsened. Treat this as a bounded causal result, not a production policy approval.

## P15 bundle correction

Commit `1d59ccae` moved the P15 `stopTargetAfterClick` decision fully behind the compile-time test-surface guard. The normal `evolve_automation.user.js` was rebuilt; it has no `stopTargetAfterClick` or targeted Research hook identifiers, and the build produced no generated-bundle diff. Focused Gather tests and the commit hook's full check passed for that separate commit.

## Fixture and replay

The exact Chromium replay used the retained P14 post-fix Standard Shroomi save, seed 42, pinned Evolve `db38e2af831907d49aeb5348d678d8d8745d6c3f`, and the existing Standard settings with `buildingAlwaysClick: false`. Arms were P15 Sundial-only, the existing always-click diagnostic reference, and two identical candidate replays. Each started from the same save. Both candidate exports and native control-usage counts matched at p5,000 and p10,000. The P15 replay also reproduced its retained p5,000 and p10,000 export hashes exactly.

Machine-readable inputs, observations, period events, resource actions, states, failures, and hashes are retained in `p16-standard-production-bootstrap-evidence.json`. The replay harness is `p16-standard-production-bootstrap-exact.mjs`.

## Causal finding

All four arms bought Sundial at p16. The first material post-Sundial divergence was the native Stone Axe purchase: always-click bought it at p480; the candidate bought it at p688; the P15 targeted baseline did not buy it in the 2,500-period event window. The native offer required **45 Knowledge, 20 Lumber, and 20 Stone**. At the current offer observation, the P15 path had Knowledge 46.1, Lumber 17/200, Stone 0/200 (and Food 5/1000). Thus Stone Axe was blocked by both a 3-Lumber shortage and a 20-Stone shortage, not by Knowledge. The candidate's exact-price targeted Gather spent 3 Lumber and 20 Stone actions to meet that shortfall, then native Research purchased the current Stone Axe offer at p688.

Stone Axe grants one axe, reveals Lumberjack, and initializes the Lumber Yard. The native Research owner subsequently assigned Lumberjack workers. In the candidate, the first assignment was p688, with 4 active Lumberjacks at p5,000 and 8 at p10,000. That is useful native production. The P15-targeted baseline retained three unemployed Shroomi at both checkpoints because this tech/job unlock was never reached. The always-click diagnostic reached the axe earlier and also had Quarry Workers by p1,000, but it issued 4,026 Lumber/Stone Gather actions through p5,000.

The P15 Sundial intervention itself gathered Stone only to Sundial's exact 10-Stone price. Sundial then consumed those 10 Stone, leaving no stock for the Stone Axe offer. It also left Lumber at 17, short of the axe offer's 20. Construction's live saving target at the Stone Axe offer was Compost at 12 Lumber and 12 Stone. Current managed native Building options and prices at that observation were Compost (12 Lumber, 12 Stone), Basic Housing (19 Lumber), and Shed (75 Money, 55 Lumber, 45 Stone). The captured current Building controls were `city-lumber`, Compost, Basic Housing, and Shed; there was no Lumber Yard or Rock Quarry action in that snapshot. Native first-build data identifies the Lumber Yard as requiring Axe 1 and costing 6 Lumber/2 Stone, and Rock Quarry as requiring Mining 1 and costing 50 Lumber/10 Stone. Candidate had Mining 1, but this bounded intervention stopped gathering once the Stone Axe target was satisfied and did not coordinate with Construction or pursue either building.

Food gathering does not sustain this path. There was no active food-producing job; the Food clicks were manual Gather actions. The retained P15 baseline made 1,750 Food Gather calls through p5,000 yet ended with Food 17, three population, and 9 starvation events. At p10,000 it had 3,550 calls, Food 17, and 25 starvation events. The candidate needed 6,700 Food calls by p5,000 and 14,200 by p10,000, while starvation climbed to 58 and 155 respectively (no deaths). Its Food stock was 50 at p5,000 and 3.25 at p10,000. This increased manual gathering did not establish a food economy.

## Bounded intervention

The continuation is restricted to explicit test-surface targets `tech-sundial` and `tech-stone_axe`. Before each work cycle it resolves the current native offer and exact cost, verifies offer/control/root/progression generations and unchanged price identity, checks nonmaterial affordability, and captures current Lumber/Stone holdings and capacity. The existing Gather owner executes the native resource actions. Stone Axe gathering only addresses current Lumber and Stone price shortfalls, with a five-click per-resource cap and five-click per-resource work-cycle cap (at most ten material clicks per cycle). It stops when the named target is satisfied, unavailable, or invalidated. The Sundial target retains its 10-action Stone cap. No Market, generic prerequisite traversal, Building ownership, Construction ownership, Food policy, or resource-claim rules were changed. Conjuring and resource claims are reflected in the test planner.

The production bundle contains zero instructions for these target hooks; the intervention exists only in the compile-time test surface. Deterministic extra work in a candidate Gather cycle is one current-offer lookup, two bounded material-resource checks, plus fresh price, action-control, root, and progression validation around targeted clicks. The accepted click cap is at most ten native material actions per cycle. No timing or renderer-CPU campaign was run; P13Q's retired selector was left intact.

## Results through p10,000

| Measure                                |   P15 targeted |      Candidate |                    Always-click reference |
| -------------------------------------- | -------------: | -------------: | ----------------------------------------: |
| Stone Axe purchase                     | none by p2,500 |           p688 |                                      p480 |
| Active jobs at p5,000                  |   unemployed 3 |   Lumberjack 4 | Lumberjack 3, Quarry Worker 3, Garrison 2 |
| Population / starvation at p5,000      |          3 / 9 |         5 / 58 |                                     6 / 0 |
| Food / Lumber / Stone at p5,000        |    17 / 17 / 0 |   50 / 200 / 0 |                       2,400 / 1,000 / 700 |
| Food Gather calls at p5,000            |          1,750 |          6,700 |                                     1,911 |
| Lumber + Stone Gather calls at p5,000  |             10 |             33 |                                     4,026 |
| Total Gather calls at p5,000           |          1,760 |          6,733 |                                     5,937 |
| Active jobs at p10,000                 |   unemployed 3 |   Lumberjack 8 |                   not replayed to p10,000 |
| Population / starvation at p10,000     |         3 / 25 |        8 / 155 |                   not replayed to p10,000 |
| Food / Lumber / Stone at p10,000       |    17 / 17 / 0 | 3.25 / 200 / 0 |                   not replayed to p10,000 |
| Food Gather calls at p10,000           |          3,550 |         14,200 |                   not replayed to p10,000 |
| Lumber + Stone Gather calls at p10,000 |             10 |             33 |                   not replayed to p10,000 |
| Total Gather calls at p10,000          |          3,560 |         14,233 |                   not replayed to p10,000 |

Against always-click, the candidate avoided 3,993 Lumber/Stone Gather actions through p5,000 but added 4,789 Food actions, for 796 more Gather actions overall. Relative to P15 targeted, it added 4,950 Food actions by p5,000 and 10,650 by p10,000. No candidate native control throws or stale-action rejections were observed. The candidate had Stone Axe, Mining, Science, Garrison, Banking and Hot Compost grants by p5,000; these grants did not create a food-producing job. Candidate export bytes and native control usage were deterministic across both replays at both checkpoints.

## Verification

- `npm run typecheck` and focused Gather/Research-surface tests passed.
- `npm run build` passed; the normal output contained no test-target hook identifiers and had no generated diff.
- `node tools/chromium-evolve-runner-test.mjs` passed all runner contracts, including determinism and isolation.
- `npm run check`: all 359 test files and type checks passed; format initially flagged six pending P16 files, to be normalized before the final check.
- `git diff --check` and the final complete `npm run check` are run before commit.
- `tools/` remained `master...origin/master [ahead 3]` with no changes.

## Review boundary

Outcome B is the recommended disposition. Lumberjack production becomes active and persists, but the path is not economically sustainable: no food-production owner activates, starvation rises, manual Food gathering more than offsets the avoided material clicks, and the Lumber Yard/Quarry remain unbuilt. Stop here for independent review before considering any separate Food or Construction intervention.
