# Shared native building price observation experiment

## 1. Corrected CPU-profile attribution

The offline analyzer previously paired each samples[index] stack with timeDeltas[index + 1]. V8 profiles pair the stack with the delta at the same index, so attribution now uses timeDeltas[index] ?? 0. A synthetic three-sample profile with unequal 10, 30, and 100 microsecond deltas checks exact self totals, inclusive totals, and owner attribution in full-runtime-profile-cpuprofile-test.mjs.

The existing 18 early, mid, and late raw profiles were reprocessed offline; no benchmark was rerun. In the two late active profiles:

| Function    | Old self / inclusive ms | Corrected self / inclusive ms | Old rank | Corrected rank |
| ----------- | ----------------------: | ----------------------------: | -------: | -------------: |
| adjustCosts |        190.09 / 2389.25 |              195.13 / 2394.68 |       14 |             14 |
| setData     |        128.13 / 2470.73 |              127.69 / 2468.18 |       24 |             24 |

The hotspot ordering did not materially change. Both functions remain attributed to the game; setData remains automation-initiated. Corrected aggregate results for all 18 profiles are retained in ignored test-artifacts/perf-profile/ as corrected-cpuprofile-summary.json; the focused late-active result is corrected-late-active.json.

## 2. Bounded request and native-duration traces

shared-native-price-trace.mjs builds a temporary test bundle, arms a recorder for eight work cycles, and compares final save and control-call totals with the ordinary bundle. The late trace used a 600-period warmup; the mid trace used 100 periods. The adapter captures the player queue before appending probes separately from each effective prefix passed to native setData. Traces distinguish genuine player queue changes, temporary probe prefixes, native price/pool changes, tracked actionCostEpoch changes, and root or queue-array replacements. Mutations outside the tracked epoch remain unknown; an unchanged epoch or matching output is never called safe.

Native setData duration is measured per request and retained by action ID and consumer in timingSummary.actionCosts. The runner native clock showed a 0.1 ms positive duration quantum. A rapid timer-pair calibration had 0 ms median and p95, so no resolved timer-pair overhead was subtracted. Recorder callback work was timed separately: 33.9 ms across 3,541 late events (0.0096 ms/event) and 3.6 ms across 1,125 mid events (0.0032 ms/event); callback p95 was one 0.1 ms clock quantum late and below that resolution mid. Instrumented versus ordinary host-wall time was +76.2% late and +9.8% mid. These are instrumentation overhead diagnostics, not renderer CPU or TaskDuration A/B results. Per-probe durations estimate removed native call work only.

Pinned game snapshot: test-artifacts/game/evolve-deadspace.js, SHA-256 29e22dbe9bc80d44997eeab87bb1143fc35129d1d89d6241997eec0f79a54f4, commit db38e2af831907d49aeb5348d678d8d8745d6c3f; seed 42; settings stage2e-integrated-mad-no-triggers.json; 120 periods; measured cycles 76–83 late and 13–20 mid. The late save produced 3,541 requests (442.6/work tick); the mid pre-space save produced 1,125 (140.6/work tick). All probes were available. Both traces had identical exported save bytes and native control-call totals versus the ordinary bundle. Ignored raw traces are test-artifacts/perf-profile/shared-price-trace-late.json and test-artifacts/perf-profile/shared-price-trace-mid.json.

| Ordered consumer              | Late requests / work tick | Mid requests / work tick | Same-phase duplicates, late / mid |
| ----------------------------- | ------------------------: | -----------------------: | --------------------------------: |
| Construction saving discovery |                        71 |                     23.4 |                             0 / 0 |
| Pre-Gather Demand             |                        73 |                     25.1 |                           1 / 1.8 |
| Storage                       |                        72 |                     23.4 |                             0 / 0 |
| Build                         |                      82.6 |                     44.8 |                       11.6 / 21.3 |
| Factory                       |                        72 |                        — |                             0 / — |
| Jobs and Craftsmen            |                        72 |                       24 |                             0 / 0 |

## 3. Corrected reuse-opportunity matrix

Each estimate sums measured durations of matching destination probes that reuse would skip, by action ID and work cycle. It is not extrapolated from a global average. A matching source result only describes these traces; it does not establish freshness. Authority outside actionCostEpoch remains unknown for every pair.

