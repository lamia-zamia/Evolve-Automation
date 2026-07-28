import assert from "node:assert/strict";

import { runJobsAutomation } from "../src/application/jobs.ts";
import {
  createJobsAdapter,
  readVacuumCollapseManaStageReady,
} from "../src/adapters/evolve/civic/jobs.ts";
import {
  focusCrystalMinerWeighting,
  planJobs,
} from "../src/domain/civic/jobs.ts";

assert.equal(focusCrystalMinerWeighting(50, [50, 50, 75, 125], false), 50);
assert.equal(focusCrystalMinerWeighting(0, [50, 50, 75, 125], true), 301);
assert.equal(focusCrystalMinerWeighting(50, [50, 50, 75, 125], true), 301);
assert.equal(focusCrystalMinerWeighting(400, [50, 50, 75, 125], true), 400);

const vacuumSettings = {
  prestigeType: "vacuum",
  prestigeVacuumMana: 10,
};
assert.equal(
  readVacuumCollapseManaStageReady(vacuumSettings, {
    Mana: { rateOfChange: 9 },
  }),
  false,
);
assert.equal(
  readVacuumCollapseManaStageReady(vacuumSettings, {
    Mana: { rateOfChange: 10 },
  }),
  true,
);
assert.equal(
  readVacuumCollapseManaStageReady(
    { ...vacuumSettings, prestigeType: "mad" },
    { Mana: { rateOfChange: 10 } },
  ),
  false,
);

function createNewAutoJobs(dependencies) {
  const haveTech = dependencies.getHaveTech();
  const haveTask = dependencies.getHaveTask();
  const adapter = createJobsAdapter({
    getJobManager: dependencies.getJobManager,
    getGame: dependencies.getGame,
    getJobs: dependencies.getJobs,
    getCrafter: dependencies.getCrafter,
    getSettings: dependencies.getSettings,
    getBuildings: dependencies.getBuildings,
    getResources: dependencies.getResources,
    getState: dependencies.getState,
    getDebugWindow: dependencies.getWindow,
    isDemonRace: dependencies.isDemonRace,
    isLumberRace: dependencies.isLumberRace,
    traitValue: dependencies.traitVal,
    haveTech,
    haveTask,
    ticksPerSecond: dependencies.ticksPerSecond,
    findRequiredResourceWeight: dependencies.findRequiredResourceWeight,
    taxCap: (minimum) => dependencies.getPoly().taxCap(minimum),
    isCraftingJob: dependencies.isCraftingJob,
    getFoodConsume: dependencies.getFoodConsume,
    log: () => {},
  });
  return (craftOnly) => runJobsAutomation(adapter, craftOnly);
}

