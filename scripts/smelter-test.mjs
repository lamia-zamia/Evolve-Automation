import assert from "node:assert/strict";

import {
  createSmelterCommandExecutor,
  readSmelterInput,
} from "../src/adapters/evolve/smelter.ts";
import { planSmelter } from "../src/domain/smelter.ts";
import { CONSUMPTION_BALANCE_MIN } from "../src/config.ts";

// Exact copy of the deleted `autoSmelter` body, used as the old-versus-new
// parity oracle. Do not "clean up" — it must stay byte-faithful to the legacy
// algorithm so the dual-run proves behavior preservation.
function legacyAutoSmelter({
  SmelterManager,
  getGame,
  getState,
  getSettings,
  getResources,
  getJobs,
  getBuildings,
  haveTech,
}) {
  const game = getGame();
  const state = getState();
  const settings = getSettings();
  const resources = getResources();
  const jobs = getJobs();
  const buildings = getBuildings();

  let m = SmelterManager;
  if (!m.initIndustry()) {
    return;
  }

  let totalSmelters = m.maxOperating();
  let fuelRemoved = 0;
  if (!game.global.race["forge"]) {
    let remainingSmelters = totalSmelters;

    let fuels = m.managedFuelPriorityList();
    let fuelAdjust = {};
    for (let i = 0; i < fuels.length; i++) {
      let fuel = fuels[i];
      if (!fuel.unlocked) {
        continue;
      }

      let maxAllowedUnits = remainingSmelters;

      if (
        fuel === m.Fuels.Inferno &&
        fuels[i + 1] === m.Fuels.Oil &&
        remainingSmelters > 75
      ) {
        maxAllowedUnits = Math.floor(0.5 * remainingSmelters + 37.5);
      }

      for (let productionCost of fuel.cost) {
        let resource = productionCost.resource;
        if (
          resource.currentQuantity <
            maxAllowedUnits *
              productionCost.quantity *
              CONSUMPTION_BALANCE_MIN +
              productionCost.minRateOfChange ||
          resource.isDemanded()
        ) {
          let remainingRateOfChange =
            resource.rateOfChange +
            m.fueledCount(fuel) * productionCost.quantity -
            productionCost.minRateOfChange;

          let affordableAmount = Math.max(
            0,
            Math.floor(remainingRateOfChange / productionCost.quantity),
          );
          if (affordableAmount < maxAllowedUnits) {
            state.tooltips["smelterFuels" + fuel.id.toLowerCase()] =
              `Too low ${resource.name} income<br>`;
          }
          maxAllowedUnits = Math.min(maxAllowedUnits, affordableAmount);
        }
      }

      remainingSmelters -= maxAllowedUnits;
      fuelAdjust[fuel.id] = maxAllowedUnits - m.fueledCount(fuel);
    }

    for (let fuel of fuels) {
      if (fuelAdjust[fuel.id] < 0) {
        fuelRemoved += fuelAdjust[fuel.id] * -1;
        m.decreaseFuel(fuel, fuelAdjust[fuel.id] * -1);
      }
    }

    for (let fuel of fuels) {
      if (fuelAdjust[fuel.id] > 0) {
        m.increaseFuel(fuel, fuelAdjust[fuel.id]);
      }
    }
    totalSmelters -= remainingSmelters;
  }

  totalSmelters += m.extraOperating();

  let smelterIronCount = m.smeltingCount(m.Productions.Iron);
  let smelterSteelCount = m.smeltingCount(m.Productions.Steel);
  let smelterIridiumCount = m.smeltingCount(m.Productions.Iridium);

  let maxAllowedIridium =
    m.Productions.Iridium.unlocked && !resources.Iridium.isCapped()
      ? Math.floor(settings.productionSmeltingIridium * totalSmelters)
      : 0;
  let maxAllowedSteel = totalSmelters - smelterIridiumCount;

  let smeltAdjust = {
    Iridium: maxAllowedIridium - smelterIridiumCount,
    Steel: smelterIridiumCount - maxAllowedIridium,
  };

  if (fuelRemoved > smelterIronCount) {
    let steelRemoved = fuelRemoved - smelterIronCount;
    if (steelRemoved <= smelterSteelCount) {
      smeltAdjust.Steel += steelRemoved;
    } else {
      smeltAdjust.Steel += smelterSteelCount;
      smeltAdjust.Iridium += steelRemoved - smelterSteelCount;
    }
  }

  let steelSmeltingConsumption = m.Productions.Steel.cost;
  for (let productionCost of steelSmeltingConsumption) {
    let resource = productionCost.resource;
    if (
      resource.currentQuantity <
        smelterSteelCount * productionCost.quantity * CONSUMPTION_BALANCE_MIN +
          productionCost.minRateOfChange ||
      resource.isDemanded()
    ) {
      let remainingRateOfChange =
        resource.rateOfChange +
        smelterSteelCount * productionCost.quantity -
        productionCost.minRateOfChange;

      let affordableAmount = Math.max(
        0,
        Math.floor(remainingRateOfChange / productionCost.quantity),
      );
      if (affordableAmount < maxAllowedSteel) {
        state.tooltips["smelterMatssteel"] =
          `Too low ${resource.name} income<br>`;
      }
      maxAllowedSteel = Math.min(maxAllowedSteel, affordableAmount);
    }
  }

  let ironWeighting = 0;
  let steelWeighting = 0;
  switch (settings.productionSmelting) {
    case "iron":
      ironWeighting = resources.Iron.timeToFull;
      if (!ironWeighting) {
        steelWeighting = resources.Steel.timeToFull;
      }
      break;
    case "steel":
      steelWeighting = resources.Steel.timeToFull;
      if (!steelWeighting) {
        ironWeighting = resources.Iron.timeToFull;
      }
      break;
    case "storage":
      ironWeighting = resources.Iron.timeToFull;
      steelWeighting = resources.Steel.timeToFull;
      break;
    case "required":
      ironWeighting = resources.Iron.timeToRequired;
      steelWeighting = resources.Steel.timeToRequired;
      break;
  }

  if (resources.Iron.isDemanded()) {
    ironWeighting = Number.MAX_SAFE_INTEGER;
  }
  if (resources.Steel.isDemanded()) {
    steelWeighting = Number.MAX_SAFE_INTEGER;
  }
  if (jobs.Miner.count === 0 && buildings.BeltIronShip.stateOnCount === 0) {
    ironWeighting = 0;
    steelWeighting = 1;
    maxAllowedSteel = totalSmelters - smelterIridiumCount;
  }

  if (
    smelterSteelCount > maxAllowedSteel ||
    (smelterSteelCount > 0 && ironWeighting > steelWeighting)
  ) {
    smeltAdjust.Steel--;
  }

  if (
    smelterSteelCount < maxAllowedSteel &&
    smelterIronCount > 0 &&
    (steelWeighting > ironWeighting ||
      (steelWeighting <= 0 &&
        ironWeighting <= 0 &&
        resources.Titanium.storageRatio < 0.99 &&
        haveTech("titanium")))
  ) {
    smeltAdjust.Steel++;
  }

  smeltAdjust.Iron =
    totalSmelters -
    (smelterIronCount +
      smelterSteelCount +
      smeltAdjust.Steel +
      smelterIridiumCount +
      smeltAdjust.Iridium);
  Object.entries(smeltAdjust).forEach(
    ([id, delta]) => delta < 0 && m.decreaseSmelting(id, delta * -1),
  );
  Object.entries(smeltAdjust).forEach(
    ([id, delta]) => delta > 0 && m.increaseSmelting(id, delta),
  );
}

