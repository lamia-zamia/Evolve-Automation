import assert from "node:assert/strict";
import { admitResourceClaim } from "../../../src/domain/economy/resources/resource-claims.ts";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { createCapturedGatherResourcesAdapter } =
  await import("../../../src/adapters/evolve/economy/resources/captured-gather-resources.ts");

let root = {
  resource: {
    Food: { amount: 2, max: 10 },
    Lumber: { amount: 10, max: 10 },
    Stone: { amount: 10, max: 10 },
    Chrysotile: { amount: 10, max: 10 },
    Furs: { amount: 0, max: 10, display: false },
    Mana: { amount: 0, max: 100 },
    Population: { amount: 10, max: 20 },
  },
  race: {},
  tech: {},
  genes: {},
  queue: { display: false, queue: [] },
  r_queue: { display: false, queue: [] },
  city: { rock_quarry: { count: 0 } },
};
const handles = new Map([
  [
    "undefined-food",
    { elementId: "undefined-food", generation: 1, methods: ["action"] },
  ],
]);
const controls = {
  resolve: (elementId) => handles.get(elementId),
  invoke(handle, method) {
    assert.equal(method, "action");
    assert.equal(handle.elementId, "undefined-food");
    root.resource.Food.amount += 1;
    return { ok: true, value: false };
  },
  capturedElementIds: () => [...handles.keys()],
};
const rootState = {
  readRoot: () => root,
  isReactivitySuppressed: () => false,
  subscribeRootReplaced: () => () => {},
};
const settings = {
  buildingAlwaysClick: true,
  buildingClickPerTick: 3,
  autoResearch: true,
  autoTrigger: false,
  prestigeType: "mad",
};
const adapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
});

const input = adapter.reader.read();
assert.equal(input.stopped, false);
assert.equal(input.clickable.food, true);
assert.equal(input.clickable.lumber, false);
assert.equal(input.resources.Food.currentQuantity, 2);
assert.equal(input.resourcesPerClick, 1);
const decision = {
  operations: [
    {
      actionId: "food",
      amount: 3,
      beforeAction: [{ resourceId: "Food", expectedQuantity: 2, quantity: 5 }],
      afterAction: [],
    },
  ],
};
assert.deepEqual(adapter.executor.execute(decision), { status: "succeeded" });
assert.equal(root.resource.Food.amount, 5);

const incorrectNativeYield = {
  operations: [
    {
      actionId: "food",
      amount: 1,
      beforeAction: [{ resourceId: "Food", expectedQuantity: 5, quantity: 5 }],
      afterAction: [{ resourceId: "Food", expectedQuantity: 5, quantity: 15 }],
    },
  ],
};
assert.deepEqual(adapter.executor.execute(incorrectNativeYield), {
  status: "stale",
  failure: {
    code: "gather-result-changed",
    message: "gather result differed for food",
  },
});
assert.equal(root.resource.Food.amount, 6);

for (const [rank, expected] of [
  [0.1, 2],
  [0.25, 2.3],
  [0.5, 2.9],
  [0.75, 3.4],
  [1, 4],
  [1.33, 5],
  [1.5, 5.5],
  [1.67, 6],
  [2, 7],
  [2.2, 7.3],
  [2.4, 7.6],
]) {
  root.race.strong = rank;
  assert.equal(adapter.reader.read().resourcesPerClick, expected);
}
for (const rank of [undefined, false, 0]) {
  if (rank === undefined) delete root.race.strong;
  else root.race.strong = rank;
  assert.equal(adapter.reader.read().resourcesPerClick, 1);
}
root.race.strong = true;
assert.equal(adapter.reader.read().resourcesPerClick, 4);
root.race.strong = 1;
root.genes.enhance = true;
assert.equal(adapter.reader.read().resourcesPerClick, 8);
root.race.strong = 0.25;
assert.equal(adapter.reader.read().resourcesPerClick, 4.7);
root.genes.enhance = false;

const unavailableAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: { ...controls, resolve: () => undefined },
  readSettings: () => settings,
});
assert.equal(
  Object.values(unavailableAdapter.reader.read().clickable).some(Boolean),
  false,
);

