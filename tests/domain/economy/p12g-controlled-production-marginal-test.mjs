import assert from "node:assert/strict";

import { compareGoalStrategies } from "../../../src/domain/economy/goal-feasibility.ts";
import { planSmelter } from "../../../src/domain/economy/production/smelter.ts";

const capturedInput = Object.freeze({
  initialised: true,
  hasForge: false,
  totalSmelters: 15,
  extraOperating: 0,
  consumptionBalanceMin: 60,
  fuels: [
    {
      id: "Oil",
      unlocked: false,
      isInfernoBeforeOil: false,
      currentFuelCount: 0,
      cost: [],
    },
    {
      id: "Coal",
      unlocked: true,
      isInfernoBeforeOil: false,
      currentFuelCount: 15,
      cost: [
        {
          resourceName: "Coal",
          currentQuantity: 26045.05584517713,
          rateOfChange: 10.65,
          minRateOfChange: 2,
          quantity: 0.25,
          isDemanded: false,
        },
      ],
    },
    {
      id: "Wood",
      unlocked: true,
      isInfernoBeforeOil: false,
      currentFuelCount: 0,
      cost: [
        {
          resourceName: "Lumber",
          currentQuantity: 38872.0214321109,
          rateOfChange: 377.36,
          minRateOfChange: 2,
          quantity: 3,
          isDemanded: false,
        },
      ],
    },
  ],
  ironCount: 15,
  steelCount: 0,
  iridiumCount: 0,
  iridiumUnlocked: false,
  iridiumCapped: true,
  productionSmeltingIridium: 0.5,
  productionSmelting: "required",
  steelCost: [
    {
      resourceName: "Coal",
      currentQuantity: 26045.05584517713,
      rateOfChange: 10.65,
      minRateOfChange: 1.25,
      quantity: 0.25,
      isDemanded: false,
    },
    {
      resourceName: "Iron",
      currentQuantity: 63701.67744782266,
      rateOfChange: 37.47,
      minRateOfChange: 6,
      quantity: 2,
      isDemanded: false,
    },
  ],
  ironTimeToFull: 8191.174874624429,
  ironTimeToRequired: 0,
  ironDemanded: false,
  steelTimeToFull: Number.MAX_SAFE_INTEGER,
  steelTimeToRequired: Number.MAX_SAFE_INTEGER,
  steelDemanded: true,
  minerCount: 5,
  beltIronShipStateOnCount: 0,
  titaniumStorageRatio: 0,
  haveTitaniumTech: false,
});

const capturedDecision = planSmelter(capturedInput);
assert.equal(
  capturedDecision.smeltAdjustments.find(
    ({ productionId }) => productionId === "Steel",
  ).delta,
  1,
);
assert.equal(
  capturedDecision.smeltAdjustments.find(
    ({ productionId }) => productionId === "Iron",
  ).delta,
  -1,
);

const satisfiedSteelNeed = planSmelter({
  ...capturedInput,
  steelDemanded: false,
  steelTimeToRequired: 0,
});
assert.ok(satisfiedSteelNeed.smeltAdjustments.every(({ delta }) => delta <= 0));

const competingIronNeed = planSmelter({
  ...capturedInput,
  ironDemanded: true,
  steelDemanded: false,
  steelTimeToRequired: 0,
});
assert.ok(
  competingIronNeed.smeltAdjustments.find(
    ({ productionId }) => productionId === "Steel",
  ).delta <= 0,
);

const fuelConstrained = planSmelter({
  ...capturedInput,
  fuels: capturedInput.fuels.map((fuel) =>
    fuel.id !== "Coal"
      ? fuel
      : {
          ...fuel,
          cost: [{ ...fuel.cost[0], currentQuantity: 0, rateOfChange: 0 }],
        },
  ),
});
assert.ok(fuelConstrained.fuelAdjustments.some(({ delta }) => delta < 0));

const noSmelterCapacity = planSmelter({
  ...capturedInput,
  totalSmelters: 0,
  fuels: capturedInput.fuels.map((fuel) => ({ ...fuel, currentFuelCount: 0 })),
  ironCount: 0,
  steelCount: 0,
});
assert.ok(noSmelterCapacity.smeltAdjustments.every(({ delta }) => delta === 0));

const validityEpoch = "p12g:captured-enabled-state";
const comparison = compareGoalStrategies(
  "current-action:tech-steel_containers",
  [{ resourceId: "Steel", poolId: "anywhere", amount: 250 }],
  [
    {
      resourceId: "Steel",
      poolId: "anywhere",
      amount: 10,
      capacity: 33516,
      netRate: 0,
      rateConfidence: "observed",
      validityEpoch,
    },
    {
      resourceId: "Iron",
      poolId: "anywhere",
      amount: 63701.67744782266,
      capacity: 370625,
      netRate: 0,
      rateConfidence: "observed",
      validityEpoch,
    },
    {
      resourceId: "Coal",
      poolId: "anywhere",
      amount: 26045.05584517713,
      capacity: 222364,
      netRate: 0,
      rateConfidence: "observed",
      validityEpoch,
    },
  ],
  [{ resourceId: "Steel", poolId: "anywhere", amount: 1000 }],
  [
    {
      id: "steel-oriented-native-allocation",
      goalId: "current-action:tech-steel_containers",
      preconditions: { satisfied: true, reasons: [] },
      acquisitionCosts: [],
      productionChanges: [
        { resourceId: "Steel", poolId: "anywhere", netRateDelta: 0.5494 },
        { resourceId: "Iron", poolId: "anywhere", netRateDelta: -0.23475 },
        { resourceId: "Coal", poolId: "anywhere", netRateDelta: -0.01 },
      ],
      effectsComplete: true,
      effectAuthority: "provisional",
      validityEpoch,
      unavailableReasons: [],
    },
  ],
  validityEpoch,
  false,
);
assert.equal(comparison.winner, undefined);
assert.equal(comparison.provisionalWinner, undefined);
assert.ok(
  comparison.strategies.every(
    ({ completionTime }) => completionTime === undefined,
  ),
);

console.log("P12G controlled production marginal tests passed");
