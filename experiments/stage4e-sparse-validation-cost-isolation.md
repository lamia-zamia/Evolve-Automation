# Stage 4E — Isolate Sparse Validation Overhead

## Decision: A — diagnostics-free sparse validation fits the 2% renderer JavaScript budget

Across five clean G/J pairs through p30000, pooled renderer `ScriptDuration` was 5.834846 s for G and 5.841489 s
for J, a **+0.11%** change. The median paired 25-work-tick phase-window change was +0.38%. J preserved G's Research
sequence, Market plans and operations, resource holdings, Hunter Process and Electronics periods, and later
technology milestones in every pair. No production setting, production execution path, capture framework, or
Research-snapshot handoff was added.

The phase-window timing tails were noisy: across 550 matched windows the mean relative change was +7.08% and p95
was +58.91%, while the median was +0.38%. Individual pair `ScriptDuration` changes ranged from −11.47% to +20.27%.
These tails do not establish a stable slowdown, but they also do not establish a p95 latency guarantee. The
aggregate renderer counter and paired-run median meet the agreed budget; keep this measurement limitation visible
in any follow-up integration review.

## Run design

The existing Stage 4A experimental runner now makes the no-hint missed-opportunity sampler opt-in with
`--sample-missed-opportunities`. The default J path does not make diagnostic native Research draws. Its functional
path is unchanged: choose a candidate from shared-cycle evidence, compare ordinary and hypothetical Market plans,
request protected fresh Research validation only when the plan could change, recompute from the fresh catalog, and
execute through the existing Market owner with the configured Money floor intact. Catalog/selector profiling,
Market phase profiling, renderer metrics, and snapshot RNG-call counts remain enabled without diagnostic draws.

Five paired replays used fresh Chromium page contexts and the exact runner, each advancing 3,750 work ticks through
p30000. Pairs 1–3 ran G then J; pairs 4–5 ran J then G. All used the same accepted Stage 4B save, settings,
effective overrides, seed, epoch, Gather intervention, browser bundle, and pinned game snapshot:

| Input                 | Value                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository start      | `deadspace` at `a82d58c5ac1fdc71964ff5ea7f7e3ceb5d9df0fd`                                                                                                      |
| Upstream              | `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                                                                |
| Game snapshot         | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`                                          |
| Save                  | `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`, SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`      |
| Settings file         | `test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`, SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2` |
| Effective settings    | SHA-256 `7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804`; same Market, Smelter, Titanium-buy, and Money-floor settings in both scenarios     |
| Seed / epoch / Gather | `42` / `2026-09-21T00:00:00.000Z` / `goal-derived-conjunctive`                                                                                                 |
| Test bundle           | SHA-256 `ac70ff7fa69e40dd4e45ec4c99dc50658abc0ba53c12cc4d89a92539f582a8a5`                                                                                     |
| Exact runner          | SHA-256 `f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`                                                                                     |

The test bundle hash shown above is the same across the five clean pairs and the separate diagnostics-on replay.

## Performance and draw accounting

|       Pair | Order       | G ScriptDuration | J ScriptDuration |     J vs G |
| ---------: | ----------- | ---------------: | ---------------: | ---------: |
|          1 | G → J       |       1.108754 s |       1.333535 s |    +20.27% |
|          2 | G → J       |       1.367208 s |       1.210435 s |    −11.47% |
|          3 | G → J       |       1.210900 s |       1.165617 s |     −3.74% |
|          4 | J → G       |       1.173393 s |       1.183124 s |     +0.83% |
|          5 | J → G       |       0.974591 s |       0.948778 s |     −2.65% |
| **Pooled** | **5 pairs** |   **5.834846 s** |   **5.841489 s** | **+0.11%** |

The paired-run relative changes have mean +0.65% and median −2.65%. The large spread is why the decision uses the
pooled renderer counter and reports the run-level range rather than selecting a favorable pair. `TaskDuration` was
2,263.298 s for G and 2,306.013 s for J pooled (+1.89%); it is secondary context, not the renderer JavaScript
budget metric.

