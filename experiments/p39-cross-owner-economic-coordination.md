# P39 — Cross-owner economic coordination

## Decision: B — Authority blocked

The bounded read-only model represents the P38 material conflict and the Food deficit produced by the ordinary Jobs planner. It also finds a conditional four-resident path of 3 Farmers / 1 Quarry Worker and a five-resident path of 4 Farmers / 1 Quarry Worker. Both are diagnostic alternatives. Construction has no demonstrated cross-owner reservation contract, and the Quarry Worker assignment remains hypothetical and unauthorized. No spending or assignment authority follows from this analysis.

The P20 generic allocator remains retired. The P39 domain code is not imported by the production entry point. No recurring planner, Worker, new native catalog draw, game-state mutation, or Quarry experiment was added.

## 1. Construction conflict reconstruction

The P38 evidence shows this sequence:

| Evidence point | Observed state                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| p688 stop      | Quarry was current at 50 Lumber / 10 Stone; 32 / 10 stock; 4 residents / 4 capacity; 4 Basic Housing. The P38 authorization inherited this stop.                                                                                                             |
| p720 authority | Quarry was still current at 50 / 10. The authority read stock at 47 Lumber / 10 Stone; the publication matched the target and root/progression/control generations were current. Build and Research queues were empty and no competing claims were reported. |
| p720 actions   | The Gather trace raised Lumber from 47 to 49. The native action trace includes two `city-basic_housing.action` calls.                                                                                                                                        |
| p728 stop      | Lumber was 27 instead of the expected 49; Stone stayed 10. The 22-Lumber decrease and Housing count increase from 4 to 5 identify one successful Housing purchase.                                                                                           |

Housing was already affordable at p688. Its 22-Lumber debit is reconstructed from the p720–p728 native action and stock evidence; 22 is below the p688 stock of 32. Gather raised stock during the same target episode, but it did not make Housing affordable for the first time.

Quarry remained the saving target because Construction's captured `readSavingTarget()` walks the last completed weighted ordering and returns the first wanted, storable, unaffordable candidate. That read is a statement of current saving intent. It is not a lock on every other candidate. The P38 p720 capture confirms the same Quarry target and price after the Gather actions.

The native Build path reads `BuildingManager.managedPriorityList()`, combines candidate families, sorts by weighting, and processes candidates. An unaffordable Quarry can be skipped while a later affordable Housing candidate is considered. The Build adapter ultimately invokes the captured native action control. The native queue adapter reserves eligible queue entries; an empty Build queue removes those queue commitments but does not remove other Construction candidates.

Construction also has an internal saving reservation. `captured-progression-control.ts` turns the prior completed Construction saving target into a `ReservedCostTarget`, combines it with queue and other script reservations, and passes these reservations into the captured Construction control. `findCostConflict()` compares the proposed action cost with the reserved target costs against current stock. The ordinary Build conflict gate has an `important` candidate bypass. Those mechanisms coordinate Build candidates owned by that Construction integration; they do not accept or arbitrate a Gather owner's target-specific claim.

The P38 trace did not capture the selected candidate record, its `important` flag, or the result of the exact conflict-gate call for either Housing invocation. Therefore it proves that native Housing was purchased while Quarry remained current, but it cannot distinguish an `important` bypass from a Construction cycle that did not apply the expected saving reservation to that call. The observed saving target alone cannot establish which path ran.

`CostReservationSource` is an existing internal extension point that can express a target-specific cost. That does not make an external proposal an enforceable Construction commitment: there is no supported owner contract that accepts the claim, resolves it against queues and other owners, binds it to current owner/work-cycle and root/progression/control generations, and reports that the next purchase will honor it. Adding a reserve unilaterally could block a legitimate native Housing purchase; it might still be bypassed by an important candidate. That could violate the Construction owner's or player's competing intent.

**Exact missing coordination capability:** a Construction-owned, generation-bound reservation contract for external target-specific material claims, with explicit precedence against native queues, Construction saving intent, important candidates, and competing automation claims, plus an independently observable next purchase and invalidation rule. P39 does not provide that contract or block purchases.

The P20–P38 record supports this boundary. P20 and P20.2 showed purchases such as Cabin while Quarry was the current target, and P21 recorded that the full candidate decision input had not been retained. P20.1 and P33 treated freshness and phase identity as required authority, not price equality alone. P23–P24 show why pure calculation cannot cross a synchronous owner boundary by itself. P31–P35 kept allocation read-only or stopped before treatment; P20's generic allocator stayed retired. P36/P38's Gather calls were separate test authorizations. P37 kept its goal graph diagnostic and player-unselected. P38 is the exact retained case where Housing consumed the Quarry-directed material stock.

## 2. Pure resource-commitment model

[`src/domain/progression/economic-coordination.ts`](../src/domain/progression/economic-coordination.ts) adds an offline pure model using `findCostConflict()` and `hasSufficientGoalCapacity()`.

