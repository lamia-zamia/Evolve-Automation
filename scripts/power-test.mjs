import assert from "node:assert/strict";

import { createPowerAutomation } from "../src/application/power.ts";
import { createPowerWarningSource } from "../src/adapters/browser/power-warnings.ts";
import { createPowerAdapter } from "../src/adapters/evolve/power.ts";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  getBestPowerSupplyRatio,
  getCitadelPowerConsumption,
  planPowerCycle,
  planPowerWarningShutdown,
  recordPowerWarningCap,
} from "../src/domain/economy/production/power.ts";

class TestSupport {}

function resource(id, trace, overrides = {}) {
  let current = overrides.currentQuantity ?? 0;
  let rate = overrides.rateOfChange ?? 0;
  let adjusted = overrides.incomeAdjusted ?? false;
  const value = {
    id,
    title: overrides.title ?? id,
    maxQuantity: overrides.maxQuantity ?? 100,
    storageRatio: overrides.storageRatio ?? 0.5,
    income: overrides.income ?? rate,
    maxCost: overrides.maxCost ?? 0,
    isUnlocked: overrides.isUnlocked ?? (() => true),
    isUseful: overrides.isUseful ?? (() => true),
    getProduction: overrides.getProduction ?? (() => 0),
  };
  Object.defineProperties(value, {
    currentQuantity: {
      get: () => current,
      set: (next) => {
        trace.push(["current", id, next]);
        current = next;
      },
      enumerable: true,
    },
    rateOfChange: {
      get: () => rate,
      set: (next) => {
        trace.push(["rate", id, next]);
        rate = next;
      },
      enumerable: true,
    },
    incomeAdusted: {
      get: () => adjusted,
      set: (next) => {
        trace.push(["adjusted", id, next]);
        adjusted = next;
      },
      enumerable: true,
    },
  });
  return value;
}

function supportResource(id, trace, overrides = {}) {
  const value = resource(id, trace, overrides);
  Object.setPrototypeOf(value, TestSupport.prototype);
  return value;
}

function building(id, trace, overrides = {}) {
  let stateOn = overrides.stateOn ?? 0;
  let description = overrides.extraDescription ?? "";
  const value = {
    id,
    _vueBinding: overrides.binding ?? `bind-${id}`,
    count: overrides.count ?? 1,
    powered: overrides.powered ?? 0,
    autoMax: overrides.autoMaximum ?? overrides.count ?? 1,
    _tab: overrides.tab ?? "city",
    autoStateSmart: overrides.smartEnabled ?? false,
    autoStateEnabled: overrides.autoStateEnabled ?? true,
    is: {
      smart: overrides.smartCategory ?? false,
      ship: overrides.ship ?? false,
    },
    consumption: overrides.consumptions ?? [],
    produces: overrides.produces,
    getFuelRate(index) {
      return this.consumption[index].fuelRate;
    },
    isSmartManaged: overrides.isSmartManaged ?? (() => false),
    isAutoBuildable: overrides.isAutoBuildable ?? (() => false),
    cost: overrides.cost ?? {},
    tryAdjustState(amount) {
      trace.push(["adjust", id, amount]);
      stateOn += amount;
      return amount !== 0;
    },
  };
  Object.defineProperties(value, {
    stateOnCount: {
      get: () => stateOn,
      enumerable: true,
    },
    extraDescription: {
      get: () => description,
      set: (next) => {
        trace.push(["description", id, next]);
        description = next;
      },
      enumerable: true,
    },
  });
  return value;
}

function passiveBuilding(id) {
  return building(id, [], {
    count: 0,
    stateOn: 0,
    isSmartManaged: () => false,
  });
}

