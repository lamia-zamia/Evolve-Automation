import assert from "node:assert/strict";

import { createCapturedTriggers } from "../src/adapters/evolve/progression/build/captured-triggers.ts";

const root = {
  race: { species: "human" },
  city: {
    farm: { count: 3 },
    mine: { count: 0 },
    apartment: { count: 0 },
  },
  arpa: { launch_facility: { rank: 0, complete: 10 } },
  resource: {
    Money: { amount: 500, max: 100000, display: true },
    Lumber: { amount: 100, max: 5000, display: true },
    Knowledge: { amount: 50, max: 1000, display: true },
    Stone: { amount: 0, max: 60, display: true },
  },
};

const COSTS = {
  "city-mine": { Money: 60, Lumber: 175 },
  "city-apartment": { Money: 875, Lumber: 600 },
  "city-amphitheatre": { Money: 500, Stone: 200 },
};

const OFFERED = [
  { elementId: "tech-mad", cost: { Knowledge: 600 }, generation: 1 },
];

function trigger(overrides = {}) {
  return {
    seq: 0,
    priority: 0,
    requirementType: "BuildingCount",
    requirementId: "city-farm",
    requirementCount: 3,
    actionType: "build",
    actionId: "city-mine",
    actionCount: 1,
    ...overrides,
  };
}

function triggers({
  settings = {},
  triggers: rows = [],
  rootValue = root,
  offered = OFFERED,
  controls,
} = {}) {
  return createCapturedTriggers({
    rootState: { readRoot: () => rootValue },
    controls: controls ?? {
      resolve: (elementId) =>
        elementId in COSTS
          ? { elementId, generation: 1, methods: [] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => Object.keys(COSTS),
    },
    costs: { readCost: (actionId) => COSTS[actionId] },
    readSettings: () => ({ autoTrigger: true, triggers: rows, ...settings }),
    readOfferedTechs: () => (offered === null ? undefined : offered),
  });
}

// A met requirement makes the action a target, at the game's own current cost.
assert.deepEqual(triggers({ triggers: [trigger()] }).read(), [
  { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
]);

// The feature is off unless the player turned it on.
assert.deepEqual(
  triggers({ triggers: [trigger()], settings: { autoTrigger: false } }).read(),
  [],
);
assert.deepEqual(triggers({ triggers: [] }).read(), []);

// An unmet requirement, and one the captured root cannot answer, both raise no demand.
assert.deepEqual(
  triggers({ triggers: [trigger({ requirementCount: 4 })] }).read(),
  [],
);
assert.deepEqual(
  triggers({
    triggers: [
      trigger({
        requirementType: "ResearchComplete",
        requirementId: "tech-mad",
      }),
    ],
  }).read(),
  [],
);

// An action the game has already carried out is done with, and so is a malformed row.
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionId: "city-farm", actionCount: 3 })],
  }).read(),
  [],
);
assert.deepEqual(triggers({ triggers: [trigger({ actionId: 7 })] }).read(), []);

// A build action is only possible while the game has built its control and can price it.
assert.deepEqual(
  triggers({
    triggers: [trigger()],
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => [],
    },
  }).read(),
  [],
);
assert.deepEqual(
  triggers({ triggers: [trigger({ actionId: "city-sawmill" })] }).read(),
  [],
);

// A cost that does not fit in current storage is not a target: it could never be paid for.
assert.deepEqual(
  triggers({ triggers: [trigger({ actionId: "city-amphitheatre" })] }).read(),
  [],
);

// Research targets are priced from the offered catalog, and an unoffered technology is unknown.
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "research", actionId: "tech-mad" })],
  }).read(),
  [{ actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } }],
);
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "research", actionId: "tech-wheel" })],
  }).read(),
  [],
);
assert.deepEqual(
  triggers({
    triggers: [trigger({ actionType: "research", actionId: "tech-mad" })],
    offered: null,
  }).read(),
  [],
);

// A.R.P.A. actions are not priced yet, so a trigger for one raises no demand.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ actionType: "arpa", actionId: "arpalaunch_facility" }),
    ],
  }).read(),
  [],
);

// Chained triggers wait for the trigger before them to finish.
const chained = [
  trigger({ priority: 0, actionId: "city-farm", actionCount: 3 }),
  trigger({
    priority: 1,
    requirementType: "chain",
    requirementId: "",
    requirementCount: 0,
    actionId: "city-mine",
  }),
];
assert.deepEqual(triggers({ triggers: chained }).read(), [
  { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
]);
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 0, actionId: "city-apartment", actionCount: 1 }),
      chained[1],
    ],
  }).read(),
  [
    {
      actionId: "city-apartment",
      actionType: "build",
      cost: COSTS["city-apartment"],
    },
  ],
);
// Completion of a research action is not captured, so what is chained behind it is dropped.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 0, actionType: "research", actionId: "tech-mad" }),
      chained[1],
    ],
  }).read(),
  [{ actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } }],
);

// Two triggers competing for the same resource: only the higher-priority one is a target.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 1, actionId: "city-apartment" }),
      trigger({ priority: 0, actionId: "city-mine" }),
    ],
  }).read(),
  [{ actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] }],
);
// Costs that share nothing are both targets, in the player's priority order.
assert.deepEqual(
  triggers({
    triggers: [
      trigger({ priority: 1, actionType: "research", actionId: "tech-mad" }),
      trigger({ priority: 0, actionId: "city-mine" }),
    ],
  }).read(),
  [
    { actionId: "city-mine", actionType: "build", cost: COSTS["city-mine"] },
    { actionId: "tech-mad", actionType: "research", cost: { Knowledge: 600 } },
  ],
);

console.log("Captured trigger source tests passed");
