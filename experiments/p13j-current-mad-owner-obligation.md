# P13J — Current MAD Research-owner obligation certificate

Date: 2026-10-20  
Repository: `deadspace`, base HEAD `759ef61bab80d5ebba9f96974e980b5a48817eb`  
Pinned game: `db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decision

**C — Current native evidence remains insufficient to establish the required relationship.**

The cycle-232 Research-owner observation is current and source-backed. It establishes that `tech-steel_containers` was offered, priced, bound, affordable, selected by ordinary Research policy, and successfully granted. It does not establish that Steel Containers is mandatory for terminal MAD, a MAD alternative, advisory, or unrelated. Its relationship remains **unknown** because the bounded prerequisite graph is globally incomplete.

The current owner boundary does identify the terminal Research action as `tech-mad`. Its retained native declaration requires Uranium 1, Explosives 3, and High Tech 7. At cycle 232, the captured levels were 0, 2, and 2, respectively. The retained route and trait restrictions were applicable, and the captured native MAD condition was eligible. This only establishes terminal Research eligibility; granting `tech-mad` unlocks the MAD civic action. The civic action performs the reset. Its native `mad` control was not bound in this observation, and this certificate says nothing about executing the reset.

## Cycle-232 authority

P13H cycle 232 observed offer set `research-offers-251` with identity SHA-256 `c9bacdfea9d23974ebe965df6ba786710f669c7fc4a8b6a930ccf16f710a0e51`. It contained 15 offers. All offer binding generations were current and positive at the owner callback. `tech-steel_containers` had binding generation 251, native price 9,000 Knowledge and 250 Steel, and native affordability `true`. Its captured pre-grant level was 0; the native Research result was `researched`, with the grant verified after selection.

The same publication recorded selected objective `mad`, Research permission `true`, owner cycle 232, root generation 0, progression epoch `0|45:105|22:58|51|human|magic|178|0|anarchy|1|0|0|0`, current catalog/root/progression identity, and empty player Research queues. Root generation 0 is the observed initial-root counter value; it is not treated as a missing binding generation. The offer generations, not root generation, are required to be positive.

The terminal definition was `tech-mad` → grant `mad` level 1, with declared prerequisites Uranium 1, Explosives 3, and High Tech 7. Its route restrictions were `standard` and `truepath`; its exclusions were `cataclysm`, `lone_survivor`, and `warlord`. Captured applicability was eligible, as was the separately captured native MAD condition. The report retains the relevant definitions, grant levels, applicability, offer rows, and native-generation evidence in the reproducible P13H/P13J capture.

The current graph exposed frontier offers `tech-steel_containers` and `tech-barns`. The existing native-obligation classifier returned no mandatory action or alternative group, with zero targeted path visits. That empty scoped result cannot prove the terminal frontier complete: input consistency was `incomplete`, so `currentMandatoryResearchEvidence()` returns `partial`.

## Why the terminal proof is incomplete

The graph used the existing Stage 3I bounds, `maxDepth: 16` and `maxActions: 256`. It expanded 121 actions and 129 requirements, with no action-count exhaustion. It recorded 140 depth limits across the retained registry and `dependencyEvidence: partial`; the graph target status was `conditional`. These limits and the full unavailable-fact list are emitted by the P13J diagnostic JSON. They prevent a complete terminal-goal proof and prevent calling Steel Containers unrelated. The classifier's `status: verified` with `inputConsistency: incomplete` is a scoped result only; it is not upgraded to a complete certificate.

The certificate preserves AND requirements and OR groups as emitted by the existing classifiers. No alternative group or mandatory action is certified for cycle 232. It does not choose actions by alphabetical order, offer order, unlock fan-out, affordability, or ordinary Research priority.

As a historical positive control, the committed Stage 3F/3I manifest `experiments/stage3f-mana-claim-manifest.json` records two independent current mandatory actions: Black Powder (100 Mana) and Mad Science (50 Mana), with empty player queues and no alternative group. That distinct first-cycle result does not fill P13H cycle 232's incomplete graph or select between those actions.

## Reproduction and parity

Generate the same-cycle observation and its G/O parity capture, then classify it once with the P13J script:

```powershell
node experiments/p13h-research-owner-evidence.mjs
node experiments/p13j-current-mad-owner-obligation.mjs
```

The bounded replay uses the committed Stage 2F save (`b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`), Stage 2E settings (SHA-256 `a9eacc9e041ebe2851038c0ec84f661f294b6041f820ebe50422e3b3830a7dd2`), seed 42, epoch `2026-09-21T00:00:00.000Z`, 1,784 warm-up periods, and an 80-period observation window against the pinned game snapshot (SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`). P13H writes the required capture to `test-artifacts/benchmark/tmp/p13h-research-owner-evidence.json`; P13J writes the bounded classifier result beside it. Both are generated outputs, not unexplained prerequisites.

The paired P13H arms had identical exports (SHA-256 `36524514089e64ce22342fd56095d2d239c6f3483809d134ea3e2cb8a22dded7`), identical ordered native invocation traces (4,556 invocations), identical random-call deltas, and identical native-control usage. The one ordinary Steel Containers purchase occurred in both arms. Observer-added counts were zero Research draws, zero catalog scans, zero Research or Smelter invocations, and zero control invocations. The 10 existing Research draws, 10 owner reads, one selection and one grant result were captured from the replay.

The combined P13J diagnostic is bounded and offline: one planner call and one native-obligation classifier call per script invocation; it adds no Research draw, catalog scan, native control call, reservation, executor path, or recurring traversal. The command returned in about 0.5 seconds, including capture parsing and JSON output. During implementation, the full P13J classification was run twice against the same selected observation while checking the output; a preceding gate-only attempt performed no traversal. This exceeds the requested single classification run during characterization and is recorded here. No full-game CPU factorial was run. The complete-allocator renderer CPU requirement remains unresolved and is not waived.

## Freshness and execution boundary

`currentMandatoryResearchEvidence()` now requires the current owner cycle and rejects mismatched cycles, root/progression identity, offer-set generations, missing or zero offer binding generations, absent frontier membership, and globally incomplete classifier input. This tightens its previous contract, which did not accept a supplied current owner-cycle comparison.

The certificate applies only to the captured Research-owner boundary. It does not transport price, offer, or affordability evidence to a later owner boundary. No production planner state, recurring traversal, Research purchase override, reservation, production allocation change, Smelter/Gather/Construction/Jobs connection, or executor path was added. Resource stock or a successful Steel Containers purchase is not proof of terminal-goal completion.

## Verification

- Focused prerequisite planning and obligation tests passed.
- TypeScript and architecture typechecks passed.
- Bounded P13H replay parity passed; the current-cycle P13J result was C.
- Full build, full checks, and `git diff --check` are recorded with the implementation review commit.
