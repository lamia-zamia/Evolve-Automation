import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  analyzeP45FoodStockResilience,
  evaluateP45FoodStatus,
  normalizeP45Timeline,
  P45_FOOD_TIME_MULTIPLIER,
  P45_PINNED_GAME,
  projectP45FoodFlow,
  transitionNativeFoodStock,
} from "../../experiments/p45-food-stock-resilience.mjs";
import { analyzeP44FoodScenarios } from "../../experiments/p44-food-infrastructure-feasibility.mjs";

const timeline = JSON.parse(
  readFileSync(
    new URL(
      "../../experiments/p43-food-safe-jobs-timeline.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

assert.equal(P45_PINNED_GAME, timeline.pinnedGame);
assert.equal(P45_FOOD_TIME_MULTIPLIER, 0.25);

const positive = transitionNativeFoodStock({
  poolMode: "global",
  stock: 5,
  capacity: 10,
  production: 6,
  consumption: 2,
  fastLoops: 2,
  externalEventsComplete: true,
});
assert.equal(positive.status, "available");
assert.equal(positive.stock, 7);
assert.equal(positive.perFastLoopStockChange, 1);
assert.equal(positive.stockTransitionComplete, true);
assert.equal(
  transitionNativeFoodStock({
    stock: 1,
    capacity: 10,
    production: 2,
    consumption: 1,
    externalEventsComplete: true,
  }).status,
  "unavailable",
);
assert.equal(
  transitionNativeFoodStock({
    poolMode: "regional",
    stock: 1,
    capacity: 10,
    production: 2,
    consumption: 1,
    externalEventsComplete: true,
  }).status,
  "unavailable",
);

const overflow = transitionNativeFoodStock({
  poolMode: "global",
  stock: 9,
  capacity: 10,
  production: 4,
  consumption: 2,
  fastLoops: 3,
  externalEventsComplete: true,
});
assert.equal(overflow.stock, 10);
assert.equal(overflow.totalOverflow, 0.5);

const shrinkingCapacity = transitionNativeFoodStock({
  poolMode: "global",
  stock: 12,
  capacity: 10,
  production: 1,
  consumption: 1,
  externalEventsComplete: true,
});
assert.equal(shrinkingCapacity.stock, 10);
assert.equal(shrinkingCapacity.capacityClampLoss, 2);

const depletion = transitionNativeFoodStock({
  poolMode: "global",
  stock: 0.5,
  capacity: 10,
  production: 0,
  consumption: 2,
  fastLoops: 3,
  externalEventsComplete: true,
  starvationThreshold: 1.25,
  starvationChecks: [false, false, false],
  population: 4,
});
assert.equal(depletion.stock, 0);
assert.equal(depletion.firstZeroStockFastLoop, 1);
assert.equal(depletion.firstFailedPaymentFastLoop, 2);
assert.equal(depletion.starvation.status, "payment-failed-no-death");

const starvation = transitionNativeFoodStock({
  poolMode: "global",
  stock: 0,
  capacity: 10,
  production: 1,
  consumption: 3,
  fastLoops: 8,
  externalEventsComplete: true,
  starvationThreshold: 1.25,
  starvationChecks: [true],
  population: 4,
});
assert.equal(starvation.starvation.status, "starvation-observed");
assert.equal(starvation.starvation.populationAfter, 3);
assert.equal(starvation.starvation.futureConsumptionMustBeReobserved, true);
assert.equal(starvation.simulatedFastLoops, 1);
assert.equal(starvation.stockTransitionComplete, false);

const missingStarvationEvidence = transitionNativeFoodStock({
  poolMode: "global",
  stock: 0,
  capacity: 10,
  production: 1,
  consumption: 3,
  fastLoops: 8,
  externalEventsComplete: true,
  population: 4,
});
assert.equal(missingStarvationEvidence.starvation.status, "unavailable");
assert.equal(missingStarvationEvidence.simulatedFastLoops, 1);
assert.equal(missingStarvationEvidence.stockTransitionComplete, false);

const externalFoodWrite = transitionNativeFoodStock({
  poolMode: "global",
  stock: 2,
  capacity: 10,
  production: 2,
  consumption: 2,
  externalEventsComplete: true,
  externalOperations: [
    {
      phase: "after-food-pool",
      type: "delta",
      value: 3,
      source: "test fixture external Food writer",
    },
  ],
});
assert.equal(externalFoodWrite.stock, 5);
assert.equal(externalFoodWrite.stockTransitionComplete, true);

const sampleObservation = {
  availableForFlow: true,
  period: 100,
  civilianPopulation: 4,
  agriculture: 2,
  foodFormulaModifier: 1,
  effectiveOtherFoodProduction: 2,
  foodConsumption: 4,
  weatherPercent: -30,
  farmerPhysicalMaximum: 4,
  farmerSmartMaximum: 3,
  quarryPhysicalMaximum: 4,
  quarrySmartMaximum: 4,
  quarryCount: 1,
  modifierTuple: { globalProductionModifier: 1 },
  provenance: { source: "test", period: 100 },
  workerCommitmentsKnown: false,
};
const formulaFlow = projectP45FoodFlow(sampleObservation, {
  farms: 3,
  farmers: 3,
  quarryWorkers: 1,
});
assert.equal(formulaFlow.status, "available");
assert.ok(Math.abs(formulaFlow.foodProduction - 7.91) < 1e-10);
assert.ok(Math.abs(formulaFlow.foodNet - 3.91) < 1e-10);
assert.equal(formulaFlow.laborPhysicallyFeasible, true);
const severeWeatherFlow = projectP45FoodFlow(
  {
    ...sampleObservation,
    foodFormulaModifier: 0.7,
    effectiveOtherFoodProduction: 1.5,
    foodConsumption: 8,
  },
  { farms: 3, farmers: 3, quarryWorkers: 1 },
);
const favorableWeatherFlow = projectP45FoodFlow(
  {
    ...sampleObservation,
    weatherPercent: 10,
    foodFormulaModifier: 1.2,
    effectiveOtherFoodProduction: 2.5,
    foodConsumption: 8,
  },
  { farms: 3, farmers: 3, quarryWorkers: 1 },
);
assert.ok(severeWeatherFlow.foodNet < favorableWeatherFlow.foodNet);
const militaryDemandFlow = projectP45FoodFlow(
  { ...sampleObservation, foodConsumption: 8, garrisonWorkers: 4 },
  { farms: 3, farmers: 3, quarryWorkers: 1 },
);
assert.equal(militaryDemandFlow.foodNet, formulaFlow.foodNet - 4);
const infeasibleLaborFlow = projectP45FoodFlow(
  { ...sampleObservation, civilianPopulation: 3 },
  { farms: 3, farmers: 3, quarryWorkers: 1 },
);
assert.equal(infeasibleLaborFlow.status, "available");
assert.equal(infeasibleLaborFlow.laborPhysicallyFeasible, false);

const provenance = {
  source: "test fixture",
  period: 100,
  workCycleSequence: 10,
  rootGeneration: 1,
  progressionGeneration: "generation-a",
  rootMatches: true,
  current: true,
};
const baseStatus = {
  confidence: "medium",
  provenance,
  foodProductionKnown: true,
  foodConsumptionKnown: true,
  foodModifiersComplete: true,
  foodStockOwnerKnown: true,
  foodPoolModeKnown: true,
  foodPoolMode: "global",
  production: 5,
  consumption: 4,
  stock: 8,
  capacity: 20,
};
assert.equal(evaluateP45FoodStatus(baseStatus).status, "currently-positive");
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    foodPoolModeKnown: false,
  }).status,
  "unavailable",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    foodPoolMode: "regional",
    regionalFoodPoolsComplete: false,
  }).status,
  "unavailable",
);

