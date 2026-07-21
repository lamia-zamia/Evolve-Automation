import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const storageValues = new Map();
const trace = [];
const toggles = [];
const selectorLengths = new Map([
  ["#spireSupply", 1],
  ["#supplyCoal", 1],
  ["#supplyIron", 1],
  ["#resCargo .ea-supply-toggle", 1],
  ["#script_supply_top_row", 1],
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

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setSupplyTogglesTestContext, "function");
assert.deepEqual(Object.keys(hooks.supplyToggles), [
  "createSupplyToggles",
  "removeSupplyToggles",
]);
hooks.setSupplyTogglesTestContext({
  SupplyManager: { priorityList: [{ id: "Coal" }, { id: "Iron" }] },
  settingsRaw: { res_supplyCoal: true },
  addToggleCallbacks: (node, settingKey) => {
    toggles.push({ label: node.__label, settingKey });
    return node;
  },
});

trace.length = 0;
hooks.supplyToggles.createSupplyToggles();
assert.deepEqual(
  toggles.map((toggle) => toggle.settingKey),
  ["res_supplyCoal", "res_supplyIron"],
);
assert.match(toggles[0].label, /script_res_supplyCoal/);
assert.match(toggles[0].label, /type="checkbox" checked>/);
assert.match(toggles[1].label, /script_res_supplyIron/);
assert.doesNotMatch(toggles[1].label, /type="checkbox" checked>/);
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#resCargo .ea-supply-toggle", "#script_supply_top_row"],
);
assert.equal(
  trace.some(
    (entry) =>
      entry.kind === "append" &&
      entry.label === "#spireSupply" &&
      entry.content.includes("Auto Supply"),
  ),
  true,
);

trace.length = 0;
hooks.supplyToggles.removeSupplyToggles();
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#resCargo .ea-supply-toggle", "#script_supply_top_row"],
);

console.log("Supply toggles bundled characterization tests passed");
