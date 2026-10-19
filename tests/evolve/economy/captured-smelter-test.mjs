import assert from "node:assert/strict";

import {
  applyCapturedSmelterTestCandidate,
  compareCapturedSmelterSteelDemand,
  createCapturedSmelterAutomation,
  createCapturedSmelterIncumbentSnapshot,
  capturedSmelterSkipReason,
  isCapturedSmelterSnapshotCurrent,
  setCapturedSmelterObservationModeForTest,
} from "../../../src/adapters/evolve/economy/production/captured-smelter.ts";
import { planSmelter } from "../../../src/domain/economy/production/smelter.ts";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
assert.equal(capturedSmelterSkipReason(false, true), "permission-disabled");
assert.equal(
  capturedSmelterSkipReason(true, false),
  "construction-demand-unavailable",
);
assert.equal(capturedSmelterSkipReason(true, true), undefined);
const observationControl = {};
assert.equal(
  setCapturedSmelterObservationModeForTest(observationControl, "G"),
  true,
);
assert.equal(observationControl.smelterObservationMode, "G");
for (const mode of ["H", "S"]) {
  assert.equal(
    setCapturedSmelterObservationModeForTest(observationControl, mode),
    true,
  );
  assert.equal(observationControl.smelterObservationMode, mode);
}
assert.equal(
  setCapturedSmelterObservationModeForTest(observationControl, "C"),
  false,
);
assert.equal(setCapturedSmelterObservationModeForTest(undefined, "S"), false);

const root = {
  race: {},
  tech: { smelting: 2, titanium: 1 },
  resource: {
    Iron: { name: "Iron", amount: 50, max: 100, diff: 1, display: true },
    Steel: { name: "Steel", amount: 0, max: 3000, diff: 10, display: true },
    Titanium: {
      name: "Titanium",
      amount: 10,
      max: 100,
      diff: 1,
      display: true,
    },
    Coal: { name: "Coal", amount: 1000, max: 2000, diff: 100, display: true },
    Lumber: {
      name: "Lumber",
      amount: 1000,
      max: 2000,
      diff: 100,
      display: true,
    },
    Oil: { name: "Oil", amount: 0, max: 0, diff: 0, display: false },
    Super_Fuel: {
      name: "Super Fuel",
      amount: 0,
      max: 100,
      diff: 0,
      display: false,
    },
  },
  city: {
    smelter: {
      count: 2,
      cap: 2,
      Star: 0,
      Iron: 2,
      Steel: 0,
      Iridium: 0,
      Coal: 2,
      Oil: 0,
      Wood: 0,
      Inferno: 0,
      Super: 0,
    },
  },
  civic: { miner: { workers: 1 } },
  space: { iron_ship: { on: 0 } },
};

const calls = [];
const controls = {
  resolve: (elementId) =>
    elementId === "iSmelter"
      ? {
          elementId,
          generation: 1,
          methods: ["addFuel", "subFuel", "addMetal", "subMetal"],
        }
      : undefined,
  invoke: (_handle, method, args = []) => {
    calls.push([method, ...args]);
    const id = args[0];
    if (method === "addMetal") {
      const metal =
        root.city.smelter.Iron +
        root.city.smelter.Steel +
        root.city.smelter.Iridium;
      const fuel =
        root.city.smelter.Coal +
        root.city.smelter.Wood +
        root.city.smelter.Oil +
        root.city.smelter.Inferno +
        root.city.smelter.Super;
      if (metal < fuel) root.city.smelter[id] += 1;
      else {
        root.city.smelter.Iron -= 1;
        root.city.smelter[id] += 1;
      }
    } else if (method === "subMetal") {
      root.city.smelter[id] -= 1;
    } else if (method === "addFuel") {
      root.city.smelter[id] += 1;
    } else {
      root.city.smelter[id] -= 1;
    }
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => ["iSmelter"],
};

const automation = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ productionSmelting: "steel" }),
  readDemand: () => ({
    requestedQuantity: () => 0,
    isDemanded: () => false,
    storageRequired: () => 1,
  }),
});

const outcome = automation.run();
assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
assert.deepEqual(calls, [
  ["subMetal", "Iron"],
  ["addMetal", "Steel"],
]);
assert.equal(root.city.smelter.Iron, 1);
assert.equal(root.city.smelter.Steel, 1);

