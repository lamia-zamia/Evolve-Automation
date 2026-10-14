# Stage 3K — Native Research debit evidence

## Decision

**No debit authority is available at the current adapter boundary.** The 1.5.0 source narrows a possible bounded class, but the userscript cannot currently prove that a live offer is backed by the exact pinned source callback or even identify the exact upstream commit at runtime. The observation monitor remains diagnostic. Do not treat its displayed prices or post-spend stock deltas as pre-spend authority.

- **A: No.** No existing native pre-debit boundary exposes one exact evaluated amount for a contract-tested general Research purchase.
- **B: A source-reviewed candidate class exists, but it is not attestable yet.** In the Magic universe, `tech-rituals`, `tech-mad_science`, `tech-black_powder`, and `tech-clerics` define literal Mana costs or branch only on `global.race.universe`. That alone does not prove the current live callbacks are those source definitions.
- **C: No generic authority.** Arbitrary callbacks remain untrusted. Unknown or zero-net-debit actions stay outside the candidate class.

If a future adapter can establish all of the following without invoking another native cost callback, the bounded class can be reconsidered: exact upstream identity `db38e2af831907d49aeb5348d678d8d8745d6c3f`; selected native action ID in the four-action allowlist; current offer, offer-set observation, and control generation all bound together; Magic universe and stable route input; source-reviewed native Mana callback identity bound to that action; a complete current Mana-modifier observation showing Lone Survivor, True Path cost doubling, Technocracy adjustment, and the Nexus/Witch Hunter/Rogue Magic Mana discount are inactive; and fresh price/resource evidence from the same binding context. Unknown or active modifier evidence invalidates the class. A displayed price alone is insufficient, and the amount must come from the current native offer rather than a hardcoded price table.

The current adapter has no access to the upstream Git commit and cannot establish native `Action.cost.Mana` function identity. Therefore it cannot construct this attestation today. The pure `authorizeResearchManaSpend` contract remains disconnected from execution; its externally supplied `kind: "verified"` is not itself proof and must not be wired to a click. No extra callback evaluation, inferred identity, or price heuristic fills this gap.

## Pinned upstream chain

Audited at `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f` in the read-only `D:/work/Evolve-DeadSpace` checkout:

- `src/main.js::drawTech`, `src/actions.js::setAction` and `src/actions.js::actionDesc` build native rows and evaluate adjusted costs for affordability, row data, and tooltips. Each displayed row amount is an evaluation of a callback, not a value retained for purchase.
- `src/actions.js::runAction` invokes the selected action. Successful Research action return is followed by `gainTech`; the action's own `payCosts(this)` happens before this grant.
- `src/actions.js::payCosts` calls `adjustCosts` when no adjusted costs were passed, calls `checkCosts`, then calls each resource callback again during subtraction. `src/actions.js::checkCosts` independently invokes ordinary resource callbacks for affordability. It does not pass the checked value to the debit loop.
- `src/functions.js::adjustCosts` applies the cost adjustment chain and `bindCostArgs` returns callbacks that evaluate adjusted values. An arbitrary callback can read mutable state or have side effects, so two evaluations do not establish one stable debit.
- `src/actions.js::gainTech` mutates the native technology state after action success. The expected grant must be checked after this point.

There is no safe imported-module binding to replace from the userscript boundary. The audit did not patch native code, call extra cost callbacks, or attempt to rewrite module imports.

## Stage 3K shadow observation (historical)

`experiments/stage3k-research-spending-evidence.mjs` runs the exact Chromium runner with the pinned Stage 3I save/settings, seed 42, and epoch `2026-09-21T00:00:00.000Z`. E-shadow changes no selector or Research action behavior. It observes only the selected action, offer generation/identity, displayed Mana price, Mana stock before/after, claim state, and post-action grant. It does not invoke cost callbacks or replace descriptors. Actions outside the source-proved class have unknown debit attribution.

The original Stage 3K report matched D and E-shadow to each other, but both had zero Gather clicks at 200 periods. That parity did not establish parity with the accepted Stage 3I behavior. Stage 3L corrected the claim lifecycle and reran the comparison; see the current machine-readable per-action report in `experiments/stage3k-research-spending-evidence-report.json`. D and E-shadow now match at 200 and 1,000 periods for export, Research sequence, Gather clicks and Mana spend, claim lifecycle, and draw counts. The comparison adds no native cost callback evaluations. Equality is empirical for this fixture.

## Contract and lifecycle corrections

The pure spending contract now binds native action, control, and offer identity; reconciles admitted claims, budget commitments, claim-ledger reservations, and stock; rejects duplicate/overlapping/foreign-pool claims; requires authoritative complete price evidence for zero Mana; and returns failed attempts without losing pending reservations.

Claim absence release requires a complete, fresh native offer-set observation in the current root, route, and progression context. A completed grant completes only its own claim using the grant state. For a still-mandatory offer after progression changes, the prior claim stays suspended unless a fresh current offer and complete current resource sample can be independently rebound to the current route and generation; verified current non-Mana insufficiency then releases only Mana protection while leaving the obligation in the prerequisite graph. Changed prices or control bindings are never silently accepted, and unknown or incomplete evidence stays fail-closed.

The Stage 3L revision replay identifies `0804c8e0` as the first commit with the Gather liveness regression. That change moved current-offer/non-Mana-shortage handling behind generic changed-evidence suspension. Stage 3I resumed Gather at period 72; the later revisions produced no Gather clicks through period 200. Stage 3L restores the cycle-9 release using `race.truepath` / `race.iceage`'s pinned uninitialized-state contract (absent means inactive), a complete current offer set, matching root/route/progression context, current binding generations, and current non-Mana amounts. The full six-revision chronology and exact evidence are in `experiments/stage3l-revision-regression-report.json`; corrected D results are in the `stage3l-current-*` reports.

## Production bundle isolation

The production build sets `__EA_TEST_SURFACE_ENABLED__` to `false`, so `researchShadowEnabled` cannot activate shadow observation. Stage 3L also places the observer closure construction, pre/post Mana sampling, and observer calls behind that compile-time flag. In the generated production bundle, the activation name and observer function bodies are absent; three uninitialized local bindings remain, with no observer callback or stock read. The current artifact is 1,117 bytes smaller than the Stage 3K artifact at `afc4598e`.

`experiments/stage3l-production-shadow-isolation.mjs` compared the old and new production artifacts in the exact Chromium runner at 200 periods. Final export hash, Gather trace/click count, Mana expenditure, Research draw counts, and errors were identical. Both had zero Gather clicks because production does not enable the test-only claim experiment. The test-enabled Stage 3K replay separately proves the shadow monitor still observes all four source-reviewed actions and preserves D/E parity; its instrumentation reports zero extra native Research draws and zero additional native cost-callback evaluations.

The Stage 3J audit exists locally at `docs/stage3j-research-spending-audit.md`, but `docs/` is locally excluded and was not tracked at the reviewed GitHub revision. It cannot be committed at that intended path under repository instructions. This tracked report carries forward its boundary finding and records the Stage 3K resolution.
