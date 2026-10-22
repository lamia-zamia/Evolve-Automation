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
      cost: { Lumber: 8, Stone: 10 },
      resourceClickBudget: 10,
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
      message: "current Research offer or Gather control changed",
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

root.resource.Lumber.amount = 17;
root.resource.Lumber.max = 200;
root.resource.Stone.amount = 0;
root.resource.Stone.max = 200;
root.resource.Food.amount = 40;
delete root.tech.conjuring;
root.resource.Mana.amount = 0;
let materialGatherCalls = 0;
const axeControls = {
  resolve(elementId) {
    return ["city-lumber", "undefined-stone", "tech-stone_axe"].includes(
      elementId,
    )
      ? { elementId, generation: 6, methods: ["action"] }
      : undefined;
  },
  invoke(handle, method) {
    assert.equal(method, "action");
    materialGatherCalls += 1;
    const resourceId = handle.elementId === "city-lumber" ? "Lumber" : "Stone";
    root.resource[resourceId].amount += 1;
    return { ok: true, value: true };
  },
  capturedElementIds: () => [
    "city-lumber",
    "undefined-stone",
    "tech-stone_axe",
  ],
};
const axeGatherAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: axeControls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    standardResearchTarget: {
      actionId: "tech-stone_axe",
      cost: { Knowledge: 45, Lumber: 20, Stone: 20 },
      resourceClickBudget: 5,
      clickBudget: 5,
      offerGeneration: 6,
      isCurrent: () => true,
    },
  }),
});
const axeTargetInput = axeGatherAdapter.reader.read();
assert.deepEqual(axeTargetInput.testOnlyMaterialTarget, {
  Lumber: { quantity: 20, clickBudget: 5 },
  Stone: { quantity: 20, clickBudget: 5 },
});
const axeTargetPlan = planGatherResources(axeTargetInput);
assert.deepEqual(
  axeTargetPlan.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [
    { actionId: "lumber", amount: 3 },
    { actionId: "stone", amount: 5 },
  ],
);
const axeResult = axeGatherAdapter.executor.execute(axeTargetPlan);
assert.deepEqual(axeResult, { status: "succeeded" });
assert.equal(root.resource.Lumber.amount, 20);
assert.equal(root.resource.Stone.amount, 5);
assert.equal(materialGatherCalls, 8);

root.resource.Lumber.amount = 20;
root.resource.Stone.amount = 5;
root.city.compost = { count: 0, on: 0 };
let compostTargetCurrent = true;
let compostStoneClicks = 0;
const compostControls = {
  resolve(elementId) {
    return ["city-compost", "city-lumber", "undefined-stone"].includes(
      elementId,
    )
      ? { elementId, generation: 9, methods: ["action"] }
      : undefined;
  },
  invoke(handle, method) {
    assert.equal(method, "action");
    assert.equal(handle.elementId, "undefined-stone");
    compostStoneClicks += 1;
    root.resource.Stone.amount += 1;
    return { ok: true, value: true };
  },
  capturedElementIds: () => ["city-compost", "city-lumber", "undefined-stone"],
};
const compostGatherAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: compostControls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    standardConstructionTarget: {
      actionId: "city-compost",
      cost: { Lumber: 12, Stone: 12 },
      resourceClickBudget: 5,
      controlGeneration: 9,
      isCurrent: () => compostTargetCurrent,
    },
  }),
});
const compostTargetInput = compostGatherAdapter.reader.read();
assert.deepEqual(compostTargetInput.testOnlyMaterialTarget, {
  Lumber: {
    quantity: 12,
    clickBudget: 5,
    preserveMana: true,
    constructionProvenance: {
      actionId: "city-compost",
      resourceId: "Lumber",
      price: 12,
      targetGeneration: 9,
      resourceControlGeneration: 9,
    },
  },
  Stone: {
    quantity: 12,
    clickBudget: 5,
    preserveMana: true,
    constructionProvenance: {
      actionId: "city-compost",
      resourceId: "Stone",
      price: 12,
      targetGeneration: 9,
      resourceControlGeneration: 9,
    },
  },
});
const compostTargetPlan = planGatherResources(compostTargetInput);
assert.deepEqual(
  compostTargetPlan.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [{ actionId: "stone", amount: 5 }],
  "a funded Lumber side of the Compost target must not trigger extra Lumber clicks",
);
compostTargetCurrent = false;
assert.equal(
  compostGatherAdapter.executor.execute(compostTargetPlan).status,
  "stale",
);
assert.equal(compostStoneClicks, 0);
compostTargetCurrent = true;
const compostFirstBatch = planGatherResources(
  compostGatherAdapter.reader.read(),
);
assert.deepEqual(compostGatherAdapter.executor.execute(compostFirstBatch), {
  status: "succeeded",
});
assert.equal(root.resource.Stone.amount, 10);
assert.equal(compostStoneClicks, 5);
const compostFinalBatch = planGatherResources(
  compostGatherAdapter.reader.read(),
);
assert.deepEqual(
  compostFinalBatch.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [{ actionId: "stone", amount: 2 }],
);
assert.deepEqual(compostGatherAdapter.executor.execute(compostFinalBatch), {
  status: "succeeded",
});
assert.equal(root.resource.Stone.amount, 12);
assert.equal(compostStoneClicks, 7);

