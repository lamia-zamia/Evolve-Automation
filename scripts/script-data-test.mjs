import assert from "node:assert/strict";

import { createScriptDataLifecycle } from "../src/game/script-data.ts";

const trace = [];
const makeResource = (id) => ({
  rateOfChange: 0,
  rateMods: {},
  currentQuantity: 100,
  updateData: () => trace.push(`update:${id}`),
  finalizeData: () => trace.push(`finalize:${id}`),
  isUnlocked: () => false,
});
const ids = [
  "Money",
  "Mana",
  "Population",
  "Food",
  "Lumber",
  "Stone",
  "Chrysotile",
  "Furs",
];
let resources = Object.fromEntries(ids.map((id) => [id, makeResource(id)]));
let game = {
  breakdown: { p: { Global: { bonus: "25" }, consume: {} } },
  global: { race: {} },
};
const settings = {
  autoMarket: false,
  autoPylon: false,
  buildingAlwaysClick: false,
  autoBuild: false,
  buildingClickPerTick: 1,
};
const state = { globalProductionModifier: 0 };
const noClick = { isClickable: () => false };
const lifecycle = createScriptDataLifecycle({
  getSettings: () => settings,
  getState: () => state,
  getGame: () => game,
  getResources: () => resources,
  getBuildings: () => ({
    RockQuarry: { count: 1 },
    Food: noClick,
    Lumber: noClick,
    Stone: noClick,
    Chrysotile: noClick,
    Slaughter: noClick,
  }),
  getWarManager: () => ({
    updateGarrison: () => trace.push("garrison"),
    updateHell: () => trace.push("hell"),
  }),
  getMarketManager: () => ({ updateData: () => trace.push("market") }),
  getBuildingManager: () => ({
    updateBuildings: () => trace.push("buildings"),
  }),
  getSpyManager: () => ({ updateForeigns: () => trace.push("spies") }),
  getEjectManager: () => ({ updateResources: () => trace.push("eject") }),
  getSupplyManager: () => ({ updateResources: () => trace.push("supply") }),
  getNaniteManager: () => ({ updateResources: () => trace.push("nanite") }),
  getRitualManager: () => ({
    Productions: {},
    initIndustry: () => false,
    spellCost: () => 0,
  }),
  getUpdateCraftCost: () => () => trace.push("craft"),
  getResourcesPerClick: () => () => 1,
  getTicksPerSecond: () => () => 1,
  getHaveTech: () => () => false,
});

lifecycle.updateScriptData();
assert.equal(state.globalProductionModifier, 1.25);
assert.deepEqual(trace.slice(0, 2), ["garrison", "hell"]);

trace.length = 0;
resources = Object.fromEntries(
  ids.map((id) => [id, makeResource(`replacement-${id}`)]),
);
game = {
  breakdown: { p: { Global: {}, consume: {} } },
  global: { race: {} },
};
lifecycle.finalizeScriptData();
assert.equal(trace[0], "spies");
assert.ok(trace.includes("finalize:replacement-Money"));
assert.deepEqual(trace.slice(-3), ["eject", "supply", "nanite"]);

console.log("Script data module tests passed");
