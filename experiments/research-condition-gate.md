# Research condition gate experiment

Date: 2026-10-16  
Branch: `experiment/research-condition-gate`  
Upstream reference: `DeadSpace` `db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Question and result

Can the userscript avoid the cost of completed-tech `addAction()` callbacks during its offers-only scratch Research capture, without changing Evolve?

**Yes, experimentally.** A candidate-only synchronous scope uses the retained native `actions.tech` action objects, temporarily changes only completed actions' `condition`, and restores each original descriptor before returning. A and B used the same unmodified game file (`test-artifacts/game/evolve-deadspace.js`, SHA-256 `e39fc2ef9076d0e0afe929be6588c89fc047a4641bd16ccf37644b94574dc521`). No upstream game source was edited or rebuilt for A/B. The gate is absent from the normal production userscript bundle; only the `--research-condition-gate` build contains it.

B preserved the measured behavior and recovered about **55% of C's late renderer-CPU reduction in the same comparison** (5.0% versus A, compared with 9.1% for C). Late work-cycle latency was close to C. Early/mid renderer CPU was effectively unchanged. This is enough to retain B as an experimental candidate, but its CPU result is borderline for “most of C” and does not justify enabling it in production without a repeat benchmark and overhead work.

## Candidate behavior and safety checks

The candidate wraps only `captureNativeDiscoveryDraw` on the offers-only path. Captures that include granted technologies and normal player Research rendering do not enter the scope. If the retained registry, live root, levels, descriptors, or scope is not established, the existing native draw runs unmodified. The first draw can establish the registry and run normally.

Completion classification mirrors pinned `checkOldTech()` at `src/actions.js`: the native action's grant technology and threshold are checked first, followed by the exact ten special-key checks (`fanaticism`, `anthropology`, `deify`, `study`, `isolation_protocol`, `focus_cure`, and four `vax_strat*` keys). The candidate obtains the action objects from the already-retained native registry; it does not capture another registry. The tested saves exercised `fanaticism`, `anthropology`, and `study`; the remaining special branches are implemented from the pinned switch but were not independently forced into synthetic save states.

A descriptor preflight rejects unsafe inherited/accessor/extensibility cases. Successful replacement records the original own descriptor; `finally` restores it exactly or deletes the temporary own property when none existed. Candidate hook counters exist only when the smoke harness defines `window.__EA_TEST_HOOKS__`.

| Recovery case                                                  | Observed result                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Normal late scope                                              | 41,869 installed, 39,336 false-return condition calls, 41,869 restored, 0 failures            |
| Intentional exception from native Research DOM lookup          | 41,869 restored, 0 failures; the injected draw error was observed                             |
| Missing `#tech` / `#oldTech` via `getElementById` interception | 2,924 restored, 0 failures; 28 missing-node interceptions were observed                       |
| Reentrant captured-root replacement during native DOM append   | Triggered a synthetic Vue root replacement inside the draw; 1,877 restored, 0 failures        |
| After each released scope                                      | Ordinary Research click rendered offers and completed rows; gate-event count did not increase |

The root-replacement case is a forced harness recovery test, not a normal game progression. It replaced the capture's observed Vue root with a synthetic root during the synchronous native draw. The game's own Research UI still rendered after the scope was released. Changing technology levels were exercised through the changing-state progression runs below; automation state comparisons remained equal.

The A/B player-render smoke compared the exact rendered offer IDs, titles, and native `data-*` price attributes after clicking Research. They matched for all three saves: early (17 offers), mid (18), and late (4). The current offer callbacks therefore remained active and produced the same native offer rows and prices. Gate counters show zero scope events from the later player Research render.

## Three-arm comparison

- **A:** original DeadSpace game and original automation bundle.
- **B:** the same original DeadSpace game and candidate userscript condition gate.
- **C:** the prior experiment's patched-game callback bypass, included only as a performance reference.
- Exact Chromium runner, seed 42, identical settings and save inputs, 400 warm-up periods, 800 measured periods (100 work ticks), four alternating repetitions per save. Tables show per-arm medians.
- Renderer-process CPU is primary; CDP `TaskDuration` is a cross-check. The game file is identical for A and B; C uses the previously patched snapshot. A/B/C progression and offer checks were run separately from CPU sampling.

### Renderer CPU and TaskDuration

