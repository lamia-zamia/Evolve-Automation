# P13E — Smelter comparison fast path and ordinary boundary

## Decisions

**Correctness A — Proven fast path established.** The restricted proof reuses the incumbent `SmelterDecision` and command ordering only when the inputs differ solely in `steelTimeToRequired` and the planner source proves that field cannot affect the decision. Required mode with an unmet Steel demand and an active Iron producer remains on the pure planner fallback.

**CPU C — Measurement authority unresolved.** The complete renderer G → Q CPU cost was not established. P13D's calibrated benchmark rejected attribution after repeated-control variation reached 23.77%; this task ran its correctness-only Chromium cohort and did not repeat the noisy factorial. The P13B.1 reversed cells also varied substantially, so they are not evidence for a 2% result.

## Ordinary G observation boundary

Before this change, the ordinary `readInput()` path called `isRegionalSupply(root)`. Beyond the properties already read to construct the input, that helper accessed `root.tech` and `root.race` again and read `tech.shadow`, `race.supplyZones`, and `race.supplySplit`: **five additional property gets** per initialized Smelter cycle (two repeated parent gets and three scope-leaf gets). It acquired no second root and issued no native, demand, planner, or control calls for that derivation.

After this change, the ordinary G path performs **zero** of those five derivation reads. A proxy/getter-count test records one root snapshot, two ordinary `root.tech`/`root.race` gets (one each for existing input construction), one demand read, one ordinary control resolve, zero scope-leaf reads, and zero observer calls. Those existing root, demand, and control counts are unchanged by the fix. The exact Chromium parity replay confirms the native invocation order is unchanged.

When the diagnostic snapshot is requested, scope is derived once from the already captured root. That boundary adds two repeated parent gets and reads the same three leaves, with no additional root acquisition or native calls. No scope is cached across cycles. The pinned game bundle defines `supplyMode()` as regional only when Supply Zones is unlocked, `supplySplit` is truthy, and Shadow is at least 5 (`test-artifacts/game/evolve-deadspace.js:70172–70178`). Missing optional leaves therefore follow the game's falsey global-supply branch; missing `tech` or `race` authority containers, or a truthy malformed Shadow value, yield `unavailable` so a comparison fails closed.

## Planner sensitivity contract

`steelTimeToRequired` is read only in `planSmelter()`'s `required` production-weight assignment. Fuel selection and tooltips, Iridium allocation, Steel input affordability and tooltips, and the initial adjustment construction do not read it. Later, it can affect the Steel increment/decrement tests and consequently the derived Iron adjustment. Reusing the whole incumbent decision therefore preserves ordered fuel adjustments, ordered Iridium/Steel/Iron adjustments, tooltips, and normalized native command intentions.

The pure proof first establishes that both input graphs are deeply frozen plain data, then verifies matching own keys, prototype, and all data-property values except `steelTimeToRequired`. Mutable inputs, accessors, unsupported prototypes, proxy failures, or any changed field return unknown. It returns one of these exact supported reasons:

- `steel-required-time-unchanged`: the finite effective input value is the same.
- `production-mode-does-not-use-required-time`: the unchanged policy is `iron`, `steel`, or `storage`.
- `steel-demand-overrides-required-time`: unchanged `steelDemanded` is `true` in required mode.
- `no-miners-or-iron-ships-force-steel-weighting`: required mode has zero miners and zero Iron ships.

Any other shape or changed required-mode input returns unknown, so the comparison invokes the existing `planSmelter()` once. A synthetic required-mode, Steel-not-demanded input changes from Iron to Steel production and verifies the sensitive fallback. It is explicitly a pure fixture, not asserted as a live game state.

The deterministic differential matrix compares the complete reference `planSmelter()` decision for **1,856 supported input combinations** spanning all four production modes, demanded/not-demanded Steel and Iron, fuel limits, steel-input shortages, Iridium allocations, available/exhausted capacity, different Steel stock/fullness values, miners, and Iron ships. The remaining 192 required-mode, non-demanded-Steel combinations are sensitive and are not shortcut. Separate capture tests cover current Steel stock and storage clamping, including a proposed target above capacity. All supported comparisons include the full decision object, not only normalized commands.

## P13D.1 ten-cycle Q window

The replay used the verified Chromium fixture, pinned game source `db38e2af831907d49aeb5348d678d8d8745d6c3f`, seed 42, and the same ten owner cycles. Each request proposed 10 additional Steel. All rows had current civilization-wide scope authority, represented the quantity, and had no comparison unavailability reasons.

