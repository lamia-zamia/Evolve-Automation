# P4 — Demand-driven Building observations

## Decision

Keep the production change as an unmerged local review candidate on `codex/p4-demand-building-candidate`. The optimization removes all Building `on_cap()` calls from availability-only observations and preserves them for the explicitly requested switch-state path. The late fixture's renderer CPU improvement is below the 2% target on average and its paired 95% confidence interval includes zero, so the performance result is inconclusive. The mid fixture improves consistently. No candidate merge or push was made.

## Call graph and demand

`readBuildingUnlocks()` and `readEstablishedBuildingUnlocks()` previously called the full switch-state reader before returning the Building catalog. The captured Construction, Storage, and reset decisions only inspect `unlocked` membership and `regions`; Trigger `BuildingUnlocked` and `BuildingClickable` also only inspect membership. Those paths do not need native switch counts.

Trigger `BuildingEnabled` and `BuildingDisabled` do need switch counts. The Mech Bay expansion path reads the Purifier switch state only after the existing Mech Bay offer and native price gates. These paths use the new explicit switch observation method, which invokes native `on_cap()` and retains its strict result validation. Offer samples contain only offer membership and region completeness; they do not pretend to contain switch states.

## Bounded attribution

Attribution used the test-only bundle transform in `experiments/p4-native-observation-attribution.mjs` with the exact Chromium runner and the pinned DeadSpace snapshot. It records each observation stack, the number of switchable buildings, returned states, calls, elapsed invocation-path time, failures, unavailable controls, and work-cycle phase durations. The transform and runtime timing were used only for attribution, never during CPU A/B.

