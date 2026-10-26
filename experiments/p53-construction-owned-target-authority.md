# P53 — Construction-owned target admission and priority authority

## Decision

**A — Owner-side authority established.** Construction accepted one bounded, test-only request for `city-rock_quarry`, issued a one-cycle saving revision from Farm to Quarry, and used the existing native build executor. P52 correlated the verified purchase with the Jobs observation as one `correlated-owner-event`; receipt `executionAuthority` remains `none`.

This is a test-only authority experiment. It does not authorize production allocation, Gather, Jobs assignment, or further purchases. Matching P42’s Quarry purchase does not establish economic improvement: P43/P44 left Food sustainability unresolved.

## Authority boundary

The relevant owners and handoff points are:

| Authority                        | Owner and existing boundary                                                                                                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current candidate ordering       | Construction samples each source and stable-sorts the prepared candidates by native weighting in [`captured-construction.ts`](../src/adapters/evolve/progression/construction/captured-construction.ts). An incomplete source set cannot publish a partial order.                                  |
| Previous completed saving intent | Construction retains `completedIntent`; `readPublishedSavingTarget()` derives the prior completed saving target against current holdings. The P720 publication is Farm from work cycle 89.                                                                                                         |
| Current target selection         | [`runBuildAutomation`](../src/application/build.ts) consumes the prepared order and keeps ordinary affordability, cost-conflict, Knowledge, important-candidate, and resource-competition policy. P53 admits only the exact current Quarry candidate before its conflict decision.                 |
| Native queue reservations        | The existing queue reservation source reads native queue state through [`captured-queue-reservations.ts`](../src/adapters/evolve/captured-queue-reservations.ts). Any nonempty queue claim blocks P53 admission.                                                                                   |
| Script reservations              | [`captured-progression-control.ts`](../src/bootstrap/captured-progression-control.ts) combines state, Construction saving, and other script reservation sources. P53 samples the complete reservation evidence and permits only the explicitly named Farm saving intent to be displaced.           |
| Price and affordability          | [`captured-build.ts`](../src/adapters/evolve/progression/build/captured-build.ts) prepares the native price and action. Construction samples holdings through its ordinary affordability gate. P53 checks a complete current price/pool at admission and rechecks it immediately before execution. |
| Purchase and postcondition       | The existing captured Build executor calls the native `city-rock_quarry.action` and verifies the native building-count increase. P51 stages a receipt only after successful action and postcondition; P52 performs the existing Jobs handoff correlation.                                          |
| Saving-priority replacement      | The Construction owner creates `savingPriorityRevision`. The normal saving-reservation reader receives the temporary view through `ConstructionObservations.readSavingTargetForConflict`. The completed Farm publication remains intact.                                                           |

P40–P42 establish why the boundary matters. At P720, the current Quarry candidate is in work cycle 90 while the completed Farm saving intent is from cycle 89. P40 traced that reservation input; P41 preserves fail-closed conflict handling when reservation evidence is unavailable; P42 demonstrated the Quarry purchase by substituting a reservation outside Construction. P53 makes the replacement decision inside Construction and passes its result through an explicit owner observation interface.

P51/P52 verified that the native Quarry purchase can produce a one-time historical receipt and independent Jobs identity correlation. That receipt remains historical evidence only; Jobs receives no action authority from it. P20.1 rejected incomplete allocation authority and P20.2 retired the generic Construction allocation experiment after its progression comparison. P53 does not revive either allocator.

## Narrow request and owner contract

The exact request is in [`p53-construction-owned-target-authority-contract.mjs`](p53-construction-owned-target-authority-contract.mjs):

- ID `p53-test-only-city-rock-quarry-v1`, generation 1, origin `test-only`.
- Exact target `city-rock_quarry`, at most one purchase, with total debit capped at 50 Lumber and 10 Stone.
- Exact period 720, Construction work cycle 90, ordering generation 90, expiring at that period/work cycle.
- Explicit one-decision permission to replace Farm’s cycle-89 saving priority.
- Native execution permission exists only for this test request. `playerSelected` and `productionAuthorized` are false; material-gathering and Jobs-assignment permissions are false.