function makeResource(name, o = {}) {
  return {
    name,
    currentQuantity: o.currentQuantity ?? 10_000,
    rateOfChange: o.rateOfChange ?? 100,
    storageRatio: o.storageRatio ?? 0.5,
    timeToFull: o.timeToFull ?? 0,
    timeToRequired: o.timeToRequired ?? 0,
    _capped: o.capped ?? false,
    _demanded: o.demanded ?? false,
    isCapped() {
      return this._capped;
    },
    isDemanded() {
      return this._demanded;
    },
  };
}

// Build an independent set of mocks from a scenario spec, with its own actions
// log. Called once for the legacy oracle and once for the migrated path.
function buildFixture(spec) {
  const actions = [];
  const s = {
    initialized: true,
    forge: false,
    maxOperating: 10,
    extraOperating: 0,
    productionSmelting: "steel",
    productionSmeltingIridium: 0,
    iridiumUnlocked: false,
    iridiumCapped: false,
    counts: { Iron: 0, Steel: 0, Iridium: 0 },
    minerCount: 1,
    beltIronShip: 0,
    titaniumStorageRatio: 0.5,
    haveTitanium: false,
    steelCost: [],
    fuels: [{ id: "Coal", unlocked: true, count: 0 }],
    resources: {},
    ...spec,
  };
  s.counts = { Iron: 0, Steel: 0, Iridium: 0, ...s.counts };

  const resources = {
    Iron: makeResource("Iron", s.resources.Iron),
    Steel: makeResource("Steel", s.resources.Steel),
    Iridium: makeResource("Iridium", s.resources.Iridium),
    Titanium: makeResource("Titanium", {
      storageRatio: s.titaniumStorageRatio,
      ...s.resources.Titanium,
    }),
  };

  const buildCost = (c) => ({
    resource: makeResource(c.resourceName ?? "Coal", c.resource),
    quantity: c.quantity ?? 1,
    minRateOfChange: c.minRateOfChange ?? 0,
  });

  const fuelObjects = s.fuels.map((f) => ({
    id: f.id,
    unlocked: f.unlocked ?? true,
    count: f.count ?? 0,
    cost: (f.cost ?? [{ resourceName: f.id }]).map(buildCost),
  }));
  const Fuels = {};
  for (const fuel of fuelObjects) {
    Fuels[fuel.id] = fuel;
  }

  const Productions = {
    Iron: { id: "Iron", cost: [] },
    Steel: { id: "Steel", cost: s.steelCost.map(buildCost) },
    Iridium: { id: "Iridium", unlocked: s.iridiumUnlocked, cost: [] },
  };

  const SmelterManager = {
    Fuels,
    Productions,
    initIndustry: () => s.initialized,
    maxOperating: () => s.maxOperating,
    extraOperating: () => s.extraOperating,
    managedFuelPriorityList: () => fuelObjects,
    fueledCount: (fuel) => fuel.count,
    smeltingCount: (production) => s.counts[production.id],
    increaseFuel: (fuel, count) =>
      actions.push(["increaseFuel", fuel.id, count]),
    decreaseFuel: (fuel, count) =>
      actions.push(["decreaseFuel", fuel.id, count]),
    increaseSmelting: (id, count) =>
      actions.push(["increaseSmelting", id, count]),
    decreaseSmelting: (id, count) =>
      actions.push(["decreaseSmelting", id, count]),
  };

  const state = { tooltips: {} };
  const settings = {
    productionSmelting: s.productionSmelting,
    productionSmeltingIridium: s.productionSmeltingIridium,
  };
  const game = { global: { race: s.forge ? { forge: 1 } : {} } };
  const jobs = { Miner: { count: s.minerCount } };
  const buildings = { BeltIronShip: { stateOnCount: s.beltIronShip } };
  const haveTech = (tech) => tech === "titanium" && s.haveTitanium;

  return {
    SmelterManager,
    game,
    state,
    settings,
    resources,
    jobs,
    buildings,
    haveTech,
    actions,
  };
}