const manaClaim = admitResourceClaim({
  terminalGoalId: "prestige:mad",
  immediateGoalId: "research:tech-mad_science",
  owner: "goal-planner",
  provenance: "verified-native-prerequisite",
  prerequisiteRelation: "verified",
  nativeActionId: "tech-mad_science",
  targetGrantTechnology: "high_tech",
  targetGrantLevel: 1,
  resourceId: "Mana",
  poolId: "anywhere",
  requiredQuantity: 50,
  observedStock: 1,
  observedCapacity: 100,
  observedNativePrice: 50,
  nativeOfferCurrent: true,
  nativeActionEligible: true,
  researchPermission: true,
  queueEvidence: "empty",
  rootGeneration: 0,
  progressionGeneration: "epoch-1",
  offerGeneration: 1,
  observationValid: true,
  precedence: "terminal-prerequisite",
  forecastProductionPerSecond: 4.94,
  uncertaintyReasons: [],
  unavailableReasons: [],
});
assert.ok(manaClaim);
handles.set("city-lumber", {
  elementId: "city-lumber",
  generation: 1,
  methods: ["action"],
});
handles.set("tech-mad_science", {
  elementId: "tech-mad_science",
  generation: 1,
  methods: ["action"],
});
const claimIntervention = () => ({
  resourceClaim: manaClaim,
  resourceClaimFreshness: {
    rootGeneration: 0,
    progressionGeneration: "epoch-1",
    offerGeneration: 1,
  },
  resourceClaimReservations: [],
});
const claimedAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
  readTestIntervention: claimIntervention,
});
root.tech.conjuring = 2;
delete root.tech.high_tech;
root.resource.Mana.amount = 1;
const claimInput = claimedAdapter.reader.read();
assert.equal(claimInput.clickable.food, true);
assert.equal(claimInput.clickable.lumber, true);
assert.equal(claimInput.resourceClaimLedger.status, "current");
assert.equal(claimInput.resourceClaimLedger.currentStockReserved, 1);
assert.equal(claimInput.resourceClaimLedger.spendableStock, 0);
assert.equal(claimInput.resourceClaimLedger.claimIds.length, 1);
root.resource.Mana.amount = 0.5;
assert.equal(
  claimedAdapter.reader.read().resourceClaimLedger.status,
  "current",
);
root.resource.Mana.amount = 51;
root.resource.Food.amount = 0;
root.resource.Lumber.amount = 0;
let claimedGatherCalls = 0;
const budgetedControls = {
  resolve: (elementId) =>
    elementId === "undefined-food" || elementId === "city-lumber"
      ? { elementId, generation: 1, methods: ["action"] }
      : undefined,
  invoke(handle) {
    claimedGatherCalls += 1;
    if (handle.elementId === "undefined-food") {
      root.resource.Food.amount += 1;
      root.resource.Mana.amount -= 1;
      return { ok: true, value: true };
    }
    root.resource.Lumber.amount += 10;
    root.resource.Mana.amount -= 1;
    return { ok: true, value: true };
  },
  capturedElementIds: () => ["undefined-food", "city-lumber"],
};
const budgetedAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: budgetedControls,
  readSettings: () => settings,
  readTestIntervention: claimIntervention,
});
const budgetedInput = budgetedAdapter.reader.read();
assert.equal(budgetedInput.resourceClaimLedger.spendableStock, 1);
assert.deepEqual(
  budgetedAdapter.executor.execute({
    operations: [
      {
        actionId: "food",
        amount: 1,
        beforeAction: [
          { resourceId: "Mana", expectedQuantity: 51, quantity: 51 },
          { resourceId: "Food", expectedQuantity: 0, quantity: 0 },
        ],
        afterAction: [
          { resourceId: "Mana", expectedQuantity: 51, quantity: 50 },
          { resourceId: "Food", expectedQuantity: 0, quantity: 1 },
        ],
      },
      {
        actionId: "lumber",
        amount: 1,
        beforeAction: [
          { resourceId: "Mana", expectedQuantity: 50, quantity: 50 },
          { resourceId: "Lumber", expectedQuantity: 0, quantity: 0 },
        ],
        afterAction: [
          { resourceId: "Mana", expectedQuantity: 50, quantity: 49 },
          { resourceId: "Lumber", expectedQuantity: 0, quantity: 10 },
        ],
      },
    ],
  }),
  {
    status: "stale",
    failure: {
      code: "gather-claim-budget-exhausted",
      message: "Mana claim budget was exhausted before lumber",
    },
  },
);
assert.equal(claimedGatherCalls, 1);
assert.equal(root.resource.Mana.amount, 50);
assert.equal(root.resource.Food.amount, 1);
assert.equal(root.resource.Lumber.amount, 0);
root.resource.Food.amount = 2;
root.resource.Lumber.amount = 10;
root.resource.Mana.amount = 51;
let unexpectedSpendCalls = 0;
const unexpectedSpendAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: {
    ...budgetedControls,
    invoke() {
      unexpectedSpendCalls += 1;
      root.resource.Food.amount += 1;
      root.resource.Mana.amount -= 2;
      return { ok: true, value: true };
    },
  },
  readSettings: () => settings,
  readTestIntervention: claimIntervention,
});
unexpectedSpendAdapter.reader.read();
assert.deepEqual(
  unexpectedSpendAdapter.executor.execute({
    operations: [
      {
        actionId: "food",
        amount: 1,
        beforeAction: [
          { resourceId: "Mana", expectedQuantity: 51, quantity: 51 },
          { resourceId: "Food", expectedQuantity: 2, quantity: 2 },
        ],
        afterAction: [
          { resourceId: "Mana", expectedQuantity: 51, quantity: 50 },
          { resourceId: "Food", expectedQuantity: 2, quantity: 3 },
        ],
      },
    ],
  }),
  {
    status: "stale",
    failure: {
      code: "gather-mana-postcondition",
      message: "Mana changed unexpectedly after food",
    },
  },
);
assert.equal(unexpectedSpendCalls, 1);
root.resource.Food.amount = 2;
root.resource.Lumber.amount = 10;
root.resource.Mana.amount = 50;
root.tech.high_tech = 1;
assert.equal(claimedAdapter.reader.read().resourceClaimLedger, undefined);
root.tech.high_tech = 0;
const staleClaimInput = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    ...claimIntervention(),
    resourceClaimFreshness: {
      rootGeneration: 1,
      progressionGeneration: "epoch-1",
      offerGeneration: 1,
    },
  }),
}).reader.read();
assert.equal(staleClaimInput.resourceClaimLedger.status, "stale");
assert.equal(staleClaimInput.resourceClaimLedger.spendableStock, 0);
root.r_queue.queue = [{ id: "tech-mad_science" }];
root.r_queue.pause = true;
assert.equal(claimedAdapter.reader.read().resourceClaimLedger, undefined);
root.r_queue.queue = [];
root.r_queue.pause = false;

root.resource.Population.amount = 20;
root.city.rock_quarry.count = 1;
settings.buildingAlwaysClick = false;
assert.equal(adapter.reader.read().stopped, true);

const changedRoot = { ...root, resource: { ...root.resource } };
root = changedRoot;
assert.deepEqual(adapter.executor.execute(decision), {
  status: "stale",
  failure: {
    code: "gather-root-changed",
    message: "captured game root changed",
  },
});

console.log("captured-gather-resources ok");
