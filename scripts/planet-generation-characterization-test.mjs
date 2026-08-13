import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.generatePlanets, "function");
assert.equal(typeof hooks.setPlanetGenerationTestContext, "function");

function makeGame({
  seed,
  probes,
  universe = "standard",
  portals = 0,
  achieve = {},
  planet = {},
}) {
  return {
    global: {
      race: { seed, probes, universe },
      stats: { portals, achieve },
      custom: { planet },
    },
  };
}

function generate(game, isAchievementUnlocked = () => false) {
  hooks.setPlanetGenerationTestContext({
    game,
    poly: { universeAffix: (universe) => universe },
    isAchievementUnlocked,
  });
  return JSON.parse(JSON.stringify(hooks.generatePlanets()));
}

const standard = generate(makeGame({ seed: 12345, probes: 3 }));
const evil = generate(
  makeGame({
    seed: 9876,
    probes: 2,
    universe: "evil",
    portals: 1,
    achieve: { whitehole: { l: 2 } },
  }),
  () => true,
);
const custom = generate(
  makeGame({
    seed: 20,
    probes: 1,
    achieve: { lamentis: { l: 4 } },
    planet: {
      standard: {
        s: {
          biome: "oceanic",
          traitlist: ["stormy", "magnetic"],
          orbit: 444,
          geology: { Copper: 0.25 },
        },
      },
    },
  }),
);

assert.deepEqual(standard, [
  {
    biome: "grassland",
    traits: ["magnetic", "trashed"],
    orbit: 281,
    geology: {},
    id: "Grassland7204",
  },
  {
    biome: "grassland",
    traits: ["magnetic"],
    orbit: 385,
    geology: {},
    id: "Grassland6716",
  },
  {
    biome: "desert",
    traits: ["elliptical", "retrograde"],
    orbit: 361,
    geology: { Coal: 0, Iron: 0.14 },
    id: "Desert5867",
  },
]);
assert.deepEqual(evil, [
  {
    biome: "oceanic",
    traits: ["flare", "stormy"],
    orbit: 249,
    geology: { Oil: 0.05, Iridium: 0.21 },
    id: "Oceanic6984",
  },
  {
    biome: "forest",
    traits: ["permafrost", "trashed"],
    orbit: 335,
    geology: { Copper: 0.02, Uranium: 0.05 },
    id: "Forest2966",
  },
]);
assert.deepEqual(custom, [
  {
    biome: "oceanic",
    traits: ["stormy", "magnetic"],
    orbit: 444,
    geology: { Copper: 0.25 },
    id: "Oceanic4573",
  },
]);

console.log("Planet generation bundled characterization tests passed");
