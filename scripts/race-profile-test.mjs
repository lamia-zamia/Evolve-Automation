import assert from "node:assert/strict";

import { createRaceProfile } from "../src/game/race-profile.ts";

let game = {
  global: {
    race: { species: "human", carnivore: true },
    civic: { govern: { type: "democracy" } },
  },
};
let highPop = 1;

const profile = createRaceProfile({
  getGame: () => game,
  getTraitVal: () => () => highPop,
});

assert.equal(profile.isHungryRace(), true);
assert.equal(profile.isDemonRace(), undefined);
assert.equal(profile.isLumberRace(), true);
assert.equal(profile.getOccCosts(), 20);

game = {
  global: {
    race: { species: "human" },
    civic: {},
  },
};
assert.equal(
  profile.getOccCosts(),
  20,
  "fresh games use the non-federation occupation-cost fallback",
);

game = {
  global: {
    race: { species: "balorg", soul_eater: true, evil: true, smoldering: true },
    civic: { govern: { type: "federation" } },
  },
};
highPop = 1.5;
assert.equal(profile.isHungryRace(), undefined);
assert.equal(profile.isDemonRace(), true);
assert.equal(profile.isLumberRace(), false);
assert.equal(profile.getOccCosts(), 22.5);

console.log("Race profile module tests passed");
