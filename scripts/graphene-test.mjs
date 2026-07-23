import assert from "node:assert/strict";

import {
  createGrapheneCommandExecutor,
  readGrapheneInput,
} from "../src/adapters/evolve/economy/production/graphene.ts";

const CONSUMPTION_BALANCE_MIN = 60;

// Adapter: legacy refreshes resources before initIndustry, but does not inspect
// the returned object when the industry is unavailable.
{
  let resourceGetterCalls = 0;
  const input = readGrapheneInput({
    getGrapheneManager: () => ({ initIndustry: () => false }),
    getResources: () => (resourceGetterCalls++, null),
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  });
  assert.equal(input.initialised, false);
  assert.deepEqual(input.fuels, []);
  assert.equal(resourceGetterCalls, 1);
}

// Locked fuels participate in legacy sorting, but none of their deeper
// consumption fields or fueled-count state is relevant.
{
  let usefulnessCalls = 0;
  const lockedResource = {
    storageRatio: 0.5,
    rateOfChange: 1,
    isUnlocked: () => false,
    get currentQuantity() {
      throw new Error("locked current quantity must not be read");
    },
  };
  const input = readGrapheneInput({
    getGrapheneManager: () => ({
      Fuels: {
        Coal: {
          id: "Coal",
          cost: {
            get quantity() {
              throw new Error("locked cost must not be read");
            },
            get minRateOfChange() {
              throw new Error("locked minimum rate must not be read");
            },
            resource: lockedResource,
          },
        },
      },
      initIndustry: () => true,
      maxOperating: () => 1,
      fueledCount: () => {
        throw new Error("locked fuel count must not be read");
      },
    }),
    getResources: () => ({
      Graphene: { isUseful: () => (usefulnessCalls++, true) },
    }),
    consumptionBalanceMin: CONSUMPTION_BALANCE_MIN,
  });
  assert.equal(input.fuels[0].isUnlocked, false);
  assert.equal(usefulnessCalls, 0);
}

{
  const mutations = [];
  const result = createGrapheneCommandExecutor(() => ({
    Fuels: { Coal: { id: "Coal" } },
    fueledCount: () => 3,
    decreaseFuel: (...args) => mutations.push(["decrease", ...args]),
    increaseFuel: (...args) => mutations.push(["increase", ...args]),
  })).execute([{ fuelId: "Coal", expectedCurrentFuelCount: 2, delta: 1 }]);
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log("Graphene automation reader, planner, and adapter tests passed");
