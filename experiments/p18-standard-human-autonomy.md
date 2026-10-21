# P18 — Standard/Human autonomous progression

## Decision

**C — A specific owner-authority gap blocks an otherwise plausible intervention.** The authentic Human baseline reaches a flat state before any native production owner publishes an actionable resource demand. Gather controls are available, but choosing a resource to gather would supply a strategy that no owner expressed. No recovery mechanism was implemented, and no candidate replay was claimed as a success.

## Authentic fixture

The pinned native game (`pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`) generated a new Standard game using seed 44. Its first native Human checkpoint was period 9,000. The exported save records `race.universe = standard`, `race.species = human`, and `race.strandGenus = [humanoid]`; the native page displayed the Human evolution message, and `evolution-humanoid.action` returned three times without throwing. The generated planet is Grassland. Challenge counters are zero, no positive challenge flags were present, and the challenge genes flag is false.

The retained full export is [p18-standard-human-fixture.txt](../test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt). Its SHA-256 is `a99c0a86b505c972f88baf4967c5ef088e3ff6d81f1e2fee7beeebeb137e3d61` (8,757 bytes). No save fields were edited. The debug `expose` setting was added only to in-memory replay copies so the runner could read native state.

The test settings copy, [p18-standard-human-settings.json](p18-standard-human-settings.json), preserves the ordinary `current-full.json` automation configuration and keeps `buildingAlwaysClick` false. Three evolution values differ because the enabled queue is applied before target selection: the requested top-level target changes from `auto` to `human`; the first queue target changes from `custom` to `human`; and its genus changes from `fungi` to `humanoid`. The latter two align the queue row with the requested Human selection. Queue enablement and repeat remain on. `autoEvolution`, Research, Construction, Jobs, Market, Smelter, and Storage remain enabled; Gather is the native manual control and its three controls are present.

## Ordinary automation baseline

The exact Chromium runner replayed the frozen fixture in 250-period checkpoints through period 1,000 with the normal settings. A compile-time-only observer sampled Construction's published saving target after each successful Construction cycle. It recorded 125 observations, all `null`, through period 1,000. The state was already invariant at the first checkpoint and stayed so at 500, 750, and 1,000:

- Human population remained 0; no jobs or buildings appeared; the only technology remained `primitive: 2`.
- Food stayed 40/1,000, Lumber 95/200, Stone 0/200, Money 0/1,000, and Knowledge 0/100.
- Food production and consumption were absent, there was no starvation or death, and native automation recorded no action errors or stale-control rejections.
- Research and Construction exposed no action rows. Gather exposed Food, Lumber, and Stone controls. Market, Smelter, and Storage exposed no controls in this state.
- The only counted automation work was 125 `civ-unemployed.setDefault` calls and 126 main-column tab observations; there were no Gather, Research, or Construction action calls.

The first confirmed stall is period 250: no Construction saving target is published, no Research action is offered, and no other production owner declares a resource request. Initial resources are not recovering through an independent producer. A generic recovery cannot infer whether the first needed action should gather Food, Lumber, or Stone from the current owner state.

## Always-click diagnostic

An isolated diagnostic arm used the same fixture and all the same settings except in-memory `buildingAlwaysClick: true`. It reached population 5 with no starvation or deaths, and native automation granted Sundial, Agriculture, Housing, Currency, Storage, Stone Axe, Mining, and Irrigation. It built five Farms, five Cabins, one Shed, five Lumber Yards, and two Rock Quarries, and assigned three Lumberjacks and two Quarry Workers. This shows that broad manual gathering can unlock downstream native automation on this Human seed.

The diagnostic issued 3,911 native Gather action calls in 1,000 periods: 1,617 Food, 1,360 Lumber, and 934 Stone. Construction first published `city-farm` at period 184 with exact cost Money 115, Lumber 50, Stone 25. Its target changed to `city-shed` at period 264 (Money 75, Lumber 55, Stone 45), back to `city-farm` at period 336, to `city-shed` at period 416 (Money 92, Lumber 73, Stone 59), and then back to Farm at period 424. The Farm price changed at periods 568 (Money 152, Lumber 68, Stone 34) and 872 (Money 200, Lumber 93, Stone 47) as the native count changed. The machine evidence retains each target transition and exact cost, with the latest observation at every 250-period checkpoint.

Native automation also invoked construction and research controls. Food, Lumber, and Stone reached their storage caps during the run. These are broad repeated gathering actions, not a bounded response to a published owner demand; the resulting multiple buildings, purchases, and job assignments are collateral to using always-click as a bootstrap. Two identical diagnostic replays produced the same final export hash, control counts, and Construction observation transitions. Always-click is useful to locate the bootstrap boundary, but it is not a candidate setting.

## Owner authority and implementation

Construction is the first supported source once a saving target exists: the Construction observation publishes its current target and exact native price, and can replace that target. A recovery could then revalidate the owner, current cost, resources, competing commitments, and available Gather authority before bounded clicks, and stop when the target is met or superseded. At this fixture's first stall, 125 observations show no target and no Build action, so Construction cannot authorize the initial gathering.

Research does not fill the gap. Its ordinary policy is affordable-first and non-conflicting. An unaffordable Research offer is not evidence that Research selected it as its next action; P13H established this boundary. Here no Research offer is present at all. No other production owner publishes an initial material demand. The missing authority is therefore the native owner declaration for the initial material gathering needed to create population and unlock downstream owners.

No recovery mechanism or technology-specific policy was implemented. A small observer behind the compile-time test surface records Construction's existing saving-target publication for the exact replay; it is absent from the production bundle. The P17 Shroomi experiments and P13Q selector retirement remain intact. No P14–P17 files were changed.

## Progress toward MAD

The diagnostic establishes that native economy automation can progress after manual resources are supplied, but no ordinary baseline or justified candidate replay achieved autonomous progression. Work toward MAD remains blocked at the initial owner-authority gap. The next supported step would require a native owner to publish an actionable bootstrap demand, or an explicit strategic policy authorizing one. This experiment does not choose that strategy.

## Evidence and verification

Machine-readable checkpoints, native control counts, full save/settings/game/runner/source/bundle hashes, deterministic replay comparison, and the pinned game snapshot identity are in [p18-standard-human-autonomy-evidence.json](p18-standard-human-autonomy-evidence.json). The reproducible exact-runner harness is [p18-standard-human-autonomy-exact.mjs](p18-standard-human-autonomy-exact.mjs).

The production bundle remained byte-identical to the required P17 baseline: `47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b`. The test-surface observer bundle hash is recorded in the JSON evidence. No renderer CPU comparison was run. No recovery mechanism was implemented, so there is no added recovery work to report.
