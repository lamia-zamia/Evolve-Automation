import assert from "node:assert/strict";
import { planGoalResourceIntents } from "../../../src/domain/economy/production/goal-resource-intent.ts";

const base = {
  selectedGoal: "goal",
  frontier: {
    evidence: "complete",
    mandatoryActionIds: ["mandatory-action"],
    alternatives: [],
    reasons: [],
  },
  offers: [
    {
      actionId: "mandatory-action",
      price: [{ resourceId: "Metal", amount: 250 }],
    },
  ],
  holdings: [{ resourceId: "Metal", amount: 10, capacity: 500 }],
  commitments: [],
  production: [
    {
      resourceId: "Metal",
      ownerId: "metal-owner",
      available: true,
      unavailableReason: null,
      automationEnabled: true,
    },
  ],
};

const intent = planGoalResourceIntents(base).mandatory[0];
assert.equal(intent?.shortfall, 240);
assert.equal(intent?.status, "intent");

const withCommitment = planGoalResourceIntents({
  ...base,
  commitments: [{ resourceId: "Metal", amount: 40 }],
}).mandatory[0];
assert.equal(withCommitment?.committedQuantity, 40);
assert.equal(withCommitment?.shortfall, 280);

const disabled = planGoalResourceIntents({
  ...base,
  production: [{ ...base.production[0], automationEnabled: false }],
}).mandatory[0];
assert.equal(disabled?.status, "permission-disabled");
assert.equal(disabled?.shortfall, 240);

const unavailableProducer = planGoalResourceIntents({
  ...base,
  production: [
    {
      ...base.production[0],
      available: false,
      unavailableReason: "insufficient fuel",
    },
  ],
}).mandatory[0];
assert.equal(unavailableProducer?.status, "production-unavailable");
assert.equal(unavailableProducer?.reason, "insufficient fuel");

const unusualRaceProducer = planGoalResourceIntents({
  ...base,
  production: [
    {
      ...base.production[0],
      available: false,
      unavailableReason: "native metal production control is unavailable",
    },
  ],
}).mandatory[0];
assert.equal(unusualRaceProducer?.status, "production-unavailable");

const limitedStorage = planGoalResourceIntents({
  ...base,
  holdings: [{ resourceId: "Metal", amount: 10, capacity: 200 }],
}).mandatory[0];
assert.equal(limitedStorage?.status, "capacity-insufficient");

const unknownHolding = planGoalResourceIntents({
  ...base,
  holdings: [{ resourceId: "Metal", amount: null, capacity: 500 }],
}).mandatory[0];
assert.equal(unknownHolding?.status, "evidence-unavailable");
assert.equal(unknownHolding?.heldQuantity, null);
assert.equal(unknownHolding?.shortfall, null);

const alternatives = planGoalResourceIntents({
  ...base,
  frontier: {
    evidence: "complete",
    mandatoryActionIds: [],
    alternatives: [{ groupId: "same-grant", actionIds: ["path-a", "path-b"] }],
    reasons: [],
  },
  offers: [
    { actionId: "path-a", price: [{ resourceId: "Metal", amount: 250 }] },
    { actionId: "path-b", price: [{ resourceId: "Metal", amount: 80 }] },
  ],
}).alternatives[0];
assert.deepEqual(
  alternatives?.options.map(({ actionId, intents }) => [
    actionId,
    intents[0]?.shortfall,
  ]),
  [
    ["path-a", 240],
    ["path-b", 70],
  ],
);

// These are model inputs, not claims about route prices. The native adapter supplies the live
// price and capability for Standard, True Path, Ice Age, race, and challenge state alike.
for (const scenario of [
  { route: "Standard", price: 250, capacity: 500, expected: "intent" },
  { route: "True Path", price: 300, capacity: 500, expected: "intent" },
  { route: "Ice Age", price: 400, capacity: 500, expected: "intent" },
  {
    route: "challenge cost modifier",
    price: 300,
    capacity: 200,
    expected: "capacity-insufficient",
  },
]) {
  const observed = planGoalResourceIntents({
    ...base,
    offers: [
      {
        actionId: "mandatory-action",
        price: [{ resourceId: "Metal", amount: scenario.price }],
      },
    ],
    holdings: [
      { resourceId: "Metal", amount: 10, capacity: scenario.capacity },
    ],
  }).mandatory[0];
  assert.equal(observed?.status, scenario.expected, scenario.route);
  if (scenario.expected === "intent")
    assert.equal(observed?.shortfall, scenario.price - 10, scenario.route);
}

const incomplete = planGoalResourceIntents({
  ...base,
  frontier: {
    ...base.frontier,
    evidence: "partial",
    reasons: ["dynamic gate"],
  },
});
assert.equal(incomplete.status, "unavailable");
assert.equal(incomplete.mandatory.length, 0);

const missingPrice = planGoalResourceIntents({
  ...base,
  offers: [{ actionId: "mandatory-action", price: null }],
});
assert.deepEqual(missingPrice.unavailableActionIds, ["mandatory-action"]);
assert.equal(missingPrice.status, "partial");

console.log("Goal resource intent tests passed");