function makeFixture(spec = {}) {
  const trace = [];
  const Power = resource("Power", trace, {
    currentQuantity: spec.power ?? 10,
    maxQuantity: spec.powerMaximum ?? 10,
    rateOfChange: spec.power ?? 10,
    isUnlocked: () => spec.unlocked ?? true,
  });
  const Fuel = spec.support
    ? supportResource("Fuel", trace, {
        currentQuantity: spec.fuelCurrent ?? 0,
        maxQuantity: spec.fuelMaximum ?? 10,
        rateOfChange: spec.fuelRate ?? 0,
        storageRatio: spec.fuelStorageRatio ?? 0.5,
        isUseful: () => spec.fuelUseful ?? true,
      })
    : resource("Fuel", trace, {
        currentQuantity: spec.fuelCurrent ?? 0,
        maxQuantity: spec.fuelMaximum ?? 100,
        rateOfChange: spec.fuelRate ?? 0,
        storageRatio: spec.fuelStorageRatio ?? 0.5,
        isUseful: () => spec.fuelUseful ?? true,
      });
  const managed = (spec.buildings ?? []).map((entry) =>
    building(entry.id, trace, {
      ...entry,
      consumptions: (entry.consumptions ?? []).map((consumption) => ({
        resource: consumption.resource === "Power" ? Power : Fuel,
        rate: consumption.rate,
        fuelRate: consumption.fuelRate ?? consumption.rate,
      })),
      produces: entry.produces?.map((id) => (id === "Power" ? Power : Fuel)),
    }),
  );
  const catalog = {
    Power,
    Fuel,
    Banquet: passiveBuilding("Banquet"),
    LakeTransport: passiveBuilding("LakeTransport"),
    LakeBireme: passiveBuilding("LakeBireme"),
    SpirePort: passiveBuilding("SpirePort"),
    SpireBaseCamp: passiveBuilding("SpireBaseCamp"),
  };
  const settings = {
    buildingsLimitPowered: spec.limitPowered ?? false,
    autoFleet: false,
  };
  const game = {
    global: {
      settings: { showGalactic: spec.showGalactic ?? true },
      race: { fasting: spec.fasting ?? false },
      tech: {},
    },
  };
  const manager = {
    managedStatePriorityList: () => managed,
  };
  return {
    trace,
    game,
    settings,
    state: {},
    resources: { Power, Fuel },
    buildings: catalog,
    jobs: {},
    manager,
    fleet: {},
    mech: {},
    war: {},
    poly: {},
    managed,
  };
}

function adapterDependencies(fixture, overrides = {}) {
  return {
    getGame: () => fixture.game,
    getSettings: () => fixture.settings,
    getState: () => fixture.state,
    getResources: () => fixture.resources,
    getBuildings: () => fixture.buildings,
    getJobs: () => fixture.jobs,
    getBuildingManager: () => fixture.manager,
    getFleetManager: () => fixture.fleet,
    getMechManager: () => fixture.mech,
    getWarManager: () => fixture.war,
    getPoly: () => fixture.poly,
    getBuildingIds: () => ({}),
    consumptionBalanceMinimum: 60,
    isSupportResource: (value) => value instanceof TestSupport,
    readDebugEnabled: () => false,
    haveTech: () => false,
    isHellSuppressionUseful: () => false,
    getGalaxyRegions: () => [],
    traitValue: (_name, fallback) => fallback || 1,
    getAuthorityGarrisonRequirement: () => ({ status: "unavailable" }),
    getHealingRate: () => 0,
    isHungryRace: () => false,
    isPillarFinished: () => false,
    log: (message) => fixture.trace.push(["log", message]),
    ...overrides,
  };
}

function runNew(fixture) {
  const adapter = createPowerAdapter(adapterDependencies(fixture));
  const automation = createPowerAutomation({
    reader: adapter.reader,
    executor: adapter.executor,
    warnings: {
      readDebugEnabled: () => false,
      readWarnedBuildingDomIds: () => [],
    },
  });
  automation.run();
  return automation.readState();
}

