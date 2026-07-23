import assert from "node:assert/strict";

import { runCraftAutomation } from "../src/application/craft.ts";
import {
  createCraftCommandExecutor,
  createCraftReader,
} from "../src/adapters/evolve/economy/production/craft.ts";
import {
  planCraft,
  shouldRunCraft,
} from "../src/domain/economy/production/craft.ts";

function createFixture(scenario) {
  const trace = [];
  const resources = {
    Population: {
      isUnlocked() {
        trace.push(["populationUnlocked"]);
        return scenario.populationUnlocked ?? true;
      },
    },
  };

  for (const definition of scenario.resources ?? []) {
    const resource = {
      id: definition.id,
      currentQuantity: definition.currentQuantity ?? 10,
      maxQuantity: definition.maxQuantity ?? 100,
      requestedQuantity: definition.requestedQuantity ?? 0,
      storageRequired: definition.storageRequired ?? 0,
      rateOfChange: definition.rateOfChange ?? 0,
      usefulRatio: definition.usefulRatio ?? 1,
      get spareQuantity() {
        return this.currentQuantity - this.requestedQuantity;
      },
      isDemanded() {
        trace.push(["resourceDemanded", definition.id]);
        return definition.demanded ?? false;
      },
      isCapped() {
        trace.push(["capped", definition.id]);
        return typeof definition.capped === "function"
          ? definition.capped(resource)
          : (definition.capped ?? false);
      },
    };
    resources[definition.id] = resource;
  }

  const foundryList = (scenario.craftables ?? []).map((definition) => ({
    id: definition.id,
    cost: { ...(definition.cost ?? {}) },
    craftPreserve: definition.craftPreserve ?? 0,
    currentQuantity: definition.currentQuantity ?? 0,
    storageRequired: definition.storageRequired ?? 1,
    usefulRatio: definition.usefulRatio ?? 2,
    autoCraftEnabled: definition.autoCraftEnabled ?? true,
    isUnlocked() {
      trace.push(["craftableUnlocked", definition.id]);
      return definition.unlocked ?? true;
    },
    isDemanded() {
      trace.push(["craftableDemanded", definition.id]);
      return typeof definition.demanded === "function"
        ? definition.demanded(resources)
        : (definition.demanded ?? false);
    },
    tryCraftX(count) {
      trace.push(["craft", definition.id, count]);
      definition.onCraft?.(resources, count);
    },
  }));

  const game = {
    global: { race: { no_craft: scenario.noCraft ?? false } },
  };
  const ticksPerSecond = () => {
    trace.push(["ticksPerSecond"]);
    return scenario.ticksPerSecond ?? 5;
  };
  return { trace, resources, foundryList, game, ticksPerSecond };
}

// Exact copy of the deleted algorithm, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const { resources, game, foundryList, ticksPerSecond } = fixture;
  if (resources.Population.isUnlocked() && !game.global.race["no_craft"]) {
    craftLoop: for (let i = 0; i < foundryList.length; i++) {
      const craftable = foundryList[i];
      if (!craftable.isUnlocked() || !craftable.autoCraftEnabled) continue;

      let affordableAmount = Number.MAX_SAFE_INTEGER;
      for (const res in craftable.cost) {
        const resource = resources[res];
        const quantity = craftable.cost[res];
        affordableAmount = Math.min(
          affordableAmount,
          Math.ceil(
            (resource.currentQuantity -
              resource.maxQuantity * craftable.craftPreserve) /
              quantity,
          ),
        );
        if (craftable.isDemanded()) {
          const maxUse =
            resource.currentQuantity <
            resource.maxQuantity * (craftable.craftPreserve + 0.05)
              ? resource.currentQuantity
              : resource.spareQuantity;
          affordableAmount = Math.min(affordableAmount, maxUse / quantity);
        } else if (
          resource.isDemanded() ||
          (!resource.isCapped() && resource.usefulRatio < craftable.usefulRatio)
        ) {
          continue craftLoop;
        } else if (craftable.currentQuantity < craftable.storageRequired) {
          affordableAmount = Math.min(
            affordableAmount,
            resource.spareQuantity / quantity,
          );
        } else if (
          resource.currentQuantity >= resource.storageRequired ||
          resource.isCapped()
        ) {
          affordableAmount = Math.min(
            affordableAmount,
            Math.ceil(resource.rateOfChange / ticksPerSecond() / quantity),
          );
        } else {
          continue craftLoop;
        }
      }
      affordableAmount = Math.floor(affordableAmount);
      if (affordableAmount >= 1) {
        craftable.tryCraftX(affordableAmount);
        for (const res in craftable.cost) {
          resources[res].currentQuantity -=
            craftable.cost[res] * affordableAmount;
        }
      }
    }
  }
  return {
    trace: fixture.trace,
    quantities: Object.fromEntries(
      Object.entries(resources)
        .filter(([id]) => id !== "Population")
        .map(([id, resource]) => [id, resource.currentQuantity]),
    ),
  };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const outcome = runCraftAutomation({
    reader: createCraftReader({
      getResources: () => fixture.resources,
      getGame: () => fixture.game,
      getFoundryList: () => fixture.foundryList,
      ticksPerSecond: fixture.ticksPerSecond,
    }),
    executor: createCraftCommandExecutor({
      getResources: () => fixture.resources,
      getFoundryList: () => fixture.foundryList,
    }),
  });
  assert.equal(outcome.status, "succeeded");
  return {
    trace: fixture.trace,
    quantities: Object.fromEntries(
      Object.entries(fixture.resources)
        .filter(([id]) => id !== "Population")
        .map(([id, resource]) => [id, resource.currentQuantity]),
    ),
  };
}

