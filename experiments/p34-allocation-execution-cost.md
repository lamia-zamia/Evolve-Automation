# P34 — Native-clock allocation cost and execution-readiness audit

## Decision

**B — Correct authority sources and a fresh native price path exist, but the full incremental CPU cost is not yet budgetable.** P33’s direct synchronous work is small in the measured replay, and a deliberately conservative direct-time projection stays below the 2% reference. That projection is not a measured whole-run CPU guarantee: it does not bound indirect rendering, asynchronous work, garbage collection, or native-control side effects. No production allocation is authorized.

## Timing authority

The exact Chromium runner replaces page `performance.now()` with its virtual clock during controlled advancement. P33’s test-only timer read that page clock, so its 625 reported durations were all 0 ms. The runner bridge already exposes the original page `Performance.now()` as `eaDiagnosticsNow()` only when a session starts with `perf: true`; P29 uses that same test-only native clock for phase timings. P34 used this hook without changing the production clock, game timers, scheduling, or runner behavior.

A bounded synchronous integer-mix workload ran until the runner-native clock had advanced 40 ms. Virtual `performance.now()` advanced 0 ms; `eaDiagnosticsNow()` advanced 40 ms. This establishes that the old P33 measurement was a clock-authority error, not evidence that its work was free. Native phase samples are quantized to roughly 0.1 ms, so individual zero medians below are also not zero-cost claims.

## Live shadow cost

The reproducible run uses the accepted P19 bootstrap/handoff and P33 shadow on the pinned game, authentic P18 Human fixture, settings, seed 44, and epoch. Arm C advanced 5,000 periods and recorded 625 shadow invocations, one per work cycle. It retained 625 reservation captures, 0 extra native catalog/price probes, and exact P19 parity at all 11 checkpoints.

| Non-overlapping measured phase                    | p50 ms | p95 ms | Max ms | Total ms |
| ------------------------------------------------- | -----: | -----: | -----: | -------: |
| Ordering-generation stamp                         |    0.0 |    0.0 |    0.1 |      0.4 |
| Current target evidence publication               |    0.1 |    0.2 |    0.3 |     49.4 |
| Root, progression, and control-generation capture |    0.0 |    0.1 |    0.2 |     26.9 |
| Current resource and queue observations           |    0.0 |    0.1 |    0.2 |      5.9 |
| Handoff and competing-claim observation           |    0.0 |    0.0 |    0.1 |      2.9 |
| Reservation capture                               |    0.0 |    0.1 |    0.1 |      3.6 |
| Pure shadow evaluation                            |    0.0 |    0.1 |    0.2 |      6.2 |
| Snapshot freezing and diagnostic recording        |    0.0 |    0.1 |    0.2 |      8.4 |

The total direct timer around each complete P33 snapshot/evaluation/recording was p50 0.2 ms, p95 0.3 ms, max 0.6 ms, and 107.3 ms summed over the run. The phase totals sum to 103.6 ms; the remaining 3.7 ms is timer/phase-boundary work and instrumentation overhead. The current target read is also consumed by the same-cycle Construction owner through `savingTargetThisCycle`; its 49.4 ms is shared owner work, not attributable solely to shadow evaluation. Excluding that shared phase gives a rough 57.9 ms P33-only direct subtotal; the conservative budget below keeps the full 107.3 ms.

Of the 625 records, 595 were eligible, 23 had a current target but were rejected, and 7 had no current target. Eight observed an active P19 handoff; one record lacked handoff evidence. Twenty-one records reported an unaffordable non-gatherable Money cost (reasons can coexist). Eleven distinct progression-generation values appeared across the run; each captured root/progression generation matched its current value. No stale-progression rejection occurred in this replay.

## Fresh execution-time validation

The retained P20.2 validator is the relevant execution model. It obtains the current Construction target and publication, compares complete price and pool evidence, reads current resources, and then `isNativeRequestCurrent()` checks the root identity, root/progression generations, target control identity/generation, empty Build/Research queues, competing claims, and `autoBuild` permission. Its native price read is repeated at the execution boundary through `createCapturedActionCostReader.readCost()`. The executor also verifies the relevant stock postcondition after a native click and checks freshness before later clicks.

