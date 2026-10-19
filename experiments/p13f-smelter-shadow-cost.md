# P13F — Smelter shadow-comparison cost

Date: 2026-10-19  
Repository: `deadspace` at `d0a61b43f930a298c465afab51742f6de96904f1`  
Game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Findings

**Optimization — A, for the proven-invariant owner path.** On the matched P13D.1 state, P minus I was **+2.42 μs per comparison** by CDP `TaskDuration` (95% interval +1.71 to +3.13 μs) and **+2.23 μs** by renderer CPU (+0.06 to +4.40 μs). Both calibrated counters resolve the difference in favor of I, though the renderer interval is close to zero. On the sensitive pure fixture, I correctly falls back to the planner after strict validation; its proof adds cost, and P was **6.25 μs cheaper** (TaskDuration interval −7.24 to −5.25 μs; renderer interval −7.49 to −5.42 μs).

**Correctness — Pass.** The complete proposed decisions, ordered command intentions, and allocations matched between P and I in the isolated fixtures and the owner replay. G, N, Q-I, Q-P, and U had the same ordinary save export (`81b95d3a217ee6a9b35d70db07297e90e3c625b1ef668212a016dc24582e8e6d`), 95,388 ordered native invocations, and 1,746 random calls. The ordinary incumbent Smelter commands still ran. The test-only P mode and phase profiler are absent from the normal generated userscript.

**End-to-end CPU — C, unresolved.** Four repeated G controls varied by **12.70%**, so they did not resolve a 2% effect. The experiment stopped before the G/N/I/P/U factorial; it supports no complete G → Q percentage below or above 2%.

## Comparison methods and safe trust boundary

The test bundle exposes P, which always calls the existing `planSmelter()`, and I, which calls `proveSmelterSteelTimeInvariance()` and plans only if the proof is unavailable. Both consume the same frozen incumbent snapshot and hypothetical input. The result retains the proposed full `SmelterDecision`, normalized commands, and allocation so differential checks cover more than a command hash. The owner still executes its unchanged native decision.

The generic snapshot and comparison path keeps recursive frozen-graph validation for untrusted inputs. In the real owner path, a full comparison snapshot is created only after a proposal is present. That owner snapshot carries a private marker on a shallow clone of the input returned by `readInput`; a private helper then constructs the hypothetical by changing only `steelTimeToRequired`. After both private markers match, I calls the policy predicate for that exact one-field variant. The public proof API always performs recursive frozen-graph and shape validation; unbranded inputs use that strict proof. The marker is not attached on ordinary no-proposal cycles, and caller-supplied snapshots do not receive it.

No proposal requires an owner observation and one proposal-provider read to discover absence. In the ten-cycle N window the owner observed ten times and the provider returned `undefined` ten times, with zero structural proposal validations, full incumbent snapshots, hypothetical inputs, invariance proofs, planner calls, or changed commands. The absence check returned before full snapshot construction. This bounded observer does not scan Research or Construction catalogs, walk the dependency graph, or issue another native resource, demand, or control read. G made no observer calls.

The synthetic Q and U proposals below are test-only. They are not candidate evidence available to ordinary runtime and do not authorize any allocation or purchase.

## Isolated in-page measurements

The experiment used a single warmed Chromium renderer with the same frozen snapshot and request for both methods. It alternated P/I order and measured 12 paired batches per fixture, **2,577 calls per batch**, with a same-count empty-call control. The renderer CPU delta is primary; CDP `TaskDuration` is the calibrated cross-check. Intervals are paired 95% t intervals with 11 degrees of freedom. Native-clock measurements are explanatory only.

