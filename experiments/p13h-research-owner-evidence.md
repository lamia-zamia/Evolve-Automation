# P13H — Research-owner evidence and goal-action authority

Date: 2026-10-19<br>
Repository: `deadspace`, starting HEAD `c36f91e97f5f5edfa43b2a16e4407586e5cb6b74`<br>
Game: `pmotschmann/Evolve @ db38e2af831907d49aeb5348d678d8d8745d6c3f`

## Decisions

**Research publication — A.** A coherent current Research-owner observation can be published from the existing native draw and owner read without another draw. The test-only publication reports complete membership, offer and price identity, binding generations, root/progression identity, native affordability at draw time, already-sampled resource amounts, owner read/exclusion facts, ordinary selection, and observed grant result. The observer is opt-in and does not affect the ordinary export or command trace.

**Autonomous goal authority — B.** The capture establishes only current offer facts and the ordinary Research owner's choice. It does not independently establish that `tech-steel_containers` is a mandatory action for terminal MAD. The P12D route is advisory/conditional and no explicit player queue or independently verified mandatory prerequisite supplied goal-action authority.

**CPU readiness — unresolved.** The bounded paired run is not a full renderer CPU factorial and does not pass the 2% complete-allocation gate.

## Current Research-owner boundary

At each owner cycle, `createCapturedResearchControl.runCycle()` reads the existing shared Research sample or calls `catalog.read()` once, keeps the returned offer list for that cycle, and passes it to the owner reader/executor (`src/bootstrap/captured-research-control.ts`). The catalog obtains the current native offer rows and exact displayed prices during its protected Research draw, requires matching native definitions and complete price rows, and records test-only offer observation/set identities plus captured binding generations (`src/adapters/evolve/progression/research/captured-tech-catalog.ts`). A binding generation of zero means no captured binding, not current authority.

`ResearchReader.read()` uses the native `checkAffordable` result from that draw. Only native-affordable offers receive a resource read for their exact cost resource names; it then computes resource affordability, cost reservations, and policy/conflict exclusions. Exclusions are evaluated only when the action is otherwise affordable. The ordinary planner chooses the first affordable, non-conflicting action and stops there (`src/adapters/evolve/progression/research/captured-research.ts`, `src/domain/progression/research/research.ts`). The executor rechecks the exact action and binding generation, invokes the native action, and verifies the declared grant level changed before reporting `researched` (`src/adapters/evolve/progression/research/captured-research.ts`).

P13H adds opt-in callbacks at those same draw, owner-read, selection, and result boundaries. They publish the existing immutable offer/read objects; there is no second `catalog.read()`, added affordability sampling, catalog traversal, native action, or phase change. Full offer rows are projected into the bounded experiment output, not retained as a recurring runtime diagnostic catalog.

The evidence categories remain separate:

- **Current offer evidence:** native offer membership, exact action/resource prices, offer observation/set identity, and draw-time native affordability.
- **Ordinary owner intent:** existing reader affordability/exclusion result and the affordable-first `planResearch()` selection.
- **Autonomous goal authority:** unavailable unless an explicit player queue or independently verified mandatory prerequisite provides the action identity. An advisory prerequisite does not qualify.

The Research cost schema does not independently establish a supply-pool identity for each named resource. P13H reports price/resource names and amounts, with pool authority unavailable.

## Captured progression window

