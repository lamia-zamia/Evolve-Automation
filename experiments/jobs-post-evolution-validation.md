# Jobs post-evolution validation

Date: 2026-10-17

## Result

**FIXED.** The three post-evolution Jobs failures were reproduced on the pinned replay, classified, corrected, and replayed with actual native worker and servant state checks. Research Gate B2, autoclick policy, MAD lifecycle, evolution policy, and the pinned Evolve checkout were not changed.

## Reproduction and classification

The baseline was the same production-bundle replay fixture used by `experiments/autoclick-mad-evolution-production-smoke.mjs`, with the pinned upstream source at `db38e2af831907d49aeb5348d678d8d8745d6c3f` and the 6,000-period scenario.

| Baseline diagnostic                  | Occurrences | First occurrence                                        | Classification                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------: | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ordinary-jobs-postcondition-failed` |           2 | workticks 10/11, periods 99/107, Human reset 849, day 1 | Genuine state mismatch. Farmer was the current default with one worker. Native `civ-farmer.sub()` and `setDefault("farmer")` both returned success, but `sub()` removed then returned the same worker to the current default pool. The plan incorrectly requested zero workers in every job. |
| `ordinary-jobs-controls-incomplete`  |           2 | workticks 25/26, periods 219/227, day 7                 | Readiness gap. The valid plan requested Farmer worker −1 and servant +1 with capacity 1 and usage 0. `servant-farmer.add` was not yet captured; it appears after native rendering.                                                                                                           |
| `full-jobs-controls-incomplete`      |          37 | worktick 27, period 235, day 8                          | Readiness gap. The full plan also legitimately requested one servant while capacity was 1 and usage was 0. The servant control was not yet bound; later native controls exposed it.                                                                                                          |

The baseline latch state was unknown (`mKeys` enabled), so the early trace's inferred multiplier was not treated as evidence. The final exact replay drives a neutral pointer move through Chromium's normal mouse API, allowing upstream's own `mousemove` listener to establish its multiplier state. No controls are synthesized or clicked.

## Corrections

- The pure Jobs planner now retains unallocated workers in the captured default pool when every managed job is capped or unavailable. This preserves the native worker pool and avoids the impossible zero-worker assignment that made `sub()` a no-op.
- Jobs control preflight now returns a typed `deferred` outcome when a required native method is missing. It does not invoke partial mutations, does not report the readiness gap as a failure, and retries on a later worktick. The full path remains the owner when it prepared a session, so it cannot fall through to a second ordinary assignment in that same worktick.
- The native postcondition remains strict. Unit coverage proves a control that returns success without changing workers/default is still rejected.
- Detailed trace events exist only in the exact-runner test build. The production build compiles out the observer. Event samples are bounded and contain changed job deltas, pool values, required/resolved methods, grouped native calls, and mismatches rather than saves or full catalogs.

## Final exact replay

- Snapshot: `test-artifacts/game/evolve-deadspace.js`, commit `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Scenario: 6,000 periods; 725 workticks; MAD arm/launch once; one new reset; species returned to Human at reset 849; automation continued to build civilization after evolution.
- Original failure codes: 0 ordinary postcondition failures, 0 ordinary controls-incomplete errors, 0 full controls-incomplete errors.
- Control readiness was safely deferred 31 times (`full-jobs-controls-not-ready`) while native controls were absent. The first recorded post-evolution gap was `servant-lumberjack.add` at worktick 47 / period 395 / day 16, with capacity 1 and usage 0. No native calls were made on that deferred decision.
- Recovery was observed at worktick 78 / period 643 / day 28. `servant-farmer.add` was bound at generation 1; the native invocation returned success and captured state changed from farmer workers 1 / servants 0 to workers 0 / servants 1.
- Across the run, 7,759 native Jobs/Craftsmen invocations were observed; 374 changed decisions passed captured postconditions and 1,230 worker/servant assignments changed. There were zero periods containing both the ordinary Auto Jobs phase and the combined Auto Jobs + Auto Craftsmen phase.
- The replay reached civilization construction after Human, including farm, housing, lumber yard, quarry, and later city construction. It recorded no page errors.

## Verification

- Focused: `game-key-state`, `captured-ordinary-jobs`, and `captured-craftsmen` tests passed.
- Full suite: `npm run check` passed all 347 test files, type checks, architecture checks, lint, formatting, and bundle syntax.
- Builds: `npm run build:local` and `npm run build` passed.
- Chromium runner contracts passed. The nested tools worktree resolves the contract script's `repoRoot` from its sibling checkout rather than this worktree, so the unchanged contract script and its required local modules were run from a temporary in-worktree shadow directory with `EVOLVE_SOURCE=D:/work/Evolve-DeadSpace`; the temporary directory was removed.
- `git diff --check` passed. The final production bundle contains no test trace hook.
- Renderer TaskDuration was not compared: detailed trace code is enabled only in the test bundle and is absent from production. No broad benchmark campaign was run.
