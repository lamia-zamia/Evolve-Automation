# P14 — First useful autonomous allocation in Standard universe

## Outcome: C — fixture insufficient

No matched allocation experiment was run. No intervention, allocation change,
Research purchase improvement, or downstream progression improvement is
claimed. A genuine Standard save is required before selecting a bottleneck or
implementing the test-only intervention.

## Fixture audit

All 19 pre-existing native save/export/checkpoint artifacts under
`test-artifacts` were parsed
with the exact runner's `parseSave`. All progressed exports are
`race.universe: "magic"`, `race.species: "human"`; 17 have reset 846 and two
have reset 848. Their
`path: standard` technology field is not the universe field and does not make
them Standard fixtures. The hash-grouped paths and per-export hashes are
retained in [machine-readable evidence](p14-standard-allocation-vertical-slice-evidence.json).
No save field was rewritten.

The pinned game's normal `--save none` initialization produced
`race.universe: "standard"`, `race.species: "protoplasm"`, day 0, reset 0,
and no Research technology. The exact initial export SHA-256 is
`b74efb48ac12ac3f527fecf159609ea994777c8f37c389e823e1a776ebb3146b`.
Using the existing `current-full.json` settings, 50,000 periods yielded day 0,
reset 0, protoplasm, and no ordinary Research/economy progression. One native
RNA action followed by another 20,000-period bounded run also remained at
day 0 and reset 0. The raw runner reports and exports are retained under
`test-artifacts/benchmark/tmp/p14-fresh-*` and their hashes are recorded in the
evidence JSON. The new-game state is authentic Standard but cannot provide a
current Research bottleneck or a useful matched allocation comparison.

## Experiment boundary

There is no valid baseline from which to read a current native Research offer,
exact live price, ordinary-resource shortage, producing owner capability, or
incumbent allocation. Therefore no resource target was selected, no owner was
directed, and no baseline/intervention arms, repeat, or progression comparison
were run. Normal Research, Market, Smelter, Construction, and Jobs settings
were not artificially disabled. P13Q's per-Market-tick selector remains
retired. No renderer CPU campaign was repeated; P13O's less-than-2% gate stays
unresolved.

## Required next input

Provide one unmodified native Evolve export from a regular Standard universe
run with an ordinary MAD-compatible race (for example human) and enough valid
native progression for ordinary Research and the relevant Market/production
owners to be active. A save with a current meaningful Research offer is
preferred. Its actual `race.universe` must be `standard`; a Magic save whose
technology path says `standard` is not suitable. With that export, P14 can
inspect live native offers, prices, resource stocks, and owner allocations
before selecting the one bounded intervention.

## Inputs and reproducibility

Starting repository HEAD was `1c0b741209b2fbce03ccbd56637ce13d78139df0` on
`deadspace`. The pinned game snapshot SHA-256 was
`05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`; the
existing settings SHA-256 was
`f7fd9286607695d8716359f20f1a5f680264832de36879f84a7a67c4bd970042`; and the
normal automation bundle SHA-256 was
`84a029d822fcca7b576736ee4c5558ac799a25bea0322b4bd64b0c3eedb9a3b6`.
All fixture hashes, runner evidence hashes, the seed, epoch, and exact observed
native state are in the adjacent evidence JSON.

No implementation code or focused test was warranted because the required
fixture and target authority were absent.
