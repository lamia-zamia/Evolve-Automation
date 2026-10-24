# P40 — Construction reservation gate authority

**Decision: A — Gate cause established.** The Housing purchase followed Build’s ordinary no-conflict path. At the Housing conflict read, the available Construction saving reservation was Farm from completed ordering publication 89; the P38 policy still targeted Quarry, while Construction was evaluating ordering generation 90. Quarry was therefore absent from the reservation supplied to Housing’s gate.

**P38 purchase-path classification: B — Quarry reservation not supplied.** The reservation source itself was available and complete. This was not an important-candidate bypass, a Knowledge exception, an unavailable-holdings result, or a failure of the pure conflict calculation. The mismatch came from Construction’s documented previous-cycle saving intent.

## Reproduction and trace

The exact Chromium harness is `node experiments/p40-construction-reservation-gate-exact.mjs`. It reuses the P38 B arm with its P36 stop at p688 and the same separately authorized 17 Quarry Lumber Gather clicks in each B replay. The trace is enabled only by the harness flag and is compiled by the test-only esbuild plugin; no production file under `src/` was changed.

The trace and parity evidence are in `experiments/p40-construction-reservation-gate-trace.json`. Fifteen chronological events cover one relevant Construction owner decision at p720, both Quarry and Housing candidate paths, the saving reservation, source evaluation, pure Build plans, and the verified Housing action. The repeated B trace is identical.

## Exact p720 decision path

The P38 authorization still named `city-rock_quarry` at p720. Construction ran the progression-captured policy backend (the script-backed `BuildingManager` backend did not run). Reservation enforcement was effectively enabled.

| Observed value                           |              Quarry | Basic Housing |
| ---------------------------------------- | ------------------: | ------------: |
| Current Construction ordering generation |                  90 |            90 |
| Candidate order / weighting              |       index 0 / 300 | index 2 / 100 |
| Cost                                     | Lumber 50, Stone 10 |     Lumber 23 |
| `important` / `knowledge`                |       false / false | false / false |
| Affordability sample                     |                true |          true |

When Construction read the saving reservation for the cycle, `hasCompletedOrdering()` was true. The owner context was work cycle 90 / ordering generation 90, but its published work-cycle ID was 89. The completed intent returned **Farm**, cost Lumber 27 and Stone 14. That complete target was supplied through script reservations; the native queue source was available and empty. Farm was included, with no same-target or pool exclusion.

The Quarry candidate was evaluated against that Farm reservation first. The same conflict reader held Lumber 50 and Stone 10. Quarry’s Lumber 50 and Stone 10 cost would leave zero of each, below Farm’s respective 27 and 14 reserve, so the raw result was a Saving conflict and Build skipped Quarry.

Housing then used the same complete Farm reservation and holdings. Its Lumber 23 cost left 27 Lumber, exactly Farm’s Lumber reserve; it did not spend Stone. The pure conflict reader returned `status: none`. The Construction adapter mapped that to `conflict: null, important: false`; `planBuildConflict()` returned `proceed` through its no-conflict branch. The Knowledge exception was false and was not needed. `planBuildCompetition()` returned a build decision for candidate index 2.

The Build executor invoked the native Housing action successfully. Its postcondition verified the building count changed from 4 to 5, with no queue entry. The test-only scalar snapshot around that action recorded Lumber 50 → 27, a debit of 23. This debit is reported separately; it was not used to infer the earlier conflict result.

The cause is therefore a generation boundary: P38’s p720 authority target was Quarry, and the current Construction list ranked Quarry first, but Construction’s conflict reservation deliberately reads its last completed intent. At this decision that intent was publication 89 and named Farm. The source comment in `captured-progression-control.ts` explicitly describes the saving target as the previous cycle’s judgement; `captured-construction.ts` only replaces `completedIntent` when the current cycle finishes.

## Missing-holdings audit

There is a separate confirmed fail-open correctness finding. If `resources.readResources()` returns `undefined`, `createCapturedCostConflictReader()` returns `{ status: "none", evidence: "unavailable" }`. `createCapturedConstructionAdapter()` handles `status: "none"` by returning `{ conflict: null, important }` and drops the evidence tag. The pure Build gate can then proceed as though no conflict existed.

