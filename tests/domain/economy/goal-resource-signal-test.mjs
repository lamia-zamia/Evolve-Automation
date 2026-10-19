import assert from "node:assert/strict";

import {
  evaluateGoalResourceSignal,
  evaluateGoalResourceSignals,
} from "../../../src/domain/economy/goal-resource-signal.ts";

const base = () => ({
  goalId: "goal:current",
  goalStatus: "active",
  actionId: "native:action",
  goalActionAuthority: "verified",
  resourceId: "Steel",
  poolId: "civilization-wide",
  required: 250,
  provenance: "native-immediate-price",
  confidence: "verified",
  observation: {
    id: "research-offers-17",
    generation: 17,
    rootGeneration: 4,
    progressionGeneration: "progression-12",
    ownerCycle: 30,
    permissionGeneration: 2,
    smelterControlGeneration: 8,
    demandGeneration: 11,
    stockObservationId: "stock:30",
    stockGeneration: 5,
    demandIdentity: "demand:30",
    aggregateTarget: 1_000,
    constructionTargetIdentity: "construction:coal-power",
  },
  offer: {
    freshness: "current",
    present: true,
    priceIdentity: "native-price:steel-250",
    generation: 17,
    rootGeneration: 4,
    progressionGeneration: "progression-12",
    controlGeneration: 17,
    poolId: "civilization-wide",
  },
  current: {
    ownerCycle: 30,
    observationId: "research-offers-17",
    rootGeneration: 4,
    progressionGeneration: "progression-12",
    controlGeneration: 17,
    offerGeneration: 17,
    priceIdentity: "native-price:steel-250",
    demandGeneration: 11,
    stockGeneration: 5,
    stockObservationId: "stock:30",
    permissionGeneration: 2,
    permissionEnabled: true,
    smelterControlGeneration: 8,
    demandIdentity: "demand:30",
    aggregateTarget: 1_000,
    constructionTargetIdentity: "construction:coal-power",
  },
  stock: { amount: 10, capacity: 33_516, poolId: "civilization-wide" },
  demand: {
    aggregateTarget: 1_000,
    currentDemand: 990,
    allocation: 1,
    constructionSavingTarget: {
      id: "construction:coal-power",
      poolId: undefined,
      resourceTarget: 1_000,
    },
    knownCommitments: [],
    commitmentCoverage: "complete",
    spendingOrderKnown: true,
  },
  unknownEvidence: [],
});
const setAggregateTarget = (input, amount) => {
  input.demand.aggregateTarget = amount;
  input.current.aggregateTarget = amount;
  input.observation.aggregateTarget = amount;
};

const represented = evaluateGoalResourceSignal(base());
assert.equal(represented.status, "already-represented");
assert.equal(represented.requiredTarget, undefined);
assert.equal(represented.constructionSavingTarget?.resourceTarget, 1_000);
assert.equal(represented.executableAuthorization, false);

const additional = base();
setAggregateTarget(additional, 100);
additional.demand.currentDemand = 90;
const supported = evaluateGoalResourceSignal(additional);
assert.equal(supported.status, "additional-target-supported");
assert.equal(supported.requiredTarget, 250);

const incompleteAuthority = base();
setAggregateTarget(incompleteAuthority, 100);
incompleteAuthority.demand.commitmentCoverage = "unknown";
assert.equal(
  evaluateGoalResourceSignal(incompleteAuthority).status,
  "competing-spending-unresolved",
);

const sameResourceConstruction = base();
setAggregateTarget(sameResourceConstruction, 100);
sameResourceConstruction.observation.constructionTargetIdentity =
  "construction:known";
sameResourceConstruction.current.constructionTargetIdentity =
  "construction:known";
sameResourceConstruction.demand.constructionSavingTarget = {
  id: "construction:known",
  poolId: "civilization-wide",
  resourceTarget: 100,
};
assert.equal(
  evaluateGoalResourceSignal(sameResourceConstruction).status,
  "additional-target-supported",
  "a Construction target naming the same resource is not itself a conflict",
);

const knownCompetingSpender = base();
setAggregateTarget(knownCompetingSpender, 100);
knownCompetingSpender.demand.knownCommitments = [
  {
    owner: "known-owner",
    resourceId: "Steel",
    poolId: "civilization-wide",
    amount: 40,
  },
];
knownCompetingSpender.demand.spendingOrderKnown = false;
assert.equal(
  evaluateGoalResourceSignal(knownCompetingSpender).status,
  "competing-spending-unresolved",
);

const satisfied = base();
satisfied.stock.amount = 250;
assert.equal(
  evaluateGoalResourceSignal(satisfied).status,
  "goal-already-satisfied",
);
const purchasedAction = base();
purchasedAction.goalStatus = "satisfied";
purchasedAction.offer.present = false;
assert.equal(
  evaluateGoalResourceSignal(purchasedAction).status,
  "goal-already-satisfied",
  "a purchased action satisfies the goal even after it leaves the offer",
);
const invalidated = base();
invalidated.goalStatus = "invalidated";
assert.equal(
  evaluateGoalResourceSignal(invalidated).status,
  "goal-invalidated",
);

