/**
 * The pinned `shipCrewSize()` compatibility transcription, and the snapshot it is pinned to.
 *
 * Two separate questions. The first is what the transcription answers for each hull, including the
 * high-population scaling the game applies on top and the Grenadier requirement, which upstream
 * gates on truthiness rather than on a boolean. The second is whether it still corresponds to the
 * game this repository is pinned to: `shipCrewSize` is read back out of
 * `test-artifacts/game/evolve-deadspace.js` with a brace-aware extractor and the hull table is
 * compared against it, so an upstream change to a crew requirement fails here instead of silently
 * leaving a stale number in production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { capturedShipCrewSize } from "../src/adapters/evolve/combat/captured-ship-crew-compat.ts";
import { extractSnapshotFunction } from "./snapshot-function-fixture.mjs";

const SNAPSHOT = new URL(
  "../test-artifacts/game/evolve-deadspace.js",
  import.meta.url,
);

/** A save with no high-population trait, so `jobStack` is the identity the game uses. */
function root(race = {}) {
  return { race: { species: "human", ...race } };
}

// ---------------------------------------------------------------------------
// Every hull the pinned snapshot gives a crew requirement.
// ---------------------------------------------------------------------------

const HULLS = [
  ["corvette", 2, 1],
  ["frigate", 3, 2],
  ["destroyer", 4, 3],
  ["corsair", 4, 3],
  ["cruiser", 6, 4],
  ["battlecruiser", 8, 5],
  ["dreadnought", 10, 6],
  ["explorer", 10, 6],
  ["freighter", 1, 1],
  ["supply_ship", 1, 1],
];

for (const [hull, ordinary, grenadier] of HULLS) {
  assert.equal(
    capturedShipCrewSize(root(), hull),
    ordinary,
    `${hull} crews ${ordinary} ordinarily`,
  );
  assert.equal(
    capturedShipCrewSize(root({ grenadier: true }), hull),
    grenadier,
    `${hull} crews ${grenadier} under Grenadier`,
  );
}

// Upstream writes `global.race['grenadier'] ? … : …`, so any truthy value takes the reduced
// requirement and the race field is not guaranteed to be a boolean.
for (const value of [1, "yes", {}, []]) {
  assert.equal(
    capturedShipCrewSize(root({ grenadier: value }), "dreadnought"),
    6,
  );
}
// And a missing or false one is the ordinary requirement.
for (const value of [undefined, false, 0, ""]) {
  assert.equal(
    capturedShipCrewSize(root({ grenadier: value }), "dreadnought"),
    10,
  );
}

// `jobStack(num)` is `Math.round(num * traits.high_pop.vars()[0])` on a high-population run, and the
// game rounds the product rather than the multiplier: a genus rank 1 scales jobs fourfold and a rank
// 2 sevenfold, so a supply ship's single person becomes four or seven.
assert.equal(capturedShipCrewSize(root({ high_pop: 1 }), "corvette"), 8);
assert.equal(capturedShipCrewSize(root({ high_pop: 1 }), "dreadnought"), 40);
assert.equal(capturedShipCrewSize(root({ high_pop: 1 }), "supply_ship"), 4);
assert.equal(capturedShipCrewSize(root({ high_pop: 2 }), "corvette"), 14);
assert.equal(capturedShipCrewSize(root({ high_pop: 2 }), "supply_ship"), 7);
// Grenadier and the scale compose, as they do upstream: `jobStack(grenadier ? n-1 : n)`.
assert.equal(
  capturedShipCrewSize(root({ high_pop: 1, grenadier: true }), "dreadnought"),
  24,
);
// A high-population rank this save cannot resolve is an unavailable scale, not an unscaled crew count.
assert.equal(
  capturedShipCrewSize(root({ high_pop: 9 }), "corvette"),
  undefined,
);
assert.equal(capturedShipCrewSize(root({ high_pop: false }), "corvette"), 2);

