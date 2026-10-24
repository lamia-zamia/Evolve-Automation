# P41 — Reservation fail-closed correctness and p720 counterfactual

**Decision: A — Narrow correction verified.** Unavailable holdings now fail closed for ordinary Build candidates. The exact historical replay is neutral, and the p720 reservation counterfactuals are classified using the captured P40 inputs and existing pure planners. No counterfactual game action was executed.

## Correctness fix and regressions

When an applicable reservation existed but `readResources()` returned `undefined`, the cost-conflict reader returned `status: "none"` with a diagnostic evidence tag. Construction only propagated `status: "unavailable"`, so it discarded that tag and passed `conflict: null` to Build. An ordinary candidate could therefore pass the conflict gate without verified holdings.

The reader now returns the existing explicit `status: "unavailable"` result. Construction already maps that result to an unavailable `BuildConflictView`, and the pure Build gate skips an ordinary candidate before it reaches a Build decision. The fix adds no resource, price, or catalog reads and changes no valid-reservation arithmetic or previous-cycle saving policy.

The focused regressions exercise the adapter and pure Build phases through the competition decision. They cover zero reservations (no holdings read), complete non-conflict, complete conflict, missing holdings, unavailable reservation source, same-target exclusion, different-pool exclusion, important candidates with known conflict and unavailable evidence, and the Knowledge-gated Saving exception. A Knowledge exception does not apply to unavailable evidence. Important candidates still intentionally bypass both known conflicts and unavailable evidence; this separate priority bypass is documented and unchanged.

Run with `npm test -- p40-construction-reservation-gate` and `npm test -- captured-cost-conflict p40-construction-reservation`.

## Exact replay and neutrality

The retained P38/P40 exact Chromium replay ran with the fixed production source and test-only tracing. P40’s original P38 control evidence was compared with the traced replay; the repeated B trace also matched.

- P40 replay decision: **A**, neutral and trace complete.
- Quarry still conflicts with the completed Farm Saving reservation from publication 89 at p720.
- Housing still has complete holdings and a valid no-conflict result; its pure Build and competition decisions proceed, and the native Housing purchase succeeds at p720.
- Native action sequences match: **394 / 394**. The two p720 Housing native action entries match.
- Gather actions match byte-for-byte: **17 / 17**.
- P36’s p688 stop (`shortage-exceeds-remaining-budget`) and P38’s p728 stop (`competing-purchase-consumed-resources`) match.
- Building/resource state, research, Jobs, control usage, RNG, and exported-save hashes match at every retained checkpoint, including the final p10000 export hash.

The P41 replay trace and complete machine-readable parity summary are retained in `experiments/p41-reservation-correctness-trace.json` and `experiments/p41-reservation-gate-comparison.json`. The latter also records the fixed source hash and its P40 baseline source hash.

## p720 pure counterfactuals

All scenarios reuse the captured p720 stock (50 Lumber / 10 Stone), candidate prices and priority, affordability, flags, Knowledge levels, available empty native queue, and other script reservations. Quarry was index 0 / weight 300 / cost 50 Lumber and 10 Stone. Housing was index 2 / weight 100 / cost 23 Lumber. Both were affordable, non-important, and non-Knowledge candidates. The captured Knowledge gate was not active (65 required versus 100 capacity), so its exception did not apply.

| Scenario                          | Exact reservation input                                                                                                                                                        | Quarry                                                                                                                              | Housing                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Historical**                | Completed Farm Saving reserve: 27 Lumber / 14 Stone. Native queue empty.                                                                                                       | The 50/10 Quarry spend leaves 0/0, below Farm’s 27/14 reserve. Raw conflict; Build skips before competition.                        | The 23 Lumber spend leaves exactly Farm’s 27 Lumber reserve. No conflict; Build proceeds, competition selects Housing, and the replay confirms the native purchase.                                                                                                                                                                         |
| **B — No previous-cycle reserve** | Remove only Farm’s saving reservation. Keep the captured native queue and all other captured script commitments.                                                               | No conflict; Build proceeds. As the top-ranked candidate, Quarry reaches competition and the pure planner returns a Build decision. | No conflict; its conflict gate proceeds. It remains a possible later candidate on the unchanged captured snapshot. Its post-Quarry competition and affordability are not simulated: if a Quarry purchase succeeded at the captured cost, the stock would fall to 0 Lumber / 0 Stone and Housing would no longer be affordable at 23 Lumber. |
| **C — Current-Quarry reserve**    | Replace only Farm with a hypothetical Quarry Saving reserve: 50 Lumber / 10 Stone. This is an **unapproved diagnostic proposal**, not an actual Construction-owner commitment. | Same-target exclusion removes Quarry’s own reserve. No conflict; Build proceeds, and competition returns a Build decision.          | The 23 Lumber cost would leave 27 Lumber, below Quarry’s 50 reserve. Raw conflict; Build skips before competition.                                                                                                                                                                                                                          |

The JSON records each scenario’s exact queue and script reservation inputs, raw conflict, affordability, important/Knowledge exception status, pure Build gate, and competition evidence. For Housing in B it deliberately marks the later competition as unevaluated after a hypothetical Quarry decision; the historical Housing competition result is retained as captured evidence, not presented as a simulated post-Quarry outcome.

## Authority conclusions

1. **Without the previous Farm reserve, pure Build permits Quarry.** It passes the conflict gate and, at captured priority index 0, the competition planner returns a Build decision. This does not predict a native purchase.
2. **A current Quarry reserve protects its materials against ordinary Housing.** The captured Housing cost would take Lumber below the 50 Lumber reserve. The intentional important-candidate bypass still exists; Housing was not important in this replay.
3. **The A/B/C conflict changes come from reservation inputs and identity.** Affordability, order, cost, importance, and Knowledge inputs stay fixed. Same-target exclusion accounts for Quarry passing its own hypothetical reserve in C. A real Quarry purchase in B would then change later affordability through the resource debit; that is a sequential state change, not another reservation gate.
4. Replacing Farm discards the observed prior-cycle Construction saving intent for **27 Lumber and 14 Stone** from completed publication 89. The trace establishes that Farm priority was active; it does not establish that a player directly selected it.
5. Authorizing a replacement requires an explicit same-cycle Construction-owner selection tied to the ordering/work cycle and valid root/progression generations, a complete target price and pool, current native queue and script-claim evidence, precedence rules including important candidates, and defined release/replacement conditions. A player priority change must be authorized by the player. The P37–P39 goal analysis remains diagnostic-only.
6. **Jobs remains Food-unsafe under the P39 hypothetical Quarry unlock.** The ordinary pure Jobs plan assigns 2 Farmers / 2 Quarry Workers, producing 3.348 Food against consumption 4 (net −0.652). This risk is independent of Construction’s reservation input. No worker assignment or Jobs policy was changed.

P40’s previous-cycle saving-target policy remains unchanged. The B/C scenarios are diagnostics, not authorization to discard Farm’s commitment, replace an owner target, force Quarry, or assign workers.

## Performance and verification

The fixed replay measured **2** p720 reservation-reader calls at **0.4 ms total** using `window.eaDiagnosticsNow`. The traced run used 62 diagnostic clock reads and measured **0.4 ms** of synchronous P40 diagnostic work. No whole-renderer CPU percentage is inferred from this branch correction. The production fix adds no reads; the retained P40 test harness still takes its existing two scalar root-resource snapshots around the verified Housing purchase.

Verification: focused reservation tests, exact Chromium replay, Chromium contract tests, ordinary build, full `npm run check`, and `git diff --check`. See the P41 comparison JSON for exact replay and source-change evidence.
