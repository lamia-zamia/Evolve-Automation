# P43 — Food-safe Jobs allocation and population-growth attribution

## Result

**Authority result: D — evidence blocked. Diagnostic replay result: C — Jobs-only allocation is insufficient after the military Food demand rises.**

The unchanged ordinary planner proposes 2 Farmers / 2 Quarry Workers at the p720 Quarry unlock. With current p720 modifiers, the formula-derived minimum is 3 Farmers, so 3 Farmers / 1 Quarry Worker is a bounded diagnostic alternative. It conserves the four civilian workers, fits the physical job capacities, and projects Food at +0.335 per tick. The pinned Jobs catalog has no current external worker-commitment registry, so this branch explicitly assumes an empty commitment set and cannot authorize the alternative.

The exact diagnostic B replay initially records positive Food and Stone with 3 Farmers / 1 Quarry Worker. By p4000 it reaches four Garrison soldiers while civilian population and housing remain 4 / 4. Food consumption is then 8; the one existing Farm and four available Farmers cannot produce a positive flow even after Quarry employment falls to zero. Food runs out at p5626, native starvation first increments at p5630, and the first Jobs observation showing starvation is p5632. No deaths are recorded. B ends p10000 with 4 Farmers / 0 Quarry Workers, Food flow −0.82, Stone flow 0, Food stock 36.264, Stone stock 72.630, and cumulative starvation 14.

This experiment does not establish autonomous success. It pairs P43's test-only Jobs decision diagnostic with the separately test-only P42 Construction substitution. It does not change production Jobs policy, Construction priorities, Gather behavior, or persisted job settings.

## Identity and artifacts

- Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f` (SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`).
- P42 base, harness, and tests: `62e9d353`, `3b10fe0e`, and `bb848c55`.
- Arms: A = P42 baseline; B = P42 plus the qualified test-only Jobs allocation; B-repeat = identical diagnostic repeat. All run to p10000.
- [Machine-readable Food, labor, population, Stone and modifier timeline](p43-food-safe-jobs-timeline.json).
- [Machine-readable replay, policy, outcome and performance evidence](p43-food-safe-jobs-evidence.json).
- [Pure diagnostic policy](p43-food-safe-jobs-policy.mjs), [exact replay wrapper](p43-food-safe-jobs-exact.mjs), [trace instrumentation](p43-food-safe-jobs-trace.mjs), and [focused regressions](../tests/experiments/p43-food-safe-jobs-test.mjs).

The timeline records every captured Jobs cycle, including all occupied jobs, unassigned workers, servants, the full Farmer and Quarry Worker catalog facts, Food rows and modifiers, Stone flow and stock, population, housing, starvation, deaths, and the native Construction saving target. It retains 1,161 Jobs observations per arm and bounded transition checkpoints. B-repeat is represented by its event digest and final export hash because its complete observations are compared against B in the evidence artifact.

## Stage 1 — Food collapse attribution

Population stays at four with housing capacity four except for brief population losses after starvation. The native consumer row is `Human`; the pinned `foodConsumption()` formula includes civilians and Garrison soldiers. Consumption is therefore not evidence of civilian population growth: it rises when the military Garrison grows. Soldier hunting also adds a separate Food producer row. The ordinary Jobs pool accounts for all four residents at retained full-population samples, with zero unassigned workers and zero servants. The Garrison counts shown in the tables are separate from that four-worker civilian pool.

P43 reports Food production in the same phase as the native net flow: `Food.diff + absolute sum(Food consumer rows)`. This accounts for current percent modifiers. P42's retained `foodOutput` field summed raw producer rows without applying those modifiers; for example, P42's raw values at p2000, p4000 and p10000 were 4.015, 4.681 and 6.649, while P43's phase-correct measured output is 4.35, 4.16 and 7.15. P42 save and state checkpoints remain comparable; the old raw output sum is not used as measured production here.

### A — P42 baseline

`F/Q/G` means civilian Farmers / Quarry Workers / Garrison workers. Garrison is shown because it affects Food consumption, although its soldiers are outside the civilian Jobs allocation pool.