Its resource input carries the goal ID and graph provenance, complete current Construction target/price, stock and capacity evidence, native queue commitments, other automation claims, a proposed protected amount, owner/work-cycle identities, snapshot ID, root/progression/control generations, and the spending owner's independently observed next purchase. The assessment reports invalidation conditions for snapshot, work-cycle, generation, price/target, stock/capacity, queues, claims, and purchase changes.

P38 did not persist native owner work-cycle IDs, resource snapshot IDs, or a snapshot validity epoch. This replay marks those p720 identities as **normalized from the captured period**; it does not present them as native-captured IDs. The model exposes `snapshotProvenance` so that distinction survives assessment. The construction candidate importance and exact reservation-gate observation are also unavailable. A live diagnostic would need those observations from the same Construction work cycle.

Status meanings are:

| Status        | Meaning                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `unreserved`  | No target-specific reserve proposal exists.                                                                                         |
| `proposed`    | A diagnostic goal requests protected amounts, but no owner contract makes them enforceable.                                         |
| `conflict`    | An independently observed purchase would spend below the proposed protected amount.                                                 |
| `unavailable` | Current owner, snapshot, generation, price, stock, capacity, queue, claim, or purchase evidence is missing or stale.                |
| `enforceable` | Reserved for a future result only if a supported owner contract is independently demonstrated. No current analyzer path returns it. |

Replaying P38 p720 gives `conflict`: Quarry proposes 50 Lumber / 10 Stone; current Lumber is 49; the observed Housing purchase costs 22 Lumber by stock delta; the proposed Lumber reserve would be violated. The result is a diagnostic conflict, not a historical prohibition. `executionAuthority` remains `none`.

## 3. Food-constrained Jobs feasibility

The P38 p688 Jobs input is the actual native capture: four residents, four Farmers, and no Quarry Worker row because Quarry was locked. Running the actual `planJobs()` produces four Farmers. With the pinned source-backed Food model, current production is 5.316 against consumption 4.

The native formula uses Farmer impact 0.82, one full Farm slot with the Agriculture-II bonus 1.15, and a 1.2 aggregate multiplier matched to the retained native output. This reproduces P38 p688's captured 5.316 output and p10000's 6.3 output. The aggregate multiplier is not a separately captured buff ledger; the current analysis is scoped to the retained Standard Human, Agriculture-II snapshots. A live runtime would need fresh evidence for current buffs and production modifiers. The model recalculates when a new multiplier/fingerprint is supplied and returns unavailable if the resulting output does not match, but it cannot independently detect a modifier change that is absent from its input.

For one Farm:

| Farmers | Food output | Consumption | Net Food |
| ------: | ----------: | ----------: | -------: |
|       2 |       3.348 |           4 |   −0.652 |
|       3 |       4.332 |           4 |   +0.332 |
|       4 |       5.316 |           4 |   +1.316 |

The minimum for four residents is therefore 3 Farmers. On P38's clearly hypothetical unlocked Quarry Worker input, the actual `planJobs()` call produces **2 Farmers / 2 Quarry Workers**, reducing Food by 0.652 below consumption. The diagnostic constrained alternative moves one worker back to Farmer: **3 Farmers / 1 Quarry Worker**, retaining all four residents and a positive Food margin.

For five residents, the model uses the observed p10000 Food output 6.3, consumption 5, one Farm, and the same matched formula. It independently computes a minimum of **4 Farmers**: three produce 4.332 and are short by 0.668; four produce 5.316 and leave a 0.316 surplus. Applying `planJobs()` to the P38 hypothetical unlocked row after changing the projection to five residents gives 2 Farmers / 3 Quarry Workers, which is Food-negative. The constrained projection is **4 Farmers / 1 Quarry Worker**. This five-resident Jobs input is a projection, not an observed native Jobs cycle.

The alternative checks retain every resident, keep workers and servants within job capacity, preserve Farmer/storage-backed minima, the native `minimumDefault` floor, and supplied worker commitments, require an unlocked and managed Quarry Worker row, and leave no assignment to a locked job. The ordinary planner's `maximum` is unlimited (`-1`), but its Farmer `smartMaximum` is 2. Each sustainable alternative exceeds that smart maximum and changes two assignments. `planJobs()` itself is unchanged, and neither result mutates civic state.

The retained P38 Standard Human cases have zero servants; population retention is validated against that captured worker/servant headcount. The alternative is not generalized to a nonzero servant pool without current evidence binding servant assignment, weighted capacity, and population accounting.

P38 did not capture a separate worker-commitment registry. The replay therefore labels the empty external claim set as an assumption. The 3F/1Q and 4F/1Q results are **conditional candidates**, not fully verified alternatives: they preserve the supplied empty set, but the result marks commitment preservation unverified. A complete current worker-commitment source is required before an alternative can be called valid.