Fixture setup: game snapshot `test-artifacts/game/evolve-deadspace.js`, SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`, pinned upstream commit `db38e2af831907d49aeb5348d678d8d8745d6c3f`; seed 42; 600-period warmup; 1,000 measured periods; `autoPrestige=false`. Late save: `deadspace-late-2026-10-12.txt`. Mid save: `stage2f-through-7600-export.json`. The bounded profile includes 200 runner workticks and 125 measured tick-phase samples.

| Fixture / bundle | Offer observations | Native `on_cap()` calls | Returned switch states | Invocation path time | Unavailable / failed or malformed |
| ---------------- | -----------------: | ----------------------: | ---------------------: | -------------------: | --------------------------------: |
| Late baseline    |              1,375 |                  53,625 |                 53,625 |             145.0 ms |                             0 / 0 |
| Late candidate   |              1,375 |                       0 |                      0 |                 0 ms |                             0 / 0 |
| Mid baseline     |              1,261 |                   1,261 |                  1,261 |               9.1 ms |                             0 / 0 |
| Mid candidate    |              1,261 |                       0 |                      0 |                 0 ms |                             0 / 0 |

The late baseline's 53,625 calls over 200 workticks is 268.125 calls per worktick; the mid baseline's 1,261 calls is 6.305 per worktick. Across the 1,375 late and 1,261 mid observations, no caller consumed the returned state maps: every observation was for Construction or Storage offer membership. Thus all measured calls were unnecessary in these fixtures, and the candidate removes all of them. The unchanged full-read path still samples native states when Trigger or Mech logic asks for them.

P3's reported 2,202 successful calls per sampled space control is consistent with this experiment: each of the 22 `space-*` controls had 2,202 calls in the full 1,600-period P3 run (48,444 space-control calls together). P4 also saw the corresponding city controls, bringing the total to 85,878 calls over warmup plus measurement in the late A/B baseline. The measured window alone had 53,625 calls. At 39 switchable rows per observation, 1,375 observations account for exactly 53,625 calls.

The instrumented phase-duration sample had late baseline p50/p95 of 106.2/135.3 ms and candidate 111.8/119.6 ms; mid baseline 51.7/58.7 ms and candidate 50.1/54.6 ms. These diagnostic samples are separate from clean A/B and should not be interpreted as paired CPU measurements.

## Exact-runner CPU A/B

The A/B used the ordinary baseline bundle captured from the pre-candidate production build and the candidate production bundle. It used the same pinned game, saves, settings, seed, warmup, and measured periods listed above. Four pairs per fixture alternated which bundle ran first. No profiler or per-call tracing was enabled. Renderer CPU is process CPU seconds; TaskDuration is CDP seconds.

| Fixture | Pair | Order           | Renderer CPU baseline → candidate (s) | CPU reduction | TaskDuration baseline → candidate (s) | TaskDuration reduction |
| ------- | ---: | --------------- | ------------------------------------: | ------------: | ------------------------------------: | ---------------------: |
| Late    |    0 | baseline first  |                         21.55 → 20.96 |         2.74% |                       18.982 → 18.413 |                  3.00% |
| Late    |    1 | candidate first |                         22.05 → 21.58 |         2.13% |                       19.446 → 18.923 |                  2.69% |
| Late    |    2 | baseline first  |                         21.58 → 21.55 |         0.14% |                       18.996 → 18.995 |                  0.01% |
| Late    |    3 | candidate first |                         22.11 → 21.87 |         1.09% |                       19.375 → 19.171 |                  1.05% |
| Mid     |    0 | baseline first  |                         12.86 → 12.40 |         3.58% |                       10.948 → 10.551 |                  3.63% |
| Mid     |    1 | candidate first |                         13.14 → 12.66 |         3.65% |                       11.251 → 10.824 |                  3.80% |
| Mid     |    2 | baseline first  |                         12.76 → 12.28 |         3.76% |                       10.848 → 10.461 |                  3.57% |
| Mid     |    3 | candidate first |                         12.43 → 12.12 |         2.49% |                       10.586 → 10.253 |                  3.15% |

| Fixture | Mean paired CPU reduction | CPU 95% paired t interval | Mean paired TaskDuration reduction | TaskDuration 95% paired t interval |
| ------- | ------------------------: | ------------------------: | ---------------------------------: | ---------------------------------: |
| Late    |                     1.52% |           -0.30% to 3.35% |                              1.69% |                    -0.56% to 3.93% |
| Mid     |                     3.37% |            2.43% to 4.31% |                              3.53% |                     3.09% to 3.97% |

The measured `on_cap()` invocation reduction was 100%: late 53,625 to 0 and mid 1,261 to 0. All other native control invocation counts matched within every pair. Every paired run had the same exported save SHA-256 and stable game-state SHA-256: late `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2`; mid `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab`. There were no A/B errors or diagnostic events and no unavailable observations.

Late CPU variance prevents a claim that the candidate meets the 2% target, even though two pairs exceed it and TaskDuration points in the same direction. Mid shows a repeatable improvement and no regression. Preserve the candidate for review with the late result marked inconclusive.

## Reproduction

Run the attribution probe separately against each built bundle with `node experiments/p4-native-observation-attribution.mjs --bundle <bundle> --save <save> --out <output>`. It defaults to late fixture settings; pass the mid save explicitly for the mid profile.

Run clean A/B with `node experiments/p4-native-observation-ab.mjs --baseline test-artifacts/perf-profile/p4-baseline.user.js --candidate evolve_automation.user.js --late-save <late-save> --mid-save <mid-save> --out test-artifacts/perf-profile/p4-ab.json`. The scripts default to seed 42, 600 warmup periods, 1,000 measured periods, and four alternating pairs. Profile JSON files and the baseline bundle are scratch artifacts under ignored `test-artifacts/perf-profile/`.

## Candidate behavior and verification

Focused regressions cover offer-only no-call behavior, offer membership and complete-region semantics, explicit switch reads, invalid native results, root and catalog replacement, control generation, changing live `on` and native cap values, incomplete regions, and Construction, Storage, Mech, and Trigger contracts.

Verification commands and outcomes are recorded in the P4 dated progress log after the final check run.