function runEntertainerCase({
  authority = 57,
  authorityManage = true,
  authorityTarget = -1,
  authorityEntertainerCap,
  authoritySoldiersAdjusted = false,
  autoTax = true,
  entertainerWorkers = 10,
  morale = 164,
  moraleCap = 164,
  moralePotential = 164,
  superstar = false,
  taxRate = 50,
  factory = createNewAutoJobs,
} = {}) {
  const entertainer = {
    id: "entertainer",
    workers: entertainerWorkers,
    servants: 0,
    max: Number.MAX_SAFE_INTEGER,
    is: { split: false, serve: false },
    isSmartEnabled: true,
    isDefault: () => false,
    isManaged: () => true,
    isUnlocked: () => true,
    getBreakpoint: () => 10,
    breakpointEmployees: () => 10,
    get count() {
      return this.workers;
    },
    removeWorkers(count) {
      this.workers -= count;
    },
    addWorkers(count) {
      this.workers += count;
    },
  };
  const unusedJob = {
    isSmartEnabled: false,
    isManaged: () => false,
    isUnlocked: () => false,
  };
  const jobs = {
    Entertainer: entertainer,
    Farmer: unusedJob,
    Hunter: unusedJob,
    Lumberjack: unusedJob,
    QuarryWorker: unusedJob,
    CrystalMiner: unusedJob,
    Scavenger: unusedJob,
    Forager: unusedJob,
    Miner: unusedJob,
  };
  const resources = {
    Authority: {
      currentQuantity: authority,
      maxQuantity: 121,
      isUnlocked: () => true,
    },
    Horseshoe: { usefulRatio: 1 },
    Morale: {
      currentQuantity: morale,
      incomeAdusted: false,
      maxQuantity: moraleCap,
      rateOfChange: moralePotential,
    },
    Population: { currentQuantity: 100, storageRatio: 1 },
  };
  const state = {
    astroSign: "",
    authorityEntertainerCap,
    authoritySoldiersAdjustedTick: authoritySoldiersAdjusted ? 7 : undefined,
    lastFarmerCount: 0,
    lastPopulationCount: 100,
    scriptTick: 7,
  };
  const jobManager = {
    craftingJobs: [],
    craftingMax: () => 0,
    managedPriorityList: () => [entertainer],
  };
  const game = {
    global: {
      civic: {
        crew: { max: 0, workers: 0 },
        govern: { type: "republic" },
        taxes: { display: true, tax_rate: taxRate },
      },
      genes: {},
      race: {},
      tech: { theatre: 10 },
    },
  };

  const automate = factory({
    getJobManager: () => jobManager,
    getGame: () => game,
    getJobs: () => jobs,
    isDemonRace: () => false,
    isLumberRace: () => false,
    getSettings: () => ({
      authorityManage,
      autoCraftsmen: false,
      autoTax,
      generalMinimumAuthority: authorityTarget,
      generalRequestedTaxRate: -1,
      jobDisableMiners: false,
      jobManageServants: false,
      jobSetDefault: false,
      jobRaiderWeighting: 0,
      jobLumberWeighting: 0,
      jobQuarryWeighting: 0,
      jobCrystalWeighting: 0,
      jobScavengerWeighting: 0,
      jobForagerWeighting: 0,
      productionCraftsmen: "always",
      productionFoundryWeighting: "other",
      useDemanded: false,
    }),
    traitVal: (_trait, _index, operation) =>
      operation === "=" || operation === "-" ? 1 : 0,
    getCrafter: () => ({}),
    getWindow: () => ({}),
    getBuildings: () => ({ GatewayStarbase: { count: 0 } }),
    getHaveTech: () => (tech) => tech === "superstar" && superstar,
    getResources: () => resources,
    ticksPerSecond: () => 1,
    getState: () => state,
    findRequiredResourceWeight: () => 0,
    getPoly: () => ({ taxCap: (minimum) => (minimum ? 0 : 50) }),
    isCraftingJob: () => false,
    getHaveTask: () => () => false,
    getFoodConsume: () => 1,
  });

  automate(false);
  return { entertainer, resources, state };
}

const authorityFallback = runEntertainerCase();
assert.equal(
  authorityFallback.entertainer.workers,
  5,
  "Authority fallback removes enough entertainers to restore at least 100 Authority",
);
assert.equal(authorityFallback.state.authorityEntertainerCap, 5);

const taxFirst = runEntertainerCase({ taxRate: 49 });
assert.equal(
  taxFirst.entertainer.workers,
  10,
  "tax increases take priority over removing entertainers",
);

const soldiersFirst = runEntertainerCase({ authoritySoldiersAdjusted: true });
assert.equal(
  soldiersFirst.entertainer.workers,
  10,
  "a fresh Hell garrison adjustment takes priority over removing entertainers",
);

const preservedFallback = runEntertainerCase({
  authorityEntertainerCap: 5,
  taxRate: 49,
});
assert.equal(
  preservedFallback.entertainer.workers,
  5,
  "an established entertainer cap remains while the higher-priority tax control runs",
);

const stableFloor = runEntertainerCase({
  authority: 107,
  authorityEntertainerCap: 5,
  entertainerWorkers: 5,
  morale: 114,
  moralePotential: 114,
});
assert.equal(
  stableFloor.entertainer.workers,
  5,
  "the fallback remains stable after Authority recovers instead of flickering",
);

