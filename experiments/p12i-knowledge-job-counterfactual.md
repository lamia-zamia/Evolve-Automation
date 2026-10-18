# P12I — Knowledge job counterfactual against Research timing

## Decision

**C — Intervention cannot be evaluated.** The verified starting state has no idle worker and the native Scientist job is already at its captured maximum. The existing native controls cannot represent the requested one-worker transfer into that job from this state without changing capacity or removing an assigned worker. No source assignment was selected because the existing Jobs owner is enabled and the capture does not establish an unprotected source. No B mutation was attempted.

## Pinned starting state and native policy

- Pinned game: `db38e2af831907d49aeb5348d678d8d8745d6c3f`; game snapshot SHA-256 `05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`.
- P12G reachable capture (P12H verified contract) period 1784; export SHA-256 `db69d2de864b1344998ec291c457d168b5fa699a8d4edadd2d14a67ec9c3da27`; seed 42; epoch `2026-09-21T00:00:00.000Z`.
- Research offer `tech-steel_containers`, generation 242, current native price {"Knowledge":9000,"Steel":250}. Starting Knowledge 2150.6625342745347 / 20806; Food 437445 / 437445.
- Jobs permission `autoJobs=true`; Scientist permission `job_scientist=true`; Research permission `autoResearch=true`.
- Scientist assignment 1 / native maximum 1; unemployed workers 0. Other staffed assignments: {"lumberjack":{"workers":9,"maximum":-1,"displayed":true,"managed":true},"quarry_worker":{"workers":10,"maximum":-1,"displayed":true,"managed":true},"crystal_miner":{"workers":5,"maximum":-1,"displayed":true,"managed":true},"miner":{"workers":5,"maximum":10,"displayed":true,"managed":true},"coal_miner":{"workers":4,"maximum":9,"displayed":true,"managed":true},"craftsman":{"workers":22,"maximum":14,"displayed":true,"managed":true},"cement_worker":{"workers":6,"maximum":6,"displayed":true,"managed":true},"entertainer":{"workers":11,"maximum":11,"displayed":true,"managed":true},"priest":{"workers":17,"maximum":23,"displayed":true,"managed":true},"professor":{"workers":10,"maximum":15,"displayed":true,"managed":true},"scientist":{"workers":1,"maximum":1,"displayed":true,"managed":true},"banker":{"workers":4,"maximum":20,"displayed":true,"managed":true},"garrison":{"workers":28,"maximum":28,"displayed":true,"managed":true}}.
- Competing Construction demand at capture: {"requestedSteel":1000,"isSteelDemanded":true,"savingTarget":{"name":"city-coal_power","cost":{"Money":10000,"Crystal":125,"Copper":800,"Cement":480,"Steel":1000}}}. Normal Jobs settings enabled both ordinary Jobs and Craftsmen management.
- The A/A Food stock remained at its 437,445 capacity through the 100 sampled periods. A capped stock trajectory does not identify gross Food production and consumption; with no B arm, Food sustainability under reassignment was not measured.
- No direct Scientist production formula was copied. Pinned `src/jobs.js` defines its job impact/description; Knowledge acquisition effects depend on separate native action/building logic and all arm effects require paired stock changes.

## A/A baseline stability

Two exact Chromium sessions restored identical P12G saves with identical settings, seed, epoch, game and test bundle. Ordinary Jobs, Research, Construction and production remained enabled. Results: exports matched; ordered native invocation sequences matched; per-period resource stocks matched. Each arm sampled 100 periods; final active assignments matched: {"lumberjack":{"workers":9,"maximum":-1},"quarry_worker":{"workers":10,"maximum":-1},"crystal_miner":{"workers":5,"maximum":-1},"miner":{"workers":5,"maximum":10},"coal_miner":{"workers":4,"maximum":9},"craftsman":{"workers":22,"maximum":14},"cement_worker":{"workers":6,"maximum":6},"entertainer":{"workers":11,"maximum":11},"priest":{"workers":17,"maximum":23},"professor":{"workers":10,"maximum":15},"scientist":{"workers":1,"maximum":1},"banker":{"workers":4,"maximum":20},"garrison":{"workers":28,"maximum":28}}.

An exact ordinary production-bundle session used the same starting save, settings, seed, epoch and pinned game. Compared with instrumented A: exports matched; per-period resource stocks matched; final job assignments matched. This establishes observed production-state parity for the full sampled horizon. The runner exposes exact native invocation tracing through its test-hook callback, which the ordinary production bundle does not expose, so invocation-sequence parity cannot be asserted across those bundles; exact action traces remain available for A/A and from the verified P12H replay.

