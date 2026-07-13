import assert from "node:assert/strict";

import { createAutoAlchemy } from "../src/automation/economy/alchemy.ts";

function runAlchemyCase({ unlocked = true } = {}) {
  const actions = [];
  const products = [
    { id: "Iron", isUseful: () => true },
    { id: "Steel", isUseful: () => true },
  ];
  const counts = { Iron: 2, Steel: 0 };
  const weights = { Iron: 1, Steel: 3 };
  const resources = {
    Mana: { currentQuantity: 10, rateOfChange: 8, storageRatio: 0.5 },
    Crystal: {
      currentQuantity: 100,
      rateOfChange: 0,
      isDemanded: () => false,
    },
  };
  const AlchemyManager = {
    isUnlocked: () => unlocked,
    managedPriorityList: () => products,
    currentCount: (id) => counts[id],
    resWeighting: (id) => weights[id],
    transmuteTier: () => 1,
    transmuteLess: (id, count) => actions.push(["less", id, count]),
    transmuteMore: (id, count) => actions.push(["more", id, count]),
  };
  const autoAlchemy = createAutoAlchemy({
    AlchemyManager,
    getResources: () => resources,
    getSettings: () => ({
      autoPylon: true,
      magicAlchemyManaUse: 0.5,
      magicFullmetalHelper: false,
    }),
    getGame: () => ({
      global: { race: { universe: "standard" }, tech: { alchemy: 1 } },
      alevel: () => 0,
    }),
    getAchievementStar: () => 0,
  });

  autoAlchemy();
  return actions;
}

assert.deepEqual(runAlchemyCase(), [
  ["less", "Iron", 1],
  ["more", "Steel", 3],
]);
assert.deepEqual(
  runAlchemyCase({ unlocked: false }),
  [],
  "locked alchemy must not change transmutations",
);

console.log("Alchemy automation regression tests passed");
