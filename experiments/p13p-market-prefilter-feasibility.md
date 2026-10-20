# P13P — Market prefilter feasibility

## Decision: stop without implementation

The conservative pre-graph gate was not selective on the P13N no-signal window. In a shadow replay of the same 1,000-period p9000 save window, all 125 calls returned `unknown`; none returned `definitely-none`. The first offered Research cost entry requiring Market evaluation was Knowledge or Mana, for which the current Market capture had no matching resource observation. The request requires missing Market inputs to remain `unknown`, so treating those resources as untradeable would be an unsupported inference.

This fails the required selectivity gate: 0 of 125 recurring full-selector evaluations would be avoided (0%). The investigation stops here. No prefilter was integrated, no selector or native behavior changed, and no implementation or test changes are included in this slice. P13O’s less-than-2% renderer CPU gate remains unresolved.

## Starting point and hashes

| Input                                                   | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Branch / actual starting HEAD                           | `deadspace` / `e82e34ee520410bdfb1be614cb783e84c53d326f`           |
| Pinned upstream                                         | `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`      |
| Game snapshot `test-artifacts/game/evolve-deadspace.js` | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` |
| Chromium runner artifact                                | `dddb85b6306907904512a31dc4e9a96da82b26178b9e5bf9f9e683a6bc00ffc8` |
| P13N p9000 save                                         | `8ef0c4b8c4d4259e40c86e505d89b3e149b09789543d6a1ecae50b2de64b2000` |
| Settings                                                | `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2` |
| P13N evidence JSON                                      | `a4052a486c499355e99237f80d9d658d7ce7bac99541e7f969f6251b5dbf5ed0` |
| P13O evidence JSON                                      | `ce6577ca2ce71812ac3ac10685baf71013c0a516b6128908128fb87f754087f1` |

The worktree already contained the P13O measurement-boundary edits in `experiments/stage4a-goal-aware-acquisition.mjs` and its P13O report/evidence as uncommitted changes before this investigation. Those changes were preserved. Starting source hashes were:

| Source                                                         | SHA-256                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `experiments/stage4a-goal-aware-acquisition.ts`                | `78d7f4491b4a49e6fc65f27cd142555f4480de9085ebd4339af307a397f76248` |
| P13O worktree `experiments/stage4a-goal-aware-acquisition.mjs` | `2fbd1f8fa56823cd56e0dc4afde33f53c18a00e3559ab32b2049e86adb93ba22` |
| `src/bootstrap/captured-runtime-control.ts`                    | `0e107ef96e75012dc4d8e9cce3a3822e96dc70c268b28eeaecf6b0773da25894` |
| `src/adapters/evolve/economy/market/captured-trade-routes.ts`  | `da1534354a891126b457f41240bd2111749880f20b08e716c9217f4c9f24331a` |
| `src/domain/economy/market/trade-routes.ts`                    | `f39ff471f976e8b08fa7dd7ed5a5f1d1e49571369bc633ce3a29a653d1e0d33a` |

The shadow replay’s generated test bundle, including a temporary pure-gate prototype and shadow-only counter, was SHA-256 `6f0b242b88a12ec97ecd2da868501028d2957fc176656607c3ccc508560f6604`. It used the P13N save, settings, game snapshot, runner, seed 42, and epoch `2026-09-21T00:00:00.000Z`. The prototype and shadow instrumentation were removed after the stop condition was met.

Machine-readable counts and input lineage are in [p13p-market-prefilter-feasibility-evidence.json](p13p-market-prefilter-feasibility-evidence.json), SHA-256 `2469d8fecfeab930ebb37ec6cd30d3b1df147ce995335b7044218fd77dc42d2f`. It also records the hash of the retained local raw shadow output and the synthetic classification cases.

## Decision semantics and available evidence

`evaluateGoalAwareAcquisition()` can produce a new import-demand signal only after all of these checks succeed:

1. A current shared-cycle or protected-fresh Research catalog is present, Research permission is enabled, triggers are not taking the owner role, and the selected prestige names exactly one goal definition.
2. The definitions normalize fully. `planNativeResearchPrerequisites()` constructs the prerequisite graph from definitions, grants, current offers and generations, root/progression identity, and applicability.
3. Candidate evaluation retains a fresh current offer with verified or conditional prerequisite relevance, a non-excluded path, and either frontier or eligible/conditional applicability. The top transparent rank must identify exactly one candidate.
4. Current native cost and resource holding/capacity evidence must identify a shortfall. Incomplete samples do not signal.
5. Exactly one selected-candidate shortfall must be Market-importable: the current Market observation and route row exist; imports and auto-buy are enabled; the route is unlocked; the Research price fits current capacity; native import quote and volume are positive; and the matching current control generation exposes `autoBuy`.
6. The resource must not already be demanded and the current requested quantity must be below the native Research price.

`already-demanded` reports an existing demand and is not a new signal. `candidate-not-marketable` can still have a valid selected candidate and known shortfall; it may mean the resource cannot currently be imported. It says nothing about whether a hypothetical demand would change the Market route plan. The later Market planner and its demand-aware policy decide that separately.

The Research catalog capture already reads the current offers, native offer costs, definitions, grants, applicability, resource samples, control generations, root/progression identity, and owner settings. The Market callback receives the current route input and a capture with root/board/owner state, resource stock/capacity, import enablement, native quote and volume, demand, control IDs/generations, and methods. A prefilter could use those synchronous inputs without new native reads or controls. It must scan every offered action because goal relevance and rank are graph-derived; skipping an offer based on an uncomputed goal relationship would be unsafe.

## Selectivity probe

The probe evaluated a temporary pure necessary-condition helper in shadow mode. It inspected every current Market resource observation up to the first incomplete offer-cost/Market join. Any missing or contradictory evidence returned `unknown`; it did not affect selector decisions.

| P13N p9000–p10000 J window                           |                    Count |
| ---------------------------------------------------- | -----------------------: |
| Selector / gate calls                                |                      125 |
| `definitely-none`                                    |                        0 |
| `possible`                                           |                        0 |
| `unknown`                                            |                      125 |
| Unknown due missing Market observation for Knowledge |                        4 |
| Unknown due missing Market observation for Mana      |                      121 |
| Cost entries examined before unknown                 |    125 total, 1 per call |
| Market resource observations examined                | 1,750 total, 14 per call |
| Full graph evaluations avoided                       |                        0 |
| Candidate evaluator calls avoided                    |                        0 |
| Full-selector signals suppressed                     |                        0 |

The original selector returned 124 `candidate-not-marketable` decisions and one `candidate-affordable` decision in this window. It proposed and accepted zero signals. The shadow call therefore had zero false negatives in this window, but also zero reductions. Because the gate returned `unknown`, no cost or permission was inferred from missing rows.

The helper prototype was also exercised against six synthetic cases: one under-stocked, importable combination returned `possible`; stock-covered and route-locked combinations returned `definitely-none`; missing control evidence, contradictory Research/Market stock, and malformed price each returned `unknown`. These validate the basic classification branches only; they are not full-selector differential coverage.

The shadow replay preserved the zero-signal result and reported 422 applied route operations and final export SHA-256 `44b3417fe3db8b81c4d55e0899f6bc50e72098dea62e7ecb919ee7535cf0e622`, matching the P13N no-signal result. Since no skip occurred, this is a shadow instrumentation check, not gated-J differential verification.

### Validation-heavy evidence and stop scope

The existing Stage 4F.3 evidence records 122 accepted signals in the p8000–p9000 validation-heavy window (123 across its full run). The existing report and result are historical inputs from their recorded Stage 4F source/bundle; they do not retain each callback’s raw current-cycle Research and Market capture. The P13N selectivity stop fired first, so no validation-heavy replay or gate classification was run. No claims are made about signal preservation in that window or about the requested same-cycle mutation differential cases.

## Work attribution and recommendation

Each shadow invocation visited 14 Market resource records and one cost entry before it had to return `unknown`. That is 1,875 added record checks across the 125-call window. The full selector still constructed and evaluated the graph on all 125 calls; the gate avoided zero graph constructions and zero candidate evaluator calls. The Market-resource scan also duplicates work that the selector later performs to build its resource lookup. These are deterministic counts; no CPU percentage or end-to-end performance verdict is claimed.

Do not implement this prefilter in the current capture contract. A change that classified absent Market rows as definitely untradeable would violate the explicit unknown-evidence rule. Making it selective would require a captured, authoritative negative fact for those rows or a different prefilter that proves absence without relying on missing Market data. That is outside this slice. No cross-cycle caching, weaker owner authority, native reads, or speculative optimization was introduced.

Focused prototype contract tests passed and `npm run build` passed before the prototype was removed. After the report and evidence files were complete, `npm run check` passed all five checks, including typecheck, architecture, lint, formatting, and 359 test files; `git diff --check` was clean. No implementation tests remain in the worktree. The less-than-2% renderer CPU gate remains unresolved, consistent with P13O.

Stop here for independent review.
