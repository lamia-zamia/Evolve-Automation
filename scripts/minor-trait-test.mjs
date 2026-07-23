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

function createFixture(scenario) {
  const trace = [];
  const resources = {
    Genes: { currentQuantity: scenario.genes ?? 0 },
  };
  const costCalls = new Map();
  const traits = (scenario.traits ?? []).map((definition) => ({
    traitName: definition.traitName,
    weighting: definition.weighting,
    geneCost() {
      const call = (costCalls.get(definition.traitName) ?? 0) + 1;
      costCalls.set(definition.traitName, call);
      const cost =
        typeof definition.cost === "function"
          ? definition.cost({
              call,
              genes: resources.Genes.currentQuantity,
            })
          : definition.cost;
      trace.push(["cost", definition.traitName, cost]);
      return cost;
    },
  }));
  const manager = {
    isUnlocked: () => scenario.unlocked,
    managedPriorityList: () => traits,
    buyTrait: (traitName) => trace.push(["buy", traitName]),
  };
  return { trace, resources, manager };
}

// Exact copy of the deleted factory algorithm, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const m = fixture.manager;
  if (m.isUnlocked()) {
    const traitList = m.managedPriorityList();
    if (traitList.length > 0) {
      let totalWeighting = 0;
      let totalGeneCost = 0;
      traitList.forEach((trait) => {
        totalWeighting += trait.weighting;
        totalGeneCost += trait.geneCost();
      });
      traitList.forEach((trait) => {
        const traitCost = trait.geneCost();
        if (
          trait.weighting / totalWeighting >= traitCost / totalGeneCost &&
          fixture.resources.Genes.currentQuantity >= traitCost
        ) {
          m.buyTrait(trait.traitName);
          fixture.resources.Genes.currentQuantity -= traitCost;
        }
      });
    }
  }
  return {
    trace: fixture.trace,
    genes: fixture.resources.Genes.currentQuantity,
  };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const outcome = runMinorTraitAutomation({
    reader: createMinorTraitReader({
      getMinorTraitManager: () => fixture.manager,
      getResources: () => fixture.resources,
    }),
    executor: createMinorTraitCommandExecutor({
      getMinorTraitManager: () => fixture.manager,
      getResources: () => fixture.resources,
    }),
  });
  assert.equal(outcome.status, "succeeded");
  return {
    trace: fixture.trace,
    genes: fixture.resources.Genes.currentQuantity,
  };
}

const parityScenarios = [
  { name: "locked manager short-circuits", unlocked: false, genes: 20 },
  { name: "empty managed list short-circuits", unlocked: true, genes: 20 },
  {
    name: "one affordable weighted trait is purchased",
    unlocked: true,
    genes: 10,
    traits: [{ traitName: "smart", weighting: 1, cost: 5 }],
  },
  {
    name: "cost share can skip a low-weight expensive trait",
    unlocked: true,
    genes: 20,
    traits: [
      { traitName: "expensive", weighting: 1, cost: 9 },
      { traitName: "cheap", weighting: 1, cost: 1 },
    ],
  },
  {
    name: "insufficient Genes prevents an otherwise weighted purchase",
    unlocked: true,
    genes: 4,
    traits: [{ traitName: "smart", weighting: 1, cost: 5 }],
  },
  {
    name: "second-pass costs observe earlier Genes deductions",
    unlocked: true,
    genes: 10,
    traits: [
      {
        traitName: "first",
        weighting: 1,
        cost: ({ genes }) => (genes >= 10 ? 5 : 3),
      },
      {
        traitName: "second",
        weighting: 1,
        cost: ({ genes }) => (genes >= 10 ? 5 : 3),
      },
    ],
  },
  {
    name: "earlier purchase can leave too few Genes for a later trait",
    unlocked: true,
    genes: 10,
    traits: [
      { traitName: "first", weighting: 1, cost: 6 },
      { traitName: "second", weighting: 1, cost: 6 },
    ],
  },
  {
    name: "zero totals retain the legacy NaN no-purchase behavior",
    unlocked: true,
    genes: 10,
    traits: [{ traitName: "zero", weighting: 0, cost: 0 }],
  },
];

for (const scenario of parityScenarios) {
  assert.deepEqual(runModern(scenario), runLegacy(scenario), scenario.name);
}

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

console.log("Minor-trait automation dual-run and adapter tests passed");
