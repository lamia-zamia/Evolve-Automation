# P12F — Live economic intervention authority

Date: 2026-10-18  
Branch: deadspace  
Starting HEAD: 21bf1fbadff1bf5ac8c22f20a7677e0b6f6d0f46  
Pinned game: pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f

## Decision

**B — Marginal authority incomplete.** The existing Stage 2F fixture has real Steel and Mana bottlenecks, and the repository has a native Steel Smelter owner. In this exact current snapshot, however, the captured Smelter input is uninitialized, its iSmelter control is unavailable, and autoSmelter is explicitly disabled. The capture therefore cannot establish a current Smelter intervention. The existing Gather and Alchemy readers consume Mana or use it as an input; they do not provide a supported Mana acquisition intervention for these requirements.

The live compareGoalStrategies() call compares waiting with the unavailable Steel Smelter candidate for the current Steel Containers price. Waiting remains provisional and has no ETA; the candidate is unavailable; no winner is returned. The 240-Steel shortfall is current-action evidence only, not time to terminal MAD completion. No live economic improvement is claimed.

## P12E authority corrections

classifyMandatoryNativeResearchObligations() returns verified or unavailable. P12B now maps verified to complete evidence only when the obligation authority still matches the current graph snapshot, target action, root generation, progression epoch, and full current offer-generation set. A stale verified result stays partial; unavailable evidence stays unavailable.

Resource display values now require the input validityEpoch. Stale holdings, capacity, and rates are omitted from current display values and explicitly report stale observation authority. Commitment totals use the same (resourceId, poolId) key as feasibility. Displayed shortfalls are read from evaluateGoalFeasibility() so they agree with its per-resource result. Known commitment rows remain visible when cross-owner coverage is incomplete, and that incomplete coverage remains a separate unknown status.

Focused regressions cover current and stale verified authority, unavailable obligations, mismatched pools, stale and mixed-freshness resource samples, incomplete external commitments, and displayed/shared shortfall agreement.

## Live Stage 2F characterization

The exact save, settings, seed, epoch, horizon, and pinned game match P12E. Save SHA-256 is b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e; settings SHA-256 is fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131; seed 42, epoch 2026-09-21T00:00:00.000Z, 200 periods.

| Current candidate                        | Native offer                                | Limiting resource sample                         | Shared feasibility                                                                       |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Steel Containers (tech-steel_containers) | Knowledge 9,000; Steel 250                  | Steel 10 / 23,477 capacity / 0 observed net rate | Steel available stock 10; shortfall 240; zero-rate status uncertain                      |
| Mad Science (tech-mad_science)           | Mana 50 plus its other current offer costs  | Mana 0.85 / 4,200 capacity / 0 observed net rate | Current P12E capture reports a Mana shortfall; zero-rate sample is not a stable forecast |
| Black Powder (tech-black_powder)         | Mana 100 plus its other current offer costs | Same Mana sample                                 | Current P12E capture reports a Mana shortfall; zero-rate sample is not a stable forecast |

The current Steel offer and resource observation are bound to the same offer/root epoch. Steel capacity is sufficient for this price. Spending-owner coverage is incomplete, so the known empty commitment list is not interpreted as zero external reservations. The current wait evaluation is uncertain/provisional and has no completion time. The observed zero rate is a single sample.

## Intervention evidence and limits

The selected candidate class was the existing captured Steel Smelter owner. Its production planner is source-backed by planSmelter() and its runtime reader by createCapturedSmelterAutomation.readPlanForDiagnostics(). The exact P12B read-only capture found:

- autoSmelter: disabled in the current settings.
- Captured Smelter input: initialised: false.
- Native iSmelter control: unavailable; no control methods.
- Current producer assignment, fuel state, and current input constraints: unavailable.
- Native acquisition/reassignment costs: not captured.
- Current per-action Steel marginal and collateral effects: not captured.
- Result observation that isolates that marginal without applying a production reassignment: unavailable.

Stage 3S and the later Stage 3Q–3T reports show the Smelter can allocate Steel in other enabled or later-period contexts. Those runs do not establish a current effect for this P12E snapshot. Their trajectories include native Build demand and other changing production, so their stock differences are not reused as a marginal here.

