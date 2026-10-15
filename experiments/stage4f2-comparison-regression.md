# Stage 4F.2 — Restore the Goal-Acquisition Comparison Baseline

## Decision: D — the strategy comparison is restored; performance evidence is too variable to decide the 2% budget

Stage 4F.1 enlarged the Research authority validator without restoring the historical signal contract used by F/G.
The exact pre-fix G replay proposed signals but accepted none, so the old G result was effectively an ordinary Market
run. Stage 4F.2 restores F/G only through the test surface. With that correction, G and J make the same native
Research purchases, Market assignments and route operations through p30000. The Research and Market stale-batch
fences pass their exact Chromium adversarial probes. Two diagnostics-free G/J pairs show renderer ScriptDuration
differences of +8.5% and −9.5%, with renderer task time reversing direction as well; the spread prevents a
reliable comparison against the 2% budget. Do not proceed to Stage 4G from this evidence.

## Regression reproduction and repair

F/G returned the original `evaluateGoalAwareAcquisition()` result with `acceptedAuthoritySignal ?? decision`. The
Stage 4F.1 validator had been expanded to require the authoritative Research envelope (selected prestige,
permission and trigger state, offer observation and set identities, Research price, grant/applicability evidence,
and goal relationship identity). Only J's protected fresh-validation path constructed that envelope. Consequently,
the F/G signals were rejected before reaching the Market planner.

The regression was reproduced before repair by a new failing captured-route contract: the explicit historical test
path passed an F signal to the planner, but the planner received `undefined` instead of the demanded `Source`
resource. An exact pre-fix G replay independently showed proposed signals but zero accepted plans; it ended at
p30000 with High Tech 3, no Hunter Process and $2,751,826.80 Money, matching B-like behavior.

The repair adds a separate legacy signal validator behind the existing test-surface guard. The runner enables it
only for F and G. It does not relax J's authoritative schema, and incomplete legacy signals cannot enter J. J's
accepted authoritative evidence remains the only evidence passed to the final Research fence. The comparison
compatibility flag, validator and hook are absent from the production bundle. The test-only path preserves normal
route-count fencing and routes all accepted F/G plans through the same Market planner and native route operations.

## Comparison definitions and input identity

| Arm | Behavior                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| B   | Ordinary Market automation; no goal-aware priority.                                                                     |
| F   | Historical Stage 4A goal-aware priority; allows the demanded-resource Money-floor exception.                            |
| G   | Historical Stage 4B goal-aware priority; preserves the configured Money floor. This is a historical control only.       |
| J   | Sparse protected fresh Research validation; preserves the configured Money floor and enforces the final Research fence. |

The exact Chromium runs used the accepted pinned Human/Magic save, seed 42, epoch `2026-09-21T00:00:00.000Z`,
the `goal-derived-conjunctive` Gather intervention, p30000 horizon and the same settings. The game snapshot was
`test-artifacts/game/evolve-deadspace.js`, SHA-256
`f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`, built from pinned upstream
`db38e2af831907d49aeb5348d678d8d8745d6c3f`. Save SHA-256:
`b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`. Settings SHA-256:
`a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`; effective settings SHA-256:
`7a8aa4367cc9e28a7ece76a6c7c502b512acd9eaf9666c1b37c59f8d339ca804`. The exact-runner SHA was
`f9d010f4aec75152e78dc5bc1b6f776613e4646880ecd99bcdb6939a7d8c8a19`. Missed-opportunity sampling was disabled.

## Signal, plan and native-operation counts

Counts distinguish signals proposed by acquisition, signals accepted by the Market adapter, changed planner
decisions, distinct deduplicated plan records, and native route operations. They are not interchangeable.

| Arm | Proposed signals | Accepted signals | Changed planner decisions | Distinct accepted / changed plans | Native route operations |
| --- | ---------------: | ---------------: | ------------------------: | --------------------------------: | ----------------------: |
| B   |                0 |                0 |                         0 |                             0 / 0 |                   6,302 |
| F   |               76 |               76 |                        76 |                           70 / 70 |                  11,846 |
| G   |              123 |              123 |                       123 |                         109 / 109 |                   6,364 |
| J   |              123 |              123 |                       123 |                         109 / 109 |                   6,364 |

The Stage 4B reference of 109 signals and 109 changed records refers to distinct plan records deduplicated by the
historical runner. The current runner also records every Market decision call, giving G/J 123 proposed and accepted
signals and 123 changed decisions. Its 109 distinct accepted and changed plan records match the historical
instrumentation semantics. G therefore demonstrably sends goal-demand signals to the planner; it does not resemble
ordinary B.

## p30000 progression and G/J behavior

| Checkpoint          | B                       | F             | G             | J             |
| ------------------- | ----------------------- | ------------- | ------------- | ------------- |
| Hunter Process      | Not purchased by p30000 | p9368         | p9392         | p9392         |
| Electronics         | Not reached             | p11016        | p11184        | p11184        |
| High Tech           | 3                       | 6             | 6             | 6             |
| Titanium technology | —                       | 2             | 2             | 2             |
| Uranium technology  | —                       | 1             | 1             | 1             |
| Factories           | 1                       | 2             | 2             | 2             |
| Final Money         | $2,751,826.80           | $1,286,153.61 | $2,493,467.57 | $2,493,467.57 |

