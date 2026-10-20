# P13L.1 — Stage 3I D runner positive-control diagnosis

Date: 2026-10-20  
Repository: `deadspace`, starting HEAD `671ad482fde11fea72ef14ad62282b24b58b0804`  
Pinned upstream: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**STOP.** Runner initialization is repaired and verified, but the current Stage 3I D positive control does not admit claims. Its first cycle fails closed in the native prerequisite classifier. No concurrent, Mad Science-first, or Black Powder-first policy arms were run, and the identical outcomes from P13L Part B remain invalid policy evidence.

## Runner ownership and bootstrap

`tools/chromium-evolve-runner.mjs`, `tools/chromium/bridge.js`, and `tools/chromium-evolve-runner-test.mjs` are owned by the nested `D:\work\Evolve-Automation\tools` repository (`https://github.com/lamia-zamia/tools`), not by `deadspace`.

The historical manifest records runner fingerprint `23383ea302dcbe5545ba83c8aa72e0d8f231a96135fd31b60d9bc95bd9102257`. No commit in the local tools repository history reproduces that fingerprint, so its commit SHA cannot be established from the available checkout. The bounded replay used fingerprint `a982b70325d12cf89c4c0a042f4cffe06966655d9ddfaf83146e35f219ae02d1`. The final runner source fingerprint is `3ece7df32a7506f061120579aaa8fa80a2b712813feaaba3a04e89609cacd89d`; the only runner change after the replay preserved the prior frozen-hook behavior when the new option is omitted. The replay supplied the option, so its initialization path is unchanged.

With `nativeTrace: true`, the previous bridge installed a frozen `window.__EA_TEST_HOOKS__`. Stage 3I's `runVariant()` assigned `gatherIntervention` after `openSession()`. In the non-strict Puppeteer callback that assignment could silently fail; `Reflect.set()` against the frozen property returns false. Replacing the object would discard `onControlInvocation`. The runner now accepts only a plain `initialTestInterventions.gatherIntervention.resourceClaimMode` value from its recognized mode set, installs it in the document-start bridge before the bundle runs, leaves the hook container writable, and defines the trace callback as non-writable and non-configurable. A session-storage marker makes this a one-load intervention; a game reload reports it as already consumed and does not restore the mode.

Contract coverage passed for native tracing with and without an intervention, malformed configuration rejection, writable diagnostic properties, trace-callback protection, and intervention non-reactivation after `importGame()` reload.

## Inputs and provenance

| Input                      | Stage 3I manifest                                                  | Bounded D replay                                                   | Match  |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ |
| Upstream commit            | `db38e2af831907d49aeb5348d678d8d8745d6c3f`                         | Same                                                               | Yes    |
| Game snapshot SHA-256      | `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553` | `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7` | **No** |
| Save SHA-256               | `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e` | Same                                                               | Yes    |
| Original settings SHA-256  | `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2` | Same                                                               | Yes    |
| Effective settings SHA-256 | `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131` | Same (`autoResearch: true`)                                        | Yes    |
| Test bundle SHA-256        | `94589db734c48326e8ad4a33c3d7f3d15f519d50674e6331ce036552aeca9b3b` | `65c949a4f60584c4b132aec1c064a042b209e5b6ff90c6cf2d116c2f27629e00` | **No** |
| Runner fingerprint         | `23383ea302dcbe5545ba83c8aa72e0d8f231a96135fd31b60d9bc95bd9102257` | `3ece7df32a7506f061120579aaa8fa80a2b712813feaaba3a04e89609cacd89d` | **No** |
| Seed / epoch               | `42` / `2026-09-21T00:00:00.000Z`                                  | Same                                                               | Yes    |
| Starting period            | `0`                                                                | `0`                                                                | Yes    |

The available game snapshot sidecar says the replay snapshot was built from the pinned commit on 2026-10-16 at 20:57:30 UTC. The old `f25222…` bytes and sidecar are absent from the current checkout and other inspected `Evolve-Automation*` checkouts; only the hash remains in the Stage 3I manifest. The current snapshot builder bundles `src/main.js` with the upstream checkout's installed esbuild (0.25.0). Since the historical artifact and its build-tool provenance are unavailable, the byte difference cannot be attributed to a specific build input. The shared upstream commit does not establish artifact equality.

The historical test bundle is also absent. The replay bundle was generated from the current `deadspace` source, which has changed since the Stage 3I manifest. The old manifest retains the admitted claims but not the first-cycle graph snapshot identity, limits, or classifier consistency evidence. Therefore the current graph cannot be compared byte-for-byte with the historical effective definitions.

## First-cycle evidence