const parityScenarios = [
  { name: "locked Population short-circuits", populationUnlocked: false },
  {
    name: "no-craft race short-circuits",
    noCraft: true,
    craftables: [{ id: "Plywood", cost: { Wood: 1 } }],
    resources: [{ id: "Wood" }],
  },
  {
    name: "locked and disabled craftables are skipped in order",
    craftables: [
      { id: "Locked", unlocked: false, cost: { Wood: 1 } },
      { id: "Disabled", autoCraftEnabled: false, cost: { Wood: 1 } },
    ],
    resources: [{ id: "Wood" }],
  },
  {
    name: "demanded craftable below preserve buffer uses current quantity",
    craftables: [
      {
        id: "Plywood",
        demanded: true,
        craftPreserve: 0.2,
        cost: { Wood: 2 },
      },
    ],
    resources: [{ id: "Wood", currentQuantity: 20, maxQuantity: 100 }],
  },
  {
    name: "demanded craftable above buffer uses spare quantity",
    craftables: [{ id: "Plywood", demanded: true, cost: { Wood: 2 } }],
    resources: [{ id: "Wood", currentQuantity: 80, requestedQuantity: 30 }],
  },
  {
    name: "demanded material blocks the remaining cost list",
    craftables: [{ id: "Brick", cost: { Stone: 2, Cement: 1 } }],
    resources: [
      { id: "Stone", demanded: true },
      { id: "Cement", currentQuantity: 999 },
    ],
  },
  {
    name: "uncapped lower-usefulness material blocks crafting",
    craftables: [{ id: "Brick", usefulRatio: 0.8, cost: { Stone: 1 } }],
    resources: [{ id: "Stone", usefulRatio: 0.5, capped: false }],
  },
  {
    name: "required craftable uses material spare quantity",
    craftables: [
      {
        id: "Brick",
        currentQuantity: 1,
        storageRequired: 10,
        cost: { Stone: 3 },
      },
    ],
    resources: [
      { id: "Stone", currentQuantity: 20, requestedQuantity: 5, capped: true },
    ],
  },
  {
    name: "unneeded craftable consumes positive income",
    ticksPerSecond: 5,
    craftables: [
      {
        id: "Brick",
        currentQuantity: 10,
        storageRequired: 1,
        cost: { Stone: 2 },
      },
    ],
    resources: [
      {
        id: "Stone",
        currentQuantity: 40,
        storageRequired: 20,
        capped: true,
        rateOfChange: 21,
      },
    ],
  },
  {
    name: "required uncapped material blocks an unneeded craftable",
    craftables: [
      {
        id: "Brick",
        currentQuantity: 10,
        storageRequired: 1,
        cost: { Stone: 1 },
      },
    ],
    resources: [
      {
        id: "Stone",
        currentQuantity: 5,
        storageRequired: 20,
        capped: false,
        usefulRatio: 3,
      },
    ],
  },
  {
    name: "multiple materials floor the tightest affordability limit",
    craftables: [{ id: "Alloy", demanded: true, cost: { Copper: 3, Iron: 2 } }],
    resources: [
      { id: "Copper", currentQuantity: 20 },
      { id: "Iron", currentQuantity: 9 },
    ],
  },
  {
    name: "later craftables observe earlier cached deductions",
    craftables: [
      { id: "First", demanded: true, cost: { Wood: 2 } },
      { id: "Second", demanded: true, cost: { Wood: 3 } },
    ],
    resources: [{ id: "Wood", currentQuantity: 11 }],
  },
];

for (const scenario of parityScenarios) {
  assert.deepEqual(runModern(scenario), runLegacy(scenario), scenario.name);
}

assert.equal(
  shouldRunCraft({ populationUnlocked: true, noCraft: false }),
  true,
);
assert.equal(
  shouldRunCraft({ populationUnlocked: false, noCraft: false }),
  false,
);
assert.deepEqual(
  planCraft({
    index: 0,
    craftableId: "Brick",
    unlocked: true,
    autoCraftEnabled: true,
    materials: [
      {
        resourceId: "Stone",
        costPerCraft: 2,
        currentQuantity: 10,
        maxQuantity: 100,
        craftPreserve: 0,
        mode: "required",
        availableQuantity: 7,
      },
    ],
  }),
  {
    index: 0,
    craftableId: "Brick",
    count: 3,
    spend: [{ resourceId: "Stone", expectedCurrentQuantity: 10, amount: 6 }],
  },
);

