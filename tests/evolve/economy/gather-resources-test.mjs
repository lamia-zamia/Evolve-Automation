import assert from "node:assert/strict";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { planGatherResources } =
  await import("../../../src/domain/economy/resources/gather-resources.ts");

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

const foodAtDeficit = (mana, deficit, clickLimit = 3, resourcesPerClick = 1) =>
  makeInput({
    foodConjuring: true,
    clickLimit,
    resourcesPerClick,
    clickable: { ...makeInput().clickable, food: true },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 100 - deficit, maxQuantity: 100 },
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

const claimBudget = (spendableStock) => ({
  status: "current",
  currentStock: 2,
  currentStockReserved: 2 - spendableStock,
  remainingAccumulation: 50 - (2 - spendableStock),
  forecastProductionPerSecond: 4.94,
  spendableStock,
  claimIds: ["prestige:mad|research:tech-mad_science"],
  reasons: [],
});
const sharedClaimBudget = planGatherResources(
  makeInput({
    materialConjuring: true,
    clickLimit: 3,
    resourceClaimLedger: claimBudget(1),
    clickable: { ...makeInput().clickable, lumber: true, stone: true },
    resources: {
      ...makeInput().resources,
      Mana: { currentQuantity: 2, maxQuantity: 100 },
    },
  }),
);
assert.deepEqual(
  sharedClaimBudget.operations.map((operation) => operation.actionId),
  ["lumber"],
);
assert.equal(sharedClaimBudget.operations[0].amount, 1);
assert.deepEqual(sharedClaimBudget.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 2, quantity: 1 },
  { resourceId: "Lumber", expectedQuantity: 0, quantity: 10 },
]);

const ordinaryAfterBudgetedSpend = planGatherResources(
  makeInput({
    materialConjuring: true,
    clickLimit: 3,
    resourceClaimLedger: claimBudget(1),
    clickable: { ...makeInput().clickable, lumber: true, stone: true },
    resources: {
      ...makeInput().resources,
      Mana: { currentQuantity: 1.5, maxQuantity: 100 },
    },
  }),
);
assert.deepEqual(
  ordinaryAfterBudgetedSpend.operations.map(({ actionId, amount }) => [
    actionId,
    amount,
  ]),
  [
    ["lumber", 3],
    ["stone", 3],
  ],
);
assert.equal(
  ordinaryAfterBudgetedSpend.operations[0].afterAction[0].quantity,
  0.5,
);

const foodSafetyPrecedence = planGatherResources(
  makeInput({
    foodConjuring: true,
    materialConjuring: true,
    clickLimit: 1,
    resourceClaimLedger: claimBudget(0),
    clickable: { ...makeInput().clickable, food: true, lumber: true },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 0, maxQuantity: 100 },
      Mana: { currentQuantity: 2, maxQuantity: 100 },
    },
  }),
);
assert.deepEqual(
  foodSafetyPrecedence.operations.map(({ actionId }) => actionId),
  ["food"],
);
assert.equal(foodSafetyPrecedence.operations[0].afterAction[0].quantity, 1);

const positiveFoodRespectsClaim = planGatherResources(
  makeInput({
    foodConjuring: true,
    clickLimit: 1,
    resourceClaimLedger: claimBudget(0),
    clickable: { ...makeInput().clickable, food: true },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 1, maxQuantity: 100 },
      Mana: { currentQuantity: 2, maxQuantity: 100 },
    },
  }),
);
assert.equal(positiveFoodRespectsClaim, null);

const staleClaimDoesNotReopenBudgetAfterSafetyWork = planGatherResources(
  makeInput({
    foodConjuring: true,
    materialConjuring: true,
    clickLimit: 3,
    resourceClaimLedger: {
      ...claimBudget(0),
      status: "stale",
      currentStock: 10.8,
      currentStockReserved: 0,
    },
    clickable: {
      ...makeInput().clickable,
      food: true,
      lumber: true,
      stone: true,
    },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 0, maxQuantity: 100 },
      Mana: { currentQuantity: 10.8, maxQuantity: 100 },
    },
  }),
);
assert.deepEqual(
  staleClaimDoesNotReopenBudgetAfterSafetyWork.operations.map(
    ({ actionId }) => actionId,
  ),
  ["food"],
);
assert.equal(
  staleClaimDoesNotReopenBudgetAfterSafetyWork.operations[0].amount,
  1,
);

const capped = planGatherResources(foodWithMana(1, 5));
assert.equal(capped.operations[0].amount, 1);
assert.deepEqual(capped.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 1, quantity: 0 },
  { resourceId: "Food", expectedQuantity: 0, quantity: 5 },
]);

for (const [deficit, mana, expectedClicks, expectedFood] of [
  [0.5, 1, 1, 100],
  [10, 2, 1, 100],
  [15, 2, 2, 100],
  [25, 1, 3, 87],
]) {
  const partial = planGatherResources(foodAtDeficit(mana, deficit, 3))
    .operations[0];
  assert.equal(partial.amount, expectedClicks);
  assert.equal(partial.afterAction[1].quantity, expectedFood);
}