// A hull upstream has since added, and a job scale this save cannot resolve, are both unavailable
// answers rather than exceptions thrown out of ordinary planning.
assert.equal(capturedShipCrewSize(root(), "battleship"), undefined);
assert.equal(capturedShipCrewSize(root(), ""), undefined);
// A root with no `race` is not an unreadable job scale: `jobScale` reads `global.race['high_pop']`,
// and an absent one is the game's own "not high population", so the hull's ordinary requirement
// stands.
assert.equal(capturedShipCrewSize(undefined, "corvette"), 2);
assert.equal(capturedShipCrewSize({}, "corvette"), 2);

// ---------------------------------------------------------------------------
// The snapshot this transcription is pinned to.
// ---------------------------------------------------------------------------

/**
 * Every crew requirement in the snapshot's own `shipCrewSize`, keyed by hull.
 *
 * Read one `return` at a time, carrying back the `case` labels it answers — which is how a run of
 * labels sharing one answer (`destroyer` and `corsair`) is read as it is written, rather than as a
 * label with no answer of its own. `return global.race["grenadier"] ? jobStack(a) : jobStack(b);` is
 * an ordinary hull; a bare `return jobStack(a);` is one upstream gives no branch at all.
 */
function snapshotCrewRequirements(source) {
  const body = extractSnapshotFunction(source, "shipCrewSize");
  const requirements = new Map();
  let previous = 0;
  for (const statement of body.matchAll(/return[^;]+;/g)) {
    const hulls = [
      ...body.slice(previous, statement.index).matchAll(/case "([a-z_]+)":/g),
    ].map((label) => label[1]);
    previous = statement.index + statement[0].length;
    if (hulls.length === 0) continue;
    const branched = statement[0].match(
      /grenadier"?\]\s*\?\s*jobStack\((\d+)\)\s*:\s*jobStack\((\d+)\)/,
    );
    let requirement;
    if (branched !== null) {
      requirement = {
        crew: Number(branched[2]),
        grenadier: Number(branched[1]),
      };
    } else {
      const single = statement[0].match(/jobStack\((\d+)\)/);
      assert.ok(
        single !== null,
        `shipCrewSize's ${hulls.join(", ")} is shaped unexpectedly`,
      );
      requirement = {
        crew: Number(single[1]),
        grenadier: Number(single[1]),
      };
    }
    for (const hull of hulls) requirements.set(hull, requirement);
  }
  assert.ok(
    requirements.size > 0,
    "the snapshot's shipCrewSize answers nothing",
  );
  return requirements;
}

const snapshotPath = fileURLToPath(SNAPSHOT);
const snapshot = readFileSync(snapshotPath, "utf8");
const snapshotSidecar = JSON.parse(
  readFileSync(`${snapshotPath}.json`, "utf8"),
);
// The sidecar records `<abbrev> <subject>`, and the snapshot is what the transcription is pinned to —
// so this is the commit that must be named here for a drift failure to be actionable. A short form
// still identifies it through the subject beside it.
const pinnedCommit = String(snapshotSidecar.commit).trim();
assert.match(
  pinnedCommit,
  /^[0-9a-f]{7,40} \S/,
  "the game snapshot has no resolved commit to pin to",
);

const pinned = snapshotCrewRequirements(snapshot);
assert.deepEqual(
  [...pinned.keys()].sort(),
  HULLS.map(([hull]) => hull).sort(),
  "the snapshot's shipCrewSize no longer covers exactly the hulls this script transcribes",
);
for (const [hull, requirement] of pinned) {
  const expected = HULLS.find(([name]) => name === hull);
  assert.deepEqual(
    requirement,
    { crew: expected[1], grenadier: expected[2] },
    `the snapshot's ${hull} crew requirement no longer matches the transcription`,
  );
}

console.log(
  `Captured ship crew compatibility tests passed (pinned to ${pinnedCommit})`,
);
