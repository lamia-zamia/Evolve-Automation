# P26 — Research observation dependency and redraw elimination

## Decision

**C — retain the current Research redraw boundary. No production candidate or tests were retained.** The adaptive discovery cache is bypassed between processed cycles, but removing that invalidation would let an old native eligibility and price observation cross volatile game-state changes that are not represented by the progression epoch. The native game exposes no complete, retained eligibility callback that can replace `drawTech()` safely. No draw-elimination candidate could therefore pass the required correctness gate, so candidate CPU and latency savings are zero and a candidate-vs-baseline performance comparison was not run.

The immediate architectural recommendation is to keep one shared full Research observation per processed cycle, plus a fresh observation after a Research mutation when later consumers need the changed progression state. Retain static action definitions across that boundary as already implemented. Revisit draw elimination only if upstream exposes a supported complete eligibility result/callback or a verifiable dependency generation for every dynamic condition.

## Scope and evidence

- Automation checkout: `lamia-zamia/Evolve-Automation`, branch `deadspace`, HEAD `b557a451174986abd97562727e3b8e9b68897301`.
- Pinned game checkout: `D:/work/Evolve-DeadSpace`, HEAD `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Exact runner: `tools/chromium-evolve-runner.mjs`, runner input hash `06d1ede0bed3179ff8a6538024208f7f20a28fddf8f2c365b9c841becfd97ea9`.
- Game snapshot: `test-artifacts/game/evolve-deadspace.js`, SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`, upstream commit `db38e2af`.
- Automation production bundle SHA-256: `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`.
- Exact Chromium run: HeadlessChrome `151.0.7922.71`, seed 42, epoch `2026-09-21T00:00:00.000Z`, 800 periods / 100 work ticks per fixture, `current-full.json` settings. Existing saves were early `deadspace-early-day14.json`, progression `stage2f-fixed-progression-export.json`, and late `mad-tech-offered-blocked.json`.

The three runs used the current unmodified production bundle. Their exports completed normally. The instrumented exact-runner Research draw counts and exclusive elapsed draw phase were:

| Fixture | Work ticks | Native Research draws | Processed-cycle invalidations | Progression invalidations | Native draw + DOM phase | TaskDuration / advance wall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Early day 14 | 100 | 110 | 100 | 10 | 1,181.0 ms (11.81 ms/tick) | 9.906 / 9.916 s |
| Stage 2F progression | 100 | 116 | 100 | 16 | 1,927.3 ms (19.27 ms/tick) | 14.911 / 14.922 s |
| Late MAD blocked | 100 | 103 | 100 | 3 | 3,414.2 ms (34.14 ms/tick) | 27.224 / 27.239 s |

These are instrumented elapsed-phase totals, not renderer CPU. The current late result reproduces P22's 103 draws over 100 work ticks. P22's separate measurements report 32.32 ms/tick in the exclusive native draw phase, 29.3204 s renderer CPU and 25.5447 s `TaskDuration` over 800 periods. Identical-bundle controls ranged from 29.4525–30.4130 s renderer CPU (3.23% of mean) and 25.6821–26.7008 s `TaskDuration` (3.91%). Its separate callback-profile run reports work-tick latency p50 161.8 ms, p95 234.4 ms, p99 346.9 ms, max 637.4 ms. Those control spreads are too large to support a small CPU claim without new paired runs.

The existing performance counters already separate causes: request counts and requesters, sample counts and sample requesters, `research.observation.invalidated.processed-cycle`, `.progression`, `.bindings`, and `.root-replacement`, discovery cache outcomes, and individual `research.draw.*` phases. In the late exact-runner pass, the 103 samples were requested by `resource-demand`; `auto-research` made 100 additional requests that hit the cycle sample. Invalidation counts were 100 processed-cycle and 3 progression, with zero binding or root-replacement invalidations. Thus the 103 draws are not 103 independent consumer demands: they are 100 first samples plus three post-progression samples, shared by Research, demand, and the other consumers.

The current exact-runner results, including the raw diagnostics, are in the ignored workspace artifact `test-artifacts/benchmark/tmp/p26-current-baseline.json`. It is measurement output, not a committed deliverable.

## Why the adaptive cache does not help across cycles

`src/adapters/evolve/discovery-scope-cache.ts` holds a sample from 1,000 ms up to 16,000 ms depending on unchanged answers. Its comment describes the age as a bound for inputs the epoch cannot fully represent. Within a processed cycle, `sampleOfferedTechs()` can share the same sample and its native bindings across multiple requesters.

