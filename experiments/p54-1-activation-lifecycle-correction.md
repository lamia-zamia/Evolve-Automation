# P54.1 — Event-fed Construction activation lifecycle correction

**Decision: A — timing defect confirmed and the bounded prototype is corrected.**

On the pinned game, the event-fed path reproduces P53’s Construction-owned Quarry admission when the request is installed before the required cycle-89 finish. The retained D-late request reaches the same event latch after that finish and is rejected for missing publication identity. The exact replay stops at p720. This establishes prototype feasibility only for the measured publication lead time; it does not establish a production request lifecycle or pass the renderer CPU gate.

The full trace, per-arm checkpoints, costs, hashes, and acceptance predicates are in [the exact evidence JSON](./p54-1-activation-lifecycle-correction-evidence.json). The prior P54 evidence files were left unchanged.

## Failure cause and request chronology

Two facts explain P54’s instrumentation and D-arm result:

- Runtime configuration updates the event-fed latch after adapter creation. The old adapter dependency put an `eventFed` getter inside an object spread. The spread evaluated the getter once, leaving the adapter with its initial `false` value while the runtime latch later became `true`. The old initialization metric therefore described creation time, not the mode at request retrieval. Because P54 mirrored the same request into a hook, the adapter could still see the request through a different source.
- More decisively, D-late installed its request at p719. `finishCycle(true)` for Construction cycle 89 had already completed at p712. That finish conditionally captures publication authority only when the request for cycle 90 is already present. Cycle 90 could retrieve D-late’s request, but there was no source-backed cycle-89 authority to validate, so the owner rejected it with `construction-publication-identity-mismatch`.

The correction samples the live mode at each adapter boundary and passes that same Boolean to `readRequest`. Event-fed retrieval reads the runtime latch; the evidence records the selected source and strict request-object identity match. The existing event sink remains the single delivery path.

| Boundary                     | D-early                                                                        | D-late                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Adapter created              | `eventFed: false`                                                              | `eventFed: false`                                                               |
| Runtime configured           | `eventFed: true`                                                               | `eventFed: true`                                                                |
| Request installed            | p700                                                                           | p719                                                                            |
| Cycle 89 begins              | p712; latch request identity matches                                           | p712; no request                                                                |
| Cycle 89 `finishCycle(true)` | p712; ordinary completed intent includes Farm; authority captured for cycle 90 | p712; ordinary completed intent includes Farm; no request or authority captured |
| Cycle 90 begins              | p720; event-latch identity matches                                             | p720; event-latch identity matches                                              |
| Admission                    | accepted by P53 contract                                                       | stale: `construction-publication-identity-mismatch`                             |

D-early arrived 12 game periods before the finish. D-late arrived 7 periods afterward. P53 requires installation before the successful cycle-89 finish; it specifies no fixed number of periods. A request that misses that publication edge must wait for a future owner publication or fail closed. No identity was backdated or reconstructed from scalar equality.

## Bounded exact replay

The replay used `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`, fixture `p18-standard-human-fixture.txt`, seed 44, and stopped at p720.

| Check                                               | Result                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A, C, D-early, repeat, and D-late exact before p720 | Pass; full p719 save/state, control usage, gameplay actions, native trace hash, random count, and RNG state match                        |
| C versus D-early owner decision and debit           | Equal P53 revision: Farm (`Lumber 27`, `Stone 14`) to Quarry, cycle 90 only; native debit `Lumber 50`, `Stone 10`                        |
| Ordinary cycle-89 intent                            | D-early’s completed-intent keys match A’s and include `city-farm`; the P53 decision records Farm as the displaced saving target and cost |
| D-early build                                       | One native Quarry action; ordinary postcondition verified                                                                                |
| Current-price checks                                | Two native control-authority checks in both C and D-early                                                                                |
| P41 reservation gate                                | One evidence sample in C and D-early; Quarry conflict plan recorded                                                                      |
| P42 substitution                                    | Disabled for D-early; zero applied external P42 reservation reads                                                                        |
| D-early repeat                                      | Exact state, save, native trace, actions, RNG, and final export match                                                                    |
| D-late                                              | No Quarry purchase; p720 state and save match A                                                                                          |
| Gather actions                                      | No additional P36 or P38 Gather actions                                                                                                  |
| Jobs authority                                      | P51 request is observation-only; P52 correlates the receipt with `executionAuthority: none`                                              |

The ordinary native Quarry build initializes Quarry job controls in C and D-early identically; the P52 receipt only observes and correlates that result. The report retains the native `civ-quarry_worker.setDefault` call and worker counts separately from request-driven Jobs authority. No Jobs assignment behavior was added to the prototype.

## Cost and retained evidence

| Arm            | Local pending checks | P53 hook reads | Whole-run root reads vs A | Reservation samples | Native price checks | p720 `buildQueue.setData` calls |
| -------------- | -------------------: | -------------: | ------------------------: | ------------------: | ------------------: | ------------------------------: |
| A              |                  180 |              0 |                         0 |                   0 |                   0 |                             104 |
| C              |                    0 |            182 |                         5 |                   1 |                   2 |                             104 |
| D-early        |                  182 |              0 |                         5 |                   1 |                   2 |                             104 |
| D-early-repeat |                  182 |              0 |                         5 |                   1 |                   2 |                             104 |
| D-late         |                  181 |              0 |                         9 |                   1 |                   1 |                             110 |

The source reports whole-run root-count deltas separately from operation-scoped context, reservation, and price/control counters. The 104 `buildQueue.setData` calls are the full p720 native API count, including ordinary UI/game updates; they are not the price-probe count. The required two probes are measured at the Construction native-control authority boundary.

For D-early, retained evidence was 1,284 UTF-16 bytes for the request, 3,786 for activation samples, 714 for the cycle-89 publication sample, 208 for request lifecycle samples, 8,334 for P54 metrics, and 1,028 for P53 owner events. The request was consumed and its pending reference released. D-late retained one pending request reference after rejection. Synchronous timing readings were 0 ms at the observed clock resolution, so this experiment makes no CPU-savings claim.

## Verification and limits

- Passed: focused P53 early/late regression, runtime-control regression, P50 compiled-output isolation regression, `node tools/chromium-evolve-runner-test.mjs`, production and local builds, `npm run check` (382 test files and all five check phases), and `git diff --check`.
- Production userscript and metadata remain byte-identical after the production build.
- `node tools/chromium-native-parity-test.mjs` could not start because `test-artifacts/benchmark/settings/baseline-tuned.json` is absent. No substitute fixture was created.
- The independent `<=2%` renderer CPU gate was not measured or passed.
- No production allocator, UI, or Jobs code changed. Arbitrary late requests remain unsupported; no P55 or further Construction authority experiment is authorized by this result.
