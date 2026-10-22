# P21 — Construction decision quality and economic progression

## Decision: C — decision evidence is too coarse for a safe policy change

P20.2 identifies the first divergence in the retired allocator: arm C adds Stone Gather actions at p80 after A and C match through p72. C later buys a second Farm at p96 and has only one Cabin, resident, and Farmer at p112; A has two Cabins, residents, and Farmers at p112 and reaches three by p272. The result is consistent with an avoidable early Farm purchase consuming resources that could have built housing, but the P20.2 replay did not retain the complete Construction decision input at p80–112. It therefore cannot establish whether the Farm was misweighted, won an ordering tie, became affordable first, or followed another native reservation or timing effect. No policy change is justified from this evidence.

The P20.2 arm C requires the generic allocation that P20 retired. With that mechanism disabled, the accepted P19 arm A keeps one Farm, builds three Cabins, and staffs three Farmers. Its result does not exhibit the harmful extra Farm. No candidate policy replay or gameplay implementation was made. The normal production bundle remains byte-identical.

## Phase 1 — decision authority and mechanics

1. The managed Building candidates enter through the native `BuildingManager.managedPriorityList()` path. `createScriptBuildPolicyReader` first asks the manager to `updateWeighting()`, then reads that ordered list into immutable candidates. The captured Construction adapter combines managed buildings and other Construction sources into one cycle setup; ignored/queued entries remain represented for the planner but are not ordinarily clicked.
2. For managed buildings, the native manager owns the effective weights. Its upstream weighting combines configured base weights and dynamic rules. The captured fallback policy has a base configured weight, the `buildingWeightingNew` multiplier when count is zero, and further rule multipliers. In either path, the Construction planner receives an effective numeric weight; this repository does not calculate native managed-building weights itself.
3. Candidate order is descending effective weight as supplied by the policy. The Construction cycle walks that order; it does not globally optimize total economic utility. Equal or near-equal weights stop the higher-priority protection comparison, so native list order can matter at ties.
4. For a candidate, the planner samples current native cost and affordability on demand. It skips unaffordable or storage-incompatible candidates (subject to the configured storage-full exception), candidates blocked by already-used consumption, and candidates blocked by queue/trigger/resource reservations. The browser adapter separately validates current controls before executing a click. After a successful purchase, cached affordability is invalidated for the rest of the cycle; the current cycle's ordered candidate snapshot remains the decision basis until the next Construction cycle.
5. Higher-weighted candidates can protect shared resources. The competition phase compares regional pools, affordability, current stock, production rates, and the estimated delay a purchase would add to a higher-weighted competitor. A queued/trigger target or the current saving target can also reserve costs; the current cycle's saving target is derived from the last completed wanted order and is the first positive-weight, storable, unaffordable target. Important candidates bypass the ordinary reservation conflict gate. These mechanisms preserve expressed priorities and commitments; they do not estimate a building's overall contribution to future population or Research.
6. A successful purchase changes native count, price, stock, and potentially the manager's next ordering/weightings. The list is refreshed on a later cycle. A cycle's post-click affordability cache is intentionally not treated as fresh after spending.
7. Existing weighting has a housing-underuse rule: when housing capacity meaningfully exceeds current population, housing candidates can be downweighted by `buildingWeightingUselessHousing`. It does not positively promote housing when population is at capacity. Human is not covered by the Artificial-race “no empty housings” rule. The policy has no Farm-specific marginal-Food rule and no comparison of Food production against consumption. Food and population are observable in native state, but are not current managed-building weight inputs for this choice.

This path makes Construction a priority-and-affordability policy, not an economic utility optimizer. A second Farm is not automatically wrong: the evidence must show the active Food margin and competing candidates at the decision cycle. P20.2 contains later checkpoint Food and population observations, but not those decision inputs at p96.

## Phase 2 — first harmful divergence

P20.2 supplies a deterministic A/C comparison from the retained P18 Standard/Human fixture, frozen settings, seed 44, and epoch `2026-09-21T00:00:00.000Z`. The same test-surface bundle and source were used for both arms, and C's duplicate replay matched its native state, action trace, RNG, and export hash.

