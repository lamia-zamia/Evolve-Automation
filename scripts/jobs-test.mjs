import assert from "node:assert/strict";

import { createLegacyAutoJobs } from "./test-support/legacy-auto-jobs.ts";
import { runJobsAutomation } from "../src/application/jobs.ts";
import { createJobsAdapter } from "../src/adapters/evolve/jobs.ts";
import { planJobs } from "../src/domain/jobs.ts";

const createAutoJobs = createLegacyAutoJobs;

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

const craftingJob = {
  workers: 0,
  is: { split: false },
  isDefault: () => false,
  breakpointEmployees: () => assert.fail("crafting jobs must be skipped"),
};
let typeChecks = 0;
const autoJobs = createAutoJobs({
  getJobManager: () => ({
    managedPriorityList: () => [craftingJob],
    craftingMax: () => 0,
  }),
  getGame: () => ({
    global: { race: {}, civic: { crew: { max: 0, workers: 0 } } },
  }),
  getJobs: () => ({}),
  isDemonRace: () => false,
  isLumberRace: () => false,
  getSettings: () => ({
    autoCraftsmen: false,
    jobManageServants: false,
    jobSetDefault: false,
  }),
  traitVal: () => 1,
  getCrafter: () => ({}),
  getWindow: () => ({}),
  getBuildings: () => ({ GatewayStarbase: { count: 0 } }),
  getHaveTech: () => () => false,
  getResources: () => ({ Population: { currentQuantity: 0 } }),
  ticksPerSecond: () => 1,
  getState: () => ({}),
  findRequiredResourceWeight: () => 0,
  getPoly: () => ({}),
  getHaveTask: () => () => false,
  getFoodConsume: () => 1,
  isCraftingJob: (job) => {
    typeChecks++;
    return job === craftingJob;
  },
});

assert.doesNotThrow(() => autoJobs(true));
assert.equal(typeChecks, 1);

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
  factory = createLegacyAutoJobs,
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

for (const fixture of [
  {},
  { taxRate: 49 },
  { authoritySoldiersAdjusted: true },
  { authorityEntertainerCap: 5, taxRate: 49 },
  {
    authority: 107,
    authorityEntertainerCap: 5,
    entertainerWorkers: 5,
    morale: 114,
    moralePotential: 114,
  },
  { authority: 100 },
  { superstar: true },
  { authorityManage: false, authorityEntertainerCap: 5 },
  { authorityTarget: 0, authorityEntertainerCap: 5 },
]) {
  const legacy = runEntertainerCase(fixture);
  const modern = runEntertainerCase({ ...fixture, factory: createNewAutoJobs });
  assert.deepEqual(
    {
      workers: modern.entertainer.workers,
      authorityCap: modern.state.authorityEntertainerCap,
      moraleAdjusted: modern.resources.Morale.incomeAdusted,
      lastPopulation: modern.state.lastPopulationCount,
      lastFarmers: modern.state.lastFarmerCount,
    },
    {
      workers: legacy.entertainer.workers,
      authorityCap: legacy.state.authorityEntertainerCap,
      moraleAdjusted: legacy.resources.Morale.incomeAdusted,
      lastPopulation: legacy.state.lastPopulationCount,
      lastFarmers: legacy.state.lastFarmerCount,
    },
    `old/new entertainer trace mismatch for ${JSON.stringify(fixture)}`,
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

assert.deepEqual(
  runCraftDistribution(createNewAutoJobs),
  runCraftDistribution(createLegacyAutoJobs),
  "craft focus, remove-before-add ordering, and state trace remain equivalent",
);
assert.deepEqual(
  runCraftDistribution(createNewAutoJobs, true),
  runCraftDistribution(createLegacyAutoJobs, true),
  "building-bound crafting does not over-assign beyond the sampled craftsman pool",
);

function runSplitAllocation(
  factory,
  externalDefault = false,
  smartSetting = false,
) {
  const trace = [];
  const makeJob = (id, workers, weight) => ({
    id,
    workers,
    servants: 0,
    max: Number.MAX_SAFE_INTEGER,
    is: { split: true, serve: false },
    isSmartEnabled: smartSetting === null ? undefined : smartSetting,
    isDefault: () => false,
    isManaged: () => !externalDefault,
    isUnlocked: () => true,
    get count() {
      return this.workers;
    },
    getBreakpoint: (pass) => [2, 4, -1][pass],
    breakpointEmployees: (pass) => [2, 4, Number.MAX_SAFE_INTEGER][pass],
    removeWorkers(count) {
      trace.push(`remove:${id}:${count}`);
      this.workers -= count;
    },
    addWorkers(count) {
      trace.push(`add:${id}:${count}`);
      this.workers += count;
    },
    setAsDefault() {
      trace.push(`default:${id}`);
    },
    weight,
  });
  const lumberjack = makeJob("lumberjack", 6, 1);
  const quarry = makeJob("quarry", 0, 2);
  const unavailableDefault = {
    isManaged: () => false,
    isUnlocked: () => false,
  };
  const jobs = {
    Lumberjack: lumberjack,
    QuarryWorker: quarry,
    CrystalMiner: unavailableDefault,
    Forager: unavailableDefault,
    Hunter: unavailableDefault,
    Farmer: unavailableDefault,
    Teamster: unavailableDefault,
    Unemployed: unavailableDefault,
    ...(externalDefault
      ? {
          Scavenger: {
            isManaged: () => false,
            isUnlocked: () => true,
            setAsDefault: () => trace.push("default:scavenger"),
          },
        }
      : {}),
  };
  const manager = {
    craftingJobs: [],
    craftingMax: () => 0,
    managedPriorityList: () => [lumberjack, quarry],
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
    autoCraftsmen: false,
    autoTax: false,
    generalMinimumAuthority: 0,
    generalRequestedTaxRate: -1,
    jobDisableMiners: false,
    jobManageServants: false,
    jobSetDefault: true,
    jobLumberWeighting: 1,
    jobQuarryWeighting: 2,
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
  };
  const automate = factory({
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
    getState: () => state,
    findRequiredResourceWeight: () => 0,
    getPoly: () => ({ taxCap: () => 50 }),
    isCraftingJob: () => false,
    getHaveTask: () => () => false,
    getFoodConsume: () => 1,
  });
  automate(false);
  return {
    trace,
    workers: [lumberjack.workers, quarry.workers],
    lastPopulationCount: state.lastPopulationCount,
  };
}

assert.deepEqual(
  runSplitAllocation(createNewAutoJobs),
  runSplitAllocation(createLegacyAutoJobs),
  "weighted split allocation, remove-before-add, and default selection remain equivalent",
);
assert.deepEqual(
  runSplitAllocation(createNewAutoJobs, true),
  runSplitAllocation(createLegacyAutoJobs, true),
  "an unlocked unmanaged fallback can become default outside the managed allocation list",
);
assert.deepEqual(
  runSplitAllocation(createNewAutoJobs, false, null),
  runSplitAllocation(createLegacyAutoJobs, false, null),
  "an absent smart-job setting is normalized to disabled like the legacy truthiness check",
);

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

console.log("Jobs automation regression tests passed");
