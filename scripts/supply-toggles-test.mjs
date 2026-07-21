import assert from "node:assert/strict";

import { createSupplyToggleBrowserAdapter } from "../src/adapters/browser/supply-toggles.ts";
import { createSupplyToggleEvolveAdapter } from "../src/adapters/evolve/supply-toggles.ts";

const reader = createSupplyToggleEvolveAdapter({
  getSupplyManager: () => ({ priorityList: [{ id: "Coal" }, { id: "Iron" }] }),
  getSettingsRaw: () => ({ res_supplyCoal: true }),
});
assert.deepEqual(reader.readItems(), [
  { resourceId: "Coal", settingKey: "res_supplyCoal", enabled: true },
  { resourceId: "Iron", settingKey: "res_supplyIron", enabled: false },
]);

const malformedReader = createSupplyToggleEvolveAdapter({
  getSupplyManager: () => ({ priorityList: [{ id: 42 }] }),
  getSettingsRaw: () => ({}),
});
assert.throws(
  () => malformedReader.readItems(),
  /priorityList\[0\]\.id.*string/,
);

const trace = [];
const nodeBySelector = new Map([
  ["#spireSupply", { length: 1 }],
  ["#supplyCoal", { length: 1 }],
  ["#supplyIron", { length: 1 }],
  ["#resCargo .ea-supply-toggle", { length: 1 }],
  ["#script_supply_top_row", { length: 1 }],
]);
function node(selector) {
  return {
    selector,
    length: nodeBySelector.get(selector)?.length ?? 1,
    append(content) {
      trace.push({ kind: "append", selector, content });
      return this;
    },
    remove() {
      trace.push({ kind: "remove", selector });
      return this;
    },
  };
}
const jquery = (selector) => node(String(selector));
const items = [
  { resourceId: "Coal", settingKey: "res_supplyCoal", enabled: true },
  { resourceId: "Iron", settingKey: "res_supplyIron", enabled: false },
];
const browserAdapter = createSupplyToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader: { readItems: () => items },
  addToggleCallbacks: (toggle, settingKey) => {
    trace.push({ kind: "toggle", settingKey, toggle });
    return toggle;
  },
});

browserAdapter.createSupplyToggles();
assert.deepEqual(
  trace
    .filter((entry) => entry.kind === "toggle")
    .map((entry) => entry.settingKey),
  ["res_supplyCoal", "res_supplyIron"],
);
const checkedMarkup = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "res_supplyCoal",
).toggle;
assert.match(checkedMarkup.selector, /script_res_supplyCoal/);
assert.match(checkedMarkup.selector, /type="checkbox" checked>/);
const uncheckedMarkup = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "res_supplyIron",
).toggle;
assert.match(uncheckedMarkup.selector, /script_res_supplyIron/);
assert.doesNotMatch(uncheckedMarkup.selector, /type="checkbox" checked>/);
assert.equal(trace.filter((entry) => entry.kind === "remove").length, 2);

trace.length = 0;
browserAdapter.removeSupplyToggles();
assert.deepEqual(trace, [
  { kind: "remove", selector: "#resCargo .ea-supply-toggle" },
  { kind: "remove", selector: "#script_supply_top_row" },
]);

console.log("Supply toggles browser and Evolve adapter tests passed");
