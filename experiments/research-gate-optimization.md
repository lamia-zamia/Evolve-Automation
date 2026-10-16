# Research Condition Gate Optimization

Date: 2026-10-16  
Branch: `experiment/research-gate-optimization`  
Starting commit: `fd8534a`

## Recommendation

Keep **B2, the cheaper scoped gate**, as the experiment to carry forward. Do not integrate it into the production userscript yet. It produced the most consistent userscript-only late-game reduction with the scoped install/draw/restore lifecycle, preserved progression checkpoints, and had better median late p95 work-cycle latency than B3. It still does 562 descriptor operations per late scratch draw (281 installs and 281 restores); further work should target that cost only if another safe scoped improvement is evidenced.

B3 is rejected for this slice. It was technically viable against the pinned game source and was slightly faster by the arm medians, but its gain over B2 was small and noisy, while it persistently changed action objects, increased native condition calls, and had a worse median late p95. Keep the original B scoped implementation as the fallback if B2's extra setup optimization fails a future contract test. C remains a patched-game reference only.

## Inputs and method

The A/B/B2/B3 runs used the same unmodified DeadSpace game snapshot, SHA-256 `e39fc2ef9076d0e0afe929be6588c89fc047a4641bd16ccf37644b94574dc521`. C used the derived patched reference snapshot, SHA-256 `98ef2ca5e5e7f9a5c58fc407b1c73403224483cf86191a30b96077e5755cd54c`. The same settings and the same early, mid, and late saves were used for every arm. A is the userscript with the gate disabled. B is the existing scoped gate. B2 is B with static registry metadata reused after one full authority check at entry and with redundant filtered arrays/restore closures removed. B3 wraps native `condition` callbacks persistently. C bypasses completed-tech handling in the game draw and is not deployable.

The CPU pass used six alternating repetitions per save, with 400 warmup and 400 measured periods (50 work ticks) per arm. It had no callback timing or allocation instrumentation. `TaskDuration` was collected in the same windows. The separate latency pass used four repetitions of 50 measured work cycles per arm. The separate trace pass used 400 warmup and 800 measured periods with condition-call tracing and V8 heap sampling. A fourth bounded timing pass measured B2 phases over 100 late gate invocations. These instrumented passes are attribution evidence only; they are not used as CPU benchmarks.

## Performance

Median renderer CPU and `TaskDuration` per 50-work-tick window (seconds), with CPU normalized to one work tick:

| Save  | Arm | Renderer CPU | CPU ms/work tick | TaskDuration |
| ----- | --: | -----------: | ---------------: | -----------: |
| Early |   A |         4.70 |             94.0 |         4.04 |
| Early |   B |         4.45 |             89.0 |         3.89 |
| Early |  B2 |         4.72 |             94.4 |         4.16 |
| Early |  B3 |         4.74 |             94.8 |         4.15 |
| Early |   C |         4.38 |             87.6 |         3.84 |
| Mid   |   A |         5.86 |            117.2 |         5.06 |
| Mid   |   B |         5.32 |            106.4 |         4.58 |
| Mid   |  B2 |         5.56 |            111.2 |         4.82 |
| Mid   |  B3 |         5.40 |            108.0 |         4.64 |
| Mid   |   C |         5.56 |            111.2 |         4.82 |
| Late  |   A |         9.63 |            192.6 |         8.51 |
| Late  |   B |         9.30 |            186.0 |         8.26 |
| Late  |  B2 |         8.63 |            172.6 |         7.63 |
| Late  |  B3 |         8.39 |            167.8 |         7.39 |
| Late  |   C |         8.38 |            167.6 |         7.48 |

For comparison with the original 100-tick figures, doubling the late window medians gives 19.26 seconds for A, 18.60 for B, 17.26 for B2, 16.78 for B3, and 16.76 for C. These are this experiment's medians, not a replacement for the earlier same-run result. Paired median CPU change versus A was B -11.5% (range -24.2% to +2.8%), B2 -9.3% (-33.4% to -0.1%), B3 -14.0% (-32.2% to -4.3%), and C -8.4% (-35.3% to +7.0%). Early and mid paired CPU results were noisy and did not show a dependable B2 reduction.

The separate late latency pass had median-of-repetition p50/p95/p99 cycle times of 140.5/460.1/791.1 ms for A, 122.7/156.7/260.6 ms for B, 110.9/136.6/170.7 ms for B2, 110.2/148.6/165.5 ms for B3, and 110.5/150.9/427.4 ms for C. The underlying p95/p99 ranges were wide: B2 p95 was 129.8–461.5 ms and p99 was 133.2–683.1 ms. B2 improves the median tails versus A and has the best B2/B3/C median p95, but this six-window CPU study and four-repetition latency study do not establish stable production p99 behavior.

## Equivalent native workload and cost attribution

Every arm completed the same number of native Research draws in the measured trace windows: early 114, mid 110, late 101. Offers matched within each save: 1,326 early, 2,163 mid, 400 late. Thus B did not do more full draws than C; most of the remaining difference is work inside the same number of draws and in the userscript gate.