|         Period | Population / housing | Occupied jobs                | Food output / consumption / net; stock | Stone output; stock  | Starved / deaths |
| -------------: | -------------------: | ---------------------------- | -------------------------------------- | -------------------- | ---------------: |
| 720 checkpoint |                4 / 4 | 2F / 2Q / 0G                 | 5.32 / 4 / +1.32; 158.178*             | 0; 0                 |            0 / 0 |
|            728 |                4 / 4 | 2F / 2Q / 0G                 | 3.348 / 4 / −0.652; 156.874            | 2; 4.080             |            0 / 0 |
|           1000 |                4 / 4 | 2F / 2Q / 0G                 | 3.30 / 4 / −0.70; 117.091              | 2; 142.514           |            0 / 0 |
|           1584 |                4 / 4 | 2F / 2Q / 1G                 | 3.68 / 5 / −1.32; 1.464                | 2; 179.069           |            0 / 0 |
|    1588 → 1589 |            4 → 3 / 4 | 2F / 2Q / 1G before the loss | 3.68 / 5 / deficit; 0.145 → 0          | 2; 181.109 → 181.364 |        0 → 1 / 0 |
|           2000 |                4 / 4 | 2F / 2Q / 2G                 | 4.35 / 6 / −1.65; 43.398               | 2; 381.723           |            2 / 0 |
|    2464 → 2472 |            3 → 4 / 4 | 2F / 0Q / 2G → 4F / 0Q / 2G  | At 2472: 5.98 / 6 / −0.02; 49.981      | 0; 600               |            4 / 0 |
|           4000 |                4 / 4 | 2F / 2Q / 4G                 | 4.16 / 8 / −3.84; 34.901               | 2; 600               |           10 / 0 |
|           5000 |                4 / 4 | 4F / 0Q / 4G                 | 6.62 / 8 / −1.38; 38.982               | 0; 600               |           12 / 0 |
|          10000 |                4 / 4 | 4F / 0Q / 4G                 | 7.15 / 8 / −0.85; 46.609               | 0; 600               |           26 / 0 |

*At p720, the saved checkpoint already has the post-Jobs 2F/2Q counts while its Food breakdown still reflects the pre-Jobs four-Farmer production. The synchronized p728 observation is the first valid measured output for the changed assignment.

The stock transition distinguishes starvation from the coarser Jobs samples. In A, Food reaches zero and the native starvation counter first increments at p1589, reducing population from four to three. The first sampled Jobs observation that reports the increment is p1592. The population later returns to four. At p2000, Food consumption has risen from four to six while civilian population is still four; the Garrison has two soldiers. By p4000, four Garrison soldiers raise consumption to eight. Weather is also relevant to output: p2000 Weather is +10%, p4000 is −15%, and p10000 is +10%. Soldier hunting contributes 0.667 Food at p2000 and 1.333 at p4000 and later, but it does not cover consumption. The retained city has one Farm throughout these transitions, with no active Mill or Biodome Food output. Relevant research moves from Agriculture II at p720 to Agriculture III by p1584; Science I is present by p1000 and Military I by p1584. Hoe and Hunting research remain zero in these samples. These research and production modifiers affect the source projection; the observed consumption increase follows Garrison size.

At p720, the captured Jobs boundary is pre-executor: current input is 4F/0Q, while unchanged `planJobs()` returns 2F/2Q. The post-executor p720 checkpoint has 2F/2Q, but its old Food ledger still shows four-Farmer output. At p728 the synchronized native Food production is 3.348, consumption is 4, and net is −0.652. The 2F/2Q allocation remains through p1000.

### Why ordinary Jobs drops Quarry Workers

At p720 the captured Farmer row has native minimum 2, `smartMaximum` 2, and physical maximum −1 (unlimited in the native catalog, bounded here by four residents). Quarry Worker is unlocked and managed, also has physical maximum −1, split allocation enabled, breakpoints `[4, 10, 0]`, and a very large smart maximum. The Farmer split flag is false, with three maximum-safe breakpoints. The unchanged ordinary planner returns 2F/2Q and selects Quarry as its ordinary default candidate.