root = {
  resource: {
    Food: { amount: 40, max: 1000 },
    Lumber: { amount: 95, max: 200 },
    Stone: { amount: 0, max: 200 },
    Chrysotile: { amount: 0, max: 200 },
    Furs: { amount: 0, max: 100, display: false },
    Mana: { amount: 0, max: 100 },
    human: { amount: 0, max: 20 },
  },
  race: { universe: "standard", species: "human" },
  stats: { days: 0 },
  tech: { primitive: 2 },
  genes: {},
  city: {},
  civic: {},
  queue: { queue: [] },
  r_queue: { queue: [] },
};
settings.buildingAlwaysClick = false;
settings.buildingClickPerTick = 3;
handles.clear();
for (const elementId of ["undefined-food", "city-lumber", "undefined-stone"])
  handles.set(elementId, {
    elementId,
    generation: 20,
    methods: ["action"],
  });
let bootstrapAuthorization = {
  authorized: true,
  authorizationId: "human-start-1",
};
let bootstrapRootGeneration = 7;
let revokeBootstrapAfterNextClick = false;
let standardConstructionTarget;
let bootstrapClicks = 0;
const bootstrapAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: {
    resolve: (elementId) => handles.get(elementId),
    invoke(handle, method) {
      assert.equal(method, "action");
      const resourceId =
        handle.elementId === "undefined-food"
          ? "Food"
          : handle.elementId === "city-lumber"
            ? "Lumber"
            : "Stone";
      root.resource[resourceId].amount += 1;
      bootstrapClicks += 1;
      if (revokeBootstrapAfterNextClick) {
        revokeBootstrapAfterNextClick = false;
        bootstrapAuthorization = {
          ...bootstrapAuthorization,
          authorized: false,
        };
      }
      return { ok: true, value: false };
    },
    capturedElementIds: () => [...handles.keys()],
  },
  readSettings: () => settings,
  readTestIntervention: () => ({
    civilizationBootstrap: bootstrapAuthorization,
    rootGeneration: bootstrapRootGeneration,
    standardConstructionTarget,
  }),
});
for (let cycle = 0; cycle < 1; cycle += 1) {
  const bootstrapInput = bootstrapAdapter.reader.read();
  assert.deepEqual(bootstrapInput.testOnlyBootstrapTarget, {
    resourceId: "Stone",
    quantity: 10,
    clickBudget: Math.min(10 - bootstrapClicks, 10),
  });
  const bootstrapDecision = planGatherResources(bootstrapInput);
  assert.deepEqual(bootstrapAdapter.executor.execute(bootstrapDecision), {
    status: "succeeded",
  });
}
assert.equal(bootstrapClicks, 3);

