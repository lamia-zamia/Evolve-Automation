# P13I — MAD goal-action authority from native prerequisites

Date: 2026-10-19  
Repository: `deadspace`, starting HEAD `2c98d48b172afd4a2f5757fb30842bc6ca049acd`  
Game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Results

**B — Goal frontier known but selection ambiguous, for the saved Stage 3I D first-cycle fixture.** The existing native-obligation classifier reports both `tech-black_powder` and `tech-mad_science` mandatory for the selected MAD target. Both were current Research offers and had current binding generations. Their native prices required 100 and 50 Mana, respectively. The evidence supports two mandatory frontier actions and no preference between them. The Stage 3I owner later bought Mad Science; that ordinary purchase does not make it uniquely preferred.

**C — Native goal authority incomplete for P13H cycle 232.** The P13H capture establishes that `prestigeType` was MAD in the configured save, the player queues were empty, and the ordinary Research owner selected and bought `tech-steel_containers` at a native price of 9,000 Knowledge and 250 Steel. Its archived draw event does not carry the effective prerequisite definitions, current MAD terminal gates/condition, grant levels, or applicability snapshot needed to classify Steel Containers against terminal MAD. The purchase is therefore goal-relationship unknown in that capture. It is neither established mandatory nor alternative nor conditional by the captured evidence.

No explicit player queue supplied an action at either frontier. Queue evidence was empty in the P13H cycle 232 publication and the Stage 3I D first-cycle selection. Generic MAD preference and affordable-first owner selection do not independently authorize an action.

**CPU readiness — unresolved.** This characterization is not the complete-allocation 2% CPU gate. No large allocator factorial was run.

## Existing authority

- `planNativeResearchPrerequisites()` expands the retained effective native requirement graph. It records current offers as frontier actions and keeps unknown declarations, route/condition applicability, cycles, missing mappings, and work limits visible. It does not rank the frontier strategically.
- `classifyMandatoryResearchPrerequisiteObligations()` intersects actions across complete prerequisite paths; unresolved branches keep a mandatory claim unavailable. `classifyMandatoryNativeResearchObligations()` additionally checks the bound terminal eligibility snapshot, definitions, grant levels, applicability, and current offers. These are the existing hard-obligation paths.
- `currentMandatoryResearchEvidence()` checks graph/plan identity, target identity, root/progression freshness, offer generations, and frontier membership. `bindNativeResearchEligibilityEvidence()` binds an observation to a graph snapshot; binding does not itself prove eligibility.
- `evaluateResearchGoalCandidates()` and `planAdvisoryResearchRoutes()` classify/rank possible contributors. Their advisory or conditional relevance does not prove an obligation. Unlock fan-out and alphabetical/offer ordering are not obligation evidence.

The MAD Research target identity in the existing capture is `tech-mad`. Its selected `prestigeType`, native condition, restrictions, and completion gates must still be current and eligible before its prerequisite paths can establish goal authority. P13H records root generation and progression identity for the owner observation, but not those terminal facts or the effective graph. The P13H offer bindings are current at their own draw only; draw-time native affordability is not a later stock observation.

## Native definition and freshness boundary

The Research catalog snapshot can return native action definitions alongside the offers. When the computed-requirement context is enabled, it can attach same-context computed requirements. The retained definitions include action/grant identity, declared requirements, native conditions and restrictions; the separate progression readers supply grant levels and applicability. The ordinary P13H evidence callback publishes the offer/read/selection/result values but omits that definition and gate material. Replaying obligation classification against the P13H JSON after the fact would require invented or newly scanned inputs, so no graph claim is made for that cycle.

The Stage 3I D record is a distinct historical observation. Its first-cycle classification is retained as such; it does not upgrade the meaning or completeness of P13H cycle 232. The later Stage 3I sample that lists `tech-black_powder` and `tech-electricity` reflects a changed progression state and is not substituted for the first-cycle pair.

## Actionability distinctions

The Stage 3I fixture establishes offer membership, current native prices, and the mandatory relation for both actions. It does not establish affordability at the 50/100 Mana prices; both were Mana-blocked in the first-cycle observation. The later ordinary grant of Mad Science proves that the owner bought it and its grant changed, not that it was the optimal investment. Steel Containers’ P13H price and purchase similarly prove only its native offer, price, owner selection, and grant.

The domain goal-resource signal now has typed `blockingEvidence` for unresolved facts required by a positive incremental-target signal. Informational `unknownEvidence` remains visible but does not silently block or promote a result. A threshold met in stock remains distinct from terminal-goal completion, which requires explicit goal state. The signal remains diagnostic and has no production consumer.

## Bounded work and parity

The one bounded P13I diagnostic invocation is `node experiments/p13i-mad-goal-action-authority.mjs`, against the saved P13H cycle 232 observation. It used `maxDepth: 16` and `maxActions: 256`, expanded 0 actions and 0 requirements (observed depth 0), and reported missing registry/grant-level authority with no graph truncation. The obligation classifier returned unavailable because terminal eligibility was not present. This cost is separate from gameplay: 0 native Research draws, 0 native control invocations, and 0 catalog scans. The Stage 3I D first-cycle result is read as saved historical evidence; it is not reconstructed or assigned a new graph cost.

The existing native graph call sites also use `maxDepth: 16` and `maxActions: 256`; the native obligation classifier has a 10,000-visit ceiling. The graph reports `limits`, missing facts, and cycles, and the obligation classifier fails closed when a required branch is conditional or unavailable. A truncated or missing branch cannot certify completeness. No new recurring traversal, native draw, control invocation, catalog scan, Smelter hypothetical, reservation, polling loop, or executor was added in this slice. The P13H parity record remains the gameplay comparison: identical exports, ordered Research/Smelter invocations, random-call deltas, and native-control usage, with zero observer-added Research draws or catalog scans. Its measured bounded observer timings are not a stable CPU acceptance result.

Focused tests cover necessary unresolved authority blocking a positive signal, irrelevant diagnostic context, threshold versus completion, zero/missing generations, and existing AND/OR mandatory/alternative behavior. Existing Chromium contracts cover current/stale offers, price changes, root/progression changes, exclusions, and runner parity. The saved P13H row remains incomplete for its prerequisite graph; P13I does not invent definitions to fill that gap.

## Verification

Verification:

- `node experiments/p13i-mad-goal-action-authority.mjs` — passed; output showed the P13H terminal graph unavailable with 0 expanded actions/requirements and the saved Stage 3I mandatory pair.
- `node scripts/test.mjs goal-resource-signal research-prerequisite research-goal-candidates research-advisory-routes captured-mad captured-tech-catalog` — passed 9 focused files plus bundle syntax.
- `npm run build` — passed.
- `npm run check` — passed all five checks and 358 test files.
- `node tools/chromium-evolve-runner-test.mjs` — passed determinism, isolation, reload continuity, pause, and cleanup contracts.
- `git diff --check` — passed.

The independent 2% full-allocator gate remains unresolved. No push was made.
