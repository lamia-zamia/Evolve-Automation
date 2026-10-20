# P13O — renderer CPU measurement resolution

## Decision

The corrected bounded protocol does **not** resolve a 2% renderer CPU increment within the predefined budget of 12 runs. A real synchronous control workload measured at 364.6–366.8 ms, about 2% of the ordinary renderer CPU total, did not produce a consistent CPU or TaskDuration response. The uncertainty is much wider than the injected effect. The protocol therefore cannot assess the less-than-2% full-allocator gate, and no B/J cost verdict or allocator optimization is authorized by this result.

The run budget stopped after eight runs: two B/B controls, two J/J controls, and two paired J versus J-plus-calibration checks. The remaining four were not spent on a B/J reassessment because the calibration failed its sensitivity requirement. No 30,000-period replay or factorial was run.

## Measurement boundary

The bounded-window path now captures initial CPU and TaskDuration after browser/setup work and immediately before advancing. It captures final counters as soon as the final requested `advance()` resolves. Snapshot retrieval, diagnostic projection, state reads/exports, hashing, and report construction occur after the final counter reads. The bounded CPU-only windows request no period snapshots; full replay retains its prior snapshot behavior. A separate post-measurement export and parity projection remains in place.

```text
Before bounded window: setup → initial counters → advance → snapshots/export → read state → final counters → diagnostics/report
After bounded window:  setup → initial counters → advance → final counters → state/export → parity/diagnostics/report
```

Full replay still takes its requested snapshots and uses them for its extension decision. Its final CPU and TaskDuration counters are taken after any p20,000–p30,000 extension, preserving extension accounting, and before final diagnostics/state export.

In the output, `initialCounters.readCompletedAt` is the effective start boundary; the end marker (`measurementEndMarkerAt` in the final harness, `advanceCompletedAt` in the fixed-run JSON) is the effective end boundary. CPU and TaskDuration are queried concurrently immediately after that end marker. In these runs, final counter calls began 0.0004–0.0007 ms after the marker and completed 1.16–1.47 ms later. The interval excludes those final counter queries, while their own timestamps quantify the measurement overhead. The recorded wall interval ends at the marker.

## Inputs and reproducibility

All eight runs used identical inputs and the current test bundle:

- Automation repository: `deadspace`, starting HEAD `e82e34ee520410bdfb1be614cb783e84c53d326f`.
- Pinned upstream: `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Game snapshot SHA-256: `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Runner artifact SHA-256: `dddb85b6306907904512a31dc4e9a96da82b26178b9e5bf9f9e683a6bc00ffc8`.
- Test bundle SHA-256: `c17d0ade1c004a40b1b0fce2d5a89b5fe8dae6fb7a6be188434b55085250b66b`.
- Save SHA-256: 8ef0c4b8c4d4259e40c86e505d89b3e149b09789543d6a1ecae50b2de64b2000.
- Settings SHA-256: `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`.
- Seed 42; epoch `2026-09-21T00:00:00.000Z`; 1,000 periods; identical effective settings and overrides.
- Measurement implementation SHA-256 at run time: `c85a2252fe7c92231237397b87cc99afe0d31739f3958a7d80a49f8b3f984f24`.
- Final measurement implementation SHA-256: `2fbd1f8fa56823cd56e0dc4afde33f53c18a00e3559ab32b2049e86adb93ba22`.

The final follow-up corrected full-replay counter placement and output boundary naming. The bounded-window counter order used by the eight runs is unchanged.

## Results

| Run          | Workload        | Active renderer PID | Renderer CPU (s) | TaskDuration (s) | Injected work (ms) |
| ------------ | --------------- | ------------------: | ---------------: | ---------------: | -----------------: |
| BB-01        | B               |               25864 |        18.312166 |        15.430804 |                  0 |
| BB-02        | B               |               31772 |        19.821248 |        16.817796 |                  0 |
| JJ-01        | J               |               15908 |        19.993087 |        16.759826 |                  0 |
| JJ-02        | J               |               26608 |        18.224732 |        15.124351 |                  0 |
| CAL-J-01     | J               |                2796 |        17.969024 |        14.893187 |                  0 |
| CAL-JPLUS-01 | J + calibration |                 300 |        17.934121 |        14.848963 |              366.8 |
| CAL-JPLUS-02 | J + calibration |               22416 |        17.971544 |        14.986196 |              364.6 |
| CAL-J-02     | J               |               25552 |        17.850996 |        14.780718 |                  0 |

