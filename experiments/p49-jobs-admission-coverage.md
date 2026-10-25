# P49 — Early-game Jobs admission coverage

## Decision: A — both owner paths covered

The retained late-game fixture still admits the explicit test-only request from the `full-jobs-and-foundry` owner. The positive-population Standard/Human replay admits the same observation-only intent from the existing ordinary Jobs fallback, with Foundry evidence explicitly unavailable. Both remain owner-local observations with `executionAuthority: "none"`; neither grants allocation, spending, construction, Gather, or worker-assignment authority.

The ≤2% renderer CPU gate remains unresolved. The callback timings below measure added synchronous callback work only.

Raw run data and the executable Chromium harness are [p49-jobs-admission-evidence.json](p49-jobs-admission-evidence.json) and [p49-jobs-admission-evidence.mjs](p49-jobs-admission-evidence.mjs).

## P18 combined and fallback path

At `src/bootstrap/captured-runtime-control.ts:8663-8699`, the runtime tries combined Full Jobs when both `autoJobs` and `autoCraftsmen` are enabled. A ready prepared session uses that owner; if preparation is unavailable, `combinedJobs` stays false and the existing ordinary Jobs phase runs, followed by the separate Craftsmen phase. A phase-level failure is handled separately and suppresses split execution. P18 enabled both settings.

Full Jobs preparation depends on a complete Foundry/craftsmen sample. The shared Foundry reader in `src/adapters/evolve/civic/captured-craftsmen.ts:233-385` returns unavailable when there are no craftable product samples, no native `city.foundry`, or required lazily initialized Craftsmen/default-job state. Specifically, P18 has no `city.foundry`, so `readProducts()` returns an empty sample and `readCycleInput()` exits unavailable at its zero-samples guard. P18's authentic save has no population and its technology state is still `primitive: 2`, `wsc: 0`. The absent Foundry is an expected early-game state, not evidence of a broken Foundry control. P49's p250 state also has no Foundry.

P48's retained P18 Chromium evidence shows 50 work ticks, 50 Full Jobs preparation attempts, zero Full Jobs planner calls, and 50 successful `civ-unemployed.setDefault` calls. The latter belongs to ordinary Jobs: Craftsmen cannot issue it. `src/application/jobs.ts:25-43` passes the reader result to `planJobs()` and invokes the executor only for a non-null decision. The ordinary executor rechecks its captured root, catalog, current cycle, and decision before using native controls (`src/adapters/evolve/civic/captured-ordinary-jobs.ts:1731-1838`). Thus the P18 ordinary fallback ran and accepted a current zero-population Jobs cycle; zero population does not itself make the reader unavailable. The original P18 capture did not retain the private input object, so this conclusion is backed by the source path and successful native execution, while the positive-population P49 sample below directly records its owner input.

The ordinary reader only requires finite nonnegative population, a complete ordinary job catalog, valid authority and reservation inputs, and a default-job token (`captured-ordinary-jobs.ts:534-639`). It does not require Foundry. No fallback behavior was changed to manufacture an admission event. The observed P18 behavior is correct fallback, not a separately reproducible owner correctness defect.

## Positive-population boundary and provenance

P49 replayed the existing authorized P19 Standard/Human path from the retained P18 native save and stopped at period 250, the first retained positive-population boundary. It matched the committed P19 checkpoint's Human population (3) and technology (`primitive: 3`, `agriculture: 1`, `housing: 1`, `currency: 1`), with no Foundry and `expose: false`. The replay has the same native export and settings hashes recorded in the raw evidence.

This is a real native-game state, but not proof of unaided autonomous progression. Its inherited P19 test authorization records ten Stone Gather clicks for bootstrap and ten for the Construction handoff. P49 repeats those accepted interventions only to reproduce the seed, then starts A/B/B-repeat from that native export. The treatment arms add no Gather, purchase, or worker-assignment intervention. The replay stops at p250 rather than continuing to p10000. P19's provenance is documented in [p19-civilization-bootstrap.md](p19-civilization-bootstrap.md).

At this boundary, Full Jobs preparation is attempted on all 50 work ticks but remains unavailable and has zero plan calls. The ordinary fallback has one qualified observation per work cycle, with 3 civilians. Its admitted sample records current ordinary jobs (`unemployed: 0`, `farmer: 3`), a current root reference and matching preparation generation. Foundry jobs, crafts, and worker pool are null; `jobsFoundryFreshness` is `unavailable`.

## Observation seam and admission contract

The ordinary-only observer is attached to the existing ordinary executor after its freshness and decision checks, before native controls. It projects the exact `session.input` and decision produced by the one `reader.readCycle()` call in `runJobsAutomation`; the observer does not call the reader or planner. The ordinary executor's pre-existing state recapture and plan integrity check remain intact. No execution ordering changed, and the combined Full Jobs owner keeps precedence whenever preparation succeeds. No Craftsmen or Foundry reader fills missing ordinary-only fields. The hook and instrumentation require the local test-surface build and an injected test-only request.

The pure admission predicate now checks request ID/origin/generation agreement, positive request and owner generations, equality of Jobs preparation and captured-root generations, equality of duplicated work-cycle identities, and stale root/session evidence. Ordinary-only observations require Foundry freshness and facts to remain unavailable. Full Jobs still requires complete Foundry facts. Missing progression, root, control, and cross-owner commitment generations remain unavailable and do not invalidate a valid owner-local observation. Every result retains `executionAuthority: "none"`.

