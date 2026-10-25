# P52 — Independent Construction-to-Jobs identity verification

**Decision: A — Historical handoff correlation established.** Construction and the actual Jobs admission boundary independently supplied compatible identity evidence from the same runtime `ProgressionEpochReader`. The p720 purchase and Quarry Worker unlock are correlated as one historical owner event. The test-only result is `correlated-owner-event` with `executionAuthority: "none"`.

P52 resolves P51's missing cross-owner evidence for this exact one-cycle scenario. It does not authorize another Construction purchase, Jobs assignment, dropping Farm's saving priority, worker-commitment changes, or a Food-sustainability conclusion. It adds no production allocator or spending, reservation, assignment, or priority authority.

## Identity audit and provenance

The runtime creates one `ProgressionEpochReader` in `createCapturedProgressionControl` and passes that shared `progression` object to Construction and Jobs. P52 retains and compares the reader object's identity as an opaque runtime-instance token. Equal scalar counters from separate reader instances cannot establish a shared source.

| Evidence                         | Construction side                                                                                            | Jobs side                                                            | Meaning and limit                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime source                   | Existing shared reader, attached to the post-success publication authority                                   | The same reader object, sampled inside P49's Jobs admission callback | Object identity proves a common runtime reader for this event.                                                                                                                  |
| Root replacement generation      | `progression.readRootGeneration()` already retained at Construction's existing post-success identity refresh | Independently read at Jobs admission                                 | Reader-local replacement counter. It increments on root replacement, including replacement that retains the wrapped root reference. `0` is not a save identity across runtimes. |
| Progression fingerprint          | Existing post-success `progression.readProgressionEpoch()` value                                             | Independently read at Jobs admission                                 | Coarse offer identity derived from sampled native root fields. It is not a resource, price, queue, reservation, or worker-commitment snapshot.                                  |
| Root object reference            | Construction's retained P40 owner context                                                                    | P49's captured Jobs root reference, checked at execution             | Owner-local freshness evidence. Reference equality is not root generation or progression identity.                                                                              |
| Jobs preparation generation      | Not a Construction identity                                                                                  | Jobs-local session/preparation generation                            | Establishes that the prepared Jobs observation is current; it is not the root replacement generation.                                                                           |
| Work-cycle identity              | Runtime `automationCycle` shared to the owner event                                                          | Runtime `automationCycle` in P49 evidence                            | P52 requires these identities to match for this single-cycle correlation.                                                                                                       |
| Construction ordering generation | Construction adapter ordering identity                                                                       | Not the Jobs session generation                                      | Separate Construction lifecycle value, even when its number equals the work cycle or Jobs generation.                                                                           |

The reader's `readRootGeneration()` is a counter; `readProgressionEpoch()` calls the reader with refresh enabled, reads the current root, and traverses sampled native fields. It is not a free lookup. The Construction fingerprint came from the existing P51 post-success sample and added zero P52 root observations. For a pending qualified receipt, the actual Jobs boundary performs one bounded same-reader identity sample: two accessors, one shared-reader root-read callsite, one native root observation. The no-receipt path performs no identity sample. No new reader, subscription, timer, or poller is created.

P51 previously compared Jobs with root/progression values copied from P40's Construction context. That was circular evidence. P52 instead attaches Construction provenance to its existing post-success sample and samples `progression.readRootGeneration()` plus `progression.readProgressionEpoch()` at the Jobs admission callback. It does not use receipt fields, cloned values, P40's retained context, a prior-cycle token, or a separately instantiated reader as Jobs-side corroboration.

## Narrow test-only contract

The pure P52 consumer accepts a historical correlation only with a verified native Quarry purchase, qualified current request identity and generation, same-runtime source provenance on both sides, matching work-cycle, matching root replacement generation, current Jobs owner freshness, a current Jobs preparation, and an observed unlocked Quarry Worker. Ordinary-only and Full Jobs observations are supported. Receipt consumption is one-time and immediately releases the receipt.

The progression relationship is explicit:

- Equal fingerprints are `same-fingerprint`; this records only the coarse offer identity.
- A changed fingerprint may be classified `source-backed-known-mutation` only when the exact before/after identities and source-backed native mutation evidence are available.
- An unexplained fingerprint change, unavailable identity, incompatible runtime source, or root-generation mismatch cannot be treated as unchanged or corroborated.