Stone reaches its 600 storage cap by p2000. Quarry Worker's captured `smartMaximum` first becomes zero at p2464; ordinary Jobs first assigns 4F/0Q at p2472. The recorded cause is the native smart cap after Stone storage fills, not a Food-sustainability rule. Food remains slightly negative at p2472 and substantially negative later, so moving the remaining workers to Farmer does not solve the growing military demand. The timeline retains minimum, physical maximum, smart maximum, split and breakpoint fields separately at every Jobs observation.

P42's native Construction saving target is Quarry immediately after the p720 purchase (68 Lumber / 14 Stone). It changes to Farm at p728 (27 Lumber / 14 Stone), then University at p936 (400 Money / 300 Lumber / 400 Stone), which remains the saving target through p10000. The unchanged priority path does not purchase the Farm. The P42 test-only Construction owner substitution causes the native Quarry purchase that establishes this replay state; P43 makes no purchase or Construction change.

## Stage 2 — Dynamic Farmer floor and evidence boundary

The reviewed sources are [`jobs.ts`](../src/domain/civic/jobs.ts), [`captured-ordinary-jobs.ts`](../src/adapters/evolve/civic/captured-ordinary-jobs.ts), [`captured-job-catalog.ts`](../src/adapters/evolve/civic/captured-job-catalog.ts), and [`economic-coordination.ts`](../src/domain/progression/economic-coordination.ts). The ordinary `planJobs()` stays unchanged. The captured catalog distinguishes native minimum, physical maximum and smart maximum; it does not expose an external same-cycle worker-commitment set. P39 already labels its 3F/1Q four-resident and 4F/1Q five-resident candidates conditional on that missing evidence. P39's 1.2 multiplier is not reused as a live constant.

The pinned Farmer source uses Farmer impact 0.82. A Farmer working a Farm receives the current full-Farm bonus (0.65 below Agriculture II, 1.15 from Agriculture II); Farmers over Farm capacity act as farmhands and keep the 0.82 impact. For supported Standard Human facts, the projection is:

```text
farmerBase(F, farms) = min(F, farms) × (0.82 + currentFarmBonus)
                     + max(0, F − farms) × 0.82
projectedFood(F) = independentlyVerifiedOtherFood + farmerBase(F, farms) × liveModifier
foodFloor = smallest native-eligible F for which
            projectedFood(F) − currentFoodConsumption > 0.01
```

The live modifier is derived from current native Food output (`Food.diff` plus all current consumers), the current Farmer assignment and Farmer formula, and current Mill, Virgo, Weather, Quarantine and shared production factors. Soldier hunting is separately modeled from the pinned source and current Soldier ledger/quarantine facts. Every native Food consumer row is included. An active non-Farmer source without a verified effective-output formula, missing modifier row, stale Jobs/root/work-cycle snapshot, unsupported race/formula path, or unaccounted servant assignment makes the result unavailable. No static three- or four-Farmer floor is assumed. The strict 0.01 margin means equality and tiny negative flow do not count as sustainable.

The formula output is a **projection**, not a native measurement of a hypothetical allocation. Each observed native output and Food net is retained separately in the timeline. The p720 projection gives floor 3, ordinary 2F output 3.351 against consumption 4 (−0.649), and alternative 3F output 4.335 (+0.335). The following native 3F/1Q output is 4.332 (+0.332), confirming the production phase to rounding. At p4000 the model returns `infeasible`: under the current one-Farm, four-Farmer cap, no civilian Jobs allocation can cover current consumption of eight.

Pinned upstream references are `test-artifacts/game/evolve-deadspace.js:104296-104340` for Farmer impact, `:105580-105598` for Farmer value modifiers, `:150653-150678` for Farm slots and farmhands, and `:150783-150895` for Food consumption and separately reported soldier hunting. The four-resident formula is not carried forward as population, Army, research, or modifier state changes.

## Stage 3 — Jobs conflict and conditional alternatives

At the p720 boundary, ordinary `planJobs()` returns exactly 2F/2Q. The captured native Farmer minimum and smart maximum are both two; its physical maximum is unlimited. The food floor is three. The proposed 3F/1Q assignment accounts for all four civilian residents, has no other civilian job to surrender a worker, and stays within physical Farmer and Quarry capacities. It exceeds the Farmer smart maximum by one, which is a planning limit and not a physical cap. It projects +0.335 Food and one Quarry Worker remains employed. Whether commitments permit that transfer is unknown. The empty commitment set is an explicit diagnostic assumption, not an authoritative fact. The unchanged planner proposes 2F/2Q on subsequent cycles; P43 must restate the constrained split each time.

