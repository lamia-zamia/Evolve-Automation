import assert from "node:assert/strict";

import { runConsumeAutomation } from "../src/application/consume.ts";
import {
  createConsumeCommandExecutor,
  createConsumeReader,
} from "../src/adapters/evolve/consume.ts";
import {
  calculateConsumeKeepRatio,
  planConsume,
} from "../src/domain/consume.ts";

function createFixture(scenario) {
  const actions = [];
  const current = { ...(scenario.current ?? {}) };
  const resources = {};
  const list = (scenario.resources ?? []).map((definition) => {
    const resource = {
      id: definition.id,
      storageRatio: definition.storageRatio ?? 0,
      storageRequired: definition.storageRequired ?? 0,
      requestedQuantity: definition.requestedQuantity ?? 0,
      maxQuantity: definition.maxQuantity ?? 100,
      currentQuantity: definition.currentQuantity ?? 0,
      isDemanded: () => definition.demanded ?? false,
      isCraftable: () => definition.craftable ?? false,
      craftMaximum: definition.craftMaximum ?? 0,
      ratioMaximum: definition.ratioMaximum ?? 0,
    };
    resources[definition.id] = resource;
    return resource;
  });
  if (!("Food" in resources)) {
    resources.Food = { id: "Food" };
  }
  const enabled = new Set(
    (scenario.resources ?? [])
      .filter((resource) => resource.enabled !== false)
      .map((resource) => resource.id),
  );
  const manager = {
    storageShift: scenario.storageShift ?? 1,
    initIndustry: () => scenario.initialised,
    managedPriorityList: () => list,
    isUseful: () => scenario.useful,
    maxConsume: () => scenario.maximum ?? 0,
    useRatio: () => scenario.ratios ?? [],
    resEnabled: (id) => enabled.has(id),
    maxConsumeCraftable: (resource) => resource.craftMaximum,
    maxConsumeForRatio: (resource, keepRatio) =>
      typeof resource.ratioMaximum === "function"
        ? resource.ratioMaximum(keepRatio)
        : resource.ratioMaximum,
    currentConsume: (id) => current[id] ?? 0,
    consumeLess(id, count) {
      actions.push(["less", id, count]);
      current[id] = (current[id] ?? 0) - count;
    },
    consumeMore(id, count) {
      actions.push(["more", id, count]);
      current[id] = (current[id] ?? 0) + count;
    },
  };
  return { actions, current, resources, manager };
}

// Exact copy of the deleted factory algorithm, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const m = fixture.manager;
  if (m.initIndustry()) {
    const consumeList = m.managedPriorityList();
    const consumeAdjustments = Object.fromEntries(
      consumeList.map((resource) => [resource.id, 0]),
    );
    if (m.isUseful()) {
      let remaining = m.maxConsume();
      for (const consumeRatio of m.useRatio()) {
        for (const resource of consumeList) {
          if (remaining <= 0) break;
          if (!m.resEnabled(resource.id) || resource.isDemanded()) continue;
          let keepRatio = consumeRatio;
          if (keepRatio === -1) {
            if (resource.storageRequired <= 1) continue;
            keepRatio = Math.max(
              keepRatio,
              (resource.storageRequired / resource.maxQuantity) *
                m.storageShift,
            );
          }
          if (resource === fixture.resources.Food && !scenario.hungryRace) {
            keepRatio = Math.max(keepRatio, 0.25);
          }
          keepRatio = Math.max(
            keepRatio,
            (resource.requestedQuantity / resource.maxQuantity) *
              m.storageShift,
          );
          let allowedConsume = consumeAdjustments[resource.id];
          remaining += consumeAdjustments[resource.id];
          if (resource.isCraftable()) {
            if (
              resource.currentQuantity >
              resource.storageRequired * m.storageShift
            ) {
              const maxConsume = Math.floor(m.maxConsumeCraftable(resource));
              allowedConsume = Math.max(0, allowedConsume, maxConsume);
            }
          } else if (resource.storageRatio > keepRatio + 0.01) {
            const maxConsume = Math.ceil(
              m.maxConsumeForRatio(resource, keepRatio),
            );
            allowedConsume = Math.max(1, allowedConsume, maxConsume);
          } else if (resource.storageRatio > keepRatio) {
            const maxConsume = Math.floor(
              m.maxConsumeForRatio(resource, keepRatio),
            );
            allowedConsume = Math.max(0, allowedConsume, maxConsume);
          } else if (resource.storageRatio >= 0.999 && keepRatio >= 1) {
            const maxConsume = Math.floor(
              m.maxConsumeForRatio(resource, resource.storageRatio),
            );
            allowedConsume = Math.max(0, allowedConsume, maxConsume);
          }
          consumeAdjustments[resource.id] = Math.min(remaining, allowedConsume);
          remaining -= consumeAdjustments[resource.id];
        }
      }
    }
    Object.keys(consumeAdjustments).forEach(
      (id) => (consumeAdjustments[id] -= m.currentConsume(id)),
    );
    Object.entries(consumeAdjustments).forEach(
      ([id, delta]) => delta < 0 && m.consumeLess(id, delta * -1),
    );
    Object.entries(consumeAdjustments).forEach(
      ([id, delta]) => delta > 0 && m.consumeMore(id, delta),
    );
  }
  return { actions: fixture.actions, current: fixture.current };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const outcome = runConsumeAutomation({
    reader: createConsumeReader({
      getManager: () => fixture.manager,
      getResources: () => fixture.resources,
      isHungryRace: () => scenario.hungryRace ?? false,
    }),
    executor: createConsumeCommandExecutor(() => fixture.manager),
  });
  assert.equal(outcome.status, "succeeded");
  return { actions: fixture.actions, current: fixture.current };
}

