import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const storageValues = new Map();
const trace = [];
const toggles = [];
const selectorLengths = new Map([
  ["#mTabCivil .ea-building-toggle", 1],
  ["#city1", 1],
  ["#missing", 0],
]);

function makeNode(label) {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return selectorLengths.get(label) ?? 1;
      if (property === "__label") return label;
      if (property === Symbol.iterator) return function* () {};
      if (property === "sortable") {
        return (...args) => (args[0] === "toArray" ? [] : proxy);
      }
      if (property === "append") {
        return (content) => {
          trace.push({ kind: "append", label, content });
          return proxy;
        };
      }
      if (property === "remove") {
        return () => {
          trace.push({ kind: "remove", label });
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

function jquery(value) {
  return makeNode(String(value));
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 28 },
    body: { scrollTop: 6 },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeNode("created-element"),
    getElementById: () => null,
  },
  localStorage: {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

assert.equal(typeof hooks.setBuildingTogglesTestContext, "function");
assert.deepEqual(Object.keys(hooks.buildingToggles), [
  "createBuildingToggles",
  "removeBuildingToggles",
]);
const settings = { showSettings: true };
const state = { buildingToggles: 0 };
hooks.setBuildingTogglesTestContext({
  BuildingManager: {
    priorityList: [{ _vueBinding: "city1" }, { _vueBinding: "missing" }],
  },
  settings,
  settingsRaw: { batcity1: true },
  state,
  addToggleCallbacks: (node, settingKey) => {
    toggles.push({ label: node.__label, settingKey });
    return node;
  },
});

trace.length = 0;
hooks.buildingToggles.createBuildingToggles();
assert.deepEqual(
  toggles.map((toggle) => toggle.settingKey),
  ["batcity1"],
);
assert.match(toggles[0].label, /script_batcity1/);
assert.match(toggles[0].label, /type="checkbox" checked\/>/);
assert.equal(state.buildingToggles, 1);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#mTabCivil .ea-building-toggle"],
);

settings.showSettings = false;
trace.length = 0;
hooks.buildingToggles.createBuildingToggles();
assert.equal(state.buildingToggles, 0);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#mTabCivil .ea-building-toggle"],
);

trace.length = 0;
hooks.buildingToggles.removeBuildingToggles();
assert.equal(state.buildingToggles, 0);

console.log("Building toggles bundled characterization tests passed");