`tests/experiments/p40-construction-reservation-gate-test.mjs` reproduces that mapping and the resulting proceed decision. It also distinguishes no reservation, a valid reservation without conflict, a real conflict, missing holdings, an incomplete reservation source, same-target exclusion, different resource pools, important bypass, and the Knowledge-gated Saving exception. In the p720 replay, holdings were present and this fail-open path did not occur. Production conflict behavior was left unchanged for this diagnostic experiment.

## Replay neutrality

Ordinary P38 B and traced B matched, and the B repeat produced the same trace:

- Native action sequence: 394 entries in each arm; all entries matched.
- Housing native action entries at p720: 2 in each arm; candidate purchase matched.
- P38 Gather actions: 17 in each arm, byte-for-byte equal.
- P36 p688 stop and P38 p728 `competing-purchase-consumed-resources` stop matched.
- Building/resource state, research grants, Jobs allocations, control usage, RNG state, and exported-save hashes matched at every retained checkpoint, including p688 and p10000.
- Final p10000 export hash and RNG state matched.

The trace did not change the Housing purchase or p728 stop.

## Diagnostic cost and bounds

Timing used the exact runner’s original monotonic Chromium diagnostic clock, `window.eaDiagnosticsNow`.

- Additional synchronous diagnostic cost: **0.6 ms** total (0.5 ms event assembly/append, 0.1 ms pre-action resource snapshot; owner-context and candidate-guard time rounded to 0 ms).
- Instrumented Construction owner decisions: **1**; candidate-relevance guard calls: **12**; monotonic clock reads: **58**.
- Additional native calls: **0**. Additional price, catalog, resource-source, or reservation-source reads: **0**.
- Two scalar root resource-amount property reads were added around the single verified Housing purchase to snapshot the debit.
- Trace events: **15**, no overflow, with a 4,096-event cap and p720-only capture. The event payload is 11,000 bytes (6,376 input bytes and 1,543 output bytes); the complete formatted evidence file is 651,234 bytes. Event storage and the overflow counter are bounded; the trace does not accumulate per-period events.
- The independent 2% production CPU gate remains unresolved; these measurements make no production CPU claim.

## Construction contract boundary

The cause is observable through existing Construction owner decisions. The replay does not show a broken reservation source: it shows an available, complete Farm reservation from the intentionally previous completed ordering. It also does not establish an intentional Housing priority over a valid Quarry reservation; the actual reservation at Housing’s gate was Farm and produced no conflict. No new cross-owner authority is needed to explain this purchase.

A future enforceable Quarry reserve would need an explicit Construction-owned commitment tied to the ordering generation it governs, with complete cost and pool, a root/progression validity basis, and clear conditions for release or replacement. Construction or the player must explicitly select that commitment and its priority relative to Housing. The gate must state whether it consumes the last completed intent or a same-cycle published intent, and what it does when that authority is stale or unavailable. A diagnostic economic target that the player has not selected cannot supersede legitimate native Construction priorities. This is a specification boundary only; no reservation, Gather, Jobs, or production behavior was changed here.

## Source boundaries inspected

- `src/bootstrap/captured-progression-control.ts`: Construction’s `savingReservations` reader and the previous-cycle intent comment.
- `src/adapters/evolve/progression/build/script-build-policy.ts`: script-backed `respectReservations: true` option; that backend was not active at p720.
- `src/adapters/evolve/progression/construction/captured-construction.ts`: weighting sort, cycle publication, `completedIntent`, affordability and conflict samples.
- `src/bootstrap/captured-construction-control.ts` and `src/adapters/evolve/captured-cost-conflict.ts`: reservation assembly, holdings and raw conflict result.
- `src/domain/cost-conflicts.ts` and `src/domain/progression/build/build.ts`: pure conflict arithmetic and important / Knowledge gates.
- `src/application/build.ts`: candidate sample → conflict plan → competition plan → executor sequence.
- `experiments/p40-construction-reservation-gate-trace.mjs`: test-only evaluated-value tracing and exact purchase snapshot.
