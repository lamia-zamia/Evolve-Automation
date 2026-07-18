import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const actions = [];
const document = { getElementById: () => null };
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

assert.equal(typeof hooks.autoSpy, "function");
const foreign = {
  id: 0,
  policy: "Influence",
  gov: {
    spy: 1,
    sab: 0,
    mil: 100,
    hstl: 50,
    occ: false,
    anx: false,
    buy: false,
  },
};
const SpyManager = {
  _foreignVue: {
    spy_disabled: () => false,
    spy: (governmentId) => actions.push(["train", governmentId]),
  },
  foreignActive: [foreign],
  foreignTarget: foreign,
  purchaseMoney: 0,
  purchaseForeigngs: [],
  Types: {
    Influence: { id: "influence" },
    Sabotage: { id: "sabotage" },
    Incite: { id: "incite" },
    Annex: { id: "annex" },
    Purchase: { id: "purchase" },
  },
  performEspionage: (governmentId, missionId, secondary) =>
    actions.push(["espionage", governmentId, missionId, secondary]),
};
hooks.setWave3TestContext({
  foundryList: [],
  SpyManager,
  buildings: {},
  haveTask: () => false,
  haveTech: (technology, level = 1) => technology === "spy" && level <= 2,
  isBioseederPrestigeAvailable: () => false,
});
hooks.setAutomationTestContext({
  game: {
    global: {
      race: { elusive: false },
      civic: { foreign: { gov0: { name: null } } },
      settings: { at: false },
    },
  },
  win: { document },
});
Object.assign(hooks.automationSettings, {
  inflationChallengeAssist: false,
  foreignTrainSpy: true,
  foreignSpyMax: 2,
});
hooks.automationResources.Money = { storageRatio: 1, maxQuantity: 1_000 };
hooks.GameLog.logSuccess = (id, message, categories) =>
  actions.push(["log", id, message, Array.from(categories)]);

hooks.autoSpy();
assert.deepEqual(actions, [
  ["log", "spying", "Training a spy to send against foreign power 1.", ["spy"]],
  ["train", 0],
  ["espionage", 0, "influence", false],
]);

console.log("Spy bundled characterization tests passed");
