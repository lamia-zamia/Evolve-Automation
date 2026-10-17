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

The original trace replay moved the pointer to establish upstream multiplier state. This final review added a separate no-input replay and established when the document-start capture can safely know the initial latch state.

## Corrections

- The pure Jobs planner now retains unallocated workers in the captured default pool when every managed job is capped or unavailable. This preserves the native worker pool and avoids the impossible zero-worker assignment that made `sub()` a no-op.
- Jobs control preflight now returns a typed `deferred` outcome when a required native method is missing. It does not invoke partial mutations, does not report the readiness gap as a failure, and retries on a later worktick. The full path remains the owner when it prepared a session, so it cannot fall through to a second ordinary assignment in that same worktick.
- The native postcondition remains strict. Unit coverage proves a control that returns success without changing workers/default is still rejected.
- Detailed trace events exist only in the exact-runner test build. Trace payload construction is also gated at every event call site, invocation recording is enabled only in test-surface builds, and control-resolution summaries are never prepared for production. The ordinary bundle has no reachable `summarizeCapturedJobsTraceAssignments` or `summarizeCapturedJobsTraceInvocations` calls, no `capturedRequiredControls`, no `onInvocation`/`invocations.push` recording, and no trace-only Jobs event codes. Native preflight, invocation, and strict postcondition checks remain in production.

## Final exact replay

- Snapshot: `test-artifacts/game/evolve-deadspace.js`, commit `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Scenario: 6,000 periods; 725 workticks; MAD arm/launch once; one new reset; species returned to Human at reset 849; automation continued to build civilization after evolution.
- Original failure codes: 0 ordinary postcondition failures, 0 ordinary controls-incomplete errors, 0 full controls-incomplete errors.
- Control readiness was safely deferred 31 times (`full-jobs-controls-not-ready`) while native controls were absent. The first recorded post-evolution gap was `servant-lumberjack.add` at worktick 47 / period 395 / day 16, with capacity 1 and usage 0. No native calls were made on that deferred decision.
- Recovery was observed at worktick 78 / period 643 / day 28. `servant-farmer.add` was bound at generation 1; the native invocation returned success and captured state changed from farmer workers 1 / servants 0 to workers 0 / servants 1.
- Across the run, 7,759 native Jobs/Craftsmen invocations were observed; 374 changed decisions passed captured postconditions and 1,230 worker/servant assignments changed. There were zero periods containing both the ordinary Auto Jobs phase and the combined Auto Jobs + Auto Craftsmen phase.
- The replay reached civilization construction after Human, including farm, housing, lumber yard, quarry, and later city construction. It recorded no page errors.

## Unattended multiplier-latch startup

- Replayed the exact pinned DeadSpace page with native `mKeys=true`, default native mappings, Auto Jobs and Auto Craftsmen enabled, and a plan requiring an actual assignment. The harness sent no mouse movement or keyboard input. Across the normal startup and the later MAD → page reload → Human evolution, Jobs progressed before any user input.
- The 6,000-period test-surface replay completed 725 workticks with one MAD reset and one reload. It recorded 374 successful assignment postconditions, 1,230 changed worker/servant assignments, 7,759 native Jobs/Craftsmen calls, and 31 safe readiness deferrals while native controls were not yet bound. There were no original failure codes, no page errors, and no worktick with duplicate ordinary and combined Jobs execution.
- The first successful native Jobs work occurred at period 16 before MAD, and Jobs succeeded again at period 643 after reload. Both observations had `x10`, `x25`, and `x100` latches clear. Root worker and servant counts changed and matched the successful assignment postconditions.
- Initialization is safe only when the capture observes Vue absent at document-start, before the game synchronously loads Vue and before `vars.js` initializes its private latches to `false`; the first captured root then establishes that initial state if no input has been observed. A capture installed after Vue, any input before the first root, or a later root replacement leaves the latch unknown and Jobs fail-closed until upstream events establish it. Held keys and mapping changes continue to follow upstream's event-by-event latch semantics; no synthetic input is generated.

## Bounded production performance comparison

Compared the committed production bundle with the corrected ordinary production bundle using the same pinned fixed save, settings, seed, warmup (80 periods), and two matched 800-period windows per bundle. Each measured window contained 100 Jobs workticks; renderer CPU and CDP `TaskDuration` are the authorities. Both bundles made 109 native Jobs invocations in each matched run and changed root assignments without errors.

| Production bundle |   Renderer CPU per Jobs worktick | CDP `TaskDuration` per 800-period window | Decisions / outcomes                            |
| ----------------- | -------------------------------: | ---------------------------------------: | ----------------------------------------------- |
| Baseline          | 258.8–262.4 ms (median 260.6 ms) |        22.506–22.823 s (median 22.665 s) | 109 native calls; assignments changed; 0 errors |
| Corrected         | 256.9–259.9 ms (median 258.4 ms) |        22.347–22.604 s (median 22.476 s) | 109 native calls; assignments changed; 0 errors |

The medians were about 0.8% lower for the corrected bundle, and the run ranges overlap. There is no measurable regression. A shorter 400-period check was noisier and showed a small apparent slowdown, which did not repeat in the longer matched windows. `ScriptDuration` was not used as an authority.

## Verification

- Focused `game-key-state`, `captured-ordinary-jobs`, `captured-job-controls`, and `page-capture` tests passed.
- `npm run check` passed all 347 test files, type checks, architecture checks, lint, formatting, and bundle syntax.
- `npm run build`, `npm run build:local`, and `npm run build -- --research-condition-gate` passed. Research Gate markers are absent from the ordinary bundle and retained in the separate pilot artifact.
- Chromium runner contracts passed. Because the `tools/` junction resolves the contract script's `repoRoot` from its sibling checkout, the unchanged contract script and required local modules ran from a temporary in-worktree shadow directory with `EVOLVE_SOURCE=D:/work/Evolve-DeadSpace`.
- The final ordinary production replay used bundle SHA-256 `380855439a7e3451dbcc0b190ad59b5b6072e54c92e36dc53381c1f5af8b6ae5`. It recorded one MAD reset, one document reload, native Humanoid and Human evolution, 5,379 native Jobs calls after Human, continued civilization construction, changed worker/servant root counts, and zero errors.
- `git diff --check` passed. The rebuilt production artifact was inspected directly for removed trace summarization, payload, and invocation-recording work.
