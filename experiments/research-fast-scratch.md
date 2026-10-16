# Research offers-only scratch draw: skip completed-tech callbacks

## Verdict

Skipping the completed-tech `addAction` loop during the automation's offers-only scratch capture produces a substantial late-game CPU reduction: median renderer CPU fell 13.6% and median Research work-cycle p50 fell 18.4% in the late save. The early-save CPU change was only 3.4%, while mid-game was 4.2%. In three 4,000-period progression comparisons, the candidate made the same recorded decisions and reached the same checkpoints as baseline; no harmful or unacceptable divergence was observed.

This is evidence that the completed-tech row callbacks are unnecessary for the current offers-only consumer in the tested states. It is not yet deployable against unmodified Evolve: `drawTech` is an ESM lexical function and the userscript's captured tab hook can wrap the outer draw, but cannot selectively skip its internal callback loop. The test-only bundle gate requires a game-side read. The next architecture investigation should avoid a full Research UI draw or establish a narrow upstream capability, then repeat changing-state functional validation.

## Experimental change

Pinned upstream was `db38e2af831907d49aeb5348d678d8d8745d6c3f` (`DeadSpace`). The baseline snapshot was built from the unmodified pinned checkout. A separate experimental snapshot changed only the completed-tech loop in `drawTech`: while `window.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ === true`, it still enumerates/classifies completed technologies and performs the rest of `drawTech`, but skips each `addAction('tech', tech_name, true, false)` call. An instrumented build records draw and row counts; a minimal build used for performance and latency runs has no detailed trace instrumentation.

The test automation bundle sets the flag only around offers-only capture, with explicit `try/finally` restoration. The include-granted path never enables it. Normal player rendering and granted-tech capture therefore keep the pinned game's original behavior. The pinned checkout and production bundle were not changed.

## Measurement setup

- Exact Chromium runner; Chrome Headless 151.0.7922.71, Node 24.18.0.
- Early, mid, and late save inputs were reused for every arm. Save SHA-256: early `701d69f9fb3e8a92d5dd84f1a4f6fe7070609a1f2ee236333666274400861744`; mid `7c25f5ce…`; late `e2c9d1d4…`.
- Seed 42, tick rate 8, same settings file in every arm. The benchmark profile had `autoPrestige=true`; for this controlled comparison a local copy set only `autoPrestige=false`, so no arm ran periodic prestige. Settings SHA-256: `3abe13a52a294ae83a0526e8c69f7bcaf3c549c46ab9e451e149bb7ae715d9ec`.
- Performance runs alternated baseline/candidate order across four repetitions. Each repetition used 400 warm-up and 800 measured runner periods (100 work ticks). Detailed tracing and callback profiling were disabled. Renderer-process CPU is the primary measure; CDP `TaskDuration` is a cross-check. `ScriptDuration` was not used as a CPU proxy.
- Latency runs used four alternating repetitions with the same warm-up and measured periods. Their cycle percentiles aggregate 400 measured work cycles per save and arm. Callback timing alone was enabled to attribute total callback time; no detailed per-draw trace was active.
- Separate trace runs counted actual Research draws, offered rows, completed-tech classification and callback time. These are explanatory samples, not the performance authority.
- Longer functional comparisons used the same settings, seed and saves, with 400 warm-up plus 4,000 measured periods and checkpoints every 1,000 measured periods. Baseline and candidate each ran once per save; this validates observed function, not statistical progression variance.

## CPU and responsiveness

Four-run medians per 800-period measurement window (100 work ticks):

| Save  | Renderer CPU, baseline → skip | Change | CPU saved per work tick | TaskDuration, baseline → skip | Change |
| ----- | ----------------------------: | -----: | ----------------------: | ----------------------------: | -----: |
| Early |               8.875 → 8.570 s |  −3.4% |                 3.05 ms |               7.588 → 7.327 s |  −3.4% |
| Mid   |              10.200 → 9.775 s |  −4.2% |                 4.25 ms |               8.752 → 8.437 s |  −3.6% |
| Late  |             17.570 → 15.180 s | −13.6% |                23.90 ms |             15.425 → 13.427 s | −13.0% |

Median cycle latency across the four latency repetitions, milliseconds:

| Save  | p50 baseline → skip | p95 baseline → skip | p99 baseline → skip | Max baseline → skip |
| ----- | ------------------: | ------------------: | ------------------: | ------------------: |
| Early |         36.5 → 35.5 |         58.4 → 58.5 |         77.5 → 77.9 |         83.3 → 80.2 |
| Mid   |         43.5 → 41.4 |         63.3 → 60.0 |         81.2 → 75.7 |         82.5 → 83.2 |
| Late  |         93.7 → 76.5 |        110.6 → 92.8 |       117.7 → 103.9 |       125.4 → 110.6 |

The early and mid CPU benefit is small relative to run-to-run variation; late CPU and latency improvements are consistent across repetitions. At late state, skipping callbacks saved about 2.39 seconds renderer CPU per 100 work ticks. The exact-runner wall medians for those 100-tick windows were 15.44 s baseline and 13.44 s candidate.

## What the callbacks cost

Separate trace windows (800 runner periods after 400 warm-up) had these observed counts. Offers and completed-tech classification are unchanged; only the completed row callbacks are suppressed:

| Save  | Research draws | Offered rows | Completed classified | Completed callbacks baseline → skip | Callback elapsed baseline → skip |
| ----- | -------------: | -----------: | -------------------: | ----------------------------------: | -------------------------------: |
| Early |            114 |        1,326 |                3,790 |                           3,790 → 0 |                   205.8 → 0.1 ms |
| Mid   |            110 |        2,163 |                7,683 |                           7,683 → 0 |                   425.3 → 0.4 ms |
| Late  |            101 |          400 |               26,400 |                          26,400 → 0 |                 2,088.7 → 0.7 ms |