root = { ...root, resource: { ...root.resource } };
root.resource.Food.amount = 100;
assert.equal(
  bootstrapAdapter.reader.read().testOnlyBootstrapTarget,
  undefined,
  "root replacement suspends an active bootstrap authorization",
);
bootstrapAuthorization = {
  authorized: true,
  authorizationId: "human-start-2",
};
assert.equal(
  bootstrapAdapter.reader.read().testOnlyBootstrapTarget?.resourceId,
  "Stone",
  "a new explicit authorization starts a new root generation",
);
for (let cycle = 0; cycle < 3; cycle += 1) {
  const bootstrapInput = bootstrapAdapter.reader.read();
  assert.deepEqual(bootstrapInput.testOnlyBootstrapTarget, {
    resourceId: "Stone",
    quantity: 10,
    clickBudget: Math.min(10 - (bootstrapClicks - 3), 10),
  });
  const bootstrapDecision = planGatherResources(bootstrapInput);
  assert.deepEqual(bootstrapAdapter.executor.execute(bootstrapDecision), {
    status: "succeeded",
  });
}
assert.equal(
  bootstrapClicks,
  10,
  "the new authorization respects its ten-click bound",
);
assert.equal(root.resource.Stone.amount, 10);
assert.equal(
  bootstrapAdapter.reader.read().testOnlyBootstrapTarget,
  undefined,
  "spent bootstrap budget does not re-enter under the same authorization",
);

standardConstructionTarget = {
  actionId: "city-farm",
  cost: { Lumber: 100, Stone: 15 },
  resourceClickBudget: 5,
  controlGeneration: 30,
  isCurrent: () => true,
};
handles.set("city-farm", {
  elementId: "city-farm",
  generation: 30,
  methods: ["action"],
});
root.resource.Mana.amount = 0;
root.tech.conjuring = 2;
const manaProtectedInput = bootstrapAdapter.reader.read();
const manaProtectedDecision = planGatherResources(manaProtectedInput);
assert.notEqual(manaProtectedDecision, null);
assert.equal(
  manaProtectedDecision.operations.some((operation) => operation.preserveMana),
  true,
  "Construction Gather operations retain their Mana protection requirement",
);
const clicksBeforeManaProtection = bootstrapClicks;
root.resource.Mana.amount = 2;
assert.deepEqual(bootstrapAdapter.executor.execute(manaProtectedDecision), {
  status: "stale",
  failure: {
    code: "gather-construction-mana-protected",
    message: "Construction-targeted lumber would spend protected Mana",
  },
});
assert.equal(
  bootstrapClicks,
  clicksBeforeManaProtection,
  "Construction handoff does not invoke a Conjuring click that spends Mana",
);
assert.equal(root.resource.Mana.amount, 2);
root.resource.Mana.amount = 0;
delete root.tech.conjuring;
const firstHandoffInput = bootstrapAdapter.reader.read();
assert.deepEqual(firstHandoffInput.testOnlyMaterialTarget, {
  Lumber: {
    quantity: 100,
    clickBudget: 5,
    preserveMana: true,
    constructionProvenance: {
      actionId: "city-farm",
      resourceId: "Lumber",
      price: 100,
      targetGeneration: 30,
      resourceControlGeneration: 20,
    },
  },
  Stone: {
    quantity: 15,
    clickBudget: 5,
    preserveMana: true,
    constructionProvenance: {
      actionId: "city-farm",
      resourceId: "Stone",
      price: 15,
      targetGeneration: 30,
      resourceControlGeneration: 20,
    },
  },
});
const firstHandoffDecision = planGatherResources(firstHandoffInput);
assert.deepEqual(
  firstHandoffDecision.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [
    { actionId: "lumber", amount: 3 },
    { actionId: "stone", amount: 2 },
  ],
  "current Construction demand is gathered under a shared five-click cycle cap",
);
assert.deepEqual(bootstrapAdapter.executor.execute(firstHandoffDecision), {
  status: "succeeded",
});
assert.equal(bootstrapAuthorization.state.handoffClicks, 5);
const secondHandoffInput = bootstrapAdapter.reader.read();
assert.deepEqual(secondHandoffInput.testOnlyMaterialTarget, {
  Lumber: {
    quantity: 100,
    clickBudget: 5,
    preserveMana: true,
    constructionProvenance: {
      actionId: "city-farm",
      resourceId: "Lumber",
      price: 100,
      targetGeneration: 30,
      resourceControlGeneration: 20,
    },
  },
  Stone: {
    quantity: 15,
    clickBudget: 5,
    preserveMana: true,
    constructionProvenance: {
      actionId: "city-farm",
      resourceId: "Stone",
      price: 15,
      targetGeneration: 30,
      resourceControlGeneration: 20,
    },
  },
});
assert.deepEqual(
  bootstrapAdapter.executor.execute(planGatherResources(secondHandoffInput)),
  { status: "succeeded" },
);
assert.equal(bootstrapAuthorization.state.handoffClicks, 10);
assert.equal(
  bootstrapAdapter.reader.read().testOnlyMaterialTarget,
  undefined,
  "Construction handoff respects its ten-click total limit",
);

