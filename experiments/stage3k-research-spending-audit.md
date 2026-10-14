# Stage 3K — Native Research debit evidence

## Decision

**Decision B.** A narrowly source-proved action class has a stable exact Mana debit, but native Research exposes no general pre-debit authority. The observation monitor is diagnostic. Do not use it to claim that a pre-spend budget is enforced.

- **A: No.** No existing native pre-debit boundary exposes one exact evaluated amount for a contract-tested general Research purchase.
- **B: Yes, narrowly.** The Magic fixture's four source-reviewed actions below have a stable synchronous Mana callback class with an exact amount available from the current native offer. The native callback itself is evaluated again at debit; the amount is proved from the pinned callback source and independently agrees with observed stock change in this replay.
- **C: Not for all Research.** Arbitrary native callbacks still have no trustworthy exact pre-invocation amount. If limiting scope to arbitrary actions only, enforcement would require native payment interception and must not be inferred from this shadow monitor.

The class established here is the Magic-universe fixture's `tech-rituals`, `tech-mad_science`, `tech-black_powder`, and `tech-clerics` actions, when their current native offers and controls are bound to the same offer generation. Their Mana callbacks are literals or read only `global.race.universe`; the synchronous payment path does not mutate those callback inputs between affordability and debit. The pinned `nexusAdjust` captures its Mana multiplier while `adjustCosts` is built. The 1,000-period replay observed displayed prices of 25, 50, 100, and 100 Mana respectively and matching stock decreases with the expected grant. This evidence is limited to these source-reviewed callbacks in the stated fixture; repeated agreement does not make an arbitrary callback deterministic.

No existing hook exposes the final evaluated debit before stock mutation. A minimal follow-up may test enforcement only for this source-reviewed class using the game's current offer/control binding, with a contract pinned to these upstream callback facts and post-grant reconciliation. It must not hardcode prices or generalize to other actions. No such enforcement is implemented here.

## Pinned upstream chain

Audited at `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f` in the read-only `D:/work/Evolve-DeadSpace` checkout:

- `src/main.js::drawTech`, `src/actions.js::setAction` and `src/actions.js::actionDesc` build native rows and evaluate adjusted costs for affordability, row data, and tooltips. Each displayed row amount is an evaluation of a callback, not a value retained for purchase.
- `src/actions.js::runAction` invokes the selected action. Successful Research action return is followed by `gainTech`; the action's own `payCosts(this)` happens before this grant.
- `src/actions.js::payCosts` calls `adjustCosts` when no adjusted costs were passed, calls `checkCosts`, then calls each resource callback again during subtraction. `src/actions.js::checkCosts` independently invokes ordinary resource callbacks for affordability. It does not pass the checked value to the debit loop.
- `src/functions.js::adjustCosts` applies the cost adjustment chain and `bindCostArgs` returns callbacks that evaluate adjusted values. An arbitrary callback can read mutable state or have side effects, so two evaluations do not establish one stable debit.
- `src/actions.js::gainTech` mutates the native technology state after action success. The expected grant must be checked after this point.

There is no safe imported-module binding to replace from the userscript boundary. The audit did not patch native code, call extra cost callbacks, or attempt to rewrite module imports.

## Shadow observation and parity

`experiments/stage3k-research-spending-evidence.mjs` runs the exact Chromium runner with the pinned Stage 3I save/settings, seed 42, and epoch `2026-09-21T00:00:00.000Z`. E-shadow changes no selector or Research action behavior. It observes only the selected action, offer generation/identity, displayed Mana price, Mana stock before/after, claim state, and post-action grant. It does not invoke cost callbacks or replace descriptors. Actions outside the source-proved class have unknown debit attribution.

See the machine-readable per-action report in `experiments/stage3k-research-spending-evidence-report.json`. D and E-shadow matched at 200 and 1,000 periods for final export, Research action sequence, grants/levels, Gather sequence and Mana expenditure, claim lifecycle, and Research draw counters. The report records hashes and category-by-category observations. Equality is empirical for this fixture, not a future exactness guarantee.

## Contract and lifecycle corrections

The pure spending contract now binds native action, control, and offer identity; reconciles admitted claims, budget commitments, claim-ledger reservations, and stock; rejects duplicate/overlapping/foreign-pool claims; requires authoritative complete price evidence for zero Mana; and returns failed attempts without losing pending reservations.

Claim absence release now requires a complete, fresh native offer-set observation plus an unchanged progression epoch. Failed/incomplete/stale observations and progression changes suspend the claim; a completed grant is handled separately. The absent action's nonexistent row price and control binding are not required because the complete offer-set identity establishes its absence.

The Stage 3J audit exists locally at `docs/stage3j-research-spending-audit.md`, but `docs/` is locally excluded and was not tracked at the reviewed GitHub revision. It cannot be committed at that intended path under repository instructions. This tracked report carries forward its boundary finding and records the Stage 3K resolution.