root.city.smelter.Iron = 2;
root.city.smelter.Steel = 0;
calls.length = 0;
let preparedInput;
let incumbentSnapshot;
let observedOutcome;
let observedPostcondition;
let capturedAtPlanFacts;
let progressionGeneration = 7;
const capturedDemand = {
  savingTarget: {
    name: "city-coal_power",
    pool: "city",
    cost: { Steel: 1000 },
  },
  requestedQuantity: (id) => (id === "Steel" ? 1000 : 0),
  isDemanded: (id) => id === "Steel",
  storageRequired: () => 1,
};
const testSurfaceAutomation = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ autoSmelter: true, productionSmelting: "required" }),
  readDemand: () => capturedDemand,
  readProgressionGeneration: () => progressionGeneration,
  prepareInputForTest: (input) =>
    Object.freeze({ ...input, steelDemanded: true }),
  observePlanForDiagnostics: (input, decision, demand, observation) => {
    preparedInput = input;
    incumbentSnapshot = createCapturedSmelterIncumbentSnapshot(
      input,
      decision,
      demand,
      observation,
    );
    capturedAtPlanFacts = {
      root: observation.root,
      progressionGeneration: observation.progressionGeneration,
      permissionEnabled: observation.permissionEnabled,
      requestedSteel: demand.requestedSteel,
      steelDemanded: demand.isSteelDemanded,
      savingTargetName: demand.savingTarget?.name,
      savingTargetPool: demand.savingTarget?.pool,
      steelTarget: demand.savingTarget?.cost.Steel,
      controlGeneration: observation.controlGeneration,
      controlMethods: observation.controlMethods,
      allocations: observation.expectedAllocations,
      capacity: input.totalSmelters,
      inputSignature: JSON.stringify(input),
      steelResource: observation.steelResource,
      demandAuthorityAvailable: observation.demandAuthorityAvailable,
    };
  },
  observeOutcomeForTest: (outcome, _observation, postcondition) => {
    observedOutcome = outcome;
    observedPostcondition = postcondition;
  },
});
assert.equal(testSurfaceAutomation.run().status, "succeeded");
assert.equal(observedOutcome.status, "succeeded");
assert.equal(observedPostcondition.status, "verified");
assert.deepEqual(observedPostcondition.allocations, { Iron: 1, Steel: 1 });
assert.equal(preparedInput?.steelDemanded, true);
assert.ok(
  calls.some(([method, id]) => method === "addMetal" && id === "Steel"),
  "the test preparation hook changes input before the native planner and owner execute",
);
assert.equal(incumbentSnapshot.boundary, "after-plan-before-native-execution");
assert.equal(incumbentSnapshot.demand.savingTargetName, "city-coal_power");
assert.equal(incumbentSnapshot.demand.steelTarget, 1000);
assert.deepEqual(incumbentSnapshot.commands, [
  "subMetal:Iron",
  "addMetal:Steel",
]);
assert.ok(Object.isFrozen(incumbentSnapshot));
const smallDemand = compareCapturedSmelterSteelDemand(incumbentSnapshot, {
  resourceId: "Steel",
  pool: "city",
  additionalSteel: 10,
});
const largeDemand = compareCapturedSmelterSteelDemand(incumbentSnapshot, {
  resourceId: "Steel",
  pool: "city",
  additionalSteel: 1000,
});
assert.equal(smallDemand.requestValid, true);
assert.equal(smallDemand.quantityRepresented, true);
assert.equal(smallDemand.proposedInput.steelTimeToRequired, 101);
assert.equal(largeDemand.proposedInput.steelTimeToRequired, 200);
assert.equal(smallDemand.proposedInput.steelDemanded, true);
assert.equal(largeDemand.proposedInput.steelDemanded, true);
assert.equal(smallDemand.commandsChanged, false);
assert.equal(largeDemand.commandsChanged, false);
assert.equal(
  smallDemand.classification,
  "quantity-represented-but-native-policy-insensitive",
);
assert.equal(smallDemand.incumbentAllocation.Iron, 1);
assert.equal(smallDemand.proposedAllocation.Steel, 1);
assert.equal(smallDemand.redundant, undefined);
assert.equal(smallDemand.quantityDeliverable, undefined);
assert.equal(smallDemand.incrementalProductionKnown, false);
assert.equal(smallDemand.economicBenefitKnown, false);
assert.equal(smallDemand.policyPermitted, true);
assert.equal(smallDemand.nativeAllocationFeasible, true);
const noSteelIncumbentInput = Object.freeze({
  ...incumbentSnapshot.input,
  steelDemanded: false,
  steelTimeToRequired: 0,
  titaniumStorageRatio: 1,
});
const noSteelIncumbent = createCapturedSmelterIncumbentSnapshot(
  noSteelIncumbentInput,
  planSmelter(noSteelIncumbentInput),
  { ...incumbentSnapshot.demand, isSteelDemanded: false },
  {
    root,
    permissionEnabled: true,
    controlGeneration: incumbentSnapshot.controlGeneration,
    controlMethods: incumbentSnapshot.controlMethods,
    plannedCommands: [],
    progressionGeneration: incumbentSnapshot.progressionGeneration,
    steelResource: incumbentSnapshot.steelResource,
    demandAuthorityAvailable: incumbentSnapshot.demandAuthorityAvailable,
  },
);
const changedHypothetical = compareCapturedSmelterSteelDemand(
  noSteelIncumbent,
  { resourceId: "Steel", pool: "city", additionalSteel: 100 },
);
assert.equal(changedHypothetical.requestValid, true);
assert.equal(changedHypothetical.quantityRepresented, true);
assert.equal(changedHypothetical.proposedInput.steelTimeToRequired, 110);
assert.ok(changedHypothetical.commandsChanged);
assert.equal(changedHypothetical.proposedAllocation.Steel, 1);
assert.equal(changedHypothetical.displacedAllocation.Iron, 1);
const ironConflictInput = Object.freeze({
  ...noSteelIncumbentInput,
  ironDemanded: true,
});
const ironConflict = createCapturedSmelterIncumbentSnapshot(
  ironConflictInput,
  planSmelter(ironConflictInput),
  { ...incumbentSnapshot.demand, isSteelDemanded: false },
  {
    root,
    permissionEnabled: true,
    controlGeneration: incumbentSnapshot.controlGeneration,
    controlMethods: incumbentSnapshot.controlMethods,
    plannedCommands: [],
    progressionGeneration: incumbentSnapshot.progressionGeneration,
    steelResource: incumbentSnapshot.steelResource,
    demandAuthorityAvailable: incumbentSnapshot.demandAuthorityAvailable,
  },
);
const conflictingHypothetical = compareCapturedSmelterSteelDemand(
  ironConflict,
  { resourceId: "Steel", pool: "city", additionalSteel: 100 },
);
assert.equal(conflictingHypothetical.quantityRepresented, true);
assert.equal(conflictingHypothetical.proposedAllocation.Steel, 0);
assert.equal(conflictingHypothetical.nativeAllocationFeasible, true);
const noHypotheticalRequest = compareCapturedSmelterSteelDemand(
  incumbentSnapshot,
  { resourceId: "Steel", pool: "city", additionalSteel: 0 },
);
assert.equal(noHypotheticalRequest.requestValid, false);
assert.equal(noHypotheticalRequest.proposedInput, undefined);
assert.equal(noHypotheticalRequest.proposedAllocation, undefined);
assert.equal(noHypotheticalRequest.policyPermitted, undefined);
assert.equal(noHypotheticalRequest.redundant, undefined);
const disabledHypothetical = compareCapturedSmelterSteelDemand(
  Object.freeze({ ...incumbentSnapshot, permissionEnabled: false }),
  { resourceId: "Steel", pool: "city", additionalSteel: 100 },
);
assert.equal(disabledHypothetical.policyPermitted, false);
assert.equal(disabledHypothetical.quantityRepresented, true);
assert.equal(disabledHypothetical.proposedAllocation, undefined);
assert.equal(disabledHypothetical.quantitativeComparison, "unavailable");
for (const additionalSteel of [
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  "100",
]) {
  const refused = compareCapturedSmelterSteelDemand(incumbentSnapshot, {
    resourceId: "Steel",
    pool: "city",
    additionalSteel,
  });
  assert.equal(refused.requestValid, false);
  assert.equal(refused.quantityRepresented, false);
  assert.equal(refused.proposedInput, undefined);
  assert.equal(refused.proposedAllocation, undefined);
  assert.equal(refused.policyPermitted, undefined);
}
for (const unsupportedIdentity of [
  { resourceId: "Iron", pool: "city", additionalSteel: 10 },
  { resourceId: "Steel", pool: "orbital", additionalSteel: 10 },
]) {
  const refused = compareCapturedSmelterSteelDemand(
    incumbentSnapshot,
    unsupportedIdentity,
  );
  assert.equal(refused.requestValid, false);
  assert.equal(refused.proposedInput, undefined);
}
const overflowDemand = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    demand: Object.freeze({
      ...incumbentSnapshot.demand,
      requestedSteel: Number.MAX_VALUE,
    }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: Number.MAX_VALUE },
);
assert.equal(overflowDemand.requestValid, false);
assert.ok(
  overflowDemand.requestUnavailableReasons.includes(
    "combined-demand-quantity-overflow",
  ),
);
const invalidIncumbentDemand = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    demand: Object.freeze({ ...incumbentSnapshot.demand, requestedSteel: NaN }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(invalidIncumbentDemand.requestValid, true);
assert.equal(invalidIncumbentDemand.quantityRepresented, false);
assert.equal(invalidIncumbentDemand.policyPermitted, undefined);
const unsupportedIncumbentPool = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    demand: Object.freeze({
      ...incumbentSnapshot.demand,
      savingTargetPool: "orbital",
    }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(unsupportedIncumbentPool.requestValid, true);
assert.equal(unsupportedIncumbentPool.quantityRepresented, false);
const noSteelQuantityAuthority = compareCapturedSmelterSteelDemand(
  Object.freeze({ ...incumbentSnapshot, steelResource: undefined }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(noSteelQuantityAuthority.requestValid, true);
assert.equal(noSteelQuantityAuthority.quantityRepresented, false);
const missingDemandAuthority = compareCapturedSmelterSteelDemand(
  Object.freeze({ ...incumbentSnapshot, demandAuthorityAvailable: false }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(missingDemandAuthority.requestValid, true);
assert.equal(missingDemandAuthority.quantityRepresented, false);
assert.equal(missingDemandAuthority.policyPermitted, undefined);
const roundedAwayDemand = compareCapturedSmelterSteelDemand(incumbentSnapshot, {
  resourceId: "Steel",
  pool: "city",
  additionalSteel: Number.MIN_VALUE,
});
assert.equal(roundedAwayDemand.requestValid, true);
assert.equal(roundedAwayDemand.quantityRepresented, false);
assert.ok(
  roundedAwayDemand.unavailableReasons.includes(
    "additional-quantity-below-representable-resolution",
  ),
);
const partiallyRoundedDemand = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    demand: Object.freeze({ ...incumbentSnapshot.demand, requestedSteel: 1 }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 1.2e-16 },
);
assert.equal(partiallyRoundedDemand.requestValid, true);
assert.equal(partiallyRoundedDemand.quantityRepresented, false);
assert.ok(
  partiallyRoundedDemand.unavailableReasons.includes(
    "additional-quantity-below-representable-resolution",
  ),
);
const timeUnderflowDemand = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    demand: Object.freeze({ ...incumbentSnapshot.demand, requestedSteel: 0 }),
    steelResource: Object.freeze({ amount: 0, maximum: 100, rate: 10 }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: Number.MIN_VALUE },
);
assert.equal(timeUnderflowDemand.requestValid, true);
assert.equal(timeUnderflowDemand.quantityRepresented, false);
assert.ok(
  timeUnderflowDemand.unavailableReasons.includes(
    "additional-quantity-underflow-in-required-time",
  ),
);
const currentStockCovers = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    steelResource: Object.freeze({
      ...incumbentSnapshot.steelResource,
      amount: 1500,
    }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 100 },
);
assert.equal(currentStockCovers.quantityRepresented, true);
assert.equal(currentStockCovers.redundant, true);
assert.equal(currentStockCovers.proposedInput.steelTimeToRequired, 0);
const slowSteelRate = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    steelResource: Object.freeze({
      ...incumbentSnapshot.steelResource,
      rate: 0.1,
    }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(slowSteelRate.proposedInput.steelTimeToRequired, 10100);
const zeroSteelRate = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    steelResource: Object.freeze({
      ...incumbentSnapshot.steelResource,
      rate: 0,
    }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(
  zeroSteelRate.proposedInput.steelTimeToRequired,
  Number.MAX_SAFE_INTEGER,
);
const decliningSteelRate = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    steelResource: Object.freeze({
      ...incumbentSnapshot.steelResource,
      rate: -1,
    }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(
  decliningSteelRate.proposedInput.steelTimeToRequired,
  Number.MAX_SAFE_INTEGER,
);
const storageNearCap = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    steelResource: Object.freeze({ amount: 2970, maximum: 3000, rate: 10 }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(
  storageNearCap.proposedInput.steelTimeToRequired,
  Number.MIN_SAFE_INTEGER,
);
const targetAboveStorageCapacity = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    steelResource: Object.freeze({ amount: 0, maximum: 100, rate: 10 }),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(targetAboveStorageCapacity.quantityRepresented, true);
assert.equal(targetAboveStorageCapacity.quantityDeliverable, undefined);
assert.equal(targetAboveStorageCapacity.proposedInput.steelTimeToRequired, 101);
const noCapacityInput = Object.freeze({
  ...noSteelIncumbentInput,
  totalSmelters: 0,
  ironCount: 0,
  steelCount: 0,
  fuels: Object.freeze(
    noSteelIncumbentInput.fuels.map((fuel) =>
      Object.freeze({ ...fuel, currentFuelCount: 0 }),
    ),
  ),
});
const noCapacitySnapshot = createCapturedSmelterIncumbentSnapshot(
  noCapacityInput,
  planSmelter(noCapacityInput),
  { ...incumbentSnapshot.demand, requestedSteel: 0, isSteelDemanded: false },
  {
    root,
    permissionEnabled: true,
    controlGeneration: incumbentSnapshot.controlGeneration,
    controlMethods: incumbentSnapshot.controlMethods,
    plannedCommands: [],
    progressionGeneration: incumbentSnapshot.progressionGeneration,
    steelResource: incumbentSnapshot.steelResource,
    demandAuthorityAvailable: incumbentSnapshot.demandAuthorityAvailable,
  },
);
const noCapacityDemand = compareCapturedSmelterSteelDemand(noCapacitySnapshot, {
  resourceId: "Steel",
  pool: "city",
  additionalSteel: 10,
});
assert.equal(noCapacityDemand.quantityRepresented, true);
assert.equal(noCapacityDemand.proposedAllocation.Steel, 0);
assert.equal(noCapacityDemand.nativeAllocationFeasible, true);
const fuelLimitedInput = Object.freeze({
  ...noSteelIncumbentInput,
  fuels: Object.freeze(
    noSteelIncumbentInput.fuels.map((fuel) =>
      fuel.id === "Coal"
        ? Object.freeze({
            ...fuel,
            cost: Object.freeze(
              fuel.cost.map((cost) =>
                Object.freeze({
                  ...cost,
                  currentQuantity: 0,
                  rateOfChange: 0,
                }),
              ),
            ),
          })
        : fuel,
    ),
  ),
});
const fuelLimitedSnapshot = createCapturedSmelterIncumbentSnapshot(
  fuelLimitedInput,
  planSmelter(fuelLimitedInput),
  { ...incumbentSnapshot.demand, isSteelDemanded: false },
  {
    root,
    permissionEnabled: true,
    controlGeneration: incumbentSnapshot.controlGeneration,
    controlMethods: incumbentSnapshot.controlMethods,
    plannedCommands: [],
    progressionGeneration: incumbentSnapshot.progressionGeneration,
    steelResource: incumbentSnapshot.steelResource,
    demandAuthorityAvailable: incumbentSnapshot.demandAuthorityAvailable,
  },
);
const fuelLimitedDemand = compareCapturedSmelterSteelDemand(
  fuelLimitedSnapshot,
  { resourceId: "Steel", pool: "city", additionalSteel: 100 },
);
assert.equal(fuelLimitedDemand.quantityRepresented, true);
assert.ok(
  fuelLimitedDemand.proposedAllocation.Coal <
    fuelLimitedSnapshot.input.fuels.find((fuel) => fuel.id === "Coal")
      .currentFuelCount,
);
const noNativeControl = compareCapturedSmelterSteelDemand(
  Object.freeze({
    ...incumbentSnapshot,
    controlGeneration: undefined,
    controlMethods: Object.freeze([]),
  }),
  { resourceId: "Steel", pool: "city", additionalSteel: 10 },
);
assert.equal(noNativeControl.requestValid, true);
assert.equal(noNativeControl.nativeAllocationFeasible, false);
assert.ok(
  noNativeControl.unavailableReasons.includes(
    "native-control-or-allocation-feasibility-unavailable",
  ),
);
const currentSmelterFacts = capturedAtPlanFacts;
assert.equal(
  isCapturedSmelterSnapshotCurrent(incumbentSnapshot, currentSmelterFacts),
  true,
);
for (const mutation of [
  { root: {} },
  { progressionGeneration: 8 },
  { permissionEnabled: false },
  { controlGeneration: 2 },
  { controlMethods: ["subMetal"] },
  { requestedSteel: 999 },
  { steelDemanded: false },
  { savingTargetName: "other-target" },
  { savingTargetPool: "orbital" },
  { steelTarget: 999 },
  { allocations: { ...currentSmelterFacts.allocations, Iron: 1 } },
  { capacity: 3 },
  { inputSignature: "changed-input-configuration" },
  { demandAuthorityAvailable: false },
  {
    steelResource: {
      ...currentSmelterFacts.steelResource,
      rate: currentSmelterFacts.steelResource.rate + 1,
    },
  },
]) {
  assert.equal(
    isCapturedSmelterSnapshotCurrent(incumbentSnapshot, {
      ...currentSmelterFacts,
      ...mutation,
    }),
    false,
    `snapshot invalidated by ${Object.keys(mutation)[0]}`,
  );
}
assert.equal(
  isCapturedSmelterSnapshotCurrent(incumbentSnapshot, {
    ...currentSmelterFacts,
    allocations: { ...currentSmelterFacts.allocations, Iron: 1, Steel: 1 },
  }),
  false,
  "the pre-command snapshot is stale after native execution changes allocations",
);
assert.ok(
  incumbentSnapshot.unavailableAuthority.includes(
    "cross-owner-commitment-coverage",
  ),
);
assert.ok(
  incumbentSnapshot.unavailableAuthority.includes(
    "measured-production-marginals",
  ),
);

function runWithPlanBoundary({ mutate, currentHandle, invoke }) {
  const localRoot = structuredClone(root);
  localRoot.city.smelter.Iron = 2;
  localRoot.city.smelter.Steel = 0;
  let rootNow = localRoot;
  let handle = currentHandle ?? {
    elementId: "iSmelter",
    generation: 20,
    methods: ["addFuel", "subFuel", "addMetal", "subMetal"],
  };
  let result;
  let postcondition;
  const automation = createCapturedSmelterAutomation({
    rootState: { readRoot: () => rootNow },
    controls: {
      ...controls,
      resolve: () => handle,
      invoke: (_handle, method, args) => invoke(localRoot, method, args),
    },
    readSettings: () => ({ autoSmelter: true, productionSmelting: "steel" }),
    readDemand: () => ({
      requestedQuantity: () => 0,
      isDemanded: () => false,
      storageRequired: () => 1,
    }),
    observePlanForDiagnostics: () => {
      mutate?.({
        setRoot: (value) => {
          rootNow = value;
        },
        setHandle: (value) => {
          handle = value;
        },
      });
    },
    observeOutcomeForTest: (outcome, _observation, actual) => {
      result = outcome;
      postcondition = actual;
    },
  });
  const returned = automation.run();
  assert.equal(result, returned);
  return { root: localRoot, outcome: returned, postcondition };
}

const rootReplacement = runWithPlanBoundary({
  mutate: ({ setRoot }) => setRoot(structuredClone(root)),
  invoke: () => assert.fail("root replacement must prevent native calls"),
});
assert.equal(rootReplacement.outcome.status, "stale");
const controlReplacement = runWithPlanBoundary({
  mutate: ({ setHandle }) =>
    setHandle({
      elementId: "iSmelter",
      generation: 21,
      methods: ["addMetal", "subMetal"],
    }),
  invoke: () => assert.fail("control replacement must prevent native calls"),
});
assert.equal(
  controlReplacement.outcome.failure.code,
  "captured-smelter-control-replaced",
);
const missingMethod = runWithPlanBoundary({
  currentHandle: {
    elementId: "iSmelter",
    generation: 22,
    methods: ["subMetal"],
  },
  invoke: () => assert.fail("missing native method must prevent calls"),
});
assert.equal(missingMethod.outcome.status, "rejected");
const partialExecution = runWithPlanBoundary({
  invoke: (localRoot, method, [id]) => {
    if (method === "subMetal") {
      localRoot.city.smelter[id] -= 1;
      return { ok: true, value: undefined };
    }
    return { ok: false, reason: "threw", detail: "test rejection" };
  },
});
assert.equal(partialExecution.outcome.status, "rejected");
assert.equal(partialExecution.root.city.smelter.Iron, 1);
assert.equal(partialExecution.root.city.smelter.Steel, 0);
assert.equal(partialExecution.postcondition.status, "failed");
assert.deepEqual(partialExecution.postcondition.allocations, {
  Iron: 1,
  Steel: 0,
});

function observeOwnerCycle(withObserver) {
  const localRoot = structuredClone(root);
  localRoot.city.smelter.Iron = 2;
  localRoot.city.smelter.Steel = 0;
  const counts = {
    rootReads: 0,
    demandReads: 0,
    controlResolves: 0,
    nativeCalls: 0,
    progressionReads: 0,
    observedPlans: 0,
  };
  const dependencies = {
    rootState: {
      readRoot: () => {
        counts.rootReads += 1;
        return localRoot;
      },
    },
    controls: {
      ...controls,
      resolve: () => {
        counts.controlResolves += 1;
        return {
          elementId: "iSmelter",
          generation: 30,
          methods: ["addFuel", "subFuel", "addMetal", "subMetal"],
        };
      },
      invoke: (_handle, method, [id]) => {
        counts.nativeCalls += 1;
        localRoot.city.smelter[id] += method === "addMetal" ? 1 : -1;
        return { ok: true, value: undefined };
      },
    },
    readSettings: () => ({ autoSmelter: true, productionSmelting: "steel" }),
    readDemand: () => {
      counts.demandReads += 1;
      return capturedDemand;
    },
  };
  if (withObserver) {
    dependencies.readProgressionGeneration = () => {
      counts.progressionReads += 1;
      return 7;
    };
    dependencies.observePlanForDiagnostics = () => {
      counts.observedPlans += 1;
    };
    dependencies.observeOutcomeForTest = () => {};
  }
  createCapturedSmelterAutomation(dependencies).run();
  return counts;
}
const ordinaryCounts = observeOwnerCycle(false);
const observedCounts = observeOwnerCycle(true);
assert.equal(observedCounts.rootReads, ordinaryCounts.rootReads);
assert.equal(observedCounts.demandReads, ordinaryCounts.demandReads);
assert.equal(observedCounts.controlResolves, ordinaryCounts.controlResolves);
assert.equal(observedCounts.nativeCalls, ordinaryCounts.nativeCalls);
assert.equal(observedCounts.progressionReads, 1);
assert.equal(observedCounts.observedPlans, 1);

const candidateBaseInput = Object.freeze({
  ...preparedInput,
  ironDemanded: false,
  steelDemanded: false,
});
const applyTestCandidate = (
  resourceId,
  amount = root.resource[resourceId].amount,
) =>
  applyCapturedSmelterTestCandidate(
    candidateBaseInput,
    {
      apply: true,
      actionId: "tech-selected-native-offer",
      resourceId,
      stock: { resourceId, amount, rootGeneration: 3 },
    },
    root,
    root,
    3,
    3,
  );
const ironSelectedInput = applyTestCandidate("Iron");
assert.equal(ironSelectedInput.ironDemanded, true);
assert.equal(ironSelectedInput.steelDemanded, false);
const steelSelectedInput = applyTestCandidate("Steel");
assert.equal(steelSelectedInput.ironDemanded, false);
assert.equal(steelSelectedInput.steelDemanded, true);
for (const refusal of [
  applyCapturedSmelterTestCandidate(
    candidateBaseInput,
    { apply: true, actionId: "", resourceId: "Iron", stock: {} },
    root,
    root,
    3,
    3,
  ),
  applyTestCandidate("Iron", -1),
  applyCapturedSmelterTestCandidate(
    candidateBaseInput,
    {
      apply: true,
      actionId: "tech-selected-native-offer",
      resourceId: "Iron",
      stock: { resourceId: "Steel", amount: 50, rootGeneration: 3 },
    },
    root,
    root,
    3,
    3,
  ),
  applyCapturedSmelterTestCandidate(
    candidateBaseInput,
    {
      apply: true,
      actionId: "tech-selected-native-offer",
      resourceId: "Iron",
      stock: { resourceId: "Iron", amount: 50, rootGeneration: 3 },
    },
    root,
    {},
    3,
    3,
  ),
  applyCapturedSmelterTestCandidate(
    candidateBaseInput,
    {
      apply: true,
      actionId: "tech-selected-native-offer",
      resourceId: "Gold",
      stock: { resourceId: "Gold", amount: 1, rootGeneration: 3 },
    },
    root,
    root,
    3,
    3,
  ),
])
  assert.equal(
    refusal,
    candidateBaseInput,
    "invalid candidate or stale stock is refused",
  );

const unavailable = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls: { ...controls, resolve: () => undefined },
  readSettings: () => ({}),
});
assert.equal(unavailable.run().status, "succeeded");

root.tech.super_fuel = 2;
root.resource.Super_Fuel.display = true;
root.resource.Super_Fuel.amount = 100;
root.resource.Super_Fuel.diff = 10;
root.city.smelter.cap = 4;
root.city.smelter.Iron = 4;
root.city.smelter.Steel = 0;
root.city.smelter.Super = 0;
root.city.smelter.Coal = 0;
root.city.smelter.Wood = 0;
root.city.smelter.Oil = 0;
root.city.smelter.Inferno = 0;
calls.length = 0;

const superFuelAutomation = createCapturedSmelterAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    productionSmelting: "steel",
    smelter_fuel_p_Super: 0,
  }),
});
assert.equal(superFuelAutomation.run().status, "succeeded");
assert.equal(root.city.smelter.Super, 4);
assert.equal(root.city.smelter.cap, 4);
assert.deepEqual(
  calls.filter(([method]) => method === "addFuel"),
  [
    ["addFuel", "Super"],
    ["addFuel", "Super"],
    ["addFuel", "Super"],
    ["addFuel", "Super"],
  ],
);

root.resource.Super_Fuel = undefined;
calls.length = 0;
assert.equal(
  createCapturedSmelterAutomation({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ smelter_fuel_p_Super: 0 }),
  }).run().status,
  "succeeded",
);
assert.deepEqual(calls, []);