| Owner cycle | Incumbent Steel demand | Demanded | Required time before → proposed | Path and reason                                         | Hypothetical commands             | Actual native owner commands      |
| ----------: | ---------------------: | :------: | ------------------------------: | ------------------------------------------------------- | --------------------------------- | --------------------------------- |
|         224 |                   1000 |   yes    |               70.0526 → 70.7804 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         225 |                   1000 |   yes    |               33.0300 → 33.3900 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         226 |                   1000 |   yes    |               20.0200 → 20.2600 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         227 |                   1000 |   yes    |               13.0200 → 13.2000 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         228 |                   1000 |   yes    |                 8.4100 → 8.5600 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         229 |                   1000 |   yes    |                 5.0100 → 5.1300 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         230 |                   1000 |   yes    |                 2.2900 → 2.4000 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         231 |                   1000 |   yes    |                 0.0100 → 0.0985 | proven-invariant · steel-demand-overrides-required-time | `subMetal:Iron`, `addMetal:Steel` | `addMetal:Steel`, `subMetal:Iron` |
|         232 |                    250 |    no    |                           0 → 0 | proven-invariant · steel-required-time-unchanged        | empty                             | empty (no-op)                     |
|         233 |                      0 |    no    |                           0 → 0 | proven-invariant · steel-required-time-unchanged        | empty                             | empty (no-op)                     |

All ten requests represented the proposed +10 quantity. The optimized Q window performed 10 proposal validations, 10 quantity constructions, 10 invariance proofs, and **zero** hypothetical planner calls. P13D.1 performed 10 hypothetical planner calls for these same rows. Both windows added zero root snapshots and zero native calls; diagnostic scope derivation remains three leaf reads per observed cycle, while ordinary G uses zero.

Current authority was same-cycle for root, progression, permission, and owner-cycle demand token in each row. All comparisons were available and had empty comparison-unavailable reasons. External commitment coverage remained unknown (`unknownCommitmentCoverage: true`); demand identity, current goal, offer/goal/queue freshness, and current Research price identity remain unknown. The evaluator returned no executable authorization, and production and economic benefit remain unknown. An unchanged native command is not evidence that the requested quantity will eventually arrive.

## Exact parity and deterministic work counts

The P13D.1 correctness-only Chromium G/S/Q/U cohort passed with equal exports; equal full ordered native invocations (94,940 entries); equal native control usage; equal random-call counts; equal owner outcomes and postconditions; and equal Smelter assignments. Q's actual owner commands remained the native commands recorded above. The run reports no additional Research draws or resource scans, and the proposal remained test-only. The ordinary generated userscript was built with the test surface disabled and contains no active proposal machinery.

| Path                          | Diagnostic snapshots | Proposal validations | Quantity inputs | Invariance proofs | Hypothetical planner calls | Added root snapshots | Added native calls |
| ----------------------------- | -------------------: | -------------------: | --------------: | ----------------: | -------------------------: | -------------------: | -----------------: |
| G, no diagnostic observer     |                    0 |                    0 |               0 |                 0 |                          0 |                    0 |                  0 |
| S, snapshot only              |                   10 |                    0 |               0 |                 0 |                          0 |                    0 |                  0 |
| U, invalid proposal admission |                   10 |                   10 |               0 |                 0 |                          0 |                    0 |                  0 |
| P13D.1 old Q window           |                   10 |                   10 |              10 |       not present |                         10 |                    0 |                  0 |
| P13E proven Q window          |                   10 |                   10 |              10 |                10 |                          0 |                    0 |                  0 |
| Sensitive synthetic Q input   |                    1 |                    1 |               1 |           unknown |                          1 |                    0 |                  0 |

The Q instrumentation retains ten snapshots and ten comparison results for test reporting. Production does not keep a cross-cycle scope cache or retain those test results. The optimized comparison still constructs its proposed input and allocation/result objects because the quantity and feasibility analysis remains required.

## CPU characterization

**C — unresolved.** No P13E CPU factorial was run. P13D's calibrated repeated controls varied by up to 23.77%, above the threshold needed to attribute a 2% effect, and P13B.1's reversed Chromium cells also showed large variation. The exact P13D.1 replay was run with `--correctness-only`; its renderer evidence establishes parity and deterministic call counts, not renderer CPU feasibility. There is no measured full G → Q renderer CPU comparison for P13E.

## Verification

- Focused Smelter, affordability/supply scope, resource demand, and owner-coordination tests passed.
- P13D.1 exact G/S/Q/U Chromium correctness replay passed.
- P13B.1 exact G/S incumbent-authority Chromium replay passed.
- Chromium runner contracts passed: byte-identical bundle invariant, PID CPU accounting, callback attribution, determinism, isolation, reload continuity, pause behavior, and cleanup.
- `npm run build` passed.
- Full `npm run check` passed after formatting: typecheck, architecture checks, lint, formatting, and all 356 test files.
- `git diff --check` passed.
