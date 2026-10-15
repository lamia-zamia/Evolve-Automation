# Stage 4F.1 — Final Research Authority Fence

## Decision: D — the stale-binding fence is verified; the G/J comparison is superseded by Stage 4F.2

The experimental Market operation batch now retains immutable evidence from the protected Research draw and checks
its observable authority immediately before the first native Market operation. A native Research action changed the
selected binding from generation 351 to 352 at p8008; the fence rejected the complete planned batch with
`research-binding-generation-stale`. Its planned Oil addition was 36 routes; zero operations from that batch ran.
No baseline batch was substituted. The ordinary Market owner remains usable after a refusal. No production opt-in
was added, and the fence is absent from the release bundle.

The authority conclusion uses both the regression and the pinned synchronous call graph. Binding generation alone
does not prove current price or eligibility. The pinned execution interval has no Research writer in its current
native Market call path: the Research action adversary redraws and changes the selected binding generation, while
the Market route methods only mutate route assignments and UI classes. This supports the fence conclusion for the
current pinned source. Revisit that conclusion if any callback is added between the protected draw and the first
route invocation. Stage 4F.2 identified that the F1 G/J comparison did not exercise the historical G Market strategy:
G returned the old Stage 4A signal shape, which the enlarged F1 Research envelope validator rejected. The
performance and p8008 strategy comparison below are not G/J baseline evidence and are superseded by the matched
Stage 4F.2 replay.

## Evidence retained and final fence

For the current Market operation, the experimental evidence record freezes the goal and goal action identity,
selected prestige, Research action ID and binding generation, root generation, progression epoch, Research
permission and trigger ownership, native offer observation and offer-set identities, selected grant and prior
grant level, native price, selected applicability status, goal relationship and prerequisite-chain identity, Market
resource, and shortfall. It is discarded with that operation; it is neither persisted nor used as a spending
reservation.

Immediately before the first strategy-influenced native operation, the fence checks root/progression identity,
Research binding generation, selected prestige and Research/trigger permissions, Market owner and per-resource
import permission, current board and route controls, Market route totals/capacity, resource holdings/capacity, and
the current native Market quote and route counts. It runs after the plan and all test callbacks. Any failed check
discards the entire strategy batch; ordinary Market planning may run on a later cycle. The existing owner refusal
semantics remain unchanged.

## Native trace and limits

Pinned source: `D:/work/Evolve-DeadSpace` at
`db38e2af831907d49aeb5348d678d8d8745d6c3f`.

- `src/actions.js:6555-6685`, `drawTech` and `setAction`, synchronously evaluate path, qualification, requirements,
  affordability, and live `adjustCosts` before rendering/binding Research offers. Requirements and condition
  callbacks are evaluated during that draw. The resulting generation identifies the bound action closure; it is
  not a price or eligibility hash.
- `src/actions.js:6993-7023` and `:6475-6486`, `runAction` and `gainTech`, synchronously update a successful
  Research grant and redraw. An unsuccessful Research action can queue and redraw as well. The exact Chromium
  adversary used this captured native action; it changed queue evidence and the selected binding generation
  351→352, while the selected candidate remained `tech-anfo` / Oil.
- `src/resources.js:2140-2197`, `autoBuy`, `autoSell`, and `zero`, synchronously check Market permissions and
  mutate route counts before `tradeRouteColor`. They do not write Research grants, offers, Research permissions,
  trigger ownership, or the goal inputs. No ordinary browser task can interleave in this same-stack interval.
- The quote callbacks used during Market capture (`aBuy`/`aSell`, `tradeBuyPrice`/`tradeSellPrice`, and
  `tradeVolumeBonus`) calculate current quotes from game state. Their traced helpers read resource, trait, and
  achievement values; they do not invoke Research actions or write Research/goal authority inputs.
- Research price, eligibility, grant applicability, and goal relationship are not independently re-evaluated by
  the final fence. No pinned callback in the traced native Market interval was found that changes those facts
  without causing a Research redraw/binding rebind. Therefore the fence relies on the current pinned call graph
  for their same-stack stability; generation equality itself does not establish it. There is no scalar native
  identity for current Research price/eligibility or a current goal relationship without running the corresponding
  evaluation again. The deliberately injected native Research action is detectable because it redraws and rebinds.

Synthetic adapter state-injection tests are labeled in `captured-trade-routes-test.mjs`. They fail closed for
Research permission, trigger ownership, selected prestige, root generation, progression epoch, Market owner/import
permission, and resource holding changes. They are behavioral tests of the fence, not evidence that upstream
naturally makes those changes between planning and execution. The exact native Research-action and Market
route-count probes use live captured controls, not fabricated catalog results.

The retained native Market probe applied `removeOne(Lumber)` and changed the total route count 93→92. The executor
rejected the plan as `market-route-count-stale` with zero operations from that batch. The synthetic permission
case then restored permission and confirmed ordinary Market controls still execute.

## Performance

One matched diagnostics-free exact Chromium G/J pair used the pinned snapshot, Stage 4E save/settings, seed 42, and
ran through p30000. Missed-opportunity diagnostic sampling was disabled; J accepted 123 protected fresh validations.

| Measure                                         |                         G |                         J |                  Change |
| ----------------------------------------------- | ------------------------: | ------------------------: | ----------------------: |
| Renderer `ScriptDuration`                       |                1.161860 s |                1.161357 s |                  −0.04% |
| Renderer `TaskDuration`                         |                 460.013 s |                 478.193 s |                  +3.95% |
| Instrumented `autoMarket` phase sum             |                9,443.9 ms |                9,698.3 ms |               +254.4 ms |
| Instrumented `tick` phase sum, 3,750 work ticks |                246,016 ms |                261,246 ms |              +15,230 ms |
| Instrumented `drawTech` + DOM generation        | 3,805 draws / 54,616.1 ms | 4,076 draws / 61,818.6 ms | +271 draws / 7,202.5 ms |

The renderer JavaScript result is inside the original 2% budget. The `autoMarket` delta includes the broader J
strategy path and does not isolate only the final recapture/fence. `tick` and `drawTech` totals are instrumented
phase accumulators, not renderer `ScriptDuration` or per-cycle latency. J made zero missed-opportunity diagnostic
draws; the final fence itself makes no Research catalog draw. The intentional `research-after-fresh` adversary
performs a native action and a follow-up observation only in that debug probe.

The clean J replay retained its existing single `native-result-mismatch` Market refusal and had no runner errors.
G and J used different planned resource assignments at p8008. This was initially attributed to J applying goal
demand, but G's goal signals were rejected before the Market planner. This pair did not compare the historical G
strategy against J and cannot establish either parity or a strategy improvement.

## Verification

- Exact Chromium `research-after-fresh`: p8008, generation 351→352, native captured Research action, stale batch
  refused, zero applied operations, zero runner errors.
- Exact Chromium `market-route-count`: p8008, native 93→92 route removal, `market-route-count-stale`, zero applied
  operations, zero runner errors.
- Matched diagnostics-free G/J exact Chromium replay through p30000: −0.04% renderer `ScriptDuration`, below 2%.
- Synthetic final-fence adapter cases: Research permission, trigger ownership, selected prestige, root generation,
  progression epoch, Market owner/import permission, holdings, and ordinary Market recovery.
- The test-surface architecture check requires the fence marker in test bundles and absent from production.

No native-parity fixture was fabricated. `tools/` and the pinned upstream checkout were not modified. The exact
runner remains the correctness authority.
