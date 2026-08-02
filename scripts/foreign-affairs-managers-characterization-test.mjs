import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const readyCallbacks = [];
const vueById = {};
const domBySelector = {};
const documentStub = {
  body: { appendChild() {} },
  createElement: () => ({}),
  getElementById: (id) =>
    vueById[id] === undefined ? null : { __vue__: vueById[id] },
  querySelector: (selector) => domBySelector[selector] ?? null,
};
const jquery = () => ({
  ready(callback) {
    readyCallbacks.push(callback);
  },
});
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  document: documentStub,
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

const { SpyManager, WarManager } = hooks.foreignAffairsManagers;
const trace = [];
const foreign = {
  gov0: { spy: 3, mil: 80, hstl: 10, unrest: 60, anx: false, buy: false },
};
const game = {
  global: {
    civic: {
      foreign,
      garrison: {
        workers: 20,
        wounded: 2,
        raid: 3,
        max: 30,
        m_use: 0,
        crew: 4,
        mercs: true,
        tactic: 1,
      },
    },
    city: { biome: "grassland" },
    portal: {
      fortress: { garrison: 8, patrols: 1, patrol_size: 3, assigned: 8 },
      minions: { spawns: 5 },
      throne: { enemy: [{ id: "fortress" }] },
    },
    race: {},
    space: { fob: { troops: 2 } },
  },
  armyRating: (count) => count * 2,
  loc: (key) => key,
};
const resources = {
  Money: { currentQuantity: 10_000, maxQuantity: 50_000 },
  Morale: { currentQuantity: 250 },
};
const buildings = {
  PitAssaultForge: {
    isAutoBuildable: () => false,
    cost: {},
  },
  PitSoulForge: { count: 0, autoStateEnabled: false, stateOnCount: 0 },
  PitGunEmplacement: { count: 0, stateOnCount: 0 },
  RuinsGuardPost: { count: 0, stateOnCount: 0 },
};
const garrisonVue = {
  campaign: (index) => trace.push(["campaign", index]),
  hire: () => trace.push(["hire"]),
  next: () => trace.push(["tactic-next"]),
  last: () => trace.push(["tactic-last"]),
  aNext: () => trace.push(["battalion-next"]),
  aLast: () => trace.push(["battalion-last"]),
  $options: { filters: { tactics: (value) => `tactic-${value}` } },
};
const fortVue = {
  aNext: () => trace.push(["hell-next"]),
  aLast: () => trace.push(["hell-last"]),
  patInc: () => trace.push(["patrol-next"]),
  patDec: () => trace.push(["patrol-last"]),
  patSizeInc: () => trace.push(["patrol-size-next"]),
  patSizeDec: () => trace.push(["patrol-size-last"]),
  attack: (index) => trace.push(["attack-fortress", index]),
};
vueById.garrison = garrisonVue;
vueById.fort = fortVue;
vueById.espModal = {
  purchase: (index) => trace.push(["purchase", index]),
};
domBySelector["#gov0 div span:nth-child(3)"] = {
  style: { display: "block" },
};
domBySelector["#gov0 div span:nth-child(3) button"] = {
  getAttribute: () => null,
};

hooks.setForeignAffairsManagersTestContext({
  game,
  settings: { autoBuild: false, hellAssaultReserve: false },
  state: { astroSign: "none" },
  resources,
  buildings,
  poly: {
    govPrice: () => 1_000,
    loc: (key) => key,
  },
  win: { document: documentStub },
  gameModal: {
    isOpen: () => false,
    canOpen: () => true,
    open: ({ triggerSelector, title, action }) => {
      trace.push(["modal", triggerSelector, title]);
      action();
    },
  },
  GameLog: {
    logSuccess: (category, message, tags) =>
      trace.push(["log", category, message, [...tags]]),
  },
  KeyManager: {
    set: (...args) => trace.push(["keys", ...args]),
    click: (count) => Array.from({ length: Math.max(0, count) }),
  },
  haveTech: () => false,
  guardActive: () => false,
  traitVal: () => 1,
});

assert.equal(SpyManager.spyCost(0), 6_250_500);
assert.equal(
  SpyManager.isEspionageUseful(0, SpyManager.Types.Influence.id),
  true,
);
assert.equal(
  SpyManager.isEspionageUseful(0, SpyManager.Types.Sabotage.id),
  true,
);
assert.equal(SpyManager.isEspionageUseful(0, SpyManager.Types.Incite.id), true);
assert.equal(SpyManager.isEspionageUseful(0, SpyManager.Types.Annex.id), true);
assert.equal(
  SpyManager.isEspionageUseful(0, SpyManager.Types.Purchase.id),
  true,
);
SpyManager.performEspionage(0, SpyManager.Types.Purchase.id, true);

WarManager.updateGarrison();
WarManager.updateHell();
assert.deepEqual(
  JSON.parse(
    JSON.stringify({
      currentSoldiers: WarManager.currentSoldiers,
      maxSoldiers: WarManager.maxSoldiers,
      deadSoldiers: WarManager.deadSoldiers,
      currentCityGarrison: WarManager.currentCityGarrison,
      maxCityGarrison: WarManager.maxCityGarrison,
      availableGarrison: WarManager.availableGarrison,
      hellGarrison: WarManager.hellGarrison,
      minions: WarManager.minions,
      enemies: WarManager.enemies,
    }),
  ),
  {
    currentSoldiers: 16,
    maxSoldiers: 26,
    deadSoldiers: 10,
    currentCityGarrison: 6,
    maxCityGarrison: 18,
    availableGarrison: 4,
    hellGarrison: 5,
    minions: 5,
    enemies: 1,
  },
);

assert.equal(WarManager.hireMercenary(), true);
assert.equal(resources.Money.currentQuantity, 3_510);
assert.equal(WarManager.workers, 21);
assert.equal(WarManager.m_use, 1);
WarManager.setTactic(3);
WarManager.addBattalion(2);
WarManager.removeBattalion(1);
WarManager.addHellGarrison(2);
WarManager.removeHellGarrison(1);
WarManager.addHellPatrol(1);
WarManager.removeHellPatrol(1);
WarManager.addHellPatrolSize(1);
WarManager.removeHellPatrolSize(1);
assert.equal(WarManager.getCampaignTitle(2), "tactic-2");
assert.equal(WarManager.getGovArmy(2, 0), 50);
assert.equal(WarManager.getAdvantage(100, 2, 0), 50);
assert.equal(WarManager.getSoldiersForAttackRating(9), 5);
assert.equal(WarManager.attackEnemyFortress(0), true);
assert.equal(WarManager.attackEnemyFortress(1), false);

assert.deepEqual(JSON.parse(JSON.stringify(trace)), [
  ["modal", "#gov0 div span:nth-child(3) button", "civics_espionage_actions"],
  [
    "log",
    "spying",
    'Performing "civics_spy_purchase" covert operation against foreign power 1.',
    ["spy"],
  ],
  ["purchase", 0],
  ["keys", false, false, false],
  ["hire"],
  ["tactic-next"],
  ["tactic-next"],
  ["battalion-next"],
  ["battalion-next"],
  ["battalion-last"],
  ["hell-next"],
  ["hell-next"],
  ["hell-last"],
  ["patrol-next"],
  ["patrol-last"],
  ["patrol-size-next"],
  ["patrol-size-last"],
  ["attack-fortress", 0],
]);

console.log("Foreign-affairs manager bundled characterization tests passed");
