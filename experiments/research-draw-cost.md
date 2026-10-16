# Native Research draw cost audit

## Decision: stop; no candidate meets the performance screen

The largest safe opportunity considered here is the remaining detached old-row DOM/helper work in the offers-only
scratch draw. Re-analysis of the corrected, exact-runner V8 profiles bounds that work at **0.76 ms early, 1.35 ms
mid, and 4.44 ms late per work tick**. The strict HTML parser and node-conversion portion is smaller: **0.59 / 1.11 /
3.82 ms**. These are upper bounds over HTML/node-construction helpers; selector helpers are measured separately
because they also serve native removal and affordability paths. The current scratch discard already prevents the old rows from
being attached or bound. The remaining completed-row callbacks evaluate native qualification and affordability and
cannot be skipped while preserving the requested authority.

The 4.44 ms late upper bound misses the 8 ms screen; the mid result is 1.35 ms, below a meaningful mid-game gain for
the 5 ms alternative. Candidate A therefore stops here. Candidate B has no separate measured workspace opportunity:
scratch creation, release, and capture/restoration are about 0.2 ms combined per late tick. Candidate C would have to suppress native
callback and price work, which is outside the allowed contract. No behavioral patch, extra Research draw, or A/B
candidate was made.

## Inputs and authority

- Production source baseline: `deadspace` at `409383b2e7325be1ba5a93fa300daa2a7338a1e8`.
- Work branch: `experiment/research-draw-cost`, based on `experiment/shared-native-price-ab`.
- Pinned game source: `D:/work/Evolve-DeadSpace` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`; read-only.
- The measured bundle and snapshot are those recorded in `experiments/full-runtime-performance-profile.md`: production
  bundle `fd04d858…`, game snapshot `29e22dbe…`, HeadlessChrome 151.0.7922.71. Saves are the Day 14 early save, the
  Day 394 mid save, and the Day 502,447 late save. The measured phase window used 100 work ticks per run, two runs
  per save. V8 profiles used a 250 µs sampling interval.
- The raw profiles and phase reports remain outside Git under
  `D:/work/Evolve-Automation/test-artifacts/perf-profile/` (`cpuprofiles/`, `summary-phases.json`, and
  `summary-baseline.json`). No new draw was run for this audit.
- Reproduce the profile-stack split without launching the game:
  `node experiments/research-draw-cost-profile.mjs --artifacts D:/work/Evolve-Automation/test-artifacts/perf-profile`.

The renderer CPU authority is the corrected V8 sample attribution plus the existing renderer-process CPU / CDP
`TaskDuration` calibration in the full-runtime report. `ScriptDuration` was not used as a CPU proxy. The profile
rows below are exclusive sampled CPU attributed to the named leaf while `drawTech` was on the stack; they do not
overlap. Phase timings are synchronous elapsed time and are shown separately.

## Native call graph and draw lifecycle

`beginProcessedCycle()` calls `clearResearchSample()` every processed cycle. Demand calls `sampleOfferedTechs()`, which
calls `createCapturedTechCatalog().read()`. The catalog registers a short-lived binding observer and invokes
`captureTechDefinitionsDuring(() => discover(...))`. Discovery forces the Research tab draw through the captured
main-tab `swapTab`; upstream `index.js::swapTab()` calls `loadTab()`, whose Research tab switch calls
`actions.js::drawTech()`.

`drawTech()` enumerates `actions.tech`, calls `checkTechPath`, and then `checkOldTech`. Non-old actions pass
`checkTechQualifications` and `checkTechRequirements`, are grouped by era, sorted with native `Knowledge` or
`Omniscience` cost callbacks, and sent to `addAction`/`setAction`. `setAction` rechecks qualifications, calls
`checkAffordable` for current and maximum affordability, obtains adjusted price callbacks through
`functions.js::adjustCosts`, evaluates row price closures, constructs offered markup, and calls `vBind`. After
offered rows, `drawTech()` walks `old_techs` and calls `addAction(..., true, ...)` for completed rows.

The automation's `discard: UNREAD_RESEARCH_CONTENT` fires when `#resContent` binds, before `drawTech()` appends old
rows. It removes `#oldTech`, so those rows are never attached to the scratch panel and no old-row binding event is
captured. The native function still calls `setAction` for each old row. That path re-evaluates qualification and both
affordability questions, constructs a detached parent and old-tech span, and attempts a binding against a missing
target. Discarding after the draw would save none of that callback work; discarding at the current point already
avoids the real panel subtree and its bindings.