const alreadySafe = runEntertainerCase({ authority: 100 });
assert.equal(
  alreadySafe.entertainer.workers,
  10,
  "entertainers remain assigned when current morale still leaves 100 Authority",
);

const superstarFallback = runEntertainerCase({ superstar: true });
assert.equal(
  superstarFallback.entertainer.workers,
  5,
  "Superstar entertainers remain subject to the Authority floor",
);

for (const disabled of [{ authorityManage: false }, { authorityTarget: 0 }]) {
  const result = runEntertainerCase({
    ...disabled,
    authorityEntertainerCap: 5,
  });
  assert.equal(result.entertainer.workers, 10);
  assert.equal(
    result.state.authorityEntertainerCap,
    undefined,
    "disabling target-based Authority management clears its entertainer cap",
  );
}

function runCraftDistribution(factory, specialBuilding = false) {
  const trace = [];
  const makeResource = (id, currentQuantity) => ({
    id,
    currentQuantity,
    rateOfChange: 0,
    storageRequired: 1000,
    craftWeighting: 1,
    craftPreserve: 0,
    autoCraftEnabled: true,
    cost: {},
    isDemanded: () => false,
  });
  const makeCraftJob = (id, workers, currentQuantity) => {
    const craftResource = makeResource(id, currentQuantity);
    return {
      id,
      resource: craftResource,
      workers,
      servants: 0,
      max: 20,
      is: { split: false, serve: true },
      isSmartEnabled: false,
      isDefault: () => false,
      isManaged: () => true,
      isUnlocked: () => true,
      get count() {
        return this.workers;
      },
      // Real CraftingJob instances have no job_b1_<id> settings, so
      // breakpointEmployees would return NaN. The adapter must skip crafting
      // jobs when reading breakpoints, mirroring the legacy assignment loop.
      breakpointEmployees: () =>
        assert.fail("crafting job breakpoints must never be read"),
      removeWorkers(count) {
        trace.push(`remove:${id}:${count}`);
        this.workers -= count;
      },
      addWorkers(count) {
        trace.push(`add:${id}:${count}`);
        this.workers += count;
      },
      removeServants: () => assert.fail("servants are disabled"),
      addServants: () => assert.fail("servants are disabled"),
    };
  };
  const first = makeCraftJob(specialBuilding ? "Scarletite" : "first", 4, 100);
  const second = makeCraftJob("second", 0, 105);
  const craftingJobs = specialBuilding ? [first] : [first, second];
  const manager = {
    craftingJobs,
    craftingMax: () => 4,
    managedPriorityList: () => craftingJobs,
  };
  const game = {
    global: {
      civic: { crew: { max: 0, workers: 0 } },
      genes: {},
      race: {},
      tech: {},
    },
  };
  const settings = {
    authorityManage: false,
    autoCraftsmen: true,
    autoTax: false,
    generalMinimumAuthority: 0,
    generalRequestedTaxRate: -1,
    jobDisableMiners: false,
    jobManageServants: false,
    jobSetDefault: false,
    productionCraftsmen: "always",
    productionFoundryWeighting: "other",
    useDemanded: false,
  };
  const state = {
    astroSign: "",
    lastFarmerCount: 0,
    lastPopulationCount: 10,
    unlockedBuildings: [],
  };
  const resources = {
    Horseshoe: { usefulRatio: 1 },
    Population: { currentQuantity: 10, storageRatio: 1 },
    ...(specialBuilding ? { Scarletite: first.resource } : {}),
  };
  const jobs = {};
  const automate = factory({
    getJobManager: () => manager,
    getGame: () => game,
    getJobs: () => jobs,
    isDemonRace: () => false,
    isLumberRace: () => false,
    getSettings: () => settings,
    traitVal: (_trait, _index, operation) =>
      operation === "-" || operation === "=" ? 1 : 1,
    getCrafter: () => (specialBuilding ? { Scarletite: first } : {}),
    getWindow: () => ({}),
    getBuildings: () => ({
      GatewayStarbase: { count: 0 },
      ...(specialBuilding ? { RuinsHellForge: { stateOnCount: 5 } } : {}),
    }),
    getHaveTech: () => () => false,
    getResources: () => resources,
    ticksPerSecond: () => 1,
    getState: () => state,
    findRequiredResourceWeight: () => 0,
    getPoly: () => ({ taxCap: () => 50 }),
    isCraftingJob: (job) => craftingJobs.includes(job),
    getHaveTask: () => () => false,
    getFoodConsume: () => 1,
  });
  automate(true);
  return {
    trace,
    workers: [first.workers, second.workers],
    state: {
      maximumSpaceMiners: state.maxSpaceMiners,
      lastPopulationCount: state.lastPopulationCount,
      lastFarmerCount: state.lastFarmerCount,
    },
  };
}

