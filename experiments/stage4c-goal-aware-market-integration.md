# Stage 4C — Freshness-Validated Goal-Aware Market Integration

## Decision: B — keep the strategy experimental

The existing native Research capture can produce an authoritative fresh observation, but only by forcing a complete
Research draw. There is no candidate-only native observation. The draw is protected from the player-facing panel and
does not click or purchase Research; its repeated cost is material enough that this stage does not add a production
Market setting or owner path. The historical real-page measurements below are a performance gate, not a matched
Stage 4C B/G/H benchmark. No H result is claimed.

No source integration was made. The Stage 4A selector remains in `experiments/`, Stage 4B remains test-only, and
normal Market planning at this HEAD is unchanged. The feature is not ready to merge as a production capability.

## Native Research authority and freshness

At automation HEAD `335015448baa87a782c2b1fc01293cc4ae659321` and upstream
`pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`, the authoritative mechanism is
`createCapturedTechCatalog().read()` in `src/adapters/evolve/progression/research/captured-tech-catalog.ts`.
It invokes `captureTechDefinitionsDuring` around `discover(RESEARCH_TAB_PATH, { forceDraw: true })`, then joins:

- Same-draw native Research row membership and order from `#tech .action`.
- Current adjusted prices and the native `.cna` affordability state from the rendered rows.
- Native action identity and binding generation from the Vue binding observer/control registry.
- Grant definitions from the retained native technology registry.
- Native offer eligibility, as determined by whether the ordinary native draw renders the action.

At the pinned upstream, `actions.js::drawTech` runs `checkTechPath`, `checkOldTech`,
`checkTechQualifications`, and `checkTechRequirements` before rendering. `setAction` computes affordability and
price through native `adjustCosts`. These functions run as part of the game's supported draw; the capture does not
call qualification or price callbacks independently and does not click Research.

`captured-tab-discovery.ts` performs the forced draw under mount suppression and the panel workspace, captures rows
inside `whileDrawn`, and restores the player's selected panel/settings. The workspace supports a selected Research
panel also being the scratch target. A successful draw therefore gives current evidence without exposing the
temporary catalog to the player or starting a Research action. Offer observation identities and the current-offer
eligibility readers exposed for experiments are test-surface-only today.

The production `sampleOfferedTechs()` path is not fresh enough for this purpose. It can reuse the processed-cycle
sample and a discovery scope; its invalidation covers progression epoch and binding changes, not in-place price or
eligibility changes. The same root, progression epoch, or binding generation is not evidence that price, offer
membership, grant applicability, or native eligibility stayed unchanged. A production implementation would need a
fresh protected draw at the Market planning boundary and a fail-closed result when any required evidence is missing.

## Performance gate

There is no one-candidate draw. Even when one candidate is needed, upstream `drawTech` walks the native Research
registry and runs its current gates. Dropping the old-tech DOM container reduces attached old rows, but does not
avoid that registry walk.

Existing exact-Chromium profiles at the pinned upstream report:

| Observation                                         |                                                       Measured cost | Scope                                |
| --------------------------------------------------- | ------------------------------------------------------------------: | ------------------------------------ |
| Native draw plus DOM generation, zero-offer fixture |                                                 13.57–13.64 ms/draw | Diagnostic profile                   |
| Research draw work                                  | 22.0 ms/callback; 23.1 ms/draw including post-mutation observations | 150–175 observations                 |
| Later Research draw profiles                        |                                             10.8–25.0 ms/work cycle | Fixture-dependent                    |
| Optimized Research scratch draw                     |                  0.67 s / 75 work callbacks (about 8.9 ms/callback) | Exact-runner profile, diagnostics on |

These are prior profiles, not a new paired Stage 4C measurement. The recent Stage 3N headless-Chromium profile
observed 26–27 existing Research draws over 25 work cycles. A fresh draw on every Market plan would add roughly 25
more draws in that window, nearly doubling the observed draw count. Its diagnostics-off renderer JS averages were
10.12 ms per native period (early), 10.65 ms (progression-heavy), and 26.92 ms (late); the diagnostic Research draw
costs were 10.8, 12.4, and 25.0 ms per work cycle. At the profile's 8 native periods per work cycle, that projects
at least +1.35, +1.55, and +3.125 ms per native period, or about +13%, +15%, and +12% total renderer JS. The
instrumented whole-tick averages were 46–47, about 52, and 138–139 ms, so the extra draw alone projects roughly
23%, 24%, and 18% per work cycle. These are projections from matched workload profiles, not measured H deltas;
candidate graph, normalization, selection, and demand-composition work is additional. This expected regression is
material for an opt-in path, so it fails the current performance gate without a measured reduction in observation
cost. No price/eligibility cache is proposed because no invalidation evidence proves those facts stable.

Counters already available for a future measured attempt include `research.observation.requests/samples/cache-hits`,
the Research DOM capture and native requirement phases, runtime phase timings, and `autoMarket` planning/execution
timings. A fresh path must separately report full draw count, cache hits (expected zero for price/eligibility), graph
work, candidate normalization/selection, demand composition, and total processed-cycle cost with the feature both
disabled and enabled on matched saves.

## Selector, Market economics, and settings

