# P12B — Independent native Research prerequisite capture

Date: 2026-10-18

Branch: `deadspace`

Starting HEAD: `b8f12f23a90749ba1d8ce66cb3645c000877ad27`

Pinned game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**B — Capture succeeds but goal authority remains incomplete.**

The P12A zero count is explained by the test harness: `readComputedResearchRequirementsEnabled()` only returned true when `gatherIntervention.resourceClaimMode` was `goal-derived-conjunctive`. P12A's exact runner did not set that Gather intervention. In the P12A-mode replay, capture was disabled, the current catalog contained 834 definitions, and it produced 0 native requirement callbacks and 0 computed observations.

An independent explicit request captured real native results. It produced 12 valid observations, all for unoffered actions, including Lasers and Quantum Computing. Feeding those definitions through `createEffectiveCapturedTechPrerequisiteSnapshot()`, `planNativeResearchPrerequisites()`, `classifyMandatoryNativeResearchObligations()`, and `evaluateResearchGoalCandidates()` still yielded `blocked-by-missing-native-authority`.

The named remaining authority blocker is `tech-mad` eligibility. Its native definition has `hasNativeCondition: true`, route restrictions `standard` and `truepath`, and a `not_trait` restriction for `cataclysm`, `lone_survivor`, and `warlord`. The read-only MAD condition check says `eligible`, while the graph retains the native condition and eligibility metadata as unevaluated. The native obligation classifier refuses to certify obligations from that graph and reports `native Research prerequisite inputs contradict the effective graph snapshot`.

The MAD action's declared direct prerequisites are Uranium 1, Explosives 3, and High Tech 7. Their current graph gates remain conditional:

- Uranium 1 has four candidate actions: `tech-uranium`, `tech-uranium_storage`, `tech-uranium_ash`, and `tech-breeder_reactor`.
- Explosives 3 has `tech-anfo` and `tech-super_tnt`.
- High Tech 7 has 15 candidate actions, including `tech-lasers` and `tech-quantum_computing`; Truepath-only `tech-virtual_reality_tp` is excluded on the standard route. Native queue precognition and game-specific requirement exceptions remain unresolved in these paths.

The evidence establishes neither mandatory AND frontier actions nor a verified OR obligation group. The graph retains the OR candidate sets as unresolved alternatives. The adaptive frontier evaluator selected no provisional action.

## Capture path and freshness

The independent request is the test-surface property `computedResearchRequirementsCapture`. It is read only when the test surface is compiled and is set immediately before the existing forced `readCurrentResearchCatalog("tech-mad", true)` call. The P12A Gather switch remains supported for Stage 3F. Ordinary production builds have the test surface disabled, and the new property is absent from the production bundle.

The runner uses the established Research catalog reader and native capture mechanism. It does not invoke native prerequisite functions speculatively. The captured sample was current at root generation `0`, progression epoch `0|39:86|22:58|49|human|magic|178|0|anarchy|1|0|0|0`, offer observation `research-offers-1`, and offer binding generation `1`. Computed observations carry capture generation `1`. The catalog's `current` check passed. The native registry readback remained valid after capture, `Object.keys` was restored, and no observation was marked inconsistent.

The capture request was cleared immediately after the one diagnostic read. Gather intervention was unset. The diagnostic sessions disabled automation settings and did not advance any Research executor. There were no Research action invocations, and the two diagnostic-mode exported saves, control usage, and ordered native invocation sequences matched.

## Native observations and Stage 3F comparison

| Result                                       |                  P12A mode |                                                  Explicit request |
| -------------------------------------------- | -------------------------: | ----------------------------------------------------------------: |
| Capture enabled                              |                         No |                                                               Yes |
| Catalog definitions                          |                        834 |                                                               834 |
| Current/fresh catalog                        |                        Yes |                                                               Yes |
| Native requirement callbacks observed        |                         No |                                                               Yes |
| Native callback calls                        |                          0 |                                                                12 |
| Complete, valid computed observations        |                          0 |                                                                12 |
| Partial (`missing` callback) observations    |                          0 |                                                                11 |
| Invalid observations                         |                          0 |                                                                 0 |
| Capture unavailable                          | Yes, because not requested |                                                                No |
| Unoffered actions with computed observations |                          0 | 23 entries in the captured result set; 12 have valid requirements |

The 11 partial entries are `tech-lab_assistants`, `tech-aerographene`, `tech-ship_gauss`, `tech-ship_capacitor`, `tech-drive_optimizations`, `tech-ship_antimatter`, `tech-fleet_command`, `tech-womling_energy`, `tech-womling_land_use_planning`, `tech-womling_artisans`, and `tech-womling_market`. Each had `nativeCallCount: 0`, `status: missing`, and `validation: incomplete`. No invalid, thrown, absent, or inconsistent result occurred.

