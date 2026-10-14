import assert from "node:assert/strict";
import { applyVerifiedGoalIntentToSmelter } from "../../../experiments/stage3s-smelter-intent.mjs";
import { planSmelter } from "../../../src/domain/economy/production/smelter.ts";

const input = Object.freeze({
  initialised: true,
  steelDemanded: false,
  ironDemanded: true,
  totalSmelters: 4,
  fuels: Object.freeze([
    { id: "Wood", unlocked: true, currentFuelCount: 4, cost: [] },
  ]),
});
const freshness = Object.freeze({
  rootGeneration: 4,
  progressionEpoch: "epoch-7",
  offerIdentity: "offer-set-3",
  offerGeneration: 9,
  price: [{ resourceId: "Steel", amount: 250 }],
  settingsFingerprint: "settings-a",
  productionFingerprint: "smelter-a",
});
const intent = Object.freeze({
  resourceId: "Steel",
  shortfall: 240,
  actionable: true,
  freshness,
});
const apply = (overrides = {}) =>
  applyVerifiedGoalIntentToSmelter({
    input,
    intent,
    currentFreshness: freshness,
    automationEnabled: true,
    competingDemand: { evidence: "complete", resources: [] },
    supportedResources: ["Iron", "Steel"],
    ...overrides,
  });

const applied = apply();
assert.equal(applied.status, "intent-applied");
assert.equal(applied.input.steelDemanded, true);
assert.equal(
  applied.input.ironDemanded,
  true,
  "existing Iron demand remains in force",
);
assert.equal(
  applied.input.totalSmelters,
  input.totalSmelters,
  "native allocation limits are retained",
);
assert.equal(
  applied.input.fuels,
  input.fuels,
  "native fuel constraints are retained",
);
assert.equal(
  applied.allocationChangeCost,
  "must be measured by comparing native planner decisions",
);

assert.equal(apply({ automationEnabled: false }).status, "permission-disabled");
assert.equal(
  apply({ competingDemand: { evidence: "incomplete", resources: [] } }).status,
  "demand-unknown",
);
assert.equal(
  apply({ competingDemand: { evidence: "complete", resources: ["Steel"] } })
    .status,
  "already-demanded",
);
assert.equal(
  apply({ supportedResources: ["Iron"] }).status,
  "producer-unavailable",
);
assert.equal(
  apply({ intent: { ...intent, shortfall: 0 } }).status,
  "shortfall-satisfied",
);

for (const changed of [
  { rootGeneration: 5 },
  { progressionEpoch: "epoch-8" },
  { offerIdentity: "offer-set-4" },
  { offerGeneration: 10 },
  { settingsFingerprint: "settings-b" },
  { productionFingerprint: "smelter-b" },
  { price: [{ resourceId: "Steel", amount: 251 }] },
]) {
  assert.equal(
    apply({ currentFreshness: { ...freshness, ...changed } }).status,
    "stale-intent",
  );
}

const ironIntent = { ...intent, resourceId: "Iron" };
const ironResult = apply({ intent: ironIntent });
assert.equal(
  ironResult.status,
  "already-demanded",
  "a player's existing Iron demand takes precedence",
);

const fuelConstrainedInput = {
  initialised: true,
  hasForge: false,
  totalSmelters: 4,
  extraOperating: 0,
  consumptionBalanceMin: 60,
  fuels: [
    {
      id: "Wood",
      unlocked: true,
      isInfernoBeforeOil: false,
      currentFuelCount: 0,
      cost: [
        {
          resourceName: "Lumber",
          currentQuantity: 0,
          rateOfChange: 0,
          minRateOfChange: 2,
          quantity: 3,
          isDemanded: false,
        },
      ],
    },
  ],
  ironCount: 0,
  steelCount: 0,
  iridiumCount: 0,
  iridiumUnlocked: false,
  iridiumCapped: true,
  productionSmeltingIridium: 0.5,
  productionSmelting: "required",
  steelCost: [],
  ironTimeToFull: 1,
  ironTimeToRequired: 0,
  ironDemanded: false,
  steelTimeToFull: 1,
  steelTimeToRequired: 1,
  steelDemanded: false,
  minerCount: 1,
  beltIronShipStateOnCount: 0,
  titaniumStorageRatio: 1,
  haveTitaniumTech: false,
};
const fuelIntent = applyVerifiedGoalIntentToSmelter({
  input: fuelConstrainedInput,
  intent,
  currentFreshness: freshness,
  automationEnabled: true,
  competingDemand: { evidence: "complete", resources: [] },
  supportedResources: ["Steel"],
});
assert.equal(fuelIntent.status, "intent-applied");
assert.deepEqual(planSmelter(fuelIntent.input).fuelAdjustments, []);
assert.ok(
  planSmelter(fuelIntent.input).smeltAdjustments.every(
    ({ delta }) => delta === 0,
  ),
  "unaffordable fuel prevents a new allocation",
);

console.log("Stage 3S Smelter intent experiment tests passed");
