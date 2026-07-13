import assert from "node:assert/strict";

import { createPlanetGeneration } from "../src/game/planet-generation.ts";

let game = {
  global: {
    race: { seed: 12345, probes: 1, universe: "standard" },
    stats: { portals: 0, achieve: {} },
    custom: { planet: {} },
  },
};
let unlocked = false;
const generator = createPlanetGeneration({
  getGame: () => game,
  getPoly: () => ({ universeAffix: (universe) => universe }),
  getIsAchievementUnlocked: () => () => unlocked,
  universes: ["standard"],
});

assert.equal(generator.generatePlanets()[0].id, "Grassland7204");

game = {
  global: {
    race: { seed: 20, probes: 1, universe: "evil" },
    stats: { portals: 1, achieve: { lamentis: { l: 4 } } },
    custom: {
      planet: {
        standard: {
          s: {
            biome: "eden",
            traitlist: ["mellow"],
            orbit: 777,
            geology: { Iridium: 0.5 },
          },
        },
      },
    },
  },
};
unlocked = true;
assert.deepEqual(generator.generatePlanets()[0], {
  biome: "eden",
  traits: ["mellow"],
  orbit: 777,
  geology: { Iridium: 0.5 },
  id: "Eden4573",
});

console.log("Planet generation module tests passed");
