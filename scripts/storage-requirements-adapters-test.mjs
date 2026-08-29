import assert from "node:assert/strict";

import { readStorageRequirementsInput } from "../src/adapters/evolve/economy/storage/storage-requirements.ts";

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

// A technology short of a non-Knowledge resource is not waiting on Knowledge
// capacity, so it is excluded from the cheapest-Knowledge figure while a
// technology whose other costs are covered is kept.
input = readStorageRequirementsInput(
  deps({
    getState: () => ({
      unlockedTechs: [
        { cost: { Knowledge: 50, Money: 30000 } },
        { cost: { Knowledge: 900 } },
      ],
      queuedTargetsAll: [],
      triggerTargets: [],
    }),
    getResources: () => ({
      Knowledge: { ...resource(100), currentQuantity: 100 },
      Money: { ...resource(1), currentQuantity: 12 },
    }),
  }),
);
assert.deepEqual(
  input.knowledge.techKnowledgeCosts.map((tech) => [
    tech.knowledgeCost,
    tech.otherCostsAffordable,
  ]),
  [
    [50, false],
    [900, true],
  ],
);

// A cost naming a resource with no wrapper stays lenient.
input = readStorageRequirementsInput(
  deps({
    getState: () => ({
      unlockedTechs: [{ cost: { Knowledge: 10, Unobtainium: 5 } }],
      queuedTargetsAll: [],
      triggerTargets: [],
    }),
  }),
);
assert.equal(input.knowledge.techKnowledgeCosts[0].otherCostsAffordable, true);

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
assert.equal(input.knowledge.techKnowledgeCosts[0].knowledgeCost, 0);
assert.equal(input.knowledge.buildCandidates[0].autoBuildable, false);
assert.equal(input.knowledge.buildCandidates[0].weighting, 3);

// One walk over the priority lists: the request-list filter and the Knowledge
// candidate's autoBuildable share the unlocked/enabled answer, and an entry
// that fails it is never asked isAutoBuildable().
const autoBuildableCalls = [];
const target = (id, unlocked, enabled) => ({
  cost: { Iron: 5 },
  weighting: 1,
  isUnlocked: () => unlocked,
  autoBuildEnabled: enabled,
  isAutoBuildable: () => {
    autoBuildableCalls.push(id);
    return true;
  },
});
input = readStorageRequirementsInput(
  deps({
    getBuildingManager: () => ({
      priorityList: [
        target("locked", false, true),
        target("disabled", true, false),
        target("buildable", true, true),
      ],
    }),
  }),
);
assert.deepEqual(autoBuildableCalls, ["buildable"]);
assert.deepEqual(
  input.knowledge.buildCandidates.map((candidate) => candidate.autoBuildable),
  [false, false, true],
);
assert.equal(input.requestLists[3].length, 1); // only the buildable one is requested

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
