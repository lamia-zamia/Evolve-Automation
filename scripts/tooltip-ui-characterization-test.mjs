import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const appended = [];

function jquery(node) {
  return {
    length: 1,
    append(value) {
      appended.push({ node, value });
      return this;
    },
    find() {
      return this;
    },
    ready() {
      return this;
    },
  };
}
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document: {
    hidden: false,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({}),
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  },
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

assert.deepEqual(Object.keys(hooks.tooltipUI), [
  "getTooltipInfo",
  "tooltipObserverCallback",
  "addTooltip",
]);

hooks.setTooltipUITestContext({
  settings: { masterScriptToggle: false, autoARPA: true, autoBuild: true },
  state: {
    queuedTargetsAll: [],
    triggerTargets: [],
    tooltips: { custom: "Custom state tooltip" },
  },
  game: { global: { race: {}, stats: { achieve: {} }, tech: {} } },
  buildings: {},
  jobs: {},
  resources: { Power: { maxQuantity: 42 } },
  techIds: {},
  buildingIds: {},
  arpaIds: {},
  MechManager: { initLab: () => false },
  FleetManagerOuter: {},
});

assert.equal(
  hooks.tooltipUI.getTooltipInfo({ extraDescription: "Extra detail" }),
  "Extra detail",
);
hooks.tooltipUI.tooltipObserverCallback([{ addedNodes: [{ id: "popper" }] }]);
assert.equal(appended.length, 0);

hooks.tooltipUI.addTooltip({ dataset: { id: "powerStatus" } });
assert.equal(appended.length, 2);
assert.match(appended[1].value, /42/);

appended.length = 0;
hooks.tooltipUI.addTooltip({ dataset: { id: "blood-lust" } });
assert.equal(appended.length, 2);
assert.equal(appended[1].value, " (+15)");

appended.length = 0;
hooks.tooltipUI.addTooltip({ dataset: { id: "custom" } });
assert.equal(appended.length, 2);
assert.match(appended[1].value, /Custom state tooltip/);

console.log("Tooltip UI bundled characterization tests passed");
