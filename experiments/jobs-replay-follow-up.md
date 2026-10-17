# Jobs Diagnostics Follow-up from the MAD → Human Replay

**Status: recorded for a separate Jobs slice; no Jobs changes were made here.**

## Triggering phase

The ordinary production-bundle replay reached the post-MAD Human civilization phase and continued native building actions through the 6,000-period bound. The exact runner reported each Jobs diagnostic once on both DeadSpace snapshots. The diagnostic names identify two control-flow points: the ordinary Jobs assignment postcondition/control-validation path (`autoJobs`) and the full Jobs/Craftsmen control-validation path (`autoJobs with autoCraftsmen`). The runner's error records do not retain a game-period timestamp or a full root snapshot per error, so the exact tick within the post-evolution run is unavailable.

## Captured control state

At the final production replay sample, `civ-farmer` exposed `jname`, `showJob`, `add`, `sub`, `level`, `setDefault`, `isDefault`, `d_state`, `event`, and `adjust`. Each captured `servant-*` control exposed only `jname`, `showJob`, `add`, and `sub`; in particular, `servant-farmer` had those four methods. The ordinary Jobs diagnostic says its assignment was not observed in captured root state. The full Jobs/Craftsmen diagnostic specifically identifies a required method missing on `servant-farmer`. The final capture is contextual evidence, not a timestamped snapshot of the exact failure tick.

## Exact diagnostic evidence

Each message appeared once per replay on pinned DeadSpace and once per replay on the beta source snapshot:

- `autoJobs: ordinary-jobs-postcondition-failed: ordinary job assignment was not observed in captured root state`
- `autoJobs: ordinary-jobs-controls-incomplete: ordinary jobs command controls are incomplete`
- `autoJobs with autoCraftsmen: full-jobs-controls-incomplete: missing required method on servant-farmer`

These errors did not block MAD, native Humanoid/Human actions, species becoming Human, or native city construction after evolution. Investigate the captured ordinary job assignment/postcondition and servant control requirements in a separate focused slice. Do not infer RNA/DNA gathering or cell-upgrade validation from this replay.