const fractionalMana = planGatherResources(foodAtDeficit(1.5, 40, 3));
assert.equal(fractionalMana.operations[0].amount, 3);
assert.deepEqual(fractionalMana.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 1.5, quantity: 0.5 },
  { resourceId: "Food", expectedQuantity: 60, quantity: 72 },
]);

const clickLimited = planGatherResources(foodAtDeficit(5, 20, 1));
assert.equal(clickLimited.operations[0].amount, 1);
assert.deepEqual(clickLimited.operations[0].afterAction, [
  { resourceId: "Mana", expectedQuantity: 5, quantity: 4 },
  { resourceId: "Food", expectedQuantity: 80, quantity: 90 },
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

const targetedStone = planGatherResources(
  makeInput({
    stopped: true,
    resourcesPerClick: 4,
    clickLimit: 50,
    testOnlyStoneTarget: { quantity: 10, clickBudget: 3 },
    clickable: {
      ...makeInput().clickable,
      food: true,
      lumber: true,
      stone: true,
    },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 40, maxQuantity: 100 },
      Lumber: { currentQuantity: 72, maxQuantity: 200 },
      Stone: { currentQuantity: 0, maxQuantity: 200 },
    },
  }),
);
assert.deepEqual(
  targetedStone?.operations.map(({ actionId, amount, afterAction }) => ({
    actionId,
    amount,
    afterAction,
  })),
  [
    {
      actionId: "stone",
      amount: 3,
      afterAction: [{ resourceId: "Stone", expectedQuantity: 0, quantity: 12 }],
    },
  ],
  "the explicit test target gathers only its shortage within its click budget",
);
assert.equal(
  planGatherResources(
    makeInput({
      stopped: true,
      testOnlyStoneTarget: { quantity: 10, clickBudget: 10 },
      clickable: { ...makeInput().clickable, stone: true },
      resources: {
        ...makeInput().resources,
        Stone: { currentQuantity: 0, maxQuantity: 5 },
      },
    }),
  ),
  null,
  "a target beyond Stone capacity cannot trigger futile clicks",
);

const targetedMaterials = planGatherResources(
  makeInput({
    stopped: true,
    clickLimit: 50,
    testOnlyMaterialTarget: {
      Lumber: { quantity: 20, clickBudget: 5 },
      Stone: { quantity: 20, clickBudget: 5 },
    },
    clickable: {
      ...makeInput().clickable,
      food: true,
      lumber: true,
      stone: true,
    },
    resources: {
      ...makeInput().resources,
      Food: { currentQuantity: 40, maxQuantity: 100 },
      Lumber: { currentQuantity: 12, maxQuantity: 200 },
      Stone: { currentQuantity: 0, maxQuantity: 200 },
    },
  }),
);
assert.deepEqual(
  targetedMaterials?.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [
    { actionId: "lumber", amount: 5 },
    { actionId: "stone", amount: 5 },
  ],
  "material targets gather only each named shortage within per-cycle budgets",
);
const bootstrapTarget = planGatherResources(
  makeInput({
    stopped: true,
    testOnlyBootstrapTarget: {
      resourceId: "Stone",
      quantity: 10,
      clickBudget: 10,
    },
    clickable: { ...makeInput().clickable, stone: true },
    resources: {
      ...makeInput().resources,
      Stone: { currentQuantity: 0, maxQuantity: 200 },
    },
  }),
);
assert.deepEqual(
  bootstrapTarget?.operations.map(({ actionId, amount, bootstrap }) => ({
    actionId,
    amount,
    bootstrap,
  })),
  [{ actionId: "stone", amount: 3, bootstrap: true }],
  "the explicit bootstrap target gathers a modest stock within its finite budget",
);
assert.equal(
  planGatherResources(
    makeInput({
      stopped: true,
      materialConjuring: true,
      resourceClaimLedger: { spendableStock: 0 },
      testOnlyMaterialTarget: {
        Stone: { quantity: 20, clickBudget: 5 },
      },
      clickable: { ...makeInput().clickable, stone: true },
      resources: {
        ...makeInput().resources,
        Mana: { currentQuantity: 5, maxQuantity: 10 },
        Stone: { currentQuantity: 0, maxQuantity: 200 },
      },
    }),
  ),
  null,
  "material target gathering preserves claimed Mana while native Conjuring is active",
);
assert.equal(
  planGatherResources(
    makeInput({
      stopped: true,
      materialConjuring: true,
      testOnlyBootstrapTarget: {
        resourceId: "Stone",
        quantity: 10,
        clickBudget: 10,
      },
      clickable: { ...makeInput().clickable, stone: true },
      resources: {
        ...makeInput().resources,
        Mana: { currentQuantity: 2, maxQuantity: 10 },
        Stone: { currentQuantity: 0, maxQuantity: 200 },
      },
    }),
  ),
  null,
  "bootstrap does not implicitly spend Mana through Conjuring",
);

console.log("Gather resource planning matches native Conjuring budgets");
