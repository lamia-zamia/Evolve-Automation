# P19 — General early-civilization bootstrap

## Result: A — bounded bootstrap enables native economic progression

The Standard/Human replay started from the retained P18 fixture. Ten native Stone Gather actions admitted a finite bootstrap and activated ordinary native Research and Construction. A separately bounded response to the current native Construction publication supplied ten more Stone actions for the Farm target. After that response, ordinary automation continued without further Gather clicks.

The candidate maintained three Human population, three Farmers, one Farm and three Cabins from p1,000 through p10,000. Food production remained above consumption, Food reached its 1,000 capacity, and starvation and deaths remained zero. It purchased multiple native Research technologies and constructed productive infrastructure. Sundial purchase alone is not the success signal; the sustained Food surplus and active Farmer job establish economic liveness. No additional Research or Construction purchase occurred between p5,000 and p10,000; the productive economy remained stable through that interval.

The candidate used 20 Gather clicks by p1,000 and no additional Gather clicks through p10,000. At p5,000 the always-click reference used 16,253 Gather clicks. Candidate runs had matching exports, native control counts and RNG evidence.

## P18 provenance correction

The retained fixture is 8,773 bytes with SHA-256 `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`. The save was not modified. This correction is committed separately as `f0ec8227`.

## Frozen replay inputs

The exact-runner used the P18 Standard/Human fixture, its retained settings and runner, seed 44, epoch `2026-09-21T00:00:00Z`, and pinned game `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`. The fixture's first Human checkpoint was 9,000. Diagnostic native clicks used captured control handles and the native `action` method; the in-memory debug expose did not alter the retained save.

Input, source, production bundle, test-surface bundle, runner and replay hashes are retained in [p19-civilization-bootstrap-evidence.json](p19-civilization-bootstrap-evidence.json). The repeat candidate's final export SHA-256 matched the candidate.

## Native bootstrap diagnostics

| Arm                                | Result by p5,000                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary baseline                  | No population or day advancement; no Research purchase, Construction target or Gather clicks.                                                                              |
| Ten native Stone clicks            | Population appeared at p251. A Farm saving target first appeared at p48, priced at 20 Lumber and 10 Stone. The arm produced four Cabins and no productive job or building. |
| Food/Lumber/Stone packet (10 each) | Population appeared at p251; it also stalled with four Cabins and no productive job or building. The extra Food and Lumber did not improve activation.                     |
| Always-click reference             | Population 16, active Lumberjack, Quarry Worker and Garrison jobs; 11 Farms and productive buildings. It used 11,148 Food, 2,960 Lumber and 2,145 Stone clicks.            |

The native exact trace first invoked the current Sundial Research action at p16, with Agriculture at p56. The sampled DOM did not render a visible Research offer row, so the report uses the captured native action invocation as evidence that the offer was actually actionable and purchased; it does not infer offer authority from the static Sundial definition. Candidate day advancement, population and productive Farm/Farmer employment were first observed at the p250 checkpoint (day 12, population 3). The direct-click arms first showed population at p251 (day 12, population 4), still with only unemployed workers. The startup policy itself does not name Sundial or any other technology.

## Policy and owner handoff

Bootstrap is an explicit test-only authorization inside the existing Gather owner. It admits only a valid, stopped native civilization with no population or buildings, empty native queues, current Gather action bindings, ordinary supported challenge state and no protected resource claim. It selects among current Food, Lumber and Stone stocks by normalized stock level, aiming only at five percent of that resource's current capacity.

The policy has a ten-click per-cycle ceiling and a ten-click total startup budget. It uses the existing Gather executor, rechecks root identity, root generation and authorization before every click, and suspends when the native state progresses or a protected Mana/Conjuring condition appears. Construction-targeted Gather carries an explicit Mana-preservation requirement; if current Conjuring would spend Mana, the executor rejects that click before invoking the native action and verifies the Mana postcondition after any permitted click. A new authorization is required to re-enter after suspension; a root replacement or generation change suspends the existing authorization.

For this controlled Human progression, the first current Construction target required a small follow-up. The existing native Construction publication was accepted only when its target and current native price matched, the target control generation was current, queues were empty, `autoBuild` was enabled, other costs were affordable, and no protected claims existed. Resource controls, target identity, price, root and generations were revalidated during execution. The response was capped at five clicks per cycle and ten clicks total. It stopped when that budget was spent. Construction was not forced to retain a target, and no separate Research policy was added.

## Matched progression

| Checkpoint | Candidate population | Food stock / capacity | Native Food production / consumption   | Starved / deaths | Active jobs; productive buildings | Gather clicks (Food / Lumber / Stone) | All captured native control calls |
| ---------- | -------------------: | --------------------: | -------------------------------------- | ---------------: | --------------------------------- | ------------------------------------- | --------------------------------: |
| p1,000     |                    3 |         257.8 / 1,000 | Farmer 4.332; Human −3; net diff +1.28 |            0 / 0 | 3 Farmers; 1 Farm, 3 Cabins       | 0 / 0 / 20                            |                             2,114 |
| p5,000     |                    3 |         1,000 / 1,000 | Farmer 4.332; Human −3; net diff +1.77 |            0 / 0 | 3 Farmers; 1 Farm, 3 Cabins       | 0 / 0 / 20                            |                            21,218 |
| p10,000    |                    3 |         1,000 / 1,000 | Farmer 4.332; Human −3; net diff +1.77 |            0 / 0 | 3 Farmers; 1 Farm, 3 Cabins       | 0 / 0 / 20                            |                            46,218 |

The p5,000 comparison is matched to the always-click arm: 20 candidate Gather clicks versus 16,253 reference Gather clicks (99.9% fewer). The reference made 65,248 captured native control calls by p5,000. Counts include all captured native control bindings, not only Gather actions.

The candidate made ten bootstrap invocations at p8 and ten Construction handoff invocations: five at p64 and five at p72, all Stone toward the current `city-farm` target. The native trace records the Farm purchase at p72 and three Cabin purchases between p96 and p112. No later bootstrap or handoff invocation occurred.

The current Construction publication changed as follows: no target at p8; `city-farm` at p56 for 20 Lumber / 10 Stone; the same target's current price at p72 was 27 Lumber / 14 Stone; and `city-shed` became current at p272 for 75 Money / 55 Lumber / 45 Stone. The Farm price change and target switch were treated as current-target changes; stale/failed native controls were zero.

Native Research purchase periods were: Sundial p16, Agriculture p56, Housing p96, Currency p192, Storage p272, Mining p456, Irrigation p672, Science p936, Garrison p1,216, Silo p1,536 and Banking p1,896. Native Construction purchases were Farm p72 and Cabins p96, p104 and p112. Exact action periods, sampled offers, prices, counts and target changes are retained in the evidence JSON.

## Reproducibility and validation

The candidate and repeat candidate matched on final export SHA-256, native control usage, bootstrap and handoff events, research and construction invocation traces, random-call count and final RNG state. Full replay outputs for baseline, direct-click diagnostics, candidate, repeat candidate and always-click reference are retained in the evidence JSON; the exact runner is [p19-civilization-bootstrap-exact.mjs](p19-civilization-bootstrap-exact.mjs).

The candidate's final export SHA-256 was `f6ea1e31ddbaff7be154f870c992a1cafe57744790b79ec9f7149f20f2193dc0`; it consumed 1,916 random calls and ended at RNG state `399505144`. Its repeat matched those values.

The ordinary production bundle remained byte-identical to P18 at SHA-256 `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`. Full `npm run check`, `npm run build`, and `git diff --check` passed.
