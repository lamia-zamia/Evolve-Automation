import assert from "node:assert/strict";

import { readStorageRequirementsInput } from "../src/adapters/evolve/storage-requirements.ts";

function resource(maxQuantity, extra = {}) {
  return {
    maxQuantity,
    maxCost: 0,
    storageRequired: 1,
    autoSellEnabled: false,
    autoSellRatio: 0,
    hasStorage: () => false,
    ...extra,
  };
}

function deps(overrides = {}) {
  return {
    getSettings: () => ({
      storageAssignExtra: true,
      fleetEmbassyKnowledge: 300,
      autoFleet: true,
      prioritizeOuterFleet: "req",
      autoMarket: true,
    }),
    getState: () => ({
      unlockedTechs: [{ cost: { Knowledge: 100 } }],
      queuedTargetsAll: [{ cost: { Iron: 30 } }],
      triggerTargets: [],
    }),
    getResources: () => ({
      Knowledge: resource(100),
      Iron: resource(1000),
      Money: resource(1),
      Graphene: resource(1),
    }),
    getBuildings: () => ({ GorddonEmbassy: { isAutoBuildable: () => false } }),
    getGame: () => ({ global: { race: {} } }),
    getBuildingManager: () => ({ priorityList: [] }),
    getProjectManager: () => ({ priorityList: [] }),
    getFleetManagerOuter: () => ({
      nextShipExpandable: true,
      nextShipCost: { Iron: 500 },
    }),
    isTechnology: () => false,
    isInflationAssistActive: () => false,
    isRetirementAssistActive: () => false,
    getInflationChallengeMoney: () => 1,
    getRetirementGraphene: () => 1,
    ...overrides,
  };
}

// Valid mapping: fleet list is first when active; resources and flags mapped.
let input = readStorageRequirementsInput(deps());
assert.equal(input.storageAssignExtra, true);
assert.equal(input.autoMarket, true);
assert.equal(input.noTrade, false);
assert.equal(input.inflationMoney, null);
assert.equal(input.retirementGraphene, null);
assert.equal(input.requestLists.length, 5); // fleet, techs, queued, buildings, projects
assert.deepEqual(input.requestLists[0], [
  { costs: [{ resourceId: "Iron", amount: 500 }] },
]);
assert.equal(input.resources.length, 4);
assert.ok(Object.isFrozen(input));

// Fleet gate: no fleet request list when disabled.
input = readStorageRequirementsInput(
  deps({
    getSettings: () => ({
      storageAssignExtra: true,
      fleetEmbassyKnowledge: 300,
      autoFleet: false,
      prioritizeOuterFleet: "req",
      autoMarket: true,
    }),
  }),
);
assert.equal(input.requestLists.length, 4);

// Assists active surface their reserves.
input = readStorageRequirementsInput(
  deps({
    isInflationAssistActive: () => true,
    isRetirementAssistActive: () => true,
    getInflationChallengeMoney: () => 42,
    getRetirementGraphene: () => 7,
  }),
);
assert.equal(input.inflationMoney, 42);
assert.equal(input.retirementGraphene, 7);

// Lenient optional reads: absent cost -> empty costs; absent Knowledge -> 0;
// isAutoBuildable absent -> not counted.
input = readStorageRequirementsInput(
  deps({
    getState: () => ({
      unlockedTechs: [{}], // no cost
      queuedTargetsAll: [],
      triggerTargets: [],
    }),
    getBuildingManager: () => ({
      priorityList: [{ cost: { Iron: 5 }, weighting: 3 }], // no isAutoBuildable
    }),
  }),
);
assert.deepEqual(input.requestLists[1], [{ costs: [] }]); // techs list, empty costs
assert.equal(input.knowledge.techKnowledgeCosts[0], 0);
assert.equal(input.knowledge.buildCandidates[0].autoBuildable, false);
assert.equal(input.knowledge.buildCandidates[0].weighting, 3);

// no_trade flag from race.
input = readStorageRequirementsInput(
  deps({ getGame: () => ({ global: { race: { no_trade: 1 } } }) }),
);
assert.equal(input.noTrade, true);

// Regression: non-market resources (RNA, DNA, ...) expose undefined market
// getters. The reader must not throw and must normalize them to false / 0.
input = readStorageRequirementsInput(
  deps({
    getResources: () => ({
      RNA: {
        maxQuantity: 100,
        maxCost: 0,
        storageRequired: 1,
        hasStorage: () => false,
        // no autoSellEnabled / autoSellRatio getters
      },
      Iron: resource(1000, { autoSellEnabled: true, autoSellRatio: 0.5 }),
      Money: resource(1),
      Graphene: resource(1),
    }),
  }),
);
const rna = input.resources.find((r) => r.id === "RNA");
assert.equal(rna.autoSellEnabled, false);
assert.equal(rna.autoSellRatio, 0);
const iron = input.resources.find((r) => r.id === "Iron");
assert.equal(iron.autoSellEnabled, true);
assert.equal(iron.autoSellRatio, 0.5);

// Regression: Troops (and garrison/fortress support pseudo-resources) derive
// maxQuantity from lazily-initialized game fields (fortress.garrison), so it can be
// NaN. Legacy tolerated it; the reader must pass a non-finite number through instead
// of throwing. These resources never appear as a cost, so the planner never compares
// their maxQuantity.
input = readStorageRequirementsInput(
  deps({
    getResources: () => ({
      Troops: resource(NaN),
      Iron: resource(1000),
      Money: resource(1),
      Graphene: resource(1),
    }),
  }),
);
const troops = input.resources.find((r) => r.id === "Troops");
assert.ok(Number.isNaN(troops.maxQuantity));

// Malformed boundaries throw.
assert.throws(() =>
  readStorageRequirementsInput(
    deps({ getState: () => ({ unlockedTechs: "nope" }) }),
  ),
);
assert.throws(() =>
  readStorageRequirementsInput(
    deps({
      getResources: () => ({ Iron: { maxQuantity: 10 } }), // missing fields
    }),
  ),
);

console.log("Storage requirements adapter contract tests passed");