let staleOutcome;
const staleFactory = (dependencies) => {
  const haveTech = dependencies.getHaveTech();
  const haveTask = dependencies.getHaveTask();
  const adapter = createJobsAdapter({
    getJobManager: () => dependencies.getJobManager(),
    getGame: dependencies.getGame,
    getJobs: dependencies.getJobs,
    getCrafter: dependencies.getCrafter,
    getSettings: dependencies.getSettings,
    getBuildings: dependencies.getBuildings,
    getResources: dependencies.getResources,
    getState: dependencies.getState,
    getDebugWindow: dependencies.getWindow,
    isDemonRace: dependencies.isDemonRace,
    isLumberRace: dependencies.isLumberRace,
    traitValue: dependencies.traitVal,
    haveTech,
    haveTask,
    ticksPerSecond: dependencies.ticksPerSecond,
    findRequiredResourceWeight: dependencies.findRequiredResourceWeight,
    taxCap: (minimum) => dependencies.getPoly().taxCap(minimum),
    isCraftingJob: dependencies.isCraftingJob,
    getFoodConsume: dependencies.getFoodConsume,
    log: () => {},
  });
  return (craftOnly) => {
    const decision = planJobs(adapter.reader.readCycle(craftOnly));
    dependencies.getJobManager = () => ({});
    staleOutcome = adapter.executor.execute(decision);
  };
};
const staleTrace = runCraftDistribution(staleFactory);
assert.equal(staleOutcome.status, "stale");
assert.deepEqual(
  staleTrace.trace,
  [],
  "stale source rejection performs no writes",
);

const unavailableAdapter = createJobsAdapter({
  getJobManager: () => ({ managedPriorityList: () => [] }),
  getGame: () => assert.fail("empty job cycles must not read game state"),
  getJobs: () => assert.fail("empty job cycles must not read jobs"),
  getCrafter: () => assert.fail("empty job cycles must not read crafters"),
  getSettings: () => assert.fail("empty job cycles must not read settings"),
  getBuildings: () => assert.fail("empty job cycles must not read buildings"),
  getResources: () => assert.fail("empty job cycles must not read resources"),
  getState: () => assert.fail("empty job cycles must not read state"),
  getDebugWindow: () =>
    assert.fail("empty job cycles must not read debug state"),
  isDemonRace: () => assert.fail("empty job cycles must not inspect race"),
  isLumberRace: () => assert.fail("empty job cycles must not inspect race"),
  traitValue: () => assert.fail("empty job cycles must not inspect traits"),
  haveTech: () => assert.fail("empty job cycles must not inspect technology"),
  haveTask: () => assert.fail("empty job cycles must not inspect tasks"),
  ticksPerSecond: () => assert.fail("empty job cycles must not inspect ticks"),
  findRequiredResourceWeight: () =>
    assert.fail("empty job cycles must not inspect resource weights"),
  taxCap: () => assert.fail("empty job cycles must not inspect tax caps"),
  isCraftingJob: () => assert.fail("empty job cycles must not classify jobs"),
  getFoodConsume: () => assert.fail("empty job cycles must not inspect food"),
  log: () => assert.fail("empty job cycles must not log"),
});
assert.equal(planJobs(unavailableAdapter.reader.readCycle(false)), null);

