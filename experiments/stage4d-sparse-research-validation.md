# Stage 4D — Sparse Native Research Validation

## Decision: B — validation works, but measured cost remains above budget

The test-only J path retained G's Hunter Process and Electronics purchase periods and its High Tech, Smelting,
Titanium, and Uranium progress through p30000. The ordinary Market Money floor remained in force and the sampled
Money minimum matched G. The preflight reduced validation requests to 123 across 2,750 Market preflight calls.

The performance budget was **no more than 2% additional renderer JavaScript in matched work-cycle windows**. The
full Chromium `ScriptDuration` counter was 1.132249 s for J versus 1.102271 s for G (+2.72%). Across aligned
25-work-tick instrumentation windows after p8000, total measured phase time had a +1.86% median difference,
+3.36% mean difference, and +11.46% p95 difference. J therefore misses the stated budget. More importantly, the
123 requested validations produced 246 extra full Research draws: each protected validation draw invalidated the
cycle's shared sample, and later Research execution drew again. The diagnostic no-hint experiment added 164 more
draws. This is sparse relative to every Market cycle, but not cheap enough to advance the Market integration.

No production setting or production execution path was added. The fresh-draw entry point exists only on the
compile-time test surface and is checked absent from the production bundle.

## Phase 1 — runtime ordering and reuse

`captured-runtime-control.ts` samples the Research offers for goal-derived Gather before Gather, samples demand,
runs Gather, then prepares and plans Market. `application/tick.ts` confirms Gather precedes Market. Research
execution occurs later in the same processed cycle.

Gather can change live resource holdings after the shared Research observation. Market then captures current stock,
capacity, quotes, settings, board, and controls. The Research observation cache is invalidated by progression epoch
or offer binding changes, not by every price or eligibility dependency. Unchanged root, epoch, or control generation
therefore cannot prove a current Research price or offer. Reuse was rejected.

The underlying `createCapturedTechCatalog().read()` already performs the protected `forceDraw: true` through the
native Research discovery mechanism. Existing test hooks called `sampleOfferedTechs()` and could reuse the cycle
sample, so a narrow test-surface-only method now invokes that existing catalog read. It does not call native
qualification callbacks independently. Market's existing post-plan root, board, route, and control checks remain
the authority for applying operations after the draw.

## Phase 2–5 — preflight, validation, and sampling

The Stage 4A selector runs against the shared-cycle snapshot as a hint. The Stage 4D preflight compares the ordinary
`planTradeRoutes` result with the same plan after marking the hinted resource demanded and preserving the configured
Money floor. Identical or incomplete plans do not request a validation draw. A changed plan requests one protected
fresh Research draw, reruns the selector against its current offers, prices, grant levels, goal and prerequisite
definitions, checks the Market resource holding and capacity against the fresh catalog, and recomputes the Market
plan. Only the fresh decision can be returned as a demand signal. A missing catalog, changed candidate, changed
holding/capacity, or no-longer-changing plan returns no signal.

Preflight outcomes over the active 2,750 work cycles:

| Outcome                                                        |       Count |
| -------------------------------------------------------------- | ----------: |
| No goal candidate                                              |           0 |
| Candidate with no importable shortfall                         |       2,627 |
| Already adequately demanded                                    |           0 |
| Candidate priority leaves Market plan unchanged                |           0 |
| Candidate could change plan; fresh validation requested        |         123 |
| Incomplete preliminary evidence                                |           0 |
| Fresh validations accepted / rejected or changed / unavailable | 123 / 0 / 0 |

The diagnostic sampler independently selected one in every 32 no-hint calls (82 of 2,627). It performed 82 fresh
draws; each found a current goal candidate, but none had a plan-changing import opportunity. No catalog was
unresolved. This is a 3.12% sample of no-hint points, not proof of complete opportunity discovery. Around the
Hunter Process and Electronics purchases, the preliminary candidate changed from `candidate-not-marketable` to
`candidate-affordable` at the purchase cycle (p9392 and p11184); no Market demand was emitted from the earlier
shortfall hint. The run found no measurable missed opportunity, but it does not establish complete discovery. The
result is **safe abstention at the sampled points**, not complete native-opportunity discovery.

## Phase 4 — evidence limits and live refusals

The real Chromium J timeline exercised 123 fresh validations at the actual Research-to-Market boundary. It naturally
included resource changes from Gather, later Research purchases, changing offers, and fresh catalog generations.
The existing Market fence safely recorded the same guarded `native-result-mismatch` refusal at p24856 as G
(`remove Polymer 67`); it was not retried. J recorded three Market `skipped` trace events overall.

