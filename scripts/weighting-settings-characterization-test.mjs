import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
let registration;

function makeNode() {
  const node = {
    empty() {
      return node;
    },
    off() {
      return node;
    },
    append() {
      return node;
    },
    find() {
      return node;
    },
    ready() {
      return node;
    },
  };
  return node;
}

function jquery(value) {
  return makeNode(String(value));
}

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 32 },
    body: { scrollTop: 9 },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeNode("created-element"),
    getElementById: () => null,
  },
  localStorage: { getItem: () => null, setItem: () => {} },
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

const actions = {
  buildSettingsSection(...args) {
    registration = args;
  },
  addSettingsToggle(_node, settingName) {
    trace.push(`toggle:${settingName}`);
  },
  addTableInput(_node, settingName) {
    trace.push(`input:${settingName}`);
  },
};
hooks.setWeightingSettingsTestContext({
  actions,
  resetWeightingSettings: (reset) => trace.push(`reset:${reset}`),
  updateSettingsFromState: () => trace.push("persist"),
});

hooks.weightingSettings.buildWeightingSettings();
registration[2]();
assert.deepEqual(trace.slice(0, 3), [
  "reset:true",
  "persist",
  "toggle:buildingBuildIfStorageFull",
]);
assert.equal(trace.filter((entry) => entry.startsWith("input:")).length, 28);
assert.equal(trace.at(-1), "input:buildingWeightingRetirementPrep");

console.log("Weighting settings bundled characterization tests passed");