function runLegacy(spec) {
  const f = buildFixture(spec);
  legacyAutoSmelter({
    SmelterManager: f.SmelterManager,
    getGame: () => f.game,
    getState: () => f.state,
    getSettings: () => f.settings,
    getResources: () => f.resources,
    getJobs: () => f.jobs,
    getBuildings: () => f.buildings,
    haveTech: f.haveTech,
  });
  return { actions: f.actions, tooltips: f.state.tooltips };
}

function runNew(spec) {
  const f = buildFixture(spec);
  const decision = planSmelter(
    readSmelterInput({
      getSmelterManager: () => f.SmelterManager,
      getGame: () => f.game,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getJobs: () => f.jobs,
      getBuildings: () => f.buildings,
      haveTech: f.haveTech,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  for (const tooltip of decision.tooltips) {
    f.state.tooltips[tooltip.key] = tooltip.value;
  }
  const outcome = createSmelterCommandExecutor(() => f.SmelterManager).execute(
    decision,
  );
  return { actions: f.actions, tooltips: f.state.tooltips, outcome };
}

const scenarios = {
  "base steel allocation": {
    counts: { Iron: 2, Steel: 0, Iridium: 0 },
    maxOperating: 2,
    resources: { Steel: { timeToFull: 10 } },
  },
  "forge race skips fuel": {
    forge: true,
    counts: { Iron: 3, Steel: 1, Iridium: 0 },
    maxOperating: 6,
    resources: { Steel: { timeToFull: 5 } },
  },
  "iridium ratio": {
    iridiumUnlocked: true,
    productionSmeltingIridium: 0.25,
    counts: { Iron: 4, Steel: 2, Iridium: 0 },
    maxOperating: 12,
    resources: { Steel: { timeToFull: 5 } },
  },
  "iridium capped -> zero": {
    iridiumUnlocked: true,
    iridiumCapped: true,
    productionSmeltingIridium: 0.25,
    counts: { Iron: 4, Steel: 2, Iridium: 3 },
    maxOperating: 12,
  },
  "fuel income too low": {
    maxOperating: 20,
    counts: { Iron: 10, Steel: 5, Iridium: 0 },
    fuels: [
      {
        id: "Coal",
        count: 8,
        cost: [
          {
            resourceName: "Coal",
            quantity: 1,
            resource: { currentQuantity: 50, rateOfChange: 3 },
          },
        ],
      },
    ],
    resources: { Steel: { timeToFull: 8 } },
  },
  "inferno oil efficiency": {
    maxOperating: 100,
    counts: { Iron: 40, Steel: 20, Iridium: 0 },
    fuels: [
      { id: "Inferno", count: 30 },
      { id: "Oil", count: 10 },
    ],
    resources: { Steel: { timeToFull: 5 } },
  },
  "no miners forces steel": {
    minerCount: 0,
    beltIronShip: 0,
    counts: { Iron: 5, Steel: 1, Iridium: 0 },
    maxOperating: 8,
  },
  "iron demanded": {
    counts: { Iron: 3, Steel: 4, Iridium: 0 },
    maxOperating: 8,
    resources: { Iron: { demanded: true }, Steel: { timeToFull: 5 } },
  },
  "required mode": {
    productionSmelting: "required",
    counts: { Iron: 4, Steel: 2, Iridium: 0 },
    maxOperating: 8,
    resources: {
      Iron: { timeToRequired: 3 },
      Steel: { timeToRequired: 9 },
    },
  },
  "titanium branch both full": {
    productionSmelting: "storage",
    haveTitanium: true,
    counts: { Iron: 4, Steel: 2, Iridium: 0 },
    maxOperating: 10,
    titaniumStorageRatio: 0.5,
    resources: {
      Iron: { timeToFull: 0 },
      Steel: { timeToFull: 0 },
    },
  },
  "steel over affordable": {
    maxOperating: 6,
    counts: { Iron: 1, Steel: 5, Iridium: 0 },
    steelCost: [
      {
        resourceName: "Iron",
        quantity: 2,
        resource: { currentQuantity: 10, rateOfChange: 1 },
      },
    ],
    resources: { Steel: { timeToFull: 5 } },
  },
};

for (const [name, spec] of Object.entries(scenarios)) {
  const legacy = runLegacy(spec);
  const next = runNew(spec);
  assert.deepEqual(
    next.actions,
    legacy.actions,
    `actions diverged for scenario: ${name}`,
  );
  assert.deepEqual(
    next.tooltips,
    legacy.tooltips,
    `tooltips diverged for scenario: ${name}`,
  );
  assert.equal(
    next.outcome.status,
    "succeeded",
    `executor should succeed for scenario: ${name}`,
  );
}

// Adapter contract: an unavailable industry short-circuits without reading the
// fuel/production surface and yields an empty no-op decision.
{
  const throwing = {
    getSmelterManager: () => ({
      initIndustry: () => false,
      get Fuels() {
        throw new Error("must not read Fuels when uninitialised");
      },
      get Productions() {
        throw new Error("must not read Productions when uninitialised");
      },
    }),
    getGame: () => {
      throw new Error("must not read game when uninitialised");
    },
    getResources: () => {
      throw new Error("must not read resources when uninitialised");
    },
    getSettings: () => ({}),
    getJobs: () => ({}),
    getBuildings: () => ({}),
    haveTech: () => false,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  };
  const decision = planSmelter(readSmelterInput(throwing));
  assert.deepEqual(decision.fuelAdjustments, []);
  assert.deepEqual(decision.smeltAdjustments, []);
  assert.deepEqual(decision.tooltips, []);
}

// Adapter contract: a forge race never touches the fuel priority list.
{
  const f = buildFixture({ forge: true, counts: { Iron: 2, Steel: 1 } });
  f.SmelterManager.managedFuelPriorityList = () => {
    throw new Error("forge race must not read the fuel priority list");
  };
  const decision = planSmelter(
    readSmelterInput({
      getSmelterManager: () => f.SmelterManager,
      getGame: () => f.game,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getJobs: () => f.jobs,
      getBuildings: () => f.buildings,
      haveTech: f.haveTech,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  assert.deepEqual(decision.fuelAdjustments, []);
}

// Adapter contract: malformed manager throws at the boundary.
assert.throws(() =>
  readSmelterInput({
    getSmelterManager: () => null,
    getGame: () => ({ global: { race: {} } }),
    getResources: () => ({}),
    getSettings: () => ({}),
    getJobs: () => ({}),
    getBuildings: () => ({}),
    haveTech: () => false,
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  }),
);

// Executor: a stale fuel count aborts without mutating.
{
  const f = buildFixture({
    counts: { Iron: 2, Steel: 0 },
    maxOperating: 4,
    fuels: [{ id: "Coal", count: 0 }],
  });
  const decision = planSmelter(
    readSmelterInput({
      getSmelterManager: () => f.SmelterManager,
      getGame: () => f.game,
      getResources: () => f.resources,
      getSettings: () => f.settings,
      getJobs: () => f.jobs,
      getBuildings: () => f.buildings,
      haveTech: f.haveTech,
      consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
    }),
  );
  // Game state moves after sampling: the fuel is now already fueled.
  f.SmelterManager.Fuels.Coal.count = 3;
  const outcome = createSmelterCommandExecutor(() => f.SmelterManager).execute(
    decision,
  );
  assert.equal(outcome.status, "stale");
  assert.deepEqual(f.actions, [], "no mutation on stale precondition");
}

console.log("Smelter automation dual-run and adapter tests passed");
