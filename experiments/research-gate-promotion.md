# Research Condition Gate Promotion Report

Date: 2026-10-16

## Source and scope

- Production base: `deadspace` at `409383b2e7325be1ba5a93fa300daa2a7338a1e8`.
- Validated source: `codex/fix-preunlock-arpa-catalog` at `d183e065daee7221da4eaa000b9faab1cad1d786` (seven commits above the production base).
- Pinned game: Evolve `DeadSpace` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Integration branch: `integration/research-condition-gate-optin`, created directly from the production base.

Ported the scoped condition gate from `src/adapters/evolve/captured-game-mechanics.ts`, Research catalog integration from `src/adapters/evolve/progression/research/captured-tech-catalog.ts`, the optional mechanics port, captured runtime safe-mode diagnostic, and build packaging. Permanent adapter tests cover gate behavior, and a build regression verifies default-off compilation and the opt-in metadata boundary.

Deliberately excluded experimental action-price changes, pricing trace changes, benchmark and profiling drivers, patched game sources/snapshots, B3 wrappers, and recovered personal save files. No upstream game source was changed.

The B2 gate behavior is retained. For default bundle identity, gate-active state and registry observation are owned by the opt-in gate closure and exposed through optional methods. The ordinary build excludes that machinery. The pre-unlock A.R.P.A. catalog correction is common production code, so the final ordinary bundle differs from the production-base build.

## Build boundary and userscript identity

- Fresh production-base build SHA-256 before the A.R.P.A. correction: `FD04D858F69E917367EFEBA3A725CCD2C810E838C613705B1F423500B39E7C20`.
- Final ordinary production build SHA-256: `B7F5FCF6B4A076FC0419152BB815EBEC25A22AA9E376AED7888715BA23BCCD17`.
- Opt-in artifact: `test-artifacts/research-condition-gate/evolve_automation.user.js`.
- Final opt-in artifact SHA-256: `81273AE670B5A9A144D2C9E28813B4EA1BDFF5811388C29AC1806035398FE26E`.
- Opt-in identity: `Evolve Automation (Research Gate Pilot)`, namespace `https://evolve-automation.local/research-gate-pilot`.
- Opt-in metadata removes `@downloadURL` and `@updateURL`; supported `@match` entries, `@grant none`, and `@run-at document-start` are preserved.
- The standard `@name`, namespace, and update metadata remain unchanged. The default bundle contains no gate descriptor path, callback wrappers, or gate test-hook markers.

## Verification

- `npm run check`: passed all 347 discovered test files, including type checks, architecture checks, lint, formatting, and tests.
- `npm run build`: passed; default bundle hash matched the fresh production-base build above.
- `npm run build -- --research-condition-gate`: passed; generated the opt-in artifact above.
- `node scripts/test.mjs evolve/economy/captured-game-mechanics evolve/research/captured-tech-catalog build/research-condition-gate`: passed focused Research and build-boundary tests.
- `node tools/chromium-evolve-runner-test.mjs`: passed runner contract checks.
- `git diff --check`: passed.
- Exact Chromium smoke used the original pinned snapshot (SHA-256 `5346A6CF53F727E2F5E5D039EE677A1B7DA9F4D4B14BBE4AC20620C942E501FD`) and recovered late save `deadspace-late-2026-10-12.txt` (SHA-256 `E2C9D1D4BB5656E9808A68DF68455A7EDC8FBE4D5B24933EFD71520FFBBAEFC3`). Both variants ran 800 periods and ended at day 502487 with 848 resets. The run used the recorded settings file with `autoPrestige=false`; both reported complete capture and no runner events or dialogs.
- The opt-in late-game run recorded 99 gate captures, 27,819 descriptors installed and restored, 26,136 condition callback invocations, and zero restoration failures. The test hook was injected by the exact-runner harness; the production artifact does not require it.

The bounded replay confirmed native draw completion and descriptor restoration. It did not directly enumerate rendered Research rows in that replay. The final B2 validation already recorded exact-Chromium Research UI recovery with 21 offered and 67 granted rows after reentrant rendering and descriptor restoration. Tampermonkey installation has not been tested.

The final integration smoke also ran both available A.R.P.A. pilot exports for 100 periods each with the ordinary and opt-in bundles. The opt-in late-game Research tab was opened through the native UI; its draw rendered 1 offered row and 339 completed rows, with no page errors. These exports are not the older personal save recorded below.

## Recovered input records

These ignored inputs remain outside the integration commits:

| Input                | Local path                                                                         | SHA-256                                                            |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Late save            | `test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt`              | `E2C9D1D4BB5656E9808A68DF68455A7EDC8FBE4D5B24933EFD71520FFBBAEFC3` |
| Settings             | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json` | `A9EACC9E041EBE2851038C0EC84F661F294B6041F820EBE50422E3B3830A7DD2` |
| Pinned game snapshot | `test-artifacts/game/evolve-deadspace.js`                                          | `5346A6CF53F727E2F5E5D039EE677A1B7DA9F4D4B14BBE4AC20620C942E501FD` |

The save and settings are recovered local benchmark fixtures; they are not generated from source and must not be replaced by a different save under the same name. If either is missing, restore its exact bytes from the prior local benchmark recovery or a trusted backup and verify the recorded hash. Rebuild only the game snapshot with `node tools/build-game-snapshot.mjs --ref origin/DeadSpace`; verify the sidecar commit is the pinned SHA before replay. The smoke runner uses the original settings file with the runtime-only `autoPrestige=false` override to keep the late era intact.

## Integration disposition (2026-10-16)

This report's earlier recommendation to defer integration is superseded by the user's final decision. The validated source was squash-integrated into `deadspace`; the Research Gate remains compiled out of ordinary production builds and available only through the opt-in pilot artifact. The user confirmed the A.R.P.A. correction on a fresh game and the prior error cascade stopped. Keep the gate default-off pending longer ordinary Tampermonkey gameplay testing; Tampermonkey installation has not been tested here.

Final artifacts after the A.R.P.A. correction:

- Ordinary production userscript SHA-256: `B7F5FCF6B4A076FC0419152BB815EBEC25A22AA9E376AED7888715BA23BCCD17`.
- Opt-in Research Gate userscript SHA-256: `81273AE670B5A9A144D2C9E28813B4EA1BDFF5811388C29AC1806035398FE26E`.
