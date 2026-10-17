# P4 — Demand-driven Building observations

## Decision

Keep the production change as an unmerged local review candidate on `codex/p4-demand-building-candidate`. The optimization removes all Building `on_cap()` calls from availability-only observations and preserves them for the explicitly requested switch-state path. The final 12-pair late renderer CPU reduction averages 2.81%, but its paired 95% confidence interval includes zero and the series shows drift and order effects, so the performance result is inconclusive. The mid fixture regressed with a paired interval below zero. No candidate merge or push was made.

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

The selected post-warmup interval is periods 600–1600 and contains 125 tick-phase workticks, verified by the attribution probe's interval-local tick samples. The late baseline's 53,625 calls over those 125 measured workticks is 429 calls per worktick; the mid baseline's 1,261 calls is 10.088 calls per worktick. The prior 200-worktick divisor included the 600-period warmup and was incorrect. Across the 1,375 late and 1,261 mid observations, no caller consumed the returned state maps: every observation was for Construction or Storage offer membership. Thus all measured calls were unnecessary in these fixtures, and the candidate removes all of them. The unchanged full-read path still samples native states when Trigger or Mech logic asks for them.

P3's reported 2,202 successful calls per sampled space control is consistent with this experiment: each of the 22 `space-*` controls had 2,202 calls in the full 1,600-period P3 run (48,444 space-control calls together). P4 also saw the corresponding city controls, bringing the total to 85,878 calls over warmup plus measurement in the late A/B baseline. The measured window alone had 53,625 calls. At 39 switchable rows per observation, 1,375 observations account for exactly 53,625 calls.

The instrumented phase-duration sample had late baseline p50/p95 of 106.2/135.3 ms and candidate 111.8/119.6 ms; mid baseline 51.7/58.7 ms and candidate 50.1/54.6 ms. These diagnostic samples are separate from clean A/B and should not be interpreted as paired CPU measurements.

## Previous four-pair exact-runner CPU A/B

This earlier four-pair result is retained unchanged as historical evidence. It used the ordinary baseline bundle captured from the pre-candidate production build and the candidate production bundle. It used the same pinned game, saves, settings, seed, warmup, and measured periods listed above. Four pairs per fixture alternated which bundle ran first. No profiler or per-call tracing was enabled. Renderer CPU is process CPU seconds; TaskDuration is CDP seconds. The 12-pair repeat below supersedes its performance conclusion.

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

## Final ordinary A/B — 12 alternating pairs

