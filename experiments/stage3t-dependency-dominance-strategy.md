# Stage 3T — dependency dominance and executable strategy test

## Decision

**D. Native evidence is insufficient to admit a bounded production change in this fixture.** The period-1,000 native catalog now proves Steel Containers 1 mandatory for Industrialization within the retained native action authority. The executable candidate hook ran before `planSmelter`, but all 500 exact competing-demand samples were unavailable (`project-storage-catalog`), so it admitted no candidate and changed no planner input. At period 1,000 the ordinary captured demand was already 1,000 Steel against 10 held, covering the 240 Steel goal shortfall. B and D therefore had identical progression and economy results. No production strategy or setting was added.

## Pinned inputs and runtime authority

| Input                  | Value                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | `deadspace`, starting HEAD `79ce424ea668be4df09a230f9eddd00f68b314e3`                                                                           |
| Upstream               | `D:/work/Evolve-DeadSpace`, `DeadSpace` at `db38e2af831907d49aeb5348d678d8d8745d6c3f`                                                           |
| Game snapshot          | `test-artifacts/game/evolve-deadspace.js`, SHA-256 `f25222da11bd9d7bdbe640c8574c4619931ba6db2afbd6bbe2a62e205b6c5553`                           |
| Save                   | `stage2f-fixed-progression-export.json`, SHA-256 `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`                             |
| Settings               | `stage2e-integrated-mad-no-triggers.json` plus `autoResearch: true`, SHA-256 `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131` |
| Seed / epoch / horizon | `42` / `2026-09-21T00:00:00.000Z` / 4,000 periods                                                                                               |
| Gather intervention    | Existing Stage 3M `goal-derived-conjunctive` test intervention                                                                                  |
| Test bundle            | SHA-256 `4fea446c57a624035b9d6bfcfdc7e14dcfbfd071c1eb53b520300d8767af7fa8`                                                                      |

The fresh period-1,000 `readCurrentResearchCatalog("tech-industrialization")` observation was current at root generation 0 and the recorded progression epoch. Steel Containers was offered at generation 138 for 9,000 Knowledge and 250 Steel, with native affordability false; Steel Containers level was 0. Industrialization was not offered, while its route applicability was eligible. The mandatory classifier returned `verified` with `tech-steel_containers` after this experiment bridge used only complete computed requirements observed for the same root and progression epoch. The whole graph remained `partial` because unrelated native actions have unresolved requirements; that does not erase this local obligation result.

## Captured grants of `steel_container`

The complete retained Research definition set contained twelve actions declaring a `steel_container` grant at level 1 or above. Each action had `hasNativeCondition: false`. The current native offer itself establishes the base action's live gate; unoffered actions retain their captured static requirements, except Mythril Containers, whose fresh callback result is shown below.

| Action                          | Grant | Captured declared or fresh computed prerequisites                            | Route applicability    | Offered at p1000 | Can grant level 1 from level 0?             |
| ------------------------------- | ----: | ---------------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------------- |
| `tech-steel_containers`         |     1 | Smelting 2, Container 1                                                      | Eligible               | Yes              | Yes; current native offer                   |
| `tech-gantry_crane`             |     2 | Steel Containers 1, High Tech 2                                              | Eligible               | No               | No; requires level 1                        |
| `tech-alloy_containers`         |     3 | Steel Containers 2, Storage 4                                                | Eligible               | No               | No; requires level 2                        |
| `tech-mythril_containers`       |     4 | Fresh computed: Steel Containers 1, Space 3 (declared `reqs` is conditional) | Eligible               | No               | No; current computed route requires level 1 |
| `tech-adamantite_containers`    |     5 | Steel Containers 4, Alpha 2                                                  | Eligible               | No               | No; requires level 4                        |
| `tech-adamantite_containers_tp` |     5 | Steel Containers 4, Titan 4                                                  | Excluded on this route | No               | No; route excluded and requires level 4     |
| `tech-aerogel_containers`       |     6 | Steel Containers 5, Aerogel 1                                                | Eligible               | No               | No; requires level 5                        |
| `tech-quantium_containers`      |     6 | Steel Containers 5, Quantium 1                                               | Excluded on this route | No               | No; route excluded and requires level 5     |
| `tech-bolognium_containers`     |     7 | Steel Containers 6, Gateway 3                                                | Eligible               | No               | No; requires level 6                        |
| `tech-unobtainium_containers`   |     7 | Steel Containers 6, Tau Red 7                                                | Excluded on this route | No               | No; route excluded and requires level 6     |
| `tech-nanoweave_containers`     |     8 | Steel Containers 7, Nanoweave 1                                              | Eligible               | No               | No; requires level 7                        |
| `tech-elysanite_containers`     |     9 | Steel Containers 8, Elysium 6                                                | Eligible               | No               | No; requires level 8                        |

This resolves the Stage 3S false-alternative hypothesis for the captured grant registry. The earlier experiment bridge passed `definition.prerequisites` but dropped fresh `computedRequirements`; Mythril Containers therefore stayed conditional even though the same-run native callback observation had a complete, valid Steel Containers 1 requirement. With the fresh computed requirement substituted, same-technology dependency recursion eliminates each higher-level grant as an independent level-1 route. Alloy, Mythril, and Adamantite Containers are not real alternatives at level 0.

There is one action-side effect outside the grant identity: pinned `tech-forklift` declares Container 3 but its action body also assigns Steel Containers 2. It requires Steel Containers 1 and is Ice Age-only; the live period-1,000 route applicability was excluded. A registry-only proof would miss this edge, so the conclusion explicitly includes the upstream audit of that writer. The other upstream assignments found are temporary action-cost probes or preset/reset state construction, not native Research purchases.

