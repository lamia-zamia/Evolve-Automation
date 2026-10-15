# Stage 4B — Goal-aware acquisition readiness

Date: 2026-10-15
Decision: **D — G retains most of F's progression gain under the configured Money floor, but the current Research evidence is not strong enough for production application.**
Scope: controlled B/F/G comparison, source audit and a short alternate-save probe. No production integration or default change.

## Decision and recommendation

G reached the same important MAD progression milestones as F with the ordinary Market Money-flow protection retained. Hunter Process was purchased at p9392 in G versus p9368 in F; Electronics at p11184 versus p11016. Both reached High Tech 6, Uranium 1, Titanium 2 and two Factories by p30000. G ended with $2.493m Money versus F's $1.286m and B's $2.752m. Thus the progression gain does **not** depend on relaxing the configured Money floor in this Human/Magic replay.

The overall readiness decision is D because the test selector consumes the Research catalog captured for the shared cycle, while the Market adapter's last fence checks the Research control generation but does not independently re-read the native offer price and eligibility immediately before applying demand. A stable control generation cannot prove those facts. Stage 4C should wait for a narrow, current native-catalog validation at that boundary and a timing capture of that production-shaped path. The economic result justifies a separate integration review; it does not authorize enabling or implementing it here.

## Reproduction inputs

