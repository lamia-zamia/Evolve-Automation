import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const actions = [];
const sequence = { on: false, boost: false, auto: false };
const vue = {
  toggle() {
    sequence.on = !sequence.on;
    actions.push("toggle");
  },
  booster() {
    sequence.boost = !sequence.boost;
    actions.push("booster");
  },
  auto_seq() {
    sequence.auto = !sequence.auto;
    actions.push("auto_seq");
  },
  novo: () => actions.push("novo"),
};
const document = {
  getElementById: (id) => (id === "arpaSequence" ? { __vue__: vue } : null),
};
const jquery = () => ({ ready() {} });
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

assert.equal(typeof hooks.autoGenetics, "function");
hooks.setAutomationTestContext({
  game: {
    global: {
      tech: { genetics: 6 },
      race: { mutation: 0 },
      arpa: { sequence },
      settings: { at: false },
    },
  },
  win: { document },
});
Object.assign(hooks.automationSettings, {
  geneticsSequence: "enabled",
  geneticsBoost: "enabled",
  geneticsAssemble: "auto",
  tickRate: 1,
});
Object.assign(hooks.automationResources, {
  Knowledge: {
    currentQuantity: 200_000,
    rateOfChange: 800_000,
    maxQuantity: 200_000,
    isDemanded: () => false,
  },
  Genes: { currentQuantity: 3 },
});
hooks.automationKeyManager.click = function* click(count) {
  while (count > 0) yield --count;
};

hooks.autoGenetics();
assert.deepEqual(actions, ["toggle", "booster", "novo"]);
assert.equal(hooks.automationResources.Knowledge.currentQuantity, 0);
assert.equal(hooks.automationResources.Genes.currentQuantity, 4);

console.log("Genetics bundled characterization tests passed");
