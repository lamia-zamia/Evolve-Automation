# Post-MAD Evolution Deadlock Replay

**Status: FIXED — complete post-MAD Human evolution and resumed civilization work were demonstrated.**

## Reproduction

The replay uses the playable late-game save at `test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt`, parsed by the exact Chromium runner. It starts as Human at reset 848 with the configured evolution target set to Human; it does not use a null save, fabricate resource rows, or patch native game mechanics. Auto MAD and Auto Evolution are enabled for the replay.

The test-only trace bundle is built from `src/main.ts` by `experiments/autoclick-mad-evolution-replay.mjs`. It records `runEvolution()` stages in the test surface and is not the production bundle. The runner completes 6,000 periods for each native source.

| Source           | Commit                                     | Snapshot SHA-256                                                   |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Pinned DeadSpace | `db38e2af831907d49aeb5348d678d8d8745d6c3f` | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` |
| Beta source      | `bc12393a2bee95ded06920a0f9d53caaf3ba38f2` | `42876cfea3b2a7f6accb8046c7664a72327059daf2a266caf034e88b6042516f` |

Both sources produced the same transition:

1. MAD arm and launch each invoked once. The reset advanced 848 → 849 and the runner observed the new document (`loads=2`).
2. The first post-MAD work cycle entered at period 43 as `protoplasm`. The landing gate passed (`magic`, `landed=true`); target `human` was newly committed. RNA and DNA were each 600/600 with `display=true`, and each native row had a current generation-1 binding with an `action` method.
3. The configured challenge groups were enabled, but their challenge actions had no native rows. Each was classified `not-offered` and skipped. The cycle continued instead of returning at the challenge phase.
4. `sampleCosts()` reported maxima RNA 260 / DNA 256. `planResourceAccumulation()` returned `rnaForDna=-1384`, `dnaForEvolution=-392`, `rnaForEvolution=260`, `newRna=260`, `newDna=208`. The negative conversion counts request no DNA clicks; the 260 RNA request ended `complete-at-cap`, so no RNA/DNA resource action was needed in this replay. The tree candidate was `humanoid`. Its native action was invoked and changed the native evolution tech state. The captured cell counts at this point were mitochondria 5, eukaryotic cells 5, nucleus 10, organelles 10, so the cell-upgrade phase had no candidates and no cell action was needed. A focused adapter regression separately exercises below-threshold cell-upgrade commands against a fake generation-bound control.
5. At period 51, the target Human action was present as a native row and was preferred over the generic sentience action. Its bound native `action` method was invoked once. The plan counts were `rnaForDna=-1288`, `dnaForEvolution=-344`, `rnaForEvolution=260`, `newRna=260`, `newDna=256`; the RNA request again ended at cap. The outcome was `invoked/stateChanged=true`; native state changed to species `human`, RNA and DNA fell to 344 each, and both resource `display` flags became false as the game left protoplasm. The cycle returned at `evolution-tree` with reason `action-invoked`.
6. Across the full replay the final state remained Human at reset 849, day 296. The test-surface replay recorded 725 work ticks and 15 native `city-lumber_yard.action` invocations. The MAD, humanoid, Human, and lumber-yard controls were invoked through captured native bindings; no click was synthesized for an absent or unbound control.

The first blocking condition from the previous behavior is reproduced in the same trace: enabled challenges had no native rows after the reload. The old loop attempted the absent action and returned before the ordinary evolution tree could run. The revised cycle records `not-offered`, continues, selects the native humanoid action, and then selects the configured Human action when that native row becomes available.

## Ordinary production-bundle smoke

The final smoke used `evolve_automation.user.js`, not the test-surface trace bundle, with the same saved game, settings, seed, and 6,000-period bound. It passed against both snapshots above. Production bundle SHA-256: `4dba1ce282001d737d65eab407d334cd81b000179aeb446c9b9fa6d1af6dc16b`.

For both snapshots, native state moved from Human/reset 848 to Human/reset 849 after exactly one MAD arm and launch and one new document load (`loads` 1 → 2). The captured native save at period 43 was Protoplasm with RNA 600 and DNA 392 initialized; at period 51 it was Human/reset 849. Native `evolution-humanoid.action` and `evolution-human.action` were each invoked once. After the Human snapshot, native city construction continued, including 15 `city-lumber_yard.action` calls and other ordinary construction actions. The run ended at day 296. No RNA/DNA gathering or cell-upgrade action is claimed: this fixture already had sufficient resources and developed cells.

The original `reloads: 60` report was an accounting error. `session.advance().reloads` is cumulative across the session, so adding its result after each chunk repeatedly counted earlier navigations. The replay driver now retains the final cumulative value instead. The production replay's runner load counter independently confirms one actual navigation (`loads` 1 → 2); repeated calls to `advance()` are not browser reloads.

The three `autoJobs` diagnostics remain separate follow-up items. Their exact messages, observed phases, and captured job-control evidence are recorded in [jobs-replay-follow-up.md](jobs-replay-follow-up.md). They did not prevent MAD, evolution, or subsequent civilization construction.

## Action availability coverage

Focused adapter/application regressions cover RNA-only progression while DNA is still absent, full DNA with the native control hidden, below-cap DNA with a valid current binding, and below-cap DNA with a stale binding. Missing pre-unlock resource records coerce to zero with `display=false`, so they cannot create an unconditional readiness gate. A control is invoked only for a positive requested count and only while its native resource is displayed and below cap. In this specific MAD replay, both resources already exceeded the native evolution costs and the cells were already at the automation thresholds; therefore it demonstrates the completed post-MAD transition and resumed civilization, but does not claim a native RNA/DNA accumulation click or cell-upgrade click occurred during that run.

Challenge regressions distinguish active challenges, absent native rows, stale bindings on an offered row, valid offered rows, and native invocation failure. An enabled but absent challenge is followed by a reachable ordinary tree action. A stale offered challenge defers the cycle instead of discarding that selected challenge. Native invocation failure preserves the legacy behavior of continuing to ordinary evolution work.

## Verification

- `npm test -- evolution` — passed, 9 focused evolution test files.
- `npm test -- captured-mad` — passed, 2 MAD regression files.
- `npm test -- gather-resources` — passed, 2 basic gathering files.
- `npm run check` — passed, all 347 test files plus type checks, lint, and format checks.
- `npm run build` — passed.
- `npm run build -- --research-condition-gate` — passed; opt-in output was built separately.
- `node tools/chromium-evolve-runner-test.mjs` — passed callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- `node experiments/autoclick-mad-evolution-replay.mjs` — passed the 6,000-period post-MAD replay against both pinned DeadSpace and the beta source snapshot.

The replay observed three unrelated `autoJobs` errors once each (`ordinary-jobs-postcondition-failed`, `ordinary-jobs-controls-incomplete`, and `full-jobs-controls-incomplete` for `servant-farmer`). It still completed the requested Human transition and native city work. This report makes no claim that job assignment automation is complete, or that the replay proves behavior on unpinned future game builds or other saves/settings. The replay JSON and per-cycle trace are in the ignored `test-artifacts/evolution-post-mad-deadlock-replay.json` output.
