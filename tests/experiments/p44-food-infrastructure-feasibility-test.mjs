import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  analyzeP44FoodScenarios,
  evaluateP44CapacityAwareStoneObjective,
  P44_PINNED_GAME,
} from "../../experiments/p44-food-infrastructure-feasibility.mjs";

const timeline = JSON.parse(
  readFileSync(
    new URL(
      "../../experiments/p43-food-safe-jobs-timeline.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const result = analyzeP44FoodScenarios(timeline);

function sample(period) {
  const state = result.selectedPeriods.find((entry) => entry.period === period);
  assert.equal(state?.status, "available");
  return state;
}

function scenario(period, farms, farmers) {
  const row = sample(period).scenarios.find(
    (candidate) => candidate.farms === farms && candidate.farmers === farmers,
  );
  assert.ok(row);
  return row;
}

assert.equal(result.pinnedGame, P44_PINNED_GAME);
assert.equal(result.source.normalizedObservationCount, 1161);
assert.ok(result.source.normalizedInputBytes > 0);
assert.ok(result.performance.analysisMs >= 0);
assert.equal(
  result.performance.clock,
  "process.hrtime.bigint (native monotonic)",
);

const p728 = sample(728);
assert.equal(p728.observed.population, 4);
assert.equal(p728.observed.housingCapacity, 4);
assert.equal(p728.observed.garrisonWorkers, 0);
assert.equal(p728.observed.foodConsumption, 4);
assert.ok(Math.abs(scenario(728, 1, 3).foodNet - 0.33) < 1e-10);

const p2000 = sample(2000);
assert.equal(p2000.observed.weatherPercent, 10.000000000000009);
assert.notEqual(
  p2000.observed.foodFormulaModifier,
  p728.observed.foodFormulaModifier,
);
assert.equal(scenario(2000, 1, 3).foodNet, 0.7699999999999996);

const central = scenario(4000, 3, 3);
assert.equal(sample(4000).observed.population, 4);
assert.equal(sample(4000).observed.garrisonWorkers, 4);
assert.equal(sample(4000).observed.foodConsumerRows.Human, -8);
assert.equal(central.farmerBaseOutput, 5.909999999999999);
assert.ok(Math.abs(central.foodProduction - 8.388165229596952) < 1e-10);
assert.ok(Math.abs(central.foodNet - 0.388165229596952) < 1e-10);
assert.equal(central.strictPositiveFood, true);
assert.equal(central.civilianWorkersConserved, true);
assert.equal(central.quarryProductive, true);
assert.equal(central.farmerPhysicalEligible, true);
assert.equal(central.farmerSmartEligible, false);

const nearBreakEven = scenario(4000, 2, 4);
assert.ok(Math.abs(nearBreakEven.foodNet - -0.006087828353719793) < 1e-10);
assert.equal(nearBreakEven.strictPositiveFood, false);
assert.equal(scenario(4000, 3, 4).quarryProductive, false);

const later = scenario(10000, 3, 3);
assert.ok(Math.abs(later.foodNet - 1.1333460831461082) < 1e-10);
const allWeather = result.allRetainedP43BStates;
assert.ok(allWeather.observedWeatherRangePercent[0] <= -30);
assert.ok(allWeather.observedWeatherRangePercent[1] >= 10);
assert.equal(allWeather.highDemandObservationCount, 751);
const highDemandThreeFarm = allWeather.highDemandScenarios.find(
  (entry) => entry.farms === 3 && entry.farmers === 3,
);
assert.equal(highDemandThreeFarm.minimumFoodNetPeriod, 5768);
assert.ok(
  Math.abs(highDemandThreeFarm.minimumFoodNet - -2.0443235115671756) < 1e-10,
);
assert.equal(highDemandThreeFarm.minimumFoodDemand, 8);
assert.equal(highDemandThreeFarm.robustPositiveFoodAndProductiveQuarry, false);
assert.equal(allWeather.unavailableObservations.length, 2);

for (const entry of [central, later]) {
  assert.equal(entry.workerAuthority.commitmentsKnown, false);
  assert.equal(entry.workerAuthority.capturedCommitmentStatus, "unavailable");
  assert.equal(entry.workerAuthority.p43TestOnlyAssumedEmpty, true);
  assert.equal(entry.workerAuthority.assignmentAuthorized, false);
  assert.equal(
    entry.constructionAuthority,
    "unavailable; no Farm purchase authorization",
  );
  assert.equal(entry.actionable, false);
}

const fullStorageEvent = timeline.armA.events.find(
  (event) => event.period === 5000,
);
const capacityResult = analyzeP44FoodScenarios({
  schema: timeline.schema,
  pinnedGame: timeline.pinnedGame,
  armB: { events: [fullStorageEvent] },
});
const fullStorageScenario = capacityResult.selectedPeriods
  .find((entry) => entry.period === 5000)
  .scenarios.find((entry) => entry.farms === 3 && entry.farmers === 3);
assert.equal(fullStorageScenario.stoneStock, 600);
assert.equal(fullStorageScenario.stoneHeadroom, 0);
assert.equal(fullStorageScenario.quarrySmartEligible, false);
assert.equal(fullStorageScenario.quarryProductive, false);

const staleEvent = {
  ...timeline.armB.events.find((event) => event.period === 4000),
  identity: {
    ...timeline.armB.events.find((event) => event.period === 4000).identity,
    rootGeneration: null,
  },
  workerCommitments: undefined,
  workerCommitmentsAssumedEmpty: false,
};
const staleResult = analyzeP44FoodScenarios({
  schema: timeline.schema,
  pinnedGame: timeline.pinnedGame,
  armB: { events: [staleEvent] },
});
const stalePeriod = staleResult.selectedPeriods.find(
  (entry) => entry.period === 4000,
);
assert.equal(stalePeriod.status, "unavailable");
assert.ok(
  stalePeriod.observed.reasons.includes(
    "current root, Jobs input, or job-control generation is incomplete",
  ),
);
assert.equal(
  stalePeriod.scenarios.every((entry) => entry.status === "unavailable"),
  true,
);
assert.equal(
  stalePeriod.scenarios.some(
    (entry) => entry.workerAuthority?.commitmentsKnown,
  ),
  false,
);

const wrongPinResult = analyzeP44FoodScenarios({
  ...timeline,
  pinnedGame: "pmotschmann/Evolve@unverified",
});
assert.equal(
  wrongPinResult.selectedPeriods.find((entry) => entry.period === 4000).status,
  "unavailable",
);

const objectiveIdentity = {
  period: 4000,
  workCycleSequence: 500,
  rootGeneration: 20,
  progressionGeneration: "human|progression-20",
};
function stoneObjectiveInput(overrides = {}) {
  return {
    food: {
      production: 8.5,
      consumption: 8,
      sourceComplete: true,
      provenance: objectiveIdentity,
    },
    population: {
      current: 4,
      housingCapacity: 4,
      starvationDelta: 0,
      deathsDelta: 0,
    },
    stone: {
      stock: 600,
      capacity: 600,
      uncoveredDemandKnown: true,
      uncoveredDemand: 0,
      quarryOwned: true,
      quarryOutputFormulaKnown: true,
      quarryOutputPerWorker: 1,
      provenance: objectiveIdentity,
    },
    jobs: {
      commitmentsKnown: false,
      assignmentCurrent: false,
      assignmentAuthorized: false,
      quarryWorkers: 0,
      quarryPhysicalCapacity: 4,
      quarrySmartCapacity: 0,
      provenance: {
        ...objectiveIdentity,
        jobsOwnerGeneration: 15,
        farmerControlGeneration: 10,
        quarryControlGeneration: 11,
      },
    },
    ...overrides,
  };
}

const fullStorageNoDemand = evaluateP44CapacityAwareStoneObjective(
  stoneObjectiveInput(),
);
assert.equal(fullStorageNoDemand.status, "pass");
assert.equal(fullStorageNoDemand.quarryRequired, false);

const usefulHeadroomWithoutAuthority = evaluateP44CapacityAwareStoneObjective(
  stoneObjectiveInput({
    stone: {
      ...stoneObjectiveInput().stone,
      stock: 300,
      uncoveredDemandKnown: false,
    },
  }),
);
assert.equal(usefulHeadroomWithoutAuthority.status, "unavailable");
assert.equal(usefulHeadroomWithoutAuthority.quarryRequired, true);

const replenishmentAuthorized = evaluateP44CapacityAwareStoneObjective(
  stoneObjectiveInput({
    stone: {
      ...stoneObjectiveInput().stone,
      stock: 300,
      uncoveredDemandKnown: false,
    },
    jobs: {
      ...stoneObjectiveInput().jobs,
      commitmentsKnown: true,
      assignmentCurrent: true,
      assignmentAuthorized: true,
      quarryWorkers: 1,
      quarrySmartCapacity: 1,
    },
  }),
);
assert.equal(replenishmentAuthorized.status, "pass");
assert.equal(replenishmentAuthorized.quarryRequired, true);

const staleStoneObservation = evaluateP44CapacityAwareStoneObjective(
  stoneObjectiveInput({
    stone: {
      ...stoneObjectiveInput().stone,
      provenance: { ...objectiveIdentity, period: 4008 },
    },
  }),
);
assert.equal(staleStoneObservation.status, "unavailable");

const foodUnsafeStoneObjective = evaluateP44CapacityAwareStoneObjective(
  stoneObjectiveInput({
    food: { ...stoneObjectiveInput().food, production: 7.99 },
  }),
);
assert.equal(foodUnsafeStoneObjective.status, "fail");

console.log("P44 Food infrastructure feasibility regressions passed");