Missing required identity/source evidence returns `handoff-authority-incomplete`; stale receipt or owner evidence returns `stale`; contradictory or forged evidence returns `rejected`; an absent qualified receipt returns `no-receipt`. The successful status is `correlated-owner-event`. Every result carries `executionAuthority: "none"`.

## Exact P51 replay

The exact P42-derived Chromium replay uses the pinned `pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f`, `p18-standard-human-fixture.txt` (SHA-256 `2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684`), seed 44, and epoch `2026-09-21T00:00:00.000Z`. A retains Farm saving priority and has no Quarry receipt. B uses the existing P42 one-cycle test-only Quarry reservation substitution and the P51 verified purchase. B-repeat repeats the treatment. A/B match before intervention; B/B-repeat match both before and after intervention.

At p720, A does not buy Quarry. B and B-repeat verify the native Quarry count transition from zero to one and observe Quarry Worker unlocked at Jobs admission. Construction and Jobs both report root generation 0, the same progression fingerprint, work cycle 90, and the same reader object. The actual Jobs sample is independent. No native action or click occurs between publication and the Jobs sample. The receipt is consumed and released once at age zero periods and cycles.

The post-observation result of two Farmers and two Quarry Workers is ordinary Jobs gameplay. P52 does not change allocation. The P42 reservation substitution and P36/P38 Gather authorizations remain as in the source replay; no new Gather authorization or reservation rule was added. P49's additional control, settings, catalog, demand, and owner-wrapped-root observation deltas are all zero.

## Regressions and production isolation

Focused P52 contract regressions cover different reader instances with equal scalar identities; root replacement preserving the same wrapped reference; root-generation and progression mismatches; unexplained versus source-backed progression change; missing Jobs identity and Construction provenance; stale Jobs session; wrong work cycle; old receipt; duplicate consumption; cancelled/replaced request; forged owner scope/target; native mutation after publication; no receipt; and ordinary-only and Full Jobs paths. Existing P51 fail-closed reservation behavior is preserved.

The updated P50 compiled-output AST regression compares production, ordinary test-surface, P51-only, and P52 diagnostic bundles. It verifies that production contains no P52 observer, consumer, request reader, runtime identity subscription, per-cycle check, extra root/progression read, or extra control/catalog read. P52 instrumentation is only applied by the exact experiment's test-surface transforms.

## Measurements and limits

The exact replay recorded one additional native root observation for Jobs identity acquisition and none for Construction identity reuse. The sampled Jobs callback had no additional catalog/control reads. The no-receipt A callback ran once with zero identity samples. The bounded sample measured 0 ms in this run; the Construction identity sample measured 0.1 ms, pure correlation checks 0 ms, receipt consumption 0.1 ms, and complete consumer 0.1 ms. The callback increment was about 0.7 ms. These are synchronous diagnostic timings at the available clock resolution, not renderer CPU-share measurements. Retained test evidence was 4,882 bytes and the maximum receipt was 1,646 bytes.

P46's renderer CPU gate remains unresolved. P52 did not rerun its benchmark and makes no 2% CPU claim. Native parity coverage remains limited because `test-artifacts/benchmark/settings/baseline-tuned.json` is absent. Equality of the progression fingerprint does not establish current resources or prices, queues or reservations, worker commitments, or food sustainability.

## Verification

- Exact P42-derived Chromium A/B/B-repeat replay: passed; outcome A, historical correlation established.
- Focused P51 lifecycle, P52 identity, P50 compiled-output isolation, Chromium runner, and P38 Jobs contract tests: passed.
- `npm run build` and `npm run build:test-surface`: passed.
- `npm run check`: passed all five check steps, including all 381 test files plus bundle syntax, both typechecks, lint, and formatting.
- `git diff --check`: passed.

Machine-readable replay, identity provenance, and performance evidence is in [p52-independent-construction-jobs-identity-evidence.json](p52-independent-construction-jobs-identity-evidence.json). The evidence builder is [p52-independent-construction-jobs-identity-evidence.mjs](p52-independent-construction-jobs-identity-evidence.mjs), and the exact replay entry point is [p52-independent-construction-jobs-identity-exact.mjs](p52-independent-construction-jobs-identity-exact.mjs).

## Commit grouping

- Test-only handoff implementation and exact replay machinery: `819aabac`.
- Focused P52 identity and P50 compiled-output isolation regressions, including the P51 audit-scope adjustment: `b0a10f44`.
- This report and the generated machine-readable replay evidence are committed separately.

No commit is pushed. This experiment stops at historical-event correlation; a later executable allocator would require a separate explicit owner-authority and performance decision.
