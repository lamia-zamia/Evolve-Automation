import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const readyCallbacks = [];
const clickActions = [];
const documentElements = {};
const testDocument = {
  getElementById: (id) => documentElements[id] ?? null,
};
const jquery = (selector) => ({
  ready(callback) {
    readyCallbacks.push(callback);
  },
  click() {
    clickActions.push(["click", selector]);
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
  MouseEvent: class {
    constructor(type) {
      this.type = type;
    }
  },
  setTimeout,
  clearTimeout,
  structuredClone,
  document: testDocument,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

for (const name of [
  "autoMiningDroid",
  "autoGraphenePlant",
  "autoShapeshift",
  "autoWish",
  "autoGenetics",
]) {
  assert.equal(typeof hooks[name], "function", `${name} test hook missing`);
}

function ratioProduct(id, weighting) {
  return {
    id,
    weighting,
    priority: 1,
    resource: {
      isDemanded: () => false,
      isUseful: () => true,
    },
  };
}

function characterizeDroids() {
  const actions = [];
  const first = ratioProduct("First", 1);
  const second = ratioProduct("Second", 2);
  const current = { First: 3, Second: 0 };
  Object.assign(hooks.DroidManager, {
    Productions: { First: first, Second: second },
    initIndustry: () => true,
    maxOperating: () => 3,
    currentProduction: (production) => current[production.id],
    decreaseProduction: (production, count) =>
      actions.push(["decrease", production.id, count]),
    increaseProduction: (production, count) =>
      actions.push(["increase", production.id, count]),
  });
  hooks.autoMiningDroid();
  return actions;
}

function characterizeGraphene() {
  const actions = [];
  const fuelResource = {
    storageRatio: 1,
    rateOfChange: 100,
    currentQuantity: 10_000,
    isUnlocked: () => true,
  };
  const coal = {
    id: "Coal",
    cost: { resource: fuelResource, quantity: 10, minRateOfChange: 0 },
  };
  hooks.automationResources.Graphene.isUseful = () => true;
  Object.assign(hooks.GrapheneManager, {
    Fuels: { Coal: coal },
    initIndustry: () => true,
    maxOperating: () => 2,
    fueledCount: () => 0,
    decreaseFuel: (fuel, count) => actions.push(["decrease", fuel.id, count]),
    increaseFuel: (fuel, count) => actions.push(["increase", fuel.id, count]),
  });
  hooks.autoGraphenePlant();
  return actions;
}

const uiActions = [];
const vues = {
  sshifter: { setShape: (genus) => uiActions.push(["shape", genus]) },
  minorWish: {},
  majorWish: {},
  arpaSequence: {
    toggle: () => uiActions.push(["genetics", "toggle"]),
    booster: () => uiActions.push(["genetics", "booster"]),
    auto_seq: () => uiActions.push(["genetics", "auto_seq"]),
  },
};
const testGame = {
  global: {
    race: {
      shapeshifter: true,
      ss_genus: "humanoid",
      wish: true,
      wishStats: { minor: 0, major: 0 },
      mutation: 0,
    },
    tech: { wish: 2, genetics: 6 },
    arpa: { sequence: { on: false, boost: false, auto: false } },
    settings: { at: false },
  },
};
hooks.setAutomationTestContext({
  game: testGame,
  win: {
    document: {
      getElementById: (id) => (vues[id] ? { __vue__: vues[id] } : null),
    },
  },
});
Object.assign(hooks.automationSettings, {
  shifterGenus: "aquatic",
  wishMinor: "Know",
  wishMajor: "Power",
  geneticsSequence: "enabled",
  geneticsBoost: "enabled",
  geneticsAssemble: "enabled",
  tickRate: 1,
});

assert.deepEqual(characterizeDroids(), [
  ["decrease", "First", 2],
  ["increase", "Second", 2],
]);
assert.deepEqual(characterizeGraphene(), [["increase", "Coal", 2]]);

hooks.autoShapeshift();
hooks.autoWish();
hooks.autoGenetics();

assert.deepEqual(uiActions, [
  ["shape", "aquatic"],
  ["genetics", "toggle"],
  ["genetics", "booster"],
  ["genetics", "auto_seq"],
]);
assert.deepEqual(clickActions, [
  ["click", "#wishKnow"],
  ["click", "#wishPower"],
]);

console.log("Five-controller bundled characterization tests passed");

for (const name of [
  "autoMerc",
  "autoPsychic",
  "autoOcularPowers",
  "autoMinorTrait",
  "autoTrigger",
]) {
  assert.equal(typeof hooks[name], "function", `${name} test hook missing`);
}

const waveActions = [];
const waveVues = {
  psychicKill: { murder: () => waveActions.push(["psychic", "murder"]) },
  ocularPower: { d: false, p: false, w: false, t: false, f: false, c: false },
};
for (const id of Object.keys(waveVues)) {
  documentElements[id] = { __vue__: waveVues[id] };
}
documentElements.oculardisintegration = {
  querySelector: () => ({ click: () => waveActions.push(["ocular", "d"]) }),
};
for (const id of ["petrification", "wound", "telekinesis", "fear", "charm"]) {
  documentElements[`ocular${id}`] = {
    querySelector: () => ({ click: () => waveActions.push(["ocular", id]) }),
  };
}
const waveGame = {
  global: {
    race: {
      psychic: true,
      psychicPowers: {},
      ocular_power: true,
      ocularPowerConfig: true,
    },
    tech: { psychic: 1 },
    stats: { psykill: 0 },
    settings: { at: false },
  },
  traits: { ocular_power: { vars: () => [1] } },
};
hooks.setAutomationTestContext({
  game: waveGame,
  win: { document: testDocument },
});
Object.assign(hooks.automationSettings, {
  inflationChallengeAssist: false,
  foreignHireMercDeadSoldiers: 0,
  foreignHireMercCostLowerThanIncome: 1,
  foreignHireMercMoneyStoragePercent: 0,
  storageAssignExtra: false,
  psychicPower: "auto",
  psychicBoostRes: "auto",
  ocularPower_disintegration: true,
  ocularPower_p_disintegration: 10,
});
for (const id of ["petrification", "wound", "telekinesis", "fear", "charm"]) {
  hooks.automationSettings[`ocularPower_${id}`] = false;
  hooks.automationSettings[`ocularPower_p_${id}`] = 0;
}
hooks.automationState.goal = "Normal";
hooks.automationState.moneyMedian = 100;
hooks.automationResources.Money = {
  maxQuantity: 1_000,
  currentQuantity: 1_000,
  spareQuantity: 1_000,
  storageRequired: 0,
};
hooks.automationResources.Energy = { storageRatio: 1, currentQuantity: 100 };
hooks.automationResources.Population = { currentQuantity: 1 };
hooks.automationResources.Thrall = { rateOfChange: 0, storageRatio: 0 };
let soldierCount = 0;
const testWarManager = {
  _garrisonVue: {},
  isMercenaryUnlocked: () => true,
  maxCityGarrison: 1,
  maxSoldiers: 1,
  currentSoldiers: 0,
  mercenaryCost: 10,
  hireMercenary: () => {
    if (soldierCount > 0) return false;
    soldierCount++;
    testWarManager.currentSoldiers = soldierCount;
    waveActions.push(["mercenary", "hire"]);
    return true;
  },
};
hooks.GameLog.logSuccess = (id, message) =>
  waveActions.push(["log", id, message]);
hooks.automationResources.Genes = { currentQuantity: 10 };
const testMinorTraitManager = {
  isUnlocked: () => true,
  managedPriorityList: () => [
    { traitName: "smart", weighting: 1, geneCost: () => 5 },
  ],
  buyTrait: (name) => waveActions.push(["trait", name]),
};
hooks.setWave1TestManagers({
  WarManager: testWarManager,
  MinorTraitManager: testMinorTraitManager,
});
hooks.automationState.triggerTargets = [
  {
    id: "trigger-first",
    cost: {},
    click: () => (waveActions.push(["trigger", "first"]), false),
  },
  {
    id: "trigger-second",
    cost: {},
    click: () => (waveActions.push(["trigger", "second"]), true),
  },
];

hooks.autoMerc();
hooks.autoPsychic();
hooks.autoOcularPowers();
hooks.autoMinorTrait();
const triggerActive = hooks.autoTrigger();

assert.equal(triggerActive, true);
assert.deepEqual(waveActions, [
  ["mercenary", "hire"],
  ["log", "mercenary", "Hired a mercenary to join the garrison."],
  ["psychic", "murder"],
  ["ocular", "d"],
  ["trait", "smart"],
  ["trigger", "first"],
  ["trigger", "second"],
]);
assert.equal(hooks.automationResources.Genes.currentQuantity, 5);

console.log("Wave 1 bundled characterization tests passed");

for (const name of [
  "autoConsume",
  "autoReplicator",
  "autoMarket",
  "autoGalaxyMarket",
  "autoGatherResources",
]) {
  assert.equal(typeof hooks[name], "function", `${name} test hook missing`);
}

const wave2Actions = [];
const consumedResource = {
  id: "Consumed",
  storageRatio: 0.8,
  storageRequired: 50,
  requestedQuantity: 0,
  maxQuantity: 100,
  currentQuantity: 80,
  isDemanded: () => false,
  isCraftable: () => false,
};
const consumeManager = {
  storageShift: 1,
  initIndustry: () => true,
  managedPriorityList: () => [consumedResource],
  isUseful: () => true,
  maxConsume: () => 3,
  useRatio: () => [0.5],
  resEnabled: () => true,
  maxConsumeForRatio: () => 3,
  currentConsume: () => 0,
  consumeLess: (id, count) => wave2Actions.push(["consumeLess", id, count]),
  consumeMore: (id, count) => wave2Actions.push(["consumeMore", id, count]),
};
const replicatedA = {
  id: "A",
  unlocked: true,
  enabled: true,
  weighting: 1,
  priority: 1,
  resource: {
    id: "A",
    currentQuantity: 10,
    atomicMass: 1,
    isDemanded: () => false,
    isUseful: () => true,
  },
};
const replicatedB = {
  id: "B",
  unlocked: true,
  enabled: true,
  weighting: 2,
  priority: 1,
  resource: {
    id: "B",
    currentQuantity: 10,
    atomicMass: 1,
    isDemanded: () => false,
    isUseful: () => true,
  },
};
const testReplicatorManager = {
  Productions: { A: replicatedA, B: replicatedB },
  initIndustry: () => true,
  setResource: (id) => wave2Actions.push(["replicate", id]),
};
const marketResource = {
  is: { tradable: true },
  isUnlocked: () => true,
  autoSellEnabled: true,
  storageRatio: 1,
  autoSellRatio: 0.5,
  currentQuantity: 100,
  maxQuantity: 100,
  income: 0,
  autoBuyEnabled: false,
};
const testMarketManager = {
  multiplier: 1,
  priorityList: [marketResource],
  isUnlocked: () => true,
  isBuySellUnlocked: () => true,
  getMaxMultiplier: () => 100,
  getUnitSellPrice: () => 1,
  setMultiplier: (value) => wave2Actions.push(["multiplier", value]),
  sell: () => wave2Actions.push(["sell"]),
};
const buyResource = {
  id: "Buy",
  galaxyMarketWeighting: 1,
  galaxyMarketPriority: 1,
  isDemanded: () => false,
  isUseful: () => true,
};
const sellResource = { isDemanded: () => false, storageRatio: 1 };
const testGalaxyTradeManager = {
  initIndustry: () => true,
  maxOperating: () => 2,
  currentProduction: () => 0,
  decreaseProduction: (index, count) =>
    wave2Actions.push(["galaxyLess", index, count]),
  increaseProduction: (index, count) =>
    wave2Actions.push(["galaxyMore", index, count]),
};
const gatherBuildings = Object.fromEntries(
  ["Food", "Lumber", "Stone", "Chrysotile", "Slaughter"].map((id) => [
    id,
    { isClickable: () => id === "Food", count: 0 },
  ]),
);
gatherBuildings.RockQuarry = { count: 0 };
hooks.setWave2TestContext({
  ReplicatorManager: testReplicatorManager,
  MarketManager: testMarketManager,
  GalaxyTradeManager: testGalaxyTradeManager,
  buildings: gatherBuildings,
  adjustTradeRoutes: () => wave2Actions.push(["routes"]),
  getResourcesPerClick: () => 2,
});
Object.assign(hooks.automationSettings, {
  replicatorWeightingMode: "quantity",
  replicatorAssignGovernorTask: false,
  minimumMoneyPercentage: 0,
  minimumMoney: 0,
  marketMinIngredients: 0,
  buildingAlwaysClick: true,
  buildingClickPerTick: 3,
});
const wave2Game = {
  global: { race: {}, tech: {}, settings: { at: false } },
  actions: {
    city: { food: { action: () => wave2Actions.push(["gatherFood"]) } },
  },
};
hooks.setAutomationTestContext({
  game: wave2Game,
  win: { document: testDocument },
});
hooks.automationResources.Money = {
  maxQuantity: 1_000,
  currentQuantity: 0,
  isDemanded: () => false,
};
hooks.automationResources.Buy = buyResource;
hooks.automationResources.Sell = sellResource;
hooks.automationResources.Population = { currentQuantity: 0 };
hooks.automationResources.Food = { currentQuantity: 0, maxQuantity: 10 };
hooks.automationResources.Lumber = { currentQuantity: 0, maxQuantity: 10 };
hooks.automationResources.Stone = { currentQuantity: 0, maxQuantity: 10 };
hooks.automationResources.Chrysotile = { currentQuantity: 0, maxQuantity: 10 };
hooks.automationResources.Furs = {
  currentQuantity: 0,
  maxQuantity: 10,
  isUnlocked: () => false,
};
hooks.automationResources.Mana = { currentQuantity: 0 };
hooks.getAutomationPoly().galaxyOffers = [
  { buy: { res: "Buy" }, sell: { res: "Sell" } },
];

hooks.autoConsume(consumeManager);
hooks.autoReplicator();
hooks.autoMarket();
hooks.autoGalaxyMarket();
hooks.autoGatherResources();

assert.deepEqual(wave2Actions, [
  ["consumeMore", "Consumed", 3],
  ["replicate", "B"],
  ["routes"],
  ["multiplier", 50],
  ["sell"],
  ["multiplier", 1],
  ["galaxyMore", 0, 2],
  ["gatherFood"],
  ["gatherFood"],
  ["gatherFood"],
]);
assert.equal(hooks.automationResources.Food.currentQuantity, 6);

console.log("Wave 2 bundled characterization tests passed");

for (const name of [
  "autoEvolution",
  "autoUniverseSelection",
  "autoCraft",
  "autoSpy",
  "autoPrestige",
]) {
  assert.equal(typeof hooks[name], "function", `${name} test hook missing`);
}

const wave3Actions = [];
const wood = {
  currentQuantity: 10,
  maxQuantity: 100,
  spareQuantity: 10,
  storageRequired: 0,
  rateOfChange: 0,
  isDemanded: () => false,
  isCapped: () => false,
  usefulRatio: 1,
};
const craftable = {
  cost: { Wood: 1 },
  craftPreserve: 0,
  currentQuantity: 0,
  storageRequired: 1,
  usefulRatio: 2,
  autoCraftEnabled: true,
  isUnlocked: () => true,
  isDemanded: () => true,
  tryCraftX: (count) => wave3Actions.push(["craft", count]),
};
const foreign = {
  id: 0,
  policy: "None",
  gov: { spy: 0, sab: 0, occ: false, anx: false, buy: false },
};
const testSpyManager = {
  _foreignVue: {
    spy_disabled: () => false,
    spy: (id) => wave3Actions.push(["trainSpy", id]),
  },
  foreignActive: [foreign],
  foreignTarget: foreign,
  purchaseMoney: 0,
  purchaseForeigngs: [],
  Types: {},
};
const bioseedBuildings = {
  GasSpaceDockLaunch: {
    isUnlocked: () => true,
    click: () => wave3Actions.push(["bioseedLaunch"]),
  },
  GasSpaceDockPrepForLaunch: { isUnlocked: () => false },
  GasSpaceDock: { cacheOptions: () => wave3Actions.push(["bioseedOptions"]) },
};
hooks.setWave3TestContext({
  foundryList: [craftable],
  SpyManager: testSpyManager,
  buildings: bioseedBuildings,
  haveTask: () => false,
  haveTech: (id, level) => id === "spy" && (level ?? 1) <= 2,
  isBioseederPrestigeAvailable: () => true,
});
Object.assign(hooks.automationSettings, {
  foreignTrainSpy: true,
  foreignSpyMax: 1,
  prestigeType: "bioseed",
  userUniverseTargetName: "evil",
});
hooks.automationState.goal = "Normal";
hooks.automationResources.Population = { isUnlocked: () => true };
hooks.automationResources.Wood = wood;
hooks.automationResources.Money = { storageRatio: 1, maxQuantity: 0 };
const universeElement = {
  children: [{ click: () => wave3Actions.push(["universe", "evil"]) }],
};
documentElements["uni-evil"] = universeElement;
const wave3Game = {
  global: {
    race: { species: "protoplasm", bigbang: true, universe: "bigbang" },
    tech: { spy: 2 },
    civic: { foreign: { gov0: { name: null } } },
    settings: { at: false },
  },
};
hooks.setAutomationTestContext({
  game: wave3Game,
  win: { document: testDocument },
});
hooks.GameLog.logSuccess = (id, message) =>
  wave3Actions.push(["log", id, message]);

hooks.autoCraft();
hooks.autoSpy();
hooks.autoPrestige();
assert.equal(hooks.automationState.goal, "Reset");
hooks.autoPrestige();
hooks.autoUniverseSelection();
hooks.autoEvolution();

assert.deepEqual(wave3Actions, [
  ["craft", 10],
  ["log", "spying", "Training a spy to send against foreign power 1."],
  ["trainSpy", 0],
  ["bioseedLaunch"],
  ["universe", "evil"],
  ["universe", "evil"],
]);
assert.equal(wood.currentQuantity, 0);

console.log("Wave 3 bundled characterization tests passed");

for (const name of [
  "autoPlanetSelection",
  "autoJobs",
  "autoBuild",
  "autoResearch",
  "autoMutateTrait",
]) {
  assert.equal(typeof hooks[name], "function", `${name} test hook missing`);
}

const wave4Actions = [];
const planet = {
  biome: "grassland",
  traits: ["none"],
  orbit: 300,
  geology: {},
  id: "Planet1",
};
documentElements.Planet1 = {
  dispatchEvent: (event) => wave4Actions.push(["planetHover", event.type]),
  children: [{ click: () => wave4Actions.push(["planetClick"]) }],
};
const building = {
  _vueBinding: "testBuilding",
  title: "Test Building",
  weighting: 1,
  cost: {},
  consumption: [],
  is: { important: false },
  extraDescription: "",
  isAffordable: () => true,
  isMission: () => false,
  click: () => (wave4Actions.push(["build"]), true),
};
const testBuildingManager = {
  updateWeighting: () => wave4Actions.push(["buildingWeights"]),
  managedPriorityList: () => [building],
  updateBuildings: () => wave4Actions.push(["buildingCache"]),
};
const testProjectManager = {
  updateWeighting: () => wave4Actions.push(["projectWeights"]),
  managedPriorityList: () => [],
  updateProjects: () => wave4Actions.push(["projectCache"]),
};
const testTech = {
  id: "test-tech",
  isAffordable: () => true,
  click: () => (wave4Actions.push(["research"]), true),
};
const mutationTrait = {
  traitName: "strong",
  name: "Strong",
  canGain: () => true,
  canPurge: () => false,
  mutationCost: () => 5,
};
const testMutableTraitManager = {
  isUnlocked: () => true,
  priorityList: [mutationTrait],
  gainTrait: (name) => wave4Actions.push(["mutate", name]),
};
hooks.setWave4TestContext({
  generatePlanets: () => [planet],
  getStarLevel: () => 1,
  isAchievementUnlocked: () => true,
  races: {},
  JobManager: { managedPriorityList: () => [] },
  BuildingManager: testBuildingManager,
  ProjectManager: testProjectManager,
  MutableTraitManager: testMutableTraitManager,
  getCostConflict: () => false,
});
Object.assign(hooks.automationSettings, {
  userPlanetTargetName: "weighting",
  biome_w_grassland: 1,
  trait_w_none: 0,
  extra_w_Achievement: 0,
  extra_w_Orbit: 0,
  buildingConsumptionCheck: "unlimited",
  buildingBuildIfStorageFull: false,
});
hooks.automationState.queuedTargets = [];
hooks.automationState.triggerTargets = [];
hooks.automationState.unlockedTechs = [testTech];
hooks.automationResources.Plasmid = { name: "Plasmid", currentQuantity: 20 };
const wave4Game = {
  global: {
    race: { universe: "standard", seeded: true, chose: false, gods: "human" },
    stats: { achieve: {} },
    settings: { at: false },
  },
};
hooks.setAutomationTestContext({
  game: wave4Game,
  win: { document: testDocument },
});
hooks.GameLog.logSuccess = (id, message) =>
  wave4Actions.push(["log", id, message]);

hooks.autoPlanetSelection();
hooks.autoJobs(false);
hooks.autoBuild();
hooks.autoResearch();
hooks.autoMutateTrait();

assert.deepEqual(wave4Actions, [
  ["planetHover", "mouseover"],
  ["planetClick"],
  ["buildingWeights"],
  ["projectWeights"],
  ["build"],
  ["research"],
  ["buildingCache"],
  ["projectCache"],
  ["mutate", "strong"],
  ["log", "mutation", "Mutating in Strong for 5 Plasmid"],
]);
assert.equal(hooks.automationResources.Plasmid.currentQuantity, 15);

const setWave4Conflict = (getCostConflict) =>
  hooks.setWave4TestContext({
    generatePlanets: () => [planet],
    getStarLevel: () => 1,
    isAchievementUnlocked: () => true,
    races: {},
    JobManager: { managedPriorityList: () => [] },
    BuildingManager: testBuildingManager,
    ProjectManager: testProjectManager,
    MutableTraitManager: testMutableTraitManager,
    getCostConflict,
  });

wave4Actions.length = 0;
building.extraDescription = "";
setWave4Conflict(() => ({
  status: "conflict",
  targetNames: ["Queued Project"],
  resourceNames: ["Iron"],
  targetCause: "Queue",
}));
hooks.autoBuild();
assert.deepEqual(wave4Actions, [["buildingWeights"], ["projectWeights"]]);
assert.equal(
  building.extraDescription,
  'Conflicts with <span class="has-text-info">Queued Project</span> for <span class="has-text-info">Iron</span> (Queue)<br>',
);

wave4Actions.length = 0;
building.extraDescription = "";
setWave4Conflict(() => ({
  status: "unavailable",
  reason: "invalid-resource",
}));
hooks.autoBuild();
assert.deepEqual(wave4Actions, [["buildingWeights"], ["projectWeights"]]);
assert.equal(
  building.extraDescription,
  "Cost reservation data unavailable; skipped for safety<br>",
);

console.log("Wave 4 bundled characterization tests passed");

for (const name of [
  "autoPower",
  "autoStorage",
  "autoFleetOuter",
  "autoFleet",
  "autoMech",
]) {
  assert.equal(typeof hooks[name], "function", `${name} test hook missing`);
}

const wave5Actions = [];
const testFleetOuter = {
  nextShipMsg: null,
  initFleet: () => false,
  updateNextShip: () => wave5Actions.push(["outerUpdate"]),
};
hooks.setWave5TestManagers({
  StorageManager: { initStorage: () => false },
  FleetManagerOuter: testFleetOuter,
  FleetManager: { initFleet: () => false },
  MechManager: {},
});
hooks.automationResources.Power = { isUnlocked: () => false };
const wave5Game = {
  global: { race: { warlord: true }, settings: { at: false } },
};
hooks.setAutomationTestContext({
  game: wave5Game,
  win: { document: testDocument },
});

hooks.autoPower();
hooks.autoStorage();
hooks.autoFleetOuter();
hooks.autoFleet();
hooks.autoMech();

assert.deepEqual(wave5Actions, [["outerUpdate"]]);
assert.equal(testFleetOuter.nextShipMsg, "No ships needed yet");

console.log("Wave 5 bundled characterization tests passed");
