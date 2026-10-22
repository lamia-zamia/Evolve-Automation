# P25 — Research completed-technology processing

## Decision: C — native authority and parity cannot be preserved by the proposed filter

No production filtering prototype or regression tests were retained. The pinned native
`checkOldTech()` is private to `src/actions.js`, and omitting a registry key from the native
`drawTech()` loop also omits that key's `removeAction()` call. The current automation capture can
validate the complete registry, but it has no captured native callback that can classify a key as
old and then perform the native binding cleanup that the skipped loop would have performed. Adding
a second classifier and a replacement binding-cleanup path would create a parallel authority path,
which this experiment forbids. The experiment therefore stops before Stage C parity claims and
Stage D candidate-vs-baseline performance runs.

## Scope and inputs

- Automation: `lamia-zamia/Evolve-Automation`, branch `deadspace`.
- Pinned Evolve checkout: `D:/work/Evolve-DeadSpace`, HEAD
  `db38e2af831907d49aeb5348d678d8d8745d6c3f`.
- Late fixture: `test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json`, settings
  `test-artifacts/benchmark/settings/current-full.json`, seed 42, epoch
  `2026-09-21T00:00:00.000Z`, as recorded by P22.
- Earlier available progression fixture: `test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json`
  with its Stage 3N settings. It was not drawn in this investigation because the Stage A callback
  attribution blocker applies to both fixtures.
- The exact Chromium runner is `tools/chromium-evolve-runner.mjs`. Its separate checkout has
  pre-existing local changes; P22 specifically records a diagnostic-only `rngState` change there.
  It was left untouched.

## Stage A — attribution available from existing evidence and source

P22's separate instrumented profile attributes **32.32 ms per work tick** to native Research
`drawTech` and DOM generation across **103 draws/catalog refreshes** in the 100-work-tick late
window. It reports broader automation phases of 0.25 ms/tick for registry reads and 0.86 ms/tick
for offer acquisition. These are the available measurements; P22 did not split native registry
traversal, completed-row processing, offered-row processing, native affordability, DOM/binding, or
automation capture into separate elapsed totals.

The current catalog source documents approximately **194 completed rows against 6 offers** for the
late save. Multiplying those approximate per-draw values by P22's 103 draws gives an illustrative
19,982 completed-row and 618 offered-row processing opportunities. This multiplication is not a
measured count: P22 did not record per-draw completed/active counts, and live qualifications or
progression can change the rows between draws.

Pinned source explains what the discarded `#oldTech` container does not avoid:

1. `drawTech()` enumerates `Object.keys(actions.tech)`, checks route/path, calls `removeAction(id)`,
   classifies with `checkOldTech()`, and accumulates old categories and rows
   (`src/actions.js:6555-6675`).
2. Each old row still calls `addAction()` and `setAction()` (`:6671-6680`). `setAction()` repeats
   qualification checks (`:6682-6685`), removes the action again, runs native affordability twice
   (`:6719-6724`), builds row markup, appends to `#oldTech`, and calls `vBind` (`:6732-6741`,
   `:6790-6801`, `:6817+`). The container discard occurs after `#resContent` binds, so the append
   target is absent and the `vBind` call emits no old-row binding. It still does not skip the
   preceding native checks, cost work, markup construction, or `vBind` call.
3. Offered rows are checked for qualification and prerequisites in `drawTech()` (`:6583-6630`),
   sorted using native cost functions (`:6634-6645`), then passed to `setAction()` where displayed
   adjusted costs and native affordability are evaluated (`:6719-6741`).
4. The exceptional `checkOldTech()` classifications are: `fanaticism` and `anthropology` use their
   own technology flags; `deify` uses `ancient_deify`; `study` uses `ancient_study`;
   `isolation_protocol` uses `isolation`; `focus_cure` uses itself; and `vax_strat1` through
   `vax_strat4` use `vax_p`, `vax_f`, `vax_s`, and `vax_c` respectively (`:6424-6453`). The base
   grant level must first be reached. Route/path is checked before this classifier. This callback
   is not exported.

The existing exact-runner measurements do not expose per-native-callback identities or timings for
`checkOldTech`, `addAction`, `setAction`, or `checkAffordable`. Automation's `Object.keys` hook sees
the complete ordered registry and the retained action/requirements identities; it does not observe
the private upstream callback invocations. Therefore exact completed-vs-offered elapsed attribution
and callback identity counts cannot be truthfully reported from the existing instrumentation. Adding
wrappers around native callbacks would itself be a behavior-changing instrumentation layer and those
callbacks are not available through the supported capture surface.

## Stage B — bounded filtering prototype assessment

The existing `captureTechDefinitionsDuring()` interception in
`src/adapters/evolve/captured-game-mechanics.ts:2166-2385` is the sole scoped `Object.keys()` wrapper.
It calls native `Object.keys`, snapshots candidate registries from the resulting full keys
(`:2321-2353`), restores temporary requirements callbacks and the `Object.keys` descriptor in a
`finally` path (`:2369-2385`), and later validates the candidate against a fresh native full-key
snapshot (`:2512-2535`). Feeding filtered keys to snapshot capture would produce an incomplete
candidate and fail validation. Taking the full snapshot before returning filtered keys could retain
the registry record, but it would still change the native loop's behavior.

Specifically, a filtered completed key never reaches `removeAction(actions.tech[key].id)` in
`drawTech()`. A scratch draw can therefore leave the prior native action binding/generation in place
for a completed technology, where the unfiltered draw would remove it. There is no captured native
`removeAction` handle or supported way to reproduce its binding cleanup. The native classifier is
also private, so filtering would need a second implementation of its truthiness, coercion, and
exceptional-key behavior; the existing completed-tech condition gate is automation-owned and does
not provide a native callback identity for `checkOldTech()`.

This is sufficient to reject the prototype under the native-authority and binding-generation
requirements. No filtered-key return path was implemented. `includeGranted=true` and ordinary
player-visible Research draws consequently retain the existing full draw behavior.

## Stages C and D — not run

No optimized draw existed to compare. Offered rows, prices, affordability, action generations,
grants, holdings, RNG, and exported-state parity were not claimed. Special cases, queued Research,
route restrictions, dynamic conditions, unknown definitions, failed captures, and root replacement
were not run against an optimized arm.

No CPU comparison was run. P22's identical-bundle controls alone varied by **3.23% renderer CPU**
and **3.91% `TaskDuration`**, already above the 2% objective. P22 uses renderer-process CPU as the
direct authority and CDP `TaskDuration` as support; `ScriptDuration` is not valid for the controlled
`advance()` path. Any future candidate needs separate instrumentation and uninstrumented CPU
cohorts, paired reversed-order repetitions, and same-window identical-baseline controls.

## Validation and decision

This was a source/evidence investigation only. Production implementation and tests were not edited,
so the focused tests, full `npm run check`, build, Chromium runner contracts, and `git diff --check`
were not run for a code change. The report itself was checked with `git diff --check` before commit.

**Final decision: C — unable to preserve native authority/parity with the proposed filtering path.**
Do not retain completed-technology filtering. A bounded next Research experiment should target
native-data-first attribution: extend the existing `Object.keys` interception only to count and time
the full ordered registry traversal and snapshot validation, then profile offered-row price,
affordability, and DOM/binding phases separately using a test-only diagnostic surface that does not
wrap or replace native callbacks. This will establish whether a lower-level optimization can avoid
completed-row work while leaving native iteration, classification, and action cleanup intact.