The reusable ranking is still the test-only Stage 4A implementation in
`experiments/stage4a-goal-aware-acquisition.ts`: verified native goal relationships first, current actionable
frontier next, then shorter verified prerequisite chain; unresolved equal-ranked candidates abstain. It emits one
bounded importable resource shortfall and does not encode resource order. The pure selector has not been extracted
into production because the fresh native boundary and performance gate are not closed.

Stage 4B G uses the existing `planTradeRoutes(input, policy)` owner. It raises only the selected resource's priority
and passes `preserveMoneyFloorForDemandedResources: true`. The configured floor remains
`min(Money headroom, max(configured absolute floor, configured percentage of projected Money rate))`. Ordinary
demand for unrelated resources keeps the existing default planner policy. Native Market controls remain responsible
for route changes; `native-result-mismatch` remains a guarded refusal, with no blind retry.

No setting was added. A future setting belongs in the existing Market reset defaults and Market settings control
model, with a false default so persistence uses the ordinary settings lifecycle. Eligibility would also require
`autoResearch === true`, `autoTrigger !== true`, `autoMarket === true`, the selected resource's native import toggle,
current Market controls/board, sufficient storage capacity, and a current positive shortfall. Any absent or stale
input must use ordinary Market planning.

## B/G/H progression results

| Arm                                                | Evidence                                                                                                                                  | Stage 4C status                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| B — existing Market                                | Stage 4B report: Human/Magic MAD save, seed 42, same Gather intervention, through p30000.                                                 | Existing result retained           |
| G — test-only goal priority, Money floor preserved | Stage 4B report: Hunter Process p9392, Electronics p11184, High Tech/Smelting 6/6, Titanium/Uranium grants 2/1, two factories.            | Existing result retained           |
| H — production-shaped fresh intent                 | No production path was added because each fresh Market observation requires a full native Research draw and the performance gate is open. | Not run; no claim of reproducing G |

Stage 4B's B/G report gives B as no Hunter Process or Electronics, High Tech/Smelting 3/5, no Titanium/Uranium
technology, and one factory. G ended with $2.493m Money versus B's $2.752m; its minimum sampled Money was $11,609.
The Stage 4B G run had one guarded Market `native-result-mismatch` at p24856 (`remove Polymer 67`); the operation
was not applied. That behavior remains a risk to monitor for any future integration, and a rejected route operation
must not be retried blindly.

No opt-in-disabled-vs-B parity replay or H replay was run in Stage 4C. The implementation path is absent, so those
comparisons cannot be inferred from Stage 4B's test-only callback results.

## Adversarial and alternate-state coverage

Existing Stage 4A synthetic selector tests cover goal completion, permission and trigger ownership, Market/resource
permission, stale root/epoch, price changes, missing offers, affordability, capacity, nonmarketable resources,
candidate ties, and synthetic race/challenge exclusions. Existing Stage 4B Chromium runs exercise the real Research
and Market owners, but the selector reads the shared cycle offer snapshot and does not cross a newly added fresh
Research-to-Market boundary.

The Stage 4B Market fence checks current root/epoch, Market board/control generations, selected Research binding
generation, resource holding/capacity, target shortfall, import permission, and route quote. It does not revalidate
current Research offer membership, price, grant/applicability, or eligibility. There is no Stage 4C adversarial
Chromium test for a Research purchase between selection and Market planning, or between planning and route execution;
same-generation offer removal/repricing/eligibility change; grant/goal/permission mutation; or native catalog
unavailability. There is also no Stage 4C H coverage for no selected prestige, already-affordable candidates,
conflicting candidates, or native Market refusal. These remain required before production integration.

No other race/challenge save was run. Existing race/challenge exclusions are synthetic only; no cross-race optimality
claim is supported.

## Verification and parity fixture

- `node scripts/test.mjs captured-tech-catalog captured-research stage4a-goal-aware-acquisition captured-trade-routes` — passed, six files.
- `npm run check` — passed all 346 test files and five checks.
- `npm run build` — passed.
- `node tools/chromium-evolve-runner-test.mjs` — passed determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- `node tools/chromium-native-parity-test.mjs` — could not start: `test-artifacts/benchmark/settings/baseline-tuned.json` is absent.
- Fixture investigation: `tools/README.md` documents the parity command but no fixture-generation command; `tools/benchmark/freeze-evidence.mjs` only hashes the file. `docs/allocation-benchmark.md` describes frozen settings blobs under the gitignored `test-artifacts/benchmark/settings/`, but does not define how to reconstruct this exact tuned profile. No substitute was created.
- Parent checkout was clean before this report. `tools/` was not changed and remains clean at `96b49f1df5d354c7c6cd000f2ba078c7dcfe601f`. The pinned upstream checkout remains at `db38e2af831907d49aeb5348d678d8d8745d6c3f` with only its pre-existing untracked `automation-local.html`.

## Merge status

The strategy is not safe to merge as a production feature, even disabled by default: no production opt-in was
implemented, freshness adversaries do not yet cross the native Market boundary, H was not compared with B/G, and
the additional full native draw has not passed a matched performance benchmark. The next implementation attempt
must first measure a production-shaped fresh draw at the Market boundary and preserve the existing native executor
refusal behavior.
