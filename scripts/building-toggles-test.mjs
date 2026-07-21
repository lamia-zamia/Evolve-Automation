import assert from "node:assert/strict";

import { createBuildingToggleBrowserAdapter } from "../src/adapters/browser/building-toggles.ts";
import { createBuildingToggleEvolveAdapter } from "../src/adapters/evolve/building-toggles.ts";

const reader = createBuildingToggleEvolveAdapter({
  getBuildingManager: () => ({
    priorityList: [{ _vueBinding: "city1" }, { _vueBinding: "missing" }],
  }),
  getSettings: () => ({ showSettings: true }),
  getSettingsRaw: () => ({ batcity1: true }),
});
assert.equal(reader.readVisible(), true);
assert.deepEqual(reader.readItems(), [
  { binding: "city1", settingKey: "batcity1", enabled: true },
  { binding: "missing", settingKey: "batmissing", enabled: false },
]);

const malformedReader = createBuildingToggleEvolveAdapter({
  getBuildingManager: () => ({ priorityList: [{ _vueBinding: 42 }] }),
  getSettings: () => ({ showSettings: true }),
  getSettingsRaw: () => ({}),
});
assert.throws(
  () => malformedReader.readItems(),
  /priorityList\[0\]._vueBinding.*string/,
);

const trace = [];
const selectorLengths = new Map([
  ["#mTabCivil .ea-building-toggle", 1],
  ["#city1", 1],
  ["#missing", 0],
]);
function node(selector) {
  return {
    selector,
    length: selectorLengths.get(selector) ?? 1,
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
  { binding: "city1", settingKey: "batcity1", enabled: true },
  { binding: "missing", settingKey: "batmissing", enabled: false },
];
const counts = [];
const browserAdapter = createBuildingToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader: {
    readVisible: () => true,
    readItems: () => items,
  },
  getCountWriter: () => ({ setCount: (count) => counts.push(count) }),
  addToggleCallbacks: (toggle, settingKey) => {
    trace.push({ kind: "toggle", settingKey, toggle });
    return toggle;
  },
});

browserAdapter.createBuildingToggles();
const checkedToggle = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "batcity1",
).toggle;
assert.match(checkedToggle.selector, /script_batcity1/);
assert.match(checkedToggle.selector, /type="checkbox" checked\/>/);
assert.deepEqual(
  trace
    .filter((entry) => entry.kind === "toggle")
    .map((entry) => entry.settingKey),
  ["batcity1"],
);
assert.deepEqual(counts, [0, 1]);

trace.length = 0;
counts.length = 0;
browserAdapter.removeBuildingToggles();
assert.deepEqual(trace, [
  { kind: "remove", selector: "#mTabCivil .ea-building-toggle" },
]);
assert.deepEqual(counts, [0]);

const hiddenAdapter = createBuildingToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader: {
    readVisible: () => false,
    readItems: () => {
      throw new Error("hidden building toggles must not read items");
    },
  },
  getCountWriter: () => ({ setCount: (count) => counts.push(count) }),
  addToggleCallbacks: () => {
    throw new Error("hidden building toggles must not add controls");
  },
});
counts.length = 0;
hiddenAdapter.createBuildingToggles();
assert.deepEqual(counts, [0]);

console.log("Building toggles browser and Evolve adapter tests passed");
