import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const actions = [];
const vue = {
  boostVal: () => actions.push(["power", "boost"]),
};
const document = {
  getElementById: (id) => (id === "psychicBoost" ? { __vue__: vue } : null),
};
const jquery = (selector) => ({
  ready() {},
  click: () => actions.push(["selector", selector]),
});
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
  document,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.autoPsychic, "function");
hooks.setAutomationTestContext({
  game: {
    global: {
      race: { psychic: true, psychicPowers: {} },
      tech: { psychic: 2 },
      settings: { at: false },
    },
  },
  win: { document },
});
Object.assign(hooks.automationSettings, {
  psychicPower: "boost",
  psychicBoostRes: "MissingResource",
});
Object.assign(hooks.automationResources.Energy, {
  currentQuantity: 75,
  maxQuantity: 75,
});

hooks.autoPsychic();
assert.deepEqual(actions, [
  [
    "selector",
    '#psychicBoost #psyhscrolltarget input[value="MissingResource"]',
  ],
  ["power", "boost"],
]);

console.log("Psychic bundled characterization tests passed");
