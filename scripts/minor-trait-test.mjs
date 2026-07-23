import assert from "node:assert/strict";

import { runMinorTraitAutomation } from "../src/application/minor-trait.ts";
import {
  createMinorTraitCommandExecutor,
  createMinorTraitReader,
} from "../src/adapters/evolve/traits/minor-trait.ts";
import {
  planMinorTraitPurchase,
  summarizeMinorTraits,
} from "../src/domain/traits/minor-trait.ts";

const summary = summarizeMinorTraits({
  unlocked: true,
  traits: [
    { index: 0, traitName: "a", weighting: 3, initialGeneCost: 4 },
    { index: 1, traitName: "b", weighting: 1, initialGeneCost: 2 },
  ],
});
assert.deepEqual(summary, {
  traits: [
    { index: 0, traitName: "a", weighting: 3, initialGeneCost: 4 },
    { index: 1, traitName: "b", weighting: 1, initialGeneCost: 2 },
  ],
  totalWeighting: 4,
  totalGeneCost: 6,
});
assert.deepEqual(
  planMinorTraitPurchase(summary, {
    index: 0,
    traitName: "a",
    geneCost: 4,
    currentGenes: 5,
  }),
  { traitName: "a", geneCost: 4, expectedGenes: 5 },
);
assert.equal(
  planMinorTraitPurchase(summary, {
    index: 1,
    traitName: "b",
    geneCost: 5,
    currentGenes: 10,
  }),
  null,
);

let lockedListRead = false;
const lockedInput = createMinorTraitReader({
  getMinorTraitManager: () => ({
    isUnlocked: () => false,
    get managedPriorityList() {
      lockedListRead = true;
      throw new Error("irrelevant list read");
    },
  }),
  getResources: () => {
    throw new Error("irrelevant resource read");
  },
}).readSummary();
assert.deepEqual(lockedInput, { unlocked: false, traits: [] });
assert.equal(lockedListRead, false);

assert.throws(
  () =>
    createMinorTraitReader({
      getMinorTraitManager: () => ({
        isUnlocked: () => true,
        managedPriorityList: () => null,
      }),
      getResources: () => ({}),
    }).readSummary(),
  /MinorTraitManager\.managedPriorityList\(\) must return an array/,
);
assert.throws(
  () =>
    createMinorTraitReader({
      getMinorTraitManager: () => ({
        isUnlocked: () => true,
        managedPriorityList: () => [
          { traitName: 7, weighting: 1, geneCost: () => 1 },
        ],
      }),
      getResources: () => ({}),
    }).readSummary(),
  /traitName must be a string/,
);
assert.throws(
  () =>
    createMinorTraitReader({
      getMinorTraitManager: () => ({
        isUnlocked: () => true,
        managedPriorityList: () => [
          { traitName: "bad", weighting: 1, geneCost: () => -1 },
        ],
      }),
      getResources: () => ({}),
    }).readSummary(),
  /geneCost\(\) must be non-negative/,
);

let reorderedBuys = 0;
const reorderedOutcome = runMinorTraitAutomation({
  reader: {
    readSummary: () => ({
      unlocked: true,
      traits: [
        {
          index: 0,
          traitName: "sampled",
          weighting: 1,
          initialGeneCost: 1,
        },
      ],
    }),
    readCandidate: () => ({
      index: 0,
      traitName: "replacement",
      geneCost: 1,
      currentGenes: 10,
    }),
  },
  executor: {
    execute: () => {
      reorderedBuys++;
      return { status: "succeeded" };
    },
  },
});
assert.equal(reorderedOutcome.status, "stale");
assert.equal(reorderedBuys, 0, "changed candidate order performs no purchase");

const staleResources = { Genes: { currentQuantity: 4 } };
let staleBuys = 0;
const staleOutcome = createMinorTraitCommandExecutor({
  getMinorTraitManager: () => ({ buyTrait: () => staleBuys++ }),
  getResources: () => staleResources,
}).execute({ traitName: "smart", geneCost: 3, expectedGenes: 5 });
assert.equal(staleOutcome.status, "stale");
assert.equal(staleBuys, 0);
assert.equal(staleResources.Genes.currentQuantity, 4);

const malformedResources = { Genes: { currentQuantity: 5 } };
assert.throws(
  () =>
    createMinorTraitCommandExecutor({
      getMinorTraitManager: () => ({}),
      getResources: () => malformedResources,
    }).execute({ traitName: "smart", geneCost: 3, expectedGenes: 5 }),
  /MinorTraitManager\.buyTrait must be a function/,
);
assert.equal(
  malformedResources.Genes.currentQuantity,
  5,
  "manager contract is validated before the Genes model write",
);

console.log("Minor-trait automation adapter and regression tests passed");
