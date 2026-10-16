# Shared native building price observation experiment

## 1. Corrected CPU-profile attribution

The offline analyzer previously paired each `samples[index]` stack with
`timeDeltas[index + 1]`. V8 profiles pair the stack with the delta at the same
index, so attribution now uses `timeDeltas[index] ?? 0`. A synthetic three
sample profile with unequal 10, 30, and 100 microsecond deltas checks exact
self totals, inclusive totals, and owner attribution in
`full-runtime-profile-cpuprofile-test.mjs`.

The existing 18 early, mid, and late raw profiles were reprocessed offline; no
benchmark was rerun. In the two late active profiles, the previously reported
and corrected figures are:

| Function      | Old self / inclusive ms | Corrected self / inclusive ms | Old rank | Corrected rank |
| ------------- | ----------------------: | ----------------------------: | -------: | -------------: |
| `adjustCosts` |        190.09 / 2389.25 |              195.13 / 2394.68 |       14 |             14 |
| `setData`     |        128.13 / 2470.73 |              127.69 / 2468.18 |       24 |             24 |

The hotspot ordering did not materially change. The corrected analyzer still
attributes both functions to the game; `setData` remains entirely
automation-initiated in these captures. Corrected aggregate results for all 18
profiles are retained in ignored `test-artifacts/perf-profile/` as
`corrected-cpuprofile-summary.json`; the focused late-active result is
`corrected-late-active.json`.

## 2. Bounded request trace

`shared-native-price-trace.mjs` builds a temporary hook-enabled bundle, arms a
bounded eight-work-cycle recorder after a 600-period warmup, and compares its
final save and control-call totals with the unchanged production bundle. The
trace records sequence, action ID, phase/caller, cycle, game-root and queue
identities, queue prefix, action-cost epoch, result or failure, and whether the
same ID's last observed output matched. Its raw event stream is ignored under
`test-artifacts/perf-profile/shared-price-trace-late.json`.

Pinned input: game snapshot `test-artifacts/game/evolve-deadspace.js`, SHA-256
`29e22dbe9bc80d44997ee6ab87bb1143fc35129d1d89d6241997eec0f79a54f4`, commit
`db38e2af831907d49aeb5348d678d8d8745d6c3f`. Save: `late`; settings:
`stage2e-integrated-mad-no-triggers.json`; seed 42; 120 periods; measured cycles
76–83. The trace observed 3,541 probes, or 442.6 per work tick, and 71–72
distinct action IDs per tick. All 3,541 probes were available; the native
failure path is covered by the reader contract test.

| Ordered phase / consumer                                           | Requests in 8 ticks | IDs per tick | Within-phase duplicate requests |
| ------------------------------------------------------------------ | ------------------: | -----------: | ------------------------------: |
| Construction saving discovery (`establishOrdering` → `beginCycle`) |                 568 |           71 |                               0 |
| Pre-Gather Demand (`readCost` plus saving-cost read)               |                 584 |           72 |                8 (one per tick) |
| Storage (`readCosts`)                                              |                 576 |           72 |                               0 |
| Build (`beginCycle` plus reservation saving-cost reads)            |                 661 |           71 |            93 total (11.6/tick) |
| Factory (`readBuildingCosts`)                                      |                 576 |           72 |                               0 |
| Jobs and Craftsmen (`buildWeighting` / `readBuildingCosts`)        |                 576 |           72 |                               0 |

The 101 duplicate requests internal to a phase (12.6 per tick) were the only
same-phase duplicate observations. Construction saving discovery was followed
by 71 identical action IDs in pre-Gather Demand on every sampled tick; the
observed price and pool matched and root, queue, queue prefix, and epoch were
unchanged across that boundary. These are the strongest explicit reuse
opportunities.

## 3. Reuse-opportunity matrix

Counts below are repeated request observations in the eight-cycle sample. A
matching observed output is evidence about this save only; it does not by
itself prove that a later request is fresh.

| Source consumer               | Destination consumer | Repeated IDs / requests | Observed mutation boundary                                                                                         | Decision                                                  |
| ----------------------------- | -------------------- | ----------------------: | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Construction saving           | Pre-Gather Demand    |                71 / 576 | No tracked root, queue, queue-prefix, or epoch change; identical price/pool                                        | Best explicit window, but limited expected saving         |
| Construction saving           | Storage              |                71 / 568 | Queue changed across Market; only 8/568 endpoint queue prefixes matched                                            | Do not share                                              |
| Demand                        | Storage              |                72 / 576 | Queue changed across Market; only 8/576 endpoint prefixes matched                                                  | Do not share                                              |
| Construction saving or Demand | Build execution      |                71 / 661 | Gather, Market, Trigger, Research, Build ordering; affordability, holdings, queue and possible purchase can change | Do not share                                              |
| Build execution               | Factory              |                71 / 568 | Build can purchase and mutate counts/resources even when sampled endpoints look equal                              | Do not share                                              |
| Factory                       | Jobs/Craftsmen       |                72 / 576 | Consecutive; observed prices match, but no complete proof that all native price inputs stay unchanged              | Do not share without a narrower upstream dependency proof |
| Any sampled consumer          | Queue Reservations   |                       0 | No reservation price requests appeared in this sample                                                              | No opportunity measured                                   |