function runLegacyGeneric(
  fixture,
  legacyState = { oscillations: {}, warningCaps: {} },
) {
  const { resources, settings, game, managed } = fixture;
  if (!resources.Power.isUnlocked()) return legacyState;
  if (managed.length === 0) return legacyState;
  let available = resources.Power.currentQuantity;
  const missing = {};
  for (const entry of managed) {
    available += entry.powered * entry.stateOnCount;
    for (let index = 0; index < entry.consumption.length; index++) {
      const consumption = entry.consumption[index];
      consumption.resource.rateOfChange +=
        entry.getFuelRate(index) * entry.stateOnCount;
      if (consumption.resource instanceof TestSupport && consumption.rate < 0) {
        missing[consumption.resource.id] =
          (missing[consumption.resource.id] ?? 0) + 1;
      }
    }
  }
  let reserved = 0;
  const reserves = {};
  for (const entry of managed) {
    if (!entry.produces || entry.powered <= 0) continue;
    const consumed = entry.produces.some((produced) =>
      managed.some((candidate) =>
        candidate.consumption.some(
          (consumption) =>
            consumption.resource === produced && consumption.rate > 0,
        ),
      ),
    );
    if (!consumed) continue;
    const cap = settings.buildingsLimitPowered
      ? Math.min(entry.count, entry.autoMax)
      : entry.count;
    const growth = entry.produces.some((produced) => produced.isUseful())
      ? 1
      : 0;
    reserves[entry._vueBinding] =
      entry.powered * Math.min(cap, entry.stateOnCount + growth);
    reserved += reserves[entry._vueBinding];
  }
  for (const entry of managed) {
    let maximum = entry.count;
    const current = entry.stateOnCount;
    if (!game.global.settings.showGalactic && entry._tab === "galaxy")
      maximum = 0;
    if (settings.buildingsLimitPowered)
      maximum = Math.min(maximum, entry.autoMax);
    reserved -= reserves[entry._vueBinding] ?? 0;
    if (entry.powered > 0) {
      maximum = Math.min(maximum, (available - reserved) / entry.powered);
    }
    for (const consumption of entry.consumption) {
      const resourceValue = consumption.resource;
      if (consumption.rate > 0) {
        if (!resourceValue.isUnlocked()) {
          maximum = 0;
          break;
        }
        if (resourceValue.id === "Food" && game.global.race.fasting) {
          maximum = 0;
          break;
        }
        if (
          current > 0 &&
          !(resourceValue instanceof TestSupport) &&
          (entry.powered < 0 || resourceValue.storageRatio >= 0.95) &&
          resourceValue.currentQuantity >= maximum * 60 * consumption.rate
        ) {
          continue;
        }
        maximum = Math.min(
          maximum,
          resourceValue.rateOfChange / consumption.rate,
        );
        if (missing[resourceValue.id]) {
          entry.extraDescription = `Make sure all ${resourceValue.title} producers are above consumers in buildings list!<br>${entry.extraDescription}`;
        }
      } else if (missing[resourceValue.id] && consumption.rate < 0) {
        missing[resourceValue.id]--;
      }
    }
    if (entry.powered < 0) maximum = Math.max(maximum, current - 1);
    maximum = Math.max(0, Math.floor(maximum));
    for (let index = 0; index < entry.consumption.length; index++) {
      const consumption = entry.consumption[index];
      consumption.resource.rateOfChange -= entry.getFuelRate(index) * maximum;
    }
    entry.tryAdjustState(maximum - current);
    available -= entry.powered * maximum;
  }
  resources.Power.currentQuantity = available;
  resources.Power.rateOfChange = available;
  return legacyState;
}