const modeRuns = [];
for (const mode of ["G", "H", "S"]) {
  const modeHooks = {};
  assert.equal(setCapturedSmelterObservationModeForTest(modeHooks, mode), true);
  let observerCalls = 0;
  const modeRoot = structuredClone(root);
  const modeCalls = [];
  const modeAutomation = createCapturedSmelterAutomation({
    rootState: { readRoot: () => modeRoot },
    controls: {
      ...controls,
      resolve: () => ({
        elementId: "iSmelter",
        generation: 1,
        methods: ["addFuel", "subFuel", "addMetal", "subMetal"],
      }),
      invoke: (_handle, method, args = []) => {
        modeCalls.push([method, ...args]);
        return { ok: true, value: undefined };
      },
    },
    readSettings: () => ({ autoSmelter: true }),
    readDemand: () => ({
      requestedQuantity: () => 0,
      isDemanded: () => false,
      storageRequired: () => 1,
    }),
    shouldObservePlanForDiagnostics: () =>
      modeHooks.smelterObservationMode !== "G",
    observePlanForDiagnostics: () => observerCalls++,
  });
  modeAutomation.run();
  modeRuns.push({ mode, observerCalls, nativeCalls: modeCalls });
}
assert.deepEqual(
  modeRuns.map(({ observerCalls }) => observerCalls),
  [0, 1, 1],
);
assert.deepEqual(modeRuns[1].nativeCalls, modeRuns[0].nativeCalls);
assert.deepEqual(modeRuns[2].nativeCalls, modeRuns[0].nativeCalls);

