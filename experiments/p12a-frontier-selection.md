# P12A adaptive MAD frontier selection — 2026-10-18

## Decision

P12A adds a pure, shadow-only comparison for verified mandatory Research frontier actions. It ranks by the native price and current resource stock/rate feasibility contract, which supplies a current wait-to-actionable estimate when supported. A one-sample rate, unobserved commitments, or a missing downstream completion estimate keeps the result provisional or blocked. It never authorizes spending.

The status vocabulary distinguishes a supported best-known strategy, a provisional mandatory-prerequisite choice, ambiguous alternatives, missing native authority, infeasibility, and no required frontier. The current data do not support the first status: no comparable terminal-completion estimates or downstream economic effects are available. OR alternatives remain ambiguous unless future native evidence establishes a safe comparison. Unknown estimates are not treated as ties.

## Evidence and model boundary

Stage 3F captured two current Mana-blocked MAD frontier offers, `tech-black_powder` and `tech-mad_science`, at their current native prices and offer generations. Its original C policy returned ambiguous because it had no decision authority. Later Stage 3I D evidence established both actions as mandatory at the first cycle for the saved fixture. The two observations answer different questions: the Stage 3F offer capture alone did not prove the AND relationship; the later Stage 3I prerequisite observation did.

The evaluator accepts an obligation classification only when it is fresh for the current graph. For each current offer it asks the shared goal-feasibility implementation to compare the native cost with captured stock, capacity, and net rate. Separate resource pools accumulate in parallel according to that existing contract. It does not restate native pricing or producer effects. If both mandatory choices are already actionable and neither has a comparable downstream estimate, it reports missing authority instead of using action identity to break the tie.

On the saved Stage 3F evidence, where non-Mana prices were covered by stock and both technologies were established mandatory by Stage 3I, 50 Mana versus 100 Mana at the same positive observed Mana rate made Mad Science actionable sooner. That is only a provisional ordering under the saved mandatory evidence, not a terminal-time strategy and not a permission to spend. In pure property cases, changing Mana stock to satisfy both costs erased that provisional ordering; changing a native price, resource stock, observed production, or applicability changed the chosen frontier accordingly. The OR case remained ambiguous.

The live Stage 2F exact-runner fixture does not currently provide the computed native requirements needed to recreate Stage 3I's authority: a controlled fresh catalog draw reported zero computed requirements. The production evaluator therefore returned `blocked-by-missing-native-authority`; it did not select either MAD technology. Its observed current affordability projections were about 17.9 seconds for Black Powder and 7.9 seconds for Mad Science, both uncertain because they use one Mana rate sample and external commitments were unobserved. Those numbers cannot overcome the missing proof that the current high-tech route makes Mad Science mandatory.

The decision would change if a fresh, root/progression-bound native computed-prerequisite capture established the route obligations for the active goal, including resolution of the currently unknown high-tech alternatives. That capture must be tied to the current graph/offer generation. A change in current native prices, stock, capacity, rate, or applicability can then change a mandatory-frontier ordering through the same feasibility contract. Unsupported producer/building marginal effects and terminal-time effects remain unknown; this slice does not compare production/investment changes against waiting.

## Safety and remaining blocker

The complete commitments of every spending owner touching the candidate resource pools remain unavailable. The evaluator marks that uncertainty and remains shadow-only. It creates no claims, reserves no shared stock, changes no Gather spending, and issues no Research or Construction command. Future execution must use existing owners only after their affected pools have complete required authority. This is independent of the unresolved live prerequisite evidence.

## Exact-runner characterization

`experiments/p12a-mad-frontier-exact.mjs` uses `tools/chromium-evolve-runner.mjs`, the Stage 2F save/settings, and the pinned upstream snapshot `db38e2af831907d49aeb5348d678d8d8745d6c3f` (snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`). It compares the local HEAD baseline twice, the candidate production bundle, and a hook-enabled observation bundle over 200 periods (seed 42; epoch `2026-09-21T00:00:00.000Z`). Save SHA-256 is `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`; effective settings SHA-256 is `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`.

Both same-bundle controls and both candidate bundles produced the same export SHA-256, `9b4a3e7364571db6c6fc858e743ee3610dde162a921132641f1d17c155e7ec67`. Production candidate control usage and native invocation traces matched baseline exactly; each ran 25 work ticks. Ordinary production behavior is unchanged. The measured `goal.mad.research-candidates` phase includes graph/obligation/resource input acquisition and evaluation: 25 samples, 34.1 ms total, 1.36 ms/tick average, 3.3 ms maximum in this run. This is a bounded workload observation, not a CPU acceptance comparison against the rejected P8 measurement. Baseline and candidate each retained one existing console error.

The exact-runner trace also exposed the live selection status and authority gap. Its current fresh catalog source was `protected-fresh-draw`, with `computedRequirementCount: 0`; the first and latest live selections were blocked, with no compared action IDs. This is the expected safe result for the available evidence.

## Verification

- Focused frontier evaluator test passed, including adaptive input changes and unresolved-OR behavior.
- `npm run check` passed after the final source edit.
- `npm run build` regenerated the userscript.
- `node tools/chromium-evolve-runner-test.mjs` passed the runner contract checks.
- The exact-runner characterization above passed.
- `git diff --check` passed.

The next enabling conditions are native computed-prerequisite authority for the current route, comparable supported terminal-time evidence for stronger strategy claims, and complete cross-owner commitments for any later spending policy. No spending behavior is enabled here.
