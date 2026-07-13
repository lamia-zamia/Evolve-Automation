import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const readyCallbacks = [];
const jquery = () => ({
  ready(callback) {
    readyCallbacks.push(callback);
  },
});
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
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

assert.equal(typeof hooks.autoFactory, "function");

function product(id, weighting) {
  return {
    id,
    unlocked: true,
    enabled: true,
    weighting,
    priority: 1,
    cost: [],
    resource: {
      id,
      currentQuantity: 0,
      storageRequired: 0,
      isDemanded: () => false,
      isUseful: () => true,
    },
  };
}

function runCase({ initialized = true } = {}) {
  const actions = [];
  const first = product("First", 1);
  const second = product("Second", 2);
  const nano = product("Nano", 0);
  nano.unlocked = false;
  nano.enabled = false;
  const current = { First: 3, Second: 0 };
  Object.assign(hooks.factorySettings, {
    productionFactoryWeighting: "none",
    productionFactoryMinIngredients: 0,
    useDemanded: false,
    prestigeType: "none",
    prestigeBioseedConstruct: false,
  });
  hooks.factoryState.tooltips = {};
  hooks.factoryState.unlockedBuildings = [];
  Object.assign(hooks.FactoryManager, {
    Productions: { First: first, Second: second, NanoTube: nano },
    initIndustry: () => initialized,
    maxOperating: () => 3,
    currentProduction: (production) => current[production.id] ?? 0,
    decreaseProduction: (production, count) =>
      actions.push(["decrease", production.id, count]),
    increaseProduction: (production, count) =>
      actions.push(["increase", production.id, count]),
  });

  hooks.autoFactory();
  return {
    actions,
    tooltips: { ...hooks.factoryState.tooltips },
  };
}

assert.deepEqual(runCase(), {
  actions: [
    ["decrease", "First", 2],
    ["increase", "Second", 2],
  ],
  tooltips: {
    iFactoryFirst: "",
    iFactorySecond: "",
    iFactoryNano: "Disabled<br>",
  },
});
assert.deepEqual(runCase({ initialized: false }), {
  actions: [],
  tooltips: {},
});

console.log("Factory bundled characterization tests passed");