const parityScenarios = [
  ["locked", { unlocked: false }],
  ["no managed buildings", { buildings: [] }],
  [
    "ordered power allocation",
    {
      power: 5,
      buildings: [
        { id: "First", count: 2, powered: 2 },
        { id: "Second", count: 3, powered: 2 },
      ],
    },
  ],
  [
    "fuel-limited consumer",
    {
      power: 20,
      fuelRate: 3,
      support: true,
      buildings: [
        {
          id: "Consumer",
          count: 5,
          powered: 1,
          consumptions: [{ resource: "Fuel", rate: 2 }],
        },
      ],
    },
  ],
  [
    "producer reservation",
    {
      power: 4,
      fuelRate: 0,
      buildings: [
        { id: "Consumer", count: 4, powered: 1 },
        {
          id: "Producer",
          count: 1,
          stateOn: 0,
          powered: 2,
          produces: ["Fuel"],
        },
        {
          id: "FuelUser",
          count: 1,
          powered: 0,
          consumptions: [{ resource: "Fuel", rate: 1 }],
        },
      ],
    },
  ],
  [
    "power producer sheds one",
    {
      power: -10,
      fuelRate: 0,
      buildings: [{ id: "Generator", count: 5, stateOn: 4, powered: -2 }],
    },
  ],
  [
    "galaxy and configured caps",
    {
      power: 20,
      showGalactic: false,
      limitPowered: true,
      buildings: [
        {
          id: "Galaxy",
          count: 5,
          stateOn: 2,
          powered: 1,
          tab: "galaxy",
          autoMaximum: 4,
        },
        { id: "Limited", count: 5, powered: 1, autoMaximum: 2 },
      ],
    },
  ],
  [
    "stockpile keeps producer online",
    {
      power: 10,
      fuelCurrent: 1000,
      fuelMaximum: 1000,
      fuelRate: -5,
      fuelStorageRatio: 1,
      buildings: [
        {
          id: "Generator",
          count: 2,
          stateOn: 1,
          powered: -2,
          consumptions: [{ resource: "Fuel", rate: 2 }],
        },
      ],
    },
  ],
];

for (const [name, spec] of parityScenarios) {
  const oldFixture = makeFixture(spec);
  const newFixture = makeFixture(spec);
  runLegacyGeneric(oldFixture);
  runNew(newFixture);
  assert.deepEqual(newFixture.trace, oldFixture.trace, name);
}

function domainResource(id, overrides = {}) {
  return Object.freeze({
    id,
    title: id,
    currentQuantity: 0,
    maxQuantity: 100,
    rateOfChange: 0,
    storageRatio: 0.5,
    unlocked: true,
    useful: true,
    income: 0,
    incomeAdjusted: false,
    supportKind: "none",
    ...overrides,
  });
}

function domainBuilding(id, overrides = {}) {
  return Object.freeze({
    index: 0,
    id,
    binding: `bind-${id}`,
    count: 1,
    stateOn: 0,
    powered: 0,
    autoMaximum: 1,
    tab: "city",
    smartCategory: false,
    smartEnabled: false,
    ship: false,
    singleState: false,
    ignorePositivePowerCap: false,
    skipGroup: "none",
    extraDescription: "",
    consumptions: Object.freeze([]),
    produces: Object.freeze([]),
    fleetMaximum: null,
    rule: Object.freeze({ kind: "ordinary" }),
    ...overrides,
  });
}

function domainCycle(overrides = {}) {
  return Object.freeze({
    powerUnlocked: true,
    powerResourceId: "Power",
    powerCurrent: 10,
    powerMaximum: 10,
    replicatorAvailable: false,
    fasting: false,
    hungryRace: false,
    banquetStateOn: 0,
    debug: false,
    consumptionBalanceMinimum: 60,
    settings: Object.freeze({
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
    }),
    resources: Object.freeze([
      domainResource("Power", { currentQuantity: 10, rateOfChange: 10 }),
    ]),
    buildings: Object.freeze([]),
    lake: Object.freeze({
      enabled: false,
      bloodSpireLevel: 0,
      biremeId: "",
      biremeBinding: "",
      biremeCount: 0,
      biremeStateOn: 0,
      transportId: "",
      transportBinding: "",
      transportCount: 0,
      transportStateOn: 0,
    }),
    spire: Object.freeze({
      enabled: false,
      autoBuild: false,
      autoMech: false,
      mechActive: false,
      autoPrestige: false,
      prestigeType: "",
      prestigeDemonicFloor: 0,
      towerCount: 0,
      moneyMaximum: 0,
      supplyCurrent: 0,
      mechQueued: false,
      purifierQueued: false,
      purifierDescription: "",
      expectedSaveSupply: false,
      mechBay: Object.freeze({
        buildingId: "",
        binding: "",
        count: 0,
        stateOn: 0,
        autoMaximum: 0,
        autoBuildable: false,
        smartManaged: false,
        moneyCost: 0,
        supplyCost: 0,
      }),
      port: Object.freeze({
        buildingId: "",
        binding: "",
        count: 0,
        stateOn: 0,
        autoMaximum: 0,
        autoBuildable: false,
        smartManaged: false,
        moneyCost: 0,
        supplyCost: 0,
      }),
      camp: Object.freeze({
        buildingId: "",
        binding: "",
        count: 0,
        stateOn: 0,
        autoMaximum: 0,
        autoBuildable: false,
        smartManaged: false,
        moneyCost: 0,
        supplyCost: 0,
      }),
      purifier: Object.freeze({
        buildingId: "",
        binding: "",
        count: 0,
        stateOn: 0,
        autoMaximum: 0,
        autoBuildable: false,
        smartManaged: false,
        moneyCost: 0,
        supplyCost: 0,
      }),
    }),
    ...overrides,
  });
}

