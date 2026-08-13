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

assert.equal(typeof hooks.setScriptDataTestContext, "function");
assert.equal(typeof hooks.scriptDataLifecycle?.updateScriptData, "function");
assert.equal(typeof hooks.scriptDataLifecycle?.finalizeScriptData, "function");

const trace = [];
const resource = (id, extra = {}) => ({
  id,
  rateOfChange: 0,
  rateMods: {},
  updateData: () => trace.push(`update:${id}`),
  finalizeData: () => trace.push(`finalize:${id}`),
  isUnlocked: () => true,
  ...extra,
});
const resources = {
  Money: resource("Money", {
    rateOfChange: 10,
    currentQuantity: 50,
    maxQuantity: 100,
  }),
  Mana: resource("Mana"),
  Population: resource("Population", { currentQuantity: 100 }),
  Food: resource("Food"),
  Lumber: resource("Lumber"),
  Stone: resource("Stone"),
  Chrysotile: resource("Chrysotile"),
  Furs: resource("Furs"),
};
const clickable = () => ({ isClickable: () => true });
const settings = {
  autoMarket: true,
  autoPylon: true,
  buildingAlwaysClick: true,
  autoBuild: false,
  buildingClickPerTick: 2,
};
const state = { globalProductionModifier: 99 };
const game = {
  breakdown: {
    p: {
      Global: { first: "10", second: "-5", ignored: "bad" },
      consume: { Money: { Trade: -5 } },
    },
  },
  global: { race: { soul_eater: true } },
};
const manager = (name, method) => ({
  [method]: () => trace.push(`${name}:${method}`),
});
const ritualSpells = {
  active: { isUnlocked: () => true, id: "active" },
  locked: { isUnlocked: () => false, id: "locked" },
};
hooks.setScriptDataTestContext({
  settings,
  state,
  game,
  resources,
  buildings: {
    RockQuarry: { count: 1 },
    Food: clickable(),
    Lumber: clickable(),
    Stone: clickable(),
    Chrysotile: clickable(),
    Slaughter: clickable(),
  },
  WarManager: {
    updateGarrison: () => trace.push("war:garrison"),
    updateHell: () => trace.push("war:hell"),
  },
  MarketManager: manager("market", "updateData"),
  BuildingManager: manager("building", "updateBuildings"),
  SpyManager: manager("spy", "updateForeigns"),
  EjectManager: manager("eject", "updateResources"),
  SupplyManager: manager("supply", "updateResources"),
  NaniteManager: manager("nanite", "updateResources"),
  RitualManager: {
    Productions: ritualSpells,
    initIndustry: () => true,
    spellCost: (spell) => (spell.id === "active" ? 7 : 100),
  },
  actions: {
    updateCraftCost: () => trace.push("craft:update"),
    getResourcesPerClick: () => 3,
    ticksPerSecond: () => 2,
    haveTech: (id, level) =>
      (id === "conjuring" && level === 2) ||
      (id === "primitive" && level === 2),
  },
});

hooks.scriptDataLifecycle.updateScriptData();
assert.deepEqual(trace.slice(0, 13), [
  "war:garrison",
  "war:hell",
  "update:Money",
  "update:Mana",
  "update:Population",
  "update:Food",
  "update:Lumber",
  "update:Stone",
  "update:Chrysotile",
  "update:Furs",
  "craft:update",
  "market:updateData",
  "building:updateBuildings",
]);
assert.equal(state.globalProductionModifier, 1.045);

trace.length = 0;
hooks.scriptDataLifecycle.finalizeScriptData();
assert.deepEqual(trace, [
  "spy:updateForeigns",
  "finalize:Money",
  "finalize:Mana",
  "finalize:Population",
  "finalize:Food",
  "finalize:Lumber",
  "finalize:Stone",
  "finalize:Chrysotile",
  "finalize:Furs",
  "eject:updateResources",
  "supply:updateResources",
  "nanite:updateResources",
]);
assert.deepEqual({ ...resources.Money.rateMods }, { sell: 5 });
assert.equal(resources.Money.rateOfChange, 15);
assert.equal(resources.Mana.rateOfChange, 7);
assert.equal(resources.Food.rateOfChange, 132);
assert.equal(resources.Lumber.rateOfChange, 132);
assert.equal(resources.Stone.rateOfChange, 120);
assert.equal(resources.Chrysotile.rateOfChange, 120);
assert.equal(resources.Furs.rateOfChange, 12);

console.log("Script data bundled characterization tests passed");
