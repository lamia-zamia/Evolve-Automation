import assert from "node:assert/strict";

import { createEjectToggleBrowserAdapter } from "../src/adapters/browser/eject-toggles.ts";
import { createEjectToggleEvolveAdapter } from "../src/adapters/evolve/economy/resources/eject-toggles.ts";

const reader = createEjectToggleEvolveAdapter({
  getEjectManager: () => ({ priorityList: [{ id: "Iron" }, { id: "Copper" }] }),
  getSettingsRaw: () => ({ res_ejectIron: true }),
});
assert.deepEqual(reader.readItems(), [
  { resourceId: "Iron", settingKey: "res_ejectIron", enabled: true },
  { resourceId: "Copper", settingKey: "res_ejectCopper", enabled: false },
]);

const malformedReader = createEjectToggleEvolveAdapter({
  getEjectManager: () => ({ priorityList: [{ id: 42 }] }),
  getSettingsRaw: () => ({}),
});
assert.throws(
  () => malformedReader.readItems(),
  /priorityList\[0\]\.id.*string/,
);

const trace = [];
const nodeBySelector = new Map([
  ["#eject", { length: 1 }],
  ["#ejectIron", { length: 1 }],
  ["#ejectCopper", { length: 1 }],
  ["#resEjector .ea-eject-toggle", { length: 1 }],
  ["#script_eject_top_row", { length: 1 }],
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
  { resourceId: "Iron", settingKey: "res_ejectIron", enabled: true },
  { resourceId: "Copper", settingKey: "res_ejectCopper", enabled: false },
];
const browserAdapter = createEjectToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader: { readItems: () => items },
  addToggleCallbacks: (toggle, settingKey) => {
    trace.push({ kind: "toggle", settingKey, toggle });
    return toggle;
  },
});

browserAdapter.createEjectToggles();
assert.deepEqual(
  trace
    .filter((entry) => entry.kind === "toggle")
    .map((entry) => entry.settingKey),
  ["res_ejectIron", "res_ejectCopper"],
);
const markup = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "res_ejectIron",
).toggle;
assert.match(markup.selector, /script_res_ejectIron/);
assert.match(markup.selector, /type="checkbox" checked>/);
const uncheckedMarkup = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "res_ejectCopper",
).toggle;
assert.match(uncheckedMarkup.selector, /script_res_ejectCopper/);
assert.doesNotMatch(uncheckedMarkup.selector, /type="checkbox" checked>/);
assert.equal(trace.filter((entry) => entry.kind === "remove").length, 2);

trace.length = 0;
browserAdapter.removeEjectToggles();
assert.deepEqual(trace, [
  { kind: "remove", selector: "#resEjector .ea-eject-toggle" },
  { kind: "remove", selector: "#script_eject_top_row" },
]);

console.log("Eject toggles browser and Evolve adapter tests passed");