Late trace counts over 101 draws:

| Arm | Completed-tech entries processed | Native `condition` invocations |           Gate invocations | Descriptor installs / restores |
| --- | -------------------------------: | -----------------------------: | -------------------------: | -----------------------------: |
| A   |                           26,400 |                         10,300 |                          0 |                          0 / 0 |
| B   |                           26,400 |                         32,700 |                        100 |                28,100 / 28,100 |
| B2  |                           26,400 |                         32,700 |                        100 |                28,100 / 28,100 |
| B3  |                           26,400 |                         58,500 | 0 instrumented gate events |   Persistent one-time wrappers |
| C   |                                0 |                          6,300 |                          0 |                          0 / 0 |

The completed-tech loop's measured time was 2,271.9 ms in A, 9.0 ms in B, 8.1 ms in B2, 12.2 ms in B3, and 0 in C. The count records entries visited by that loop; the time reflects its actual work with each implementation. B/B2 avoid nearly all of that loop's prior cost without removing the native draw. B3 avoided per-draw property churn, but invoked more native conditions than B2.

B2's bounded timer over 100 late gate calls recorded these totals: retained-registry validation 42.4 ms; current completion classification 33.2 ms; descriptor preflight 8.6 ms; descriptor installation 20.6 ms; native draw 1,576.4 ms; descriptor restoration 10.3 ms. That is about 1.15 ms of measured gate setup/restoration per call, alongside about 15.8 ms of native draw time. The timing pass runs with test hooks and uses the runner's high-resolution clock, so treat small phase figures as approximate attribution, not CPU-pass values.

V8 heap sampling over the separate trace pass reported, for late A/B2/B3, sampled self-allocation under `getOwnPropertyDescriptor` of about 192/203/222 MiB and under `keys` of about 145/140/142 MiB. This sampling covered the whole runtime, so those function totals are not uniquely attributable to the gate. It shows that descriptor access remains a material hot allocation site and that B2 reduced `keys` samples slightly while retaining descriptor churn. The runner did not collect GC pause events or V8 deoptimization events, so there is no defensible gate-specific GC or deopt count. No direct GC/deopt regression was established.

## Progression and recovery

Each arm ran 4,000 periods after warmup for early, mid, and late saves, with four checkpoints and 500 measured work cycles. For early and mid, A/B/B2/B3/C had identical checkpoint days, tech changes, milestones, buildings, queues, and shortage/starvation fields. Early ended at day 234 with 18 changed tech entries; mid ended at day 614 with 8. Late ended at day 502,667 with no new tech changes in any arm. No automation control threw in the progression runs. These results support equivalent progression on the sampled routes; they do not establish equivalence for every race, reset, or modded save.

Recovery exercises on the exact runner showed:

- Missing Research DOM: B2 continued without installing descriptors when the panel was absent; a later normal player Research open rendered four offers and 258 granted rows.
- Root replacement during a B2 scratch draw: the new root was detected on the following capture; ordinary Research rendering recovered. The B3 root replacement smoke also completed and its ordinary panel rendered, though B3 has no scoped gate event counter.
- Native draw exception: B2 restored all 28,100 installed descriptors over the 100 observed calls. The injected callback error was reported as `research offer discovery failed`; no restoration failure was recorded.
- Descriptor restoration failure: B2 restored 280 of 281 descriptors in the injected failing draw, reported `Research condition gate could not restore 1 native callback descriptor(s)`, marked the authority compromised, and reported `automation paused because Research callback restoration failed; reload the game to recover`. The runtime stopped dependent automation phases. The affected callback cannot be repaired reliably in place; a clean reload is required.
- Persistent-wrapper mutation: B3 detected that a wrapper's descriptor had changed, failed closed, reported the same reload recovery requirement, and stopped dependent automation phases. The original UI recovered only in a fresh page/session.

The game source audit at the pinned DeadSpace commit found no native Research code that compares callback identity, ownership, or source; the draw invokes a truthy `condition` callback. B3 nevertheless changes whether some action objects own a `condition` property and changes callback identity between scopes. Other extensions could observe that. B3 also needs its own focused tests for reset, registry replacement, nested draws, and uninstall restoration. Registry replacement and completion that occurs in the middle of a draw were not directly injectable through the public page surface in this harness, and nested Research reentrancy was not directly exercised. Those cases remain required before production integration; the current B2 behavior revalidates registry keys, action references, and `reqs` descriptor identity at the entry to every applicable draw rather than trusting root identity alone.

## Artifacts

The main implementation is in `src/adapters/evolve/captured-game-mechanics.ts`, with the fail-closed orchestration guard in `src/bootstrap/captured-runtime-control.ts`. The benchmark and trace drivers are `experiments/research-gate-optimization.mjs`, `experiments/research-gate-optimization-trace.mjs`, and `experiments/research-gate-optimization-progression.mjs`. The raw run outputs are ignored scratch files under `test-artifacts/research-gate-optimization/` and are not part of the repository commit.