// Carnivore-style Hunter is the game's unemployed pool. Its unlimited
// breakpoint must not consume the worker pool before ordinary jobs receive
// their configured breakpoints.
const virtualHunterDecision = planJobs({
  available: true,
  craftOnly: false,
  hunterActsAsUnemployed: true,
  autoCraftsmen: false,
  autoCraftWithoutBuilding: false,
  craftsmenMode: "other",
  foundryWeighting: "other",
  manageServants: false,
  setDefault: false,
  servantModifier: 1,
  servantsMaximum: 0,
  skilledServantsMaximum: 0,
  craftsmenMaximum: 0,
  minimumDefault: 0,
  reserveMiner: false,
  defaultJobToken: 0,
  hunterToken: 0,
  farmerToken: 0,
  lumberjackToken: null,
  quarryToken: null,
  crystalMinerToken: null,
  scavengerToken: null,
  foragerToken: null,
  entertainerToken: null,
  minerToken: null,
  population: 100,
  craftDebug: false,
  lastCraftWinner: null,
  authority: {
    enabled: false,
    current: 0,
    morale: 0,
    moralePotential: 0,
    moraleMaximum: 0,
    moraleCeiling: null,
    entertainerMorale: 0,
    superstarMorale: 0,
    previousCap: null,
    debug: false,
  },
  jobs: [
    {
      token: 0,
      id: "hunter",
      kind: "hunter",
      workers: 100,
      servants: 0,
      count: 100,
      maximum: Number.MAX_SAFE_INTEGER,
      managed: true,
      unlocked: true,
      smart: true,
      crafting: false,
      serves: false,
      split: false,
      isDefault: true,
      breakpoints: [
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ],
      uncappedBreakpoints: [
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ],
      smartMaximum: 100,
      farmerMinimum: 100,
      demonicLumber: false,
      warlordMiner: false,
    },
    {
      token: 1,
      id: "scientist",
      kind: "other",
      workers: 0,
      servants: 0,
      count: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      managed: true,
      unlocked: true,
      smart: false,
      crafting: false,
      serves: false,
      split: false,
      isDefault: false,
      breakpoints: [6, 10, 10],
      uncappedBreakpoints: [6, 10, 10],
      smartMaximum: null,
      farmerMinimum: null,
      demonicLumber: false,
      warlordMiner: false,
    },
  ],
  crafting: [],
  splitEntries: [],
  defaultPreference: [],
});
assert.notEqual(virtualHunterDecision, null);
assert.equal(
  virtualHunterDecision.assignments[0].workers,
  90,
  "virtual Hunter keeps only the workers left after ordinary breakpoints",
);
assert.equal(
  virtualHunterDecision.assignments[1].workers,
  10,
  "ordinary jobs receive their breakpoint before virtual Hunter fallback",
);