| Source → destination       | Matched requests / IDs (late) | Late saving / work tick | Mid matched / saving per work tick | Observed boundary, late (mid)                                                                         |
| -------------------------- | ----------------------------: | ----------------------: | ---------------------------------: | ----------------------------------------------------------------------------------------------------- |
| Demand → Demand duplicates |                         8 / 1 |                 0.11 ms |                    14 / 3, 0.05 ms | No player queue, price/pool, or epoch change                                                          |
| Build → Build duplicates   |                        93 / 1 |                 0.78 ms |                  170 / 24, 0.47 ms | No player queue or epoch change; one price/pool change mid                                            |
| Construction → Demand      |                      576 / 71 |                 5.86 ms |                  201 / 24, 0.63 ms | No player queue, price/pool, or epoch change                                                          |
| Construction → Storage     |                      568 / 71 |                 4.67 ms |                  187 / 24, 0.60 ms | No player queue, price/pool, or epoch change; temporary prefix changed for 560/568 late (179/187 mid) |
| Demand → Storage           |                      576 / 72 |                 4.75 ms |                  187 / 24, 0.60 ms | No player queue, price/pool, or epoch change; temporary prefix changed for 568/576 late (179/187 mid) |
| Construction → Build       |                      661 / 71 |                 5.75 ms |                  356 / 24, 0.94 ms | Mid endpoints include 4 price/pool changes and 74 tracked epoch changes; uncovered authority unknown  |
| Demand → Build             |                      661 / 71 |                 5.75 ms |                  356 / 24, 0.94 ms | Mid endpoints include 4 price/pool changes and 74 tracked epoch changes; uncovered authority unknown  |
| Build → Factory            |                      568 / 71 |                 4.95 ms |                           0 / 0, — | No mid matches; uncovered authority unknown                                                           |
| Factory → Jobs/Craftsmen   |                      576 / 72 |                 4.83 ms |                           0 / 0, — | No mid matches; uncovered authority unknown                                                           |

The corrected Storage comparison removes the false Market-mutation claim. readCosts() appends its entire temporary suffix before the first native probe. Later setData calls therefore see earlier temporary probes in their effective prefix. Those temporary rows changed in 560 late Construction→Storage pairs and 568 late Demand→Storage pairs. The original player queue was unchanged in every matched pair, as were root and queue-array identities, native price/pool, and tracked epoch. A changed temporary prefix is diagnostic data; it is not a player queue or Market mutation.

The chained Construction→Demand→Storage estimate is 10.61 ms per late work tick (5.86 + 4.75) and 1.23 ms per mid work tick (0.63 + 0.60). These are trace-derived ceilings from destination probe durations; they do not establish freshness. No cache, freshness relaxation, or candidate implementation was added. The earlier generic invocation-cache result remains separate: 2.8% late hits and 1.3–1.75 ms paired median saving, with no mid-game gain.

The upstream basis is unchanged at the recorded commit: src/functions.js buildQueue.setData resolves the live action and invokes adjustCosts; adjustCosts and costMultiplier depend on action structure/counts and cost closures, race/traits/genes, technology, government, universe, settings/modifiers, and other mutable state. Since actionCostEpoch does not cover all native price inputs, no unchanged epoch is a freshness proof.

## 4. Unit correction, parity, and decision

The existing baseline profile's 29.23 ms is per game period, not per work tick. At eight periods per work tick, this is 233.84 ms/work tick of active renderer CPU. TaskDuration was 21.05 seconds per 100 work ticks. The existing saving screen is 8 ms/work tick late and 2 ms/work tick mid, followed by renderer CPU and TaskDuration A/B, work-cycle tail checks, and exact behavior parity.

Both bounded traces had identical exported save bytes and native control-call totals versus the ordinary bundle. Price-duration and attribution hooks are test-surface-only; the ordinary production path remains native setData. The reader contract test covers parsing, unavailable/throwing probes, and queue restoration. The traces did not run a candidate renderer CPU or TaskDuration A/B and make no such performance claim.

**Decision:** corrected late-game evidence makes the 8 ms/work-tick saving screen plausible and justifies a real A/B experiment; the observed chained ceiling is about 10.61 ms/work tick. The refreshed mid-game trace remains below its 2 ms screen at about 1.23 ms/work tick. This is performance evidence only: native inputs outside actionCostEpoch remain unknown, so any future candidate must first preserve the current freshness guarantee. This change stops at measurement; no cache or candidate implementation was added.