- Through p72, A and C match. Both complete the P19 Farm purchase at p72.
- At p80, C's first post-handoff intervention is five Stone Gather actions (10 native control invocations in the checkpoint trace); A makes no Gather invocation. C's Stone stock is 5 versus A's 0. This is the first divergence, and it is caused by the allocator rather than Construction.
- The allocator continues at p88 and p96. At p96, C records both Cabin and Farm Construction action calls; A records Cabin calls only. C has an additional Farm by p112, but its one-Cabin/two-Farm state does not establish why the p96 Cabin calls did not yield an additional retained Cabin. The trace does not include the complete eligible BuildingManager list, final weights, or an affordability matrix for either cycle. It also lacks a p96 same-cycle sample of current costs, saving target and reservations, resource stocks, native Research offers/blockers, food rates, and housing/population state.
- At p112, A has two residents, two Farmers, and two Cabins; C has one resident, one Farmer, one Cabin, and two Farms. The retained summary does not include population capacity at this checkpoint. A then builds a third Cabin and reaches three residents and Farmers by p272. C remains at one through p1000. Both runs remain fed, and neither records starvation or deaths.
- By p5000, both have the same 11 Research grants. Four mid-game grants arrive one eight-period work cycle earlier in C; no additional grant is earned. C has one resident/one Farmer and Farmer production 2.364 Food against consumption 1, while A has three residents/three Farmers and production 4.332 against consumption 3. Thus the extra Farm did not create an additional Research milestone or more productive population. Since both food balances are positive at that later checkpoint, excess Food is a plausible low-return use of resources, but it cannot establish the p96 marginal utility.

P20.2 retained stock snapshots only at p80, p112, p272, p1000, and later selected checkpoints. Those show outcomes, not the full choice state at p96. The bounded machine-readable extract in [p21-construction-decision-quality-evidence.json](./p21-construction-decision-quality-evidence.json) records the available decision and outcome evidence and marks the missing fields explicitly. No second full native catalog was run.

Cause classification: the first divergence is an allocator material intervention, which made the additional Farm outcome possible. The evidence cannot distinguish an inappropriate weight from an otherwise valid priority acting on an incomplete Food-utility model, resource competition, or a native timing/tie effect. P20.2 already establishes that the added work did not produce useful overall progression. Treating the Farm as inherently wrong or correcting its weight would overstate what the replay proves.

## Phase 3 — policy hypothesis gate

No falsifiable weight adjustment was tested. The tempting setting-only option—raising housing's static configured priority—would change a different decision: P20.2 already shows A building its Cabins on time, and does not show that native candidate order misprioritized housing before C received extra materials. It could not test the measured cause without re-enabling the retired allocator. A Farm-specific “Food surplus” adjustment is not an existing authoritative Construction condition; adding it would require new policy inputs and would violate the narrow existing-mechanism gate.

## Phase 4 — controlled comparison

P20.2 is retained as the deterministic causal comparison: accepted P19 A versus allocator-enabled C, plus a repeat of C. It is not the P21 controlled policy comparison because C enables the retired allocator. A separate accepted-P19 versus weighting-only replay was not warranted: Phase 2 did not establish a bad Construction weight or tie-break, and no supported existing economic predicate distinguishes the Farm at p96. P20.2 reports the same fixture/settings/game/seed/epoch and bundle, the purchase and Research traces, population/housing/jobs/Food outcomes, and aggregate native call counts. Its limitations on p96 decision inputs are explicit above.

P20.2 totals through p5000 were 21,238 counted native control calls in A and 23,622 in C (including `buildQueue.setData` probes). A and C had the same 11 Research grants; C's total 140 allocation clicks bought no additional grant. C's duplicate replay was deterministic. Since no candidate policy was justified, no new work was added for P21 and no P13O CPU campaign was repeated.

## Phase 5 — implementation gate and validation

No gameplay source or tests were changed. Generic Construction allocation remains retired; the P20 handoff and allocation safety regressions remain in place. The production bundle was not rebuilt from changed sources.

Validation requested for this disposition:

- Focused Construction policy tests: see final task report.
- Exact Chromium contracts: see final task report.
- Build and full `npm run check`: see final task report.
- `git diff --check`: see final task report.

## Review status

This report and its evidence extract are ready for independent review. No implementation commit exists. The report commit, if created, is separate from any future implementation/tests commit.