The replay did not inject every requested adversary. In particular, it did not force same-generation repricing,
offer removal without root replacement, permission or goal changes inside the boundary, unavailable native catalog,
Market board/control invalidation, or a native refusal at each operation type. Existing Stage 4A unit tests cover
several analogous selector inputs synthetically, but those do not replace adversarial tests through this Chromium
boundary. The current run establishes that the path can validate naturally changing live state and that the ordinary
Market fences remain active; it does not establish every listed race.

## Phase 6 — exact Chromium comparison

All scenarios used the Stage 4B accepted save, identical settings, Gather intervention, seed 42, epoch, and pinned
DeadSpace snapshot. B and G were run with the same Stage 4A test bundle; J used the same experimental policy plus the
test-only forced-draw hook. The exact runner used `test-artifacts/game/evolve-deadspace.js` at
`db38e2af`; save SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`, effective settings SHA-256
`7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804`, runner SHA-256
`f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`.

| Measure through p30000    | B — ordinary Market | G — goal priority | J — conditional fresh validation |
| ------------------------- | ------------------: | ----------------: | -------------------------------: |
| Work ticks                |               3,750 |             3,750 |                            3,750 |
| Full Research draws       |               3,805 |             3,830 |                            4,240 |
| Hunter Process            |       Not purchased |             p9392 |                            p9392 |
| Electronics               |       Not purchased |            p11184 |                           p11184 |
| High Tech / Smelting      |               3 / 5 |             6 / 6 |                            6 / 6 |
| Titanium / Uranium grants |               0 / 0 |             2 / 1 |                            2 / 1 |
| Minimum sampled Money     |              $3,628 |           $11,609 |                          $11,609 |
| Final Money               |             $2.752m |           $2.493m |                          $2.262m |
| Renderer `ScriptDuration` |             1.242 s |           1.102 s |                          1.132 s |
| Renderer task duration    |             571.4 s |           475.4 s |                          437.0 s |
| Market control refusals   |                   0 |                 1 |                                1 |

J ended with Knowledge 93,910, Oil 77,255, Titanium 47,494, Uranium 920, Iron 25,991, Lumber 260,690, and Steel
1,077,489. G ended with Knowledge 93,910, Oil 77,256, Titanium 47,494, Uranium 920, Iron 25,967, Lumber 261,992,
and Steel 1,077,558. The resource outcomes are close; J finished with about $231k less Money than G.

J made 2,750 preflight calls. Its instrumented catalog capture plus selector time was 11.000 s total, versus 8.887 s
for G's shared-snapshot selector. The difference is about 2.113 s across the run; it includes the fresh validation
catalog captures and policy work, while the separate diagnostic sampler's 82 draws are not included in that profile
sum.

The 3,830-draw G run is the matched behavioral baseline. J's 4,240 draws are 410 more: 123 action-triggered fresh
draws, 82 diagnostic draws, and 205 follow-on draws after those 205 forced draws invalidated the cached sample used
by later Research execution. The runner counters show 4,035 cached Research samples in J versus 3,830 in G; the
205 added `autoResearch` samples match the binding invalidations caused by the 205 direct draws. Excluding
experiment-only diagnostics, the conditional action path added 246 draws, 6.4% of G's total draw count. Thus 123
validation requests did not mean 123 additional draws.

The windowed latency comparison pairs the same 25-work-tick windows at the same harness periods after p8000; it
does not compare total wall time across divergent economies. J versus G had a +1.86% median, +3.36% mean, and
+11.46% p95 for summed instrumented phases. `autoMarket` window medians were 2.51 ms for G and 2.41 ms for J; the
added draw is measured under the Research draw phase, not only Market. The full renderer `ScriptDuration` counter
rose 2.72% for J. Timing counters include diagnostics instrumentation and are workload-dependent; the measured
result misses the 2% target even though the key progression milestones matched.

## Phase 7 — decision and verification limits

**B. Correct fresh validation works on the live Chromium boundary and reproduces G's main progression gain, but its
measured overhead is above the explicit budget. Stop extending the Market integration.** The preflight makes the
draw sparse, yet each forced draw causes a second same-cycle draw later; the action path adds 246 full Research draws
and the measured renderer JavaScript increase is 2.72%.

No production setting or production feature was added. A new production integration stage is not recommended from
this result. Reconsider only if the later same-cycle Research draw can safely consume the fresh catalog without a
duplicate native draw and a paired replay falls within budget. Do not add a generic capture layer for this purpose.

The native-parity fixture limitation remains: `test-artifacts/benchmark/settings/baseline-tuned.json` is absent, so
`node tools/chromium-native-parity-test.mjs` could not run without inventing an input. Exact-runner B/G/J timelines
and runner contract tests are the Chromium evidence reported here.
