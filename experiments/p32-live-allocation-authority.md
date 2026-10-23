# P32 — Live pre-Gather allocation authority

## Decision: C — authority blocked

The test-only ordering stamp advanced at every successful current pre-Gather publication, and stale progression evidence is rejected. The authentic Standard/Human replay reached p5000 but produced no current saving target in any of its 625 ordering publications. The shadow rejected each with `no-current-pre-gather-target`; it found no genuine live positive-authority case. No allocation was requested or spent. Do not proceed to allocation experiments.

The existing P19-controlled progression remains the accepted comparison baseline. It remains useful for later controlled progression work, but it does not clear P32's live-authority gate.

## Reproduction inputs

- Implementation: `53bac83a` plus the test-surface price-read guard `0acbd8de`.
- Regression commit: `ce34f5d9`.
- Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`, snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- Authentic Standard/Human fixture: `p18-standard-human-fixture.txt`, SHA-256 `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`.
- Settings and seed match the accepted P19/P20 replay (`p18-standard-human-settings.json`, seed 44, epoch `2026-09-21T00:00:00.000Z`). The run advanced exactly 5,000 periods.
- P32 replay record, current bundle hash, fixture hashes, per-cycle evidence and rejection counts: [p32-live-allocation-authority-evidence.json](p32-live-allocation-authority-evidence.json).

## Ordering generation and live shadow

The test surface now keeps its own ordering generation. It increments only after `establishConstructionOrdering()` succeeds, independently of `constructionCycleId`, and each observation records `phase: pre-Gather`, the automation work-cycle ID, root and progression generations, target and full cost, current controls and their generations, resource amounts and capacities, permissions, queue/reservation state, handoff and claim evidence, and explicit test budgets. The nested snapshot data is frozen. An incomplete order is recorded as `incomplete-ordering-publication`; no prior post-Construction publication is consulted.

The replay observed 625 successful publications. The retained tail shows strictly increasing ordering generations through generation 625, with phase `pre-Gather` and matching work cycle 625. All 625 shadow evaluations rejected because the current ordered saving target was absent. There were 0 successful-authority results and 0 additional native control calls or catalog/price probes. The shadow never invokes Gather. Its target read is reused by the ordinary same-cycle demand consumer when Gather is enabled; the test surface skips that read in ARPA-only cycles.

The current queues were empty, the test hook supplied an explicit inactive-handoff observation and no competing claims, and the diagnostic supplied bounded budgets (5 clicks per cycle, 80 per target episode, 140 total). Those facts cannot replace the missing current target and price. The fixture therefore does not establish positive authority. The runtime elapsed timer reported 0 ms across the 625 synchronous snapshots/evaluations, below its useful resolution; this is not a zero-cost claim.

The pure shadow predicate returns distinct failures for absent or invalid target/price, stale root or progression generation, wrong phase, target replacement, shortage/capacity, unaffordable non-gatherable costs, permissions, target/Gather controls, queue conflicts, reservation evidence, active handoff, competing claims, and missing or invalid budgets. Missing evidence fails closed.

## Historical P20.1 p5000 discrepancy

The retained P20.1 p5000 owner sample in `p20-1-construction-allocation-authority-evidence.json` is coherent: work cycle 625, phase `pre-Gather`, Farm (`city-farm`), full price 20 Lumber / 10 Stone, 21 Lumber and 0 Stone, 10 Stone shortage, sufficient capacity, current permissions and controls, empty queues, and no competing claims. The evidence does not record an authorization attempt or a denial reason, so it does not prove “valid authority but no policy request” or “budget/claim denial.” Its publication and current progression stamps agreed at that sample; staleness is not the explanation for p5000.

The strongest explanation is a P20.1 callback integration defect. The original page-evaluated authorization callback referenced a helper imported in Node scope, which is not closed over by the browser callback. P20.2 moved the policy helpers into the evaluated callback and described this as a plausible discrepancy. P20.1 retained no callback exception at p5000, so this diagnosis remains probable rather than confirmed. The historical record does not distinguish the callback defect from an unrecorded lack of a policy request.

The retained p8304 case is definitively stale: request and price evidence still matched Farm, but progression generation changed from the publication's `…|27|…` to current `…|28|…`. The shadow rejects that mismatch (`stale-progression-generation`); the P20 validator also rejects its `publicationCurrent: false`. Focused regression coverage names this p8304 condition explicitly.

P20.1's shared validator required a current-publication flag, a `city-*` target, exact full price and pool agreement among request, publication and native catalog, valid resource stock/capacity, affordable non-gatherable costs, and a positive gatherable cost. Its runtime/policy path also checked current cycle and root/progression state, target and Gather controls, permission, queues, claims, shortage/capacity, and bounded click budgets. The P32 shadow makes the ordering generation/phase explicit and gives each missing field a specific rejection. It consumes the price already associated with the current pre-Gather ordered target and adds no separate native catalog read. It remains a read-only shadow and does not implement P20.2's action postcondition because it performs no action.

## Overhead and CPU sensitivity

The live test-surface summary recorded 0 additional native calls and 0 additional catalog/price probes. The per-boundary elapsed timer remained at 0 ms, so the snapshot-plus-shadow cost could not be resolved during ordinary pre-Gather processing.

`node experiments/p32-shadow-amplification.mjs` ran five batches at each of 10,000, 30,000 and 90,000 repetitions. The complete positive predicate used a synthetic input and took median 18.9 ms, 56.7 ms and 168.8 ms, respectively—approximately linear scaling at about 0.0019 ms per evaluation. The current live missing-target rejection path was faster. These are diagnostic isolated costs, not production-overhead or whole-run evidence.

The paired pilot injects the workload during game advancement in the same test-surface bundle and measures only the advancement window. Each treatment burns 2% of its matched control's renderer CPU across the observed 125 work cycles. The three renderer CPU effects were +2.87%, +4.27%, and −5.45%; the corresponding CDP `TaskDuration` effects were +3.76%, +4.77%, and −6.01%. The treatment workload executed for 188–213 ms as intended, but one of three pairs reversed direction. Identical-bundle controls therefore do not show adequate sensitivity to a 2% increment. No larger CPU campaign was run, and the 2% whole-run requirement remains unverified.

## Conclusion by requested gate

| Question                                               | Finding                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Live authority stamping correct?                       | Yes for successful pre-Gather publication sequencing; the authentic replay never had a current target to authorize. |
| Did the shadow require extra native work?              | No extra native control invocation or catalog/price probe was observed or added by the shadow path.                 |
| Is CPU overhead bounded with useful confidence?        | No. The synchronous timer was below resolution and the paired 2% pilot was inconsistent.                            |
| Should P19-controlled progression remain the baseline? | Yes. Keep it as the accepted comparator; no allocation experiment is cleared.                                       |
| P32 decision                                           | **C — authority blocked.** Neither A nor B applies because there is no genuine live positive-authority case.        |

## Reproduction and verification

```text
node experiments/p32-live-allocation-authority.mjs
node experiments/p32-shadow-amplification.mjs
node experiments/p32-advancement-cpu-pilot.mjs
npm test -- construction-allocation-authority-test captured-gather-resources-test
node tools/chromium-evolve-runner-test.mjs
npm run build
npm run check
git diff --check
```

The retained experiments do not call an allocation authorization callback or a native Gather action. The production build output remained unchanged. Implementation, focused regressions, and this report/evidence are committed separately; nothing was pushed.