At `src/bootstrap/captured-progression-control.ts:575-620`, the conditional Research invalidator clears the held sample when the progression epoch changes or a held row's control generation is stale. However, `beginProcessedCycle()` at `:753-761` unconditionally clears `lastOffered`, `lastTechDefinitions`, `lastGranted`, attempt state, and both Research scopes on every processed cycle. That prevents the cache's age/backoff from ever reusing a Research sample across cycles. The unconditional invalidation is counted separately, so the current diagnostics can distinguish it from actual progression and binding invalidations.

The actual full draw is the current authority for eligible membership and the offered row's native price and affordability. `createCapturedTechCatalog()` joins `drawTech()` bindings to the rendered `#tech .action` rows, reads the same-draw `data-*` price and `cna`, and retains validated technology definitions (`src/adapters/evolve/progression/research/captured-tech-catalog.ts`). Re-resolving a retained row binding avoids a draw only while both the observation and native generation remain current.

## Consumer dependencies

| Consumer | Needs from Research | Freshness / authority reason |
| --- | --- | --- |
| AutoResearch | Membership, current numeric prices, native affordability, live holdings | The decision uses current holdings against row costs and also gates on same-draw `cna`; `Bool` and other special costs cannot be reproduced from numeric stock. Execution calls the native Research action and checks the resulting grant. |
| Resource demand and trigger demand | Membership/prices when Research queue or Research conditions affect commitments; live holdings | Demand uses live root resources and native cost readers; it shares the same Research observation so queue reservation and trigger targets describe the current offer set. |
| Storage | Membership/prices and live quantity/capacity | Offered technology prices become storage targets; affordability is not needed, but membership and price determine future storage requirements. |
| Construction and Knowledge gate | Membership/prices and current holdings/capacity | The Knowledge gate reads the already sampled offers, their costs, and current resource/capacity state; it deliberately does not draw its own catalog. |
| Queued Research | Current offer membership and price, plus queue requirements | Queue reservations join current offered IDs and prices; native `checkTechRequirements()` is module lexical, and the queue's `req` field is not a complete substitute. Queue-3 precognition can also affect eligibility. |
| Research triggers and condition context | Offers for `ResearchUnlocked`, granted half for `ResearchComplete`, costs for reservation/Knowledge signals | The granted half is drawn only when configured. Trigger execution still dispatches through native action controls. |
| Power | No direct Research catalog read | It inherits Research freshness through prepared demand and the cycle's mutation invalidation boundary. |

These paths are wired in `src/bootstrap/captured-runtime-control.ts:5356-5382, 5732-5747, 7735-8049`; more specific consumers are `captured-resource-demand.ts`, `captured-storage.ts`, `captured-knowledge-gate.ts`, `captured-queue-reservations.ts`, `captured-triggers.ts`, and `captured-condition-context.ts`. They already share the same cycle sample rather than issuing one draw each.

## Native authority and cheaper sources

The pinned upstream source separates retainable metadata from current eligibility:

1. **Stable metadata:** `src/tech.js` action declarations retain IDs, grant levels, categories, literal prerequisites, paths, trait restrictions, and callback identities. `actions.js` assigns the validated registry to `actions.tech`. Automation already retains/validates these definitions in `src/adapters/evolve/captured-game-mechanics.ts` and indexes definitions in `captured-tech-catalog.ts`. Retaining that metadata does not require a Research draw.
2. **Dynamic membership:** `actions.js:6263-6353` checks path, current prerequisites, queue precognition, grant state, traits/genes, and calls arbitrary per-tech `condition()` callbacks. `drawTech()` at `:6555-6655` composes those checks for the current registry and then emits native rows. Conditions are not represented by registry metadata alone.
3. **Dynamic price and affordability:** `setAction()` at `actions.js:6682+` calls native `checkAffordable()` and native adjusted costs. `adjustCosts()` is private game logic (`src/functions.js:2312-2346`); `checkAffordable()`/`checkCosts()` also cover special cost semantics. The existing same-draw row captures the adjusted numeric price and native `cna` result. Automation's `buildQueue.setData()` probe is not a Research price substitute: its existing test explicitly verifies that `readCost("tech-foundry")` fails because upstream does not resolve that action through the build queue. Even if a future native price probe supported Research IDs, it would not establish offer membership or complete native special affordability.
4. **Live holdings:** root state provides current resource quantities without a Research draw. Automation already uses those live holdings for numeric affordability and demand. This is only a partial substitute: it cannot identify an offer hidden by a dynamic condition or evaluate native `Bool`, `Custom`, prestige, or pool checks.
5. **Final purchase authority:** upstream `runAction()` rechecks current Research requirements, then the action's payment path recomputes native adjusted costs and stock before granting technology. Keeping native execution protects the actual purchase, but does not make a stale catalog safe for current offers, queue reservations, storage targets, or planning decisions.

