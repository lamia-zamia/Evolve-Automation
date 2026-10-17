# P5 — Building offer cost

Date: 2026-10-17  
Branch: `experiment/p5-building-offer-cost` at production base `93476e36e525520afcb1dc8bac9aced973a33b76`  
P4 production candidate `e857249e` was not integrated.  
Game: DeadSpace `db38e2af831907d49aeb5348d678d8d8745d6c3f`, snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.  
Runner/tools: `D:\work\Evolve-Automation\tools` at `fb141c709bc019c99b9933f5974e80c5e43f825a` (`Preserve renderer CPU counter precision`).  
Baseline bundle SHA-256: `b0a8809307505903a1f3b34b59459348aa708847b2624f77e8f1cc4f51124540`.  
Candidate bundle SHA-256: `af0ad938233af6b92b1cc68f399a9ba7015aaa6021274e37b7d8aa9c073ad9a3`.

## Decision

The bounded production change limits current state-record resolution to action bindings in the requested regions. It keeps a fresh root read, a fresh native structure read, and native availability evaluation for every requested action on every observation. It adds no price or availability cache.

The deterministic fixture shows substantial fewer root-state lookups for narrow requests (85% fewer for City; 36% fewer for City, Space, Interstellar, and Portal together). Broad all-supported requests reduce the state scan by only five of 429 bindings. These operation counts justify review of this narrow traversal change; the synthetic timing does not establish renderer savings. **Production CPU effect remains unresolved. Do not merge as a demonstrated CPU improvement.** Keep the candidate isolated for independent review.

## Cost decomposition

The P4.2 report measured about 1,010 ms over 1,000 late-game offer reads and 560 ms over 878 mid-game reads. Its 1,375 late and 1,261 mid observations are instrumented counts, not clean renderer CPU savings.

The bounded probe is `experiments/p5-building-offer-cost.mjs`. It runs at most 100 observations (default 25), uses the production offer reader and record resolver with the full 429-binding generated catalog, and checks that all-region state records projected to the request equal the narrow result. Its roots, control identity, and epoch are synthetic fixture labels; it does not claim to trace production call-site distribution. The availability reader is a stub, so it does not run upstream qualification or condition callbacks.

| Requested regions                 | Total bindings | Requested bindings | State records/region addresses before → after per observation | Availability reads | State reads in all-available fixture | Structure reads |
| --------------------------------- | -------------: | -----------------: | ------------------------------------------------------------: | -----------------: | -----------------------------------: | --------------: |
| City                              |            429 |                 63 |                                                      429 → 63 |            63 → 63 |                              63 → 63 |           1 → 1 |
| City, Space, Interstellar, Portal |            429 |                276 |                                                     429 → 276 |          276 → 276 |                            276 → 276 |           1 → 1 |
| All supported regions             |            429 |                424 |                                                     429 → 424 |          424 → 424 |                            424 → 424 |           1 → 1 |

The 429 count includes five `starDock` catalog bindings outside `CAPTURED_BUILD_REGIONS`; all-supported requests select 424. The reader performs one structure-to-binding index build per reader instance while the native mechanics returns the same immutable structure array. The upstream adapter itself validates retained structure identities and returns that stable array when current. The production `readCapturedBuildingState` call remains once per offered binding that has a matching current state record; the all-available fixture exercises that path for every requested binding. Policy reconstruction and control-ID enumeration are outside this inner-reader probe.

For the 25-observation probe, isolated resolver diagnostic wall time was 3.67 ms versus 0.26 ms for City, 2.61 ms versus 1.37 ms for four regions, and 1.83 ms versus 1.30 ms for all supported regions. Those are proxy-instrumented fixture timings with no native game predicates; their spread (including the broad case despite only five fewer records) makes them unsuitable as production cost estimates. The reusable script reports the raw timings and deterministic counts.

In the live flow, `createCapturedBuildPolicyReader` enumerates captured element IDs before the observation to derive requested regions, then again after it because the draw can capture controls. `buildingUnlocks.read()` calls `mechanics.readStructures()`, builds/reuses the binding index by structure-array identity, resolves state identities, evaluates current native availability, and reads Building state for available entries. Native qualification and condition callbacks are inside each `structure.readAvailability(root)` and remain untouched. Policy reconstruction and both control enumerations also remain untouched.

## Reuse candidates and mutation boundaries