Discovery's workspace keeps the player's panel, draws in a scratch panel with mounting suppressed, restores the
settings, and releases the workspace. If workspace setup fails it restores the player's view through the native tab
control; failure and partial-draw paths remain fail-closed. A granted-tech request omits the discard and reads the
granted rows from the native DOM. Normal player draws do not use this scratch discard.

## Split cost

### End-to-end phase and frequency

| Save  | Research native draw phase, ms/work tick | Native draws / 200 work ticks | Draws with no purchase | Matched offers / draw | Binding events / work tick |
| ----- | ---------------------------------------: | ----------------------------: | ---------------------: | --------------------: | -------------------------: |
| Early |                                   12.590 |               214 (1.07/tick) |                    200 |                 12.39 |                      15.40 |
| Mid   |                                   15.598 |               210 (1.05/tick) |                    200 |                 20.60 |                      23.73 |
| Late  |                                   32.599 |               200 (1.00/tick) |                    200 |                  4.00 |                       6.00 |

The extra 14 early and 10 mid draws followed purchases and their redraws. The late 200/200 draws made no purchase.
Offer counts are `research.offers.matched` divided by native draws in the bounded phase run; they are averages across
the evolving window, not a static save count. The save's initially granted technology counts were 19 / 37 / 99.
The existing `UNREAD_RESEARCH_CONTENT` source comment records one late sample with 194 completed rows and 6 offers;
the bounded phase window averaged 4 offers as the run changed. The earlier phase instrumentation did not retain a
per-draw completed-row count, so 194 is not reported as a window average.

### V8 CPU samples inside native `drawTech` (ms/work tick)

Two uninstrumented V8 profiles per save, each over a 100-work-tick window. Native counts are exact only where noted;
the profile is a sampling profiler and its `hitCount` is not a function invocation count.

| Sampled CPU leaf / subsystem         |                                      Early |                Mid |               Late | Interpretation                                                                                                                  |
| ------------------------------------ | -----------------------------------------: | -----------------: | -----------------: | ------------------------------------------------------------------------------------------------------------------------------- |
| `drawTech` self                      |                                       0.17 |               0.22 |               0.22 | Loop/bucketing/sort setup and residual direct work; not the inclusive draw total                                                |
| `checkTechPath`                      |                                       0.47 |               0.46 |               0.48 | One source call for each of 834 definitions per draw; 834 × 214/210/200 total calls                                             |
| `checkOldTech`                       |                                       0.23 |               0.27 |               0.30 | Called only after a path passes; path-pass count was not separately instrumented                                                |
| `checkTechQualifications`            |                                       0.14 |               0.17 |               0.20 | Initial offer qualification plus `setAction` recheck; exact callback count not retained                                         |
| `checkTechRequirements`              |                                       1.09 |               1.00 |               0.79 | Runs for qualified non-old actions; recursively reads queue requirements where applicable                                       |
| Offer sort and raw price closures    | Included in residual/anonymous native rows |           Included |           Included | Native comparator calls `cost.Knowledge()` or `cost.Omniscience()`; no isolated timer/call counter in these profiles            |
| `checkAffordable` frame self         |                                       0.04 |               0.06 |               0.08 | Two source calls per `setAction` that passes the qualification recheck; excludes nested cost work                               |
| `adjustCosts` frame self             |                                       0.07 |               0.40 |               0.82 | Adjustment-chain construction only; nested adjusters and price closures execute under their own frames                          |
| Vue reactive `get` self              |                                       2.35 |               3.05 |               8.48 | State getter work on the draw stack, heavily weighted by completed-row callbacks late                                           |
| `govActive` + `technocracy`          |                                       0.03 |               0.12 |               3.44 | Native callbacks reached through conditions/cost adjustments; included in rows above only as CPU self samples, not extra totals |
| `parseHTML`                          |                                       0.97 |               1.53 |               3.54 | All draw-generated HTML, offered and completed rows plus headings                                                               |
| `toNodes`                            |                                       0.90 |               1.24 |               1.49 | DOM conversion/creation helper work, all draw rows                                                                              |
| `querySelector(All)`                 |                                       1.71 |               1.95 |               2.65 | DOM lookup/removal work; includes per-action cleanup and row paths                                                              |
| `createElement` + `appendChild`      |                                       0.11 |               0.19 |               0.27 | Sampled native DOM calls on the draw stack                                                                                      |
| Remaining named and anonymous leaves |                         Remainder to 10.65 | Remainder to 13.74 | Remainder to 28.61 | Includes native adjuster bodies, localization, Vue binding helpers and DOM operations                                           |

`drawTech` inclusive sampled CPU was **10.65 / 13.74 / 28.61 ms per work tick**. The corresponding exclusive phase
timers were **12.590 / 15.598 / 32.599 ms**. The distinction is expected: V8 samples renderer CPU, while the phase
timer is elapsed time around the synchronous call.