The model returns `unavailable` for missing or stale production/validity evidence, unavailable job controls or capacity, unsupported Farmer servants, and incompatible same-cycle Jobs evidence. It recalculates the minimum when Food consumption or a supplied aggregate production modifier changes. Focused regressions cover stale generations/snapshots, missing owner-cycle provenance, competing native and automation claims, incomplete evidence, Food deficits, locked rows, servant-weighted capacity, worker commitments, and provenance isolation.

Authorizing the alternative would require a player-selected or otherwise supported Jobs-owner contract that permits overriding the current ordinary proposal, current Quarry Worker controls and unlock evidence, and fresh same-cycle Food, capacity, minima, servant, and worker-commitment observations. A successful hypothetical assignment calculation is not execution authority.

## 4. Cross-owner dependency assessment

The assessment reuses P37's objective identity and P38's updated graph result, citing the P38 production artifact for those result statuses. The evidence chain preserves distinct p688 Jobs/housing, p720 resource/offer, and p10000 Stone/goal-graph snapshots. It joins Jobs and housing to the same snapshot; acquisition and the current Quarry offer must match the resource snapshot, validity epoch, target, lineage, and period; all captures must share the P38-B lineage; and Stone output must match the goal graph's snapshot, period, and validity epoch in chronological order. The p720 snapshot and validity labels are normalized because the retained P38 authority evidence did not contain those identifiers. P38's graph still marks positive Stone unsatisfied and its top-level objective unavailable. A hypothetical assignment or hypothetical positive Stone amount never satisfies the graph; only matched native positive-production evidence does.

| Sustainable Stone requirement                                 | P39 status  | Evidence                                                                                                                                                 |
| ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized material acquisition path                          | Provisional | P38 had a separate test-only Gather authorization; this does not authorize a production continuation.                                                    |
| Resource commitment compatible with competing native spending | Blocked     | P720 Housing purchase conflicts with the proposed Quarry reserve; there is no supported Construction owner contract.                                     |
| Current native Quarry offer and purchase authority            | Provisional | Current target and complete price were observed; independent Quarry purchase authority and next candidate were not.                                      |
| Sufficient housing/population                                 | Observed    | Four residents remain housed at 4/4 at p688; five residents are housed at 5/5 at p10000.                                                                 |
| Sustainable Jobs assignment                                   | Provisional | Conditional 3F/1Q and 4F/1Q candidates depend on a hypothetical unlocked row, an unobserved worker-commitment registry, and an authorized policy change. |
| Positive Stone production observed                            | Blocked     | P38 p10000 reports Quarry 0, Quarry Workers 0, and Stone production 0.                                                                                   |

The first missing operational capability is **Construction coordination**: the observed purchase conflicts with the proposed reserve. A reusable authorized Gather path, post-purchase Quarry/Job observations, Jobs-owner authorization, and positive Stone observation are additional unmet gates. Overall result: **B — Authority blocked**.

## 5. Cost, evidence reuse, and integrity

The replay script `p39-cross-owner-economic-coordination-exact.mjs` reads retained P37/P38 evidence only. It reuses the exact p688 Jobs snapshot, p720 Construction/Gather authority and action trace, p728 stock stop, and p10000 production/goal-graph observation. It performs no Chromium replay, new catalog draw, or native price probe. Its normalized pure-planning input is 36,363 bytes in the recorded run.

The offline coordinator benchmark warms up 500 times and measures 2,500 complete resource, four/five-resident Jobs, and dependency assessments with Node's imported `node:perf_hooks performance.now()`. For the 36,363-byte normalized input, the recorded p50 is 0.0215 ms and p95 is 0.0412 ms. These are planning-cost measurements only; they exclude file parsing, browser capture, and runtime integration. They do **not** establish the 2% end-to-end CPU requirement.

P38's test bridge virtualizes `window.performance.now()` as the virtual game-time counter `state.now`. It advances with simulated game time, not synchronous JavaScript execution. P38's added synchronous timers therefore record 0 ms around price probes, validation fences, and Jobs callbacks; those values are not elapsed-time evidence. The runner's separate host-side phase timing remains distinct. P39 uses Node's native monotonic clock for its offline measurement. No production clock was changed. P34 had already identified the same virtual-clock issue; neither P34 nor P39 claims the end-to-end CPU gate passes.

Additional real-runtime evidence would be needed for a generation-bound Construction reserve contract and same-cycle reservation/queue/claim view; the complete weighted candidate list, Housing `important` flag, exact conflict-gate result, and next purchase; native Quarry purchase/unlock and Jobs controls; same-cycle Food modifiers and worker commitments; and positive Stone output after a sustainable assignment. Existing work-cycle snapshots should be reused where current: the P38 p688 Jobs snapshot and p720 target/authority capture remain evidence for those historical cycles. They cannot substitute for new current-cycle owner, contract, unlock, assignment, or production observations.

Machine-readable output: [`p39-cross-owner-economic-coordination-evidence.json`](p39-cross-owner-economic-coordination-evidence.json). Reproduce it with [`p39-cross-owner-economic-coordination-exact.mjs`](p39-cross-owner-economic-coordination-exact.mjs).