assert.equal(getCitadelPowerConsumption(3, false), 105);
assert.equal(getCitadelPowerConsumption(3, true), 157.5);
assert.deepEqual([...getBestPowerSupplyRatio(10, 10, 10)], [156100, 6, 4]);

const attractor = domainBuilding("Attractor", {
  count: 10,
  stateOn: 5,
  smartCategory: true,
  smartEnabled: true,
  rule: Object.freeze({
    kind: "badlands-attractor",
    threat: 90,
    bottomThreat: 50,
    topThreat: 100,
    hellAssigned: 1,
  }),
});
const attractorPlan = planPowerCycle(
  domainCycle({ buildings: Object.freeze([attractor]) }),
  EMPTY_POWER_AUTOMATION_STATE,
);
assert.equal(
  attractorPlan.decision.operations.find(
    (operation) => operation.kind === "adjust-building",
  ).amount,
  -1,
);

// Regression: lake bireme/transport are adjusted directly (legacy parity) and
// must not be required to appear in the managed building list. A smart-managed
// bireme with count 0 is absent from managedStatePriorityList, so it never
// reaches buildingById; planning must still emit its command instead of
// throwing "missing lake bireme".
const lakeUnmanagedPlan = planPowerCycle(
  domainCycle({
    resources: Object.freeze([
      domainResource("Power", { currentQuantity: 10, rateOfChange: 10 }),
      domainResource("Lake_Support", { rateOfChange: 2 }),
    ]),
    buildings: Object.freeze([
      domainBuilding("Filler", { count: 1, stateOn: 1 }),
    ]),
    lake: Object.freeze({
      enabled: true,
      bloodSpireLevel: 0,
      biremeId: "LakeBireme",
      biremeBinding: "bind-LakeBireme",
      biremeCount: 0,
      biremeStateOn: 0,
      transportId: "LakeTransport",
      transportBinding: "bind-LakeTransport",
      transportCount: 3,
      transportStateOn: 3,
    }),
  }),
  EMPTY_POWER_AUTOMATION_STATE,
);
assert.deepEqual(
  lakeUnmanagedPlan.decision.operations
    .filter(
      (operation) =>
        operation.kind === "adjust-building" &&
        (operation.buildingId === "LakeBireme" ||
          operation.buildingId === "LakeTransport"),
    )
    .map((operation) => [
      operation.buildingId,
      operation.binding,
      operation.amount,
    ]),
  [
    ["LakeBireme", "bind-LakeBireme", 0],
    ["LakeTransport", "bind-LakeTransport", -1],
  ],
  "lake plan adjusts bireme/transport without requiring them in buildingById",
);

// Regression: spire mech/port/camp are adjusted directly as well. A smart-managed
// mech bay with count 0 is absent from managedStatePriorityList and never reaches
// buildingById; planning must not throw "missing spire building mechbay".
const spireBuilding = (id, overrides = {}) =>
  Object.freeze({
    buildingId: id,
    binding: `bind-${id}`,
    count: 0,
    stateOn: 0,
    autoMaximum: 0,
    autoBuildable: false,
    smartManaged: false,
    moneyCost: 0,
    supplyCost: 0,
    ...overrides,
  });
