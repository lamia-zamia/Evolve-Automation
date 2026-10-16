# Shared native building price observation experiment

## 1. Corrected CPU-profile attribution

The offline analyzer previously paired each `samples[index]` stack with
`timeDeltas[index + 1]`. V8 profiles pair the stack with the delta at the same
index, so attribution now uses `timeDeltas[index] ?? 0`. A synthetic three
sample profile with unequal 10, 30, and 100 microsecond deltas checks exact
self totals, inclusive totals, and owner attribution in
`full-runtime-profile-cpuprofile-test.mjs`.

The existing 18 early, mid, and late raw profiles were reprocessed offline; no
benchmark was rerun. In the two late active profiles, the previously reported
and corrected figures are:

| Function | Old self / inclusive ms | Corrected self / inclusive ms | Old rank | Corrected rank |
|---|---:|---:|---:|---:|
| `adjustCosts` | 190.09 / 2389.25 | 195.13 / 2394.68 | 14 | 14 |
| `setData` | 128.13 / 2470.73 | 127.69 / 2468.18 | 24 | 24 |

The hotspot ordering did not materially change. The corrected analyzer still
attributes both functions to the game; `setData` remains entirely
automation-initiated in these captures. Corrected aggregate results for all 18
profiles are retained in ignored `test-artifacts/perf-profile/` as
`corrected-cpuprofile-summary.json`; the focused late-active result is
`corrected-late-active.json`.