const boundedHorizon = {
  known: true,
  maximumCumulativeDeficit: 6,
  startPeriod: 100,
  endPeriod: 200,
  source: "complete source-backed diagnostic envelope",
  confidence: "high",
  provenance: { ...provenance, period: 150 },
};
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    production: 3,
    consumption: 4,
    stock: 8,
    reserveHorizon: boundedHorizon,
    stockTransitionComplete: true,
  }).status,
  "buffered-deficit",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    production: 3,
    consumption: 5,
    stock: 5,
    reserveHorizon: boundedHorizon,
    stockTransitionComplete: true,
  }).status,
  "structural-deficit",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    production: 3,
    consumption: 5,
    stock: 8,
  }).status,
  "unavailable",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    production: 3,
    consumption: 4,
    stock: 8,
    weatherPercent: -30,
    foodModifiersComplete: false,
    reserveHorizon: boundedHorizon,
    stockTransitionComplete: true,
  }).status,
  "unavailable",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    production: 3,
    consumption: 8,
    garrisonWorkers: 4,
    stock: 8,
    reserveHorizon: boundedHorizon,
    stockTransitionComplete: true,
  }).status,
  "buffered-deficit",
);
assert.equal(
  evaluateP45FoodStatus({ ...baseStatus, stock: 8, capacity: 7 }).status,
  "unavailable",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    starvation: { count: 2, previousCount: 1 },
  }).status,
  "starvation-observed",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    provenance: { ...provenance, current: false },
    starvation: { count: 2, previousCount: 1 },
  }).status,
  "unavailable",
);
assert.equal(
  evaluateP45FoodStatus({
    confidence: "high",
    provenance,
    starvation: { count: 2, previousCount: 1 },
  }).status,
  "starvation-observed",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    production: 3,
    consumption: 5,
    recovery: {
      deficitObserved: true,
      previousStock: 7,
      provenance: { ...provenance, period: 99 },
    },
  }).status,
  "recovering",
);
assert.equal(
  evaluateP45FoodStatus({
    ...baseStatus,
    provenance: { ...provenance, current: false },
  }).status,
  "unavailable",
);

