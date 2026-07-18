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

assert.equal(typeof hooks.autoBattle, "function");
const target = {
  id: 0,
  policy: "Raid",
  released: false,
  gov: { spy: 2, anx: false, buy: false, occ: false },
};
const SpyManager = {
  _foreignVue: {},
  foreignTarget: target,
  foreignActive: [],
};
const WarManager = {
  _garrisonVue: {},
  _hellVue: undefined,
  maxCityGarrison: 30,
  maxSoldiers: 30,
  currentCityGarrison: 30,
  availableGarrison: 30,
  wounded: 0,
  deadSoldiers: 0,
  raid: 0,
  getSoldiersForAdvantage: () => 5,
  setTactic(tactic) {
    actions.push(["tactic", tactic]);
  },
  addBattalion(count) {
    this.raid += count;
    actions.push(["add", count]);
  },
  removeBattalion(count) {
    this.raid -= count;
    actions.push(["remove", count]);
  },
  getCampaignTitle: () => "Siege",
  getAdvantage: () => 12.34,
  launchCampaign: (governmentId) => actions.push(["launch", governmentId]),
  release: (governmentId) => actions.push(["release", governmentId]),
};
const game = {
  global: {
    race: { species: "human" },
    civic: {
      govern: { type: "democracy" },
      garrison: { progress: 0, rate: 1 },
      foreign: { gov0: { name: null } },
    },
    tech: { armor: 0 },
    city: { ptrait: [] },
    settings: { showPortal: false, at: false },
  },
  armyRating: (soldiers) => soldiers,
};
const traitVal = (_trait, _index, operation) =>
  typeof operation === "number" ? operation : 0;
const GameLog = {
  logSuccess: (id, message, categories) =>
    actions.push(["log", id, message, Array.from(categories)]),
};

hooks.setWave1TestManagers({ WarManager, MinorTraitManager: {} });
hooks.setWave3TestContext({
  foundryList: [],
  SpyManager,
  buildings: {},
  haveTask: () => false,
  haveTech: () => true,
  isBioseederPrestigeAvailable: () => false,
});
hooks.setAutomationTestContext({ game, win: { document } });
hooks.setForeignAffairsManagersTestContext({
  game,
  settings: hooks.automationSettings,
  state: hooks.automationState,
  traitVal,
  GameLog,
  guardActive: () => false,
});
hooks.automationState.goal = "Normal";
Object.assign(hooks.automationSettings, {
  foreignPacifist: false,
  guardPacifist: false,
  foreignAttackHealthySoldiersPercent: 100,
  foreignAttackLivingSoldiersPercent: 100,
  foreignProtect: "never",
  foreignMinAdvantage: 0,
  foreignMaxAdvantage: 10,
  foreignMaxSiegeBattalion: 30,
  foreignUnification: false,
  foreignOccupyLast: false,
  autoHell: false,
});

hooks.autoBattle();
assert.deepEqual(actions, [
  ["tactic", 4],
  ["add", 5],
  [
    "log",
    "attack",
    "Launching Siege campaign against foreign power 1 with 12.3% advantage.",
    ["combat"],
  ],
  ["launch", 0],
]);

console.log("Battle bundled characterization tests passed");