### Completed rows versus offered rows

The V8 stack was grouped by the `drawTech()` old-row callback location, not by a guessed function name. The completed
row callback consumed **2.18 / 4.18 / 20.93 ms** of sampled CPU per tick. The late share is mostly native state and
price work: reactive getters alone account for 6.93 ms/tick; native `govActive` and `technocracy` callbacks account
for another 2.65 ms/tick; `adjustCosts` self is 0.80 ms/tick. Qualification and affordability frames add 0.42
ms/tick before the other native cost closures and anonymous work. Those operations still run for completed rows and
cannot be removed while preserving the requested native callbacks and price/affordability semantics.

Inside that completed-row callback, sampled HTML/node-construction helper CPU was **0.76 / 1.35 / 4.44 ms/tick**.
`parseHTML` plus `toNodes` was **0.59 / 1.11 / 3.82 ms/tick**. Selector helpers were another **0.17 / 0.34 / 1.28 ms/tick**,
but are excluded from the removable bound because they also serve native removal and affordability paths. Treat 4.44
ms as a maximum removable bound, not a predicted saving: no attached old-row tree or old-row binding exists after
the current discard. Completed-row construction helpers account for 35% of their early callback, 32% mid, and 21%
late; the rest is native evaluation. The offers-only observer captures **12.39 / 20.60 / 4.00** offered rows per draw on average and
their DOM, same-draw prices, affordability classes, and bindings remain required.

The early/mid/late completed-row and offer results are profile-stack samples, not a second render or a reconstructed
Research implementation. The profile cleanly isolates rows for self-time attribution but does not expose invocation
counts for the private native functions. The report does not convert profiler sample hits into call counts.

### Capture, workspace, binding and GC

Late per-work-tick elapsed measurements from the existing bounded phase run:

| Phase                            | ms/tick late | What it covers                                                            |
| -------------------------------- | -----------: | ------------------------------------------------------------------------- |
| Binding/DOM observer callback    |        0.156 | Read offered rows, match same-draw markup and collect control generations |
| `research.catalog.registry-read` |        0.247 | Retained definition validation/index access                               |
| Workspace create                 |        0.062 | Keep player panel and create scratch workspace                            |
| Workspace release/integrity      |        0.038 | Reattach player panel and release scratch workspace                       |
| Discovery preparation            |        0.069 | Checkpoint, control snapshot and settings bookkeeping                     |
| Generation capture               |        0.017 | Capture selected control generations                                      |
| Binding event bookkeeping        |        0.002 | Six events/tick late; observer only                                       |
| Settings restore                 |        0.009 | Restore player's selected tabs and animation setting                      |
| Registry restatement             |        0.008 | Build the immutable observed offer result                                 |

These phase rows do not all add directly: the observer, generation capture, and catalog work are nested in the native
draw phase, and `incl:` rows are inclusive. Workspace/capture operations are small relative to native `drawTech`.
The available profiles report 1.94 ms/tick of total late-window V8 GC self time outside any Research call stack. GC
samples have no synchronous caller stack, so Research-attributable GC is **not identified**; it is not assigned to
the draw. No per-node logging or stack capture was used.

The only measured binding events are the offered/scratch stream. The old `#oldTech` target is removed before those
rows are constructed, so old rows do not produce captured control registrations. Native offered `setAction` bindings
are required to preserve the current binding generation and stale-control refusal.

## Effects and authority boundary

| Operation                                               | Observed effects                                                                                                                         | Classification and disposition                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `drawTech` enumeration, `checkTechPath`, `checkOldTech` | Reads action definitions, route and tech levels; `removeAction` and panel clearing mutate DOM                                            | Keep the native calls and cleanup. Path and old-tech partitioning define the native offer list and stale DOM cleanup  |
| `checkTechQualifications`                               | Reads race/genes/tech and invokes action `condition()` callbacks                                                                         | Callback effects are not guaranteed by the function name; keep all native evaluations                                 |
| `checkTechRequirements`                                 | Reads current tech and queue; mutates only its local `failChecks`/`predList`, while native `reqs()` may be callback-valued               | Keep native recursion and queue semantics                                                                             |
| Native offer sort                                       | Calls raw native Knowledge/Omniscience cost closures                                                                                     | Current offer order depends on current callback result; do not memoize or restate                                     |
| `checkAffordable` / `adjustCosts` / `checkCosts`        | Read action/resource pools and execute current adjustment/cost closures; affordability class is native                                   | Required for exact affordability, adjusted prices and row refusal semantics; keep every call                          |
| Offered `setAction`                                     | Removes/recreates scratch DOM, renders native price/affordability classes and binds action handlers                                      | Required current offers and control generation; mount suppression keeps it scratch-only                               |
| Completed `setAction(old=true)`                         | Repeats qualification and current/max affordability; creates only detached markup because `#oldTech` is absent; binding target is absent | The checks remain required; only the measured helper bound could be avoided, with no existing supported hook to do so |
| `loadTab` / native `swapTab`                            | Writes selected-tab settings and clears/draws tab DOM; scratch discovery restores settings and player's panel                            | Transient game setting/UI effects are owned by discovery and restoration; do not bypass the native draw               |
| `vBind` / Vue                                           | Registers controls for offered rows; no old-row binding event after discard                                                              | Preserve offered binding generation; no player Research panel is replaced by the scratch panel                        |
| Candidate cost/condition callbacks                      | Arbitrary native closures reached through qualification, sorting, and pricing                                                            | Not safe to classify as read-only absent a complete callback audit; no call is omitted                                |