The later transitions change feasibility:

| Captured state                    | Required Farmers / Quarry result                   | Food assessment                                               | Labor and ordinary-planner result                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A p1584, 4 residents, 1 Garrison  | Floor 4; 4F/0Q                                     | Projected 5.647 / 5 = +0.647; current 2F/2Q flow is −1.32     | All residents can be assigned, but no Quarry Worker remains. No other civilian job can surrender a worker. External commitments remain unavailable.                                                    |
| A p2000, 4 residents, 2 Garrison  | Floor 4; 4F/0Q                                     | Projected 6.515 / 6 = +0.515; current 2F/2Q flow is −1.65     | The assignment is physically possible but abandons Quarry. Ordinary Jobs still selects 2F/2Q at this sample.                                                                                           |
| A p4000, 4 residents, 4 Garrison  | No floor; best 4F/0Q projection 5.825 / 8 = −2.175 | Infeasible with current Farm, regardless of a Quarry transfer | No Jobs-only assignment can make Food positive. Ordinary plan remains 2F/2Q before the native Quarry smart maximum reaches zero.                                                                       |
| B p2000, 4 residents, no Garrison | Floor 3; 3F/1Q                                     | Measured 4.77 / 4 = +0.77                                     | All residents assigned, Quarry retained, no other civilian transfer. Ordinary planner still proposes 2F/2Q.                                                                                            |
| B p4000, 4 residents, 4 Garrison  | No floor; diagnostic fallback 4F/0Q                | Measured 6.62 / 8 = −1.38                                     | All four residents assigned as Farmers, but the Quarry is released and Food is still negative. Ordinary planner again proposes 2F/2Q because the Quarry remains physically useful below its Stone cap. |

The p4000 B formula projection shows the next infrastructure dependency without purchasing it: with current modifiers, one Farm and four Farmers project 6.62 Food; two total Farms project 7.994 (net −0.006, below zero and the required safety margin); three total Farms project 9.368 (net +1.368). Thus the current missing prerequisite is two additional Farms, or an independently verified change to Food production or consumption. The existing Construction path does not buy them in this replay.

A focused five-resident population case is also recorded in the regressions, but population five is not reached in either exact arm. With two workers committed to another managed job, a four-Farmer floor would require one of those workers to surrender employment to retain one Quarry Worker (4F/1Q). The policy reports that transfer requirement and native capacity feasibility; it does not reassign that third job because the P43 intervention is bounded to Farmer and Quarry Worker. Without worker-commitment evidence that transfer is not authoritative. The exact replay's actual population never exceeds housing capacity four; starvation briefly lowers it to three before recovery.

## Stage 4 — Test-only Jobs boundary

The diagnostic hook runs after the captured full Jobs planner produces its ordinary decision and before the existing Jobs executor consumes it. The pure policy changes only Farmer and Quarry Worker counts; it does not touch civic state, workers directly, resources, job settings, priorities, split weights, defaults, or breakpoints. It requires the current root and progression generations, exact Jobs snapshot and work-cycle identity, both native job control generations/readiness states, the current default identity, Farmer and Quarry unlock/management, complete proposed assignment, current population/capacity and Food evidence, and physical job limits. It preserves population conservation and does not create an assignment to a locked job. The existing executor and postconditions remain in the path.

At p720 the native state has default Farmer, while unchanged ordinary `planJobs()` selects Quarry as its default candidate. The intervention carries that same ordinary `selectedDefaultToken`; it does not choose or modify a default. The existing executor applies the ordinary Quarry default in both arms, confirmed by the next native Jobs observation at p728. Later default changes likewise follow the ordinary planner's current selection. The P43 override itself supplies only the changed allocation counts.

Worker commitments are unavailable from the pinned catalog. The replay uses the explicit `test-only-assume-empty` diagnostic branch and labels every record non-authoritative. It does not silently treat missing evidence as an empty set. When no positive Food allocation can retain Quarry, the fallback releases Quarry first. At p4000 that 4F/0Q fallback is still Food-negative; it is recorded as best effort, not as a safe allocation.