const parityScenarios = [
  { name: "uninitialised manager short-circuits", initialised: false },
  {
    name: "not useful removes existing allocations",
    initialised: true,
    useful: false,
    current: { Iron: 2 },
    resources: [{ id: "Iron" }],
  },
  {
    name: "storage above ratio plus margin uses ceiling and minimum one",
    initialised: true,
    useful: true,
    maximum: 5,
    ratios: [0.5],
    resources: [{ id: "Iron", storageRatio: 0.8, ratioMaximum: 2.2 }],
  },
  {
    name: "storage just above ratio uses floor",
    initialised: true,
    useful: true,
    maximum: 5,
    ratios: [0.5],
    resources: [{ id: "Iron", storageRatio: 0.505, ratioMaximum: 2.9 }],
  },
  {
    name: "full storage with keep ratio one uses capped branch",
    initialised: true,
    useful: true,
    maximum: 5,
    ratios: [1],
    resources: [
      {
        id: "Iron",
        storageRatio: 0.999,
        ratioMaximum: (queryRatio) => queryRatio * 4,
      },
    ],
  },
  {
    name: "craftable excess uses craftable capacity",
    initialised: true,
    useful: true,
    maximum: 6,
    ratios: [0.5],
    storageShift: 1,
    resources: [
      {
        id: "Alloy",
        craftable: true,
        currentQuantity: 90,
        storageRequired: 50,
        craftMaximum: 4.8,
      },
    ],
  },
  {
    name: "excess mode skips resources without a requirement",
    initialised: true,
    useful: true,
    maximum: 5,
    ratios: [-1],
    current: { Iron: 2 },
    resources: [
      { id: "Iron", storageRequired: 1, storageRatio: 1, ratioMaximum: 5 },
    ],
  },
  {
    name: "non-hungry races preserve one quarter Food",
    initialised: true,
    useful: true,
    maximum: 5,
    ratios: [0.1],
    hungryRace: false,
    current: { Food: 1 },
    resources: [{ id: "Food", storageRatio: 0.2, ratioMaximum: 4 }],
  },
  {
    name: "requested storage raises the keep ratio",
    initialised: true,
    useful: true,
    maximum: 5,
    ratios: [0.1],
    storageShift: 1.1,
    resources: [
      {
        id: "Iron",
        requestedQuantity: 60,
        maxQuantity: 100,
        storageRatio: 0.5,
        ratioMaximum: 4,
      },
    ],
  },
  {
    name: "disabled and demanded resources are zeroed",
    initialised: true,
    useful: true,
    maximum: 8,
    ratios: [0.2],
    current: { Disabled: 2, Demanded: 3 },
    resources: [
      { id: "Disabled", enabled: false, storageRatio: 1, ratioMaximum: 8 },
      { id: "Demanded", demanded: true, storageRatio: 1, ratioMaximum: 8 },
    ],
  },
  {
    name: "all decreases precede all increases in resource order",
    initialised: true,
    useful: true,
    maximum: 3,
    ratios: [0.2],
    current: { A: 2, B: 0 },
    resources: [
      { id: "A", storageRatio: 0, ratioMaximum: 0 },
      { id: "B", storageRatio: 1, ratioMaximum: 3 },
    ],
  },
];

for (const scenario of parityScenarios) {
  assert.deepEqual(runModern(scenario), runLegacy(scenario), scenario.name);
}

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

console.log("Consume automation dual-run and adapter tests passed");
