# P12E — Resource-aware progression bottleneck planning

Date: 2026-10-18
Branch: `deadspace`
Starting HEAD: `6b7e6a1fd3279ea0c356983dfd808ce66f6093f`
Pinned game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**A — Useful resource-aware progression evidence.** The Stage 2F fixture identifies the observed
Mana shortfall for Mad Science and Black Powder, and Steel shortfalls for Steel Containers and
Barns. These are current-action affordability constraints only. Each contributor remains a
conditional advisory witness, no action is selected, and no economic change is authorized. The
fixture has no supported marginal intervention inputs, so live intervention comparisons are
unavailable.

## Authority and projection

The diagnostic reuses P12D.1's advisory witnesses and P12B's independent read-only Stage 2F
capture. Current prices come from the captured native Research offers. Holdings, capacity, and
`resource.diff` come through `createCapturedResourceSource()` and the existing
`readCapturedResourceView()` pool semantics. The capture still checks root identity, root
generation, progression epoch, and offer binding generations after the sample. No second native
resource reader or price calculator was added.

| Current contributor | Exact requirement advanced   | Current native price                                                 | Observed holding / capacity / net rate for limiting resource | Native affordability          |
| ------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Mad Science         | `research:high_tech:1`       | Money 10,000; Mana 50; Knowledge 6,750; Crystal 1,000; Aluminium 750 | Mana: 0.85 / 4,200 / 0 per second                            | Unaffordable; Mana shortfall  |
| Black Powder        | `research:explosives:1`      | Knowledge 4,500; Mana 100; Crystal 250; Coal 300                     | Mana: 0.85 / 4,200 / 0 per second                            | Unaffordable; Mana shortfall  |
| Steel Containers    | `research:steel_container:1` | Knowledge 9,000; Steel 250                                           | Steel: 10 / 23,477 / 0 per second                            | Unaffordable; Steel shortfall |
| Barns               | `research:storage:3`         | Knowledge 15,750; Aluminium 3,000; Steel 3,000                       | Steel: 10 / 23,477 / 0 per second                            | Unaffordable; Steel shortfall |

All listed cost resources for these four offers had observed holdings, capacities, and rates. Their
capacities can hold the current prices; none of these four is capacity-blocked. Other priced
resources have enough observed stock for their current offer. Each native offer reported
`nativeAffordable: false`. The listed zero rates are single captured samples, not stable forecasts.
The feasibility evaluator therefore provides no validated ETA; with the observed nonpositive
rates and incomplete commitments it does not provide a diagnostic ETA either.

No known commitment rows were available, and cross-owner spending coverage is incomplete. The
projection preserves that as `unknownExternalCommitments`; it does not interpret an empty known
commitment list as zero reservations. Consequently, per-resource affordability after commitments
is unknown and the overall projection is partial. There are no missing resource measurements for
the four candidate prices. Independently mandatory goal needs are not established: the strict MAD
obligation evidence is unavailable/incomplete and has no mandatory action IDs in this fixture.

P12D.1 evidence remains attached. In addition to the exact requirement advanced, each candidate
retains the other unsatisfied conjunctive requirements and the OR grant alternatives. The saved
capture has 21 High Tech 1 alternatives, 4 Explosives 1 alternatives, 12 Steel Container 1
alternatives, and 6 Storage 3 alternatives. Alternative prices are exposed per currently offered
branch where observed; unoffered future prices remain unavailable. Costs are not summed across OR
branches, nor reserved for plausible routes. Excluded branches and conditional future eligibility
remain explicit. The downstream dependency chains do not have complete current native prices, so
no downstream resource total or terminal completion time is claimed.

Among directly comparable current-price vectors, Steel Containers is component-cheaper than Barns
across Knowledge, Steel, and Aluminium. This is a price-only comparison; their separate dependency
evidence is preserved and no route winner follows from it. Other candidates trade off resources or
lack comparable evidence. `selectedActionId` remains undefined.

## Economic interventions

