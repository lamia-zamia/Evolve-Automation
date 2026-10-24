# P36 — Productive-resource bootstrap chain

## Decision

**C — Execution blocked.** The fixed policy spent 79 clicks toward Shed and 60 toward the native-selected Quarry, then stopped safely. At p688, Quarry still lacked 18 Lumber; the Quarry-stage budget was exhausted and only one click remained in the total budget. The native Construction owner did not purchase a Quarry, so no Quarry Worker or Stone production followed.

The run also caused a real side effect: native Construction bought a fourth Basic Housing at p672, and population rose from three to four by p688. All four residents remained Farmers. Food stayed sustainable through p10000, but this did not complete the productive-resource chain: Quarry remained unpaid, and no new Lumber or Stone output or Quarry employment was established. This side effect is retained in the evidence rather than treated as a Quarry success.

This is a treatment result, not a D feasibility stop. The hypothesis was admitted, the exact treatment ran, and budget limits—not invalid authority—blocked the Quarry purchase.

## Stage 1 — Native feasibility

P19 begins with three residents, three Farmers, three Basic Housing, and no housing headroom. Its p10000 baseline has Food output 4.332 against consumption 3, with population 3, zero starvation, and zero deaths. The fourth resident in C appeared only after native Housing raised capacity to four.

| Question                                                          | Native rule and replay finding                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does Shed supply capacity Quarry needs?                           | Shed adds 300 capacity each for Lumber and Stone. P19 already has capacity 200 for both, while the first Quarry price is 50 Lumber / 10 Stone. Shed is not a Quarry prerequisite and its extra storage is not needed for this price.                                                                                                                                                                                         |
| Does native Construction select Quarry after Shed?                | Yes. Native Construction bought Shed at p584; the live pre-Gather order then selected `city-rock_quarry` at p584. Its request/publication, price authority, permissions, queues, and claim checks were valid.                                                                                                                                                                                                                |
| Can price or competing purchases change the material requirement? | Prices did not change in this run: the live Quarry price remained 50 Lumber / 10 Stone. Competing native spending did occur: a fourth `city-basic_housing` action was recorded at p672 while Quarry gathering was active. By p688 the live Quarry shortage was 18 Lumber. The policy did not assume the historical price or reserve these materials against other native purchases.                                          |
| Can 140 clicks buy both structures?                               | The P35 starting arithmetic is 80 Shed material clicks plus 60 Quarry material clicks, exactly 140 and with zero margin. In C, one naturally available Lumber reduced Shed gathering to 79. Quarry then consumed all 60 stage clicks and still had 18 Lumber missing, with one total click left. The fixed limits correctly rejected further spending.                                                                       |
| Is a Quarry Worker available without harming Food?                | No worker is initially free: all three residents work as Farmers and housing is full. Settings allow native autoJobs and enable `job_quarry_worker`, but Shed does not add a resident or job. C later gained a fourth resident and Farmer through native Housing/population growth, but Quarry was not purchased and no Quarry Worker assignment was observed. A post-Quarry job/Food tradeoff therefore remains unverified. |

