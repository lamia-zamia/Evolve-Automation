import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const storageValues = new Map();
const trace = [];
const toggles = [];
const selectorLengths = new Map([
  ["#resources .ea-craft-toggle", 1],
  ["#resPlywood h3", 1],
  ["#resBrick h3", 0],
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
      if (property === "parent") {
        return () => {
          trace.push({ kind: "parent", label });
          return proxy;
        };
      }
      if (property === "css") {
        return (propertyName, value) => {
          trace.push({ kind: "css", label, property: propertyName, value });
          return proxy;
        };
      }
      if (property === "insertAfter") {
        return (targetNode) => {
          trace.push({
            kind: "insertAfter",
            label,
            target: targetNode.__label,
          });
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

assert.equal(typeof hooks.setCraftTogglesTestContext, "function");
assert.deepEqual(Object.keys(hooks.craftToggles), [
  "createCraftToggles",
  "removeCraftToggles",
]);
hooks.setCraftTogglesTestContext({
  craftablesList: [{ id: "Plywood" }, { id: "Brick" }],
  settingsRaw: { craftPlywood: true },
  addToggleCallbacks: (node, settingKey) => {
    toggles.push({ label: node.__label, settingKey });
    return node;
  },
});

trace.length = 0;
hooks.craftToggles.createCraftToggles();
assert.deepEqual(
  toggles.map((toggle) => toggle.settingKey),
  ["craftPlywood"],
);
assert.match(toggles[0].label, /script_craftPlywood/);
assert.match(toggles[0].label, /type="checkbox" checked\/>/);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "css"),
  [
    {
      kind: "css",
      label: "#resPlywood h3",
      property: "position",
      value: "relative",
    },
  ],
);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "insertAfter"),
  [{ kind: "insertAfter", label: toggles[0].label, target: "#resPlywood h3" }],
);

trace.length = 0;
hooks.craftToggles.removeCraftToggles();
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#resources .ea-craft-toggle"],
);

console.log("Craft toggles bundled characterization tests passed");
