import assert from "node:assert/strict";

import { createProductionSettingsBrowserAdapter } from "../src/adapters/browser/production-settings.ts";
import { createProductionSettingsEvolveAdapter } from "../src/adapters/evolve/economy/production/production-settings.ts";
import { createProductionSettingsIntentHandler } from "../src/application/production-settings.ts";

const tableSorter = {
  attach(_element, options) {
    sortableUpdate = options.onOrderChanged;
  },
  readOrder: () => [],
};

let settingsRaw = { overrides: {} };
let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 17 },
};
let resources = {
  Scarletite: { id: "Scarletite", name: "Scarletite" },
  Quantium: { id: "Quantium", name: "Quantium" },
};
let craftablesList = [
  { id: "Plywood", name: "Plywood" },
  resources.Scarletite,
  resources.Quantium,
];
let smelterManager = {
  managedFuelPriorityList: () => [{ id: "coal" }],
};
let factoryManager = {
  Productions: {
    Alloy: { resource: { id: "Alloy", name: "Alloy" } },
  },
};
let droidManager = {
  Productions: {
    Coal: { resource: { id: "Coal", name: "Coal" } },
  },
};
let replicatorManager = {
  Productions: {
    Iron: { id: "Iron", resource: { id: "Iron", name: "Iron" } },
  },
};
let sortableUpdate;
let sortableIds;
let sectionRegistration;
let trace = [];

function makeNode(label) {
  return {
    label,
    empty() {
      trace.push(`empty:${label}`);
      return this;
    },
    off(events) {
      trace.push(`off:${label}:${events}`);
      return this;
    },
    append(value) {
      trace.push(`append:${label}:${value?.label ?? value}`);
      return this;
    },
    next() {
      return makeNode(`${label}>next`);
    },
    0: "node",
  };
}

const evolveAdapter = createProductionSettingsEvolveAdapter({
  getResources: () => resources,
  getCraftablesList: () => craftablesList,
  getSmelterManager: () => smelterManager,
  getFactoryManager: () => factoryManager,
  getDroidManager: () => droidManager,
  getReplicatorManager: () => replicatorManager,
  getSettingsRaw: () => settingsRaw,
  consumptionBalanceTarget: 42,
});
let intents;
const productionSettings = createProductionSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (value) => makeNode(String(value)),
  getReadModel: () => evolveAdapter.readProductionSettingsReadModel(),
  intents: { handle: (intent) => intents.handle(intent) },
  buildSettingsSection: (...args) => {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsNumber: (_node, key) => trace.push(`number:${key}`),
  addSettingsToggle: (_node, key, _label, hint) =>
    trace.push(`toggle:${key}:${hint}`),
  addSettingsSelect: (_node, key, _label, _hint, options) =>
    trace.push(
      `select:${key}:${options.map((option) => option.val).join(",")}`,
    ),
  addStandardHeading: (_node, heading) => trace.push(`heading:${heading}`),
  addTableToggle: (_node, key) => trace.push(`tableToggle:${key}`),
  addTableInput: (_node, key) => trace.push(`tableInput:${key}`),
  buildTableLabel: (note) => ({ label: `label:${note}` }),
  getTableSorter: () => tableSorter,
});
intents = createProductionSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset:true"),
    persist: () => trace.push("persist"),
    reorderSmelterFuels: (fuelIds) =>
      evolveAdapter.reorderSmelterFuels(fuelIds),
  },
  renderSettingsContent: () =>
    productionSettings.updateProductionSettingsContent(),
  effects: {
    resetCheckboxes: () =>
      trace.push(
        "resetCheckbox:autoQuarry,autoMine,autoExtractor,autoGraphenePlant,autoSmelter,autoCraft,autoFactory,autoMiningDroid,autoReplicator",
      ),
    removeCraftToggles: () => trace.push("removeCraftToggles"),
  },
});

productionSettings.updateProductionSettingsContent();
const replicatorControl = evolveAdapter
  .readProductionSettingsReadModel()
  .controls.find(
    (control) => control.settingName === "replicatorWeightingMode",
  );
assert.equal(replicatorControl?.kind, "select");
assert.equal(
  replicatorControl?.options.find((option) => option.val === "legacy")?.hint,
  "Legacy mode, similar to previous script behavior. Only the resource with the lowest weighting is picked. If multiple resources have the same weighting then it will focus exclusively on one of those resources. This mode exists only to give you time to migrate your config to using the priority field.",
);
assert.deepEqual(
  trace.filter((entry) => entry.startsWith("heading:")),
  [
    "heading:Smelter",
    "heading:Foundry",
    "heading:Factory",
    "heading:Mining Droid",
    "heading:Replicator",
  ],
);
assert.ok(
  trace.includes(
    "toggle:productionFactoryFocusMaterials:Aggressively request stockpiling 42s + min materials worth of materials to ensure factory and craftsmen can always produce",
  ),
);
assert.ok(trace.includes("tableToggle:craftPlywood"));
assert.ok(trace.includes("tableInput:foundry_w_Plywood"));
assert.ok(!trace.includes("tableInput:foundry_w_Scarletite"));
assert.ok(!trace.includes("tableInput:foundry_w_Quantium"));
assert.ok(trace.includes("tableToggle:production_Alloy"));
assert.ok(trace.includes("tableInput:droid_pr_Coal"));
assert.ok(trace.includes("tableInput:replicator_p_Iron"));
assert.equal(document.documentElement.scrollTop, 17);
assert.equal(document.body.scrollTop, 17);

settingsRaw = { overrides: {} };
sortableIds = ["wood", "coal"];
sortableUpdate(sortableIds);
assert.equal(settingsRaw.smelter_fuel_p_wood, 0);
assert.equal(settingsRaw.smelter_fuel_p_coal, 1);
assert.equal(trace.at(-1), "persist");

factoryManager = {
  Productions: {
    Polymer: { resource: { id: "Polymer", name: "Polymer" } },
  },
};
trace = [];
productionSettings.updateProductionTableFactory(makeNode("factory-root"));
assert.ok(trace.includes("tableToggle:production_Polymer"));
assert.ok(!trace.includes("tableToggle:production_Alloy"));

trace = [];
productionSettings.updateProductionTableSmelter(makeNode("smelter-root"));

trace = [];
productionSettings.buildProductionSettings();
assert.deepEqual(trace, ["section:production:Production"]);
assert.equal(
  sectionRegistration[3],
  productionSettings.updateProductionSettingsContent,
);

trace = [];
sectionRegistration[2]();
assert.equal(trace[0], "reset:true");
assert.equal(trace[1], "persist");
assert.equal(
  trace.at(-2),
  "resetCheckbox:autoQuarry,autoMine,autoExtractor,autoGraphenePlant,autoSmelter,autoCraft,autoFactory,autoMiningDroid,autoReplicator",
);
assert.equal(trace.at(-1), "removeCraftToggles");

console.log("Production settings module tests passed");
