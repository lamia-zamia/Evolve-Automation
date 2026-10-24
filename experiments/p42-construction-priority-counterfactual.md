# P42 — Construction-owned Quarry priority counterfactual

## Result

**Construction outcome A — native Quarry purchase confirmed.** In arm B, the one-cycle experimental reservation substitution let the ordinary Construction executor select and buy Quarry at p720. The purchase was conditional on deliberately suspending Farm's previously established saving priority. It is not evidence that Quarry should outrank Farm in production or that a player approved this priority change.

**Economic outcome 2 — Jobs sustainability blocked.** Ordinary Jobs initially assigned two Farmers and two Quarry Workers, and native Stone production became positive. Food flow turned negative at p728, starvation was observed from p2000, and later ordinary Jobs removed Quarry Workers without restoring positive Food flow. The run therefore does not establish sustainable autonomous Stone production.

## Owner boundary and intervention

The P40 trace identifies the consumption boundary inside Construction's Build conflict path. Construction samples its current candidate order, then its captured cost-conflict reader asks the native queue source and the script's completed saving-reservation source for reservations. The latter read consumes the previous completed publication; it is distinct from the current candidate ordering and does not itself choose a candidate.

At p720, candidate order generation 90 put Quarry first (index 0, weight 300); the completed saving publication was still cycle 89 and targeted Farm at 27 Lumber / 14 Stone. Quarry cost 50 Lumber / 10 Stone and stock was exactly 50 / 10. Housing remained ordering index 2, weight 100, at 23 Lumber. Both candidates were non-important and non-Knowledge. Native queues were empty, the captured reservation sources and holdings were available, and no competing script claim was present.

The test-only adapter intercepts only Construction Build conflict reads. Its policy fails closed unless the exact Standard/Human fixture, pinned revision, seed 44, epoch, P36 stop, P38 authorization history, p720 owner cycle 90, ordering generation 90, publication 89, current Quarry candidate and price, Quarry-first ordering, generations, empty queue, sole Farm reservation, and current stocks all match. On the one qualified read, it replaces the local Farm saving-reservation view with Quarry's complete current 50 Lumber / 10 Stone price. It does not alter queues, Mech or other commitments, candidate ordering or weights, flags, player settings, affordability, Gather demand, or Research. Native same-target exclusion excludes Quarry's replacement from Quarry's own conflict calculation.

The experiment intentionally suspends Farm's established saving priority for that owner cycle. This is a test-only causal intervention, not a legitimate production Construction-owner decision. A/B are required to match until the first substituted read; after the owner cycle, the intervention releases and normal completed-publication behavior resumes. If any qualification fails, no reservation is substituted.

## Exact replay and purchase evidence

The existing P38/P40 exact Chromium harness ran three arms: A is retained P38 B with P41's correctness fix and no P42 substitution; B enables the single p720 substitution; B-repeat repeats B. All arms retained P36's 139 Gather actions and used 17 additional P38 Gather actions under its separate maximum of 18. P42 added no Gather clicks.

Before intervention, A/B and A/B-repeat matched at p719 for save, state, native invocation sequence, controls, and RNG. At the captured first-read boundary, all three arms had the same save hash (`f9527212da29a4af12d713675ab9a3bdceeeca7f4e6404c0c813c214f6e37a61`), 6,054 native invocations with the same digest, 16 control-usage entries with the same digest, 137 random calls, and RNG state 3167897891. The serialized boundary snapshot was 1,170,556 bytes. B and B-repeat matched at every recorded checkpoint, in P40/P42 traces, and in final export hash. There were no isolation failures.

The p720 Construction trace shows:

| Check                      | Native result                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Reservation before / after | Farm Saving 27 Lumber / 14 Stone → Quarry Saving 50 Lumber / 10 Stone                        |
| Quarry affordability       | Affordable at holdings 50 Lumber / 10 Stone                                                  |
| Cost conflict              | None; Quarry's own target was excluded                                                       |
| Build conflict gate        | Proceed via `no-conflict`                                                                    |
| Competition                | Selected Quarry at candidate index 0                                                         |
| Native action              | `city-rock_quarry.action` invoked by the ordinary executor                                   |
| Postcondition              | Native result `ok`; Quarry count 0 → 1; verified built, not queued                           |
| Debit                      | 50 Lumber and 10 Stone; both stocks fell to 0                                                |
| Housing                    | Evaluated later in the same cycle at index 2; unaffordable after the debit and not purchased |
| New completed publication  | Native post-Construction publication targeted Quarry's next price, 68 Lumber / 14 Stone      |

