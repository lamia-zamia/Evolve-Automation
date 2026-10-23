# P30 — Batch native Market route mutations

## Decision A — retain 100-route batches

The 100-route implementation is correct on the pinned late-game fixture and materially reduces Market work. It reduces native route-control calls from 4,583 to 54 per 100 work ticks, and the uninstrumented renderer CPU was lower than baseline in all three reversed-order pairs. One native call per planned operation was also correct, but its whole-run CPU result was less consistent. Keep variant A; do not keep variant B.

Implementation: `e04590d4` (`batch Market route control calls`). The implementation remains inside the captured Market control registry and leaves `planTradeRoutes()` unchanged.

## Native contract and authority

At pinned Evolve [`src/resources.js`](https://github.com/pmotschmann/Evolve/blob/db38e2af831907d49aeb5348d678d8d8745d6c3f/src/resources.js), `autoBuy(res, keyMult = marketRouteMultiplier())` and `autoSell(res, keyMult = marketRouteMultiplier())` loop over `keyMult` transitions. Each transition checks direction, route capacity and import/export limits; `autoBuy` also checks the Dealmaker condition and `autoSell` applies Banana export restrictions. Each method calls `tradeRouteColor(res)` after its loop. `zero(res)` remains the native method and delegates to the opposite directional method with the resource's full absolute route count.

The captured registry forwards all supplied method arguments through `Reflect.apply(target, syntheticReceiver, [...args])`. The adapter now passes `[resourceId, batchCount]` for a directional call and `[resourceId]` for `zero`.

The pinned directional loops have no callbacks between route mutations. Their helpers read game state; the loop writes route counts, and the DOM color update runs after the loop. The pinned game does not synchronously redraw the Market or replace the root/control from those writes. The adapter's own synchronous Vue observers track catalog structure and tradability, not each resource's `trade` value. Vue's Market render work is queued. Therefore the captured root, board and control authority stays stable for the duration of a native call in this source version. This is the source-level justification for grouping transitions; final-state parity alone would not establish it.

Each batch still checks the captured root, board, Market record, resource container and resource record identities, expected resource/global route counts and control generation before invocation. After invocation it validates those identities and the exact expected resource and global route counts. A count mismatch stops the operation sequence. If the same captured authority is still current and the observed resource/global changes form a shorter directional prefix, the adapter records the partial count and stops instead of treating the request as complete.

The synchronous-reentrancy injection in the regression test intentionally changes the root during a fake native loop. The remaining loop iterations then run before the adapter can regain control, and the postcondition stops afterward. The pinned implementation has no such loop callback; if a future game revision adds one, the batching authority argument must be revisited before upgrading the pinned source.

## Deterministic parity and call counts

Inputs matched P29: `mad-tech-offered-blocked.json`, `current-full.json`, seed 42, epoch `2026-09-21T00:00:00.000Z`, 800 periods / 100 work ticks, pinned game SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`, HeadlessChrome 151.0.7922.71. The P30 harness compares the per-unit source at `a092cb90` with A and B built from the implementation source; it expands counted invocations into logical one-route transitions for parity checks.

| Variant                           | `autoBuy` calls | `autoSell` calls | `zero` calls | Total | Reduction from baseline |
| --------------------------------- | --------------: | ---------------: | -----------: | ----: | ----------------------: |
| Baseline, one transition per call |           3,208 |            1,371 |            4 | 4,583 |                       — |
| A, batches up to 100              |              35 |               15 |            4 |    54 |                  98.82% |
| B, one call per operation         |               7 |                3 |            4 |    14 |                  99.69% |

All three variants produced the same ordered planner operations and expanded logical route transitions. Baseline and both candidates had 2,194 RNG calls, state SHA-256 `26f08bef03ea462ce0a1237249b4aed4a9f8b85ee46d325a85c9fe5ee42361a8`, and export SHA-256 `a99e0f35aa7cb5b4c9f3f3a7ed93963f5b3382cf4194737218474e927c48168a`, matching P29. Every directional batch completed fully on this fixture; each variant had zero thrown route-control calls and zero stale/unavailable/skipped route trace errors. After opening Resources → Market in the runner, all variants rendered identical text and route-color classes for the 19 captured Market rows.

## Adversarial outcomes

The focused regression harness models the pinned native transition loop and exercises:

- Sign crossing in both resource/global absolute route counts.
- Market capacity exhaustion after capture, with a counted native call completing only a prefix; the adapter detects the prefix and does not run the next operation.
- Import-cap and export-cap stops, including a 100-route A chunk followed by a refused one-route chunk.
- `zero` through the native `zero` control, Dealmaker stopping a directional loop, and Banana export exclusivity across a sign crossing.
- Control-generation, root, board, resource-container and resource-record replacement after a batch; no subsequent batch runs.
- A synthetic synchronous root replacement inside a fake loop; it demonstrates the post-call limit described above and is not treated as evidence that an arbitrary native method is safe to batch.

The late-game native transitions also exercised the game's actual route methods. No direct route state mutation or duplicate route implementation was added to runtime code.

## Timing and CPU evidence

Instrumented P30 diagnostic totals over 100 work ticks were:

| Variant  | Native call elapsed | Route execution and postconditions |
| -------- | ------------------: | ---------------------------------: |
| Baseline |            177.5 ms |                           767.6 ms |
| A        |             30.1 ms |                            41.3 ms |
| B        |             25.0 ms |                            28.3 ms |

These diagnostic bundles captured each logical transition and each native call. The trace instrumentation affects absolute phase time, so the table is a within-P30 comparison; uninstrumented CPU evidence below is the gate for whole-run claims. Callback profile p50/p95/max were 6.7/193.2/700.9 ms for baseline, 6.4/187.1/621.1 ms for A and 6.6/206.6/649.0 ms for B. The high tail variability makes callback maxima inconclusive.

Uninstrumented CPU repetitions used three 800-period measurement windows after a 100-period warmup. Order was baseline → A → B → same-bundle A control, then B → A → baseline → same-bundle A control, then baseline → A → B → same-bundle A control. The A control reused the identical bundle SHA-256 in every repetition.

| Variant                | Renderer CPU median (range), seconds | CDP `TaskDuration` median (range), seconds |
| ---------------------- | -----------------------------------: | -----------------------------------------: |
| Baseline               |               9.6201 (9.4090–9.8947) |                     8.5228 (8.2116–8.7285) |
| A                      |               9.2115 (9.1791–9.5475) |                     8.0736 (8.0544–8.3451) |
| B                      |               9.3999 (9.2222–9.5268) |                     8.2311 (8.0898–8.3513) |
| Same-bundle A controls |              9.6314 (9.2498–10.0781) |                     8.5268 (8.0948–8.8701) |

A's median renderer CPU reduction is 4.25% and its median `TaskDuration` reduction is 5.27%. In the three reversed-order baseline pairs, A's renderer CPU was lower by 3.51%, 2.44% and 4.25%; its paired `TaskDuration` reductions were 4.39%, 1.91% and 5.27%. The same-bundle control median was within 0.12% of baseline, although its range shows substantial host/order variability. A clears the 2% whole-run gate in the renderer CPU pairs and median; the size of the exact gain remains noisy. B's medians were lower than baseline too, but it did not beat A and had less consistent paired CPU results while removing more intermediate fences.

## Reproduction and verification

- `node experiments/p30-market-native-batching.mjs` builds the legacy per-unit oracle, A and B diagnostic bundles, runs parity checks, then the reversed-order uninstrumented CPU matrix. `--diagnostic-only` reruns parity and diagnostics while retaining the prior CPU matrix.
- `node scripts/test.mjs captured-trade-routes captured-route-batching` — passed.
- `npm run build` — passed.
- `node tools/chromium-evolve-runner-test.mjs` — passed, including callback profiling, native trace, determinism, isolation and reload continuity contracts.
- `npm run check` — passed all five checks and 362 test files.
- `git diff --check` — passed.

Regression tests and this report are committed separately from implementation. Nothing was pushed. No upstream game files, `debug.js`, preload tabs, Research behavior or Workers were changed.
