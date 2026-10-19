# P13D.1 — Live Smelter demand authority

## Outcome

**A — Live quantitative comparison established.** A test-only Q proposal reached the ordinary owner boundary, passed same-cycle demand and supply-scope validation, represented its additional quantity in the complete `SmelterInput`, and caused exactly one hypothetical pure `planSmelter()` call. The ordered hypothetical commands were compared with the incumbent commands. The owner still executed its original decision, and the replay showed exact gameplay parity.

This establishes the shadow comparison path. It does not establish strategic benefit, complete production effects, or permission to execute an autonomous request.

## Reproduced rejection and source values

The old predicate treated every named Construction saving target as if it had to name a `city` pool and contain a finite Steel cost. The captured interface permits `pool` to be absent, and a Construction target can have no Steel cost. The separate aggregate demand interface provides `requestedQuantity("Steel")` and `isDemanded("Steel")`; these values are not aliases for that target's Steel cost.

The exact ten-owner capture is recorded in the ignored raw artifact `test-artifacts/benchmark/tmp/p13d1-live-smelter-demand-authority.json`. It used the pinned game snapshot `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`, pinned source ref `db38e2af831907d49aeb5348d678d8d8745d6c3f`, seed 42, and owner generations 224–233. All ten original comparisons returned `incumbent-demand-pool-or-target-unsupported`.

| Owner generations | Construction target  | Pool field |                                         Complete target cost | Aggregate Steel request | `isDemanded` | Steel amount / cap / rate                         | `steelTimeToRequired` | Old rejection condition                                                                                                |
| ----------------- | -------------------- | ---------- | -----------------------------------------------------------: | ----------------------: | ------------ | ------------------------------------------------- | --------------------: | ---------------------------------------------------------------------------------------------------------------------- |
| 224–231           | `city-coal_power`    | absent     | Money 10000, Crystal 125, Copper 800, Cement 480, Steel 1000 |                    1000 | true         | amount 37.477→999.177 / 33516 / rate 13.74→109.91 |         70.053→0.0075 | Named target had no pool (`pool !== "city"`); its Steel cost was present and finite, so the target-cost clause passed. |
| 232               | `city-basic_housing` | absent     |                                     Money 7574, Lumber 28470 |                     250 | false        | amount 1246.471 / 33516 / rate 123.65             |                     0 | Named target had no pool and no Steel cost. Both old target checks failed.                                             |
| 233               | `city-basic_housing` | absent     |                                     Money 7574, Lumber 28470 |                       0 | false        | amount 1243.652 / 33516 / rate 123.59             |                     0 | Named target had no pool and no Steel cost. Both old target checks failed.                                             |

At generations 224–231, the incumbent decision adjusted Steel and Iron (`subMetal:Iron`, `addMetal:Steel`). At 232–233 its native command list was empty. The proposal's owner-cycle demand-generation token matched the owner cycle at 224–233; independent Construction/demand identity remains unknown. The capture retains the raw absent pool/Steel fields and explicit presence booleans; it does not convert missing scope into `city`.

## Authority and comparison semantics

In the pinned game, Steel uses the ordinary civilization-wide resource/payment path while supply mode is not regional; when the game enables regional supply, Steel's regional pools and payment semantics apply. The adapter therefore derives `civilization-wide`, `regional`, or `unavailable` from same-cycle captured root state. It does not infer city scope from a missing Construction pool. The present replay's native-informed Steel scope was `civilization-wide`. Regional Steel remains explicitly unsupported by this city-level Q comparison until a supported regional quantity assignment is available.

The demand sampler combines resource request sources by maximum and clamps each result to the resource's storage maximum. Explicit saving-target costs contribute requests, and other prioritized requests can raise the aggregate. `isDemanded` compares the combined request with current stock. Therefore the effective incumbent target is the sampled aggregate Steel request plus any proposed amount, capped at Steel capacity; the Construction target's individual cost is not a universal authority requirement. The test coverage also verifies max-combination and storage clamping.

