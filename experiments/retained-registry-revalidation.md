# Retained Research registry revalidation — identity-only A/B

## Criterion (written before measuring)

Arms: **base** = `deadspace` `readRetainedNativeTechRegistry()` (rebuilds the full frozen
`readNativeTechRegistrySnapshot` of every `actions.tech` entry and compares it); **candidate** = identity-only
revalidation (key order, each action object reference, each `reqs` value/getter reference; static metadata is not
re-read).

Authority (Stage 4F.3): renderer-process CPU, renderer rows summed, with CDP `TaskDuration` as cross-check; never
`ScriptDuration`. Per-operation in-page batches of `readTechDefinitions()` (3,000 calls after a 200-call warm-up),
fresh exact-runner session per batch, arms alternating, 3 repeats per run, two runs in opposite arm orders.

**Keep** only if all hold:

1. In both orders, the candidate's median renderer CPU per call is ≤ 50% of the base median and the absolute saving
   is ≥ 0.5 ms per call; `TaskDuration` moves the same way in every repeat.
2. Every batch returned the retained definitions on every call (0 unavailable, 0 reference changes).
3. A matched 1,000-period window from the same save/seed ends with identical `tech` and resource amounts in both
   arms, with no automation errors.
4. Existing fail-closed tests pass unchanged, new tests cover key add/remove and `reqs` replacement, `npm run check`
   passes, and the production bundle diff is confined to the registry revalidation.

**Revert** otherwise. The per-work-tick share is reported as context (saving per call × measured registry reads per
work tick ÷ base renderer CPU per work tick), not as the gate.

## Results

### Decision: keep — every criterion holds

Inputs: exact runner, game snapshot `test-artifacts/game/evolve-deadspace.js` SHA-256 `29e22dbe…a54f4` (DeadSpace
`db38e2af`), HeadlessChrome/151.0.7922.71, save `stage2f-through-7600-export.json`, settings
`stage2e-integrated-mad-no-triggers.json` (`a9eacc9e041e…`), seed 42, 400-period warm-up per session. Base arm =
`deadspace` `captured-game-mechanics.ts`; both arms are test-surface bundles built by
`experiments/retained-registry-revalidation.mjs`. Raw output: `retained-registry-revalidation-base-first.json`,
`retained-registry-revalidation-candidate-first.json`.

Per-call cost of `readTechDefinitions()`, 3,000-call batches (renderer CPU / `TaskDuration`, ms per call):

| Run / repeat           |        Base |   Candidate |
| ---------------------- | ----------: | ----------: |
| base-first, 1          | 2.40 / 1.89 | 0.22 / 0.24 |
| base-first, 2          | 1.99 / 1.50 | 0.06 / 0.06 |
| base-first, 3          | 1.75 / 1.25 | 0.08 / 0.08 |
| candidate-first, 1     | 2.69 / 2.03 | 0.11 / 0.10 |
| candidate-first, 2     | 2.57 / 2.00 | 0.08 / 0.08 |
| candidate-first, 3     | 2.01 / 1.51 | 0.09 / 0.08 |
| **median, base-first** |    **1.99** |    **0.08** |
| **median, cand-first** |    **2.57** |    **0.09** |

1. Candidate median is 4.0% / 3.4% of base (≤ 50%); saving 1.91 / 2.48 ms per call (≥ 0.5 ms). `TaskDuration`
   fell in every one of the six pairs.
2. All 36,000 measured calls returned the retained definitions (834 entries): 0 unavailable, 0 reference changes.
3. The matched 1,000-period window (125 work ticks) ended with identical `tech` and resource amounts in both arms and
   both orders. Each arm logged the same two pre-existing A.R.P.A. capture errors (already in the backlog), nothing
   else.
4. Existing tests pass unchanged; new cases cover key added/removed, static `reqs` record replaced, `reqs` turned
   into an accessor. `npm run check` passed (346 test files). The production bundle diff is 4 hunks, all in the
   registry revalidation (new `nativeReqsIdentity`, the `reqsIdentity` field, the rewritten loop). Bundle SHA-256
   `d069e376…` → `fd04d858…`.

Context, not the gate: production read the registry 266 times in 125 work ticks (2.13 per tick; counted with a
measurement-only counter injected at bundle time). At 1.9–2.5 ms saved per read that is about 4.1–5.3 ms renderer
CPU per work tick, or roughly 2–4% of the 130–174 ms per work tick seen in the base windows. The whole 125-tick
windows themselves again swung by the run order (the second arm cost 25–40% more in both orders), which is why the
per-call batches are the measurement.

### Semantic change

The base re-read every action's static metadata (id, grant, static `reqs` contents, `condition` presence, route and
trait lists) on every read, so an in-place mutation of an unchanged action object invalidated authority. The
candidate trusts that metadata while key order, the action object and its `reqs` reference are unchanged — the same
trust the base already stated in its comment (upstream declares `actions.tech` once and never mutates it) and the
same limit the backlog already records for `condition`, `era_a` and cost callbacks. It is stricter in one case:
replacing a static `reqs` record with an equal-valued new one now invalidates. Capture-time validation
(`readNativeTechRegistrySnapshot` + `sameNativeTechRegistrySnapshot` around the draw) is unchanged.

Reproduce: `node experiments/retained-registry-revalidation.mjs --order base-first`, then `--order candidate-first`.
