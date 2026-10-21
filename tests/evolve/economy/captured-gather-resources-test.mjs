import assert from "node:assert/strict";
import { admitResourceClaim } from "../../../src/domain/economy/resources/resource-claims.ts";
import { planGatherResources } from "../../../src/domain/economy/resources/gather-resources.ts";

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
  offerSetIdentity: "high-tech-1-native-offers",
  offerObservationId: "research-offers-1",
  offerBindingGeneration: 1,
  controlBinding: { elementId: "tech-mad_science", generation: 1 },
  nativeOfferCurrent: true,
  nativeActionEligible: true,
  researchPermission: true,
  queueEvidence: "empty",
  rootGeneration: 0,
  progressionGeneration: "epoch-1",
  observationValid: true,
  precedence: "terminal-prerequisite",
  allocationAuthority: { kind: "independent" },
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
let researchOwnerObservationCurrent = true;
const claimIntervention = () => ({
  resourceClaim: manaClaim,
  resourceClaimFreshness: {
    rootGeneration: 0,
    progressionGeneration: "epoch-1",
    offerSetIdentity: "high-tech-1-native-offers",
    offerObservationId: "research-offers-1",
  },
  resourceClaimObservationAvailable: researchOwnerObservationCurrent,
  resourceClaimReservations: [],
});
const claimedAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
  readTestIntervention: claimIntervention,
});
root.tech.conjuring = 2;
handles.set("city-lumber", {
  elementId: "city-lumber",
  generation: 1,
  methods: ["action"],
});
handles.set("city-stone", {
  elementId: "city-stone",
  generation: 1,
  methods: ["action"],
});
delete root.tech.high_tech;
root.resource.Mana.amount = 1;
const claimInput = claimedAdapter.reader.read();
assert.equal(claimInput.clickable.food, true);
assert.equal(claimInput.clickable.lumber, true);
assert.equal(claimInput.resourceClaimLedger.status, "current");
assert.equal(claimInput.resourceClaimLedger.currentStockReserved, 1);
assert.equal(claimInput.resourceClaimLedger.spendableStock, 0);
assert.equal(claimInput.resourceClaimLedger.claimIds.length, 1);
handles.set("tech-black_powder", {
  elementId: "tech-black_powder",
  generation: 1,
  methods: ["action"],
});
const blackPowderClaim = admitResourceClaim({
  ...manaClaim,
  immediateGoalId: "research:tech-black_powder",
  nativeActionId: "tech-black_powder",
  targetGrantTechnology: "explosives",
  requiredQuantity: 100,
  observedNativePrice: 100,
  controlBinding: { elementId: "tech-black_powder", generation: 1 },
});
assert.ok(blackPowderClaim);
const multiClaimAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    ...claimIntervention(),
    resourceClaims: [manaClaim, blackPowderClaim],
  }),
});
const multiClaimInput = multiClaimAdapter.reader.read();
assert.equal(multiClaimInput.resourceClaimLedger.status, "current");
assert.equal(multiClaimInput.resourceClaimLedger.currentStockReserved, 1);
assert.equal(multiClaimInput.resourceClaimLedger.claimIds.length, 2);
handles.set("tech-mad_science", {
  elementId: "tech-mad_science",
  generation: 2,
  methods: ["action"],
});
researchOwnerObservationCurrent = false;
const reboundBeforeOwnerObservation = claimedAdapter.reader.read();
assert.equal(reboundBeforeOwnerObservation.resourceClaimLedger.status, "stale");
assert.equal(
  reboundBeforeOwnerObservation.resourceClaimLedger.spendableStock,
  0,
);
researchOwnerObservationCurrent = true;
handles.set("tech-mad_science", {
  elementId: "tech-mad_science",
  generation: 2,
  methods: [],
});
assert.equal(
  claimedAdapter.reader.read().resourceClaimLedger.status,
  "unavailable",
);
handles.set("tech-mad_science", {
  elementId: "tech-mad_science",
  generation: 1,
  methods: ["action"],
});
const expiredObservation = createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    ...claimIntervention(),
    resourceClaimObservationAvailable: false,
  }),
}).reader.read();
assert.equal(expiredObservation.resourceClaimLedger.status, "unavailable");
assert.equal(expiredObservation.resourceClaimLedger.spendableStock, 0);
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
    elementId === "undefined-food" ||
    elementId === "city-lumber" ||
    elementId === "tech-mad_science"
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
root.resource.Food.amount = 0;
root.resource.Mana.amount = 50;
let unverifiedFoodEmergencyCalls = 0;
const unverifiedFoodEmergencyAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: {
    ...budgetedControls,
    invoke() {
      unverifiedFoodEmergencyCalls += 1;
      return { ok: true, value: true };
    },
  },
  readSettings: () => settings,
  readTestIntervention: claimIntervention,
});
const zeroFoodClaimInput = unverifiedFoodEmergencyAdapter.reader.read();
assert.equal(zeroFoodClaimInput.resourceClaimLedger.spendableStock, 0);
const zeroFoodClaimPlan = planGatherResources(zeroFoodClaimInput);
assert.ok(
  zeroFoodClaimPlan?.operations.some(
    (operation) => operation.actionId === "food",
  ),
  "the planner treats zero Food as an emergency even with no claim spend budget",
);
assert.equal(
  zeroFoodClaimPlan === null
    ? "no-plan"
    : unverifiedFoodEmergencyAdapter.executor.execute(zeroFoodClaimPlan).failure
        .code,
  "gather-claim-budget-exhausted",
);
assert.equal(unverifiedFoodEmergencyCalls, 0);
root.resource.Mana.amount = 51;
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
      offerSetIdentity: "high-tech-1-native-offers",
      offerObservationId: "research-offers-1",
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

