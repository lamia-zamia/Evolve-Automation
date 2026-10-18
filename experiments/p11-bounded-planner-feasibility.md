# P11 — Bounded autonomous-allocation planner feasibility

Date: 2026-10-18 | Branch: `deadspace` | Base: `794d01dd15a1ba1bb5cf98a3b395057ee8411256`

Game snapshot: DeadSpace `db38e2af831907d49aeb5348d678d8d8745d6c3f` | Ordinary userscript SHA-256: `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7`

## Scope and representative decision

The P10 proposal calls for a pure planner over an immutable sample, but does not specify what autonomous allocation should optimize, how much to allocate, how to combine competing feature intents, or which reservations are hard. The existing Construction model is the closest bounded upstream decision: rank city-building candidates by captured `weighting`, then choose the highest-weighted non-ignored candidate whose captured native cost fits resource availability and reservations.

P11 models one candidate choice with quantity one. It uses the actual candidate keys, weights, cost vectors, ignore flags, and payment pools captured from the late and mid Construction setup. It tests the three most frequent cost-resource scopes in each fixture. The resource quantity is set to the captured costs' 75th percentile, capacity to 1.1 times that quantity, and hard reserve to 20% of quantity. These are controlled test values; P10 did not capture authoritative per-tick holdings or reservation totals. This is a representative Construction gate, not an invented production allocation policy. The broader autonomous allocation objective remains unspecified.

The search evaluates every candidate once, in the sampled stable order, and keeps the feasible candidate with greatest weight. Equal weights keep the earlier candidate. An evaluation checks each of the selected resource scopes against `quantity - reserved`. Complexity is O(C × R): 71 × 3 checks late and 24 × 3 mid. One complete candidate check is one budget operation.

## Pure planner and snapshot contract

`experiments/p11-bounded-planner.mjs` contains the test-only algorithm. The synchronous oracle and incremental driver share the same candidate evaluator and ordering. The continuation stores only the next candidate index, best feasible result, evaluation count, and validity token. An incomplete result has no plan. The continuation advances by `min(budget, candidates remaining)` evaluations, so it consumes the full budget whenever work remains and never repeats an evaluated candidate.

The budget counts candidate checks. Token construction and upstream sampling are separate work and are not charged to that counter; production must bound or account for capture separately.

At the boundary, candidate rows and resource scopes are copied recursively and frozen. The validity token covers the planning dependencies plus all candidate and resource values. It names root, settings, control generation, offers, resource quantity/capacity, reservations, native prices, and the last native action boundary. Any missing authority yields no token. Changes to an unrelated UI counter do not change it. The test suite covers each named dependency, candidate prices, resource quantity/capacity, reservations, partial action authority, incomplete reads, and stale publication.

This contract is fully testable in the pure core, but the exact game trace only provides candidate rows and the existing demand invalidation hooks. It does not expose a complete cross-worktick root/settings/control/offer/resource/reservation token. The demand epoch is not used as that token; P10 showed it resets at every ordinary worktick. Routine cycle transitions are excluded from the mutation count. Candidate row or price changes and non-routine P10 invalidations restart the model. Because several required authorities are absent from the trace, an unchanged candidate row is not proof that the whole game input remained valid.

## Exact-runner replay

The P10 lifecycle probe was rerun with a test-only extra candidate-row capture. It reused the frozen game snapshot, seed 42, `autoPrestige=false`, 600 warmup periods, 1,000 measured periods, and 125 observed workticks per fixture. The probe bundle and the ordinary bundle produced identical game exports, automation control usage, and ordered native action invocations. The experimental planner only compares proposed one-choice results; it issues no game command.

| Fixture | Captured candidates | Non-routine demand invalidations | Candidate/price snapshots changed |
| ------- | ------------------: | -------------------------------: | --------------------------------: |
| Late    |     71 per worktick |                                2 |                                 2 |
| Mid     |     24 per worktick |                               23 |                                17 |