The Mana alternatives do not close the gap. The captured Gather adapter reads Mana to price conjured gather actions, and captured Alchemy uses Mana income while transmuting other resources. Stage 3F captures Research Mana claims; it does not establish a Mana-producing intervention. No current captured production/staffing observation provides the required input, permission, acquisition cost, complete collateral effects, and isolated result for either bottleneck.

Accordingly, the candidate passed to the shared comparison has unknown acquisition costs and production effects, a false current precondition, and explicit unavailability reasons. Unknown costs are represented as unknown rather than an empty/free cost list. No production input was changed, no Smelter control was invoked, and no claim or reservation was created.

## Comparison and dynamic adaptation

The exact live comparison asks about the current Steel Containers price only:

- **Wait:** uncertain/provisional because Steel has a zero single-sample rate and external commitments are unknown; no ETA.
- **Captured Smelter Steel demand:** unavailable because permission is disabled, the producer/control are absent, and costs/effects/result authority are missing.
- **Winner:** none.

Synthetic contract regressions exercise the shared comparison with changing current observations. They verify:

| Counterfactual                                  | Expected response                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Requirement already plentiful                   | Waiting wins the tie; no production intervention is preferred                  |
| Resource scarce                                 | A validated positive marginal can reduce projected completion time             |
| Production is zero                              | Waiting is infeasible; the validated positive marginal can restore feasibility |
| Production changes                              | The projected time follows the changed rate                                    |
| Required acquisition input is unobserved        | Intervention comparison is unavailable                                         |
| Acquisition cost is large                       | Waiting wins when acquisition makes the route slower                           |
| Capacity is below the requirement               | No winner is forced without a supported capacity change                        |
| Another owner commits the resource              | Shared feasibility includes the same-pool commitment                           |
| External commitments are incomplete             | Result stays partial and has no validated winner                               |
| Permission is revoked or selected route changes | The old intervention is unavailable for the current candidate                  |

These synthetic cases test adaptation of the generic evaluator; they do not upgrade live Stage 2F marginal authority.

## Bounded work and invalidation

The P12F runner reuses P12B's current catalog/resource observation and makes one additional read through the existing captured Smelter diagnostic reader. It evaluates one current candidate and performs no full-catalog scan per worktick. The expensive advisory graph remains outside ordinary production scheduling.

| Phase                                                 |                                                         Measurement |
| ----------------------------------------------------- | ------------------------------------------------------------------: |
| Reused protected native catalog plus resource capture |                                            75.7 ms runner wall time |
| Reused resource reader                                | 6.4 ms median per 64 reads (five batches; runner boundary included) |
| Newly required captured Smelter diagnostic read       |                                            12.4 ms runner wall time |
| Marginal-effect acquisition                           |                                          Unavailable; 0 ms acquired |
| Pure wait/intervention comparison                     |      0.062 ms median, 0.121 ms maximum (five repeats after warm-up) |
| Total candidate evaluation                            |                         One candidate; no marginal effects acquired |

The safe recomputation boundary is a current root/progression epoch, current offer identity/generation/price, resource holdings/capacity/rate sample, external commitment coverage, player permission, Smelter input and native control binding, plus any independently observed marginal-effect epoch. Invalidate on any change to those inputs. No continuation or persistent cross-cycle cache is introduced.

## Parity and verification

The exact P12B baseline/candidate replay retained equal exported saves, native control usage, ordered native invocations, and Research draw counts. Both arms made zero Research action invocations. P12F itself only read captured inputs and called the pure comparison; it invoked no Smelter control and created no reservation or shared spending claim.

Verification passed:

- Focused projection, obligation, and feasibility tests.
- npm run build.
- npm run check (all five checks; 350 test files plus bundle syntax).
- node tools/chromium-evolve-runner-test.mjs.
- P12A exact MAD replay.
- P12B native capture, including the P12C prerequisite and eligibility authority.
- P12D adaptive route replay, also the P12E resource-aware characterization path.
- node experiments/p12f-live-economic-intervention.mjs.
- git diff --check.

The advisory Research candidates remain separate from mandatory spending authority. No automatic Research purchase, production reassignment, reservation, or shared spending claim was added.
