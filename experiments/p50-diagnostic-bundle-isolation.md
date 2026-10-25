# P50 — Production bundle isolation for diagnostic allocation

**Decision: A — Production isolation improved.** The ordinary userscript no longer emits the P48/P49 admission implementation, its Jobs observation path, or the test-only Jobs wrappers. The local test-surface build retains both Full Jobs and ordinary-only observation. Bounded production parity and focused P49 A/B/B-repeat evidence passed. This is a production-artifact and readiness result; it does not authorize an allocation.

Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`. Starting automation revision: `744e01a5f9a18d75ba87c36a1c59a0c85a7286cc`.

## Compiled production audit

`node experiments/p50-diagnostic-bundle-audit.mjs` rebuilds the starting production bundle by loading the two edited source files from the pinned starting revision, then builds current ordinary production and the local test surface with the repository's `build-config.mjs` options and the same banners used by the normal build modes. It parses emitted JavaScript with the TypeScript AST and reads esbuild's output metafile. It also preserves each complete bundle immutably and fails if a later run would replace an existing artifact. No source map is emitted by the build.

| Output                       |     Bytes | SHA-256                                                            | Admission-module bytes | Diagnostic function spans | Objective/scope constants |
| ---------------------------- | --------: | ------------------------------------------------------------------ | ---------------------: | ------------------------: | ------------------------: |
| Starting ordinary production | 2,795,077 | `86DDEBE277A3FCFE5261E591639AD915832FCF7C7053F5C0CA007E816F0B6CCA` |                  4,795 |                     6,215 |                       173 |
| Current ordinary production  | 2,785,450 | `908027821577F6C1804F3203BA98842A9D80056D2BDE267AF4391BB3DA32AABA` |                      0 |                         0 |                         0 |
| Current local test surface   | 3,090,230 | `BE0FE1A5234B576FF8EB46244167C07A0F231C0D5EF2F7A282602BBBCFA468BB` |                  4,795 |                    14,070 |                       173 |

Production shrank by **9,627 bytes**. Diagnostic function spans are AST-measured emitted declaration spans, not source line estimates. The 4,795-byte admission-module figure overlaps the admission function and constants and must not be added to those spans. On the starting production output, the measured functions were the 4,616-byte admission predicate, 650-byte Jobs decision-identity helper, 669-byte ordinary Jobs projection, and 280-byte observer. The Foundry/Full Jobs projection was not emitted in ordinary production. Type-only declarations were erased. The objective and scope declarations contributed another 173 emitted bytes.

The starting output contained **zero calls to the admission predicate** and no event-kind, request-hook, or observer-hook string. It did retain one ordinary observer callsite guarded by the false test flag. Its diagnostic support therefore did not admit or act on a request, but it was executable dead-path code. It also retained the admission module, diagnostic objective/scope constants, test-only counter identifiers and wrappers, and four `testObservationEnabled` checks on each Jobs work cycle: ordinary preparation-generation increment, ordinary observer gate, Full Jobs catalog counter, and Full Jobs demand counter. The AST additionally found two `if` conditions, five conditional expressions, and three logical checks that referenced the flag across setup and work-cycle code.

At runtime setup, the starting output initialized an empty diagnostic dependency object and spread it into both Jobs factory arguments. It did not wire the request or observer hooks in production. The current output removes the object initialization and both spreads; the only remaining `allocationDiagnosticAdmissionDependencies` occurrence is an uninitialized local declaration with no initializer, reads, calls, or emitted diagnostic module bytes. This declaration has no diagnostic runtime effect.

The current production AST contains no admission predicate, observer/projection/identity helper, diagnostic objective/scope or event/request/observer hook literal, test-only request/counter identifier, or admission-module output bytes. It contains no diagnostic observer callsite and no `testObservationEnabled` branch, helper call, or per-cycle check. The test-only control/settings/catalog/demand/native-root count wrappers are excluded with those paths. No static diagnostic import remains executable. The P50 compiled-output regression checks the emitted AST and esbuild module contribution; it does not rely solely on substring search.

## Change and behavior boundary

In `src/adapters/evolve/civic/captured-ordinary-jobs.ts`, the two test-only instrumentation setups now live behind the existing `__EA_TEST_SURFACE_ENABLED__` build define. Production and test-surface Jobs continue to use the same ordinary and Full Jobs execution logic. In `src/bootstrap/captured-runtime-control.ts`, diagnostic dependency spreads are also behind that build define. The ordinary Jobs ordering, preparation freshness checks, Full Jobs preparation, execution checks, and P41 fail-closed reservation behavior are unchanged.

The compiled-output regression is `tests/architecture/p50-diagnostic-bundle-isolation-test.mjs`. For production it parses the bundle and verifies absence of diagnostic functions, identifiers, strings, admission-module bytes, and admission calls, while checking that the lone dependency binding has no initializer. For test surface it verifies the admission predicate, both owner observers, both projections, request lifecycle and identity markers, both owner scopes, and `executionAuthority: "none"`. The focused P48 domain regression covers cancellation, replacement, identity, stale evidence, owner-local admission, refusal of execution authority, and cross-owner evidence limits. The P49 evidence runner checks the integrated Full Jobs and ordinary-only paths.

## Bounded parity and cost

`node experiments/p50-diagnostic-bundle-isolation-evidence.mjs` records the bundle audit, P49 test-surface proof, and production before/after runs in `p50-diagnostic-bundle-isolation-evidence.json`. It uses separately generated immutable production bundles, seed 44, epoch `2026-09-21T00:00:00.000Z`, identical save/settings inputs per pair, 400 periods per arm, and snapshots at periods 200 and 400. No treatment actions were added.

| Fixture                                       | Same final export                                                  | RNG calls before/after | Native invocation trace before/after |
| --------------------------------------------- | ------------------------------------------------------------------ | ---------------------: | ------------------------------------ |
| `late-game-mad-tech-offered-blocked`          | `0f33bc937cedd7ebeb33b9bd343234d80e28efed7e286895416ecc5f7c111402` |          1,096 / 1,096 | 0 / 0; identical empty trace         |
| `standard-human-p19-p250-positive-population` | `c64e5e05cfa9ffe8822639a08925d438d24daa351196b322bbd5c41c5d7675cb` |                72 / 72 | 0 / 0; identical empty trace         |

The evidence runner deep-compares both checkpoints and final state, including Jobs/Foundry assignments, Construction and Research state, RNG state, exports, control usage, read counters, aggregate performance counters, and errors. Every compared value matched. The reader and control counts therefore show no added or removed native calls or reads from this source cleanup. No Gather, purchase, or worker override was used in either production comparison.

The test-surface P49 proof retains six 400-period runs: A, B, and B-repeat for each fixture, with 50 owner observations per arm. Its runner compiles a dedicated test-surface bundle with fixture hooks; its hash is recorded in the P50 JSON. It is not used as a production parity comparator. Late-game uses `full-jobs-and-foundry`; positive-population Standard/Human uses `ordinary-jobs-only`, where Foundry facts remain unavailable. A is inactive; B and B-repeat admit for observation. Request cancellation/replacement, owner-local identity, stale/fresh evidence, cross-owner refusal, and observation-only execution (`executionAuthority: "none"`) remain covered. No extra settings, control-registry, catalog, demand, or native-root read was introduced by admission.

The removed production work is compile-time absent, so this task did not run a noisy renderer-CPU A/B experiment. The retained P49 callback instrumentation measured a maximum synchronous callback of 0.4 ms in these bounded runs, using the native `performance.now` clock; this does not establish renderer CPU share. **The independent renderer CPU gate remains unresolved and is not claimed to pass.** `test-artifacts/benchmark/settings/baseline-tuned.json` is missing, so the existing native-timer coverage remains limited; this is retained as a known coverage limitation.

## Next executable authority boundary

P50 implements no coordinator. The findings below describe the minimum ownership contract for one future, specifically authorized owner action.

1. **User objective and permission.** P48/P49's `maintain-food-buffer-and-useful-stone-production` request is test-only observation intent, not a player-selected target or permission to spend or reassign labor. A future request must name one concrete target/action and its spending or workforce permission. The system cannot infer a Farm, Quarry, purchase, or worker change from the diagnostic objective.
2. **Construction-owned spending and priority.** Construction must decide whether to select the named build in its own current ordering cycle. Its publication must bind the target, complete current cost, owner work-cycle/root/progression identity, ordering generation, and any saving-priority release/replacement rule. Existing Build execution and P41's fail-closed reservation gate remain authoritative. Unknown holdings or unavailable reservation evidence reject the action. P40 found a completed Farm saving publication from cycle 89 beside Quarry ordering generation 90; P42's one-cycle Quarry substitution only demonstrated that a test intervention could buy it, not that Quarry should outrank Farm or that the player authorized it. See [P40](p40-construction-reservation-gate.md), [P41](p41-reservation-correctness.md), and [P42](p42-construction-priority-counterfactual.md).
3. **Jobs-owned workforce.** If the named action also requires labor, Jobs must make a separate decision in its own fresh owner cycle, using its ordinary planner and all current worker commitments. P43's diagnostic allocation assumed an empty commitment set because no current commitment registry exists. P44 confirms that point-in-time Food/Stone feasibility does not prove sustained viability. No cross-owner process may assign workers on Jobs' behalf. See [P43](p43-food-safe-jobs-validation.md) and [P44](p44-food-infrastructure-feasibility.md).
4. **Current resources and queue commitments.** Construction's decision needs same-cycle holdings, complete cost/pool, native queue targets, script reservations/claims, and Construction's own current priority. Jobs needs current assignments/commitments and the owner-specific job/catalog/settings sample. A missing source is unavailable, not empty. P47 found no natural fresh publication carrying all owner, root, progression, queue, control, and work-cycle generations.
5. **Food sustainability and missing native evidence.** P43 does not retain an authoritative worker-commitment source. P45 cannot calibrate Food stock transitions from the retained timeline: Food gains are missing from recorded production/consumption phases, and offline scaling/per-pool regional effects are not captured. Positive instantaneous Food flow is not a safe stock horizon. Food stock, production/consumption phases, Weather/modifiers, and any per-pool stock and demand needed by the decision require new native evidence. **Any new recurring native observations are a performance blocker until their incremental capture and renderer cost are measured; no speculative cache or repeated polling is authorized by this assessment.** See [P45](p45-food-stock-resilience.md).
6. **Cross-owner handoff and invalidation.** Construction may publish only its own accepted/rejected target commitment with current identity. If Jobs is needed, its later decision must consume that exact commitment without taking Construction authority. Invalidate on root/progression/work-cycle change, target or complete-price change, queue/reservation/holding change, relevant control change, request cancellation/replacement, or Jobs commitment/assignment change. P48 lacks the cross-owner envelope; P49 proves only owner-local observations, not a handoff. See [P47](p47-allocator-entrypoint-feasibility.md), [P48](p48-explicit-intent-admission.md), and [P49](p49-jobs-admission-coverage.md).
7. **Incremental capture and execution cost.** First reuse values already prepared inside the owning cycle and record a small generation-bound commitment. Do not rescan controls or native catalogs. Any food/queue/commitment fact that cannot be reused must be proposed as a separately measured native observation; its recurring read count, synchronous time, retained evidence size, and invalidation frequency are release blockers. The one-action pathway must preserve existing owner execution order, reservation enforcement, and Jobs freshness checks.

This is an implementation-readiness assessment only. No production allocation policy, additional observation, setting, UI, authority, or action was added.

## Reproduction

```powershell
npm run build
npm run build:test-surface
node experiments/p50-diagnostic-bundle-audit.mjs
node experiments/p50-diagnostic-bundle-isolation-evidence.mjs
npm test -- p50-diagnostic-bundle-isolation
npm test -- allocation-diagnostic-admission captured-ordinary-jobs
node tools/chromium-evolve-runner-test.mjs
npm run check
git diff --check
```

The machine-readable P50 evidence records each generated output's bytes and hash. The ignored local bundles are preserved under `test-artifacts/p50/bundles/{before,after,test-surface-after}/` and can be regenerated by the audit script. The evidence script also records P19 checkpoint provenance for the positive-population fixture; its bootstrap/construction-handoff Gather actions belong to checkpoint generation, not to the paired production comparison arms.
