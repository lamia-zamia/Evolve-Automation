import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const storageValues = new Map();
const trace = [];
const toggles = [];
const selectorLengths = new Map([
  ["#arpaPhysics .ea-arpa-toggle", 1],
  ["#arpaPhysics .head", 1],
  ["#arpaRobotics .head", 0],
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

assert.equal(typeof hooks.setArpaTogglesTestContext, "function");
assert.deepEqual(Object.keys(hooks.arpaToggles), [
  "createArpaToggles",
  "removeArpaToggles",
]);
hooks.setArpaTogglesTestContext({
  ProjectManager: { priorityList: [{ id: "Physics" }, { id: "Robotics" }] },
  settingsRaw: { arpa_Physics: true },
  addToggleCallbacks: (node, settingKey) => {
    toggles.push({ label: node.__label, settingKey });
    return node;
  },
});

trace.length = 0;
hooks.arpaToggles.createArpaToggles();
assert.deepEqual(
  toggles.map((toggle) => toggle.settingKey),
  ["arpa_Physics"],
);
assert.match(toggles[0].label, /script_arpa_Physics/);
assert.match(toggles[0].label, /type="checkbox" checked>/);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "append").map((entry) => entry.label),
  ["#arpaPhysics .head"],
);

trace.length = 0;
hooks.arpaToggles.removeArpaToggles();
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#arpaPhysics .ea-arpa-toggle"],
);

console.log("Arpa toggles bundled characterization tests passed");