No Quarry purchase method was called directly. The executor's native action and observed count/debit postcondition establish the purchase.

## Ordinary Jobs and economy

After purchase, the native Jobs catalog showed Quarry Worker unlocked and managed, its setting enabled, and auto-Jobs enabled. The p720 state had population 4, housing capacity 4, two Farmers, and two Quarry Workers. The observed Farmer row had minimum 2, no finite maximum, and smart maximum 2. The Quarry Worker row had no minimum, no finite maximum, and effectively unbounded smart maximum; its observed split breakpoints were 4 / 10 / 0. The captured Quarry Worker setting breakpoints were 4 / 10 / 0. The separate worker-commitment registry was not exposed by the captured Jobs API.

| Period | Farmers / Quarry Workers | Food output / consumption | Food stock |  Stone output / stock | Starved / deaths |
| -----: | -----------------------: | ------------------------: | ---------: | --------------------: | ---------------: |
|    720 |                    2 / 2 |                 5.316 / 4 |    158.178 |                 0 / 0 |            0 / 0 |
|    728 |                    2 / 2 |                 3.348 / 4 |    156.874 |             2 / 4.080 |            0 / 0 |
|  1,000 |                    2 / 2 |                 3.348 / 4 |    117.091 |           2 / 142.514 |            0 / 0 |
|  2,000 |                    2 / 2 |                 4.015 / 6 |     43.398 |           2 / 381.723 |            2 / 0 |
|  4,000 |                    2 / 2 |                 4.681 / 8 |     34.901 | 2 / 600 (at capacity) |           10 / 0 |
|  5,000 |                    4 / 0 |                 6.649 / 8 |     38.982 |               0 / 600 |           12 / 0 |
| 10,000 |                    4 / 0 |                 6.649 / 8 |     46.609 |               0 / 600 |           26 / 0 |

There were 45 post-purchase checkpoints through p10000. The first negative Food production margin was p728 (-0.652 per tick); observed sampled margins stayed negative through p10000. Food stock remained positive at the recorded checkpoints, but that stock did not make production sustainable: starvation first appeared at p2000 and rose to 26 by p10000. Deaths remained zero. Ordinary Jobs later moved all four residents to Farmer by p5000, but Food flow was still negative (-1.351 per tick) and Quarry Worker count and Stone output were then zero. The native Jobs progression did not correct the Food deficit.

P39's pure hypothetical plan predicted 2 Farmers / 2 Quarry Workers and already calculated Food output 3.348 versus consumption 4 (-0.652). The actual first post-purchase Jobs state matched that split and the subsequent native Food margin matched the formula. Later Jobs state diverged to 4 / 0. The hypothetical constrained 3 Farmer / 1 Quarry Worker alternative remains conditional: it exceeds the observed Farmer smart maximum and assumes an empty worker-commitment set.

P37 received the observed terminal state and production; P39 received the first native post-purchase Jobs capture. P39's strict Jobs assessment remains unavailable because same-cycle worker-commitment evidence is missing. The cross-owner diagnostic also has no compatible complete spending reservation, and test-authorized Gather plus the experimental priority change confer no production or spending authority. Quarry ownership, initial worker assignment, and positive Stone output are observed facts; sustainable production is not established.

## Instrumentation, regressions, and validation

Instrumentation is test-only esbuild transformation of the captured Construction and cost-conflict modules. No production runtime callback was added. P42 recorded at most 64 events / 524,288 trace bytes and bounded the pre-boundary payload to 2 MiB; this replay used 2,058 trace bytes and a 1,170,556-byte boundary payload. P42 added no native calls, no extra price reads, and no additional reservation-source reads. It made 2 root resource-amount reads, 2 owner-authority reads, and 6 diagnostic-clock reads. The native monotonic diagnostic clock measured about 10.8 ms synchronous P42 work and about 0.9 ms trace elapsed time. These measurements do **not** establish the 2% renderer CPU gate.

Focused regressions cover wrong fixture/authorization, period, work/order generation, publication, current candidate, repricing, reservation, stock, authority generation, unavailable or competing sources, same-target exclusion, no substitution outside the window, and idempotent release. The exact B-repeat also verifies replay determinism. No debug exposure, tab preload, Workers, direct resource edit, forced purchase, Gather action, or generic allocator was used.

Verification: focused P42 tests, exact Chromium A/B/B-repeat replay, Chromium runner contracts, ordinary build, full `npm run check`, and `git diff --check`. The renderer CPU percentage gate is not claimed.