function runFarmerCapacityCase(farmCount) {
  const trace = [];
  const makeJob = ({ id, workers, smart, serves, breakpoint = 0 }) => ({
    id,
    workers,
    servants: 0,
    max: Number.MAX_SAFE_INTEGER,
    is: { split: false, serve: serves },
    isSmartEnabled: smart,
    isDefault: () => false,
    isManaged: () => true,
    isUnlocked: () => true,
    get count() {
      return this.workers;
    },
    getBreakpoint: () => breakpoint,
    breakpointEmployees: () => breakpoint,
    removeWorkers(count) {
      trace.push(`remove:${id}:${count}`);
      this.workers -= count;
    },
    addWorkers(count) {
      trace.push(`add:${id}:${count}`);
      this.workers += count;
    },
    removeServants: () => assert.fail("servants are disabled"),
    addServants: () => assert.fail("servants are disabled"),
  });
  const farmer = makeJob({
    id: "farmer",
    workers: 10,
    smart: true,
    serves: true,
  });
  const scientist = makeJob({
    id: "scientist",
    workers: 0,
    smart: false,
    serves: false,
    breakpoint: 2,
  });
  const jobs = { Farmer: farmer };
  const manager = {
    craftingJobs: [],
    craftingMax: () => 0,
    managedPriorityList: () => [farmer, scientist],
  };
  const settings = {
    authorityManage: false,
    autoCraftsmen: false,
    autoTax: false,
    generalMinimumAuthority: 0,
    generalRequestedTaxRate: -1,
    jobDisableMiners: false,
    jobManageServants: false,
    jobSetDefault: false,
    jobLumberWeighting: 0,
    jobQuarryWeighting: 0,
    jobCrystalWeighting: 0,
    jobScavengerWeighting: 0,
    jobRaiderWeighting: 0,
    jobForagerWeighting: 0,
    productionCraftsmen: "always",
    productionFoundryWeighting: "other",
    useDemanded: false,
  };
  const game = {
    global: {
      civic: {
        crew: { max: 0, workers: 0 },
        govern: { type: "republic" },
        taxes: { display: true, tax_rate: 0 },
      },
      genes: {},
      race: {},
      tech: {},
    },
  };
  const resources = {
    Horseshoe: { usefulRatio: 1 },
    Population: { currentQuantity: 10, storageRatio: 1 },
    Food: {
      currentQuantity: 50,
      maxQuantity: 100,
      rateOfChange: 0,
      isCapped: () => false,
    },
  };
  const state = {
    astroSign: "",
    lastFarmerCount: 10,
    lastPopulationCount: 10,
    unlockedBuildings: [],
  };
  const adapter = createJobsAdapter({
    getJobManager: () => manager,
    getGame: () => game,
    getJobs: () => jobs,
    getCrafter: () => ({}),
    getSettings: () => settings,
    getBuildings: () => ({
      GatewayStarbase: { count: 0 },
      Farm: { count: farmCount },
    }),
    getResources: () => resources,
    getState: () => state,
    getDebugWindow: () => ({}),
    isDemonRace: () => false,
    isLumberRace: () => false,
    traitValue: () => 1,
    haveTech: () => false,
    haveTask: () => false,
    ticksPerSecond: () => 1,
    findRequiredResourceWeight: () => 0,
    taxCap: () => 50,
    isCraftingJob: () => false,
    getFoodConsume: () => 1,
    log: () => {},
  });

  const input = adapter.reader.readCycle(false);
  assert.equal(input.jobs[0].smartMaximum, 4);
  const decision = planJobs(input);
  assert.equal(decision.assignments[0].workers, 4);
  assert.equal(decision.assignments[1].workers, 2);
  runJobsAutomation(adapter, false);
  return { farmer, scientist, trace };
}

const farmerCapacity = runFarmerCapacityCase(3);
assert.equal(
  farmerCapacity.farmer.workers,
  4,
  "farmers stop at farm capacity with a one-worker buffer",
);
assert.equal(
  farmerCapacity.scientist.workers,
  2,
  "other jobs keep their configured breakpoint while farmers stay capped",
);