| Candidate                                                                            | Decision    | Intervening change that prevents reuse                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse a current offer catalog because the next read is in the same worktick or epoch | Rejected    | Native actions, Research, construction, settings edits, newly captured controls, or root replacement can change the answer. Availability conditions can depend on live root state without a tech-epoch change.                                                                            |
| Reuse the current result for the later established-storage or Mech lookup            | Rejected    | The later request can ask for a different region set and requires current coverage. Root replacement and settings/control changes can also intervene between application phases. Existing established reads intentionally use the stored epoch-scoped sample; current reads remain fresh. |
| Remove the second captured-control enumeration in build-policy reconstruction        | Rejected    | The native draw can regenerate or add controls during the observation; the post-read enumeration must see them.                                                                                                                                                                           |
| Skip catalog materialization when its return value looks unused                      | Rejected    | Current reads establish the catalog later consumed by policy/storage-target consumers. No unconsumed production observation with a material budget was demonstrated.                                                                                                                      |
| Skip state-record work for bindings outside requested action regions                 | Implemented | The records are only joined while evaluating requested bindings. Selection uses the action binding prefix, while address lookup still uses the native structure’s full region/struct and entry key.                                                                                       |

The implementation preserves the first current record in native structure order, full `entryKey` identity, aliases, ambiguous-entry rejection, and fail-closed completeness for requested regions. It does not select state addresses by action-prefix region: an existing regression covers a Space binding whose state lives under City.

## Correctness and performance evidence

Exact-runner comparison used the pinned snapshot and established late/mid fixtures, seed 42, 600 warmup periods followed by 1,000 measured periods, on `HeadlessChrome/151.0.7922.71`. The baseline control was run twice per fixture. Both controls and the candidate had complete capture and zero page errors. Baseline A/A exports matched; candidate exports were byte-identical to baseline in both fixtures. Native control-usage maps also matched exactly. The raw report is in ignored `test-artifacts/perf-profile/p5-exact-parity.json`.

| Fixture | Save SHA-256                                                       | Baseline export SHA-256                                            | Candidate export SHA-256                                           | Export / native-control parity |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------ |
| Late    | `e2c9d1d4bb5656e9808a68df68455a7edc8fbe4d5b24933efd71520ffbbaefc3` | `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2` | `77b357153516ad5268e7fae7c5d47eae48b384a16f831951a639882f53d6cdd2` | exact / exact                  |
| Mid     | `7c25f5cec06c88316675665d521bfc368d60c0c4a72ea0a2bde35bcc7d3069a3` | `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb0bab` | `82292f32e3b3073838c90359f54eed8358fa42aeab359f2c09b20eb6c2eb`     | exact / exact                  |

The focused Building regressions cover City, Space, Interstellar, Portal and the supported region set; narrow and broad requests; root-state/action-prefix mismatch; first-current-record order and complete entry identity; duplicate/ambiguous entries; absent state; invalid availability; fail-closed region completeness; root replacement; Research grant changes; same-epoch native availability mutation; and current control regeneration through the existing captured-progression/build-policy regression. The same-reader availability mutation confirms a new observation sees the changed native answer without an epoch change.

Verification passed: `npm run build`, `npm run check` (347 test files and bundle syntax), focused `captured-building-unlocks` test, `node tools/chromium-evolve-runner-test.mjs`, and `git diff --check`.

No P5 A/B was run. P4.2’s 96 same-bundle arms showed false CPU effects well beyond 2% in persistent and fresh modes; renderer CPU and TaskDuration tracked together, and fresh Chrome did not remove late drift. The runner precision fix is present in tools commit `fb141c7`: per-process `SystemInfo` CPU values remain unrounded for the P4.2 probe, which rounds only its summed result to six decimals. The generic runner CLI still rounds its final CPU delta to 0.01 seconds. Given the existing failed A/A stability gate, another CPU comparison would not support a reliable production effect claim.

## Reproduction

```powershell
$env:P5_OBSERVATIONS = '25'
node experiments/p5-building-offer-cost.mjs
$env:EA_TOOLS_ROOT = 'D:\work\Evolve-Automation\tools'
node experiments/p5-building-offer-parity.mjs
node tools/chromium-evolve-runner-test.mjs
```

The `tools` and `test-artifacts/game` junctions in the isolated worktree point to the existing separate tools repository and pinned game snapshot; they are ignored test infrastructure, not committed files. The late/mid save paths can be overridden with `--late-save` and `--mid-save`.