The current `actionCostEpoch` is only a partial fence. It does not enumerate
every native price dependency and is not used as proof of freshness here.
`src/adapters/evolve/captured-action-costs.ts` remains the native authority:
it appends a temporary queue entry, calls captured `buildQueue.setData`, parses
the native cost and paying pool, and restores the queue suffix in `finally`.
That behavior is retained. The test-only attribution callback includes
unavailable/exception results and is inert in ordinary production execution.

The pinned upstream implementation was checked at the recorded commit:
`src/functions.js` `buildQueue.setData` resolves the live action and invokes
`adjustCosts`; `adjustCosts` and `costMultiplier` consult action structure
counts and cost closures, along with race/traits/genes, technology, government,
universe, settings/modifiers, and other mutable game state. Purchases and
grants can change those inputs during a work tick. `on_cap()` is read-only in
this revision, but classifying it alone does not establish a price observation
window across the intervening controls. No broad read-only classification was
added.

## 4. Candidate gates and A/B outcome

The promotion gate was set before candidate work: at least 8 ms late-game
renderer CPU saved per work tick, at least 2 ms mid-game (or a documented
late-only case), matching `TaskDuration`, no p95/max work-cycle regression,
exact behavior, and no unresolved stale observation.

| Variant                                     | Requests plausibly removed per late tick from trace | Renderer CPU / `TaskDuration` A/B                                                                                  | Result                         |
| ------------------------------------------- | --------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Baseline                                    |                     442.6 measured; 72 distinct IDs | Existing profile: 29.23 ms/tick active renderer CPU; 21.05 s `TaskDuration` per 100 work ticks                     | Reference                      |
| A. Same-phase duplicate sharing             |                        12.6/tick (101 over 8 ticks) | Not run: the observed average probe cost implies under 1 ms/tick before sharing overhead                           | Rejected before implementation |
| B. Construction saving → Demand observation |                                             71/tick | Not run: proportional estimate is about 4.7 ms/tick, below the 8 ms gate; no candidate implementation to benchmark | Rejected before implementation |
| C. Factory → Jobs reuse                     |                                             72/tick | Not run: freshness across all upstream price inputs is unproven                                                    | Rejected on authority grounds  |

For A and B, the estimate uses the measured 29.2 ms native-pricing cost divided
by 442.6 requests/tick; it is a screening estimate, not a measured candidate
CPU result. Combining A and B would remove about 84 requests/tick, roughly
5.5 ms at that average, still below the gate. We therefore did not add a
behavioral sharing implementation or spend renderer benchmark runs on a
candidate whose trace-derived ceiling fails the predeclared criterion. The
previous generic invocation cache remains a separate negative result: 2.8%
late hits and 1.3–1.75 ms paired median saving, with no mid-game gain.

The bounded trace is not a performance A/B. It was paired for behavior:
exported save bytes and native control-usage totals were identical between the
instrumented trace bundle and production bundle. Existing baseline latency
and CPU profiles remain the reference (late active work-cycle p50/p95/max and
full profile attribution are in `full-runtime-performance-profile.md`). There
are no candidate p50/p95/max, renderer CPU, or `TaskDuration` results because
no candidate passed the prefilter. This experiment consequently makes no
claim that a small sharing variant improves runtime CPU. Since no behavioral
candidate was retained, the early, mid, Market toggle, purchase, grant, reset,
and price-changing-state parity matrix was not replayed. Exact replay parity
here applies to the bounded late-game instrumentation run only; the unit
contract still covers queue restoration and failed probes.

## 5. Correctness evidence and verdict

The reader contract test verifies native cost and pool parsing, failure
handling, and restoration of the player's queue entries after successful,
unavailable, and throwing probes. The trace/prod replay had identical exported
save and control-call totals. The only production pricing call path remains
native `setData`; no cached answer or execution-time substitution was added.

**Verdict:** this trace does not justify a shared-price implementation that
meets the required performance target. We can identify a safe-looking
Construction-saving-to-Demand window and same-phase duplicates, but their
estimated combined benefit is below 8 ms/tick. The larger overlaps cross
price-sensitive mutations or lack a complete upstream authority fence. For
this save and state, native repricing between consumers remains necessary
under the required freshness guarantee. Stop here for review; Market and
Research optimization were not investigated.
