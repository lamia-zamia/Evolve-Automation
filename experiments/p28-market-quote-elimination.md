# P28 — Market inactive-resource quote elimination

## Decision: B — correct candidate, insufficient benefit; reverted

The candidate preserved route decisions and execution on the measured fixtures, but it removed **zero** native quotes: the two fixtures with no Market route pass made no quote calls, and the late fixture had all 18 observed resources enabled for both imports and exports. Reversed-order CPU pairs changed direction and same-bundle controls exceeded the 2% noise gate. I reverted the runtime and test changes; this report is the retained artifact.

## Inputs and method

- Repository: `lamia-zamia/Evolve-Automation@deadspace`; starting commit: `ab665c72343501e49c72aa92fd0223958fa2c060`.
- Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`; pinned game snapshot SHA-256: `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Fixtures: `deadspace-early-day14.json` and `stage2f-fixed-progression-export.json` with `stage2e-integrated-mad-no-triggers.json`; late `mad-tech-offered-blocked.json` with `current-full.json`.
- All runs used seed 42, epoch `2026-09-21T00:00:00.000Z`, the same runner, and 800 periods / 100 work ticks for profiled and CPU windows.
- Baseline production bundle SHA-256: `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`. Candidate production bundle SHA-256: `1f53e55eca403ae3c99cec91e119abf90dc822ac2c49c3d849c6991e4e5065f8`.
- The profile pass enabled performance diagnostics and native tracing; its elapsed values are attribution only. The CPU pass disabled `perf`, callback profiling, and native tracing. Renderer process CPU is primary; CDP `TaskDuration` is the cross-check. `ScriptDuration` is recorded in raw data only and is not used as CPU evidence.

## Fixture profile and native quote counts

| Fixture     | Market rows per work tick | Import-only | Export-only | Both enabled | Both disabled | Baseline `aSell` / `aBuy` | Candidate `aSell` / `aBuy` | Quotes saved |
| ----------- | ------------------------: | ----------: | ----------: | -----------: | ------------: | ------------------------: | -------------------------: | -----------: |
| Early       |                         0 |           0 |           0 |            0 |             0 |                     0 / 0 |                      0 / 0 |            0 |
| Progression |                         0 |           0 |           0 |            0 |             0 |                     0 / 0 |                      0 / 0 |            0 |
| Late        |                        18 |           0 |           0 |           18 |             0 |             1,800 / 1,800 |              1,800 / 1,800 |            0 |

The early and progression saves did not run a global Market route capture in the measured window. Their both-disabled proportions are not applicable because they observed no rows. The late fixture had **0% both-disabled rows**. Each baseline/candidate quote total is for 100 work ticks. The profile harness also counted 18 successful sell-quote captures and 18 buy-quote captures per late work tick in the candidate.

The late settings file sets both `res_trade_buy_*` and `res_trade_sell_*` to true for all 18 observed resources. It contains no import-only, export-only, or both-disabled row. This is why the candidate's setting guard did not omit any quote. Export-only `aBuy` was not advanced as a separate candidate: there were no export-only resources in the workload, and the both-disabled candidate had no measurable opportunity to remove first.

### Route operations and elapsed attribution

P22 measured `autoMarket.adjustTradeRoutes` at **13.61 ms/work tick** in its late production profile. In the P28 instrumented test-surface profile, the baseline route phase was 1,585 ms over 100 ticks (15.85 ms/tick). The candidate's instrumented attribution over 100 ticks was:

| Candidate phase                                       | Total elapsed | Per work tick |
| ----------------------------------------------------- | ------------: | ------------: |
| Native quote capture                                  |      727.9 ms |      7.279 ms |
| Other route-input capture, exclusive of quote capture |      161.9 ms |      1.619 ms |
| Planner                                               |       25.5 ms |      0.255 ms |
| Execution and freshness checks                        |      777.1 ms |      7.771 ms |
| Remaining exclusive route-owner work                  |       55.2 ms |      0.552 ms |

