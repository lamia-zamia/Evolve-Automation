import assert from "node:assert/strict";

import { createProductionSettings } from "../src/adapters/browser/production-settings.ts";

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
let sorterHelper = "sorter:first";
let sortableUpdate;
let sortableIds = ["coal"];
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
    sortable(arg) {
      if (typeof arg === "string") {
        return sortableIds;
      }
      sortableUpdate = arg.update;
      trace.push(`sortableHelper:${arg.helper}`);
      return this;
    },
  };
}

const productionSettings = createProductionSettings({
  getSettingsRaw: () => settingsRaw,
  getDocument: () => document,
  getJQuery: () => (value) => makeNode(String(value)),
  getResources: () => resources,
  getCraftablesList: () => craftablesList,
  getSmelterManager: () => smelterManager,
  getFactoryManager: () => factoryManager,
  getDroidManager: () => droidManager,
  getReplicatorManager: () => replicatorManager,
  consumptionBalanceTarget: 42,
  resetProductionSettings: (reset) => trace.push(`reset:${reset}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`resetCheckbox:${keys.join(",")}`),
  removeCraftToggles: () => trace.push("removeCraftToggles"),
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
  getSorterHelper: () => sorterHelper,
});

productionSettings.updateProductionSettingsContent();
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
assert.ok(trace.includes("sortableHelper:sorter:first"));
assert.equal(document.documentElement.scrollTop, 17);
assert.equal(document.body.scrollTop, 17);

settingsRaw = { overrides: {} };
sortableIds = ["wood", "coal"];
sortableUpdate();
assert.equal(settingsRaw.smelter_fuel_p_wood, 0);
assert.equal(settingsRaw.smelter_fuel_p_coal, 1);
assert.equal(trace.at(-1), "persist");

factoryManager = {
  Productions: {
    Polymer: { resource: { id: "Polymer", name: "Polymer" } },
  },
};
sorterHelper = "sorter:second";
trace = [];
productionSettings.updateProductionTableFactory(makeNode("factory-root"));
assert.ok(trace.includes("tableToggle:production_Polymer"));
assert.ok(!trace.includes("tableToggle:production_Alloy"));

trace = [];
productionSettings.updateProductionTableSmelter(makeNode("smelter-root"));
assert.ok(trace.includes("sortableHelper:sorter:second"));

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