The pure owner contract in [`construction-target-admission.ts`](../src/domain/progression/build/construction-target-admission.ts) requires exact candidate/action identity; matching request, period, work-cycle, and ordering generation; compatible previous publication root/progression identity; a complete candidate catalog, current price/pool and holdings; current native action/control generation; complete native queue and script reservation samples; an explicitly authorized displaced saving intent; and remaining purchase/debit budget. Unknown evidence fails closed. Important candidates and Knowledge candidates are rejected by this request path and retain ordinary Build behavior.

The request is usable only in its exact cycle. Cancellation, replacement, expiration, root replacement, progression/control-generation change, current-price change, or a failed freshness check drops the temporary authority. The executor can be attempted once. An incomplete or failed Construction cycle, native action rejection, or failed count postcondition earns no verified-purchase credit and produces no verified receipt.

The revision records:

- Previous completed intent: Farm, 27 Lumber / 14 Stone, published at cycle 89.
- New accepted target: Quarry, 50 Lumber / 10 Stone.
- Reason: `explicit-test-only-priority-replacement`.
- Governing work cycle and ordering generation: 90 / 90.
- Lifetime: `this-construction-cycle`.
- Release: Construction clears the revision at cycle completion, root replacement, or invalidated request/control/price freshness. The completed Farm publication is not overwritten.

The owner decision is admission, not proof of purchase. After acceptance, the ordinary Build affordability, conflict, competition, native action, building-count postcondition, and resource accounting remain in the execution path.

## Exact comparison

The controlled Chromium replay used the P42 Standard/Human boundary and the retained P36/P38 Gather provenance:

