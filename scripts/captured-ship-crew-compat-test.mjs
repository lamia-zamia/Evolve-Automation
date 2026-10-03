/**
 * Characterizes hull crew requirements, Grenadier truthiness and high-population scaling
 * using repository-owned inputs.
 */
import assert from "node:assert/strict";

import { capturedShipCrewSize } from "../src/adapters/evolve/combat/captured-ship-crew-compat.ts";

/** A save with no high-population trait, so `jobStack` is the identity the game uses. */
function root(race = {}) {
  return { race: { species: "human", ...race } };
}

// ---------------------------------------------------------------------------
// Every supported hull crew requirement.
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

console.log("Captured ship crew compatibility tests passed");