The epoch is intentionally incomplete. `src/adapters/evolve/progression-epoch.ts` explicitly names conditions that read volatile values outside its token, including `resource.Demonic_Essence.amount >= 1`, `interstellar.dyson_sphere.count >= 100`, and `eden.fortress.armory < 100`. The pinned `src/tech.js` has concrete examples: `demonic_infusion` / `purify_essence`, `orichalcum_sphere`, and `active_camouflage`. A quantity/count mutation can change eligibility without a technology grant, root replacement, or progression-epoch change. Expanding the epoch to enumerate every condition's private reads would duplicate private game logic and rot against upstream changes—the failure mode the cache's bounded age exists to cover.

## Adversary disposition

No cache-retention prototype was run against these adversaries: source inspection already establishes that a candidate which reuses the last full observation has no native-equivalent answer for them, so running an invalid candidate through a large gameplay matrix would not establish correctness. The production implementation was exercised in Chromium on the three fixtures above. The rows below record what invalidates a proposed retained sample and why the current full draw remains necessary.

| Adversary | Evidence / consequence for a cache-retention candidate |
| --- | --- |
| Resource holdings change without an epoch change | Demonic Essence `amount` directly gates native conditions; live holdings help numeric affordability but cannot restore changed membership. |
| Dynamic technology condition changes | Dyson Sphere count and Eden armory are condition inputs absent from the epoch; a retained offer set can wrongly offer or hide a technology. |
| Price changes without a technology grant | Native cost callbacks and `adjustCosts()` use current game modifiers; numeric cost probes can read known-action prices but do not validate current membership or native affordability. An uncertain dependency must force refresh/fail closed. |
| `Bool` and other special costs | Upstream Research actions `unification2` and `unite` use a dynamic `Bool()` cost based on foreign government state (`tech.js:11570-11621`). A numeric holdings-only check cannot reproduce the native affordability verdict. |
| Research queue mutation | Queue requirements/precognition can change eligibility independently; the catalog needs the native current offer set. |
| Normal player Research-tab redraw | Native redraw can rebind controls without an epoch transition; the code checks control generations and invalidates a stale observation (`captured-progression-control.ts:594-620, 688-698`). |
| Root replacement or prestige | Root replacement invalidates all scopes and clears Research state (`captured-progression-control.ts:842-849`); retaining across it would bind an old catalog to a new root. |
| Failed or incomplete catalog read | Scope `read()` deletes a failed entry; the catalog clears the held snapshot and returns unavailable rather than using stale offers. Preserve this fail-closed behavior. |
| Multiple Research actions within/across cycles | Each native action revalidates and pays through native game code. A grant changes progression and requires a fresh observation for downstream consumers; current post-Research mutation handling invalidates demand and causes a new sample only when needed. |

## Measurement and recommendation

The opportunity is 100 per-cycle native Research draws in the late 100-work-tick window, plus the three post-progression draws required by changed offers. The exact-runner run confirms these causes independently: 100 `research.observation.invalidated.processed-cycle` events and 3 `research.observation.invalidated.progression` events; `research.observation.invalidated.bindings` and `.root-replacement` were zero. Requester counts show that resource demand initiated the 103 samples while AutoResearch reused the already sampled answer. P22 attributes 32.32 ms/tick of exclusive elapsed time to the late native draw and DOM phase.

There is no retained-candidate draw reduction to measure: **0 draws, 0 native callback work, 0 renderer CPU, 0 TaskDuration, and 0 work-cycle latency eliminated**. Current-versus-candidate state, offer membership, prices, affordability, purchases, holdings, and save parity are therefore not claimed. P22's renderer CPU control spread already exceeds 3%; no small performance claim can be made from its baseline alone.

Prioritized path:

1. Keep the existing shared, fail-closed native Research draw for each processed-cycle observation and after progression mutations. This preserves current membership, price, affordability, reservation, and execution semantics.
2. Keep stable registry metadata and current resource holdings on their existing cheaper paths; these are already separated from the full draw.
3. Do not treat the current `buildQueue.setData()` probe as a Research price source: `tests/evolve/economy/captured-action-costs-test.mjs` asserts that `tech-foundry` is unsupported. A future native price path could help only after Research IDs are proven to resolve; it still could not authorize membership or replace special affordability.
4. Consider a reduced-draw architecture only after a supported native API provides a complete membership/eligibility result for the validated registry, current adjusted prices, special-cost affordability where required, and a generation tied to all dynamic dependencies. Missing or uncertain fields must continue to refresh/fail closed.

No upstream game files, Chromium runner files, tests, workers, or `debug.js` were modified. No code or test commit was created; only this report is intended for the report commit.