const spireUnmanagedPlan = planPowerCycle(
  domainCycle({
    resources: Object.freeze([
      domainResource("Power", { currentQuantity: 10, rateOfChange: 10 }),
      domainResource("Spire_Support", { rateOfChange: 1 }),
    ]),
    buildings: Object.freeze([
      domainBuilding("Filler", { count: 1, stateOn: 1 }),
    ]),
    spire: Object.freeze({
      enabled: true,
      autoBuild: false,
      autoMech: false,
      mechActive: false,
      autoPrestige: false,
      prestigeType: "",
      prestigeDemonicFloor: 0,
      towerCount: 0,
      moneyMaximum: 0,
      supplyCurrent: 0,
      mechQueued: false,
      purifierQueued: false,
      purifierDescription: "",
      expectedSaveSupply: false,
      mechBay: spireBuilding("SpireMechBay", { count: 1 }),
      port: spireBuilding("SpirePort"),
      camp: spireBuilding("SpireBaseCamp"),
      purifier: spireBuilding("SpirePurifier"),
    }),
  }),
  EMPTY_POWER_AUTOMATION_STATE,
);
assert.deepEqual(
  spireUnmanagedPlan.decision.operations
    .filter(
      (operation) =>
        operation.kind === "adjust-building" &&
        operation.buildingId.startsWith("Spire"),
    )
    .map((operation) => [operation.buildingId, operation.binding]),
  [
    ["SpireMechBay", "bind-SpireMechBay"],
    ["SpirePort", "bind-SpirePort"],
    ["SpireBaseCamp", "bind-SpireBaseCamp"],
  ],
  "spire plan adjusts mech/port/camp without requiring them in buildingById",
);

const busyResource = domainResource("Ore", {
  useful: false,
  income: 2,
});
const busy = domainBuilding("Busy", {
  count: 5,
  stateOn: 3,
  smartCategory: true,
  smartEnabled: true,
  rule: Object.freeze({
    kind: "busy-resource",
    active: true,
    savingOnly: false,
    observation: Object.freeze({
      resourceId: "Ore",
      useful: false,
      production: 6,
      income: 2,
    }),
  }),
});
const busyPlan = planPowerCycle(
  domainCycle({
    powerCurrent: 100,
    powerMaximum: 100,
    resources: Object.freeze([
      domainResource("Power", { currentQuantity: 100, rateOfChange: 100 }),
      busyResource,
    ]),
    buildings: Object.freeze([busy]),
  }),
  EMPTY_POWER_AUTOMATION_STATE,
);
assert.equal(
  busyPlan.decision.operations.find(
    (operation) => operation.kind === "adjust-building",
  ).amount,
  -1,
);
assert.ok(
  busyPlan.decision.operations.some(
    (operation) =>
      operation.kind === "set-income-adjusted" &&
      operation.resourceId === "Ore",
  ),
);