The Stage 2F capture contains no intervention whose native acquisition cost, preconditions,
complete marginal effects, and affected resource scope are all observed. Thus all four live
intervention comparisons are explicitly unavailable. No producer delta was inferred from a
building name and no live intervention was fabricated.

Generic tests exercise the existing `compareGoalStrategies()` contract with an established
production effect and stable rate, including acquisition cost, rate/capacity changes, and
opportunity costs through the shared feasibility model. Incomplete or missing effects, stale
epochs, missing resources, and unobserved resource scope produce unavailable comparison evidence.
Observed-rate and unknown-commitment cases remain provisional and cannot establish a validated
improvement. Current-action time-to-afford evidence is never presented as terminal MAD completion
time.

## Bounded work and execution frequency

The planner completed without truncation under its 65,536-operation cap. The resource-aware
current-offer checks raised total abstract operations from P12D.1's 37,270 to 37,419. It indexed
834 definitions, expanded 229 actions and 227 requirements, inspected 5,954 grant alternatives,
evaluated 13 current offers, and retained a peak pending-walk queue of 640 states. The candidate
walk now advances a queue head index instead of shifting the remaining array on each visit.

Bounded timing used one warm-up plus five repeats on the same captured fixture for each pure phase.
The resource observation probe used five batches of 64 calls through the same captured resource
source. Its runner wall time includes the browser evaluation boundary and is an upper-bound probe,
not isolated page CPU time. The fixture's in-page timer did not provide a usable duration for one
resource read, so no zero-cost claim is made.

| Phase                                                       |     Repeated median |     Repeated maximum | Measurement notes                                                                                  |
| ----------------------------------------------------------- | ------------------: | -------------------: | -------------------------------------------------------------------------------------------------- |
| Protected native catalog capture plus first resource sample |             73.0 ms |          one capture | External exact-runner wall time; includes the protected fresh Research capture and runner boundary |
| Resource observation                                        | 7.1 ms per 64 reads | 11.1 ms per 64 reads | Five external batches; includes runner boundary                                                    |
| Dependency graph construction                               |             0.52 ms |              0.76 ms | Five pure repeats                                                                                  |
| Advisory traversal and witness materialization              |             4.06 ms |              6.25 ms | Five pure repeats; includes affordability evidence                                                 |
| Economic projection and comparisons                         |             0.29 ms |              0.33 ms | Five pure repeats                                                                                  |

These bounded costs support recomputation when relevant authority changes, rather than on every
worktick. The safe invalidation boundary is the current root/progression, offer identity and
generation/price, resource sample (holdings, capacity, observed rate), commitment coverage, and
intervention evidence epoch. The planner remains unscheduled in ordinary production. No persistent
continuation or speculative cross-cycle cache was introduced.

## Exact-runner parity and verification

The pinned save and settings hashes are `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`
and `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`; seed 42, epoch
`2026-09-21T00:00:00.000Z`, and 200 periods match the existing fixture. Baseline and candidate
exported saves matched at
`9b4a3e7364571db6c6fc858e743ee3610dde162a921132641f1d17c155e7ec67`. Native control usage,
ordered invocations, and Research draw counts matched. Both arms made zero Research action calls
and 30 ordinary `research-catalog` draws. The separately forced diagnostic capture also preserved
the P12A state hash, controls, and native invocation sequence.

- `node tests/domain/progression/advisory-resource-projection-test.mjs` — passed.
- `node tests/domain/progression/research-advisory-routes-test.mjs` — passed.
- `npm run build` — passed.
- `npm run check` — passed (350 test files plus bundle syntax).
- `node tools/chromium-evolve-runner-test.mjs` — passed.
- P12A exact MAD replay — passed.
- P12B independent prerequisite capture and P12C prerequisite/eligibility/obligation characterization — passed.
- P12D adaptive-route replay and P12D.1 witness characterization — passed.
- `git diff --check` — passed.

The implementation remains read-only and shadow-only. Research, Gather, Construction, Jobs,
Factory, reservations, and ordinary production decisions are unchanged. No production scheduling,
autonomous spending, or production change is enabled.