root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;
root.resource.Lumber.max = 20;
root.resource.Stone.max = 20;
root.resource.Food.amount = 40;
root.resource.Mana.amount = 0;
root.tech.primitive = 1;
let allocationCurrent = true;
let allocationClicks = 0;
let cancelAllocationAfterClick = false;
let allocationControlGeneration = 12;
let allocationActionMode = "normal";
let allocationOwnerEnabled = true;
let allocationQueuesEmpty = true;
let allocationHasCompetingCommitment = false;
const allocationHandoffEvents = [];
const allocationCallbackEvents = [];
const allocationBootstrapState = {
  root,
  rootGeneration: undefined,
  authorizationId: "retained-bootstrap-after-handoff",
  baselineProgress: "",
  isCurrent: () => true,
  usedClicks: 10,
  handoffClicks: 9,
  handoffLimit: 10,
  phase: "handoff",
};
const allocationControls = {
  resolve(elementId) {
    return [
      "city-shed",
      "city-lumber",
      "undefined-stone",
      "undefined-food",
    ].includes(elementId)
      ? {
          elementId,
          generation: allocationControlGeneration,
          methods: ["action"],
        }
      : undefined;
  },
  invoke(handle, method) {
    assert.equal(method, "action");
    if (allocationActionMode === "fail")
      return { ok: false, reason: "action-failed", detail: "native rejected" };
    const resourceId =
      handle.elementId === "undefined-food"
        ? "Food"
        : handle.elementId === "city-lumber"
          ? "Lumber"
          : "Stone";
    if (allocationActionMode !== "no-stock-change")
      root.resource[resourceId].amount += 1;
    if (cancelAllocationAfterClick) allocationCurrent = false;
    return { ok: true, value: true };
  },
  capturedElementIds: () => [
    "city-shed",
    "city-lumber",
    "undefined-stone",
    "undefined-food",
  ],
};
const allocationAdapter = createCapturedGatherResourcesAdapter({
  rootState,
  controls: allocationControls,
  readSettings: () => settings,
  readTestIntervention: () => ({
    civilizationBootstrap: {
      authorized: true,
      authorizationId: "retained-bootstrap-after-handoff",
      state: allocationBootstrapState,
    },
    civilizationHandoffObserver: (event) => allocationHandoffEvents.push(event),
    constructionAllocation: { enabled: true },
    standardConstructionTarget: {
      actionId: "city-shed",
      allocationAuthorized: true,
      cost: { Money: 1, Lumber: 2, Stone: 2 },
      resourceClickBudget: 4,
      controlGeneration: 12,
      isCurrent: () =>
        allocationCurrent &&
        allocationOwnerEnabled &&
        allocationQueuesEmpty &&
        !allocationHasCompetingCommitment,
      onClick: (event) => {
        allocationClicks += 1;
        allocationCallbackEvents.push(event);
      },
    },
  }),
});
const genericAllocationInput = allocationAdapter.reader.read();
const genericAllocationPlan = planGatherResources(genericAllocationInput);
assert.deepEqual(
  genericAllocationPlan.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [
    { actionId: "lumber", amount: 2 },
    { actionId: "stone", amount: 2 },
  ],
  "a current non-bootstrap Construction request allocates only its material shortages",
);
assert.deepEqual(allocationAdapter.executor.execute(genericAllocationPlan), {
  status: "succeeded",
});
assert.equal(root.resource.Lumber.amount, 2);
assert.equal(root.resource.Stone.amount, 2);
assert.equal(
  allocationClicks,
  3,
  "remaining P19 handoff clicks are excluded from the dynamic allocation budget",
);
assert.equal(
  allocationBootstrapState.handoffClicks,
  10,
  "the final P19 handoff click consumes only its own retained budget",
);

