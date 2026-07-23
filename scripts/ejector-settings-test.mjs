import assert from "node:assert/strict";

import { createEjectorSettingsIntentHandler } from "../src/application/ejector-settings.ts";
import { createEjectorSettingsEvolveAdapter } from "../src/adapters/evolve/economy/resources/ejector-settings.ts";
import { createEjectorSettingsBrowserAdapter } from "../src/adapters/browser/ejector-settings.ts";

const iron = {
  id: "Iron",
  name: "Iron",
  atomicMass: 56,
  is: { tradable: true },
  isCraftable() {
    return this.id === "Elerium";
  },
};
const elerium = {
  id: "Elerium",
  name: "Elerium",
  atomicMass: 0,
  is: { tradable: false },
  isCraftable() {
    return this.id === "Elerium";
  },
};
const resources = { Iron: iron, Elerium: elerium };
const ejectManager = {
  Resources: ["Iron"],
  isConsumable(resource) {
    return this.Resources.includes(resource.id);
  },
};
const naniteManager = {
  Resources: ["Elerium"],
  isConsumable(resource) {
    return this.Resources.includes(resource.id);
  },
};
const supplyManager = {
  Resources: ["Iron"],
  Rates: { Iron: { out: 2, in: 3 } },
  isConsumable(resource) {
    return this.Resources.includes(resource.id);
  },
  supplyOut(id) {
    return this.Rates[id].out;
  },
  supplyIn(id) {
    return this.Rates[id].in;
  },
};

const reader = createEjectorSettingsEvolveAdapter({
  getResources: () => resources,
  getEjectManager: () => ejectManager,
  getNaniteManager: () => naniteManager,
  getSupplyManager: () => supplyManager,
  getSettingsRaw: () => ({ res_ejectIron: true, res_naniteElerium: true }),
});
const model = reader.read();
assert.equal(model.sectionId, "ejector");
assert.deepEqual(
  model.rows.map(
    ({ id, color, atomicMass, showEject, showNanite, showSupply }) => ({
      id,
      color,
      atomicMass,
      showEject,
      showNanite,
      showSupply,
    }),
  ),
  [
    {
      id: "Iron",
      color: "has-text-info",
      atomicMass: 56,
      showEject: true,
      showNanite: false,
      showSupply: true,
    },
    {
      id: "Elerium",
      color: "has-text-caution",
      atomicMass: 0,
      showEject: false,
      showNanite: true,
      showSupply: false,
    },
  ],
);
assert.equal(model.rows[0].supplyOut, "2");
assert.equal(model.rows[0].supplyIn, "3");

let section;
let tableToggles = [];
let intents = [];
let scroll = { documentElement: { scrollTop: 0 }, body: { scrollTop: 14 } };
function node() {
  return {
    empty() {
      return this;
    },
    off() {
      return this;
    },
    append() {
      return this;
    },
    next() {
      return this;
    },
  };
}
const actions = {
  buildSettingsSection(...args) {
    section = args;
  },
  addSettingsSelect(_node, key) {
    assert.ok(["ejectMode", "supplyMode", "naniteMode"].includes(key));
  },
  addSettingsToggle(_node, key) {
    assert.equal(key, "prestigeWhiteholeStabiliseMass");
  },
  addSettingsNumber(_node, key) {
    assert.equal(key, "prestigeWhiteholeStabiliseCooldown");
  },
  addTableToggle(_node, key) {
    tableToggles.push(key);
  },
  buildTableLabel(label, title, color) {
    assert.equal(title, "");
    assert.ok(label);
    assert.ok(color);
    return label;
  },
};
const browser = createEjectorSettingsBrowserAdapter({
  getDocument: () => scroll,
  getJQuery: () => node,
  reader,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});
browser.updateEjectorSettingsContent();
assert.deepEqual(tableToggles, [
  "res_ejectIron",
  "res_supplyIron",
  "res_naniteElerium",
]);
assert.equal(scroll.documentElement.scrollTop, 14);
browser.buildEjectorSettings();
assert.equal(section[0], "ejector");
section[2]();
assert.deepEqual(intents, [{ type: "reset-ejector-settings" }]);

const trace = [];
const handler = createEjectorSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckboxes: () => trace.push("checkboxes"),
    removeEjectToggles: () => trace.push("remove-eject"),
    removeSupplyToggles: () => trace.push("remove-supply"),
  },
});
handler.handle({ type: "reset-ejector-settings" });
assert.deepEqual(trace, [
  "reset",
  "persist",
  "render",
  "checkboxes",
  "remove-eject",
  "remove-supply",
]);

console.log(
  "Ejector settings domain, Evolve, browser, and application tests passed",
);