For a supported comparison, the adapter retains all incumbent planner inputs and changes only `steelTimeToRequired`, computed with the same `timeTo()` implementation used by the incumbent adapter. It preserves the current `steelDemanded`, Iron demand, Construction target, fuel and production constraints, and stock/capacity behavior. A same-cycle root snapshot supplies scope using three additional leaf reads (`tech.shadow`, `race.supplyZones`, `race.supplySplit`); it performs zero additional root snapshot reads and zero additional native calls.

## Commitment and freshness diagnostics

The test fixture exposes a symbolic `test-only:Construction:Steel:fixture` commitment. It is not treated as validated native evidence and does not block an added Steel request. Known commitments, source-backed claims, demonstrated conflicts, and unknown external commitment coverage are reported separately. A demonstrated conflict requires a source-backed Steel/city claim with an explicit reason. `goalRequestAuthorized` and `authorizationToExecute` remain false; no shared reservation or cross-owner enforcement was added.

The replay verifies same-cycle root, progression, permission, and owner-cycle demand-generation token equality. The Q hook stamps that token from the owner-cycle value, so it does not independently verify a Construction or demand identity; that identity remains unknown. The invalidation event list is reported as a declaration only. Current price identity is unverified, current goal identity and offer/goal/queue freshness are unknown, and execution authorization is false. No independent Research or Construction candidate scan was added to fill these unknowns.

## Q replay and parity

The correctness-only Chromium replay captured the actual ten-cycle owner window. It skipped the CPU factorial. Results:

- Q validations: 10; structurally valid: 10; quantitative requests represented: 10.
- Hypothetical `planSmelter()` calls: exactly 10, one for each supported live proposal.
- Each proposal added 10 Steel to the aggregate target, subject to storage clamping. All ten comparisons classified as `quantity-represented-but-native-policy-insensitive`; none were called economically redundant.
- Incumbent and proposed ordered commands matched in all ten observations. The first eight retained `subMetal:Iron`, `addMetal:Steel`; the final two remained no-op plans.
- Incumbent and proposed owner execution remained the ordinary native path. Exported state, owner outcomes, control usage, random calls, native invocation count (94,940), invocation order, and invocation-order hash matched. No game-state or native-invocation divergence was observed.
- The Q observer recorded 3 additional same-root leaf reads, 0 additional root snapshot reads, and 0 additional native calls.
- Pure comparison timing was quantized at the runner timer's approximately 0.1 ms resolution; samples were 0 or about 0.1 ms. This is a bounded low-resolution characterization, not a precise timing distribution.

## Regression and verification

Focused tests cover Construction targets with absent and explicit city pools, incompatible regional scope, targets with and without Steel costs, aggregate requests from multiple sources, maximum combination, storage clamping, city-wide scope authority, unsupported regional scope, compatible Construction commitments, proven conflicts, symbolic commitments with unknown coverage, quantity represented with unchanged commands, changed hypothetical commands, changed price/root/progression/permission, stale owner cycles, declaration-only invalidation, missing goal/price authority, zero planner calls for invalid requests, and exactly one planner call for a supported live request. The Chromium runner contract suite checks byte-identical bundle behavior, PID accounting, callback attribution, determinism, isolation, reload continuity, paused-game behavior, and cleanup.

Verification results:

- Focused Smelter, captured resource demand, demand prioritization, and owner-coordination tests: passed.
- P13B.1 exact incumbent-authority replay: passed (four 100-worktick control cells).
- P13D correctness-only exact Chromium replay: passed; CPU factorial skipped by design.
- Chromium runner contracts: passed.
- `npm run build`: passed.
- Full `npm run check`: passed all five stages, including typecheck, architecture checks, lint, format, and all 356 test files.
- `git diff --check`: passed after the final replay and report edit.

## CPU readiness

CPU readiness is **not established**. No new G/S/Q/U factorial was run because the earlier Q path had no planner invocation and the present task first establishes correctness. The prior P13D repeated-control variation of 23.77% remains a measurement limitation. No claim is made that the complete G→Q path meets a 2% overhead threshold.