- Repository: `deadspace`, starting HEAD `338728d8e9824f9dcf0f4273f2eabe5929eef8eb`.
- Upstream: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Exact game snapshot: `test-artifacts/game/evolve-deadspace.js`, commit `db38e2af`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`.
- Exact runner SHA-256 `f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`.
- B/F/G test bundle SHA-256 `9ab49261ca0419cf1a5bdbf4d8b2f7475a6d8af33256edf1f46cdd9ba9235b9d`.
- Save `stage2f-fixed-progression-export.json`, SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`.
- Settings `stage2e-integrated-mad-no-triggers.json`, SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`; effective settings SHA-256 `7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804`.
- Seed 42, epoch `2026-09-21T00:00:00.000Z`; identical `goal-derived-conjunctive` Gather intervention and `autoMarket`, `autoSmelter`, and Titanium-buy settings. The candidate activates after shared p8000. Each arm used 3,750 work ticks and continued to p30000 under the existing incomplete-goal/positive-Money rule.
- Run: `node experiments/stage4a-goal-aware-acquisition.mjs --scenarios=B,F,G --out=test-artifacts/benchmark/tmp/stage4b-goal-aware-acquisition.json`.

## Audit of the Stage 4A path

### Native Research and goal evidence

The selector identifies one native action granting the currently selected prestige, then calls the existing prerequisite planner with the current definitions, grant levels, offered action ids and applicability evidence. Candidate rank is lexicographic: verified before conditional prerequisite, actionable frontier before non-frontier, then shorter chain; tied top candidates abstain. It does not rank by price, missing resource count, production time, resource scarcity or opportunity cost.

At p8008, the MAD path exposed two credible offers. `tech-anfo` grants Explosives 3 at Knowledge 42,000 plus Oil 2,500 and ranks ahead because its path is shorter. `tech-hunter_process` grants Titanium 1 at Knowledge 45,000 plus Titanium 1,000; its path is longer and has two resource shortfalls. F bought ANFO at p8032, then Hunter Process at p9368 and Electronics at p11016. This is a useful observed route, not evidence that shortest path is generally economically optimal. The graph is conditional/partial for this goal.

Pinned DeadSpace source confirms MAD's native requirements at `D:/work/Evolve-DeadSpace/src/tech.js:9954-9979`, ANFO at `:9913-9924`, and Hunter Process at `:10171-10182`. Upstream builds Research offers only after its path, qualification and requirements gates in `src/actions.js:6574-6611`; those checks include native condition/trait/gene qualifications and current action requirements. The rendered current native offer is therefore strong eligibility evidence for the moment it was drawn. The extracted applicability map covers static race/challenge restrictions; it is not a re-execution of every native callback.

### Authority separation and freshness

Facts revalidated by the Market adapter itself:

- Current root and Market board identity, current route counts, current native quote and resource holding/capacity capture.
- Current Market owner permission, per-resource import permission, route/control membership and control method.
- The goal-demand shape, root generation and progression epoch; current holding/shortfall/capacity; Market control generation; and Research control generation equality with the signal.
- Root/board/market object, route count and control generation fences before and during the native Market control calls.

Those checks live in `src/adapters/evolve/economy/market/captured-trade-routes.ts` around `readRouteInput`, demand acceptance and operation application. The adapter executes the existing native `autoBuy`/`autoSell`/`zero` controls; it does not directly mutate route values.

Assertions still supplied by the Stage 4A selector include selected prestige/goal relationship, candidate ranking, native grant/prerequisite interpretation, and the offer's current native price and eligibility. The experimental callback reads `progression.readOfferedTechs()` for the shared-cycle Research snapshot and derives current grants/applicability/holdings. `src/adapters/evolve/progression/research/captured-research.ts` documents that displayed prices are a per-cycle snapshot. The final Market fence checks the selected Research element's binding generation, not its current price or offer eligibility. This is precisely why an unchanged generation cannot establish a current price. Root generation and epoch alone do not close the gap because relevant game values can change in place.

The experiment now requires `autoResearch === true` and `autoTrigger !== true`; this is the explicit Research-owner permission policy. The Market owner and resource-import settings must also be enabled. Selector tests cover disabled permission and trigger delegation, same-generation repricing, goal completion, stale/missing offer, synthetic race/challenge exclusions, incomplete storage and stale Market control. Race/challenge exclusions are synthetic fixtures only.

Each Market plan re-runs the test callback; no durable intent or spending reservation is created. The current grant levels let the goal graph drop satisfied actions after a purchase, but the shared offer/price snapshot can still predate a same-cycle Research purchase. Production must validate the candidate against a current native Research catalog immediately before the planner consumes demand, and expire it when offer, price, grant, eligibility, goal, Market permission/route, stock/capacity, root or board changes.

### Market planner and executor

The selector emits at most one missing importable resource target from the native offer's displayed price less current stock. The adapter makes a copy of the ordinary planner input and sets only that resource's `isDemanded` flag. The existing `planTradeRoutes` raises that resource to priority 100, then normal Market controls execute its operations.

That flag also changes finance: if Money is not demanded, `src/domain/economy/market/trade-routes.ts` sets the effective minimum Money rate to zero. F therefore couples priority with a relaxed floor. G uses the same planner and the same demanded-resource priority but passes an explicit, separate policy that preserves the ordinary configured floor. No global Market defaults or settings are changed. The default planner policy remains byte-for-byte behaviorally equivalent to the existing path.

## Controlled results through p30000

| Measure                             |   B — existing Market |   F — Stage 4A demand | G — priority, floor preserved |
| ----------------------------------- | --------------------: | --------------------: | ----------------------------: |
| First Hunter Process                |            not bought |                 p9368 |                         p9392 |
| First Electronics                   |            not bought |                p11016 |                        p11184 |
| High Tech / Smelting at p30000      |                 3 / 5 |                 6 / 6 |                         6 / 6 |
| Titanium / Uranium grants at p30000 |                 0 / 0 |                 2 / 1 |                         2 / 1 |
| Factories at p30000                 |                     1 |                     2 |                             2 |
| Minimum sampled Money               |      $3,628 at p14300 |     $10,306 at p11500 |             $11,609 at p11600 |
| Final Money                         |               $2.752m |               $1.286m |                       $2.493m |
| Final Knowledge                     |                60,616 |                42,852 |                        93,910 |
| Final Titanium / Uranium            |               278 / 0 |          47,903 / 944 |                  47,494 / 920 |
| Final Lumber / Stone / Iron         |    868k / 466k / 167k |     254k / 100k / 18k |             262k / 676k / 26k |
| Final Steel                         |                   50k |                  964k |                        1.078m |
| Final Market routes                 | Crystal 50, Lumber 51 | Crystal 49, Lumber 49 |         Crystal 50, Lumber 51 |
| Signals / planner samples changed   |                 0 / 0 |               76 / 70 |                     109 / 109 |
| Market-control refusals             |                     0 |                     0 |                             1 |
| Wall / renderer-task time           |       580.0s / 578.8s |       578.6s / 577.2s |               600.7s / 599.5s |

F also bought Uranium at p21432, Fission at p21720, Kroll Process at p22008, Electric Arc Furnace at p23896 and ARPA at p26496. G bought those at p21560, p21848, p22136, p26728 and p27288. Both runs remained short of MAD at p30000. G retained those downstream grants while keeping $1.207m more Money than F and ended $259k below B. The floor-preserving policy did not eliminate all resource opportunity costs: relative to B, G ended with less Lumber and Iron and more Steel and Stone. These are final stock differences over complete trajectories, not isolated production-rate or import-only effects.

At p8008, B assigned 10 Titanium routes after removing 78 Iron and 5 Steel. F assigned 73 Oil routes after removing 15 Iron and 5 Steel. G assigned 36 Oil routes after removing 52 Iron and 5 Steel. The ordinary planner, route capacity and native controls determined those allocations. F produced 76 accepted signals with 70 recorded plan changes; G produced 109 signals with 109 changed plan records. Selector and capture failures were zero. G had one guarded refusal at p24856 (`remove Polymer 67`, `native-result-mismatch`); it was not executed. The script counted no Market-control refusals in B/F.

Full-run wall and renderer time are not incremental selector measurements: the policy changes the game's state and work. The G increase versus B/F is not attributed to selector cost. No race or challenge variant was included in the full B/F/G comparison.

## Alternate saved progression state

The materially later `mad-tech-offered-blocked.json` save (SHA-256 `7eb43bc6cd1e7267561ceb21aaaa7b8c5eee9a4aa7c700ef9d579063a26cf090`) starts at High Tech 10, Smelting 6, Titanium 3, Explosives 3 and Uranium 4 with very large stocks. With `autoPrestige: false` to prevent the ready prestige from immediately resetting the run, a 100-period G probe selected the current native `tech-mad` offer at Knowledge 120,000, Oil 8,500 and Uranium 1,250. Knowledge alone was short at first (31,208 held at p8); it was not importable, so the selector abstained. Native Research bought MAD at p48 once Knowledge had accumulated. No Market demand signal was emitted. This confirms that the intervention can remain dormant when the acquisition target is not marketable and natural production closes the gap; it is not a second B/F/G economy comparison.

This is still a Human/Magic save. Synthetic race/challenge fixtures do not establish cross-race safety, and actual coverage of another race/challenge remains unavailable.

## Selection-quality limits and concrete uncertainties

- At p8008, shorter-path ANFO outranked the longer Hunter Process line despite ANFO needing 2,500 Oil and Hunter Process having two missing resources. Both were valid native goal-related offers. The observed outcome later advanced the longer Titanium/Electronics/Uranium line; it does not tell us what would have happened if the selector had ranked by cost or production time.
- Native prices and grants establish costs and progression facts, but the selector has no time-to-afford estimate, production availability forecast, capacity opportunity model or value for alternative routes. The complete late-save probe shows a Knowledge shortfall that natural production closed by p48; importing other resources would not have accelerated the purchase.
- A selected price with multiple shortfalls may still yield a signal if exactly one missing resource is importable. That can buy one input while another remains the actual blocker. Whether such partial acquisition is valuable depends on the current route and production trajectory and remains unknown.
- Existing demand/commitment displacement is not valued by candidate ranking. G's final stock deltas show the consequences to Lumber, Iron, Steel and Stone, but do not identify which individual route displaced which future commitment.

Do not replace the transparent selector with a weighted strategy score in this stage. Preserve native candidate transparency and record future examples with measured prices and progression while leaving unknown downstream consequences unknown.

## Smallest production-boundary proposal for a separate review

If the native-catalog freshness gap is closed, the narrow opt-in design is:

1. Pure selector over immutable current native goal, grant, prerequisite, eligibility, offer price and resource snapshots.
2. One short-lived read-only acquisition intent carrying goal identity, native offer identity/generation, price/grant evidence, one bounded resource shortfall and root/Market freshness.
3. Existing Market planner as the only route decision owner. Give the intent priority while preserving the ordinary Money floor as the independent policy proven by G.
4. Existing native Market controls as executor, with an immediate adapter-side revalidation of the current native Research catalog and the current Market/resource evidence before applying demand.
5. Explicit opt-in disabled by default; require `autoResearch` enabled, triggers not owning Research, `autoMarket` enabled, resource import enabled, current route/control and storage headroom. Incomplete evidence means ordinary Market input. Recompute/expire on any goal, offer, native price/grant/eligibility, permission, route, stock/capacity, root or board change.

Move only the selector and minimal immutable intent type from `experiments/` into a domain module, plus the smallest native-catalog read capability from the test hook in `src/bootstrap/captured-runtime-control.ts`. Reuse the existing Market capture and executor. Keep the experimental callback, operation override, diagnostics and trace hooks out of production. Do not change Research purchase selection or spending reservations. Before that implementation review, measure repeated current-catalog/price validation and prerequisite graph cost in real-time Chrome; the Stage 4A shared-cycle catalog is not enough to pass the final freshness fence.

The current test-only profile on the late state observed 12 catalog/selector samples: mean catalog capture 2.22 ms (max 3.4 ms) and mean normalization/graph selection 1.18 ms (max 3.0 ms). These are diagnostic measurements inside the exact runner, not a real-time Chrome benchmark. Market quote and Market control discovery are captured once by the existing Market path and reused by this selector; no second Market capture owner was introduced. Their isolated cost, and the additional cost of a fresh native Research recapture, remain unmeasured.

## Verification and protected inputs

- Focused tests: `trade-routes`, `stage4a-goal-aware-acquisition` and `captured-trade-routes` passed after the policy and permission changes.
- Stage 4A B/F reproduction remained stable: B's p30000 resources and grants match its accepted report; F's Hunter Process/Electronics periods and p30000 grants also match.
- B/F/G exact Chromium comparison and alternate-save G diagnostic completed against the pinned snapshot. `node tools/chromium-evolve-runner-test.mjs` passed. `node tools/chromium-native-parity-test.mjs` was attempted but could not start because this checkout lacks `test-artifacts/benchmark/settings/baseline-tuned.json`; no substitute inputs were created. Full `npm run check`, production build and `git diff --check` passed after the final source state.
- `tools/` is a separate checkout and was not edited. Its HEAD remains `96b49f1df5d354c7c6cd000f2ba078c7dcfe601f`, branch `master`, clean; upstream remains at pinned `db38e2af831907d49aeb5348d678d8d8745d6c3f` with only its pre-existing untracked `automation-local.html`.
- The production integration is not active, and the default Market behavior is unchanged.