root.resource.Food.amount = 0;
root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;
allocationBootstrapState.handoffClicks = 9;
allocationHandoffEvents.length = 0;
allocationCallbackEvents.length = 0;
const mixedEmergencyFoodInput = allocationAdapter.reader.read();
const mixedEmergencyFoodPlan = planGatherResources(mixedEmergencyFoodInput);
assert.equal(mixedEmergencyFoodPlan.operations[0]?.actionId, "food");
assert.deepEqual(
  mixedEmergencyFoodPlan.operations.map(({ actionId }) => actionId),
  ["food", "lumber", "stone"],
  "emergency Food precedes the target-material operations",
);
allocationAdapter.executor.execute(mixedEmergencyFoodPlan);
assert.equal(allocationBootstrapState.handoffClicks, 10);
assert.equal(
  allocationHandoffEvents[0]?.actionId,
  "lumber",
  "emergency Food must not consume the Construction handoff budget",
);
assert.equal(
  allocationCallbackEvents.some((event) => event.actionId === "food"),
  false,
  "emergency Food must not trigger the Construction allocation callback",
);
assert.equal(allocationCallbackEvents.length, 3);
assert.deepEqual(
  allocationCallbackEvents.map(({ actionId, resourceId }) => ({
    actionId,
    resourceId,
  })),
  [
    { actionId: "city-shed", resourceId: "Lumber" },
    { actionId: "city-shed", resourceId: "Stone" },
    { actionId: "city-shed", resourceId: "Stone" },
  ],
  "dynamic allocation reports only verified target-material stock increases",
);

root.resource.Food.amount = 0;
root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;
allocationBootstrapState.handoffClicks = 10;
allocationHandoffEvents.length = 0;
allocationCallbackEvents.length = 0;
allocationCurrent = true;
const staleAfterPlan = planGatherResources(allocationAdapter.reader.read());
allocationCurrent = false;
assert.equal(
  allocationAdapter.executor.execute(staleAfterPlan).status,
  "stale",
);
assert.ok(
  root.resource.Food.amount > 0,
  "valid emergency Food completes before a later stale Construction operation is rejected",
);
assert.equal(root.resource.Lumber.amount, 0);
assert.equal(root.resource.Stone.amount, 0);
assert.equal(allocationHandoffEvents.length, 0);
assert.equal(allocationCallbackEvents.length, 0);
allocationCurrent = true;
root.resource.Food.amount = 40;

root.resource.Lumber.amount = 2;
root.resource.Stone.amount = 0;
const partiallyAffordablePlan = planGatherResources(
  allocationAdapter.reader.read(),
);
assert.deepEqual(
  partiallyAffordablePlan.operations.map(({ actionId, amount }) => ({
    actionId,
    amount,
  })),
  [{ actionId: "stone", amount: 2 }],
  "a partially funded Construction request gathers only its remaining material shortage",
);
assert.deepEqual(allocationAdapter.executor.execute(partiallyAffordablePlan), {
  status: "succeeded",
});
root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;

root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;
allocationCurrent = true;
cancelAllocationAfterClick = true;
const changingAllocationPlan = planGatherResources(
  allocationAdapter.reader.read(),
);
assert.deepEqual(allocationAdapter.executor.execute(changingAllocationPlan), {
  status: "stale",
  failure: {
    code: "gather-construction-target-invalidated",
    message: "current Construction saving target changed during Gather",
  },
});
assert.equal(root.resource.Lumber.amount, 1);
assert.equal(root.resource.Stone.amount, 0);

root.resource.Lumber.amount = 0;
root.resource.Stone.amount = 0;
allocationCurrent = true;
cancelAllocationAfterClick = false;
const repricedAllocationPlan = planGatherResources(
  allocationAdapter.reader.read(),
);
allocationCurrent = false;
assert.equal(
  allocationAdapter.executor.execute(repricedAllocationPlan).status,
  "stale",
  "a changed native price or target invalidates the current allocation",
);
assert.equal(root.resource.Lumber.amount, 0);
assert.equal(root.resource.Stone.amount, 0);

allocationCurrent = true;
const reboundAllocationPlan = planGatherResources(
  allocationAdapter.reader.read(),
);
allocationControlGeneration = 13;
assert.equal(
  allocationAdapter.executor.execute(reboundAllocationPlan).status,
  "stale",
  "Gather control rebinding invalidates a captured allocation",
);
assert.equal(root.resource.Lumber.amount, 0);
assert.equal(root.resource.Stone.amount, 0);
allocationControlGeneration = 12;

