import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
let registration;
function makeNode() {
  let proxy;
  proxy = new Proxy(function () {}, {
    apply: () => proxy,
    get(_target, property) {
      if (property === "length") return 0;
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
  documentElement: { scrollTop: 15 },
  body: { scrollTop: 3 },
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
hooks.setMechSettingsTestContext({
  game: { loc: (key) => key },
  MechManager: { Size: ["small"] },
  actions: {
    buildSettingsSection(...args) {
      registration = args;
      trace.push(`section:${args[0]}:${args[1]}`);
    },
    addSettingsNumber(_node, key) {
      trace.push(`number:${key}`);
    },
    addSettingsSelect(_node, key) {
      trace.push(`select:${key}`);
    },
    addSettingsToggle(_node, key) {
      trace.push(`toggle:${key}`);
    },
    addStandardHeading(_node, label) {
      trace.push(`heading:${label}`);
    },
    calculateMechStats: () => trace.push("stats"),
  },
  resetMechSettings: (value) => trace.push(`reset:${value}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (key) => trace.push(`checkbox:${key}`),
  removeMechInfo: () => trace.push("remove"),
});
const panel = hooks.mechSettings;
panel.updateMechSettingsContent();
assert.equal(trace[0], "select:mechScrap");
assert.ok(trace.includes("heading:Mech Stats"));
assert.equal(trace.at(-1), "stats");
assert.equal(document.documentElement.scrollTop, 15);
trace.length = 0;
panel.buildMechSettings();
registration[2]();
assert.deepEqual(trace, [
  "section:mech:Mech & Spire",
  "reset:true",
  "persist",
  "select:mechScrap",
  "number:mechScrapEfficiency",
  "number:mechCollectorValue",
  "select:mechBuild",
  "select:mechSize",
  "select:mechSizeGravity",
  "select:mechSpecial",
  "number:mechWaygatePotential",
  "number:mechMinSupply",
  "number:mechMaxCollectors",
  "number:mechSaveSupplyRatio",
  "number:mechScouts",
  "toggle:mechInfernalCollector",
  "toggle:mechScoutsRebuild",
  "toggle:mechFillBay",
  "toggle:buildingMechsFirst",
  "toggle:mechBaysFirst",
  "heading:Mech Stats",
  "stats",
  "checkbox:autoMech",
  "remove",
]);
console.log("Mech settings bundled characterization tests passed");
