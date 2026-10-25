# P48 — Explicit allocation intent and owner-local admission

## Decision: B — owner-local observation established; allocation authority blocked

A test-only diagnostic request reaches the prepared Full Jobs owner boundary on the retained late-game fixture. The request is admitted for observation over the existing Jobs and Foundry session; the request and evidence both carry `executionAuthority: "none"`. A/B/B-repeat had identical gameplay and native action traces, and the admission path performed no additional measured Full Jobs settings reads or control-registry resolutions. The maximum added synchronous callback duration was 0.3 ms in these bounded runs.

This does not establish a complete Food/Stone feasibility decision or permission to allocate. The envelope has no same-cycle Construction, Research, Build/Research queue, or cross-owner reservation commitment, and no root/progression or control-generation contract. The retained authentic Standard/Human P18 checkpoint also does not produce an available Full Jobs session: its combined planner has zero plan calls, so it cannot qualify as a second admission boundary. The controlled A/B/B-repeat parity claim therefore applies to the late-game boundary only.

No renderer CPU result is claimed. Callback timing does not satisfy the independent ≤2% renderer CPU gate.

## Inputs and intent audit

- Repository branch: `deadspace`.
- Pinned game: `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Start commits: P47 report `baf633e1`; tooling `bbf285fe`.
- Diagnostic objective: `maintain-food-buffer-and-useful-stone-production`.
- Requested scope: investigate Food sustainability and useful Stone replenishment. It does not prescribe positive Stone production at every instant, a Farm count, or a Quarry purchase.

The source audit found no supported player-selected economic allocation objective.

| Source                                | Meaning found                                                                                | Allocation authority                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `autoJobs` / `autoCraftsmen`          | Enables ordinary Jobs or Craftsmen automation.                                               | Does not authorize overriding resource ownership or making cross-owner economic choices.                                   |
| `autoBuild`                           | Enables ordinary Construction automation.                                                    | Does not select a Food/Stone goal or authorize Jobs changes.                                                               |
| Native Build or Research queue        | A real user commitment to named queue work.                                                  | Queue state is not a general allocation objective, and the existing sample has no common Full Jobs observation generation. |
| Construction saving preference/target | Construction's own saving/ordering evidence; it can describe a completed prior-cycle intent. | Does not replace the current Construction commitment or authorize another owner to spend.                                  |
| P37 economic goal                     | Diagnostic graph with `playerSelected: false` and `executionAuthority: none`.                | Diagnostic only.                                                                                                           |
| P48 fixture request                   | Test-surface-injected request with `origin: "test-only"`.                                    | Observation only; never player-selected or executable.                                                                     |

This preserves P37's diagnostic-only finding and P41's fail-closed reservation behavior. P47's conclusion about a missing natural trigger is unchanged: P48 uses explicit fixture intent and does not search for another implicit trigger.

## Existing owner boundary

`createCapturedFullJobsAutomation.prepare()` already captures the root, catalog, shared demand sample, ordinary Jobs input, Foundry input, settings, and planned decision into a private session. The test-only observer runs from the prepared execution after the existing preparation-generation, consumed-session, root-identity, multiplier-latch, and `isFullJobsStateCurrent` checks, and before the no-op return or native Jobs/Foundry control execution.

The request is read once at this synchronous point. The observer reuses the private session values and the current decision; it does not invoke a second catalog, Foundry, demand, price, queue, or control read. It does not move native Jobs execution relative to another owner. Native root references and control registries do not leave the owner closure. No recurring poller is installed.

The observer is compiled and wired only for the local test surface. The request is injected through the Chromium runner's test intervention path and checked for the exact test-only origin, objective, and scope. There is no production UI, persisted setting, spending permission, worker-change permission, or allocator.

## Owner-local evidence contract

Each envelope describes one `prepare()`/`execute()` observation only.

| Evidence                            | Captured value                                                                                                                            | Validity and limit                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work-cycle identity                 | Existing scalar `automationCycle`.                                                                                                        | Identifies the automation work cycle only; it is not a root, progression, Research, Construction, or queue generation.                                             |
| Jobs session generation             | Existing `prepareGeneration`.                                                                                                             | The existing executor rejects a newer preparation or consumed session before the observer.                                                                         |
| Captured root identity              | Preparation generation plus whether the existing execution-time root reference check matched.                                             | Proves the prepared root reference remained identical at this owner boundary without exporting the mutable reference. It is not a complete progression generation. |
| Jobs/Foundry freshness              | `verified-current` only after the existing Full Jobs stale-state check succeeds.                                                          | Covers the captured ordinary Jobs, servant, Foundry, and Craftsmen fields checked by that session. It says nothing about other owners.                             |
| Jobs and Foundry facts              | Availability, population, compact ordinary and Foundry job facts, craft workers/capacity, skilled servants, and Foundry worker pool.      | Derived from the already prepared input and Foundry sample. No full input, root, native state, or control handle is serialized.                                    |
| Planned decision identity           | Deterministic identity over the existing Jobs decision fields and assignments.                                                            | Identifies the plan produced from this session; it does not authorize executing or changing it.                                                                    |
| Request identity                    | Request ID, `test-only` origin, generation, objective, scope, optional cancellation/replacement generation, and authority classification. | Cancellation/replacement and identity mismatch return `stale`. The fixture request is never classified as player-selected.                                         |
| Progression and control generations | Progression epoch, root generation, and per-control generation are `unavailable`.                                                         | No new native control resolution or control capture is performed to fill these fields.                                                                             |
| Cross-owner commitments             | Construction, Research, queue, and reservation commitments are `unavailable`.                                                             | This envelope is not a publication from those owners and must not imply those values are current.                                                                  |
| Execution authority                 | Always `none`.                                                                                                                            | Admission can only inspect the observation. It cannot spend, assign workers, request Gather, or reserve another owner's resources.                                 |

The envelope is valid only during the corresponding fresh Full Jobs observation. It is invalidated if the request is inactive, cancelled, replaced, or mismatched; if the session has been superseded or consumed; if the root changed; if the multiplier latch is not clear; or if the current Jobs/Foundry facts fail the existing stale-state check. Missing required owner facts return `insufficient-evidence`. A request classified as requiring execution returns `blocked-by-authority` even when observation is possible.

The evidence does not include a Food stock/flow time series, the complete Stone stock/use ledger, current Construction ordering and cost publication, Research commitments, queue generations, or cross-owner resource claims. The admitted status means the explicit diagnostic request may inspect this owner-local Jobs/Foundry plan. It does not mean the objective is feasible, satisfied, or safe to execute.

## Pure diagnostic admission contract

`admitAllocationDiagnosticObservation(request, evidence)` is a pure function over the test-only request and compact owner-local evidence. Its results are:

- `inactive`: no request was supplied.
- `admitted-for-observation`: the request and prepared owner observation are current; execution authority remains `none`.
- `blocked-by-authority`: observation is possible but the request asks for execution authority that this contract does not possess.
- `insufficient-evidence`: required current owner facts are missing.
- `stale`: the request or owner session has been superseded or invalidated.

The function creates no Farm purchases, assignments, Gather requests, reservations, or cross-owner decisions. Existing Jobs execution continues through its prior native path.

## Bounded runtime proof

Each arm advanced 400 periods with seed 42 and fixed epoch `2026-09-21T00:00:00.000Z`, sampling periods 200 and 400. Total: six bounded arms. The late-game fixture is `mad-tech-offered-blocked.json`; the Standard/Human fixture is the retained authentic P18 export. The request is supplied only to B and B-repeat.

| Fixture                  | Arm      | Owner observations | Planner calls | Result                                                                   |
| ------------------------ | -------- | -----------------: | ------------: | ------------------------------------------------------------------------ |
| Late-game                | A        |        50 inactive |            50 | Ordinary baseline.                                                       |
| Late-game                | B        |        50 admitted |            50 | Admitted for owner-local observation; authority `none`.                  |
| Late-game                | B-repeat |        50 admitted |            50 | Same semantic admission evidence as B.                                   |
| Authentic Standard/Human | A        |                  0 |             0 | Full Jobs session unavailable.                                           |
| Authentic Standard/Human | B        |                  0 |             0 | Request is not read because no executable prepared owner session exists. |
| Authentic Standard/Human | B-repeat |                  0 |             0 | Same unavailable boundary.                                               |

For the late-game fixture, A, B, and B-repeat match on native invocation sequence and count (114,718; SHA-256 `9db1d81b1db84b893d7d22b0f466a6e64fa715d9404cb2293696db4b5b636770`), native control usage, Jobs and Foundry assignment summaries at both checkpoints, decoded-state and export hashes at both checkpoints and final state, RNG count/state, and all measured owner read counters. B and B-repeat admission semantics and cumulative control-resolution/settings-read traces match. Page errors, rejected promises, loop errors, and dialogs are zero.

The final late-game export hash is `38e9b5d110a60ca2b7711d766c24205b73b6ab3eb0b99feea2fd2ec9de450594`; final RNG count/state are 1,080 / `3028039554`. The authentic Standard/Human A/B/B-repeat arms also match on export (`b43ff3c261efed70ff294f430705ffb566396911a6178a9b68b39edd06253682`), RNG (40 / `3086441138`), native invocation trace, control usage, assignments, and read counters. That state begins from the retained Human checkpoint with no population; all 50 Full Jobs work ticks read demand, catalog, ordinary Jobs, and Foundry phases, but the combined session remains unavailable and plan calls remain zero. It is not a qualifying admission boundary.

The missing native-parity fixture `test-artifacts/benchmark/settings/baseline-tuned.json` remains absent. P48 uses controlled Chromium A/B/B-repeat evidence and does not claim that the existing native-timer parity suite ran successfully.

## Dormant-path and observation cost

All measurements below are from the late-game owner boundary and use the native monotonic `performance.now` clock. Timing is callback-local; it is not renderer CPU.

| Measure                                              | A: absent request | B: supplied request |      B-repeat |
| ---------------------------------------------------- | ----------------: | ------------------: | ------------: |
| Owner observations / request-presence checks         |           50 / 50 |             50 / 50 |       50 / 50 |
| Admission evaluations                                |                 0 |                  50 |            50 |
| Maximum request-presence check                       |            0.1 ms |                0 ms |        0.1 ms |
| Maximum input projection                             |              0 ms |              0.1 ms |        0.1 ms |
| Maximum envelope construction                        |              0 ms |              0.1 ms |        0.1 ms |
| Maximum pure predicate                               |              0 ms |              0.1 ms |          0 ms |
| Maximum added synchronous callback                   |            0.1 ms |              0.2 ms |        0.2 ms |
| Control resolutions during observation               |                 0 |                   0 |             0 |
| Existing Full Jobs settings reads during observation |                 0 |                   0 |             0 |
| Serialized retained event payload                    |      27,852 bytes |       280,021 bytes | 280,021 bytes |

The test-only control-registry wrapper records cumulative `resolve()` counts at each owner observation; those traces are identical in A/B/B-repeat, and the before/after delta around projection and admission is zero. The existing settings-read trace is `1..50` at each observation in all three arms, with zero reads during observation. Catalog, demand/resource, cost/price, Build-target, queue-reservation, and action-cost counters match exactly across A/B/B-repeat. Native control invocation sequence and usage also match exactly. The absent-request path performs the single minimal request-presence check and zero admission evaluations.

Serialized event bytes are a payload-size proxy for the retained test-hook events, not a measurement of renderer heap. No 2% renderer CPU conclusion is made.

Machine evidence, including one representative admitted envelope, per-cycle semantic trace hashes, timings, read counters, state hashes, fixture hashes, and limitations, is in [p48-explicit-intent-admission-evidence.json](p48-explicit-intent-admission-evidence.json). The evidence file does not retain every projected Jobs fact. Reproduce the bounded run with `node experiments/p48-explicit-intent-admission-evidence.mjs`.

## Remaining authority and limits

| Question                                                         | Finding                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Can the owner observe an explicit Food/Stone allocation request? | It observes the test-only request identity and can admit it for inspection of current Jobs/Foundry facts. It cannot establish Food sustainability or Stone feasibility from this envelope. |
| Can it inspect the ordinary Jobs plan?                           | Yes, for this prepared session: compact job facts and the current planned-decision identity are included.                                                                                  |
| Is the captured session's freshness preserved?                   | Yes. The existing Full Jobs supersession, root, latch, consumed-session, and stale-state guards remain ahead of the observer.                                                              |
| Can it detect missing worker commitments?                        | It sees ordinary and Foundry assignments in the prepared Jobs session. It cannot establish the complete cross-owner commitments, construction reservations, or queue claims.               |
| Can it refuse unsupported cross-owner Construction decisions?    | Yes. Execution authority is `none`; no Construction call, purchase, spending, worker assignment, or reservation is exposed.                                                                |
| Can it defer without changing native execution?                  | Yes. Observation occurs synchronously after existing freshness checks; A/B/B-repeat show unchanged actions and state.                                                                      |

Any executable allocation would first require explicit player-selected objective and separate execution permission, complete worker/servant/Craftsmen commitments, current resource holdings and relevant Food/Stone flows, current Build/Research queue and claim generations, a current Construction target/order and complete price/reservation contract, relevant Research owner commitments, and fresh control generations under one documented lifecycle and invalidation contract. P37's diagnostic graph is not that permission. P41's fail-closed reservation behavior remains in force.

P48 establishes an owner-local observation seam only. It does not create or authorize a shared Jobs/Construction/Research coordinator, and it does not satisfy the renderer CPU gate.
