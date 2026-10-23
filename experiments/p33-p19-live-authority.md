# P33 — P19-controlled live Construction authority

## Decision: A — live eligibility established

The P19-controlled replay reached its accepted Human progression, and the P32 shadow observed genuine current Construction orders with positive Lumber or Stone shortages. The first eligible live order was `city-farm` at p80: current cost 27 Lumber / 14 Stone, stock 67 Lumber / 0 Stone, and a 14 Stone shortage. Its current pre-Gather order, native controls, current root and progression generations, captured queue reservations, P19 handoff state, and claim state all had valid provenance. No allocation policy request was present, and the shadow made no Gather or spending call.

This establishes eligibility for a read-only observation. It does not request spending or establish useful progression from an allocation. The independent requirement to measure a 2% CPU increment remains unresolved.

## Controlled replay

All arms used the retained authentic P18 Standard/Human fixture, frozen P19 settings, seed 44, epoch `2026-09-21T00:00:00.000Z`, pinned game `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`, and one exact Chromium test-surface bundle.

| Arm | Interventions                                                          | p5000 population | p5000 productive state        |
| --- | ---------------------------------------------------------------------- | ---------------: | ----------------------------- |
| A   | Ordinary P18 baseline; no bootstrap, handoff, or allocation            |                0 | No Construction saving target |
| B   | Accepted P19 test-only civilization bootstrap and Construction handoff |                3 | 1 Farm, 3 Cabins, 3 Farmers   |
| C   | B plus the non-mutating P32 shadow                                     |                3 | Identical to B                |

P19 performed its ten startup Stone clicks at p8 and ten Farm handoff clicks through p72. B and C matched at p8, p48, p56, p64, p72, p96, p112, p272, p1000, and p5000 for native Gather/Research/Construction invocation order, control usage, resource stocks, buildings, population, Jobs, RNG calls/state, and exported-save hashes. The p5000 B/C export SHA-256 was `28c8b8fd75d524e4e6ee4a8be8b86c425668818b4564882181010ce395721296`.

The observed Construction target transitions were:

| Period | Current target              | Full native cost                |
| -----: | --------------------------- | ------------------------------- |
|     p8 | None                        | —                               |
|    p56 | Farm (`city-farm`)          | 20 Lumber / 10 Stone            |
|    p72 | Farm repriced (`city-farm`) | 27 Lumber / 14 Stone            |
|   p272 | Shed (`city-shed`)          | 75 Money / 55 Lumber / 45 Stone |

The first target after a progression-generation change was the Farm at p64. It was rejected because the P19 handoff was still active. The first eligible target followed at p80, after the handoff budget reached 10/10. No live target was rejected for stale progression generation: the pre-Gather order was restamped after progression changes. The focused synthetic regression changes the current progression generation and confirms fail-closed rejection.

## Authority evidence and limits

- The target and price come from the successful current pre-Gather Construction order. The shadow no longer compares two copies of that one target. It records separate current root/progression reads and rejects a changed generation.
- Reservation status comes from `createCapturedQueueReservationSource`. Empty queue arrays alone do not establish clear reservations. An unavailable reservation sample is `unknown` and fails closed. In this replay the captured Build and Research queues were empty at all 625 shadow evaluations, so no queue cost or Research catalog price probe was needed.
- Handoff state comes from the P19 bootstrap authorization state. The live record distinguishes `unavailable`, `active`, and `inactive`; the p64 Farm order was rejected while active, and later positive cases required the explicit 10/10 inactive state.
- Claim evidence includes both `resourceClaims` and `resourceClaim`; missing intervention state stays unavailable. Positive live cases recorded an empty claim set from the installed P19 intervention.
- Gather controls are required only for positive material shortages. Strict action-capability and generation checks remain for each control the prospective policy could request. Synthetic regressions cover replaced/missing controls, conflicts, and unavailable authorities.
- Price evidence is the native price already attached to the current pre-Gather order. The shadow does not perform an independent execution-time price probe because it does not execute an action. Any future executor must retain P20.2's independent repricing and postcondition protections; snapshot reuse is not execution-time validation.

The focused positive and adverse authority cases are synthetic unit inputs, except for the real p80 Farm eligibility and the live handoff rejection. They cover no material shortage, unaffordable Money, stale progression, queue/reservation/claim/handoff conflicts, and missing or replaced native controls.

## Overhead and verification

The shadow ran 625 times and captured reservations 625 times. It made zero additional native queue price or catalog probes in this replay because both native queues remained empty. B/C control usage and native action order matched at every checkpoint. The synchronous timer reported 0 ms at its available resolution; this does not establish zero runtime cost or a 2% CPU result. No whole-window CPU campaign was run.

The replay did not set `save.settings.expose`, use `debug.js`, or read game debug globals. It used the exact Chromium runner, captured page controls, exported save state, and runner-owned period and invocation diagnostics. P20's generic allocator remains retired.

Machine-readable arm/checkpoint/rejection data is in [p33-p19-live-authority-evidence.json](./p33-p19-live-authority-evidence.json); reproduce it with [p33-p19-live-authority-exact.mjs](./p33-p19-live-authority-exact.mjs).
