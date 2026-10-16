# Research Gate B2 final validation

Date: 2026-10-16  
Branch: `experiment/research-gate-final-validation`  
Base: `b8220fd2`  
Pinned Evolve: `db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**READY FOR OPT-IN INTEGRATION.** The nested-draw, live-completion, native-object replacement, and compromised-state cases have executable regressions. Exact Chromium runs against the pinned game restored descriptors, rejected stale observations, and recovered on later fresh captures. Six matched 100-work-tick comparisons per checkpoint show a repeatable late-game benefit: median renderer CPU fell 18.7 ms/work tick (10.5%) and all six late pairs improved. B2 remains explicitly opt-in and default-off; this branch does not merge or enable it.

## Inputs and method

The benchmark used the original experiment inputs recovered from the previous checkout:

- Early, day 14: `test-artifacts/benchmark/slice0/saves/deadspace-early-day14.json`
- Mid, day 394: `test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json`
- Late, day 502447: `test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt`
- Settings: `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`, with only `autoPrestige=false` for the timed runs so the late save stays in its measured era.

The exact Chromium runner loaded the Evolve snapshot at the pinned commit. A and B2 alternated for six pairs in separate CPU and latency passes, with seed 42, 400-period warmup, and 800 measured periods (100 work ticks) per arm. Each arm retained the same start/end day and reset count within a scenario. Research draw counts came from separate equal-window instrumented runs. C was not rerun.

## Correctness fixes

- A nested scratch draw now invalidates and refuses the observation before invoking a nested native draw against temporary descriptors. Direct granted-catalog requests are refused while the gate is active. A real reentrant player Research click rendered 21 offer rows and 67 granted rows; after Vue flushed, both memberships still matched. The outer observation was discarded and all 162 installed descriptors were restored.
- Temporary condition callbacks reread live grant state and the special `checkOldTech` legacy key. A mid-game `tech-steel_beams` offer became completed inside native `drawTech()`; the stale observation was rejected, and a fresh catalog no longer included it. The `vax_strat1` `checkOldTech` case changed `vax_p` from 1 to 0 during the draw and likewise refused the stale observation. That action was not independently offered in this save, so this proves the special eligibility mutation invalidated classification, not that it changed a visible row.
- Current root, tech object, and registry identity are checked around the scratch draw. An individual native action shallow-copy during the draw copied the temporary wrapper; restoration removed it from the replacement action (`replacementRestored=1`), restored the old descriptor, and a new catalog capture recovered with 21 offers. Registry, tech-object, and root replacement during draw also restored all installed descriptors and allowed a fresh capture. The root test confirmed the replacement was the root returned by the runtime’s own root reader.
- Exact-runner boundary injections replaced the registry before validation, replaced the root between validation and installation, after two descriptors had been installed, and during restoration. The first case completed a fresh Research render with 21 offers and 67 granted rows. In each root case the runtime observed the replacement root; every recorded install was restored, a fresh catalog reported 21 offers, the subsequent Research UI had 21 offers and 67 granted rows, and the gate was inactive and uncompromised. No replacement descriptor was left installed.
- A forced restoration failure produced one failed restore, a visible bounded reload-required diagnostic, and paused automation. Subsequent work periods and a normal Research UI action did not issue another Research draw or resume the automation catalog; the diagnostic remained. Reload is the recovery for this deliberately damaged binding.
- Exact Chromium soft-reset UI replay clicked Evolve’s “Enable Reset Buttons” and “Soft Reset Game” controls. After the reset, the Research panel contained zero offers and zero granted rows, with no retained pre-reset rows.

The focused adapter tests also exercise installation-time nested reentrancy, action replacement and fresh-capture recovery, live grant changes in both directions, restoration accounting, and refusal of later catalog reads after compromise. Exact Chromium replacement injection covers registry, action, tech object, and root replacement during native drawing; the restoration-failure injection covers the restoration boundary.

## A/B2 performance

Values are medians across six runs per arm. Renderer CPU is matched renderer-process CPU per work tick; `TaskDuration` is the median total for each 800-period run. Negative pair deltas mean B2 used less CPU/time than A. CPU savings percentages use the paired arm medians.

| Checkpoint | A CPU ms/tick | B2 CPU ms/tick |          Saving | A TaskDuration ms | B2 TaskDuration ms | A/B2 latency p50 / p95 / p99 / max ms         |
| ---------- | ------------: | -------------: | --------------: | ----------------: | -----------------: | --------------------------------------------- |
| Early      |          90.3 |           88.9 |   1.4 ms (1.6%) |            7693.3 |             7527.3 | 36.7/59.6/77.2/84.3 · 35.4/55.3/78.0/80.9     |
| Mid        |         103.9 |          100.4 |   3.5 ms (3.4%) |            8905.1 |             8630.2 | 44.7/65.9/80.3/86.0 · 41.8/64.5/75.4/79.6     |
| Late       |         177.6 |          158.9 | 18.7 ms (10.5%) |           15446.6 |            14014.2 | 91.9/110.2/123.5/130.4 · 75.5/90.9/97.2/113.2 |

Paired renderer-CPU deltas, B2 minus A, in ms/work tick (paired TaskDuration deltas in ms follow):

- Early: `-3.0, +0.7, -0.9, -0.7, +6.7, -1.9` (`-225, -137, -107, -88, +555, -226`). This checkpoint is noisy and does not establish a useful gain by itself.
- Mid: `-4.6, -5.9, -4.2, -2.2, -5.3, -1.3` (`-370, -474, -366, -144, -421, -147`).
- Late: `-21.8, -18.2, -21.5, -16.5, -17.8, -19.3` (`-1767, -1445, -1740, -1087, -1359, -1653`). Late pair CPU dispersion was 5.3 ms/work tick peak-to-peak; all six paired TaskDuration deltas were favorable.

Per-pair latency deltas, B2 minus A, in p50/p95/p99/max milliseconds:

- Early: `-1.6/-7.4/+6.8/-11.2`, `-1.2/-4.4/-6.2/-3.0`, `-0.5/+0.6/+3.8/-0.5`, `-1.2/-5.3/-0.2/-2.8`, `-2.1/-10.4/-2.5/+2.8`, `-0.7/+2.0/-2.3/-4.7`.
- Mid: `-2.5/+4.7/-3.8/-7.9`, `-3.1/-6.2/-0.5/-4.8`, `-2.2/-3.6/-10.0/-8.3`, `-3.0/+0.2/-11.1/-6.8`, `-3.2/-2.8/-0.1/-6.2`, `-2.8/+0.9/-5.8/-2.9`.
- Late: `-17.7/-21.3/-19.4/-11.8`, `-17.4/-21.2/-29.7/-28.5`, `-30.4/-51.4/-57.4/-34.0`, `-15.8/-21.4/-46.1/-26.8`, `-17.5/-15.7/-15.8/-13.2`, `-15.2/-11.1/-12.7/-1.0`. Every late pair improved at all four latency percentiles.

An additional six-pair comparison isolated the final native-action replacement cleanup against the immediately preceding B2 bundle. Median paired B2-current minus B2-prior CPU deltas were `-2.5 ms/tick` mid and `-3.9 ms/tick` late; median paired `TaskDuration` deltas were `-252 ms` mid and `-317 ms` late. The late CPU vector was `-4.1, -3.7, +1.7, -4.6, -46.1, -2.9` ms/tick. One late pair had a large arm-level outlier, so this does not establish a separate speedup from the cleanup. It does not erase the consistent final B2 versus A result above.

## Research draw and gate counts

Equal 800-period instrumented windows produced the same native draw and offer counts for A and B2 at each checkpoint. A's gate counts are zero; the following gate counts are B2:

| Checkpoint | Native draws A/B2 | Offer evaluations A/B2 | Gate invocations | Descriptors installed/restored | Condition callbacks invoked | Fallbacks | Restore failures |
| ---------- | ----------------: | ---------------------: | ---------------: | -----------------------------: | --------------------------: | --------: | ---------------: |
| Early      |           114/114 |              1326/1326 |              107 |                      4489/4489 |                        3790 |         0 |                0 |
| Mid        |           110/110 |              2163/2163 |              105 |                      8733/8733 |                        7683 |         0 |                0 |
| Late       |           101/101 |                400/400 |              100 |                    28100/28100 |                       26400 |         0 |                0 |

The correctness-fix overhead pass is reported separately above; it used the same 800-period arms and does not share the A-versus-B2 process medians.

## Functional progression

The exact-runner changing-state progression used 400 warmup periods and four checkpoints through 4000 measured periods, with actual game Research grants in early and mid states and late-game progression. At the final checkpoint A and B2 matched in day, technology changes, offers, granted rows, and queue counts:

| Checkpoint |      Day A/B2 | Technology changes A/B2 | Research offers A/B2 | Granted rows A/B2 | Research queue A/B2 |
| ---------- | ------------: | ----------------------: | -------------------: | ----------------: | ------------------: |
| Early      |       234/234 |                   18/18 |                17/17 |             51/51 |                 1/1 |
| Mid        |       614/614 |                     8/8 |                18/18 |             78/78 |                 1/1 |
| Late       | 502667/502667 |                     0/0 |                  4/4 |           258/258 |                 1/1 |

The run also captured Research UI row IDs, price attributes, and affordability classes. No missing offer or persistent stale Research binding appeared. The reset, nested-draw, registry recovery, and interrupted-capture checks are the targeted UI checks described above; no exact call-order or byte-identical-save parity is claimed.

## Verification

- `node tools/chromium-evolve-runner-test.mjs`: passed callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- Exact pinned-game Chromium adversarial, boundary-injection, smoke, trace, progression, reset, and A/B2 runs completed. Raw result files are under ignored `test-artifacts/research-gate-final-validation/`.
- `npm run check`, default production build, focused tests, and `git diff --check` are run on the final source state before committing.

## Opt-in promotion plan

Carry into `deadspace` only the bounded Research condition gate in `src/adapters/evolve/captured-game-mechanics.ts`, its native descriptor/root ownership fixes, the live completion recheck, and the catalog refusal in `src/adapters/evolve/progression/research/captured-tech-catalog.ts` plus required port wiring. Keep the explicit build-time opt-in `--research-condition-gate`, which is off for the default build. If disabled, use the existing ordinary capture path.

Discard the experiment-only A/B harness, game snapshot patchers, trace injection, test bundle generator, and saved benchmark fixtures from the production branch. Retain permanent focused tests for nested draws and reentrant player rendering; live grant and `checkOldTech` changes; registry/action/root/tech replacement and fresh recovery; descriptor installation/restoration; compromised-state refusal; bounded diagnostics; and reload-required behavior after failed restoration.

The default-off path should expose one bounded diagnostic and enter safe mode after irrecoverable descriptor restoration failure. Consider default-on only after opt-in use across real saves shows no missing Research offers, stale bindings, or repeated safe-mode events, while preserving the observed late-game CPU and latency benefit.
