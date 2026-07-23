import assert from "node:assert/strict";

import { createCraftToggleBrowserAdapter } from "../src/adapters/browser/craft-toggles.ts";
import { createCraftToggleEvolveAdapter } from "../src/adapters/evolve/economy/production/craft-toggles.ts";

const reader = createCraftToggleEvolveAdapter({
  getCraftablesList: () => [{ id: "Plywood" }, { id: "Brick" }],
  getSettingsRaw: () => ({ craftPlywood: true }),
});
assert.deepEqual(reader.readItems(), [
  { craftableId: "Plywood", settingKey: "craftPlywood", enabled: true },
  { craftableId: "Brick", settingKey: "craftBrick", enabled: false },
]);

const malformedReader = createCraftToggleEvolveAdapter({
  getCraftablesList: () => [{ id: 42 }],
  getSettingsRaw: () => ({}),
});
assert.throws(
  () => malformedReader.readItems(),
  /craftablesList\[0\]\.id.*string/,
);

const trace = [];
const selectorLengths = new Map([
  ["#resources .ea-craft-toggle", 1],
  ["#resPlywood h3", 1],
  ["#resBrick h3", 0],
]);
function node(selector) {
  return {
    selector,
    length: selectorLengths.get(selector) ?? 1,
    parent() {
      trace.push({ kind: "parent", selector });
      return this;
    },
    css(property, value) {
      trace.push({ kind: "css", selector, property, value });
      return this;
    },
    insertAfter(target) {
      trace.push({ kind: "insertAfter", selector, target: target.selector });
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
  { craftableId: "Plywood", settingKey: "craftPlywood", enabled: true },
  { craftableId: "Brick", settingKey: "craftBrick", enabled: false },
];
const browserAdapter = createCraftToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader: { readItems: () => items },
  addToggleCallbacks: (toggle, settingKey) => {
    trace.push({ kind: "toggle", settingKey, toggle });
    return toggle;
  },
});

browserAdapter.createCraftToggles();
const checkedToggle = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "craftPlywood",
).toggle;
assert.match(checkedToggle.selector, /script_craftPlywood/);
assert.match(checkedToggle.selector, /type="checkbox" checked\/>/);
assert.deepEqual(
  trace
    .filter((entry) => entry.kind === "toggle")
    .map((entry) => entry.settingKey),
  ["craftPlywood"],
);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "css"),
  [
    {
      kind: "css",
      selector: "#resPlywood h3",
      property: "position",
      value: "relative",
    },
  ],
);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "insertAfter"),
  [
    {
      kind: "insertAfter",
      selector: checkedToggle.selector,
      target: "#resPlywood h3",
    },
  ],
);

trace.length = 0;
browserAdapter.removeCraftToggles();
assert.deepEqual(trace, [
  { kind: "remove", selector: "#resources .ea-craft-toggle" },
]);

console.log("Craft toggles browser and Evolve adapter tests passed");