| Save  | Renderer CPU A / B / C (s) | B vs A | C vs A | TaskDuration A / B / C (s) |
| ----- | -------------------------: | -----: | -----: | -------------------------: |
| Early |         9.18 / 9.09 / 8.89 |  −1.0% |  −3.2% |      7.893 / 7.820 / 7.605 |
| Mid   |     10.56 / 10.575 / 10.09 |  +0.1% |  −4.5% |      9.070 / 9.210 / 8.735 |
| Late  |      18.05 / 17.15 / 16.41 |  −5.0% |  −9.1% |   15.860 / 15.290 / 14.584 |

The earlier C experiment reported a 13.6% late CPU reduction in its own four-run comparison; the same-run three-arm C result here is 9.1%. B's late CPU saving (0.90 s/window) is 55% of the same-run C saving (1.64 s/window). B is not close to C in early/mid CPU because neither arm saves much there.

### Work-cycle latency

Median of each arm's four-run cycle percentiles, milliseconds:

| Save  |    A p50 / p95 / p99 |   B p50 / p95 / p99 |    C p50 / p95 / p99 |
| ----- | -------------------: | ------------------: | -------------------: |
| Early |   36.7 / 59.1 / 77.6 |  35.2 / 55.2 / 74.2 |   36.4 / 55.6 / 77.0 |
| Mid   |   44.5 / 67.2 / 82.6 |  42.8 / 62.6 / 77.8 |   42.6 / 62.1 / 81.0 |
| Late  | 99.1 / 129.8 / 139.2 | 79.6 / 99.7 / 111.4 | 78.2 / 100.8 / 108.8 |

B's late p50/p95/p99 was near C. Early and mid differences were small and not consistent across CPU and latency measures. Four-repetition tails were noisy, so these are comparative measurements rather than timing guarantees.

### Research draw and callback counts

The prior traced A/C 800-period windows observed 114/101 Research draws in early/late and 3,790/26,400 completed callbacks in A, with zero in C. Its mid counts were 110 draws and 7,683 completed callbacks. In this candidate's separate instrumented smoke windows, B opened 575/561/149 gate scopes for early/mid/late (4,000/4,000/800 periods); the corresponding false-return condition counts were 25,250/44,180/39,336. Every B scope enumerated the retained registry.

These draw counts are from explanatory traces, not the CPU runs. The B trace windows are not like-for-like with the older A/C trace windows, and the much higher early/mid scope totals should not be read as an exact draw-rate comparison. The three-arm performance run itself did not carry tracing hooks, to avoid adding measurement overhead. This leaves same-window native draw counts across all three arms unestablished; the CPU and latency comparison remains the benchmark authority.

## Progression and risk checks

A/B/C changing-state progression runs used 400 warm-up plus 4,000 measured periods, checked every 1,000 periods, on early/mid/late saves. The compared tech levels, days, resource amounts, empty-resource/shortage sets, buildings, queues, research queues, milestones, and city values had zero differences between B and A or C and A at all checkpoints. No control calls threw. Tech gains occurred in early (18) and mid (8); late remained at 0 tech changes. Existing diagnostics were equal by arm (early 3 errors, mid 2, late 0).

Separate post-progression Research UI smokes confirmed the offers and price attributes listed above. No byte-identical save parity was required. The native original game SHA-256 was the same for A and B; C is not a deployment candidate.

## Decision and production integration plan

Retain B as an **experimental candidate only**. It clears a narrow majority of C's same-run late CPU gain and nearly matches C's late latency, while its synchronous restoration and behavior checks were clean. The gain is modest, early/mid CPU is neutral, and same-window A/B/C draw counts were not measured.

Before production integration:

1. Repeat the three-arm comparison with equal-window draw counts collected in a separate trace pass, plus a larger number of alternating CPU runs.
2. Profile the wrapper's descriptor preflight and restoration cost; keep the synchronous scope bounded to offers-only native scratch draws.
3. Preserve fail-closed behavior for root/registry identity and descriptors, plus exact descriptor restoration on all exits.
4. Keep granted-tech captures and player Research rendering outside the gate, then repeat offer/price and changing-state progression checks on a fresh upstream snapshot.
5. Only then consider moving the candidate behind an explicit production opt-in; do not modify upstream Evolve.

No production enablement is included in this experiment.