const normalized = normalizeP45Timeline(timeline);
const result = analyzeP45FoodStockResilience(normalized);
const p44 = analyzeP44FoodScenarios(timeline);
assert.equal(result.decision, "D — Calibration invalid");
assert.equal(result.calibration.status, "invalid");
assert.equal(result.source.normalizedObservationCount, 1161);
assert.equal(result.weatherAndDemand.observationCount, 1161);
assert.equal(
  normalized.armB.filter((row) => row.availableForFlow).length,
  1159,
);
assert.deepEqual(
  normalized.armB
    .filter((row) => !row.availableForFlow)
    .map((row) => row.period),
  [5728, 7448],
);
assert.deepEqual(result.weatherAndDemand.observedPeriodSpacing, [8]);
assert.equal(result.weatherAndDemand.weather.contiguousRuns.length, 51);
assert.deepEqual(
  result.weatherAndDemand.weather.stateTotals.map((entry) => ({
    weather: Math.round(entry.weatherPercent * 10) / 10,
    observations: entry.observations,
    boundaryExposure: entry.observedBoundaryExposurePeriods,
  })),
  [
    { weather: -30, observations: 66, boundaryExposure: 528 },
    { weather: -15, observations: 51, boundaryExposure: 408 },
    { weather: -6.5, observations: 193, boundaryExposure: 1544 },
    { weather: 0, observations: 523, boundaryExposure: 4184 },
    { weather: 10, observations: 328, boundaryExposure: 2616 },
  ],
);
assert.ok(
  Math.abs(
    result.weatherAndDemand.weather.stateTotals.reduce(
      (sum, entry) => sum + entry.heldBoundaryFoodFlowChange,
      0,
    ) -
      result.weatherAndDemand.actualP43BFoodFlow.heldBoundaryRateIntegration
        .sourceStateAppliedUntilNextObservation,
  ) < 1e-8,
);
assert.equal(
  result.weatherAndDemand.actualP43BFoodFlow.negativeObservationCount,
  791,
);
assert.equal(
  result.weatherAndDemand.observedStock.belowFortyThenExactlyFiftyTransitions,
  39,
);
assert.equal(
  result.weatherAndDemand.observedStock.resetTransitions.filter(
    (entry) => entry.starvationCountChanged,
  ).length,
  11,
);
assert.equal(
  result.weatherAndDemand.starvationBoundaryEvidence
    .firstObservedStarvationPeriod,
  5630,
);