The event-level replay restarts on non-routine invalidation or a changed candidate/price row set. It compares every completed plan to the synchronous oracle on that same captured candidate snapshot. Results:

| Fixture | Budget | Evaluations / slices to finish | Completed | Restarted | Planning workticks max / mean | Workticks without valid result | Mean slice ms* |
| ------- | -----: | -----------------------------: | --------: | --------: | ----------------------------: | -----------------------------: | -------------: |
| Late    |     16 |                         71 / 5 |         3 |         4 |                      5 / 2.43 |                             14 |          0.380 |
| Late    |     64 |                         71 / 2 |         3 |         4 |                      2 / 1.14 |                              5 |          0.289 |
| Late    |    256 |                         71 / 1 |         5 |         4 |                      1 / 0.56 |                              0 |          0.329 |
| Mid     |     16 |                         24 / 2 |        16 |        35 |                      2 / 1.02 |                             36 |          0.103 |
| Mid     |     64 |                         24 / 1 |        36 |        35 |                      1 / 0.51 |                              0 |          0.107 |
| Mid     |    256 |                         24 / 1 |        36 |        35 |                      1 / 0.51 |                              0 |          0.102 |

Every published plan was valid under the model's observed token and matched the oracle exactly, including candidate choice, quantity, cost, resource checks, tie order, and completion classification. Total work per fixture/budget run ranged from 245 to 864 candidate evaluations. At budget 16, late plans needed up to five workticks and mid plans up to two; 14 late and 36 mid workticks had no valid result. At budget 64, 3 late and 36 mid plans completed, with five late workticks lacking a result. At budget 256, all 5 late and 36 mid reported plan episodes completed in one slice, with no workticks lacking a result. Non-routine invalidations grouped to 2 late and 20 mid workticks; mid had 23 events (20 mutation/authority and 3 settings) across those 20 workticks. Candidate/price rows changed on 2 late and 17 mid workticks. _Slice time was measured by the Node-side replay over recorded snapshots and is diagnostic only, not an end-to-end CPU acceptance result._

These are observed event and candidate-row counts, not the total invalidation frequency of allocation inputs. The trace does not emit complete per-tick root, control-generation, offer, resource quantity/capacity, reservation, or native action-boundary samples; resource quantities, capacities, and reserves in the representative model are controlled test values. Therefore the replay cannot establish how often the full immutable input would invalidate, and the apparent mid/late rates are partial. Root replacement, settings changes, control-generation replacement, offer changes, capacity changes, reservation changes, and partial native actions are covered by deterministic token/property tests, but the P10 replay does not emit all of those authorities as complete per-tick samples. No whole-game continuation-safety claim follows from this replay.

## Oracle, properties, and production isolation

The focused property suite runs candidate sets of 24 and 71 at budgets 1, 16, 64, and 256. It checks exact budget stops, no repeated evaluations, stable order and tie behavior, reservation/capacity constraints, changed dependency tokens, incomplete authority, unrelated changes, and stale-plan rejection. Completed incremental results equal the synchronous result exactly.

P10's traced-versus-ordinary exact replay confirms byte-identical exports and identical control usage and native invocation order. The P11 planner calls no native controls, and the production userscript remains byte-identical to the pinned SHA-256 above. No autonomous allocation command is executed; Build, Storage, and Research behavior remains the characterized baseline.

## Outcome

**B — Use bounded, stateless per-tick planning.**

For this representative Construction workload, use a stateless per-tick cap of 256 candidate evaluations: it completed all sampled plan episodes in one slice for both fixtures, while lower budgets left late or mid workticks without a valid plan. The P10 replay provides insufficient authority samples to prove a safe cross-worktick validity window, and its partial event counts cannot establish the total real invalidation frequency. This is a scoped feasibility choice, not evidence that the whole autonomous allocator is fully specified or that the total invalidation rate has been measured. Before production integration, capture complete authorities each tick and define the allocation objective, quantities, and reservation semantics. Any future integration should remain disabled by default; incomplete reads, partial actions, or stale sample evidence must produce no command. Do not carry planner state across workticks.
