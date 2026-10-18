# P12D.1 — Advisory route correctness

Date: 2026-10-18  
Branch: `deadspace`  
Starting HEAD: `24bb2ff4379738ca37fca800c76abcdb325cf2e8`  
Pinned game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Baseline reproductions

The original module from the starting commit was loaded temporarily beside the working module and run against generic fixtures. The temporary files were removed after capture.

| Finding                             | Baseline observation                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — AND flattening                  | Terminal required `a`; `a-action` required both `b` and `c`; only `b-action` existed and was offered. The planner emitted `b-action → a-action → terminal` with `missingRequirements: []`. It represented the `b` branch as a complete route while dropping the unsupported `c` conjunct.                                                                                       |
| B — excluded fallback               | The only grant action connecting an offered `excluded` action to terminal had applicability `excluded: explicit exclusion`. The planner returned that offer with `strategicBenefit: provisional`, so excluded-only evidence still looked useful for progression.                                                                                                                |
| C — selection after truncation      | With a stock of 10 Knowledge, capacity 100, stable production, and a cost of 1, a one-action expansion budget set `truncated: true` but still selected `a-action` with estimated current affordability 0.                                                                                                                                                                       |
| D — order and retained route growth | With two OR grants and a one-action expansion budget, registry order `[a,b]` discovered `a`; reversed order discovered `b`. Each result retained one action-cache route, one requirement-cache route, and two route action references. The old work counters only exposed one visited action and two alternatives; cache results were incomplete and traversal-order dependent. |

## Corrected model

The advisory planner now builds a memoized dependency graph. Each action points to conjunctive prerequisite requirement IDs; each requirement stores its OR grant actions, current grant level, satisfaction state, and uncertainty reasons. Candidate witnesses identify the requirement they advance, its alternative grant actions, one deterministic path witness, and other unsatisfied requirements on that path. The witness does not enumerate combinations or describe an executable build order.

Current offers are retained as observations. Their relationship to the terminal is classified as `declared-contribution`, `conditional-contribution`, `excluded`, `unknown`, or `unrelated`. A complete exploration is required before an unconnected offer can be called unrelated. If the budget ends, unresolved offers remain unknown and excluded-only evidence is not promoted to a viable route. No strategic action is selected; current affordability stays attached to each offer as observational next-action evidence.

The `maxDependencyExpansions` unit is a hard total-operation cap covering registry indexing, action and requirement expansion, grant-alternative inspection, cycle-path processing, candidate discovery, affordability evidence, and witness construction. The planner stops before work that cannot fit and returns partial evidence with a specific truncation reason. The result separately reports operations, expansion counters, retained graph/witness/edge/reference counts, and the peak pending reachability queue. Requirement witness objects are shared across candidates instead of cloning each OR list. Candidate and depth limits also stop expansion with explicit reasons. Cache entries are graph nodes, not context-dependent partial path arrays.

A missing terminal definition now makes the plan `unavailable` and each observed offer `unknown`; it cannot produce a complete unrelated classification. Output construction itself consumes the same operation budget. When that budget ends, materialization stops and the result stays incomplete without a strategic selection.

## Stage 2F MAD characterization

The existing P12B read-only native capture and Stage 2F fixture were reused. No new native capture mechanism was added. The corrected capture completed without truncation and retained no strategic winner.

| Current offer    | Evidence                 | Requirement advanced         | Compact witness                                                                  | Other unsatisfied AND requirements on witness                                                             |
| ---------------- | ------------------------ | ---------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mad Science      | conditional contribution | `research:high_tech:1`       | MAD → ANFO → Oil Well → Industrialization → Electricity → Mad Science            | Cement 2, Explosives 2, High Tech 7, Science 2, Smelting 2, Steel Container 1, Uranium 1                  |
| Black Powder     | conditional contribution | `research:explosives:1`      | MAD → ANFO → Dynamite → Black Powder                                             | High Tech 7, Mining 4, Oil 1, Uranium 1                                                                   |
| Steel Containers | conditional contribution | `research:steel_container:1` | MAD → ANFO → Oil Well → Industrialization → Steel Containers                     | Cement 2, Container 1, Explosives 2, High Tech 2 and 7, Smelting 2, Uranium 1                             |
| Barns            | conditional contribution | `research:storage:3`         | MAD → ANFO → Oil Well → Industrialization → Alloy Containers → Warehouse → Barns | Alumina 1, Cement 2, Explosives 2, High Tech 2 and 7, Smelting 2, Steel Container 2, Storage 2, Uranium 1 |