const specialRuleCases = [
  ["job-dependent", { kind: "job-dependent", jobCount: 0 }, 3, 3, 0],
  [
    "lake-cooling",
    {
      kind: "lake-cooling-tower",
      harborCount: 2,
      electromagneticField: false,
    },
    2,
    2,
    0,
    100,
    600,
  ],
  ["lake-harbor", { kind: "lake-harbor" }, 2, 1, 0, 1, 0],
  [
    "triton-without-fob",
    {
      kind: "triton-lander",
      fobOn: 0,
      currentSoldiers: 20,
      wounded: 0,
      healingRate: 0,
      highPopulationMultiplier: 1,
      authorityReserve: 0,
    },
    2,
    2,
    0,
  ],
  [
    "ascension-guard",
    {
      kind: "ascension-trigger",
      pillarFinished: false,
      prestigeType: "ascension",
    },
    1,
    1,
    0,
    1,
  ],
  [
    "terraform-guard",
    { kind: "terraformer", prestigeType: "bioseed" },
    1,
    1,
    0,
  ],
  [
    "mine-layer-guard",
    {
      kind: "chthonian-mine-layer",
      raiderOn: 0,
      excavatorOn: 0,
      starbaseOn: 1,
      piracy: 10,
      armada: 0,
      rating: 1,
    },
    2,
    2,
    0,
  ],
  [
    "guard-post-disabled",
    {
      kind: "ruins-guard-post",
      suppressionUseful: false,
      postRating: 1,
      ruinsRating: 0,
      gateUnlocked: false,
      gateRating: 0,
    },
    1,
    1,
    0,
  ],
  [
    "waygate-cleared",
    {
      kind: "spire-waygate",
      cleared: true,
      demonicBombReady: false,
      mechPotentialTooHigh: false,
      prestigeFloorProtected: false,
    },
    1,
    1,
    0,
  ],
  [
    "early-ship-disabled",
    { kind: "early-galaxy-ship", piracyUnlocked: false, embassyUnlocked: true },
    2,
    2,
    0,
  ],
  [
    "womling-farm",
    { kind: "womling-farm", supportMaximum: 20, cropPerFarm: 16 },
    5,
    3,
    2,
  ],
  [
    "womling-overseer",
    {
      kind: "womling-overseer",
      loyaltyBase: 25,
      loyaltyPerBuilding: 10,
      miners: 5,
    },
    10,
    10,
    8,
  ],
  [
    "womling-fun",
    {
      kind: "womling-fun",
      moraleBase: 75,
      moralePerBuilding: 10,
      miners: 5,
      farmers: 5,
      injured: 0,
    },
    10,
    10,
    4,
  ],
  [
    "tau-whaling",
    {
      kind: "tau-whaling-station",
      supportMaximum: 10,
      supportCurrent: 10,
      whalingShipsOn: 3,
    },
    5,
    4,
    2,
  ],
  ["tau-mining", { kind: "tau-mining-pit", populationMaximum: 31 }, 10, 10, 6],
];

for (const [
  name,
  rule,
  count,
  stateOn,
  expected,
  powered = 0,
  power = 100,
] of specialRuleCases) {
  const candidate = domainBuilding(`Special-${name}`, {
    count,
    stateOn,
    powered,
    autoMaximum: count,
    smartCategory: true,
    smartEnabled: true,
    rule: Object.freeze(rule),
  });
  const plan = planPowerCycle(
    domainCycle({
      powerCurrent: power,
      powerMaximum: power,
      resources: Object.freeze([
        domainResource("Power", {
          currentQuantity: power,
          rateOfChange: power,
        }),
      ]),
      buildings: Object.freeze([candidate]),
    }),
    EMPTY_POWER_AUTOMATION_STATE,
  );
  const adjustment = plan.decision.operations.find(
    (operation) => operation.kind === "adjust-building",
  );
  assert.equal(adjustment.expectedStateOn + adjustment.amount, expected, name);
}

let oscillationState = Object.freeze({
  oscillations: Object.freeze({ "bind-Osc": Object.freeze({ previous: 2 }) }),
  warningCaps: Object.freeze({}),
});
const oscillation = domainBuilding("Osc", { count: 2, stateOn: 1, powered: 0 });
const oscillationPlan = planPowerCycle(
  domainCycle({ buildings: Object.freeze([oscillation]) }),
  oscillationState,
);
assert.equal(
  oscillationPlan.decision.operations.find(
    (operation) => operation.kind === "adjust-building",
  ).amount,
  1,
);
assert.equal(oscillationPlan.nextState.oscillations["bind-Osc"].locked, 2);

const cappedState = recordPowerWarningCap(
  oscillationPlan.nextState,
  "bind-Osc",
  1,
);
assert.equal(cappedState.oscillations["bind-Osc"], undefined);
assert.deepEqual(cappedState.warningCaps["bind-Osc"], { cap: 1, ticks: 10 });

