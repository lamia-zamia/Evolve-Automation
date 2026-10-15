# Stage 4F — Goal-Aware Market Boundary Safety

## Decision: D — keep the path experimental

Stage 4E's diagnostics-free G/J functional path remains frozen: G's progression and ordinary Market Money floor
are preserved, J performs a non-authoritative shared-cycle preflight, conditionally draws protected current native
Research evidence, recomputes the candidate, and uses the existing Market owner. No production strategy or setting
was added. The accepted five-pair result remains **+0.11% pooled renderer `ScriptDuration`**.

This audit proves that Market root/board/route-count invalidation rejects an experimental plan in exact Chromium.
It does **not** prove that Research authority stays current through Market execution. A same-stack test callback
changed the selected native Research binding generation and queue evidence after validation; the Market strategy
still applied its already planned Oil routes. The new current catalog still selected the same Oil candidate, so
this run is evidence of a missed final authority fence, not proof that the resulting routes were economically
wrong. Required purchase, same-generation repricing, eligibility, permission, and goal adversaries are not
established. Do not recommend Stage 4G production implementation yet.

## Frozen path and authority timeline

1. The shared-cycle Research owner observation supplies a hint. Its offer, price, grants, goal and generation can
   already be older than Market's later work.
2. Test-only J evaluates that hint against the current Market capture. This is non-authoritative preflight.
3. It compares the ordinary Market plan with a hypothetical candidate-demand plan, using the same captured Market
   input and the existing Money-floor policy.
4. Only a plan-changing candidate requests the protected fresh native Research draw.
5. J recomputes the candidate from the returned current Research evidence. Preliminary price, candidate and offer
   generation are not copied into the accepted signal.
6. Market checks the selected binding generation and compares the candidate's resource holding, capacity,
   requested quantity, import quote, permission and route control against the earlier Market capture.
7. Market plans the final operations, preserving the normal Money floor.
8. The Market executor fences root, board, Market identity, route counts and control generations, invokes native
   add/remove/zero controls, and checks immediate postconditions. `native-result-mismatch` stops the batch; there
   is no retry.
9. Later in the processed cycle, the Research owner observes and may execute against its then-current state.

The protected Research discovery, selector, Market callback, planner, final Market capture/fences and native route
control calls execute synchronously on the same processed-cycle JavaScript stack. Ordinary browser tasks cannot
interleave without an explicit yield. Vue bindings and DOM changes made by the draw are captured synchronously;
MutationObserver delivery and timers run after the stack. This narrows the normal browser-task window but does not
prove that native getters, a bound control, `tradeRouteColor`, a registered callback, or a future adapter callback
cannot synchronously re-enter and mutate state.

Potential mutation points from step 4 through step 8:

- `drawTech` qualification, cost and requirement evaluation, row construction, captured binding generation, and
  panel restore can mutate native binding/DOM state while the fresh observation is being made.
- The selector and the callbacks `demandForTest`, `resolveOperations`, and `onTrace` are synchronous. The latter
  two are test-only callbacks, but establish concrete injection points between planning and execution.
- Market capture reads current resource holding/capacity, quote, settings, board and route controls. These reads
  and any native computed getter may execute game code.
- Each native Market control invocation synchronously changes route assignments and calls `tradeRouteColor`;
  the executor checks Market postconditions afterwards. The pinned `autoBuy`, `autoSell` and `zero` methods do not
  directly change Research grants/offers or resource stock.
- Subsequent route invocations repeat Market route fences, but do not repeat a Research evidence fence. Later
  owners and the Research owner can change game state only after Market returns, absent synchronous re-entry.

Pinned-source review at `D:/work/Evolve-DeadSpace` `db38e2af831907d49aeb5348d678d8d8745d6c3f`: `drawTech` and
`runAction` are synchronous; a successful Research purchase updates its grant and redraws, while post callbacks
are queued for the main loop. Market `autoBuy`/`autoSell` change route counts synchronously; `zero` composes them.
The automation's native-control call uses the current captured binding. No production callback was found that
currently performs a Research mutation inside the Market stack. That source review is not an invariant against
future callbacks or a synchronous reentrant getter.

## Exact Chromium adversaries

