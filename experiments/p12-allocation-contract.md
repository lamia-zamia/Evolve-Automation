# P12 — Autonomous allocation contract review

Date: 2026-10-18 | Branch: `deadspace` | Starting HEAD: `cf4a5cffba1523b2dafd085b18f854af8f4e2e1a`

## Outcome

No production allocation slice was implemented. The current specification does not provide the
authority needed to add a distinct goal-directed resource commitment to Construction without
inventing a selection or reservation rule. This is a policy and observation blocker, not a planner
performance question. P11's bounded candidate result does not resolve it: P11 measured candidate
evaluation only, using controlled holdings and reserves, and did not capture complete per-tick
resource or reservation authority.

## Existing behavior and authority

Construction already arbitrates native-priced queued Research and Build commitments, the current
Construction saving target, and script-owned reservations. `createCapturedCostConflictReader`
assembles those commitments and current resource holdings; `findCostConflict` and
`planBuildConflict` decide whether a candidate would spend below them. The reservation behavior is
already on the normal Construction path when its existing policy allows it. Adding an opt-in that
repeats this gate would have no distinct behavioral effect.

The executor is suitable for a bounded slice once a policy exists. `runBuildCycle` samples each
candidate and conflict before execution. The captured Build adapter rechecks native control and
candidate authority and verifies the native postcondition; uncertain or rejected attempts stop or
reconcile the cycle. This existing boundary can be reused without introducing another command path.

## Specific blockers

1. **No production authority selects a goal claim from the current frontier.** The MAD prerequisite
   and offer observations can expose multiple verified frontier actions. The saved Stage 3F result
   specifically leaves `tech-black_powder` and `tech-mad_science` as competing Mana-blocked
   candidates and marks selection ambiguous. A stable key tie-break would make execution
   deterministic, but would invent which prerequisite should receive priority.
2. **Current reservation observations are not a complete shared commitment inventory.** Build,
   Research queues, the current saving target, and selected script-owned commitments are captured,
   but the documented coverage table leaves other native and manual spenders unobserved. Treating
   those commitments as zero would violate the fail-closed contract. A reservation protecting only
   Build could also be consumed by a later unconverted spender in the same worktick.
3. **The existing goal resource-intent contract is observational.** It describes production needs
   for mandatory prerequisites, but does not admit spendable claims or authorize an executor. The
   shared budget and Research authorization contracts are not wired into Construction as production
   claim enforcement. Turning these models into authority requires a defined admission rule and
   complete affected-pool observations.

## Requirement status and next decision

The requested shared resource-spending arbitration is **not implemented**. Existing Construction
commitment checks remain unchanged. No setting, claim, or command path was added, so there is no
enabled behavior to characterize and no implementation verification run is claimed.

To resume, the specification must provide (a) how a current goal frontier selects among competing
mandatory or alternative actions, and (b) which spending owners must be sampled before a commitment
can be considered complete for the selected resource pool. Once those are fixed, the smallest useful
slice can admit one current native-priced frontier obligation, reserve it against a single existing
executor, and fail closed whenever the chosen evidence is incomplete. It should retain the default-off
opt-in, native command path, postcondition verification, and same-worktick invalidation requirements.