The other nine current offers have `unknown` relationship evidence and no dependency witness path: Bessemer Process, Merchandising, Reinforced Crates, Rituals, Steel Beams, Steel Hoe, Steel Saw, Steel Vault, and Zealotry. The captured terminal graph contains unresolved native prerequisite declarations, so these offers cannot safely be called unrelated. Their current offers remain observable, but they are not progression candidates.

The advancing requirement witnesses retain their OR grant alternatives: High Tech 1 has 21 captured grant actions, Explosives 1 has 4, Steel Container 1 has 12, and Storage 3 has 6. Some recorded branches carry the explicit `native path excludes route standard` exclusion. Other branches still depend on unresolved route/native conditions and future offer membership, so the overall offer evidence remains conditional rather than excluded-only. The terminal native condition is also unvalidated. The remaining requirement lists include unsatisfied conjunctions along the compact witness path; they do not claim complete root-level execution plans. These are declared dependency contributions, not mandatory obligations or spending authority.

Black Powder is a meaningful declared contributor through the short path to the `explosives:1` requirement. Its earlier very long chain was not a useful candidate build order: it came from flattened AND/OR route enumeration. The corrected witness keeps its actual dependency relationship compact and shows High Tech, Mining 4, Oil, and Uranium still unsatisfied.

## Work and retained evidence

The complete corrected MAD search used a 65,536-operation cap and consumed 37,270 operations. It indexed 834 definitions, expanded 229 actions and 227 requirements, and retained 229 action witnesses and 254 requirement witnesses (including shared frozen output witnesses). It examined 5,954 grant alternatives, observed 1,160 cycle edges, and reused shared graph nodes 547 times. Candidate discovery visited 3,140 graph states and evaluated 13 current offers. The retained model contained 390 action-to-requirement references, 1,268 OR alternative references including output witnesses, 39 candidate-to-requirement references, 22 path-action references across 13 output candidates, and 229 reason references; total internal and output candidate witnesses numbered 26. The peak pending reachability queue was 640 states. Search and retained evidence stayed within the hard cap; `truncated` was false.

The small baseline order fixture also retained route counts directly: one action-cache route, one requirement-cache route, and two path action references at the one-action budget. Reversing definitions changed which OR alternative survived, confirming that the previous incomplete evidence depended on traversal order.

## Authority and replay parity

The strict mandatory-obligation classifier, ordinary Research policy, resource claims, and spending execution were not changed. The P12B/P12C prerequisite and obligation tests pass. The exact P12D fixture preserves baseline parity for exported saves, native control usage, ordered native invocations, and Research draw counts. Both baseline and candidate made zero native Research purchases and 30 ordinary `research-catalog` draws; the separately forced diagnostic capture remains accounted for separately from ordinary calls.

The model still cannot rank terminal completion time. It has no validated full future offer/eligibility model or terminal-time effects for comparing these candidates. Current-price affordability estimates, when supplied, describe the next purchase only. The result therefore keeps `selectedActionId` undefined.

## Verification

- `node tests/domain/progression/research-advisory-routes-test.mjs` — passed.
- `npm run build` — passed.
- `npm run check` — passed (349 test files plus bundle syntax; all five checks).
- `node tools/chromium-evolve-runner-test.mjs` — passed.
- `node experiments/p12a-mad-frontier-exact.mjs --out=test-artifacts/benchmark/tmp/p12d1-p12a-report.json` — passed.
- `node experiments/p12b-native-prerequisite-capture.mjs --out=test-artifacts/benchmark/tmp/p12d1-p12bc-report.json` — passed P12B/P12C prerequisite, terminal-eligibility, and obligation replay assertions.
- `node experiments/p12d-adaptive-progression-routes.mjs --out=test-artifacts/benchmark/tmp/p12d1-report.json` — passed; exact Stage 2F capture, bounded witness characterization, and production parity assertions passed.
- `git diff --check` — passed.

No push was performed. The work is committed on the existing `deadspace` checkout; the implementation is ready for independent review.
