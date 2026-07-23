import assert from "node:assert/strict";

import {
  createCraftCommandExecutor,
  createCraftReader,
} from "../src/adapters/evolve/economy/production/craft.ts";
import {
  planCraft,
  shouldRunCraft,
} from "../src/domain/economy/production/craft.ts";

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

console.log("Craft automation adapter and regression tests passed");