## Dominance rule and fact types

No new classifier was added. The existing native-obligation solver follows technology identity and grant levels through prerequisite routes: a higher grant can be considered only when it grants at least the required level, and its own prerequisite chain is expanded before it can count as a bypass. This covers the observed level-1, level-2, and higher grant chain without action-name ordering. Focused tests now exercise that chain and a counterexample in which another eligible action genuinely grants level 1 without a Steel Containers prerequisite; that counterexample removes the mandatory claim. Existing tests continue to require unknown for unresolved conditional alternatives and native conditions.

The proof is local to the fresh current catalog, complete retained grant definitions, current route, and supported prerequisite semantics. Unknown or incomplete computed requirements remain unknown. The standard route excludes the Truepath and Ice Age-only routes; the source-audited Ice Age Forklift effect still depends on level 1. Native queue precognition and game-specific requirement exceptions not captured by the current ports remain outside this proof. The runtime `dependencyEvidence: partial` label is retained for unrelated graph areas.

The experiment keeps three distinct labels:

- `mandatory` is reserved for the verified local obligation (`tech-steel_containers`).
- `candidate` is a currently offered native action whose grant matches an unmet technology identity and level in the selected goal's native prerequisites. It is a strategic option, not a spending reservation.
- `unknown` is used when current offer, goal route, native requirements, or freshness are incomplete.

The selector receives the explicitly selected goal action from the experiment harness and derives the candidate from native prerequisite technology and grant level. It does not encode a Steel Containers or MAD order. A candidate is never auto-purchased and this work adds no production setting.

## Executable B/D comparison

D’s test-surface hook runs after fresh Smelter input capture and before `planSmelter`. It requires live `autoSmelter: true`, current root/progression/offer/generation/price/settings/production facts, and `sampleExact()` demand evidence. It can set only the existing Steel or Iron demand boolean; the native Smelter planner and `iSmelter` control retain fuel, Iron, Steel, Iridium, and allocation constraints. No Research target, technology, or resource stock was injected. The production build compiles this input-preparation path out.

At p1000 the normal Smelter sample recorded a 1,000 Steel Build target (`city-coal_power`) and 10 Steel held. The Steel Containers price was 250, so the goal shortfall was 240; the captured target's uncovered amount was 990 and already exceeded that shortfall. D must leave this case alone. The stricter full-demand sample returned `unavailable: project-storage-catalog`, however, so D correctly failed closed rather than treating the incomplete global demand catalog as complete.

| Measure                                                    | B. Enabled Smelter, required policy | D. Same setting, executable candidate hook |
| ---------------------------------------------------------- | ----------------------------------: | -----------------------------------------: |
| First Steel allocation / first stock increase              |                p1000 / p1100 sample |                       p1000 / p1100 sample |
| Native Steel Containers invocation                         |                               p1072 |                                      p1072 |
| Native Industrialization invocation / High Tech 3 observed |                       p3560 / p3600 |                              p3560 / p3600 |
| High Tech / Explosives / Uranium at p4000                  |                           3 / 2 / 0 |                                  3 / 2 / 0 |
| Iron / Steel / Coal stock at p4000                         |      74,206.57 / 354.56 / 31,036.84 |             74,206.57 / 354.56 / 31,036.84 |
| Smelter at p4000                                           |      15 Iron, 1 Steel, 16 Coal fuel |             15 Iron, 1 Steel, 16 Coal fuel |
| Coal Power / queues                                        |  1 powered Coal Power; queues empty |                                  Same as B |
| Native Research invocation sequence                        |                                Same |                             Identical to B |
| Automation work ticks / console or page errors             |                          500 / none |                                 500 / none |
| Exact demand checks / candidates admitted                  |                               0 / 0 |        500 / 0 (`project-storage-catalog`) |

The test-run host wall times were 112.9 seconds for B and 99.9 seconds for D. These single-run values are noisy; they do not establish a performance improvement. The exact runner uses accelerated virtual game time. D performed 500 extra exact-demand checks but no candidate planning passed the completeness gate, so no per-allocation strategy cost or benefit was measured. Its produced state and native Research sequence were byte-for-byte equivalent in the tracked comparison fields.

The previously accepted A/C controls are references, not reruns here. A keeps the Smelter disabled and never produces Steel. C's Steel-oriented policy reaches Steel Containers by p100 but diverts Iron production and does not reach Industrialization by p4000; the p4000 result has 0 Iron and 14 Steel smelters. This is a strategic regression against B's High Tech 3 progression. The new D policy caused no extra allocation and no progression improvement.

## Recommendation and verification

Stop extending the Steel Containers example. The false-alternative diagnosis is resolved within the captured native authority, but this save does not provide the complete exact demand evidence needed for an executable strategic override, and the known Build target already covers the goal shortfall at the observed frontier. A broader strategy-design stage should begin with a goal/resource case whose competing-demand authority is complete and should compare later progression and economy effects before implementing any production policy.

Verification completed: focused prerequisite, Smelter input-seam, and demand-coverage tests; full `npm run check` (341 test files); `npm run build`; `node tools/chromium-evolve-runner-test.mjs`; fresh deterministic B/D exact-runner replays; and `git diff --check`. The accepted Stage 3M checkpoints and Stage 3P Power behavior remain covered by the passing integration suite. No files under `tools/` or the pinned upstream checkout were changed.