The pinned game source confirms these mechanics: [Basic Housing cost and capacity](../test-artifacts/game/evolve-deadspace.js#L112158), [Shed cost and storage](../test-artifacts/game/evolve-deadspace.js#L113165), [Quarry price and purchase effect](../test-artifacts/game/evolve-deadspace.js#L113781), [Quarry Worker output formula](../test-artifacts/game/evolve-deadspace.js#L152841), and [fed, housed native population growth](../test-artifacts/game/evolve-deadspace.js#L151045). The Quarry action adds Stone capacity and exposes the Quarry Worker job; it does not itself assign a worker or produce Stone.

P20.2 spent 13 clicks on a second Farm, 79 on Shed, and 48 on Quarry, for 140 total without purchasing Quarry. P36 excluded the Farm intervention as requested. The current P19 stock at first Shed eligibility was 20 Lumber and zero Stone; the complete Shed price was 75 Money / 55 Lumber / 45 Stone. Money was affordable at p448, leaving an 80-click material shortage. P20.2’s historical Quarry price of 50 / 10 implies 60 material clicks only before native spending and population changes are considered.

## Fixed test-only policy and safety

The executor is a test-only fixed two-stage policy in [p36-productive-resource-bootstrap-policy.mjs](p36-productive-resource-bootstrap-policy.mjs), driven only by the current live pre-Gather Construction order:

- Shed is eligible only when native Construction publishes `city-shed` and its complete non-gatherable costs are affordable. It uses at most 80 material clicks.
- Quarry is eligible only after native Shed ownership is observed and native Construction publishes `city-rock_quarry`. It uses at most 60 additional clicks.
- The combined limit is 140, with no more than five clicks in a work cycle. Farm, Cabin, and another Shed are never substitutes.
- The policy stops on a changed target, price/root/progression authority, live non-gatherable affordability, or an over-budget shortage. It never raises a ceiling to finish a purchase.
- Each native Gather invocation must increase the requested stock before the next validation. The native Construction owner remains the only building purchaser. Emergency Food handling stays separate.

P33’s ordering-generation and P20.2’s execution checks were retained: the complete current native price, root/progression/control generations, target and Gather controls, shortages, permissions, queues, reservations/claims, and handoff are checked at the authorization boundary and before each action. Old ordering generations cannot authorize another click. The treatment did not call building purchase controls directly, set Workers, mutate resources, expose debug globals, or select a target outside native Construction. P19 startup and handoff accounting stayed separate at ten clicks each. P20’s generic allocator remains retired; no production source behavior was changed.

## Exact controlled replay

The arms used the authentic Standard/Human fixture, accepted P19 startup/handoff, seed 44, epoch `2026-09-21T00:00:00.000Z`, and pinned game `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f` (SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`). Fixture SHA-256 is `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`. All arms advanced through p10000.

| Arm      | Treatment                        | p10000 result                                                                         | Final save SHA-256                                                 |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A        | Accepted P19 baseline            | Population 3; 3 Farmers; Food 1000; Stone output 0                                    | `0fb9b1828e0aa8e17501cd46391af2fd67c23d617d3bbd0ff3abac864ef34985` |
| B        | P19 plus non-mutating P33 shadow | Exact match to A at all 20 retained checkpoints                                       | `0fb9b1828e0aa8e17501cd46391af2fd67c23d617d3bbd0ff3abac864ef34985` |
| C        | Fixed Shed → Quarry policy       | Population 4; 4 Farmers; one Shed; no Quarry/Quarry Worker; Food 1000; Stone output 0 | `b5ae18327271399d6d04d8a823988b43111ea61728e36be1d465c7d72f798255` |
| C-repeat | Identical treatment replay       | Exact match to C at all 20 retained checkpoints                                       | `b5ae18327271399d6d04d8a823988b43111ea61728e36be1d465c7d72f798255` |

Before C’s first authorized Gather at p448, its state, native calls, control usage, and RNG all match A. The first material action is `city-lumber.action`; C’s Lumber rises from 20 to 25. Native control order first diverges at entry 168, where C gathers Lumber and A continues Farmer control calls. A/B match exactly at every retained checkpoint; C/C-repeat match in save hash, state, native order, control use, RNG, policy events, and measured counters.

|       Period | Native event and observed state                                                                                                                                                                                                                                                              |
| -----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|         p448 | First live Shed authorization: 35 Lumber + 45 Stone short. First Gather action is Lumber.                                                                                                                                                                                                    |
|         p584 | Native Shed purchase verified after 79 P36 clicks. Native order selects Quarry at its unchanged price, 50 Lumber / 10 Stone.                                                                                                                                                                 |
|         p672 | Native Research still grants Irrigation, as in P19. Native `city-basic_housing.action` is also recorded.                                                                                                                                                                                     |
|         p680 | 60th Quarry-stage click; total P36 clicks 139.                                                                                                                                                                                                                                               |
|         p688 | Policy stops: Quarry shortage 18 Lumber, 0 Stone; stage remaining 0, total remaining 1. Population/capacity are 4/4, jobs are 4 Farmers, buildings include Basic Housing 4 and Shed 1. Food output is 5.316 against consumption 4; starvation/deaths remain zero. No Quarry purchase occurs. |
| p1000–p10000 | Population remains 4 with 4 Farmers. Food output remains 5.316 against consumption 4; sampled Food stocks stay positive, starvation/deaths stay zero, and Stone output stays zero.                                                                                                           |

Research through p10000 is unchanged from P19. C’s RNG first differs at the later population-growth checkpoints; the machine evidence records each checkpoint’s calls/state. The housing/population change is causally downstream of the authorized material intervention, but it does not establish the requested Quarry production path.

## Success criteria

| Criterion                                                       | Result                                                                                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve sustainable Food and avoid starvation/deaths           | **Pass.** At every p1000 checkpoint, Food output 5.316 exceeds consumption 4; all samples have positive stock, zero starvation, and zero deaths.                                                      |
| Preserve or improve population/productive capacity              | **Pass as a side effect.** C reaches population 4 and 4 Farmers versus P19’s 3 and 3.                                                                                                                 |
| Produce Lumber/Stone through native jobs or another progression | **Productive-resource route fails.** No Quarry Worker or positive Lumber/Stone output appears. Native Housing/population growth is recorded, but it does not complete the Shed→Quarry resource chain. |
| Avoid replacing Farmers just to claim a Quarry Worker           | **Pass.** All residents remain Farmers; no Worker was assigned manually or automatically in the observed run.                                                                                         |
| Show causal change after authorized material gathering          | **Pass.** C first diverges on the p448 Gather action and later buys native Housing and grows population; C-repeat reproduces it.                                                                      |

Decision C reflects the explicitly budget-blocked Quarry stage. The positive population side effect does not change that execution result: at the fixed stage/total ceilings, native Construction could not buy the Quarry, and no productive resource output or Quarry employment was established.

## Performance evidence

These are actual counters and synchronous `eaDiagnosticsNow` timings from the exact Chromium runs, not P34’s model:

| Measure                                                 |                  A |                  B |                    C |             C-repeat |
| ------------------------------------------------------- | -----------------: | -----------------: | -------------------: | -------------------: |
| Relevant native control calls                           |               2570 |               2570 |                 2856 |                 2856 |
| Gathering / Research / Construction / job-control calls | 40 / 22 / 8 / 2500 | 40 / 22 / 8 / 2500 | 322 / 22 / 12 / 2500 | 322 / 22 / 12 / 2500 |
| `buildingAlwaysClick` synchronous time (ms)             |              448.4 |              390.1 |                693.5 |                644.7 |

C adds 286 relevant native calls versus A. The p36 instrumentation recorded 899 fresh native price probes, 688 validation fences, and 139 successful policy Gather actions. Across the whole C run, resource-control invocations were 86 returned Lumber actions and 75 returned Stone actions, with zero throws; those whole-run counters include native Gather activity outside the 139 policy events. C−A synchronous phase time was 245.1 ms in this run; C-repeat−A was 196.3 ms, showing run-level timing variation. The P34 modeled 583.3 ms estimate was not used. The unresolved 2% whole-run CPU gate still blocks production promotion.

## Evidence, regressions, and provenance

Machine-readable feasibility, checkpoints, divergence fields, policy events, Food series, and performance counters are in [p36-productive-resource-bootstrap-evidence.json](p36-productive-resource-bootstrap-evidence.json). Focused regressions are [the fixed-policy bounds/stop test](../tests/experiments/p36-productive-resource-bootstrap-policy-test.mjs) and [the exact-evidence/parity test](../tests/experiments/p36-productive-resource-bootstrap-evidence-test.mjs). Re-run with:

```text
node experiments/p36-productive-resource-bootstrap-exact.mjs
node tests/experiments/p36-productive-resource-bootstrap-policy-test.mjs
node tests/experiments/p36-productive-resource-bootstrap-evidence-test.mjs
npm run build
node tools/chromium-evolve-runner-test.mjs
npm run check
git diff --check
```

The exact arms were run with harness commit `16fd1c9` (harness SHA-256 `73f06c681edb2053b9ec341191ba7e45ae76d36b61bb58da6a054d3acd61d971`). Later commits `84915cf` and `f9c031a` only corrected evidence derivation: they removed zero-difference stock rows and surfaced the already-captured p688 stop-state population/housing comparison. They did not alter the replayed game actions. The experiment, test, and report/evidence commits are separate. No push was made.