function runBankerStorageCase({
  moneyCurrent,
  moneyStorageRequired,
  moneyCapped = false,
  taxRate = 50,
  banking = 1,
}) {
  const trace = [];
  const banker = {
    id: "banker",
    workers: 10,
    servants: 0,
    max: Number.MAX_SAFE_INTEGER,
    is: { split: false, serve: false },
    isSmartEnabled: true,
    isDefault: () => false,
    isManaged: () => true,
    isUnlocked: () => true,
    get count() {
      return this.workers;
    },
    breakpointEmployees: (pass) => [3, 5, -1][pass],
    removeWorkers(count) {
      trace.push(`remove:${count}`);
      this.workers -= count;
    },
    addWorkers(count) {
      trace.push(`add:${count}`);
      this.workers += count;
    },
    removeServants: () => assert.fail("servants are disabled"),
    addServants: () => assert.fail("servants are disabled"),
  };
  const manager = {
    craftingJobs: [],
    craftingMax: () => 0,
    managedPriorityList: () => [banker],
  };
  const game = {
    global: {
      civic: {
        crew: { max: 0, workers: 0 },
        govern: { type: "republic" },
        taxes: { display: true, tax_rate: taxRate },
      },
      genes: {},
      race: {},
      tech: { banking },
    },
  };
  const settings = {
    authorityManage: false,
    autoCraftsmen: false,
    autoTax: false,
    generalMinimumAuthority: 0,
    generalRequestedTaxRate: -1,
    jobDisableMiners: false,
    jobManageServants: false,
    jobSetDefault: false,
    jobLumberWeighting: 0,
    jobQuarryWeighting: 0,
    jobCrystalWeighting: 0,
    jobScavengerWeighting: 0,
    jobRaiderWeighting: 0,
    jobForagerWeighting: 0,
    productionCraftsmen: "always",
    productionFoundryWeighting: "other",
    useDemanded: false,
  };
  const resources = {
    Horseshoe: { usefulRatio: 1 },
    Money: {
      currentQuantity: moneyCurrent,
      storageRequired: moneyStorageRequired,
      isCapped: () => moneyCapped,
    },
    Population: { currentQuantity: 10, storageRatio: 1 },
  };
  const jobs = { Banker: banker };
  const state = {
    astroSign: "",
    lastFarmerCount: 0,
    lastPopulationCount: 10,
    unlockedBuildings: [],
  };
  const adapter = createJobsAdapter({
    getJobManager: () => manager,
    getGame: () => game,
    getJobs: () => jobs,
    getCrafter: () => ({}),
    getSettings: () => settings,
    getBuildings: () => ({ GatewayStarbase: { count: 0 } }),
    getResources: () => resources,
    getState: () => state,
    getDebugWindow: () => ({}),
    isDemonRace: () => false,
    isLumberRace: () => false,
    traitValue: () => 1,
    haveTech: (technology, rank = 1) =>
      technology === "banking" && banking >= rank,
    haveTask: () => false,
    ticksPerSecond: () => 1,
    findRequiredResourceWeight: () => 0,
    taxCap: () => 50,
    isCraftingJob: () => false,
    getFoodConsume: () => 1,
    log: () => {},
  });
  const input = adapter.reader.readCycle(false);
  const decision = planJobs(input);
  assert.notEqual(decision, null);
  runJobsAutomation(adapter, false);
  return { input, banker, trace };
}

const bankerStillNeeded = runBankerStorageCase({
  moneyCurrent: 9,
  moneyStorageRequired: 10,
});
assert.equal(
  bankerStillNeeded.input.jobs[0].smartMaximum,
  null,
  "bankers remain available while planned Money storage is still short",
);
assert.equal(bankerStillNeeded.banker.workers, 5);

const bankerSurplus = runBankerStorageCase({
  moneyCurrent: 10,
  moneyStorageRequired: 10,
});
assert.equal(
  bankerSurplus.input.jobs[0].smartMaximum,
  0,
  "satisfied Money storage marks bankers as surplus",
);
assert.equal(bankerSurplus.banker.workers, 0);
assert.deepEqual(bankerSurplus.trace, ["remove:10"]);

const bankerStorageGuarded = runBankerStorageCase({
  moneyCurrent: 10,
  moneyStorageRequired: 10,
  banking: 7,
});
assert.equal(
  bankerStorageGuarded.input.jobs[0].smartMaximum,
  null,
  "Banking 7 keeps bankers because they also provide Money capacity",
);