settings.buildingAlwaysClick = false;
settings.buildingClickPerTick = 10;
root.race.universe = "magic";
root.race.sappy = false;
root.race.fasting = false;
root.tech.conjuring = 2;
root.resource.Mana.amount = 1;
root.resource.Food.amount = 2;
root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;
root.resource.Lumber.max = 10;
root.resource.Stone.max = 10;
root.resource.Population.amount = 20;
const earlyMagicInput = adapter.reader.read();
assert.equal(
  earlyMagicInput.stopped,
  false,
  "bootstrap gathers with the toggle off",
);
const earlyMagicPlan = planGatherResources(earlyMagicInput);
assert.ok(
  earlyMagicPlan?.operations.some(
    (operation) => operation.actionId === "lumber",
  ),
);
assert.equal(
  earlyMagicPlan?.operations
    .find((operation) => operation.actionId === "food")
    ?.afterAction.find((assignment) => assignment.resourceId === "Mana")
    ?.quantity,
  0,
  "native Conjuring consumes Mana during early bootstrap gathering",
);

root.tech.primitive = 1;
root.resource.Population.amount = 4;
assert.equal(
  adapter.reader.read().stopped,
  true,
  "population decline cannot undo monotonic bootstrap",
);
assert.equal(
  planGatherResources(adapter.reader.read())?.operations.some(
    (operation) => operation.actionId === "lumber",
  ) ?? false,
  false,
  "mature routine material gathering stops without a Rock Quarry",
);
settings.buildingAlwaysClick = true;
assert.equal(
  adapter.reader.read().stopped,
  false,
  "Always Autoclick overrides the mature cutoff",
);
assert.ok(
  planGatherResources(adapter.reader.read())?.operations.some(
    (operation) => operation.actionId === "lumber",
  ),
  "Always Autoclick restores ongoing material gathering",
);
settings.buildingAlwaysClick = false;
assert.equal(
  adapter.reader.read().stopped,
  true,
  "disabling the setting takes effect on the next read",
);
root.resource.Mana.amount = 1;
assert.equal(
  planGatherResources(adapter.reader.read())?.operations.some(
    (operation) => operation.actionId === "lumber",
  ) ?? false,
  false,
  "mature Magic runs do not spend Mana on routine materials",
);
root.resource.Food.amount = 0;
root.race.fasting = true;
assert.equal(
  planGatherResources(adapter.reader.read())?.operations.some(
    (operation) => operation.actionId === "food",
  ) ?? false,
  false,
  "fasting races retain the native no-Food-gather rule",
);
root.race.fasting = false;
assert.ok(
  planGatherResources(adapter.reader.read())?.operations.some(
    (operation) => operation.actionId === "food",
  ),
  "zero Food remains an immediate starvation recovery condition",
);
delete root.tech.primitive;
root.resource.Food.amount = 2;
assert.equal(
  adapter.reader.read().stopped,
  false,
  "a new MAD run returns to bootstrap policy",
);
root.tech.primitive = 1;
root.race.sappy = true;
assert.equal(
  adapter.reader.read().stopped,
  true,
  "Sappy does not bypass mature cutoff",
);
root.race.sappy = false;
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

root = structuredClone(root);
root.tech.primitive = 1;
root.resource.Food.amount = 40;
root.resource.Lumber.amount = 72;
root.resource.Stone.amount = 0;
root.resource.Stone.max = 200;
delete root.race.strong;
settings.buildingAlwaysClick = false;
let targetCurrent = true;
let targetStoneClicks = 0;
const targetControls = {
  resolve(elementId) {
    return ["undefined-stone", "tech-sundial"].includes(elementId)
      ? { elementId, generation: 4, methods: ["action"] }
      : undefined;
  },
  invoke(handle, method) {
    assert.equal(method, "action");
    assert.equal(handle.elementId, "undefined-stone");
    targetStoneClicks += 1;
    root.resource.Stone.amount += 1;
    return { ok: true, value: true };
  },
  capturedElementIds: () => ["undefined-stone", "tech-sundial"],
};
const targetedGatherAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: targetControls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    standardResearchTarget: {
      actionId: "tech-sundial",
      stonePrice: 10,
      clickBudget: 10,
      offerGeneration: 4,
      isCurrent: () => targetCurrent,
    },
  }),
});
const staleTargetInput = targetedGatherAdapter.reader.read();
assert.equal(staleTargetInput.stopped, true);
assert.equal(staleTargetInput.testOnlyStoneTarget.quantity, 10);
targetCurrent = false;
const staleTargetPlan = planGatherResources(staleTargetInput);
assert.deepEqual(
  targetedGatherAdapter.executor.execute(staleTargetPlan),
  // The executor rechecks the current offer before it invokes the captured Stone control.
  {
    status: "stale",
    failure: {
      code: "gather-research-target-stale",
      message: "current Sundial offer or Gather control changed",
    },
  },
);
assert.equal(targetStoneClicks, 0);

targetCurrent = true;
const targetedInput = targetedGatherAdapter.reader.read();
const targetedPlan = planGatherResources(targetedInput);
assert.deepEqual(
  targetedPlan.operations.map(({ actionId, amount }) => ({ actionId, amount })),
  [{ actionId: "stone", amount: 10 }],
);
assert.deepEqual(targetedGatherAdapter.executor.execute(targetedPlan), {
  status: "succeeded",
});
assert.equal(root.resource.Stone.amount, 10);
assert.equal(targetStoneClicks, 10);

console.log("captured-gather-resources ok");
