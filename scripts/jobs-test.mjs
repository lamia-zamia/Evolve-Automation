import assert from "node:assert/strict";

import { createAutoJobs } from "../src/automation/civic/jobs.ts";

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
} = {}) {
  const entertainer = {
    workers: entertainerWorkers,
    is: { split: false, serve: false },
    isSmartEnabled: true,
    isDefault: () => false,
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

  const automate = createAutoJobs({
    getJobManager: () => ({
      craftingJobs: [],
      craftingMax: () => 0,
      managedPriorityList: () => [entertainer],
    }),
    getGame: () => ({
      global: {
        civic: {
          crew: { max: 0, workers: 0 },
          govern: { type: "republic" },
          taxes: { display: true, tax_rate: taxRate },
        },
        race: {},
        tech: { theatre: 10 },
      },
    }),
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

console.log("Jobs automation regression tests passed");
