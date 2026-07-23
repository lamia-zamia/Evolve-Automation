import assert from "node:assert/strict";

import { runMiningDroidAutomation } from "../src/application/mining-droid.ts";
import {
  createMiningDroidCommandExecutor,
  createMiningDroidReader,
} from "../src/adapters/evolve/economy/production/mining-droid.ts";
import {
  planMiningDroidAdjustments,
  planMiningDroidTargets,
} from "../src/domain/economy/production/mining-droid.ts";

const targets = planMiningDroidTargets({
  initialised: true,
  maximum: 3,
  productions: [
    {
      id: "adam",
      weighting: 1,
      priority: 1,
      demanded: false,
      useful: true,
    },
    {
      id: "uran",
      weighting: 2,
      priority: 1,
      demanded: false,
      useful: true,
    },
  ],
});
assert.deepEqual(targets, [
  { productionId: "adam", target: 1 },
  { productionId: "uran", target: 2 },
]);
assert.deepEqual(
  planMiningDroidAdjustments(targets, [
    { productionId: "adam", count: 3 },
    { productionId: "uran", count: 0 },
  ]),
  {
    adjustments: [
      { productionId: "adam", expectedCurrent: 3, delta: -2 },
      { productionId: "uran", expectedCurrent: 0, delta: 2 },
    ],
  },
);
assert.equal(
  planMiningDroidTargets({
    initialised: true,
    maximum: 1,
    productions: [
      {
        id: "adam",
        weighting: 1,
        priority: 1,
        demanded: false,
        useful: false,
      },
    ],
  }),
  null,
);

let incompleteCurrentRead = false;
let incompleteExecution = false;
assert.equal(
  runMiningDroidAutomation({
    reader: {
      readPlanningInput: () => ({
        initialised: true,
        maximum: 1,
        productions: [
          {
            id: "adam",
            weighting: 1,
            priority: 1,
            demanded: false,
            useful: false,
          },
        ],
      }),
      readCurrent: () => {
        incompleteCurrentRead = true;
        return [];
      },
    },
    executor: {
      execute: () => {
        incompleteExecution = true;
        return { status: "succeeded" };
      },
    },
  }).status,
  "succeeded",
);
assert.equal(incompleteCurrentRead, false);
assert.equal(incompleteExecution, false);

let managerAccessed = false;
assert.equal(
  createMiningDroidCommandExecutor(() => {
    managerAccessed = true;
    throw new Error("no-op executor accessed manager");
  }).execute({ adjustments: [] }).status,
  "succeeded",
);
assert.equal(managerAccessed, false);

const guardedManager = {
  initIndustry: () => false,
  get Productions() {
    throw new Error("locked reader accessed productions");
  },
};
assert.deepEqual(
  createMiningDroidReader(() => guardedManager).readPlanningInput(),
  { initialised: false, maximum: 0, productions: [] },
);

let usefulRead = false;
const zeroReader = createMiningDroidReader(() => ({
  initIndustry: () => true,
  maxOperating: () => 0,
  Productions: {
    Adamantite: {
      id: "adam",
      weighting: 1,
      priority: 1,
      resource: {
        isDemanded: () => false,
        isUseful: () => {
          usefulRead = true;
          return true;
        },
      },
    },
  },
  currentProduction: () => 0,
}));
assert.equal(zeroReader.readPlanningInput().maximum, 0);
assert.equal(usefulRead, false);
assert.deepEqual(zeroReader.readCurrent(["adam"]), [
  { productionId: "adam", count: 0 },
]);

assert.throws(
  () =>
    createMiningDroidReader(() => ({
      initIndustry: () => true,
      Productions: null,
    })).readPlanningInput(),
  /DroidManager\.Productions must be an object/,
);
assert.throws(
  () =>
    createMiningDroidReader(() => ({
      initIndustry: () => true,
      Productions: {
        First: { id: "same" },
        Second: { id: "same" },
      },
    })).readPlanningInput(),
  /duplicate id same/,
);
assert.throws(
  () =>
    createMiningDroidReader(() => ({
      initIndustry: () => true,
      Productions: { First: { id: "adam", weighting: Number.NaN } },
    })).readPlanningInput(),
  /weighting must be a finite number/,
);
assert.throws(
  () => createMiningDroidReader(() => ({})).readCurrent([]),
  /planning input must be read/,
);
assert.throws(() => zeroReader.readCurrent(["missing"]), /unknown.*missing/);
assert.throws(() => zeroReader.readCurrent(["adam", "adam"]), /duplicate/);

const invalidOutcome = createMiningDroidCommandExecutor(() => {
  throw new Error("invalid decision accessed manager");
}).execute({
  adjustments: [{ productionId: "adam", expectedCurrent: 0, delta: -1 }],
});
assert.equal(invalidOutcome.status, "rejected");
assert.equal(invalidOutcome.failure.code, "invalid-mining-droid-adjustment");
assert.equal(
  createMiningDroidCommandExecutor(() => {
    throw new Error("overflowing decision accessed manager");
  }).execute({
    adjustments: [
      {
        productionId: "adam",
        expectedCurrent: Number.MAX_SAFE_INTEGER,
        delta: 1,
      },
    ],
  }).status,
  "rejected",
);
assert.equal(
  createMiningDroidCommandExecutor(() => {
    throw new Error("duplicate decision accessed manager");
  }).execute({
    adjustments: [
      { productionId: "adam", expectedCurrent: 0, delta: 1 },
      { productionId: "adam", expectedCurrent: 0, delta: 1 },
    ],
  }).status,
  "rejected",
);

const staleActions = [];
const staleManager = {
  Productions: {
    Adamantite: { id: "adam" },
    Uranium: { id: "uran" },
  },
  currentProduction: (production) => (production.id === "adam" ? 2 : 2),
  decreaseProduction: (...args) => staleActions.push(["decrease", ...args]),
  increaseProduction: (...args) => staleActions.push(["increase", ...args]),
};
const staleOutcome = createMiningDroidCommandExecutor(
  () => staleManager,
).execute({
  adjustments: [
    { productionId: "adam", expectedCurrent: 2, delta: -1 },
    { productionId: "uran", expectedCurrent: 0, delta: 1 },
  ],
});
assert.equal(staleOutcome.status, "stale");
assert.equal(staleOutcome.failure.code, "stale-mining-droid-allocation");
assert.deepEqual(staleActions, []);

const missingOutcome = createMiningDroidCommandExecutor(() => ({
  Productions: { Adamantite: { id: "adam" } },
  currentProduction: () => 0,
  increaseProduction: () => assert.fail("stale production mutated state"),
})).execute({
  adjustments: [{ productionId: "uran", expectedCurrent: 0, delta: 1 }],
});
assert.equal(missingOutcome.status, "stale");
assert.equal(missingOutcome.failure.code, "stale-mining-droid-production");

const partialActions = [];
assert.throws(
  () =>
    createMiningDroidCommandExecutor(() => ({
      Productions: {
        Adamantite: { id: "adam" },
        Uranium: { id: "uran" },
      },
      currentProduction: () => 1,
      decreaseProduction: () => partialActions.push("decrease"),
    })).execute({
      adjustments: [
        { productionId: "adam", expectedCurrent: 1, delta: -1 },
        { productionId: "uran", expectedCurrent: 1, delta: 1 },
      ],
    }),
  /increaseProduction must be a function/,
);
assert.deepEqual(partialActions, []);

console.log("Mining-droid domain, adapter, and application tests passed");