F and G retain their historical different money-floor behavior. In G and J, the configured minimum sale rate of 500
and minimum percentage of 50 remained active. Both had the same minimum Money sample: $11,608.73 at p11600, with
all dense Money samples positive. G and J had identical p8008 assignments (Iron −52, Oil +36, Steel −5), all final
resource holdings, final route assignments, technology levels, construction, and Research purchase sequence.
Both ran 3,750 work ticks, accepted 123 demand signals, applied 6,364 native route operations, and had the same
single native Market refusal `native-result-mismatch` at p24856. There was no remaining G/J Market mismatch to
explain: the Stage 4F.1 p8008 difference came from the broken G comparator.

The restored G route is a test comparison arm, not a production integration candidate. This slice adds no
production opt-in, Research snapshot handoff, catalog framework, Research purchase or reservation change, route
override, or relaxation of ordinary Market Money protections.

## Exact native boundary probes

**Research stale binding:** J accepted fresh generation 351. The probe invoked the native `tech-anfo` action,
which changed the selected generation to 352. The already planned batch contained an Oil import. The existing
`research-binding-generation-stale` refusal occurred before route application; applied operation count did not
change and no stale Oil operation ran. The final fence performed no additional protected Research draw.

**Market route count:** J planned a non-empty batch with 93 native routes. The probe used the native Market action
to remove one Lumber route, changing the count 93→92. The existing `market-route-count-stale` refusal prevented
every planned operation from running. At p8016, the ordinary Market owner applied a later current route plan,
confirming it remained usable.

Both probes ran in the exact Chromium runner against the pinned game bundle. The separate `tools/` repository and
pinned upstream checkout were left untouched. No missing native-parity fixture was created or assumed.

## Performance and timing variability

Two exact diagnostics-free G/J pairs ran with identical inputs and dense Money sampling. `--disable-perf` disabled
phase instrumentation; Chromium CDP still reported renderer ScriptDuration and task duration. Pair 1 measured G
1.5816s ScriptDuration / 662.67s task time and J 1.7161s / 735.97s: J was +8.5% ScriptDuration and +11.1% task
time. Pair 2 measured G 1.7927s / 790.11s and J 1.6232s / 680.10s: J was −9.5% ScriptDuration and −13.9% task
time. The direction reversal and large between-run spread overwhelm the 2% renderer-JavaScript budget. The
four-run aggregate ScriptDuration is nearly flat (J −1.0%), but averaging these noisy, direction-reversing pairs
does not establish that the fence meets the budget.

| Pair | G ScriptDuration | J ScriptDuration |   J/G | G task duration | J task duration |
| ---- | ---------------: | ---------------: | ----: | --------------: | --------------: |
| 1    |          1.5816s |          1.7161s | +8.5% |         662.67s |         735.97s |
| 2    |          1.7927s |          1.6232s | −9.5% |         790.11s |         680.10s |

Each no-phase run performed 123 final-fence recaptures in J. The runner's test clock is disabled with phase
instrumentation, so those two runs report zero per-fence milliseconds; that value is not treated as a measurement.
The separate instrumented B/F/G/J replay measured 123 final-fence checks at 719.7ms total (5.85ms mean, 9.3ms
maximum). These are direct fence measurements from an instrumented workload, not a subtraction of the different
whole-run G/J workloads.

The same instrumented replay counted 3,830 native Research draws for G and 4,076 for J. Native draw plus DOM
generation took 62,123.5ms for G and 70,437.5ms for J; computed-requirements capture/draw took 8,562.4ms and
9,724.2ms respectively. Instrumented total work-cycle time was 271,987.5ms for G and 297,128ms for J across
3,750 work ticks. `autoMarket` took 10,322.3ms / 11,162.3ms and route adjustment took 34,149.1ms / 37,570.3ms
(G / J). These full-workload phase differences include the differing draw and Market call counts; they are not
attributed to the final fence alone. The one-pair Stage 4F.1 renderer result is invalid as a comparison because
G's historical signals were rejected.

## Verification

- Added a failing captured-route regression contract before the test-only compatibility repair; the repaired
  focused contract passes.
- Captured-route, Stage 3X Market test-surface, and Stage 4A experiment contracts pass.
- Exact p30000 B/F/G/J progression replay passes the historical checkpoint assertions, including G's 109 distinct
  accepted and changed plan records and exact G/J outcome parity.
- Exact Research and Market native boundary probes pass, including later ordinary Market owner activity.
- Production bundle rebuild contains no legacy compatibility flag, validator or test hook name.
- `npm run check`: all five checks passed, including 346 test files, both TypeScript configurations, lint and
  formatting.
- `npm run build` passed after tests; Chromium runner contracts passed for determinism, isolation, reload
  continuity, paused-game behavior and cleanup.
- `git diff --check` passed.

The performance decision is D. The comparison authority, restored G behavior, J authority fence, and native
boundary evidence are established; the renderer budget decision is not. Stage 4G should wait for a repeatable
measurement design that separates the roughly 2% target from the observed timing spread.
