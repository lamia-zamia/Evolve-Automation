# P12A.1 adaptive MAD frontier selection — 2026-10-18

## Decision and boundary

The selector is diagnostic and shadow-only. When authority is complete, it can make a provisional ordering among verified mandatory Research frontier actions using the current native prices and the shared resource-feasibility contract. The saved Stage 3F/3I evidence puts Mad Science ahead of Black Powder at 50 versus 100 Mana and the same observed Mana rate. This is a provisional wait-to-affordability ordering under that saved mandatory evidence; it does not establish a reduction in time to terminal MAD.

No terminal-time effects or comparable completion estimates are available. Unresolved OR alternatives remain ambiguous, and unknown estimates are not treated as ties. The selector never authorizes or issues Research spending.

## Prerequisite authority and cache validity

Each diagnostic pass constructs one effective prerequisite snapshot from the current retained Research definitions. For each action, a computed requirement replaces its retained declaration only when the observation is complete, valid, and bound to the current root generation and progression epoch. Otherwise the original declared, conditional, or unavailable state remains intact; absent computed evidence never becomes an empty requirement list. Route restrictions, native conditions, and other eligibility facts remain separate from prerequisite requirements.

The same snapshot feeds prerequisite graph construction and mandatory-obligation classification. The graph cache identity includes the effective prerequisite contents and evidence state, target action, root identity and generation, progression epoch, grant levels, applicability, offered action generations, and MAD control generation. Changes to those inputs rebuild the graph. A cache hit refreshes only cycle and offer freshness metadata after the authority identity matches. Computed evidence does not carry across a root or progression change, or from a valid observation into a stale or incomplete one.

Before ranking, the selector checks that every mandatory obligation is a verified, currently actionable graph frontier and that every verified actionable graph frontier is represented by a mandatory obligation or an alternative group. Contradictions, including current exclusion evidence for a mandatory action, return `blocked-by-missing-native-authority` with a reason. The AND/OR classifier remains conservative.

## Saved fixture and live limitation

Stage 3F captured current Mana-blocked offers for `tech-black_powder` and `tech-mad_science`. Stage 3I later established both as mandatory on the first cycle for that saved fixture. With non-Mana prices covered and the same positive observed Mana rate, the lower 50-Mana price makes Mad Science affordable sooner than the 100-Mana Black Powder offer. That evidence supports only the provisional ordering described above.

The live Stage 2F exact fixture still supplies no computed native requirements: a protected fresh Research draw reported zero computed requirements. The current graph therefore cannot establish the high-tech route obligations. In the P12A.1 replay, the first and latest selector results were `blocked-by-missing-native-authority`, with no compared action IDs. The unresolved high-tech alternatives include native requirements whose applicability or prerequisite relationship is unknown. The live selector is not operational for MAD frontier selection until fresh computed requirements resolve those alternatives for the current root and progression state.

The evaluator reports provisional resource projections only. For the saved live sample, the prior measurements were about 17.9 seconds for Black Powder and 7.9 seconds for Mad Science using a single Mana-rate sample; external spend-owner commitments were unavailable. Those estimates cannot prove either action mandatory. Producer and building marginal effects and terminal completion time also remain unsupported.

## Exact replay and timing

`experiments/p12a-mad-frontier-exact.mjs` extracts the baseline userscript from immutable pre-P12A commit `a69d615f09cd012caddd0235d70ce036ea1dda53` and asserts SHA-256 `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7`. It asserts the working-tree candidate bundle has a distinct hash and records both identities. The saved fixture, seed 42, epoch `2026-09-21T00:00:00.000Z`, 200-period window, and pinned game commit `db38e2af831907d49aeb5348d678d8d8745d6c3f` are unchanged. The same baseline is selected automatically on repeat runs.

The latest replay used baseline SHA-256 `517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7` and candidate SHA-256 `e63c9dac1f1c8adb4e31dcf24a3cb5a127638ed04a7f9147238af6f8412a1536`. Baseline A/A, baseline versus production candidate, and test-only observation exports all matched at SHA-256 `9b4a3e7364571db6c6fc858e743ee3610dde162a921132641f1d17c155e7ec67`. Production candidate control usage and native invocation sequences matched baseline exactly; each production arm completed 25 work ticks. Each had one console error.

The save SHA-256 was `b1f22205b78d043a98f914924d965a1ab04af791f1f3d7ce6e0179849892662e`, and the effective settings SHA-256 was `fbf75da786f5aa841212eea5c5848a7a532a9a8afe8d7ccd14f5781895601131`.

Timings below are exclusive measurements from one 25-work-tick candidate window; nested phases subtract child work, and no inclusive parent duration is added. Offer acquisition ran 30 samples in that window. These bounded observations are not an accepted renderer CPU improvement and do not compare against P8.

| Exclusive phase                          | Samples |   Total | Per work tick | Maximum |
| ---------------------------------------- | ------: | ------: | ------------: | ------: |
| `research.offer-acquisition`             |      30 | 18.9 ms |       0.76 ms |  4.1 ms |
| `research.catalog.registry-read`         |      30 |  6.0 ms |       0.24 ms |  0.4 ms |
| `research.binding.restate`               |      30 |  0.5 ms |       0.02 ms |  0.1 ms |
| `goal.mad.prerequisite-preparation`      |      25 | 25.7 ms |       1.03 ms |  1.6 ms |
| `goal.mad.research-prerequisites`        |      25 | 17.0 ms |       0.68 ms |  1.6 ms |
| `goal.mad.obligation-classification`     |      25 | 12.2 ms |       0.49 ms |  1.0 ms |
| `goal.mad.frontier-resource-acquisition` |      25 |  0.2 ms |       0.01 ms |  0.1 ms |
| `goal.mad.candidate-feasibility-ranking` |      25 | 23.7 ms |       0.95 ms |  2.4 ms |

Production baseline and candidate each made 30 Research catalog samples and 30 native Research catalog draws; the candidate added none. The P12A.1 candidate recorded 20,850 effective-definition visits, 25 graph builds, 25 candidate evaluations across 435 offers, 25 obligation classifications, and 175 frontier-resource reads. The separate test-only observation bundle added one Research sample and two catalog draws across its window; its instrumentation and forced catalog read are not production behavior. No total time is reported across phases with different sample counts.

## Spending safety and verification

Incomplete evidence cannot produce a frontier selection. The diagnostic creates no resource claims or reservations, changes no Gather, Research, or Construction commands, makes no new native spending calls, and performs no autonomous allocation action. The replay confirms production game export, control usage, and native invocation parity.

Verification completed: focused Research tests; `npm run build`; `npm run check`; Chromium runner contracts; exact baseline A/A and baseline/candidate replay; and `git diff --check`. Live MAD authority, terminal-time estimates, and complete cross-owner resource commitments remain unavailable.