## Candidate review

### A. Offers-only scratch DOM reduction

The code already removes `#oldTech` immediately after the `#resContent` bind and before the native completed-row loop.
Thus the expensive completed rows are not rendered into an attached subtree and are not observed or bound. The old
loop still performs current native qualification and both affordability checks, then creates tiny detached markup.
Suppressing that last construction would require an extra native hook or a reimplementation of `setAction`'s old
path; neither is available through the current capability port. The maximum measured helper bound (4.44 ms late,
1.35 ms mid) fails the screen, so no test-bundle candidate was added.

### B. Redundant DOM work inside a draw

`loadTab` clears non-target panels; `drawTech` still calls `removeAction` for each path-compatible action, and
`setAction` again removes each row before creating it. These are DOM-only operations on the scratch panel, but no
profiled or phase evidence shows a safe way to bypass them through existing scratch/mount controls. The workspace,
capture, and restoration subtotal is under 0.4 ms/tick late. Do not add a selector override or native method patch for
this return.

### C. Redundant same-draw calculations

Offers execute separate native affordability (`checkAffordable` false/max) and displayed price calculation. The
native callbacks are dynamic and potentially effectful; the former decide classes and the latter is the same-draw
price capture. The source does not prove equivalent callback results or no side effects across those evaluations.
No callback result is cached or skipped.

## Why prior Research attempts do not establish a safe shortcut

- The 2026-10-11 cache experiment observed stale native affordability/bindings in reused Research rows and fell back
  to a fresh native draw. The lower whole-run `TaskDuration` did not preserve its draw reduction. A no-purchase tick
  did not establish unchanged condition, price, pool, or bindings.
- Stage 4D's sparse protected Research validation did prove a fresh draw could validate live offers, but every
  protected draw invalidated the shared sample and caused a later Research-owner redraw: 123 validation requests
  yielded 246 additional draws. The measured `ScriptDuration` comparison was not the renderer CPU authority.
- Stage 4F.3 corrected that measurement boundary. Its matched renderer-process CPU and `TaskDuration` windows show
  recurring work inside the controlled runner and establish that phase timers/`ScriptDuration` cannot be exchanged
  for renderer CPU. This audit reuses its calibrated method; it adds no market or Research validation draw.
- The headless Research feasibility report matched sampled eligibility/requirements but not authority: its retained
  adjusted-cost closures became stale after trait/government/route/research changes, and its affordability
  reimplementation did not cover native regional pools and special cost keys. Its scan was 6.9–8.2 ms each and
  3.6–6.1% of a work cycle. It did not prove current native offer price or affordability.

These attempts established where evidence is missing; they do not authorize prior-cycle catalog reuse, eligibility
reimplementation, or bypass of the current native draw.

## Keep/revert and next target

**Keep: report only. Revert: no source change was made.** No promotion candidate, exact behavior parity, player UI
replay, or candidate timing A/B was run because the candidate failed the performance screen before implementation.
Production bundle, native game source, and `tools/` remain unchanged. Existing production behavior continues to have
one fresh native Research draw per processed cycle and the existing post-purchase redraw.

If Research remains a target, first measure one bounded native-call counter/ timer pass in the existing work-cycle
draw for `checkOldTech`, `checkTechQualifications`, `checkTechRequirements`, sort comparator/cost closures,
`checkAffordable`, and `adjustCosts`. This audit's V8 profiles locate their self CPU but do not provide invocation
counts for private functions. Any later idea must preserve those calls and target a measured non-callback portion;
the completed-row DOM work alone does not justify an adapter mechanism. Otherwise the next lower-risk target is the
separately measured repeated native action-cost probing, with the same freshness/effect proof required before reuse.
