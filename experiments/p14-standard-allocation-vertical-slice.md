# P14 — First useful autonomous allocation in Standard universe

## Outcome: C — owner authority insufficient

Fresh-game evolution now reaches an ordinary Shroomi race in the genuine
Standard universe. The original plan was continued through a native
Research-offer inspection and two bounded native-progression replays. This
produced a plausible one-resource bottleneck, but the existing Gather owner is
deliberately stopped for ordinary materials after bootstrap. The other
available source, Market, is inactive. The current Gather owner therefore
cannot honor the target without a new test-only demand control, and no
same-boundary current-offer validation path exists. P14 stops here rather than
adding an unverified selector or carrying offer prices across owner cycles.

No matched baseline/intervention arms or controlled repeat were run. No
allocation change, Research purchase improvement, or downstream progression
improvement is claimed. Details and retained replay hashes are in the adjacent
machine-readable evidence.

## Fixture audit

All 19 pre-existing native save/export/checkpoint artifacts under
`test-artifacts` were parsed with the exact runner's `parseSave`. All
progressed exports are `race.universe: "magic"`, `race.species: "human"`; 17
have reset 846 and two have reset 848. Their `path: standard` technology field
is not the universe field and does not make them Standard fixtures. The
hash-grouped paths and per-export hashes are retained in the machine-readable
evidence. No save field was rewritten.

The pinned game's normal `--save none` initialization produced a genuine
Standard protoplasm state. The first automation replay exposed two evolution
bootstrap defects: the early membrane step did not advance, and an
unaffordable mitochondria no-op prevented a later affordable cell-capacity
step. Both were fixed in separate code commits and covered by focused tests.
With the fixes and unchanged `current-full.json` settings, a 50,000-period
replay entered `race.species: "shroomi"`, retained
`race.universe: "standard"`, and ran the normal Research, Market, Smelter,
Construction, and Jobs settings. The final export SHA-256 is
`96e6afc6384267a6d83402a863a033be40674f335432c6f4601614b2664cf882`; the raw
runner report is `p14-postfix2-fresh-50000.json` with SHA-256
`5d6da6933c1d3f5a810ae27218065d749557fb1074c379bb6131a103dde17370`.

The current native Research row `tech-sundial` costs exactly 8 Lumber and 10
Stone. At the fresh Shroomi state, Lumber is 72/200 and Stone is 0/200, so
Stone is the only ordinary-resource shortage. The visible native Gather Stone
button has a captured `action` control, but the ordinary Gather planner is
stopped for routine materials once primitive technology reaches level 1. It
therefore does not invoke that control. The Market has `active: false`, no
workers are assigned to resource-producing jobs, and no Quarry is built. This
is a measurable incumbent gap, but not authority to retarget the existing
owner.

As a native progression check (not an experiment arm), ten clicks on the
visible native Gather Stone button yielded 10 Stone. Running unchanged
automation for 5,000 periods then bought Sundial and progressed to Shroomi day
250 with primitive 3, Composting 2, Housing 1, Currency 1, Basic Storage 1,
Mining 1, Scientific Method 1, Military 1, and Banking 1. The runner recorded
one `tech-sundial.action` invocation. A further 20,000-period continuation
reached day 1,250, but the economy stalled: Food 26/1000, Lumber 17/200, Stone
0/200, Money 0.37/1000, Knowledge 100/100, 54 starved population, three
unemployed workers, zero Quarry, and inactive Market. The next offered
Primitive Axes action costs 45 Knowledge, 20 Lumber, and 20 Stone; it has two
ordinary-resource shortages and no active owner capable of supplying them.
These native actions demonstrate a route to a Research grant, but do not
establish an autonomous allocation improvement.

## Experiment boundary

The Sundial observation provides a current offer, exact price, one-resource
shortage, native production control, and a demonstrated route to purchase.
The remaining blocker is owner authority: the Gather planner intentionally
stops routine materials after bootstrap, and its current test hook covers
resource claims rather than a bounded Research-driven demand. The Research
owner runs after Gather, so reusing its prior-cycle offer or price would violate
the no-stale-price constraint. A production-grade redesign is outside this
vertical slice; no change was made to Market, Gather, Research, or Smelter
allocation behavior. Normal settings stayed enabled. P13Q's per-Market-tick
selector remains retired. No renderer CPU campaign was repeated; P13O's
less-than-2% gate remains unresolved.

## Required next input

No additional save is required to establish the blocker: the fresh export is a
genuine Standard Shroomi state with valid native progression. To continue P14,
the minimum requirement is an owner-boundary mechanism that, for one explicit
experiment target, can verify the *current* Research offer and exact price,
sample the current shortage, and propose a bounded demand to an existing owner
without retaining price, stock, reservation, or control handles across cycles.
Alternatively, provide an unmodified Standard export in which the normal
Market or production owner is active and already has a current useful
Research-offer bottleneck.

## Inputs and reproducibility

Starting repository HEAD was `1c0b741209b2fbce03ccbd56637ce13d78139df0` on
`deadspace`. The pinned game snapshot SHA-256 was
`05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7`; the
existing settings SHA-256 was
`f7fd9286607695d8716359f20f1a5f680264832de36879f84a7a67c4bd970042`; and the
normal automation bundle used for the successful fresh replay SHA-256 was
`d3d875c3242dd5d386c223cb1fa4eaa365760cfd3e4d93f44bbef2c5bfefe615`.
All fixture hashes, replay inputs/outputs, native state summaries, and
non-comparison limits are in the adjacent evidence JSON. Evolution bootstrap
fixes and focused tests are committed separately from this report.
