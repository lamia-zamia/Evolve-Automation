import assert from "node:assert/strict";
import {
  createP36BootstrapPolicy,
  P36_BOOTSTRAP_LIMITS,
  P36_BOOTSTRAP_TARGETS,
} from "../../experiments/p36-productive-resource-bootstrap-policy.mjs";

assert.deepEqual(P36_BOOTSTRAP_LIMITS, {
  shed: 80,
  quarry: 60,
  total: 140,
  perCycle: 5,
});
assert.deepEqual(P36_BOOTSTRAP_TARGETS, {
  shed: "city-shed",
  quarry: "city-rock_quarry",
});

const root = { city: { shed: { count: 0 }, rock_quarry: { count: 0 } } };
const baseContract = (targetId, price, stock) => ({
  targetId,
  price,
  stock,
  rootGeneration: 1,
  progressionGeneration: "human|standard|1",
  controlGeneration: 3,
  phase: "pre-Gather",
  publicationCurrent: true,
  requestMatchesPublication: true,
  currentSavingTargetMatchesPublication: true,
  priceAuthorityValid: true,
  ownerState: { autoBuild: true },
  queuesEmpty: true,
  permissions: { autoBuild: true, controlAction: true },
  competingClaims: false,
});

const events = [];
const policy = createP36BootstrapPolicy({
  onEvent: (event) => events.push(event),
});
const earlyFarm = baseContract(
  "city-farm",
  { Lumber: 20, Stone: 10 },
  { Lumber: 20, Stone: 0 },
);
assert.equal(policy.inspect(earlyFarm, root, 80), false);
assert.deepEqual(policy.snapshot(), {
  stage: "shed",
  stageClicks: 0,
  totalClicks: 0,
  armed: false,
  stoppedReason: null,
});

const shed = baseContract(
  "city-shed",
  { Money: 75, Lumber: 55, Stone: 45 },
  { Money: 100, Lumber: 20, Stone: 0 },
);
for (let cycle = 0; cycle < 16; cycle += 1) {
  const decision = policy.authorize(shed, root, 448 + cycle * 8);
  assert.equal(decision.clickBudget, 5);
  for (let index = 0; index < decision.clickBudget; index += 1) {
    const resourceId = shed.stock.Lumber < 55 ? "Lumber" : "Stone";
    shed.stock[resourceId] += 1;
    decision.onClick({
      actionId: resourceId === "Lumber" ? "city-lumber" : "undefined-stone",
      resourceId,
    });
  }
}
assert.equal(policy.snapshot().stageClicks, 80);
assert.equal(policy.snapshot().totalClicks, 80);
assert.equal(policy.snapshot().armed, false);
assert.equal(policy.snapshot().stoppedReason, null);
assert.equal(
  events.filter((event) => event.type === "gather-click").length,
  80,
);

root.city.shed.count = 1;
const quarry = baseContract(
  "city-rock_quarry",
  { Lumber: 50, Stone: 10 },
  { Lumber: 0, Stone: 0 },
);
assert.equal(policy.inspect(quarry, root, 600), true);
assert.equal(policy.snapshot().stage, "quarry");
for (let cycle = 0; cycle < 12; cycle += 1) {
  const decision = policy.authorize(quarry, root, 608 + cycle * 8);
  assert.equal(decision.clickBudget, 5);
  for (let index = 0; index < decision.clickBudget; index += 1) {
    const resourceId = quarry.stock.Lumber < 50 ? "Lumber" : "Stone";
    quarry.stock[resourceId] += 1;
    decision.onClick({
      actionId: resourceId === "Lumber" ? "city-lumber" : "undefined-stone",
      resourceId,
    });
  }
}
assert.equal(policy.snapshot().stageClicks, 60);
assert.equal(policy.snapshot().totalClicks, 140);
assert.equal(policy.snapshot().armed, false);
assert.equal(policy.snapshot().stoppedReason, null);

const changedTargetEvents = [];
const changedTargetPolicy = createP36BootstrapPolicy({
  onEvent: (event) => changedTargetEvents.push(event),
});
const unopenedCity = {
  city: { shed: { count: 0 }, rock_quarry: { count: 0 } },
};
const unspentShed = () =>
  baseContract(
    "city-shed",
    { Money: 75, Lumber: 55, Stone: 45 },
    { Money: 100, Lumber: 20, Stone: 0 },
  );
changedTargetPolicy.authorize(unspentShed(), unopenedCity, 448);
changedTargetPolicy.inspect(
  baseContract(
    "city-farm",
    { Lumber: 27, Stone: 14 },
    { Lumber: 20, Stone: 0 },
  ),
  unopenedCity,
  456,
);
assert.equal(
  changedTargetPolicy.snapshot().stoppedReason,
  "unexpected-native-target",
);
assert.equal(
  changedTargetEvents.filter((event) => event.type === "gather-click").length,
  0,
  "a changed Construction target denies every subsequent Gather action",
);

const repricedEvents = [];
const repricedPolicy = createP36BootstrapPolicy({
  onEvent: (event) => repricedEvents.push(event),
});
repricedPolicy.authorize(unspentShed(), unopenedCity, 448);
repricedPolicy.inspect(
  baseContract(
    "city-shed",
    { Money: 75, Lumber: 56, Stone: 45 },
    { Money: 100, Lumber: 20, Stone: 0 },
  ),
  { city: { shed: { count: 0 } } },
  456,
);
assert.equal(
  repricedPolicy.snapshot().stoppedReason,
  "native-request-authority-changed",
  "unexpected repricing does not extend either stage budget",
);

const refreshedAuthorityPolicy = createP36BootstrapPolicy();
const firstAuthority = unspentShed();
assert.ok(
  refreshedAuthorityPolicy.authorize(firstAuthority, unopenedCity, 448),
);
const renewedAuthority = {
  ...unspentShed(),
  progressionGeneration: "human|standard|2",
  controlGeneration: 4,
};
const renewedDecision = refreshedAuthorityPolicy.authorize(
  renewedAuthority,
  unopenedCity,
  456,
);
assert.equal(
  renewedDecision.clickBudget,
  5,
  "a renewed live ordering generation continues the same fixed target episode",
);
assert.equal(
  refreshedAuthorityPolicy.isCurrent(firstAuthority, unopenedCity),
  false,
  "the preceding ordering generation cannot authorize another click",
);
assert.equal(
  refreshedAuthorityPolicy.isCurrent(renewedAuthority, unopenedCity),
  true,
  "the latest live owner/root/progression/control generation remains current",
);

const overBudgetEvents = [];
const overBudgetPolicy = createP36BootstrapPolicy({
  onEvent: (event) => overBudgetEvents.push(event),
});
assert.equal(
  overBudgetPolicy.authorize(
    baseContract(
      "city-shed",
      { Money: 75, Lumber: 56, Stone: 45 },
      { Money: 100, Lumber: 20, Stone: 0 },
    ),
    { city: { shed: { count: 0 } } },
    448,
  ),
  undefined,
);
assert.equal(
  overBudgetPolicy.snapshot().stoppedReason,
  "shortage-exceeds-remaining-budget",
);

console.log("P36 productive-resource bootstrap policy limits and stops ok");
