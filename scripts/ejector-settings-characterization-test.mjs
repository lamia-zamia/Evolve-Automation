import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];

function makeNode() {
  let proxy;
  proxy = new Proxy(function () {}, {
    apply: () => proxy,
    get(_target, property) {
      if (property === "length") return 0;
      if (property === "sortable") {
        return (...args) => (args[0] === "toArray" ? [] : proxy);
      }
      return () => proxy;
    },
  });
  return proxy;
}

function jquery() {
  return makeNode();
}
jquery.isEmptyObject = () => true;

const document = {
  documentElement: { scrollTop: 24 },
  body: { scrollTop: 8 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document,
  localStorage: { getItem: () => null, setItem() {} },
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

hooks.setEjectorSettingsTestContext({
  settingsRaw: {},
  resources: {
    Iron: {
      id: "Iron",
      name: "Iron",
      atomicMass: 56,
      is: { tradable: true },
      isCraftable: () => false,
    },
  },
  EjectManager: { isConsumable: () => true },
  NaniteManager: { isConsumable: () => false },
  SupplyManager: {
    isConsumable: () => true,
    supplyOut: () => 2,
    supplyIn: () => 3,
  },
  actions: {
    buildSettingsSection(...args) {
      trace.push(`section:${args[0]}:${args[1]}`);
      this.registration = args;
    },
    addSettingsSelect(_node, key) {
      trace.push(`select:${key}`);
    },
    addSettingsToggle(_node, key) {
      trace.push(`toggle:${key}`);
    },
    addSettingsNumber(_node, key) {
      trace.push(`number:${key}`);
    },
    addTableToggle(_node, key) {
      trace.push(`table:${key}`);
    },
    buildTableLabel() {
      return "label";
    },
  },
  resetEjectorSettings: (value) => trace.push(`reset:${value}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
  removeEjectToggles: () => trace.push("remove:eject"),
  removeSupplyToggles: () => trace.push("remove:supply"),
});

const panel = hooks.ejectorSettings;
panel.updateEjectorSettingsContent();
assert.deepEqual(trace.slice(0, 7), [
  "select:ejectMode",
  "select:supplyMode",
  "select:naniteMode",
  "toggle:prestigeWhiteholeStabiliseMass",
  "number:prestigeWhiteholeStabiliseCooldown",
  "table:res_ejectIron",
  "table:res_supplyIron",
]);
assert.equal(document.documentElement.scrollTop, 24);
assert.equal(document.body.scrollTop, 24);

trace.length = 0;
panel.buildEjectorSettings();
assert.equal(trace[0], "section:ejector:Ejector, Supply & Nanite");
assert.equal(
  typeof hooks.ejectorSettings.updateEjectorSettingsContent,
  "function",
);

// The action test hook retains the registration callback on its own object; obtain it
// through a fresh context because the bundled adapter only exposes the typed panel.
const actionContext = {
  settingsRaw: {},
  resources: {
    Iron: {
      id: "Iron",
      name: "Iron",
      atomicMass: 56,
      is: { tradable: true },
      isCraftable: () => false,
    },
  },
  EjectManager: { isConsumable: () => true },
  NaniteManager: { isConsumable: () => false },
  SupplyManager: {
    isConsumable: () => false,
    supplyOut: () => 0,
    supplyIn: () => 0,
  },
  actions: {
    buildSettingsSection(...args) {
      this.registration = args;
    },
    addSettingsSelect() {},
    addSettingsToggle() {},
    addSettingsNumber() {},
    addTableToggle() {},
    buildTableLabel() {
      return "label";
    },
  },
  resetEjectorSettings: (value) => trace.push(`reset:${value}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
  removeEjectToggles: () => trace.push("remove:eject"),
  removeSupplyToggles: () => trace.push("remove:supply"),
};
hooks.setEjectorSettingsTestContext(actionContext);
panel.buildEjectorSettings();
actionContext.actions.registration[2]();
assert.deepEqual(trace, [
  "section:ejector:Ejector, Supply & Nanite",
  "reset:true",
  "persist",
  "checkbox:autoEject|autoSupply|autoNanite",
  "remove:eject",
  "remove:supply",
]);

console.log("Ejector settings bundled characterization tests passed");