Matched phase windows use the same 110 25-work-tick windows after p8000 in each pair (550 paired windows total).
Summed phase time averaged 3,304.85 ms for G and 3,500.68 ms for J; medians were 3,173.00 ms and 3,213.95 ms;
p95 values were 4,312.67 ms and 5,088.44 ms. The distribution of paired relative changes was mean +7.08%, median
+0.38%, and p95 +58.91%. The high tail and pair-to-pair spread are inconsistent with a stable point estimate and
are not evidence that the whole-run renderer counter rose by that amount.

Each clean J run made 2,750 preflight calls. Of these, 2,627 had no importable shortfall and 123 could change the
ordinary Market plan. All 123 requested validations were accepted; none were rejected or unavailable. The
no-hint sampler made **zero** draws. Across each run, G made 3,830 native Research catalog draws and J made 4,076:

| Draw component per run                                         |   Count |
| -------------------------------------------------------------- | ------: |
| Action-triggered protected fresh validations                   |     123 |
| Later Research-owner redraws after those binding invalidations |     123 |
| Diagnostic no-hint draws                                       |       0 |
| J total minus G total                                          | **246** |

Thus 123 validations cause 246 additional draws. Over all five pairs, J added 615 protected draws and 615 later
Research-owner redraws (1,230 extra draws total). The profiled native `drawTech`/DOM-generation phase recorded
278.776 s for G's 19,150 draws and 297.579 s for J's 20,380 draws across the ten timelines: an observed increment
of 18.803 s, or about 15.3 ms per extra draw. This phase timing includes both draw classes and is separate from
the renderer's `ScriptDuration` counter.

Selector profiles averaged 5,195.58 ms catalog-capture time and 3,992.30 ms selector time per G run; J averaged
7,709.22 ms and 4,164.44 ms. J's catalog-capture total includes the 123 protected captures as well as shared
catalog reads. The aggregate `autoMarket` phase was 9,510.32 ms for G and 9,497.22 ms for J per run, illustrating
the timing variance in the instrumented subtotals. The ordinary Money floor remained unchanged.

## Progression, Market, and economic comparison

Every one of the five clean pairs matched on all recorded Research owner selections (80 entries), all 247 recorded
Market plans, all 6,364 applied route operations, dense 100-period Money samples, final resource holdings, final
assignments, and the one native Market refusal. Hunter Process was purchased at p9392 and Electronics at p11184.
At p30000 both had High Tech 6, Smelting 6, Titanium 2, and Uranium 1. G and J both had minimum sampled Money
$11,608.73 at p11600 and final Money $2,493,467.57. The Stage 4D B/G baseline still shows the demonstrated
progression improvement: B did not purchase Hunter Process or Electronics and ended with High Tech 3 / Smelting 5,
while G and diagnostics-free J reached the milestones above.

The first clean-run checkpoint difference is p8008, limited to fresh Research offer binding generations and
observation IDs: a representative offer was generation 932 in G and 934 in J. Offer identities and prices,
resource holdings, Market assignments, and owner selections were equal. This is expected evidence of the protected
draw plus its later owner redraw, not an economic decision difference. No clean J economic divergence persisted.

The Stage 4D diagnostics-on run is a separate result. Replaying it with `--sample-missed-opportunities` reproduced
82 diagnostic fresh draws, zero detected missed opportunities, 4,240 total Research draws, and final J Money
$2,262,081.67 versus G's $2,493,467.57. Its first recorded resource divergence is p12000: Containers 192 vs 201
and Steel 268,110.03 vs 266,985.03; Money, technology levels, Market assignments, and Research purchases still
matched there. Snapshot RNG-call counts matched exactly at p8000/9000/10000/12000/16000/20000 (9,177 / 10,411 /
11,558 / 13,889 / 18,464 / 23,040 calls in both). The pinned upstream `drawTech()` has no direct random call.