The deterministic Chromium replay used the verified Stage 2F save `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json` (SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`), Stage 2E settings with `autoResearch` and `autoSmelter` enabled, seed `42`, epoch `2026-09-21T00:00:00.000Z`, and the pinned game snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`. After a 1,784-period warm-up, the observer covered 80 periods and ten Research-owner cycles (224–233). The runner implementation and compact capture are in `experiments/p13h-research-owner-evidence.mjs` and `test-artifacts/benchmark/tmp/p13h-research-owner-evidence.json`.

Across those ten existing draws, all ten offer lists had complete membership. They contained 151 offered rows total: 150 rows were natively unaffordable at their draw; one row was natively affordable. No policy-excluded or unavailable-exclusion candidate was observed. The ordinary owner had no eligible selection for cycles 224–231 and 233. A false native affordability verdict does not assert anything about current stocks; no current resource evidence was sampled for those offers.

At cycle 232, offer observation `research-offers-251` (offer-set identity SHA-256 `c9bacdfea9d23974ebe965df6ba786710f669c7fc4a8b6a930ccf16f710a0e51`) contained `tech-steel_containers` at binding generation 251, priced at 9,000 Knowledge and 250 Steel. The native draw said affordable. The existing Research owner read then sampled Knowledge `9,634.17 / 20,806` and Steel `1,246.47 / 33,516`; resource affordability was true, reservation evidence was `none`, exclusion evidence was `none`, the queue was empty, and eligibility was `eligible`. The ordinary affordable-first owner selected the action. The native invocation returned and grant verification observed `steel_container` level 1. The action disappeared from the following draw after the grant.

This is a real reachable Steel Containers selection and grant. It confirms that this owner boundary can publish the action and its immediate price. It does **not** establish that the action is required for terminal MAD. The 250-Steel price does not prove a mandatory MAD route.

## Smelter comparison and temporal authority

The separate P13D live Smelter capture at owner cycle 232 reported aggregate Steel target 250 and no Steel allocation. Cycle 233 reported target 0 and no Steel allocation (`experiments/p13d1-live-smelter-demand-authority.md`). P13H's Research draw is later in its work cycle, after Smelter. The records have different owner boundaries and observation IDs/generations, so this is a historical comparison only; P13H does not join the Research price or stock sample to the earlier Smelter decision.

`beginProcessedCycle()` clears the held Research observation and discovery scope before work starts. The runtime runs Smelter before `autoResearch` (`src/bootstrap/captured-runtime-control.ts`). Research-to-next-Smelter carry-forward is therefore unavailable. Root generation and progression epoch can detect root/progression changes, and offer binding generations can detect a rebound control. They do not prove unchanged prices or stocks from an unchanged root object. The native affordability result is valid only for its own draw.

Future safe reuse would need a publication that carries exact offer/price and stock observation identity to the consuming owner boundary, plus an explicit invalidation authority for offer membership/price changes, control rebinding, progression/root replacement, and intervening stock mutation. P13H implements no such carry-forward authority.

## Cost and behavior parity

Both runs used the same test bundle with evidence capture disabled during the 1,784-period warm-up. Capture was enabled only for the O run's 80-period window. The paired G/O windows had identical exports (SHA-256 `36524514089e64ce22342fd56095d2d239c6f3483809d134ea3e2cb8a22dded7`), identical ordered native invocations (4,556 total), identical random-call deltas, and identical native-control usage. The baseline emitted no evidence events. One ordinary Research invocation successfully granted Steel Containers in both traces. The observer added zero Research draws, catalog scans, native Research or Smelter invocations, dependency traversals, or cross-tick polling by construction: it is called synchronously with existing draw/read/selection/result values.

In the corrected paired sample, CDP `TaskDuration` was 1.282296 seconds with observation and 0.986267 seconds without, a difference of +0.296029 seconds across 80 periods. `ScriptDuration` differed by +0.000621 seconds. The timer around the event-sink append was below the runner clock's measurable resolution; it does not include construction of the bounded publication. This single paired timing is variable and does not isolate a stable marginal CPU cost, so it is not an acceptance result. The complete-allocation renderer CPU requirement remains unresolved.

## Verification and limits

The focused contracts cover threshold-met versus actual goal satisfaction, unknown price/control/stock authority, Research reader publication, and the P13G Chromium contract. Existing Research adapter tests cover stale action/binding and grant outcomes. The bounded Chromium replay confirms no observer effect on exports, invocation order, random calls, or control usage.

Verification:

- `npm run build` — passed.
- `npm run check` — passed all five checks, including 358 test files and bundle syntax.
- `node scripts/test.mjs p13g smelter goal-resource-signal research-observation captured-research` — passed 8 focused P13G, Smelter/P13F, signal, and Research tests.
- The bounded P13H Chromium replay and its G/O parity assertions — passed.
- `git diff --check` — passed before final commit.

The historical P12G replay remains useful context: its earlier Research draw offered Steel Containers at 9,000 Knowledge and 250 Steel while Steel was only 10; in both P12G arms, Steel reached 250 at period 40 but the action ran at period 72 because Knowledge remained limiting (`experiments/p12g-controlled-production-marginal.md`). This is historical marginal evidence, not proof of mandatory goal authority.