| Frozen input                          | Method | TaskDuration minus empty (μs/call) | Renderer CPU, P minus I (μs/call) | Native clock minus empty (μs/call) |
| ------------------------------------- | ------ | ---------------------------------: | --------------------------------: | ---------------------------------: |
| P13D.1 first-cycle state, period 1792 | P      |                   6.55 (5.69–7.40) |            +2.23 (+0.06 to +4.40) |                   6.50 (5.64–7.36) |
| P13D.1 first-cycle state, period 1792 | I      |                   4.13 (3.72–4.53) |                                 — |                   4.07 (3.65–4.49) |
| Sensitive pure fixture                | P      |                   3.07 (2.75–3.39) |            −6.46 (−7.49 to −5.42) |                   3.01 (2.69–3.33) |
| Sensitive pure fixture                | I      |                  9.31 (8.13–10.50) |                                 — |                  9.23 (8.04–10.42) |

Positive P-minus-I means I is cheaper. The table shows method costs after subtracting each batch's empty-call control; P-minus-I intervals are computed from paired deltas. Batch order alternated within each pair. The live input had `productionSmelting: required`, `steelDemanded: true`, and `steelTimeToRequired: 70.05261073971762`; the proposed +10 Steel remained represented. Both methods returned `subMetal:Iron`, `addMetal:Steel`. The sensitive fixture was a valid pure required-mode input with Steel not demanded; both paths called the planner and returned the same complete decision.

### Instrumented phase cohort

Phase timers ran in a separate cohort and aggregated 2,500 calls per method. They do not contribute to the timing table above. Values below are mean elapsed microseconds per call.

| Phase                                             |        P13D.1 P |        P13D.1 I | Sensitive P |     Sensitive I |
| ------------------------------------------------- | --------------: | --------------: | ----------: | --------------: |
| Proposal structural validation, rejected proposal |               — |               — |           — | 4.12 standalone |
| Snapshot construction                             | 1.96 standalone | 1.96 standalone |           — |               — |
| Quantitative demand calculation                   |            0.28 |            0.20 |        0.24 |            0.20 |
| Hypothetical input construction                   |            0.20 |            0.28 |        0.16 |            0.12 |
| Recursive frozen-data validation and shape check  |               — |               — |           — |            6.80 |
| Invariance predicate                              |               — |            0.20 |           — |            0.12 |
| Pure planner                                      |            1.24 |               0 |        1.08 |            0.68 |
| Command normalization                             |            2.12 |               0 |        1.12 |            1.08 |
| Proposed allocation and feasibility               |            3.24 |            2.32 |        1.56 |            1.08 |
| Diagnostic result object                          |            0.68 |            0.84 |        1.00 |            0.80 |

The valid proposal admission measurement, including the comparison, was 6.40 μs per call in the instrumented diagnostic cohort. Individual phase values come from native-clock aggregation and are not an independent renderer-CPU breakdown. The owner path establishes the one-field variant through construction and private markers; recursive validation is timed on the sensitive untrusted fixture.

The separate CDP HeapProfiler cohort sampled 10,308 calls per row after a forced GC. It reported net heap-used deltas of +3,916 B / +305,276 B (P/I) for the live fixture and +38,264 B / +4,696 B for the sensitive fixture. Sampled allocation totals were 16,728 B / 299,840 B and 0 B / 16,584 B respectively. The profiler samples and post-call heap deltas were inconsistent across fixtures and were not used to rank P/I; they are preserved as observations in the raw JSON.

## Bounded owner workload characterization

Each row below covers ten owner workticks from the same pinned save and seed. The Q proposal requests +10 Steel and is synthetic. The malformed U proposal is also synthetic. `changed commands` counts proposed native intentions that differ from the incumbent.

