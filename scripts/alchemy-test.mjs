import assert from "node:assert/strict";

import {
  createAlchemyCommandExecutor,
  readAlchemyInput,
} from "../src/adapters/evolve/economy/production/alchemy.ts";

// Adapter: legacy refreshes getter bindings before the locked gate, but the
// returned state must remain completely uninspected.
{
  const getterCalls = [];
  const input = readAlchemyInput({
    getAlchemyManager: () => ({ isUnlocked: () => false }),
    getResources: () => (getterCalls.push("resources"), null),
    getSettings: () => (getterCalls.push("settings"), null),
    getGame: () => (getterCalls.push("game"), null),
    getAchievementStar: () => {
      throw new Error("stars must not be read when locked");
    },
  });
  assert.equal(input.unlocked, false);
  assert.deepEqual(input.resources, []);
  assert.deepEqual(getterCalls, ["resources", "settings", "game"]);
  assert.ok(Object.isFrozen(input));
}

// Fullmetal-disabled state must not inspect fullmetal-only game/resource data.
{
  const input = readAlchemyInput({
    getAlchemyManager: () => ({
      isUnlocked: () => true,
      managedPriorityList: () => [
        {
          id: "Iron",
          isUseful: () => true,
          get instance() {
            throw new Error(
              "instance must not be read when helper is disabled",
            );
          },
        },
      ],
      // Keyed by id: the live manager indexes its state by the resource id,
      // so an adapter that drops the argument must fail here rather than in game.
      currentCount: (id) => ({ Iron: 0 })[id],
      resWeighting: (id) => ({ Iron: 1 })[id],
      transmuteTier: () => {
        throw new Error("tier must not be read when helper is disabled");
      },
    }),
    getResources: () => ({
      Mana: { rateOfChange: 1, storageRatio: 0.5 },
      Crystal: {
        currentQuantity: 1,
        rateOfChange: 0,
        isDemanded: () => false,
      },
    }),
    getSettings: () => ({
      autoPylon: false,
      magicAlchemyManaUse: 0.5,
      magicFullmetalHelper: false,
    }),
    getGame: () => ({
      get global() {
        throw new Error(
          "game internals must not be read when helper is disabled",
        );
      },
    }),
    getAchievementStar: () => {
      throw new Error("achievement must not be read when helper is disabled");
    },
  });
  assert.equal(input.magicFullmetalHelper, false);
}

{
  const mutations = [];
  const result = createAlchemyCommandExecutor(() => ({
    currentCount: () => 2,
    transmuteLess: (...args) => mutations.push(["less", ...args]),
    transmuteMore: (...args) => mutations.push(["more", ...args]),
  })).execute({
    decrease: [],
    increase: [{ id: "Iron", expectedCurrentCount: 1, count: 1 }],
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log("Alchemy automation reader, planner, and adapter tests passed");