These subphase timings include the test surface, performance instrumentation, and native tracing; they are attribution, not a CPU comparison. Their sum is 17.476 ms/tick, so they should not be compared directly to P22's differently instrumented 13.61 ms/tick. P22 did not separate quote capture from its other route phases.

The route owner ran 100 times in the late window. Native route-control calls were identical between variants: 4,583 successful calls total (3,208 `autoBuy`, 1,371 `autoSell`, and 4 `zero`). The calls were recorded across the 100-work-tick window; the runner's summary does not attribute each call to an individual tick.

## Correctness and failure behavior

The both-disabled candidate retained every unlocked resource's identification, safe-integer route-count validation, control lookup and generation checks, unmanaged-route accounting, and board/root freshness fences. It omitted inactive rows from the planner input rather than supplying synthetic prices. Active resources continued through the original paired quote path; in particular, import-only rows still captured `aSell` because planner sorting can read `tradeSellPrice`. Regional Market volume capture and route execution were untouched. No prices were cached across cycles.

The candidate changes one fail-closed case: a missing or stale quote for a both-disabled resource no longer blocks the whole route pass. That quote is not an input to planning, while the resource's route count and control authority are still checked. Missing/stale quotes for active resources continue to abort capture before route operations. Focused tests covered no managed routes, mixed settings, an inactive resource with existing routes, regional routes, stale board/root/quote observations, active quote failure, and a mid-execution no-op mutation.

Baseline and candidate matched on the late fixture's ordered native invocation trace SHA-256 (`88f247327e9a7c53a86ca4d71acac7c0d7e52b23bef2ead662408fa5de36dc42`), 2,194 RNG calls, 121,695 native control calls, final state SHA-256 (`26f08bef03ea462ce0a1237249b4aed4a9f8b85ee46d325a85c9fe5ee42361a8`), and exported-save SHA-256 (`a99e0f35aa7cb5b4c9f3f3a7ed93963f5b3382cf4194737218474e927c48168a`). Early and progression state, export, and RNG hashes also matched between variants. The CPU windows matched those late final-state, export, RNG, and native-control-count results.

## Uninstrumented renderer CPU comparison

The late fixture used three reversed-order pairs plus two same-bundle control windows per variant. All runs used 800 periods; baseline/candidate bundle identity was fixed within each run.

| Pair | Order                | Baseline renderer CPU | Candidate renderer CPU | CPU delta | Baseline `TaskDuration` | Candidate `TaskDuration` | Task delta |
| ---- | -------------------- | --------------------: | ---------------------: | --------: | ----------------------: | -----------------------: | ---------: |
| 1    | Baseline → candidate |               28.86 s |                28.09 s |    −2.68% |                 25.03 s |                  24.43 s |     −2.41% |
| 2    | Candidate → baseline |               28.39 s |                29.10 s |    +2.48% |                 24.67 s |                  25.52 s |     +3.42% |
| 3    | Baseline → candidate |               28.52 s |                28.40 s |    −0.43% |                 24.90 s |                  24.76 s |     −0.54% |

The mean paired delta was −0.22% renderer CPU and +0.13% `TaskDuration`; the signs and magnitudes are unresolved. Baseline same-bundle controls ranged 2.03% in CPU and 2.58% in `TaskDuration`; candidate controls ranged 4.52% and 4.37%. The controls do not resolve a 2% effect. There is no measured CPU improvement to retain.

## Validation

- Focused route/Market tests: passed (6 test files).
- Candidate `npm run build`: passed.
- Candidate Chromium runner contracts: passed, including determinism, isolation, reload, pause, and cleanup.
- `npm run check`: all 361 test files passed; the overall command then failed `format:check` on the untouched `experiments/p26-research-observation-dependencies.md` and `experiments/p27-research-completed-rendering.md` files.
- CPU and profile raw data were written under ignored `test-artifacts/benchmark/tmp/p28-*.json`; the runner scripts were temporary ignored files in the same directory.
- No commits were created and nothing was pushed.