The long progression trace saw 544/522/501 Research draws for early/mid/late respectively and 23,709/40,646/132,000 completed-tech classifications. The candidate executed zero completed callbacks in those scratch draws; baseline callback elapsed totals were 1.083/1.710/8.391 seconds. Enumeration and completed-tech classification remain present, so this experiment measures the callback loop's practical maximum benefit, not the maximum possible benefit from eliminating the whole Research draw.

Sampling-profiler draw totals in the separate traced 800-period windows were early 1,049.7 ms baseline versus 831.4 ms candidate, mid 1,342.7 versus 925.9 ms, late 2,797.8 versus 710.4 ms. These profiler samples are directional and include profiler overhead; use the calibrated renderer CPU and TaskDuration tables above for the headline result. Research draw counts and latest offers/prices matched within each trace pair.

## Functional comparison

Across every 1,000-period checkpoint in each 4,000-period progression run, comparison found equal resource amounts, technology levels, building counts, construction/research queues, Research offer identities and price attributes, and random-call counts between baseline and candidate. No cycle stalled before the requested endpoint. No controls threw. No stale-control refusal or purchase failure was recorded by the available diagnostics.

At the final checkpoint:

| Save  | Day baseline = skip | Tech count baseline = skip |       Changed tech levels | Random calls baseline = skip | Final offers |
| ----- | ------------------: | -------------------------: | ------------------------: | ---------------------------: | -----------: |
| Early |                 234 |                         32 | Same 18 changed tech rows |                        2,463 |           17 |
| Mid   |                 614 |                         39 |  Same 8 changed tech rows |                        4,004 |           18 |
| Late  |             502,667 |                         99 |                      None |                        7,224 |            4 |

The late run's black-hole and universe milestone counters both advanced from 66 to 67 in both arms; the unaffordable Unification research remained queued in both. Early and mid arms had the same baseline automation diagnostics in both variants (three early errors and two mid errors): the already-known A.R.P.A. native capture observation failures at periods 8 and 16, and in early the incomplete foundry control reported at period 288. Late had no diagnostic errors. No evidence links these pre-existing errors to the callback gate.

Classification: **A (harmless)** for skipped internal row generation/binding callbacks in the sampled states; **B (beneficial)** for late CPU and latency; no **C (potentially harmful)** or **D (unacceptable)** difference observed. Resources, prices, purchases, queues, milestones, and RNG call counts showed no divergence in these runs. This does not establish behavior for every possible changing state, grant, or player-render path; those paths were not gated.

The user's earlier exact-identity concern is not used as a rejection criterion. The measured long runs did happen to match for the compared state fields and RNG call counts; exported save bytes were not required or compared.

## Why the callback can be skipped here

The experiment directly demonstrates that, for these automation offers-only captures, running or skipping `addAction` for already completed techs did not change the captured offers/prices or any compared automation decision/state over the tested progressions. The offer-generation path, including its qualification and cost work, still ran. Therefore those callbacks' cost is not needed to get the current offers-only answer in these tested runs.

The test does **not** establish that every possible callback is side-effect-free in every game state. It specifically bypasses the completed-tech `addAction` calls after `drawTech` has enumerated and classified the old technologies. No allowlist was needed because no divergence was found to isolate. A changed game snapshot in the experiment is an instrument, not evidence that an upstream patch is required for eventual deployment.

## Deployability and next architecture step

At the pinned upstream revision, `drawTech` is exported by the actions module but imported and invoked as a lexical binding by game modules; it is not exposed on `window`/`globalThis`. The automation's captured `swapTab`/Research discovery wraps the outer invocation. Existing Vue mount suppression and removal of the completed-tech DOM happen too late to avoid qualification, price, and callback work. There is no current userscript hook for selectively replacing the internal completed-tech loop. A DOM append interception could at most avoid remaining rendering work, which is a much smaller portion and does not reproduce this result.

Consequently this exact optimization is **not deployable against unmodified Evolve through the current hooks**. Implementing the flag in production would require a game-side patch and violates the project's upstream constraint. The useful follow-up is an independent offers-data path that reads authoritative current tech eligibility and price inputs without invoking the full UI draw, or a narrowly exposed upstream capability. That replacement must be validated over changing state and grants before integration. This experiment stops at that verdict.

## Reproduction artifacts and verification

All generated snapshots, test bundles, raw runner records, and trace data are scratch artifacts under ignored `test-artifacts/research-fast-scratch/` and are not committed. Snapshot hashes:

- Baseline game snapshot: `e39fc2ef9076d0e0afe929be6588c89fc047a4641bd16ccf37644b94574dc521`.
- Minimal experimental game snapshot used for calibrated CPU/latency: `98ef2ca5e5e7f9a5c58fc407b1c73403224483cf86191a30b96077e5755cd54c`.
- Instrumented experimental snapshot used for callback traces: `2952583616b16a2677aedc108a54a03dc94f5b93c6583e5ab3b066ed22401254`.
- Test-only experimental automation bundle: `63ae0dd1d97de3e8d6f376234ba2a0460df45bfb310129054374e3a5fa6d60d6`.
- Production bundle, unchanged: `fd04d858f69e917367efeba3a725ccd2c810e838c613705b1f423500b39e7c20`.

The experiment patcher, exact-runner drivers, and focused patch tests are committed separately. `node tools/chromium-evolve-runner-test.mjs` passed, including callback-profile period attribution and runner isolation; focused patch tests passed. Repository-wide checks are run before handoff. The pinned upstream checkout and production bundle remain unchanged; no push or merge was performed.