The test-only `stage4fProbe` modes in `experiments/stage4a-goal-aware-acquisition.mjs` use the pinned unmodified
game snapshot, exact Chromium runner, same accepted save/settings/seed as Stage 4E, and actual captured native
Research and Market controls. The one-shot Research probe invokes the captured native action control; the Market
probe calls the existing native-shaped Market test control. Neither returns a fabricated catalog or alters the
production strategy. Inputs: snapshot SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`,
runner SHA-256 `f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`, Stage 4F probe bundle SHA-256
`1258dcbc5043fdbdc7b5cb478d6662fc36db51dbdd13aaa354dcfa9e08c911d2`, save SHA-256
`b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`.

| Injection point and live observation                                                                                                                                                                                                                                   | Candidate / authority outcome                                                                                                                                                                                                                                                        | Market operations and ordinary owner                                                                                                                                                                | Research state                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After preliminary selection at p8008, invoke native `tech-anfo` before protected draw. Native Research queue evidence changed `empty` → `conflict`; preliminary selected generation was 350.                                                                           | Protected draw ran; recomputation selected `tech-anfo` / Oil at generation 351 with the same 2,500 target and 637.0845 shortfall. This was a fresh accepted signal, not use of generation 350. No candidate rejection occurred because the selected tech remained a valid candidate. | 30 recorded native route-application events followed; Oil ended with 36 routes. Ordinary Market owner remained active.                                                                              | Native action invocation returned `{ok:true}` but the unaffordable tech was queued, not purchased; grant levels did not change. This does not satisfy a purchase-before-validation adversary. |
| After fresh validation at p8008, invoke the same native `tech-anfo` action before Market execution. Fresh signal used generation 351; a subsequent protected observation reported generation 352 and queue evidence `conflict`; recomputation still returned `signal`. | Market received and used the pre-mutation signal; there is no final Research binding-generation fence. The fresh post-injection candidate remained `tech-anfo` / Oil, so the run proves stale-generation passage, not a changed economic candidate.                                  | 30 recorded native route-application events followed. No ordinary-plan fallback was made.                                                                                                           | Queue changed; grant levels did not. This is a same-stack test injection, not evidence that upstream currently re-enters in this way.                                                         |
| After Market planning, invoke native `removeOne(Lumber)` before the strategy's first planned route operation. Market total changed 93 → 92; the native control returned `applied`.                                                                                     | The Market fence rejected the captured plan with `market-route-count-stale`.                                                                                                                                                                                                         | Zero planned strategy operations were applied. The current Market run stopped because its capture was stale; ordinary planning can resume on a later valid capture. No owner-wide disable occurred. | No Research purchase/grant mutation.                                                                                                                                                          |

Compact adversarial matrix (all cases began from a valid `tech-anfo` / Oil signal unless the point is explicitly
before that signal could be validated):

| Adversary                                                                                                                                                                       | Injection/evidence and result                                                                                                                                                                                               | Actual Market behavior                                                                          | Status                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Purchase after preliminary, before fresh validation                                                                                                                             | Native action invocation was attempted; native result queued `tech-anfo`, not purchased. Fresh generation moved 350→351; candidate stayed signal.                                                                           | Strategy route operations ran on the freshly recomputed signal.                                 | Partial; purchase and purchase-caused rejection not established.    |
| Purchase after fresh validation                                                                                                                                                 | Native selected action queued; queue changed empty→conflict and selected binding 351→352. No re-selection at the actual Market boundary.                                                                                    | Planned Oil route operations ran.                                                               | Boundary gap demonstrated; demand impact unresolved.                |
| Same-generation price change; offer disappears without root replacement; eligibility/applicability change; grant/prerequisite change; goal completion; selected prestige change | No realistic mutation was induced through the existing exact-runner surface without directly fabricating native output or state.                                                                                            | No claim.                                                                                       | Not established.                                                    |
| Native catalog unavailable or partial                                                                                                                                           | Returning a missing/partial value from a hook would be synthetic. No native draw/DOM failure was induced.                                                                                                                   | Existing code rejects unavailable capture; Chromium fail-closed behavior not demonstrated here. | Not established.                                                    |
| Research permission disabled / delegated to triggers; computed prerequisites unavailable; granted-tech observation needed by another Research consumer                          | No native settings interaction or separate granted-tech consumer was injected at the synchronous boundary.                                                                                                                  | No claim.                                                                                       | Not established.                                                    |
| Market board redraw; root replacement; control rebinding                                                                                                                        | Existing captured Market unit contracts cover fencing, but no live Chromium redraw/root swap/rebind was injected in this stage.                                                                                             | No claim of live rejection.                                                                     | Not established.                                                    |
| Holding/capacity change; per-resource import permission revoked; Market owner disabled; current quote change; global route capacity change                                      | Market probe changed route-count authority only. Existing executor checks shown in Stage 4E do not re-read all these captured facts before each operation.                                                                  | No claim.                                                                                       | Not established.                                                    |
| Native add/remove/zero refusal or postcondition mismatch                                                                                                                        | Stage 4E observed one native `remove Polymer 67` `native-result-mismatch`; the executor stopped and did not blindly retry. The new Market probe's `removeOne(Lumber)` succeeded. Add/zero-specific refusal was not induced. | Existing owner refusal semantics preserved.                                                     | Remove mismatch covered previously; other variants not established. |
| Protected Money floor                                                                                                                                                           | Stage 4E G/J comparison preserved the floor and matched money minima; no boundary mutation of Money/floor was injected here.                                                                                                | Stage 4F did not relax the floor.                                                               | Previously characterized, adversarial revocation not established.   |

The exact Chromium evidence therefore includes one rejection caused by changed **Market** route authority, but no
fail-closed rejection caused by changed Research evidence. The Research injections changed real native observations
but the recomputed candidate stayed valid. Many requested adversaries remain unsupported by this injection
surface. This satisfies decision D, not a production-safety claim.

## Execution boundary decision

There is no observed ordinary asynchronous interleaving between fresh Research draw and first route invocation.
The native Market methods reviewed do not mutate Research. That makes the path lower risk under the current page
call graph, but it is not a proof that all native observations remain valid. The test callback demonstrates that a
synchronous mutation after planning passes the current Market executor unless one of its Market route fences
detects it. Selected Research generation, goal, Research permission, Research eligibility, and price are not
rechecked immediately before route invocation. A binding-generation/root/epoch/settings fence could catch some
mutations and fall back to the ordinary plan, but same-generation price or eligibility change is not shown to be
detectable without another native Research draw. No final fence was added: its authority coverage and performance
cost are not established, and an extra catalog draw before every route operation is not an acceptable substitute.

## Performance accounting

No new matched G/J performance run was warranted: production execution and the accepted J decision path were not
changed; the additional native action hook and probes exist only in the test surface. Keep Stage 4E's original result
with its original scope:

- Five exact-Chromium G/J pairs through p30000: pooled `ScriptDuration` G 5.834846 s, J 5.841489 s (**+0.11%**).
  Pair deltas ranged −11.47% to +20.27%; paired-run median was −2.65%. `TaskDuration` was +1.89% and is broad
  renderer task occupancy, not the JavaScript budget metric.
- J added 123 protected fresh Research draws and 123 later Research-owner redraws per run. Across five J runs the
  instrumented `drawTech`/DOM-generation phase total increased by 18.803 s over 1,230 extra draws (about 15.3 ms
  per extra draw).
- Stage 4E's selector instrumentation reported per-run catalog-capture totals G 5,195.58 ms / J 7,709.22 ms,
  and selector totals G 3,992.30 ms / J 4,164.44 ms. These `performance.now()` phase accumulators are diagnostic,
  instrumented subtotals, not an independent process-CPU measurement.
- The +18.803 s phase subtotal and the +0.006643 s pooled `ScriptDuration` delta do not reconcile from the saved
  Stage 4E report. The Stage 4E runner summary does not surface its available process CPU delta. Preserve the
  accepted +0.11% aggregate counter, but do not claim the phase subtotal is the measured incremental browser CPU
  or use it to explain that small counter delta. Renderer `ScriptDuration` is the closest available aggregate
  renderer-JavaScript execution counter; an attributable incremental CPU result needs a measurement that
  reconciles against that counter or process CPU.
- The 550 paired 25-work-tick phase windows had relative-change mean +7.08%, median +0.38%, p95 +58.91%. These
  are summed diagnostic windows, not per-work-cycle latency. Stage 4E did not enable `callbackProfile`, so
  callback-duration and Long Task tails are unmeasured. No p95 work-cycle latency guarantee is claimed.

## Verification and production boundary

Stage 4F exact-Chromium probes used the Stage 4E snapshot/save/settings. The Research pre-draw, Research post-draw,
and Market route-count probes completed at p8008; Stage 4E's accepted five paired p30000 replay and deterministic
Stage 3M–4E regressions were not rewritten. `invokeResearchActionForTest` is compile-time test-surface-only and
`tests/architecture/research-test-surface-test.mjs` requires it to be present in test bundles and absent from
production. No native-parity settings fixture was fabricated. The tools subrepository and pinned upstream checkout
remain unchanged.

Required follow-up before reconsidering Stage 4G: establish realistic native Research purchase/goal/eligibility/
price invalidation at both boundaries; establish permission, trigger delegation, partial/unavailable draw and
granted-tech-consumer cases; and establish Market board/root/control/quote/resource/permission/capacity mutations
at the final operation boundary. If an experimental final fence changes the execution path, measure matched G/J
against the original 2% renderer-JavaScript budget before recommending integration.