The B/B renderer CPU readings differ by 1.509 s (7.9% of their mean); J/J differs by 1.768 s (9.3%). Their TaskDuration differences are 1.387 s (8.6% of their mean) and 1.635 s (10.3%). Same-bundle controls therefore vary substantially without changing scenario inputs.

The two paired calibration effects (J-plus minus adjacent-order J control) are `-0.034903 s` and `+0.120548 s` renderer CPU, and `-0.044224 s` and `+0.205478 s` TaskDuration. Their means are `+0.042823 s` CPU and `+0.080627 s` TaskDuration. The injected work averaged 365.7 ms, approximately 2.04% of the J calibration-control mean renderer CPU (`17.910010 s`). The point response was 0.24% of that baseline for CPU and 0.54% for TaskDuration, and the paired signs disagree.

For descriptive uncertainty, paired differences use a two-sided Student t interval with `n=2`, `df=1`, critical value `12.706`. CPU mean effect is `+0.0428 s`, 95% CI `[-0.9448, +1.0304] s` (about `[-5.3%, +5.8%]` of the J control mean). TaskDuration mean effect is `+0.0806 s`, 95% CI `[-1.5057, +1.6670] s` (about `[-10.2%, +11.2%]`). With only two pairs these intervals are descriptive; they show this bounded budget gives no useful 2% resolution. The known workload was not reliably detected in either counter.

## Accounting, determinism, and parity

Renderer CPU is Chromium `SystemInfo.getProcessInfo` cumulative CPU delta, retained per PID. The controlled browser is launched by the runner for this page; the renderer with the dominant delta is the active game renderer for each isolated run. Additional renderer deltas were below 0.0005 s in all runs. Browser and GPU process deltas were excluded. TaskDuration is the CDP renderer page-target delta and is reported independently. Chromium process-info rows do not directly map a PID to a page target; active-renderer identity is inferred from the isolated launched page and overwhelmingly dominant delta. Process CPU has millisecond granularity. OS scheduling and unobserved host activity remain limitations.

Every run produced the same final exported game-state hash `44b3417fe3db8b81c4d55e0899f6bc50e72098dea62e7ecb919ee7535cf0e622`, same final assignments (46 Crystal, 47 Lumber), 125 plan/complete observations, 422 applied route operations, and identical trace counts. The 95-key native control-usage aggregate was identical in every run (48,562 returned/thrown calls; SHA-256 `9c6ad485fee4c4d9904d89942cc101d4eb985f70740c74922570a31d42a3dbff`); per-run values are in the evidence JSON. J and calibration J had zero proposed/accepted goal signals and zero final-fence events. The calibration uses synchronous integer arithmetic and a native monotonic clock; it does not write game state, call RNG, or invoke controls. Calibration and control runs had identical final exports and control-usage aggregates.

The protocol did not capture per-call Research purchase/draw sequence (`researchSequence` was empty in each report), so P13O claims matching exported state and aggregate native-control usage, not a separately verified Research draw sequence. No corrected-boundary B/J pair was run because calibration failure met the stop condition. Earlier P13N B/J estimates (+2.24% and +3.74%) remain inconclusive under observed control variance. The legacy native-parity suite is unavailable because required `test-artifacts/benchmark/settings/baseline-tuned.json` is absent; no replacement fixture was created.

## Attribution and next step

P13N's 116.5 ms catalog-capture and 252.3 ms selector elapsed totals over 125 no-signal evaluations are diagnostic elapsed times, not renderer CPU attribution. P13O did not profile source-level operations because calibrated counter precision failed. There is no evidence here to select one optimization target. Do not optimize the allocator based on these results. A later measurement approach needs a larger signal-to-noise ratio or better process control before it can justify the 2% gate.

## Validation

- `node tools/chromium-evolve-runner-test.mjs`: passed.
- `node tests/experiments/stage4a-goal-aware-acquisition-test.mjs`: passed.
- `npm run build`: passed.
- `npm run check`: passed all typecheck, architecture, lint, formatting, and 359 test files after the final boundary correction.
- `git diff --check`: passed after final edits.
