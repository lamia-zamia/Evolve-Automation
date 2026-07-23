import assert from "node:assert/strict";

import {
  createConsumeCommandExecutor,
  createConsumeReader,
} from "../src/adapters/evolve/economy/resources/consume.ts";
import {
  calculateConsumeKeepRatio,
  planConsume,
} from "../src/domain/economy/resources/consume.ts";

assert.equal(
  calculateConsumeKeepRatio(
    -1,
    {
      storageRequired: 1,
      requestedQuantity: 0,
      maxQuantity: 100,
      isFood: false,
    },
    1,
    false,
  ),
  null,
);
assert.equal(
  calculateConsumeKeepRatio(
    0.1,
    {
      storageRequired: 10,
      requestedQuantity: 0,
      maxQuantity: 100,
      isFood: true,
    },
    1,
    false,
  ),
  0.25,
);
assert.deepEqual(
  planConsume({
    initialised: false,
    useful: false,
    maximum: 0,
    storageShift: 0,
    hungryRace: false,
    ratios: [],
    resources: [],
    current: [],
  }),
  { adjustments: [] },
);

let lockedListRead = false;
const lockedInput = createConsumeReader({
  getManager: () => ({
    initIndustry: () => false,
    get managedPriorityList() {
      lockedListRead = true;
      throw new Error("irrelevant managed-list read");
    },
  }),
  getResources: () => {
    throw new Error("irrelevant resource read");
  },
  isHungryRace: () => {
    throw new Error("irrelevant hunger read");
  },
}).read();
assert.equal(lockedInput.initialised, false);
assert.equal(lockedListRead, false);

let unusedResourceRead = false;
const unusedResource = {
  id: "Iron",
  get isDemanded() {
    unusedResourceRead = true;
    throw new Error("irrelevant resource detail read");
  },
};
const unusedInput = createConsumeReader({
  getManager: () => ({
    initIndustry: () => true,
    managedPriorityList: () => [unusedResource],
    isUseful: () => false,
    currentConsume: () => 0,
  }),
  getResources: () => {
    throw new Error("irrelevant resources read");
  },
  isHungryRace: () => false,
}).read();
assert.equal(unusedInput.useful, false);
assert.equal(unusedResourceRead, false);

let disabledDemandRead = false;
createConsumeReader({
  getManager: () => ({
    storageShift: 1,
    initIndustry: () => true,
    managedPriorityList: () => [
      {
        id: "Disabled",
        get isDemanded() {
          disabledDemandRead = true;
          throw new Error("disabled demand read");
        },
      },
    ],
    isUseful: () => true,
    maxConsume: () => 1,
    useRatio: () => [0.5],
    resEnabled: () => false,
    currentConsume: () => 0,
  }),
  getResources: () => ({ Food: {} }),
  isHungryRace: () => false,
}).read();
assert.equal(disabledDemandRead, false);

assert.throws(
  () =>
    createConsumeReader({
      getManager: () => ({
        initIndustry: () => true,
        managedPriorityList: () => null,
        isUseful: () => false,
      }),
      getResources: () => ({}),
      isHungryRace: () => false,
    }).read(),
  /managedPriorityList\(\) must return an array/,
);

const staleActions = [];
const staleExecutor = createConsumeCommandExecutor(() => ({
  currentConsume: (id) => (id === "A" ? 2 : 1),
  consumeLess: (...args) => staleActions.push(["less", ...args]),
  consumeMore: (...args) => staleActions.push(["more", ...args]),
}));
const staleOutcome = staleExecutor.execute({
  adjustments: [
    { resourceId: "A", expectedCurrent: 2, delta: -1 },
    { resourceId: "B", expectedCurrent: 0, delta: 1 },
  ],
});
assert.equal(staleOutcome.status, "stale");
assert.deepEqual(staleActions, [], "all allocations preflight before mutation");

let noOpManagerRead = false;
const noOpOutcome = createConsumeCommandExecutor(() => {
  noOpManagerRead = true;
  throw new Error("zero decision touched manager");
}).execute({
  adjustments: [{ resourceId: "A", expectedCurrent: 0, delta: 0 }],
});
assert.equal(noOpOutcome.status, "succeeded");
assert.equal(noOpManagerRead, false);

console.log("Consume automation adapter and regression tests passed");
