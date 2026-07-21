import assert from "node:assert/strict";

import { createArpaToggleBrowserAdapter } from "../src/adapters/browser/arpa-toggles.ts";
import { createArpaToggleEvolveAdapter } from "../src/adapters/evolve/arpa-toggles.ts";

const reader = createArpaToggleEvolveAdapter({
  getProjectManager: () => ({
    priorityList: [{ id: "Physics" }, { id: "Robotics" }],
  }),
  getSettingsRaw: () => ({ arpa_Physics: true }),
});
assert.deepEqual(reader.readItems(), [
  { projectId: "Physics", settingKey: "arpa_Physics", enabled: true },
  { projectId: "Robotics", settingKey: "arpa_Robotics", enabled: false },
]);

const malformedReader = createArpaToggleEvolveAdapter({
  getProjectManager: () => ({ priorityList: [{ id: 42 }] }),
  getSettingsRaw: () => ({}),
});
assert.throws(
  () => malformedReader.readItems(),
  /priorityList\[0\]\.id.*string/,
);

const trace = [];
const selectorLengths = new Map([
  ["#arpaPhysics .ea-arpa-toggle", 1],
  ["#arpaPhysics .head", 1],
  ["#arpaRobotics .head", 0],
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
  { projectId: "Physics", settingKey: "arpa_Physics", enabled: true },
  { projectId: "Robotics", settingKey: "arpa_Robotics", enabled: false },
];
const browserAdapter = createArpaToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader: { readItems: () => items },
  addToggleCallbacks: (toggle, settingKey) => {
    trace.push({ kind: "toggle", settingKey, toggle });
    return toggle;
  },
});

browserAdapter.createArpaToggles();
const checkedToggle = trace.find(
  (entry) => entry.kind === "toggle" && entry.settingKey === "arpa_Physics",
).toggle;
assert.match(checkedToggle.selector, /script_arpa_Physics/);
assert.match(checkedToggle.selector, /type="checkbox" checked>/);
assert.deepEqual(
  trace
    .filter((entry) => entry.kind === "toggle")
    .map((entry) => entry.settingKey),
  ["arpa_Physics"],
);

trace.length = 0;
browserAdapter.removeArpaToggles();
assert.deepEqual(trace, [
  { kind: "remove", selector: "#arpaPhysics .ea-arpa-toggle" },
]);

console.log("Arpa toggles browser and Evolve adapter tests passed");
