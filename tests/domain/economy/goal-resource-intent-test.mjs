import assert from "node:assert/strict";
import { planGoalResourceIntents } from "../../../src/domain/economy/production/goal-resource-intent.ts";

const base = {
  selectedGoal: "goal",
  frontier: {
    evidence: "complete",
    mandatoryEvidence: "complete",
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
assert.equal(intent?.actionable, true);

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
    mandatoryEvidence: "complete",
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
assert.equal(alternatives?.options[0]?.intents[0]?.actionable, false);
assert.equal(alternatives?.options[0]?.intents[0]?.status, "not-selected");

const unselectedMissingPrice = planGoalResourceIntents({
  ...base,
  frontier: {
    ...base.frontier,
    alternatives: [
      { groupId: "unselected-route", actionIds: ["unselected-action"] },
    ],
  },
  offers: [...base.offers, { actionId: "unselected-action", price: null }],
});
assert.equal(unselectedMissingPrice.status, "available");
assert.deepEqual(unselectedMissingPrice.unavailableActionIds, []);

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
    mandatoryEvidence: "partial",
    reasons: ["dynamic gate"],
  },
});
assert.equal(incomplete.status, "unavailable");
assert.equal(incomplete.mandatory.length, 0);

const partialGlobalGraph = planGoalResourceIntents({
  ...base,
  frontier: {
    ...base.frontier,
    evidence: "partial",
    reasons: ["unrelated branch has unavailable native evidence"],
  },
});
assert.equal(partialGlobalGraph.status, "partial");
assert.equal(partialGlobalGraph.frontierEvidence, "partial");
assert.equal(partialGlobalGraph.actionable, true);

const missingPrice = planGoalResourceIntents({
  ...base,
  offers: [{ actionId: "mandatory-action", price: null }],
});
assert.deepEqual(missingPrice.unavailableActionIds, ["mandatory-action"]);
assert.equal(missingPrice.status, "partial");
assert.equal(missingPrice.actionable, false);

for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
  for (const invalidInput of [
    {
      ...base,
      offers: [
        {
          actionId: "mandatory-action",
          price: [{ resourceId: "Metal", amount: invalid }],
        },
      ],
    },
    {
      ...base,
      holdings: [{ resourceId: "Metal", amount: invalid, capacity: 500 }],
    },
    {
      ...base,
      holdings: [{ resourceId: "Metal", amount: 10, capacity: invalid }],
    },
    { ...base, commitments: [{ resourceId: "Metal", amount: invalid }] },
  ]) {
    assert.equal(planGoalResourceIntents(invalidInput).status, "unavailable");
  }
}

for (const invalidResourceId of ["", "not a resource", "Metal/"]) {
  assert.equal(
    planGoalResourceIntents({
      ...base,
      offers: [
        {
          actionId: "mandatory-action",
          price: [{ resourceId: invalidResourceId, amount: 2 }],
        },
      ],
    }).status,
    "unavailable",
  );
}

for (const duplicateInput of [
  { ...base, offers: [...base.offers, base.offers[0]] },
  { ...base, holdings: [...base.holdings, base.holdings[0]] },
  { ...base, production: [...base.production, base.production[0]] },
]) {
  assert.equal(planGoalResourceIntents(duplicateInput).actionable, false);
}

assert.equal(
  planGoalResourceIntents({
    ...base,
    production: [{ ...base.production[0], available: true, ownerId: null }],
  }).status,
  "unavailable",
  "an available producer must identify its owner",
);

const sharedMandatoryResource = planGoalResourceIntents({
  ...base,
  frontier: {
    ...base.frontier,
    mandatoryActionIds: ["mandatory-action", "second-action"],
  },
  offers: [
    ...base.offers,
    {
      actionId: "second-action",
      price: [{ resourceId: "Metal", amount: 100 }],
    },
  ],
});
assert.equal(sharedMandatoryResource.actionable, false);
assert.ok(
  sharedMandatoryResource.mandatory.every((entry) => !entry.actionable),
);
assert.match(sharedMandatoryResource.mandatory[0]?.reason ?? "", /compete/);

const overflowedCommitments = planGoalResourceIntents({
  ...base,
  commitments: [{ resourceId: "Metal", amount: Number.MAX_VALUE }],
  offers: [
    {
      actionId: "mandatory-action",
      price: [{ resourceId: "Metal", amount: Number.MAX_VALUE }],
    },
  ],
});
assert.equal(overflowedCommitments.actionable, false);
assert.deepEqual(overflowedCommitments.unavailableActionIds, [
  "mandatory-action",
]);

console.log("Goal resource intent tests passed");