function runDefaultTransferCase() {
  const trace = [];
  const game = {
    global: {
      civic: {
        d_job: "unemployed",
        crew: { max: 0, workers: 0 },
        govern: { type: "republic" },
        taxes: { display: true, tax_rate: 0 },
      },
      genes: {},
      race: {},
      tech: {},
    },
  };
  const makeJob = ({
    id,
    workers,
    breakpoint,
    managed = true,
    unlocked = true,
  }) => ({
    id,
    workers,
    servants: 0,
    max: Number.MAX_SAFE_INTEGER,
    is: { split: false, serve: false },
    isSmartEnabled: false,
    isDefault: () => game.global.civic.d_job === id,
    isManaged: () => managed,
    isUnlocked: () => unlocked,
    get count() {
      return this.workers;
    },
    getBreakpoint: () => breakpoint,
    breakpointEmployees: () => breakpoint,
    removeWorkers(count) {
      if (this.isDefault()) return false;
      trace.push(`remove:${id}:${count}`);
      this.workers -= count;
      return true;
    },
    addWorkers(count) {
      if (this.isDefault()) return false;
      trace.push(`add:${id}:${count}`);
      this.workers += count;
      return true;
    },
    removeServants: () => false,
    addServants: () => false,
    setAsDefault() {
      trace.push(`default:${id}`);
      game.global.civic.d_job = id;
    },
  });
  const unemployed = makeJob({ id: "unemployed", workers: 10, breakpoint: 0 });
  const quarry = makeJob({ id: "quarry_worker", workers: 0, breakpoint: 1 });
  const inactive = makeJob({
    id: "inactive",
    workers: 0,
    breakpoint: 0,
    managed: false,
    unlocked: false,
  });
  const jobs = {
    Unemployed: unemployed,
    QuarryWorker: quarry,
    Lumberjack: inactive,
    CrystalMiner: inactive,
    Scavenger: inactive,
    Forager: inactive,
    Hunter: inactive,
    Farmer: inactive,
    Teamster: inactive,
  };
  const settings = {
    authorityManage: false,
    autoCraftsmen: false,
    autoTax: false,
    generalMinimumAuthority: 0,
    generalRequestedTaxRate: -1,
    jobDisableMiners: false,
    jobManageServants: false,
    jobSetDefault: true,
    jobLumberWeighting: 0,
    jobQuarryWeighting: 0,
    jobCrystalWeighting: 0,
    jobScavengerWeighting: 0,
    jobRaiderWeighting: 0,
    jobForagerWeighting: 0,
    productionCraftsmen: "always",
    productionFoundryWeighting: "other",
    useDemanded: false,
  };
  const resources = {
    Horseshoe: { usefulRatio: 1 },
    Population: { currentQuantity: 10, storageRatio: 1 },
    Stone: {
      isUnlocked: () => true,
      isUseful: () => true,
      storageRatio: 1,
      currentQuantity: 10,
      rateOfChange: 0,
      maxQuantity: 100,
      getBusyWorkers: () => 0,
    },
  };
  const manager = {
    craftingJobs: [],
    craftingMax: () => 0,
    managedPriorityList: () => [unemployed, quarry],
  };
  const automate = createNewAutoJobs({
    getJobManager: () => manager,
    getGame: () => game,
    getJobs: () => jobs,
    isDemonRace: () => false,
    isLumberRace: () => false,
    getSettings: () => settings,
    traitVal: () => 1,
    getCrafter: () => ({}),
    getWindow: () => ({}),
    getBuildings: () => ({ GatewayStarbase: { count: 0 } }),
    getHaveTech: () => () => false,
    getResources: () => resources,
    ticksPerSecond: () => 1,
    getState: () => ({
      astroSign: "",
      lastFarmerCount: 0,
      lastPopulationCount: 10,
      unlockedBuildings: [],
    }),
    findRequiredResourceWeight: () => 0,
    getPoly: () => ({ taxCap: () => 50 }),
    isCraftingJob: () => false,
    getHaveTask: () => () => false,
    getFoodConsume: () => 1,
  });
  automate(false);
  return { quarry, trace };
}

const defaultTransfer = runDefaultTransferCase();
assert.equal(
  defaultTransfer.quarry.workers,
  10,
  "default selection happens after worker additions",
);
assert.deepEqual(defaultTransfer.trace, [
  "add:quarry_worker:10",
  "default:quarry_worker",
]);

console.log("Jobs automation regression tests passed");