The pinned standard Stage 3F expectations match this exact Stage 2F MAD fixture:

- Lasers: `high_tech:8`, `supercollider:1`, `space:3`, `elerium:1`.
- Quantum Computing: `high_tech:10`, `nano:1`.

Both actions were unoffered and each native callback ran once. The P12B runner asserts those pinned requirements; it does not encode them in implementation code. The unmodified Stage 3F variant script first stopped before capture assertions because its `nativeTrace` setup exposes a frozen hook object without installing `readCurrentResearchCatalog`. A temporary test-bundle hook clone let it proceed, where its seeded B case failed the stale `B must natively purchase Mad Science` assertion at period 200; the temporary change was reverted. P12B independently exercised the same Stage 2F save and pinned requirement expectations without the Stage 3F Gather intervention.

## Existing P12A planner results

Both A and B feed their current catalog definitions through the existing effective snapshot and planner components. In mode A the effective snapshot contains zero computed definitions. In mode B it contains 12 current, valid computed definitions.

For explicit mode B, the graph has 834 definitions, 129 requirement gates, `targetStatus: conditional`, `dependencyEvidence: partial`, and actionable frontier entries `tech-mad_science`, `tech-steel_containers`, `tech-barns`, and `tech-black_powder`. Its direct MAD gates remain conditional. Native mandatory-obligation classification returns unavailable with the exact reason `native Research prerequisite inputs contradict the effective graph snapshot`; adaptive frontier selection returns `blocked-by-missing-native-authority` with no action selected.

## Shadow parity and Research draws

The immutable baseline bundle is from `a69d615f09cd012caddd0235d70ce036ea1dda53`, SHA-256 `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7`. The current candidate bundle SHA-256 is `0c7c8e447a04ebeba435178a1ae91b2a44e2f152fd522cdfd1b6a85b4e65c7c3`.

The 200-period ordinary production replay preserved parity:

- Baseline and candidate exported save SHA-256: `9b4a3e7364571db6c6fc858e743ee3610dde162a921132641f1d17c155e7ec67`.
- Exported state, native control usage, ordered native invocations, and Research draw counters matched.
- Each used 30 ordinary `research-catalog` draws and 30 Research observation samples.
- The request flag is test-surface-only; ordinary production parity includes no computed-requirement capture.

The isolated P12B A/B diagnostic modes each made one explicit protected fresh-catalog request. The explicit capture did not add a request beyond mode A. In the existing P12A exact-runner trace, its test-only diagnostic candidate recorded 32 actual `research-catalog` draws against 30 in production, with 31 versus 30 observation samples. That test-only draw cost is reported separately from production parity.

## Performance and cadence

The explicit P12B catalog call took 73.7 ms wall time around the Chromium evaluation, including serialization of the 834-definition response. The page's deterministic clock reported no inner elapsed time for this pre-cycle call, and the runner emitted no exclusive `research.computed-requirements.capture-and-draw` sample for it. This wall time is a single observation, not a CPU improvement or regression claim.

The existing pinned Stage 3F measurement records the exclusive `research.computed-requirements.capture-and-draw` phase at 59.1 ms across 30 captures (1.97 ms per capture; 2.36 ms per game tick over 25 ticks; maximum 3.1 ms). The ordinary P12A exact replay separately measured 25 frontier evaluations: prerequisite preparation 35.4 ms total, graph planning 21.5 ms, obligation classification 2.3 ms, resource acquisition 0.5 ms, and feasibility ranking 26.3 ms. These phase timings are from distinct phases and distinct runs.

One capture scanned the 834-entry registry, created 23 temporary callback wrappers, and observed 12 native callback calls. The evidence supports requesting a fresh capture when a new root/progression context needs graph authority. It does not support full-registry capture every game period.

## Verification

- `node experiments/p12b-native-prerequisite-capture.mjs --out=test-artifacts/benchmark/tmp/p12b-native-prerequisite-capture.json` — passed.
- `node experiments/p12a-mad-frontier-exact.mjs --out=test-artifacts/benchmark/tmp/p12a-after-p12b.json` — passed with zero computed requirements in its current observation mode and production parity preserved.
- `node tools/chromium-evolve-runner-test.mjs` — passed callback attribution, determinism, isolation, reload continuity, paused-game, and cleanup contracts.
- `npm run build` — passed; generated production bundle was unchanged.
- `npm run check` — passed all 348 test files plus bundle syntax, type checks, architecture checks, lint, and formatting.
- `git diff --check` — passed before staging.

No resource claims, Gather deferrals, Research policy changes, or autonomous Research purchases were introduced. The ordinary Research, Construction, and Gather executors were not changed.