for (const invalidation of [
  ["owner disabled", () => (allocationOwnerEnabled = false)],
  ["Construction queue populated", () => (allocationQueuesEmpty = false)],
  [
    "competing Construction commitment",
    () => (allocationHasCompetingCommitment = true),
  ],
]) {
  allocationCurrent = true;
  allocationOwnerEnabled = true;
  allocationQueuesEmpty = true;
  allocationHasCompetingCommitment = false;
  const invalidatedPlan = planGatherResources(allocationAdapter.reader.read());
  invalidation[1]();
  assert.equal(
    allocationAdapter.executor.execute(invalidatedPlan).status,
    "stale",
    `${invalidation[0]} invalidates the current owner-directed allocation`,
  );
  assert.equal(root.resource.Lumber.amount, 0);
  assert.equal(root.resource.Stone.amount, 0);
}
allocationOwnerEnabled = true;
allocationQueuesEmpty = true;
allocationHasCompetingCommitment = false;

root.resource.Lumber.max = 1;
root.resource.Stone.max = 1;
const insufficientCapacityPlan = planGatherResources(
  allocationAdapter.reader.read(),
);
assert.equal(
  insufficientCapacityPlan,
  null,
  "Gather does not target construction resources whose storage cannot hold the requested amount",
);
root.resource.Lumber.max = 20;
root.resource.Stone.max = 20;

root.tech.conjuring = 2;
root.resource.Mana.amount = 5;
const manaProtectedPlan = planGatherResources(allocationAdapter.reader.read());
assert.equal(
  manaProtectedPlan,
  null,
  "Construction-targeted gathering preserves Mana when Conjuring is active",
);
root.tech.conjuring = 0;
root.resource.Mana.amount = 0;

allocationActionMode = "fail";
const failedNativeActionPlan = planGatherResources(
  allocationAdapter.reader.read(),
);
assert.deepEqual(allocationAdapter.executor.execute(failedNativeActionPlan), {
  status: "rejected",
  failure: {
    code: "gather-click-failed",
    message: "native rejected",
  },
});
assert.equal(root.resource.Lumber.amount, 0);
allocationActionMode = "no-stock-change";
const noStockChangePlan = planGatherResources(allocationAdapter.reader.read());
assert.deepEqual(allocationAdapter.executor.execute(noStockChangePlan), {
  status: "stale",
  failure: {
    code: "gather-construction-stock-postcondition",
    message: "Construction-targeted lumber did not increase Lumber",
  },
});
allocationActionMode = "normal";

const rootReplacementPlan = planGatherResources(
  allocationAdapter.reader.read(),
);
root = { ...root, resource: { ...root.resource } };
assert.equal(
  allocationAdapter.executor.execute(rootReplacementPlan).status,
  "stale",
  "a native root replacement invalidates the captured allocation",
);
root.resource.Lumber.max = 200;
root.resource.Stone.max = 200;

root = { ...root, resource: { ...root.resource } };
root.resource.Food.amount = 100;
root.resource.Lumber.amount = 100;
root.resource.Lumber.max = 200;
root.resource.Stone.amount = 0;
root.resource.Stone.max = 200;
bootstrapAuthorization = {
  authorized: true,
  authorizationId: "human-start-revoked-mid-batch",
};
standardConstructionTarget = undefined;
revokeBootstrapAfterNextClick = true;
const revokedBootstrapInput = bootstrapAdapter.reader.read();
const revokedBootstrapDecision = planGatherResources(revokedBootstrapInput);
const clicksBeforeRevocation = bootstrapClicks;
assert.deepEqual(
  bootstrapAdapter.executor.execute(revokedBootstrapDecision),
  {
    status: "stale",
    failure: {
      code: "gather-bootstrap-stale",
      message: "explicit bootstrap authorization or native root changed",
    },
  },
  "bootstrap authorization is revalidated after each native click",
);
assert.equal(
  bootstrapClicks - clicksBeforeRevocation,
  1,
  "authorization revocation prevents the remaining batch clicks",
);

bootstrapAuthorization = {
  authorized: true,
  authorizationId: "human-start-root-generation",
};
bootstrapRootGeneration = 9;
const changedGenerationInput = bootstrapAdapter.reader.read();
const changedGenerationDecision = planGatherResources(changedGenerationInput);
const clicksBeforeGenerationChange = bootstrapClicks;
bootstrapRootGeneration = 10;
assert.equal(
  bootstrapAdapter.executor.execute(changedGenerationDecision).status,
  "stale",
  "bootstrap is suspended when the native root generation changes",
);
assert.equal(bootstrapClicks, clicksBeforeGenerationChange);

console.log("captured-gather-resources ok");