In that diagnostics-on replay, the recorded Research purchase sequence first differs at its last ARPA purchase:
G at p27288 and J at p27280. Hunter Process and Electronics still matched. The first Market plan difference at
p12688 only reversed the order of `zero Steel` and `zero Alloy`; assignments remained equal. The first
semantically different operation set appeared at p24928, after the p12000 holdings difference. Both runs recorded
the same p24856 refusal (`remove Polymer 67`, `native-result-mismatch`). The evidence rules out an earlier changed
Research purchase, a different early Market assignment, and a different RNG-call count through p20000 as the
source of the initial divergence. It does not isolate whether the extra diagnostic draws' downstream binding
invalidation or another draw-time side effect caused the p12000 stock drift. That mechanism remains unresolved;
the old divergence is not attributed to ordinary later economic feedback alone because the stocks had already
separated before the later Market plan changed.

## Research observation reuse assessment

No same-cycle snapshot handoff was implemented. At pinned upstream `db38e2af` and current repository HEAD:

- `DiscoveryScopeCache` owns Research scopes with progression-epoch and age validity. Repeated samples compare
  offer identity and price only after a resample, to decide cache-age widening. That comparison does not expire a
  held observation when price changes without a binding change. Freshness still comes from a native draw, and a
  failed draw is not a usable cached answer.
- The progression controller separately owns the held offered snapshot, definitions, granted-tech sample,
  attempted flags, offer-control revision, root/epoch identity, and scope entries. Binding generations are
  re-resolved and a changed binding invalidates the held Research observation.
- The protected Market-time test read calls the native catalog reader and returns a restated offer catalog; it
  does not install that observation into progression's held sample or Research owner's `offeredThisCycle`.
  It requests an offers-only draw. A configured trigger/Research consumer may require granted-tech rows, which are
  deliberately sampled separately. Computed requirements also carry root/epoch context when enabled.
- Market runs before several other owners and before the Research owner. Market route mutations change resource
  holdings; later owners and a possible trigger can mutate state before Research executes. Research execution
  evaluates costs and eligibility against then-current state. Root, epoch, binding, price, eligibility, queue, or
  computed-requirement changes therefore cannot be waived by matching the Market-time root or epoch alone.
- Failed or incomplete native draws currently yield no catalog. A handoff would have to preserve the existing
  failure behavior and prove invalidation on every intervening mutation; no such authority exists at the current
  test hook boundary.

This is not a safe reuse contract. Since diagnostics-free J already fits the aggregate 2% budget, there is no
performance case to accept Research execution uncertainty for one fewer draw.

## Correctness limits, verification, and recommendation

No Research observation lifecycle changed, so no lifecycle handoff adversary suite was added. The real Chromium
boundary exercised 123 naturally changing fresh validations per clean J run, changing offers and prices, and the
native Market refusal. Stage 4D's still-open adversaries remain required before a separate opt-in production
integration review: same-generation repricing, offer removal without root replacement, permission/goal changes
inside the boundary, unavailable/partial fresh draw, Market board/control invalidation, purchase before/after
Market, computed requirements becoming unavailable, granted-tech capture required by another consumer, owner
disabled states, and native Market refusals across operation types.

The diagnostics-free functional path is decision **A** on the measured production-shaped aggregate renderer
counter: +0.11%, below 2%, while preserving G's demonstrated progression improvement and authoritative fresh
validation. Recommend a separate opt-in production integration review only after those boundary adversaries pass.
Do not add release behavior in this stage. The missing `test-artifacts/benchmark/settings/baseline-tuned.json` native
parity fixture was not invented and native parity is not claimed.

Verification for this slice: five deterministic G/J exact-Chromium pairs through p30000, one separate diagnostics-on
G/J replay through p30000, no-diagnostics short probe, `node tools/chromium-evolve-runner-test.mjs`, production
build, full `npm run check`, and `git diff --check`. The experiment remains outside production execution.