The baseline native Jobs owner invoked captured controls in generation 2; its first observed changed assignment was [{"jobToken":13,"jobId":"miner","beforeWorkers":5,"requestedWorkers":9,"workerDelta":4,"beforeServants":0,"requestedServants":0,"servantDelta":0},{"jobToken":24,"jobId":"banker","beforeWorkers":4,"requestedWorkers":0,"workerDelta":-4,"beforeServants":0,"requestedServants":0,"servantDelta":0},{"jobToken":36,"jobId":"Brick","beforeWorkers":0,"requestedWorkers":22,"workerDelta":22,"beforeServants":0,"requestedServants":0,"servantDelta":0},{"jobToken":37,"jobId":"Wrought_Iron","beforeWorkers":22,"requestedWorkers":0,"workerDelta":-22,"beforeServants":0,"requestedServants":0,"servantDelta":0}]. These are normal owner actions, not the P12I intervention. The native Scientist control was not invoked; its target had no worker headroom.

The pinned P12H replay independently records Steel sufficient by period 40, Knowledge crossing 9,000 in (60, 70], a fresh native affordability observation at period 70, and the ordinary Research invocation at period 72. Its action price was 9,000 Knowledge and 250 Steel. Those identities remain fixture evidence only.

## Why no B arm ran

Scientist was already at its captured native cap (1/1); unemployment was 0. A source transfer would have to displace a currently assigned worker. With `autoJobs=true`, normal Jobs remained the owner and could restore the source/target allocation; no source was proven safe or unconstrained, and the required one-worker target assignment had no native headroom. Increasing a Knowledge capacity through construction, changing Jobs policy, or stealing from an active job would add a second intervention and would not answer this isolated test.

Therefore there is no matched B trajectory, no measured `readCapturedJobStrategyPair()` marginal, and no intervention call/generation to report. The capture establishes Scientist availability and assignment/capacity but does not provide a safe source worker. A controlled transfer cannot be represented safely under the requested starting-state constraints.

## Strategy comparison and general criterion

The generic `assessProductionInterventionEvidence()` reports resource scarcity separately from the final observed purchase threshold, requires current paired evidence and a positive measured target-resource effect before timing classification, and keeps collateral losses visible. Unknown collateral authority or external commitments keep `forecastComplete=false`; they do not erase observed earlier-action evidence. This pure evaluator grants no spending authority. No observed marginal exists here, so `compareGoalStrategies()` cannot produce a meaningful intervention candidate for P12I; its current Research requirement and unknown external commitments remain unresolved.

## Performance

- Exact A/A renderer TaskDuration: 9.641s / 6.705s; ordinary production-bundle baseline: 2.173s. Test-bundle ScriptDuration: 0.0083s / 0.0056s. TaskDuration is the timing authority.
- 100 one-period resource/offer observations per arm, with no forced native Research draw; sampled threshold stocks: [{"period":40,"Knowledge":6307.786121446598,"Steel":284.7587720092303,"Food":437445},{"period":60,"Knowledge":8386.53723662782,"Steel":683.1771343352885,"Food":437445},{"period":61,"Knowledge":8490.474792386882,"Steel":707.2196217170334,"Food":437445},{"period":70,"Knowledge":9425.912794218431,"Steel":944.209854479947,"Food":437445},{"period":71,"Knowledge":9529.850349977492,"Steel":971.6869829162268,"Food":437445}]. Distinct target action invocation period(s): [72].
- 7 diagnostic Jobs trace events per A arm. Their grouped native worker-control calls total 121 at generation(s) 2; the repeated baseline has an identical full invocation sequence. The runner added no Jobs catalog reads beyond the ordinary owner; its 100-per-arm Research catalog samples are diagnostic reads.
- Pure `readCapturedJobStrategyPair()` cost: 0.006297 ms/call on a synthetic valid pair (1,000 calls). This is evaluator timing only; no empirical P12I marginal was produced.
- No P12D.1 advisory graph was run. Diagnostic tracing was confined to these isolated runner sessions; no production scheduler or userscript behavior was added.

## Evidence limits

P12I did not compare A/A/B because the required native target allocation is unavailable at the verified state. No claim is made that an earlier Research purchase would shorten terminal MAD time. The next valid attempt needs a separate verified capture with Scientist headroom and either an idle worker or an explicitly permitted source whose displacement is measured and not protected by the current Jobs policy.