const noSignalCounts = {
  demandReads: 0,
  controlResolves: 0,
  progressionReads: 0,
  observerCalls: 0,
  nativeCalls: 0,
};
let noSignalInput;
let noSignalDecision;
let noSignalObservation;
let noSignalOutcome;
const noSignalAutomation = createCapturedSmelterAutomation({
  rootState: { readRoot: () => ({ city: { smelter: {} } }) },
  controls: {
    resolve: () => {
      noSignalCounts.controlResolves++;
      return undefined;
    },
    invoke: () => {
      noSignalCounts.nativeCalls++;
      assert.fail("an uninitialized owner cannot invoke a native command");
    },
  },
  readSettings: () => ({ autoSmelter: true }),
  readDemand: () => {
    noSignalCounts.demandReads++;
    return {
      savingTarget: null,
      requestedQuantity: () => 0,
      isDemanded: () => false,
      storageRequired: () => 1,
    };
  },
  shouldObservePlanForDiagnostics: () => true,
  readProgressionGeneration: () => {
    noSignalCounts.progressionReads++;
    return 1;
  },
  observePlanForDiagnostics: (input, decision, _demand, observation) => {
    noSignalCounts.observerCalls++;
    noSignalInput = input;
    noSignalDecision = decision;
    noSignalObservation = observation;
  },
  observeOutcomeForTest: (outcome) => {
    noSignalOutcome = outcome;
  },
});
assert.equal(noSignalAutomation.run().status, "succeeded");
assert.equal(noSignalInput.initialised, false);
assert.deepEqual(noSignalDecision.fuelAdjustments, []);
assert.deepEqual(noSignalDecision.smeltAdjustments, []);
assert.deepEqual(noSignalObservation.plannedCommands, []);
assert.equal(noSignalObservation.controlGeneration, undefined);
assert.deepEqual(noSignalCounts, {
  demandReads: 1,
  controlResolves: 1,
  progressionReads: 1,
  observerCalls: 1,
  nativeCalls: 0,
});
assert.equal(noSignalOutcome.status, "succeeded");

let unavailableAuthorityObservation;
let unavailableAuthorityNativeCalls = 0;
const unavailableAuthorityOutcome = createCapturedSmelterAutomation({
  rootState: { readRoot: () => ({ city: { smelter: {} } }) },
  controls: {
    resolve: () => undefined,
    invoke: () => {
      unavailableAuthorityNativeCalls++;
      assert.fail(
        "missing demand and native control cannot execute allocation",
      );
    },
  },
  readSettings: () => ({ autoSmelter: false }),
  shouldObservePlanForDiagnostics: () => true,
  observePlanForDiagnostics: (_input, _decision, _demand, observation) => {
    unavailableAuthorityObservation = observation;
  },
}).run();
assert.equal(unavailableAuthorityOutcome.status, "succeeded");
assert.equal(unavailableAuthorityObservation.demandAuthorityAvailable, false);
assert.equal(unavailableAuthorityObservation.permissionEnabled, false);
assert.equal(unavailableAuthorityObservation.controlGeneration, undefined);
assert.equal(unavailableAuthorityNativeCalls, 0);

console.log("captured-smelter ok");
