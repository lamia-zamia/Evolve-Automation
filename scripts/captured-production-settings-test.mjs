import assert from "node:assert/strict";

import { readProduction } from "../src/adapters/evolve/captured-settings-defaults.ts";
import {
  readCapturedFactoryRows,
  readCapturedFoundryRows,
  readCapturedMiningDroidRows,
  readCapturedReplicatorRows,
  readCapturedSmelterFuelRows,
} from "../src/adapters/evolve/economy/production/captured-production-settings-catalog.ts";
import { createCapturedProductionSettingsAdapter } from "../src/adapters/evolve/economy/production/captured-production-settings.ts";
import {
  ALWAYS_TRUE_OVERRIDE,
  createCapturedRootState,
  createRecordSettingsLifecycle,
} from "./test-support/captured-settings.mjs";

function makeCapturedGame() {
  const root = {
    resource: {
      Oil: { title: "Oil" },
      Coal: { title: "Coal" },
      Lumber: { title: "Lumber" },
      Plywood: { title: "Plywood" },
      Brick: { title: "Brick" },
      Wrought_Iron: { title: "Wrought Iron" },
      Sheet_Metal: { title: "Sheet Metal" },
      Mythril: { title: "Mythril" },
      Aerogel: { title: "Aerogel" },
      Nanoweave: { title: "Nanoweave" },
      Scarletite: { title: "Scarletite" },
      Quantium: { title: "Quantium" },
      Money: { title: "Money" },
      Furs: { title: "Furs" },
      Alloy: { title: "Alloy" },
      Polymer: { title: "Polymer" },
      Nano_Tube: { title: "Nano Tube" },
      Stanene: { title: "Stanene" },
      Adamantite: { title: "Adamantite" },
      Uranium: { title: "Uranium" },
      Aluminium: { title: "Aluminium" },
      Food: { title: "Food", amount: 10, max: 100, diff: 1, display: true },
      Stone: { title: "Stone" },
    },
  };
  const rootState = createCapturedRootState(() => root);
  return { root, rootState };
}

const game = makeCapturedGame();

// The table and the lifecycle defaults share one catalog per list.
const context = readProduction(game.root);
assert.deepEqual(context.smelterFuelIds, [
  "Oil",
  "Coal",
  "Wood",
  "Inferno",
  "Super",
]);
assert.deepEqual(context.factoryResourceIdByKey, {
  LuxuryGoods: "Money",
  Furs: "Furs",
  Alloy: "Alloy",
  Polymer: "Polymer",
  NanoTube: "Nano_Tube",
  Stanene: "Stanene",
});
assert.deepEqual(context.replicatorProductionIds, [
  "Oil",
  "Coal",
  "Lumber",
  "Plywood",
  "Brick",
  "Wrought_Iron",
  "Sheet_Metal",
  "Mythril",
  "Aerogel",
  "Nanoweave",
  "Scarletite",
  "Furs",
  "Alloy",
  "Polymer",
  "Nano_Tube",
  "Stanene",
  "Adamantite",
  "Uranium",
  "Aluminium",
  "Food",
  "Stone",
]);
assert.deepEqual(
  readCapturedSmelterFuelRows(() => ({})).map((row) => [row.id, row.label]),
  [
    ["Oil", "Oil"],
    ["Coal", "Coal"],
    ["Wood", "Wood"],
    ["Inferno", "Inferno"],
    ["Super", "Super"],
  ],
);
assert.deepEqual(
  readCapturedFoundryRows(game.rootState).map((row) => [
    row.id,
    row.label,
    row.managed,
  ]),
  [
    ["Plywood", "Plywood", false],
    ["Brick", "Brick", false],
    ["Wrought_Iron", "Wrought Iron", false],
    ["Sheet_Metal", "Sheet Metal", false],
    ["Mythril", "Mythril", false],
    ["Aerogel", "Aerogel", false],
    ["Nanoweave", "Nanoweave", false],
    ["Scarletite", "Scarletite", true],
    ["Quantium", "Quantium", true],
  ],
);
assert.deepEqual(
  readCapturedFactoryRows(game.rootState).map((row) => [row.id, row.label]),
  [
    ["Money", "Money"],
    ["Furs", "Furs"],
    ["Alloy", "Alloy"],
    ["Polymer", "Polymer"],
    ["Nano_Tube", "Nano Tube"],
    ["Stanene", "Stanene"],
  ],
);
assert.deepEqual(
  readCapturedMiningDroidRows(game.rootState).map((row) => row.id),
  ["Adamantite", "Uranium", "Coal", "Aluminium"],
);
assert.deepEqual(
  readCapturedReplicatorRows(game.rootState).map((row) => row.id),
  [
    "Oil",
    "Coal",
    "Lumber",
    "Plywood",
    "Brick",
    "Wrought_Iron",
    "Sheet_Metal",
    "Mythril",
    "Aerogel",
    "Nanoweave",
    "Scarletite",
    "Furs",
    "Alloy",
    "Polymer",
    "Nano_Tube",
    "Stanene",
    "Adamantite",
    "Uranium",
    "Aluminium",
    "Food",
    "Stone",
  ],
);

