import assert from "node:assert/strict";

import {
  createP38QuarryDiagnosticAuthorization,
  P38_DIAGNOSTIC_AUTHORIZATION,
} from "../../experiments/p38-quarry-production-validation-policy.mjs";

assert.deepEqual(P38_DIAGNOSTIC_AUTHORIZATION, {
  id: "p38-test-only-quarry-lumber-gather-18",
  targetId: "city-rock_quarry",
  additionalGatherLimit: 18,
  perCycleLimit: 5,
  retainedStopPeriod: 688,
});

const p36Stop = {
  reason: "shortage-exceeds-remaining-budget",
  targetId: "city-rock_quarry",
  period: 688,
};
const root = {
  city: { rock_quarry: { count: 0 } },
  resource: { Lumber: { amount: 32 }, Stone: { amount: 10 } },
};
const contract = (overrides = {}) => ({
  targetId: "city-rock_quarry",
  phase: "pre-Gather",
  resourceAuthority: "native-gather-owner-controls",
  price: { Lumber: 50, Stone: 10 },
  stock: {
    Lumber: root.resource.Lumber.amount,
    Stone: root.resource.Stone.amount,
  },
  pool: "anywhere",
  rootGeneration: 4,
  progressionGeneration: "human|standard|4",
  controlGeneration: 9,
  publicationCurrent: true,
  requestMatchesPublication: true,
  currentSavingTargetMatchesPublication: true,
  priceAuthorityValid: true,
  ownerState: { orderingComplete: true, autoBuild: true },
  permissions: { autoBuild: true, controlAction: true },
  queuesEmpty: true,
  competingClaims: false,
  obtainableCapacity: { Lumber: 500, Stone: 500 },
  gatherControlBindings: {
    Lumber: { elementId: "city-lumber", generation: 2 },
    Stone: { elementId: "undefined-stone", generation: 3 },
  },
  ...overrides,
});

const events = [];
const policy = createP38QuarryDiagnosticAuthorization({
  arm: "B",
  readP36Stop: () => p36Stop,
  readRoot: () => root,
  onEvent: (event) => events.push(event),
});
assert.equal(policy.authorize(contract(), root, 688), undefined);
assert.equal(policy.snapshot().clicks, 0);

let period = 696;
while (policy.snapshot().clicks < 18) {
  const current = contract();
  policy.observe(current, root, period);
  const authorization = policy.authorize(current, root, period);
  assert.ok(authorization);
  assert.ok(authorization.clickBudget <= 5);
  assert.equal(policy.isCurrent(current, root, period), true);
  for (let index = 0; index < authorization.clickBudget; index += 1) {
    const before = root.resource.Lumber.amount;
    root.resource.Lumber.amount += 1;
    authorization.onClick({ actionId: "city-lumber", resourceId: "Lumber" });
    assert.equal(root.resource.Lumber.amount, before + 1);
  }
  period += 8;
}
assert.equal(policy.snapshot().clicks, 18);
assert.ok(
  events
    .filter((event) => event.type === "gather-click")
    .every((event) => event.stockIncreased),
);
assert.equal(policy.authorize(contract(), root, period), undefined);
assert.ok(events.some((event) => event.type === "materials-ready"));
root.city.rock_quarry.count = 1;
policy.observe(contract(), root, period + 8);
assert.equal(policy.snapshot().stoppedReason, "native-quarry-purchased");

const competingPurchaseRoot = {
  city: { rock_quarry: { count: 0 } },
  resource: { Lumber: { amount: 32 }, Stone: { amount: 10 } },
};
const competingPurchase = createP38QuarryDiagnosticAuthorization({
  arm: "B",
  readP36Stop: () => p36Stop,
  readRoot: () => competingPurchaseRoot,
});
const firstCycle = contract({
  stock: { Lumber: 32, Stone: 10 },
});
const firstCycleAuthorization = competingPurchase.authorize(
  firstCycle,
  competingPurchaseRoot,
  696,
);
assert.equal(firstCycleAuthorization.clickBudget, 5);
for (let index = 0; index < 5; index += 1) {
  competingPurchaseRoot.resource.Lumber.amount += 1;
  firstCycleAuthorization.onClick({
    actionId: "city-lumber",
    resourceId: "Lumber",
  });
}
competingPurchaseRoot.resource.Lumber.amount = 15;
competingPurchase.observe(
  contract({ stock: { Lumber: 15, Stone: 10 } }),
  competingPurchaseRoot,
  704,
);
assert.equal(
  competingPurchase.snapshot().stoppedReason,
  "competing-purchase-consumed-resources",
);

const failedPostconditionRoot = {
  city: { rock_quarry: { count: 0 } },
  resource: { Lumber: { amount: 32 }, Stone: { amount: 10 } },
};
const failedPostcondition = createP38QuarryDiagnosticAuthorization({
  arm: "B-repeat",
  readP36Stop: () => p36Stop,
  readRoot: () => failedPostconditionRoot,
});
const failureAuthorization = failedPostcondition.authorize(
  contract({ stock: { Lumber: 32, Stone: 10 } }),
  failedPostconditionRoot,
  696,
);
failureAuthorization.onClick({ actionId: "city-lumber", resourceId: "Lumber" });
assert.equal(
  failedPostcondition.snapshot().stoppedReason,
  "native-gather-stock-postcondition-failed",
);

const changedTarget = createP38QuarryDiagnosticAuthorization({
  arm: "C",
  readP36Stop: () => p36Stop,
  readRoot: () => failedPostconditionRoot,
});
changedTarget.observe(
  contract({ targetId: "city-farm" }),
  failedPostconditionRoot,
  696,
);
assert.equal(changedTarget.snapshot().stoppedReason, "native-target-changed");

const incompleteAuthority = createP38QuarryDiagnosticAuthorization({
  arm: "C-repeat",
  readP36Stop: () => p36Stop,
  readRoot: () => failedPostconditionRoot,
});
assert.equal(
  incompleteAuthority.authorize(
    contract({
      stock: { Lumber: 32, Stone: 10 },
      permissions: { autoBuild: false, controlAction: true },
    }),
    failedPostconditionRoot,
    696,
  ),
  undefined,
);
assert.equal(
  incompleteAuthority.snapshot().stoppedReason,
  "native-authority-incomplete",
);

console.log("p38-quarry-production-validation-policy ok");
