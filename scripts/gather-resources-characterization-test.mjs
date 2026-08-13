import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const jquery = () => ({ ready() {} });
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
  $: jquery,
});

assert.equal(typeof hooks.autoGatherResources, "function");

const actions = [];
const clickable = new Set(["Food", "Lumber", "Slaughter"]);
const buildings = Object.fromEntries(
  ["Food", "Lumber", "Stone", "Chrysotile", "Slaughter"].map((id) => [
    id,
    { isClickable: () => clickable.has(id), count: 0 },
  ]),
);
buildings.RockQuarry = { count: 0 };
const game = {
  global: {
    race: { soul_eater: true },
    tech: { conjuring: 2, primitive: 1 },
    settings: { at: false },
  },
  actions: {
    city: Object.fromEntries(
      ["food", "lumber", "stone", "chrysotile", "slaughter"].map((id) => [
        id,
        { action: () => actions.push(id) },
      ]),
    ),
  },
};
hooks.setAutomationTestContext({ game, win: { document: {} } });
hooks.setWave2TestContext({
  buildings,
  getResourcesPerClick: () => 2,
});
Object.assign(hooks.automationSettings, {
  buildingAlwaysClick: true,
  buildingClickPerTick: 3,
});
Object.assign(hooks.automationResources, {
  Population: { currentQuantity: 0 },
  Food: { currentQuantity: 0, maxQuantity: 100 },
  Lumber: { currentQuantity: 0, maxQuantity: 100 },
  Stone: { currentQuantity: 0, maxQuantity: 10 },
  Chrysotile: { currentQuantity: 0, maxQuantity: 10 },
  Furs: { currentQuantity: 5, maxQuantity: 10, isUnlocked: () => true },
  Mana: { currentQuantity: 4 },
});

hooks.autoGatherResources();
assert.deepEqual(actions, [
  "food",
  "food",
  "food",
  "lumber",
  "slaughter",
  "slaughter",
  "slaughter",
]);
assert.deepEqual(
  {
    Food: hooks.automationResources.Food.currentQuantity,
    Lumber: hooks.automationResources.Lumber.currentQuantity,
    Furs: hooks.automationResources.Furs.currentQuantity,
    Mana: hooks.automationResources.Mana.currentQuantity,
  },
  { Food: 12, Lumber: 8, Furs: 10, Mana: 0 },
);

actions.length = 0;
hooks.automationSettings.buildingAlwaysClick = false;
hooks.automationResources.Population.currentQuantity = 16;
buildings.RockQuarry.count = 1;
hooks.autoGatherResources();
assert.deepEqual(actions, []);

console.log("Gather resources bundled characterization tests passed");