const raw = {
  smelter_fuel_p_Oil: 2,
  smelter_fuel_p_Coal: 0,
  craftPlywood: false,
  job_Brick: true,
  overrides: {
    craftPlywood: ALWAYS_TRUE_OVERRIDE,
    production_Furs: ALWAYS_TRUE_OVERRIDE,
    job_Brick: ALWAYS_TRUE_OVERRIDE,
    droid_w_Coal: ALWAYS_TRUE_OVERRIDE,
  },
};
const adapter = createCapturedProductionSettingsAdapter({
  rootState: game.rootState,
  getSettingsRaw: () => raw,
});

const model = adapter.readProductionSettingsReadModel();
assert.equal(model.sectionId, "production");
assert.equal(model.sectionName, "Production");
const focusControl = model.controls.find(
  (control) =>
    "settingName" in control &&
    control.settingName === "productionFactoryFocusMaterials",
);
assert.match(focusControl.hint, /120s \+ min materials/);
assert.deepEqual(
  model.smelterFuels.map((row) => row.id),
  ["Coal", "Oil", "Wood", "Inferno", "Super"],
);
assert.equal(model.foundryRows.length, 9);
assert.equal(
  model.foundryRows.find((row) => row.id === "Scarletite").managed,
  true,
);
assert.equal(model.factoryRows.length, 6);
assert.equal(model.miningDroidRows.length, 4);
assert.ok(model.replicatorRows.length > 0);

// Fuel priorities are raw-case on both ends: the automation honors them.
adapter.reorderSmelterFuels(["Super", "Oil", "not-a-fuel"]);
assert.equal(raw["smelter_fuel_p_Super"], 0);
assert.equal(raw["smelter_fuel_p_Oil"], 1);
assert.equal(raw["smelter_fuel_p_not-a-fuel"], undefined);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: game.rootState,
  controls: { resolve: () => undefined, capturedElementIds: () => [] },
});

sectionLifecycle.resetSection("production");
assert.deepEqual(
  {
    craft: raw["craftPlywood"],
    job: raw["job_Brick"],
    foundryWeight: raw["foundry_w_Sheet_Metal"],
    smelterPriority: raw["smelter_fuel_p_Oil"],
    factory: raw["production_Furs"],
    factoryWeight: raw["production_w_Alloy"],
    droidWeight: raw["droid_w_Coal"],
    replicator: raw["replicator_Food"],
    smelting: raw["productionSmelting"],
    autoSmelter: raw["autoSmelter"],
  },
  {
    craft: true,
    job: true,
    foundryWeight: 2,
    smelterPriority: 0,
    factory: true,
    factoryWeight: 1,
    droidWeight: 5,
    replicator: true,
    smelting: "required",
    autoSmelter: false,
  },
);
assert.deepEqual(raw["overrides"], {});

console.log("captured production settings ok");