| Mode                               | Provider reads | Structural checks | Rejected | Valid / represented | Invariant | Sensitive / planner calls | Changed commands | Unknown commitment coverage | Full snapshots |
| ---------------------------------- | -------------: | ----------------: | -------: | ------------------: | --------: | ------------------------: | ---------------: | --------------------------: | -------------: |
| G, ordinary owner                  |              0 |                 0 |        0 |               0 / 0 |         0 |                     0 / 0 |                0 |                           0 |              0 |
| N, no proposal                     |             10 |                 0 |        0 |               0 / 0 |         0 |                     0 / 0 |                0 |                           0 |              0 |
| Q-I, synthetic valid proposal      |             10 |                10 |        0 |             10 / 10 |        10 |                     0 / 0 |                0 |                          10 |             10 |
| Q-P, same synthetic valid proposal |             10 |                10 |        0 |             10 / 10 |         0 |                   10 / 10 |                0 |                          10 |             10 |
| U, synthetic malformed proposal    |             10 |                10 |       10 |               0 / 0 |         0 |                     0 / 0 |                0 |                           0 |             10 |

N made ten owner observations and ten provider reads; each provider result was absent, so it performed no structural validation, snapshot, or comparison. Q-P and Q-I produced identical proposed decisions and commands; P performed ten reference planner calls, while I proved the captured invariant ten times and performed none. All ten synthetic Q rows had unknown commitment coverage. This window characterizes the tested current state; it is not a long-run proposal frequency estimate.

## End-to-end CPU attempt

The exact runner used four fresh G control windows. Each window replayed 1,784 warm-up periods plus the 8-period probe, then measured 800 periods (100 owner workticks). All windows used the same save, settings, seed, epoch, and bundle. Renderer CPU is reported for the identified game renderer; `TaskDuration` is its cross-check.

The G renderer CPU windows were 11.73, 11.68, 11.03, and 12.52 seconds (range/mean 12.70%). Their `TaskDuration` values were 10.12, 10.12, 9.51, and 10.90 seconds. This failed the initial G/G 2% control gate.

Because the G controls failed, no N/Q-I/Q-P/U cells ran. The full controls and calibration process rows are recorded in the raw JSON. No microbenchmark extrapolation is used as an end-to-end result.

## Environment, identities, and reproduction

- Chromium: `HeadlessChrome/151.0.7922.71`; pure comparison renderer PID: `35388`.
- P13F test bundle SHA-256: `9482a39f577c70b4c45471a71720d2a605d71942ca0deb29d3fa11910c436334`.
- Source save SHA-256: `6eff4a9720f333e7d5736b298d5b355e81e6d964027089fd49541b32a7de1b33`.
- Settings SHA-256: `3a8bf71d16dd5347f151bfbb67b7f8db786e95b6746f16b8d24d9c2a605e1132`.
- Seed: `42`; epoch: `2026-09-21T00:00:00.000Z`.
- Calibration: a 250 ms integer loop in the same renderer yielded 0.251198 s renderer CPU and 0.250236 s `TaskDuration`; controlled `ScriptDuration` was 0.
- Raw batches, process rows, phase profiles, allocation samples, parity traces, and end-to-end cells: [p13f-smelter-shadow-cost-raw.json](./p13f-smelter-shadow-cost-raw.json).

Reproduce the complete bounded experiment with:

```powershell
node experiments/p13f-smelter-shadow-cost-benchmark.mjs
```

The run writes its working raw artifact and command record under `test-artifacts/benchmark/tmp/`. The tracked raw JSON above is the result used for this report.

## Verification

- `node scripts/test.mjs captured-smelter owner-coordination stage3s-smelter-intent` — passed.
- P13F exact-runner parity, including the P13E I path and P reference path: G/N/Q-I/Q-P/U, 80 periods per mode; equal exports, ordered native invocations, random-call counts, and P/I proposal results — passed. N read the proposal provider ten times and received no proposal, with no snapshot or comparison work.
- P13F bounded in-page microbenchmark — completed; P/I ranking supported for both fixtures.
- Four G/G end-to-end controls varied by 12.70%, failed the initial 2% gate, and stopped the factorial; end-to-end result remains C.
- `npm run build` and `npm run typecheck` — passed.
- Chromium runner contract — passed.
- P13D.1 correctness-only replay — passed; CPU windows were skipped as requested by correctness-only mode.
- `npm run check` — passed (356 test files plus bundle syntax).
- `git diff --check` — passed.