const acquisitionTrace = [];
const lockedGate = createCraftReader({
  getResources: () => {
    acquisitionTrace.push("resources");
    return { Population: { isUnlocked: () => false } };
  },
  getGame: () => {
    acquisitionTrace.push("game");
    return {
      get global() {
        throw new Error("locked gate read game.global");
      },
    };
  },
  getFoundryList: () => {
    acquisitionTrace.push("foundry");
    return [];
  },
  ticksPerSecond: () => {
    throw new Error("locked gate read ticks");
  },
}).readGate();
assert.equal(lockedGate.populationUnlocked, false);
assert.deepEqual(acquisitionTrace, ["resources", "game", "foundry"]);

let lockedDetailRead = false;
const guardedReader = createCraftReader({
  getResources: () => ({ Population: { isUnlocked: () => true } }),
  getGame: () => ({ global: { race: {} } }),
  getFoundryList: () => [
    {
      isUnlocked: () => false,
      get autoCraftEnabled() {
        lockedDetailRead = true;
        throw new Error("locked detail read");
      },
    },
  ],
  ticksPerSecond: () => 5,
});
guardedReader.readGate();
assert.equal(guardedReader.readCandidate(0).unlocked, false);
assert.equal(lockedDetailRead, false);

let laterMaterialRead = false;
const blockedReader = createCraftReader({
  getResources: () => ({
    Population: { isUnlocked: () => true },
    Stone: {
      currentQuantity: 10,
      maxQuantity: 100,
      isDemanded: () => true,
    },
    get Cement() {
      laterMaterialRead = true;
      throw new Error("later material read");
    },
  }),
  getGame: () => ({ global: { race: {} } }),
  getFoundryList: () => [
    {
      id: "Brick",
      cost: { Stone: 1, Cement: 1 },
      craftPreserve: 0,
      autoCraftEnabled: true,
      isUnlocked: () => true,
      isDemanded: () => false,
    },
  ],
  ticksPerSecond: () => 5,
});
blockedReader.readGate();
assert.equal(blockedReader.readCandidate(0).materials[0].mode, "blocked");
assert.equal(laterMaterialRead, false);

assert.throws(
  () =>
    createCraftReader({
      getResources: () => ({ Population: { isUnlocked: () => true } }),
      getGame: () => ({ global: { race: {} } }),
      getFoundryList: () => null,
      ticksPerSecond: () => 5,
    }).readGate(),
  /foundryList must be an array/,
);

const invalidCostReader = createCraftReader({
  getResources: () => ({
    Population: { isUnlocked: () => true },
    Stone: {},
  }),
  getGame: () => ({ global: { race: {} } }),
  getFoundryList: () => [
    {
      id: "Brick",
      cost: { Stone: 0 },
      autoCraftEnabled: true,
      isUnlocked: () => true,
    },
  ],
  ticksPerSecond: () => 5,
});
invalidCostReader.readGate();
assert.throws(
  () => invalidCostReader.readCandidate(0),
  /foundryList\[0\]\.cost\.Stone must be positive/,
);

const emptyCostReader = createCraftReader({
  getResources: () => ({ Population: { isUnlocked: () => true } }),
  getGame: () => ({ global: { race: {} } }),
  getFoundryList: () => [
    {
      id: "Free",
      cost: {},
      autoCraftEnabled: true,
      isUnlocked: () => true,
    },
  ],
  ticksPerSecond: () => 5,
});
emptyCostReader.readGate();
assert.throws(
  () => emptyCostReader.readCandidate(0),
  /cost must contain at least one material/,
);

const staleActions = [];
const staleResources = {
  Stone: { currentQuantity: 9 },
  Iron: { currentQuantity: 4 },
};
const staleExecutor = createCraftCommandExecutor({
  getResources: () => staleResources,
  getFoundryList: () => [
    { id: "Alloy", tryCraftX: (count) => staleActions.push(["craft", count]) },
  ],
});
const staleOutcome = staleExecutor.execute({
  index: 0,
  craftableId: "Alloy",
  count: 2,
  spend: [
    { resourceId: "Stone", expectedCurrentQuantity: 9, amount: 4 },
    { resourceId: "Iron", expectedCurrentQuantity: 5, amount: 2 },
  ],
});
assert.equal(staleOutcome.status, "stale");
assert.deepEqual(
  staleActions,
  [],
  "all material balances preflight before craft",
);
assert.equal(staleResources.Stone.currentQuantity, 9);

const staleListOutcome = createCraftCommandExecutor({
  getResources: () => ({}),
  getFoundryList: () => [{ id: "Replacement", tryCraftX() {} }],
}).execute({
  index: 0,
  craftableId: "Expected",
  count: 1,
  spend: [],
});
assert.equal(staleListOutcome.status, "stale");

let invalidExecutorRead = false;
const invalidOutcome = createCraftCommandExecutor({
  getResources: () => {
    invalidExecutorRead = true;
    return {};
  },
  getFoundryList: () => {
    invalidExecutorRead = true;
    return [];
  },
}).execute({
  index: 0,
  craftableId: "Brick",
  count: 0,
  spend: [],
});
assert.equal(invalidOutcome.status, "rejected");
assert.equal(invalidExecutorRead, false);

console.log("Craft automation dual-run and adapter tests passed");