const advisory = base();
advisory.provenance = "advisory-contributor";
advisory.confidence = "advisory";
assert.ok(
  evaluateGoalResourceSignal(advisory).unavailableReasons.includes(
    "requirement-is-not-a-verified-native-price",
  ),
);

for (const [name, mutate, expectedReason] of [
  [
    "previous Research draw",
    (input) => (input.offer.freshness = "previous-cycle"),
    "native-offer-not-current",
  ],
  [
    "different current Research observation",
    (input) => (input.current.observationId = "research-offers-18"),
    "current-observation-identity-mismatch",
  ],
  [
    "changed native price",
    (input) => (input.current.priceIdentity = "native-price:changed"),
    "native-price-changed-or-unidentified",
  ],
  [
    "withdrawn action",
    (input) => (input.offer.present = false),
    "native-action-not-currently-offered",
  ],
  [
    "new owner cycle",
    (input) => (input.current.ownerCycle += 1),
    "owner-cycle-superseded",
  ],
  [
    "root replacement",
    (input) => (input.current.rootGeneration += 1),
    "root-generation-changed",
  ],
  [
    "progression change",
    (input) => (input.current.progressionGeneration = "new-progression"),
    "progression-generation-changed",
  ],
  [
    "permission disabled",
    (input) => (input.current.permissionEnabled = false),
    "permission-disabled-or-unknown",
  ],
  [
    "permission generation",
    (input) => (input.current.permissionGeneration += 1),
    "permission-generation-changed",
  ],
  [
    "offer control replacement",
    (input) => (input.current.controlGeneration += 1),
    "native-control-replaced",
  ],
  [
    "Smelter control replacement",
    (input) => (input.current.smelterControlGeneration += 1),
    "smelter-control-replaced",
  ],
  [
    "Construction target change",
    (input) => (input.current.constructionTargetIdentity = "construction:new"),
    "construction-target-changed",
  ],
  [
    "native aggregate demand change",
    (input) => (input.current.aggregateTarget = 800),
    "aggregate-demand-target-changed",
  ],
  [
    "demand change",
    (input) => (input.current.demandIdentity = "demand:new"),
    "demand-identity-changed-or-unknown",
  ],
  [
    "demand target generation",
    (input) => (input.current.demandGeneration += 1),
    "demand-generation-changed",
  ],
  [
    "stock generation",
    (input) => (input.current.stockGeneration += 1),
    "stock-generation-changed",
  ],
  [
    "stock withdrawal",
    (input) => (input.stock.amount = undefined),
    "current-stock-unavailable",
  ],
  [
    "capacity reduction",
    (input) => (input.stock.capacity = 100),
    "required-quantity-exceeds-storage-capacity",
  ],
  [
    "regional pool",
    (input) => (input.stock.poolId = "region:city"),
    "current-stock-supply-pool-mismatch",
  ],
]) {
  const input = base();
  mutate(input);
  const signal = evaluateGoalResourceSignal(input);
  assert.ok(
    signal.unavailableReasons.includes(expectedReason) ||
      signal.status === "competing-spending-unresolved",
    `${name}: ${JSON.stringify(signal)}`,
  );
}

const disabled = base();
disabled.confidence = "unknown";
disabled.unknownEvidence = ["permission-disabled"];
assert.equal(
  evaluateGoalResourceSignal(disabled).status,
  "goal-evidence-unavailable",
);

const advisoryGoalAction = base();
advisoryGoalAction.goalActionAuthority = "advisory";
assert.ok(
  evaluateGoalResourceSignal(advisoryGoalAction).unavailableReasons.includes(
    "goal-action-selection-not-established",
  ),
);

const multiple = [base(), base()];
multiple[1].resourceId = "Knowledge";
multiple[1].poolId = "research-pool";
multiple[1].required = 9_000;
multiple[1].offer.poolId = "research-pool";
multiple[1].stock = {
  amount: 5_000,
  capacity: 20_000,
  poolId: "research-pool",
};
multiple[1].demand = {
  ...multiple[1].demand,
  aggregateTarget: 0,
  currentDemand: 0,
};
setAggregateTarget(multiple[1], 0);
assert.deepEqual(
  evaluateGoalResourceSignals(multiple).map(
    ({ resourceId, poolId, status }) => ({ resourceId, poolId, status }),
  ),
  [
    {
      resourceId: "Steel",
      poolId: "civilization-wide",
      status: "already-represented",
    },
    {
      resourceId: "Knowledge",
      poolId: "research-pool",
      status: "additional-target-supported",
    },
  ],
);