The bounded replay used the committed save and settings, seed 42, epoch above, starting period 0, and advanced only 8 periods to owner cycle 1. The generated JSON records both starting period 0 and ending period 8. Startup evidence was `goal-derived-conjunctive`, source `openSession.initialTestInterventions`, status `installed`, load 1. The hook container was not frozen; `onControlInvocation` was present, non-writable, and non-configurable. The replay JSON SHA-256 is `4f4c7c6ddfb5b187b74ee747aca7b9899dc01ac67d869013d4c938b0308f9513`.

The current owner observation retained MAD as the selected goal, Research permission enabled, empty player queues, root generation 0, and progression identity `0|39:86|22:58|49|human|magic|178|0|anarchy|1|0|0|0`. It had 13 native offers in observation `research-offers-1`; the two relevant native offers both had binding generation 1 and current control generation 1:

- `tech-black_powder`: 100 Mana, native affordability false, non-Mana affordability true.
- `tech-mad_science`: 50 Mana, native affordability false, non-Mana affordability true.

The first selection was `unavailable`, reason `native prerequisite graph cannot prove mandatory obligations`; it admitted zero claims. MAD terminal eligibility was `eligible` with no rejection reasons and fresh cycle-1 provenance. The effective native graph was `targetStatus: conditional`, `dependencyEvidence: partial`, with 124 action nodes, 129 requirements, 140 depth limits, and 3 unavailable target facts. Its effective snapshot identity was SHA-256 `bd2db71586fb17b78ad3ef05924f92d14e45bde8d3fe8e881a93bc3a9286457d`. Recorded grant levels included `science:4`, `high_tech:0`, `explosives:0`, `uranium:0`, and `oil:0`. MAD Science, Black Powder, and every unresolved alternative cited below had native applicability status `eligible`; they were not rejected for applicability. The mandatory plan was `unavailable`, input consistency `incomplete`, with 17 native-path visits and no mandatory IDs. It rejected Mad Science because possible high-tech-7 alternatives remained unknown (`tech-rocketry`, `tech-robotics`, `tech-lasers`, `tech-artifical_intelligence`, `tech-quantum_computing`, `tech-virtual_reality`, `tech-plasma`, `tech-shields`, `tech-ai_core`, `tech-metaphysics`, `tech-orichalcum_analysis`, `tech-cybernetics`, and `tech-divinity`). It rejected Black Powder because `tech-anfo` and `tech-super_tnt` remained unknown alternatives. Input consistency specifically reported partial dependency declarations and graph depth limits.

The claim lifecycle was suspended with `research-owner-observation-unavailable`; the selection status separately records the graph rejection. No Research-owner selection or Research action invocation occurred in the 8-period window. Runner native tracing recorded 360 ordinary native control invocations and remained active. The offer catalog and probe shared the same `research-offers-1` observation; the probe added zero native calls and zero Research draws. Hook startup used one intervention clone, one trace property definition, and one session-storage consumed marker. The first-cycle evidence added one graph identity computation; the graph and mandatory classifier counters are reported above. No offers or purchases were synthesized.

The first measured failure in this replay is the classifier rejecting the partial effective graph and unresolved native alternatives after successful intervention initialization. The replay matched Stage 3I on root/progression, goal, queue, offer generation, prices, save, and settings; the current source includes stricter native prerequisite consistency validation added after Stage 3I (including `c66fe37d`, 2026-10-18). Available historical records do not include the graph identity, classifier evidence, bundle bytes, or snapshot bytes needed to prove this is the first historical-to-current divergence. An altered generated snapshot or changed effective definitions may also contribute. This investigation does not relax admission checks.

## Reproduction and checks

Bounded probe command:

```text
node experiments/p13l1-stage3i-positive-control.mjs
```

It stops on the first selection event, with a 16-period safety cap. The captured JSON is under ignored `test-artifacts/benchmark/tmp/p13l1-stage3i-positive-control.json` (SHA-256 above). The runtime selected MAD with Research permission, saw empty queues and a fresh 13-offer set (`research-offers-1`); it generated one selection event and zero Research-owner selection events in the window. Native trace captured 360 invocations. Catalog inspection reused that observation, added no native calls, and forced no Research draw. No synthetic offers, generations, or direct native purchases were used.

Checks run:

- `node tools/chromium-evolve-runner-test.mjs` — passed.
- `node scripts/test.mjs goal-resource-signal research-prerequisite research-goal-candidates research-advisory-routes captured-mad captured-tech-catalog` — passed, 9 focused test files.
- `npm run build` — passed.
- `npm run check` — passed, including type checks, architecture checks, lint, format, and 359 test files.
- `git diff --check` — passed in both repositories.

The bounded positive control failed its mandatory-claim criterion, so the same-arm repeat and all Mana priority comparisons were skipped.
