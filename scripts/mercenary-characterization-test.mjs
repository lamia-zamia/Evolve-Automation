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

assert.equal(typeof hooks.autoMerc, "function");
hooks.setAutomationTestContext({
  game: { global: { settings: { at: false } } },
  win: { document },
});
Object.assign(hooks.automationSettings, {
  inflationChallengeAssist: false,
  foreignHireMercDeadSoldiers: 0,
  foreignHireMercCostLowerThanIncome: 0,
  foreignHireMercMoneyStoragePercent: 100,
  storageAssignExtra: false,
});
hooks.automationState.goal = "Reset";
hooks.automationState.moneyMedian = 0;
hooks.automationResources.Money = {
  maxQuantity: 20,
  currentQuantity: 20,
  spareQuantity: 20,
  storageRequired: 20,
};

let soldiers = 0;
const WarManager = {
  _garrisonVue: {},
  isMercenaryUnlocked: () => true,
  maxCityGarrison: 2,
  maxSoldiers: 2,
  mercenaryCost: 10,
  get currentSoldiers() {
    return soldiers;
  },
  hireMercenary() {
    if (soldiers >= this.maxSoldiers) return false;
    soldiers++;
    actions.push(["hire", soldiers]);
    return true;
  },
};
hooks.setWave1TestManagers({ WarManager });
hooks.GameLog.logSuccess = (id, message, categories) =>
  actions.push(["log", id, message, Array.from(categories)]);

hooks.autoMerc();
assert.deepEqual(actions, [
  ["hire", 1],
  ["hire", 2],
  ["log", "mercenary", "Hired 2 mercenaries to join the garrison.", ["combat"]],
]);

console.log("Mercenary bundled characterization tests passed");