This repeat keeps the same production bundles, pinned game SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`, saves, settings, seed 42, 600-period warmup, and 1,000-period measurement. Profiling and attribution hooks were disabled. Each exact-runner window was checked for 1,000 periods and 125 workticks (periods / 8). The baseline bundle hash was checked as `b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540`.

Every pair passed behavioral parity: exported saves matched exactly, stable state hashes matched, capture was complete, there were no errors or thrown native controls, and every non-`on_cap()` control count matched exactly. On these no-trigger fixtures, baseline `on_cap()` totals matched the expected 85,878 late and 2,028 mid calls per run; candidate totals were exactly zero. The prior narrow stable-state exclusions remain explicitly documented: `.stats.current` and `.city.market.mtrade`. No other fields were excluded.

Renderer CPU values below are baseline → candidate seconds; matched reduction is `(baseline - candidate) / baseline`. TaskDuration uses the same order and calculation.

| Late pair | Order           | Renderer CPU (s) | CPU reduction | TaskDuration (s) | TaskDuration reduction |
| --------: | :-------------- | ---------------: | ------------: | ---------------: | ---------------------: |
|         0 | Baseline first  |  29.120 → 28.000 |         3.85% |  26.231 → 25.177 |                  4.02% |
|         1 | Candidate first |  25.110 → 27.540 |        -9.68% |  22.369 → 24.737 |                -10.58% |
|         2 | Baseline first  |  31.460 → 29.300 |         6.87% |  28.275 → 26.253 |                  7.15% |
|         3 | Candidate first |  28.560 → 25.170 |        11.87% |  25.575 → 22.365 |                 12.55% |
|         4 | Baseline first  |  24.900 → 20.270 |        18.59% |  22.076 → 18.100 |                 18.01% |
|         5 | Candidate first |  26.750 → 21.180 |        20.82% |  23.976 → 18.729 |                 21.88% |
|         6 | Baseline first  |  22.540 → 21.660 |         3.90% |  20.091 → 19.132 |                  4.77% |
|         7 | Candidate first |  27.140 → 27.600 |        -1.69% |  24.327 → 24.723 |                 -1.63% |
|         8 | Baseline first  |  29.810 → 26.130 |        12.34% |  26.983 → 23.207 |                 13.99% |
|         9 | Candidate first |  25.820 → 28.730 |       -11.27% |  23.107 → 25.830 |                -11.79% |
|        10 | Baseline first  |  27.730 → 29.470 |        -6.27% |  24.938 → 26.571 |                 -6.55% |
|        11 | Candidate first |  25.270 → 29.220 |       -15.63% |  22.468 → 26.174 |                -16.49% |

| Mid pair | Order           | Renderer CPU (s) | CPU reduction | TaskDuration (s) | TaskDuration reduction |
| -------: | :-------------- | ---------------: | ------------: | ---------------: | ---------------------: |
|        0 | Baseline first  |  14.100 → 15.920 |       -12.91% |  12.160 → 13.829 |                -13.73% |
|        1 | Candidate first |  16.450 → 16.360 |         0.55% |  14.345 → 14.315 |                  0.21% |
|        2 | Baseline first  |  13.270 → 15.960 |       -20.27% |  11.352 → 13.912 |                -22.55% |
|        3 | Candidate first |  13.490 → 15.810 |       -17.20% |  11.577 → 13.794 |                -19.15% |
|        4 | Baseline first  |  16.220 → 16.920 |        -4.32% |  14.166 → 14.882 |                 -5.05% |
|        5 | Candidate first |  13.310 → 16.030 |       -20.44% |  11.395 → 14.024 |                -23.07% |
|        6 | Baseline first  |  17.180 → 17.980 |        -4.66% |  15.115 → 15.772 |                 -4.35% |
|        7 | Candidate first |  13.090 → 13.110 |        -0.15% |  11.169 → 11.137 |                  0.29% |
|        8 | Baseline first  |  13.380 → 13.380 |         0.00% |  11.431 → 11.450 |                 -0.17% |
|        9 | Candidate first |  12.750 → 12.890 |        -1.10% |  10.812 → 10.967 |                 -1.43% |
|       10 | Baseline first  |  12.580 → 13.460 |        -7.00% |  10.687 → 11.362 |                 -6.32% |
|       11 | Candidate first |  10.970 → 12.810 |       -16.77% |   9.432 → 10.907 |                -15.64% |

| Fixture / metric  | Mean paired reduction | Paired 95% t interval | First 6 mean | Last 6 mean | Baseline first / candidate first |
| ----------------- | --------------------: | --------------------: | -----------: | ----------: | -------------------------------: |
| Late renderer CPU |                 2.81% |      -4.76% to 10.38% |        8.72% |      -3.10% |                   6.55% / -0.93% |
| Late TaskDuration |                 2.95% |      -4.98% to 10.87% |        8.84% |      -2.95% |                   6.90% / -1.01% |
| Mid renderer CPU  |                -8.69% |     -13.96% to -3.42% |      -12.43% |      -4.95% |                  -8.19% / -9.19% |
| Mid TaskDuration  |                -9.25% |     -15.00% to -3.50% |      -13.89% |      -4.60% |                  -8.69% / -9.80% |

The late CPU decision is **still inconclusive**: the mean is above 2%, but the paired interval includes zero. First-six versus last-six means shifted from +8.72% to -3.10%, and baseline-first versus candidate-first means were +6.55% versus -0.93%; both drift and order effects remain material. Mid regressed: the CPU mean reduction was -8.69% with a 95% paired interval of -13.96% to -3.42%. The experiment script preserves every run and matched difference in `test-artifacts/perf-profile/p4-ab-final.json` (ignored scratch output).

## Native switch-path exact-runner scenarios

`experiments/p4-native-switch-paths.mjs` uses stored trigger settings against the unmodified pinned game and the late save, without writing game state. The save naturally has 36 city mines with `on: 0`, and city farms with no `on` field. For switchable mines, the candidate called the current native method seven times in each trigger-condition scenario; baseline and candidate produced the same exported save and stable game state with no runtime errors:

| Scenario                           | Expected condition                   | Baseline `on_cap` calls | Candidate `on_cap` calls |
| ---------------------------------- | ------------------------------------ | ----------------------: | -----------------------: |
| `BuildingEnabled(city-mine) >= 1`  | false (`on` is zero)                 |                      53 |                        7 |
| `BuildingDisabled(city-mine) >= 1` | true (36 off)                        |                      53 |                        7 |
| `BuildingDisabled(city-farm) >= 0` | true (no native switch reports zero) |                       0 |                        0 |

The scenario script asserts each expected boolean from the natural save fields and configured threshold, and checks that candidate switch reads reach the current `on_cap()` for the two switchable trigger operands. Its control diagnostics show no native action-control invocations in these scenarios, so the downstream trigger click is not claimed as exercised. The active-target UI did not expose an actionable target for this fixture. The exact-runner output is `test-artifacts/perf-profile/p4-switch-paths.json` (ignored scratch output).

Missing/malformed `on_cap`, root replacement, current control regeneration, changed live values, and the Mech Bay/Purifier expansion decision remain covered by the focused fixtures in `tests/evolve/progression/captured-building-switch-states-test.mjs`, `tests/evolve/progression/captured-triggers-test.mjs`, and `tests/integration/ordering/captured-phase-order-test.mjs`; these cases were not exercised in the exact runner. None of the checked exact-runner saves initializes `portal.mechbay` or `portal.purifier`. Those limitations are retained explicitly rather than fabricating upstream game state and claiming a natural-save scenario.

The measured `on_cap()` invocation reduction was 100%: late 53,625 to 0 and mid 1,261 to 0. All other native control invocation counts matched within every pair. Every paired run had the same exported save SHA-256 and stable game-state SHA-256: late `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2`; mid `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab`. There were no A/B errors or diagnostic events and no unavailable observations.

In that historical four-pair run, mid appeared repeatably improved. The 12-pair repeat below supersedes that preliminary mid conclusion as well as the late conclusion.

## Reproduction

Run the attribution probe separately against each built bundle with `node experiments/p4-native-observation-attribution.mjs --bundle <bundle> --save <save> --out <output>`. It defaults to late fixture settings; pass the mid save explicitly for the mid profile.

Run clean A/B with `node experiments/p4-native-observation-ab.mjs --baseline test-artifacts/perf-profile/p4-baseline.user.js --candidate evolve_automation.user.js --late-save <late-save> --mid-save <mid-save> --out test-artifacts/perf-profile/p4-ab.json`. It verifies the known baseline and pinned game hashes, uses seed 42, 600 warmup periods, 1,000 measured periods, and 12 alternating pairs, and fails closed on pairwise parity or interval mismatches. Profiling remains disabled. Profile JSON files and the baseline bundle are scratch artifacts under ignored `test-artifacts/perf-profile/`.

## Candidate behavior and verification

Focused regressions cover offer-only no-call behavior, offer membership and complete-region semantics, explicit switch reads, invalid native results, root and catalog replacement, control generation, changing live `on` and native cap values, incomplete regions, and Construction, Storage, Mech, and Trigger contracts.

Verification commands and outcomes are recorded in the P4 dated progress log after the final check run.