const p728 = result.calibration.p43NativeCheckpoints.find(
  (entry) => entry.period === 728,
);
assert.equal(p728.foodStock, 158.8416200000015);
assert.equal(p728.foodCapacity, 1000);
assert.ok(
  Math.abs(result.calibration.p728To736BoundaryCheck.residual - 0.004) < 1e-8,
);
assert.equal(
  result.calibration.checkpointBoundaryChecks[1].predictedFoodStock,
  0,
);
assert.equal(
  result.calibration.p43NativeCheckpoints.find((entry) => entry.period === 5626)
    .foodStock,
  0,
);
assert.equal(
  result.calibration.p43NativeCheckpoints.find((entry) => entry.period === 5630)
    .starvationCount,
  1,
);
assert.equal(
  result.p43AComparison.calibrationCheckpoints.find(
    (entry) => entry.period === 1589,
  ).starvationCount,
  1,
);
assert.equal(
  result.p43AComparison.calibrationCheckpoints.find(
    (entry) => entry.period === 1592,
  ).foodStock,
  50,
);

const threeFarm = result.scenarioFlowAssessments.find(
  (entry) => entry.id === "B",
);
assert.equal(threeFarm.highDemandObservationCount, 751);
assert.equal(threeFarm.highDemandAtOrBelowStrictMarginCount, 296);
assert.equal(threeFarm.minimumFlow.period, 5768);
assert.ok(
  Math.abs(threeFarm.minimumFlow.foodNet - -2.0443235115671756) < 1e-10,
);
assert.equal(threeFarm.lastObservedFlow.period, 10000);
assert.ok(threeFarm.lastObservedFlow.foodNet > 0);
const severeWeatherObservation = normalized.armB.find(
  (entry) => entry.period === 5768,
);
const fourFarmerFlow = projectP45FoodFlow(severeWeatherObservation, {
  farms: 3,
  farmers: 4,
  quarryWorkers: 0,
});
assert.ok(fourFarmerFlow.foodNet > threeFarm.minimumFlow.foodNet);
assert.ok(fourFarmerFlow.foodNet < 0);
for (const period of [4000, 10000]) {
  const p44Flow = p44.selectedPeriods
    .find((entry) => entry.period === period)
    .scenarios.find((entry) => entry.farms === 3 && entry.farmers === 3);
  const p45Flow = threeFarm.selectedSampleFlows.find(
    (entry) => entry.period === period,
  );
  assert.ok(Math.abs(p45Flow.foodProduction - p44Flow.foodProduction) < 1e-10);
  assert.ok(Math.abs(p45Flow.foodNet - p44Flow.foodNet) < 1e-10);
}

for (const scenario of result.scenarioComparison) {
  assert.deepEqual(
    scenario.boundaryEvaluations.map((entry) => entry.startPeriod),
    [728, 2000, 4000, 5000, 5768],
  );
  for (const boundary of scenario.boundaryEvaluations) {
    assert.equal(boundary.stockSimulation.status, "unavailable");
    assert.equal(boundary.stockSimulation.minimumStartingReserveRequired, null);
    assert.equal(boundary.candidateStartingReserveRangeNotSimulated.minimum, 0);
    assert.equal(
      boundary.candidateStartingReserveRangeNotSimulated.maximum,
      boundary.observedFoodStock,
    );
  }
}
assert.equal(
  result.scenarioComparison.find((entry) => entry.id === "C")
    .boundaryEvaluations[0].storageAwareAlternative.status,
  "unavailable",
);
const storageAwareP5768 = result.scenarioComparison
  .find((entry) => entry.id === "C")
  .boundaryEvaluations.find(
    (entry) => entry.startPeriod === 5768,
  ).storageAwareAlternative;
assert.equal(storageAwareP5768.status, "unavailable");
assert.equal(
  storageAwareP5768.foodFlowSensitivityOnly.minimumFoodNetPeriod,
  5768,
);
assert.ok(
  storageAwareP5768.foodFlowSensitivityOnly.minimumFoodNet >
    threeFarm.minimumFlow.foodNet,
);
assert.equal(
  storageAwareP5768.foodFlowSensitivityOnly.calibratedStockProjection,
  false,
);
assert.equal(result.decisionEvidence.farmPurchaseAuthorized, false);
assert.equal(result.decisionEvidence.jobsAssignmentAuthorized, false);
assert.equal(result.decisionEvidence.p44StonePredicateChanged, false);

console.log(
  "P45 native Food transitions, stock-aware classification, and retained calibration evidence passed.",
);
