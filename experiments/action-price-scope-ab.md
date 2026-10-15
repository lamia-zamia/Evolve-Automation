# Per-cycle native action price scope — A/B

## Decision: revert — the keep criterion fails

The scope was correct (exact export and control parity on all three saves) but almost never hit. Within a cycle
the price consumers interleave each `setData` price probe with other captured-method calls, mostly pure reads such
as `on_cap`. Under the conservative rule "any other invocation drops every held price", 96–97% of mid/late lookups
missed. The late save saved 1.3–1.75 ms per work tick against the ≥12 ms threshold, and mid showed no gain.

## Criterion (written before measuring)

From `full-runtime-performance-profile.md`, section G. **Keep** only if:

1. the late paired median renderer-CPU saving is ≥12 ms per work tick in both orders, and mid ≥2 ms;
2. `TaskDuration` moves the same way in every pair;
3. exports are identical to base (beyond the documented drift fields), and `controlUsage` differs only in
   `buildQueue.setData`;
4. `npm run check` passes and the bundle diff is confined to the change.

**Revert** otherwise.

## Candidate

One `CapturedActionPriceScope` (`createCapturedActionPriceScope` in `captured-action-costs.ts`):

- shared by all four action-cost readers: the runtime build-cost reader, queue reservations, Construction and
  Research;
- opened and closed around `runCycle`;
- invalidated by a new root, a binding revision, or any captured-method invocation other than the reader's own
  `setData` probes, which it counts exactly. That counting uses a new `readInvocationRevision()` on the control
  registry (`vue-capture.ts`).

Outside a cycle nothing is held. The diff touched 7 source files plus tests, 22 bundle hunks, all in the changed
modules. Saved as `test-artifacts/perf-profile/price-scope/candidate.patch`, and not committed to any production
branch.

## Results

Inputs: exact runner, snapshot `29e22dbe…` (`db38e2af`), HeadlessChrome/151.0.7922.71, base = `deadspace`
production bundle `fd04d858…`, Stage 4F settings with `autoPrestige=false`, seed 42, the early/mid/late saves of the
full runtime profile. Raw output is in `test-artifacts/perf-profile/price-scope/`.

**Criteria 3 and 4 hold.** `npm run check` passed with 347 test files, including 8 new scope cases and the registry
counter contract. Parity over 2,000 periods per save:

- the same-bundle control was identical: export SHA and `controlUsage`;
- candidate exports equalled base on every save;
- `controlUsage` was otherwise identical.

`buildQueue.setData` calls over the 2,000 periods:

| Save  |    base | candidate | reduction |
| ----- | ------: | --------: | --------: |
| early |  20,437 |    15,835 |       23% |
| mid   |  32,531 |    31,572 |        3% |
| late  | 110,896 |   107,762 |        3% |

Scope tallies, 150 work ticks per save:

| Save  |         hits | misses |    held prices dropped |
| ----- | -----------: | -----: | ---------------------: |
| early |  2,926 (24%) |  9,164 |                  7,005 |
| mid   |   724 (3.8%) | 18,476 |                 14,852 |
| late  | 1,856 (2.8%) | 64,661 | 53,861 (≈359 per tick) |

**Criteria 1 and 2 fail.** Renderer CPU over 800-period windows, 4 pairs per save, alternating order; saving =
base − candidate, ms per work tick:

| Save | base-first pairs | candidate-first pairs | Median (base-first / cand.-first) | `TaskDuration` same direction |
| ---- | ---------------- | --------------------- | --------------------------------- | ----------------------------- |
| mid  | −2.9, −0.2       | −0.5, 0.0             | −1.55 / −0.25                     | no                            |
| late | 1.9, 1.6         | 1.0, 1.6              | 1.75 / 1.30                       | yes                           |

Absolute window CPU in this session (late base 16.4 s, mid 9.55 s) was lower than in the profiling session (23.4 /
13.4 s) for the same bundle and save. Machine state differs between sessions; only the paired same-session deltas
are compared here.

## What this rules out, and what would be needed

- A cycle-scoped price memo with invalidate-on-any-invocation cannot pay off, because the consumers' own read
  invocations sit between their probes. Do not retry it with this invalidation rule.
- Upstream `on_cap()` (`actions.js`) is a pure read returning a count. A memo that survived pure reads would need an
  authoritative read-only classification of captured methods. That restates game semantics per method, and is not
  justified without a design that names one owner for that classification.
- Removing the probes' repetition at the source, by having the five consumers share one cycle sample of building
  prices instead of each pricing independently, is a separate restructuring with its own ordering risks. It needs
  its own measured design.
