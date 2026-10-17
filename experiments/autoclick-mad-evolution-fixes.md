# Basic autoclick, Mana, and MAD evolution replay

Date: 2026-10-16

## Code changes

- `e9c1c150` changes routine basic gathering to stop once native `tech.primitive >= 1`, independent of quarry ownership. Always Autoclick overrides the cutoff. The stopped planner keeps zero-Food starvation recovery and skips other basic resource clicks.
- `f3ced0d8` distinguishes missing/stale controls, failed calls, root replacement, and successful calls with or without a state change. It checks RNA/DNA resource postconditions, defers unavailable/no-op accumulation, gates evolution on current resources and control generations, and exits the processed cycle when native MAD reset state has been committed.

The gather policy's cutoff is monotonic within a run and returns to bootstrap when MAD clears primitive technology. The regular production build does not create the test-only resource claim ledger. The production replay below checks the resulting clicks and Mana balance directly.

## Game and bundle identities

- Automation branch: `fix/autoclick-mad-evolution`, based on `dc18a1efec8298c7515d482f864ce4dfb2c087a8`.
- Production bundle SHA-256: `145f1cab960eb8ec0b393010652221e045dc1c56b8fc92a266118fa867f3f088`.
- Pinned DeadSpace commit: `db38e2af831907d49aeb5348d678d8d8745d6c3f`; snapshot SHA-256: `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Beta source commit: `bc12393a2bee95ded06920a0f9d53caaf3ba38f2`; locally built source snapshot SHA-256: `42876cfea3b2a7f6acb8046c7664a72327059daf2a266caf034e88b6042516f`.

The beta test used a local snapshot built from the exact beta repository commit. It did not verify byte-for-byte parity with the deployed `evolvebeta.github.io` bundle. Firefox/Tampermonkey live deployment was not available in this run.

## Results

### Basic gathering and Mana

Production-bundle Chromium replays used Magic, Conjuring level 2, Mana initialized at 1, no Rock Quarry, and the Always Autoclick setting off.

- Bootstrap replay: the basic Lumber control ran 50 times on both game snapshots. End Mana was 198.69 on pinned DeadSpace and 9,917 on the beta snapshot; neither ended below the initial 1 Mana. The pinned starting save also produced one unrelated logged `autoJobs`/foundry contract error; beta had no such error.
- Mature replay: no Food, Lumber, or Stone resource action was invoked on either snapshot. Mana remained at 9,917 in both runs.
- Unit tests cover the toggle override, toggle disable on the next cycle, population loss after bootstrap, quarry absence, Sappy and fasting races, zero-Food recovery, Magic/Conjuring, resource claims, and reset to bootstrap.

The replay measures net Mana, not gross Conjuring cost versus generation. The resource claim ledger remains test-only; the corrected default cutoff prevents mature routine clicks from repeatedly spending Mana.

### MAD reset and evolution

The final production-bundle smoke completed the unattended MAD → Protoplasm → Human → civilization path on both DeadSpace snapshots listed above. `mad.arm` and `mad.launch` each returned once; reset advanced 848 → 849; `loads` advanced 1 → 2; the period-43 save was Protoplasm with RNA/DNA initialized; native Humanoid and Human actions ran; and native city construction continued after Human evolution. It ended at Human, reset 849, day 296. See [evolution-post-mad-deadlock.md](evolution-post-mad-deadlock.md) for the bundle identity and per-snapshot assertions.

The older trace report's `reloads: 60` was caused by adding a cumulative `session.advance().reloads` value after every chunk. The replay driver now keeps its final cumulative value, and the production run independently confirms one navigation from the runner's load counter. This fixture has full enough resources and cell development to skip RNA/DNA gathering and cell upgrades; this replay does not validate those native action paths end to end. The earlier Vue resource-property errors and `captured evolution control unavailable: rna` diagnostic were not reproduced.

The separate Jobs diagnostics observed after the successful transition are recorded in [jobs-replay-follow-up.md](jobs-replay-follow-up.md); no Jobs fix was attempted in this integration.

## Verification

- Focused gather, evolution, and MAD adapter/application tests passed during the first two slices.
- `npm run check`: passed, 347 test files and all five checks.
- Normal production build: passed; restored after opt-in build.
- Research Gate opt-in build (`npm run build -- --research-condition-gate`): passed. The ordinary build remains default-off; the validated B2 implementation was not changed.
- `node D:\work\Evolve-Automation\tools\chromium-evolve-runner-test.mjs`: passed callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- Exact Chromium replays used the production bundle and both source snapshots. No page exceptions were captured in either MAD transition.

The bounded replay driver is [autoclick-mad-evolution-replay.mjs](autoclick-mad-evolution-replay.mjs). Full run output is scratch data under `test-artifacts/` and is not committed.