## Stage 5 — Controlled Chromium comparison

A and B have equal save hashes and state at p719, and the captured p720 Jobs boundary (before the decision) is identical across A, B and B-repeat. Their first changed Jobs decision is p720. A replays the P42 baseline unchanged. Its final export hash `a0702240940ec82f119f52ac0d7d767a14efd940c7ce338d740777930ae49ebf` matches the retained P42 B export and checkpoints through p10000. B and B-repeat final exports are both `4ca006d76edddb98ae1c2cba2da35e1f7819ccc5dd76d5af956b8df08f066dc5`.

B-repeat matches B at all 123 retained checkpoints, including state, save hash, native action digest/count, control usage and RNG state. It also matches the full native action sequence, full control usage, P43 decision events, final RNG call count/state, and final export. Trace overflow is zero in all arms. A/B parity is required through the first changed decision only; the changed Jobs allocation is the intentional p720 divergence.

The baseline ordinary planner conflicts with the Food floor in 1,159 of 1,161 captured Jobs observations. The diagnostic intervention is applied 1,158 times. Its fallback repeatedly releases Quarry after the food floor becomes infeasible; while a Quarry Worker remains possible, the unchanged ordinary planner continues proposing 2F/2Q and P43 restates its constrained decision. This is repeated policy enforcement at the Jobs boundary, not an ordinary Jobs setting change.

## Stage 6 — Outcome criteria

- **A, sustainable productive allocation:** not met. Neither arm retains positive Food and Stone over the long-run interval without starvation.
- **B, survival preserved but productivity blocked:** not met. B initially retains positive Food and Stone, but Food becomes negative at p4000, Quarry production falls to zero, and starvation later occurs.
- **C, Jobs-only intervention insufficient:** met on the explicit diagnostic branch. With four civilian workers, one Farm, four Garrison soldiers, and current modifiers, even 4F/0Q projects negative Food. Native starvation increments at p5630; no deaths are recorded.
- **D, authority/evidence blocked:** met and is the top-level result. The worker-commitment source is missing, so no proposed assignment is authorized.
- **E, invalid replay:** not met. The existing executor applies the selected assignment; the first native postcondition conserves all four workers and servants and matches the ordinary selected default; B-repeat is exact.

The positive p728–p2000 Food and Stone observations demonstrate an initial conditional allocation only. They do not prove durable production, and the final stocks do not imply positive current flows. Starvation resets Food stock while population recovers; A and B therefore end with positive Food stock despite negative sampled Food flow.

## Stage 7 — Performance and integration limits

| Measurement                                       |                                                       Result |
| ------------------------------------------------- | -----------------------------------------------------------: |
| Pure Food-floor computation                       | 115.5 ms total over 1,161 observations (about 0.100 ms each) |
| Native Food observations                          |        165.1 ms total over 1,161 reads (about 0.142 ms each) |
| Native control-generation reads                   |                                2,322 (two per Jobs decision) |
| Full Jobs plan calls                              |                                  1,161 in the diagnostic run |
| Farmer / Quarry control operations                |                                      2,548 B vs 2,500 A; +48 |
| Captured Jobs execution callback time             |         1,561.8 ms B vs 1,558.2 ms A; +3.6 ms observed delta |
| Construction, Gather and additional catalog calls |                                           0 additional calls |
| Added native Food breakdown reads                 |                                             1 per Jobs cycle |
| Trace overflow                                    |                                       0 in A, B and B-repeat |

Synchronous timing uses `window.eaDiagnosticsNow`, the native monotonic clock. It does not use the replay's virtual `performance.now()`. The accumulated callback time covers the relevant full Jobs work over the run, including observation, pure policy evaluation and the existing executor; the small A/B timing delta is measurement variation, not evidence of a material runtime change. The independent 2% renderer CPU gate remains unresolved. No recurring runtime owner or new catalog reader was added.

The next independent experiment would need to establish a native-authorized Food infrastructure path (the current formula indicates three Farms under p4000 demand) and a complete same-cycle worker-commitment source. P43 does not change Construction to buy a Farm.