Focused tests cover mismatched identities, forged origins, superseded requests, invalid generations, stale root/session evidence, absent Foundry, ordinary-only claims of Foundry completeness, and unavailable worker commitments. Existing P48 Full Jobs admission tests continue to pass.

## Controlled Chromium parity

Both fixture classes ran 400 periods per arm with A (no request), B (explicit diagnostic request), and a repeated B. There were 50 qualified Jobs owner cycles per arm; the harness asserts at most one observation per owner cycle. With no request, all 50 presence checks produced zero admission evaluations and no evidence envelope. B and B-repeat admitted 50/50 observations. Every admitted event used the expected owner scope and had no additional root, settings, catalog, demand, or control-resolution reads during the observer.

| Fixture                              | Scope                   | Full Jobs prepare / plan calls per arm | Native invocations per arm | Ordered invocation trace SHA-256                                   | Final export SHA-256                                               | Final RNG calls / state |
| ------------------------------------ | ----------------------- | -------------------------------------: | -------------------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------- |
| Late-game `mad-tech-offered-blocked` | `full-jobs-and-foundry` |                                50 / 50 |                    115,476 | `47a5d517c021db7689ea17591aa309f8c8adb1b5e3f259f4d5ab1a8e2311eb55` | `0f33bc937cedd7ebeb33b9bd343234d80e28efed7e286895416ecc5f7c111402` | 1,096 / 1,626,085,012   |
| Standard/Human P19 p250              | `ordinary-jobs-only`    |                                 50 / 0 |                      1,588 | `9e7ddfd4e6075e2a6239fb55fc1a191b52481d95b9224b6a3dc5f030c569fd05` | `c64e5e05cfa9ffe8822639a08925d438d24daa351196b322bbd5c41c5d7675cb` | 72 / 2,316,583,572      |

For each fixture, A, B, and B-repeat have identical native invocation traces and counts, native control usage, Jobs/Craftsmen assignments, Research and Construction outcomes, exported state, decoded-state hash, and RNG count/state at the p200 and p400 checkpoints and at the final state. Existing action-cost, resource/demand, catalog, settings, and other captured read counters are identical across arms. The harness deep-compares these values rather than relying only on final hashes.

The existing native-timer parity fixture `test-artifacts/benchmark/settings/baseline-tuned.json` is absent. This remains an explicit existing coverage limitation; P49's claim is bounded to the controlled Chromium A/B/B-repeat evidence.

## Incremental cost and retained events

Timings use the native monotonic timer (`window.eaDiagnosticsNow`, backed by `performance.now`). Values are maxima across each 50-cycle run; the retained-byte count is the serialized diagnostic-event payload for that run.

| Owner scope   | Arm           | Presence checks | Presence check max | Input projection max | Envelope max | Predicate max | Max added callback | Admission evaluations | Retained event bytes |
| ------------- | ------------- | --------------: | -----------------: | -------------------: | -----------: | ------------: | -----------------: | --------------------: | -------------------: |
| Full Jobs     | A, no request |              50 |               0 ms |                 0 ms |         0 ms |          0 ms |             0.1 ms |                     0 |               40,240 |
| Full Jobs     | B             |              50 |               0 ms |               0.1 ms |       0.1 ms |        0.1 ms |             0.4 ms |                    50 |              296,592 |
| Full Jobs     | B-repeat      |              50 |               0 ms |               0.1 ms |       0.1 ms |        0.1 ms |             0.3 ms |                    50 |              296,647 |
| Ordinary-only | A, no request |              50 |               0 ms |                 0 ms |         0 ms |          0 ms |             0.1 ms |                     0 |               40,180 |
| Ordinary-only | B             |              50 |               0 ms |               0.1 ms |       0.1 ms |        0.1 ms |             0.2 ms |                    50 |               99,408 |
| Ordinary-only | B-repeat      |              50 |             0.1 ms |               0.1 ms |       0.1 ms |        0.1 ms |             0.3 ms |                    50 |               99,426 |

Every requested run performs one projection, envelope, and admission evaluation per qualified Jobs owner cycle. Every no-request run performs only the presence check; it creates no evidence envelope and calls no predicate. The local test-surface callback forwards at most 64 admission events; these 400-period runs each produced 50. Test-surface counters report zero additional native-root, settings, catalog, demand, or control-resolution reads during observation. All existing native reads and control resolutions remain equal across A/B/B-repeat. The ordinary production bundle is checked separately below; no production diagnostic observer is active. These small callback increments do not establish the ≤2% renderer CPU gate.

## Production bundle and P48 amendment

`npm run build` is the production build. `build.mjs` defines `__EA_TEST_SURFACE_ENABLED__` as false for it. The generated `evolve_automation.user.js` diff is +172 / −19 lines; this generated production bundle change is separate from the local test-surface instrumentation. Esbuild retains some top-level admission/projection declarations, but both ordinary and Full Jobs `testObservationEnabled` gates are compiled to `false`, `observeTestAllocationDiagnosticRequest()` is a no-op, and the diagnostic event kind is absent from the bundle. No production diagnostic observer is active.

The P48 report introduction now matches its detailed timing table: both requested runs' maximum added callback increment was 0.2 ms. P48 raw measurements are unchanged. The absent `baseline-tuned.json` fixture remains a coverage limitation.

The full parallel check initially exposed an ESLint race with the P13 test's temporary generated bundle. ESLint now ignores only `test-artifacts/benchmark/tmp/**`, so it does not try to read that bundle while the test removes it.
