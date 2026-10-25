# P51 — Verified Construction-to-Jobs handoff

**Decision: B — Event delivered, authority incomplete.** The test-only Construction receipt is published after a verified Quarry purchase and completed Construction cycle. The existing P49 Jobs owner consumes it during the same work cycle and observes Quarry Worker unlocked. P49 does not expose the cross-owner root and progression generations needed to establish a sufficiently fresh Construction-to-Jobs relationship, so the receipt is released as `handoff-authority-incomplete`. It carries no spending or assignment authority.

## Authority boundary and receipt

The Build path distinguishes candidate ordering, affordability, conflict evaluation, resource competition, native action, click reporting, native postcondition, and cycle completion. `onMutation` remains after `result.clicked` with its existing timing and meaning; that callback does not publish a receipt.

The P51 test instrumentation stages only the request's actual target after Build receives `verified-success` and `clicked: true`. It reuses the captured Build executor's existing `result.ok` and before/after building-count check. The immutable receipt is published only after `runBuildAutomation` calls `finishCycle(true)`. A failed or incomplete cycle clears the staged item. The receipt records its Construction owner, work-cycle and ordering generations, target, count postcondition provenance, available root/progression identity, decision-boundary cost when complete, explicit request identity, and `executionAuthority: "none"`.

The receipt stores no native root, control, DOM node, catalog, or resource snapshot. It records a historical purchase; it is not a current Construction saving commitment. Receipt construction and consumption add no native reads or controls. Root replacement clears staged or pending receipt state through the existing root-replacement callback.

## Exact replay

The replay uses the P42 p720 Standard/Human qualification and its existing one-cycle Farm-to-Quarry reservation substitution. It retains P36 Gather provenance (139 actions) and P38 Gather provenance (17 actions under the retained 18-action authorization). The pinned game is `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`; fixture SHA-256 is `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`, seed 44, epoch `2026-09-21T00:00:00.000Z`.

At p719, A and B match, as do B and B-repeat. The test request is installed after that checkpoint. It names `city-rock_quarry`, acknowledges suspension of Farm's saving priority, limits the intervention to one purchase, and states `playerSelected: false` and `productionAuthorized: false`. It qualifies only in B and B-repeat and gates the existing P42 substitution; it does not introduce a second reservation-replacement mechanism.

At p720, the P42 history shows completed Construction publication 89, Construction ordering generation 90, Quarry first, Quarry cost 50 Lumber / 10 Stone, holdings 50 Lumber / 10 Stone, and Housing as the lower-cost alternative. Quarry passes affordability, conflict (`proceed`), and competition (`build`) checks. The native action reports success, Quarry count rises from 0 to 1, and native resource debit is exactly 50 Lumber / 10 Stone. A does not buy Quarry. B and B-repeat match exactly through p720, including the native trace and handoff events.

The receipt is 1,302 bytes. It is created once in B and B-repeat and zero times in A. It reaches Jobs at age zero periods and zero work cycles. P49's ordinary-only Jobs owner is `verified-current`, with Jobs preparation generation 90 and work-cycle identity 90. Its prepared catalog records Quarry Worker unlocked with zero workers before the ordinary Jobs action; its plan identity is retained. The post-action ordinary Jobs state has two farmers and two Quarry Workers. This is an observation of ordinary Jobs behavior, not a P51 assignment or a Food-safety conclusion.

Construction supplies root generation 0 and its progression identity. P49 supplies neither corresponding cross-owner generation, so P51 records the work cycle as matched and the root/progression relationship as missing, rejects the receipt as an executable commitment, and releases it after the intended Jobs handoff window. No second Construction capture, Jobs catalog read, or `planJobs()` call is added.

## Lifecycle and isolation

Focused regressions cover verified publication only after a completed cycle; failed postconditions; rejected candidates; unavailable cost, reservation, or holdings; changed cost and Construction generations; wrong target; missing or mismatched root/progression identity; old work cycles; duplicate notifications; cancelled or replaced requests; root invalidation; unavailable Jobs evidence; missing Quarry Worker row; superseding mutation; duplicate consumption; and both ordinary-only and Full Jobs scopes. They reuse P42 qualification and preserve its fail-closed reservation checks.

The updated P50 AST regression compiles ordinary production, ordinary test-surface, and P51 test-surface bundles. It confirms production contains no P51 receipt functions, request, admission gate, root invalidator, or native wrapper; the ordinary test surface also omits them. The P51 exact test surface retains the handoff code.

P51's static receipt/consumer port audit found zero native read and control callsites. Existing P49 observation deltas were also zero for control resolution, settings, catalog, demand, and native-root reads. Publication and consumption callbacks took approximately 0.2 ms each in this run; the maximum callback increment was one. Three retained lifecycle events used 3,782 bytes. P40/P42's existing comparison instrumentation separately recorded four resource reads and two stock reads. These callback timings are not a renderer CPU-share measurement; no renderer CPU claim is made.

## Verification and limitation

- Exact three-arm Chromium replay: passed; A/B equal before intervention and B/B-repeat equal afterward.
- Focused P51 lifecycle tests and updated P50 AST isolation test: passed.
- Chromium runner contract suite: passed.
- `npm run build` and `npm run build:test-surface`: passed.
- `npm run check`: passed all 380 test files plus bundle syntax, type checks, lint, and formatting.
- `git diff --check`: passed.
- `node tools/chromium-native-parity-test.mjs` could not start: `test-artifacts/benchmark/settings/baseline-tuned.json` is absent. This is recorded in the machine-readable evidence. The P51 A/B/B-repeat replay used its controlled exact Chromium fixture and did not rerun the P46 benchmark.

Machine-readable lifecycle and replay evidence is in [p51-construction-jobs-handoff-evidence.json](p51-construction-jobs-handoff-evidence.json). The exact replay entry point is [p51-construction-jobs-handoff-exact.mjs](p51-construction-jobs-handoff-exact.mjs).

## Commit grouping

- Implementation and exact replay machinery: `26957efa`.
- Focused lifecycle and P50 isolation regressions: `a2bfda75`.
- This report and the generated machine-readable evidence are committed separately.
