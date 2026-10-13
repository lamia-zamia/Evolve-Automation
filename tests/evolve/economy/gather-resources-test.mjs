import assert from "node:assert/strict";

import { planGatherResources } from "../../../src/domain/economy/resources/gather-resources.ts";

const makeInput = (overrides = {}) => ({
  stopped: false,
  resourcesPerClick: 1,
  clickLimit: 3,
  fasting: false,
  soulEater: false,
  primitive: false,
  foodConjuring: false,
  materialConjuring: false,
  fursUnlocked: false,
  clickable: {
    food: false,
    lumber: false,
    stone: false,
    chrysotile: false,
    slaughter: false,
  },
  resources: {
    Food: { currentQuantity: 0, maxQuantity: 100 },
    Lumber: { currentQuantity: 0, maxQuantity: 100 },
    Stone: { currentQuantity: 0, maxQuantity: 100 },
    Chrysotile: { currentQuantity: 0, maxQuantity: 100 },
    Furs: { currentQuantity: 0, maxQuantity: 100 },
    Mana: { currentQuantity: 0, maxQuantity: 100 },
  },
  ...overrides,
});

const foodWithMana = (mana, max = 100, clickLimit = 3) =>
  makeInput({
    foodConjuring: true,
    clickLimit,
    clickable: { ...makeInput().clickable, food: true },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 0, maxQuantity: max },
      Mana: { currentQuantity: mana, maxQuantity: 100 },
    },
  });

const belowOne = planGatherResources(foodWithMana(0.75));
assert.equal(belowOne.operations[0].amount, 3);
assert.deepEqual(belowOne.operations[0].afterAction, [
  { resourceId: "Food", expectedQuantity: 0, quantity: 3 },
]);

const exactlyOne = planGatherResources(foodWithMana(1, 100, 2));
assert.equal(exactlyOne.operations[0].amount, 2);
assert.deepEqual(exactlyOne.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 1, quantity: 0 },
  { resourceId: "Food", expectedQuantity: 0, quantity: 11 },
]);

const repeatedWithTwoMana = planGatherResources(foodWithMana(2));
assert.equal(repeatedWithTwoMana.operations[0].amount, 3);
assert.deepEqual(repeatedWithTwoMana.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 2, quantity: 0 },
  { resourceId: "Food", expectedQuantity: 0, quantity: 21 },
]);

const competingTargets = planGatherResources(
  makeInput({
    materialConjuring: true,
    clickLimit: 1,
    clickable: { ...makeInput().clickable, lumber: true, stone: true },
    resources: {
      ...makeInput().resources,
      Mana: { currentQuantity: 2, maxQuantity: 100 },
    },
  }),
);
assert.deepEqual(
  competingTargets.operations.map(({ actionId, afterAction }) => [
    actionId,
    afterAction,
  ]),
  [
    [
      "lumber",
      [
        { resourceId: "Mana", expectedQuantity: 2, quantity: 1 },
        { resourceId: "Lumber", expectedQuantity: 0, quantity: 10 },
      ],
    ],
    [
      "stone",
      [
        { resourceId: "Mana", expectedQuantity: 1, quantity: 0 },
        { resourceId: "Stone", expectedQuantity: 0, quantity: 10 },
      ],
    ],
  ],
);

const capped = planGatherResources(foodWithMana(1, 5));
assert.equal(capped.operations[0].amount, 0);
assert.deepEqual(capped.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 1, quantity: 1 },
  { resourceId: "Food", expectedQuantity: 0, quantity: 0 },
]);

const ordinary = planGatherResources(
  makeInput({
    clickable: { ...makeInput().clickable, food: true },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 0, maxQuantity: 2.5 },
    },
  }),
);
assert.equal(ordinary.operations[0].amount, 3);
assert.deepEqual(ordinary.operations[0].afterAction, [
  { resourceId: "Food", expectedQuantity: 0, quantity: 2.5 },
]);

assert.equal(
  planGatherResources(
    makeInput({ clickable: { ...makeInput().clickable, food: false } }),
  ),
  null,
);

console.log("Gather resource planning matches native Conjuring budgets");