P34 exercised that fresh price path at the first positive P33 boundary, p80. The current target was `city-farm`, with 27 Lumber / 14 Stone. A new native price query returned the same complete price. The test then made 280 additional fresh price queries, modeling two price fences for each of the maximum 140 clicks. It measured p50 0 ms, p95 0.1 ms, max 0.3 ms, and 10.3 ms total; the zero median reflects clock quantization. The probe uses the native `buildQueue.setData` cost path and removes its temporary queue entry in `finally`. It issued 0 native actions, and the exported save was unchanged.

Current-cycle target/order, generation, controls, stock, queue, reservation, handoff, and claim observations can serve the shadow decision within their synchronous cycle. Before a real click, the executor must compare current authority again; after a click it must observe the changed stock/capacity and refresh any authority that could have changed. A P33 order price may never stand in for the fresh execution-time native price. Budgets must be decremented and checked per click, per target episode, and in total. The 280-probe measurement isolates native price work; the remaining checks are modeled with the measured maximum phase costs below, not claimed as an end-to-end instrumented executor run.

## Conservative direct-time budget

The lowest matching ordinary renderer-CPU baseline in the P32 pilot was 9.237956 CPU seconds per 1,000 measured periods. Scaled to the 5,000-period P34 replay, 2% is 923.8 ms.

P20.2’s ceilings are retained unchanged: at most 5 clicks per cycle, 80 clicks per target episode, and 140 clicks total. The projection assigns two full validation fences to every allowed click (before and after), or 280 fences. For each fence, it sums the observed per-phase maxima for ordering generation (0.1 ms), target evidence (0.3), root/progression/control generations (0.2), resource/queues (0.2), handoff/claims (0.1), reservations (0.1), shadow predicate (0.2), and snapshot/recording (0.2), then adds the measured maximum fresh native price probe (0.3): 1.7 ms per fence. This yields 476 ms for 280 fences. Adding the entire measured live-shadow total gives a conservative 583.3 ms direct synchronous estimate, 340.5 ms below the scaled 2% reference. This is an elapsed-time envelope based on measured live phase maxima and native probes, not a guarantee about process CPU or future callback effects.

The earlier P32 paired pilot did not reliably resolve a 2% renderer-CPU change: its three measured effects varied from −5.45% to +4.27%. P34 therefore does not claim the end-to-end CPU gate passes. Indirect rendering, async work, garbage collection, and control side effects remain unbounded. No whole-window CPU comparison was added because that pilot did not provide a credible sensitivity floor.

## Usefulness boundary and replay

At p80, P33’s first eligible target is Farm at 27 Lumber / 14 Stone. P19 had already bought its first Farm at p72; at p80 it had one Farm, no residents, and no Farmers. By p5000, P19 retained that Farm with three productive Farmers, three residents, no starvation, and no deaths. The p80 target therefore names another Farm. The replay proves it is the current Construction target, but does not prove that extra material clicks improve progression. P20.2’s bounded 140-click allocation outcome ended with two Farms, a Shed, one resident, and one productive Farmer, versus P19’s three; it did not improve overall progression.

| Decision                                          | P34 finding                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the current Construction target authoritative? | Yes. P33 published the live pre-Gather Farm target at p80 with matching root/progression generations and controls.                                               |
| Could an executor safely spend a bounded action?  | Not established for a P33-integrated executor. The fresh native price source and P20.2 validation model exist and are measurable, but P34 made no Gather action. |
| Would spending improve progression over P19?      | Not established. The first eligible target would add another Farm; the retained P20.2 result warns against assuming benefit.                                     |

The 11 checkpoint comparisons retained exact native calls, state, control usage, RNG calls/state, and exported-save hashes between P19 and P19 plus P33 shadow. No Gather allocation action or production spending policy was added.

## Reproduction and verification

```text
node experiments/p34-allocation-execution-cost.mjs
npm test -- p34-allocation-execution-cost construction-allocation-authority-test captured-gather-resources-test
node tools/chromium-evolve-runner-test.mjs
npm run build
npm run check
git diff --check
```

Machine-readable replay, phase distributions, fresh-price probes, clock calibration, parity, and authority counts are in [p34-allocation-execution-cost-evidence.json](p34-allocation-execution-cost-evidence.json). P34 instrumentation is test-only. The production clock, pinned game, upstream runner semantics, Research draws, and retired P20 allocator were not changed.