- Game `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- P18 Standard/Human fixture SHA-256 `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`.
- Seed 44; frozen epoch `2026-09-21T00:00:00.000Z`.
- Checkpoints p719 and p720, corresponding to work cycles 89 and 90.

| Arm      | Configuration                                  | p719 parity           | p720 result                                                                                    |
| -------- | ---------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| A        | Historical control; Farm priority preserved    | Baseline              | No Quarry purchase.                                                                            |
| B        | P42 legacy external reservation substitution   | Equal to A/C/C-repeat | One native Quarry purchase; P42 substitution applied.                                          |
| C        | Construction-owned request and saving revision | Equal to A/B/C-repeat | Same native Quarry purchase and debit as B; owner accepts and P42 substitution is not applied. |
| C-repeat | Exact repeat of C                              | Equal to A/B/C        | Same result and receipt identity as C.                                                         |

All four arms match before intervention at p719. B and C have identical p720 save hash, state, native action trace, RNG state, Research, and ordinary Jobs result. C and C-repeat match at both checkpoints. P42 and P53 differ in authority location: B substitutes the external reservation view; C retains Farm’s completed publication and has Construction issue a temporary Farm-to-Quarry revision through its observation interface.

The native action reports success, Quarry count increases from zero to one, and the measured debit is exactly 50 Lumber / 10 Stone. B and C perform no additional Gather; P36 remains at 139 actions and P38 at 17. Research and non-Quarry Construction decisions match between the two treatments. A differs in the expected native consequences of not building Quarry: it retains four Farmers and builds a fifth basic-housing unit. B/C/C-repeat have two Farmers and two Quarry Workers after the Quarry unlock; this is the existing ordinary Jobs response, not P53 Jobs authority. The P53 request explicitly denies Jobs assignment permission.

P52 consumes the Construction receipt once as `correlated-owner-event`, using matching cycle-90 root/progression identities from the shared runtime reader. The receipt identifies request `p53-test-only-city-rock-quarry-v1`; its `executionAuthority` is `none`.

Machine-readable arm states, native calls, owner decision, priority revision, debit, receipt, and identity evidence are in [`p53-construction-owned-target-authority-evidence.json`](p53-construction-owned-target-authority-evidence.json). The bounded exact replay entry point is [`p53-construction-owned-target-authority-exact.mjs`](p53-construction-owned-target-authority-exact.mjs).

## Rejection and lifecycle regressions

The focused suite in [`p53-construction-owned-target-authority-test.mjs`](../tests/experiments/p53-construction-owned-target-authority-test.mjs) covers absent/incomplete requests; missing target, native-execution, or priority-replacement permission; Farm remaining protected; wrong or no-longer-current target; incomplete catalog; important and Knowledge candidate behavior; repriced/over-budget cost; missing or insufficient holdings; missing native control; unavailable native queue or script reservation source; competing queue/saving claims; root, progression, publication, work-cycle, ordering, and expiration mismatch; cancellation/replacement; exhausted purchase/debit budgets; changed control generation; root replacement and progression/price change before execution; native action rejection; failed native count postcondition; incomplete Construction source; and duplicate purchase attempt.

When replacement permission is absent, Farm remains the saving priority and an unrelated native Housing action proceeds through ordinary policy. Unavailable reservation evidence yields the existing P41 fail-closed conflict result and does not globally suppress unrelated actions. P51/P52 regressions keep failed or incomplete construction from producing a verified receipt, and P52 keeps receipt execution authority at `none`.

## Cost and production isolation

P53 recorded one owner admission evaluation and one saving revision. The captured browser timer reported 0 ms for the pure evaluation and maximum callback; these readings are at the available timer resolution. Existing P41 conflict-reader timing was 11.1 ms in B and 7.8 ms in C for one measured reader call each in this replay; these are synchronous diagnostic timings, not renderer CPU share.

| P53-only measurement                                                    |          Exact result |
| ----------------------------------------------------------------------- | --------------------: |
| Local request-source reads through C decision                           |                   182 |
| Additional shared identity samples / attributed native root reads       |                 3 / 6 |
| Complete queue and script-reservation evidence samples                  |                     1 |
| Current native action/control and price samples                         |                 2 / 2 |
| Additional resource holdings samples                                    |                     0 |
| `buildQueue.setData` delta against P42                                  | +2 returned, 0 thrown |
| Retained P53 owner events / bytes                                       | 1 / 1,028; 0 overflow |
| Dormant A owner decisions / identity, reservation, control, price reads |        0 / 0, 0, 0, 0 |
| New global scans / native actions on the dormant path                   |                 0 / 0 |

The two additional `buildQueue.setData` calls are the bounded native-price checks at admission and immediately before the native action. Resource, price, pool, reservation, and control checks do not initiate a recurring target/catalog scan. The long-lived P53 test harness performs local request lookups before the target cycle; these add no native evidence reads. P50’s compiled-output AST regression confirms ordinary production includes zero bytes of the P53 admission module and no P53 behavior markers; only the dedicated P53 test bundle includes that machinery.

The existing `test-artifacts/benchmark/settings/baseline-tuned.json` native-parity fixture is absent. P53 therefore uses the controlled exact Chromium replay and makes no native-parity benchmark claim. Renderer CPU compliance, including the ≤2% requirement, remains unresolved.

## Verification

Verified with `npm run build`, `npm run build:test-surface`, `npm run typecheck`, the focused P40/P42/P50/P51/P52/P53 regression set, the bounded exact Chromium A/B/C/C-repeat replay, `npm run check`, and `git diff --check`. The exact replay outcome is **A — Owner-side authority established**; its machine-readable result is in the adjacent evidence JSON. Both build modes and the focused regressions passed. The repository check passed all 382 test files plus bundle syntax.

The implementation is committed as `016de8db`; the regression set is committed as `777bd952`. This report and its exact replay evidence are committed separately. P53 was not pushed.