const applicationTrace = [];
let warningCount = 2;
const application = createPowerAutomation({
  reader: {
    readCycle: () =>
      domainCycle({
        buildings: Object.freeze([
          domainBuilding("WarningTarget", { count: 2, stateOn: 2 }),
        ]),
      }),
    readWarnings: () => [
      {
        domId: "warning-target",
        buildingId: "WarningTarget",
        binding: "bind-WarningTarget",
        stateOn: warningCount,
        autoStateEnabled: true,
        ship: false,
        warningKind: "ordinary",
        beltSupportNeeded: 0,
        beltSupportMaximum: 0,
        lakeSupportNeeded: 0,
        lakeSupportMaximum: 0,
      },
    ],
    readStateOn: () => warningCount,
  },
  executor: {
    execute: (decision) => {
      applicationTrace.push(decision.kind);
      if (decision.kind === "shutdown-warned-building") warningCount--;
      return { status: "succeeded" };
    },
  },
  warnings: {
    readDebugEnabled: () => false,
    readWarnedBuildingDomIds: () => ["warning-target"],
  },
});
assert.equal(application.run().status, "succeeded");
assert.deepEqual(applicationTrace, [
  "apply-power-cycle",
  "shutdown-warned-building",
]);
assert.deepEqual(application.readState().warningCaps["bind-WarningTarget"], {
  cap: 1,
  ticks: 10,
});

assert.equal(
  planPowerWarningShutdown([
    {
      domId: "safe-belt",
      buildingId: "Belt",
      binding: "belt",
      stateOn: 2,
      autoStateEnabled: true,
      ship: false,
      warningKind: "belt-elerium",
      beltSupportNeeded: 3,
      beltSupportMaximum: 3,
      lakeSupportNeeded: 0,
      lakeSupportMaximum: 0,
    },
  ]),
  null,
);
assert.equal(
  planPowerWarningShutdown([
    {
      domId: "warn",
      buildingId: "Building",
      binding: "building",
      stateOn: 2,
      autoStateEnabled: true,
      ship: false,
      warningKind: "ordinary",
      beltSupportNeeded: 0,
      beltSupportMaximum: 0,
      lakeSupportNeeded: 0,
      lakeSupportMaximum: 0,
    },
  ]).buildingId,
  "Building",
);

const lockedReads = [];
const lockedFixture = makeFixture({ unlocked: false });
const lockedAdapter = createPowerAdapter(
  adapterDependencies(lockedFixture, {
    getBuildingManager: () => ({
      managedStatePriorityList: () => {
        lockedReads.push("list");
        throw new Error("guarded list read");
      },
    }),
  }),
);
assert.equal(lockedAdapter.reader.readCycle().powerUnlocked, false);
assert.deepEqual(lockedReads, []);

const emptyFixture = makeFixture({ buildings: [] });
const emptyAdapter = createPowerAdapter(adapterDependencies(emptyFixture));
assert.equal(emptyAdapter.reader.readCycle().buildings.length, 0);

const staleFixture = makeFixture({
  power: 5,
  buildings: [{ id: "A", count: 1, powered: 1 }],
});
const staleAdapter = createPowerAdapter(adapterDependencies(staleFixture));
const stalePlan = planPowerCycle(
  staleAdapter.reader.readCycle(),
  EMPTY_POWER_AUTOMATION_STATE,
);
staleFixture.manager.managedStatePriorityList = () => [];
assert.equal(staleAdapter.executor.execute(stalePlan.decision).status, "stale");
assert.deepEqual(staleFixture.trace, []);

const documentFixture = {
  querySelectorAll: () => [
    { parentElement: { id: "one" } },
    { parentElement: null },
  ],
};
const warningSource = createPowerWarningSource(
  () => documentFixture,
  () => ({ powerDebug: true }),
);
assert.equal(warningSource.readDebugEnabled(), true);
assert.deepEqual(warningSource.readWarnedBuildingDomIds(), ["one", ""]);

console.log(
  `Power domain, adapters, application, and parity tests passed (${parityScenarios.length} dual-run scenarios)`,
);
