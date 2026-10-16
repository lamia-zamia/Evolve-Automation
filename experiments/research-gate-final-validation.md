# Research Gate B2 final validation

Date: 2026-10-16  
Branch: `experiment/research-gate-final-validation`  
Base: `b8220fd2`  
Pinned Evolve: `db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**BLOCKED. B2 is not ready for opt-in integration.** The source fixes and focused regressions are in place, but the required exact-page adversarial runs, post-fix progression checks, and repeated A/B2 performance measurements could not be completed. The early, mid, and late save/settings inputs named by the existing experiment are absent from the primary checkout, both experiment worktrees, and the tools repository. The exact runner can start a fresh game, but that does not reproduce the saved Research states or the measured windows requested here.

Do not promote this branch based on the older 172.6 ms versus 192.6 ms result. It predates these correctness changes and its 50-work-tick windows do not establish a repeatable gain.

## Changes made

- A nested Research scratch draw now throws before calling the nested native draw. Reentrancy during descriptor installation marks the outer observation invalid; the outer install is rolled back and the observation is refused.
- Each temporary condition callback rereads the current grant and the native `checkOldTech` key where applicable. If a previously completed technology has become eligible again, its original condition runs and the entire scratch observation is discarded. Definitions actually suppressed are checked again after the draw so a later synchronous mutation cannot leave a stale offer set.
- Root, tech-object, and retained-registry identity are checked around installation and after drawing. Restoration still targets only the exact action objects originally modified. Stale registry validation now drops the cached identity so a later native capture can recover a replacement.
- A compromised restoration state refuses both offers-only and ordinary automation Research catalog reads. The user-facing failure remains the bounded reload-required diagnostic.

## Executable evidence

- `npm run check`: passed all 347 test files, type checks, architecture checks, lint, format, and bundle syntax on the final source state.
- `npm run build -- --research-condition-gate`: passed.
- `npm run build`: passed; the generated production userscript and metadata were restored to their original bytes afterward.
- `node tools/chromium-evolve-runner-test.mjs`: passed its callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- Exact Chromium loaded the pinned `db38e2af` snapshot and candidate bundle in a fresh game. That confirms startup only; the fresh game had no established Research progression and did not exercise the gate.
- Focused adapter regressions passed in `captured-game-mechanics-test.mjs` and `captured-tech-catalog-test.mjs`. They cover nested offers/granted/player draw refusal, installation reentrancy, completion changes in both directions, `checkOldTech`, action replacement and fresh capture recovery, descriptor restoration, irrecoverable restore failure, later draw refusal, and compromised catalog refusal. These are synthetic adapter tests, not substitutes for the requested real-page adversarial tests.

The exact-runner benchmark driver is `research-gate-final-validation-benchmark.mjs`. It runs only A versus B2, alternates order, defaults to six pairs and 100 measured work ticks per arm, and supports separate CPU/TaskDuration and latency passes. It was syntax-checked but not run because its mandatory early/mid/late saves and settings file are unavailable. The driver intentionally leaves Research draw and descriptor counts empty; those require the separate instrumented trace pass and are not benchmark results.

## Blocking validation still required

1. Supply the frozen early, mid, and late save files and settings used by the B2 report, or recreate and freeze matching exports. Then run six alternating A/B2 CPU pairs and six separate latency pairs per checkpoint using 100–200 measured work ticks per arm. Report every paired delta and dispersion, renderer process CPU, `TaskDuration`, p50/p95/p99/max cycle latency, and the separate instrumented draw/gate/install/restore/fallback counts. Measure the added live-check cost against the pre-fix B2 bundle.
2. Against those real saves in exact Chromium, inject nested offers-only and granted-tech draws, reentrant player rendering, grant and `checkOldTech` changes during the draw, root/registry/action replacement at each installation and restoration boundary, and restoration failure. Verify row membership, native callback activity, root/action identity, descriptor equality, refusal, recovery, and reload-required safe mode.
3. Run changing-state progression with actual early and mid technology grants and late progression, then inspect Research UI after grant, reset, registry replacement/recovery, nested draw, and interrupted capture. Compare offers, price/affordability, grants, milestones, resource efficiency, queues, decisions, and stalls.

Until those inputs and runs exist, the decision remains **BLOCKED**. This is a fixture/evidence gap, not a claim that the tested adapter regressions failed.
