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
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const current = {};
  const productions = {};
  for (const definition of scenario.productions ?? []) {
    current[definition.id] = definition.current ?? 0;
    productions[definition.key ?? definition.id] = {
      id: definition.id,
      weighting: definition.weighting ?? 1,
      priority: definition.priority ?? 1,
      resource: {
        isDemanded: () => definition.demanded ?? false,
        isUseful: () => definition.useful ?? true,
      },
    };
  }
  const manager = {
    Productions: productions,
    initIndustry: () => scenario.initialised ?? true,
    maxOperating: () => scenario.maximum ?? 0,
    currentProduction: (production) => current[production.id] ?? 0,
    decreaseProduction(production, count) {
      trace.managerCall("decreaseProduction", {
        productionId: production.id,
        count,
      });
      trace.command("decrease-mining-droid", {
        productionId: production.id,
        count,
      });
      current[production.id] -= count;
      trace.stateChange("mining-droid-allocation", {
        productionId: production.id,
        count: current[production.id],
      });
    },
    increaseProduction(production, count) {
      trace.managerCall("increaseProduction", {
        productionId: production.id,
        count,
      });
      trace.command("increase-mining-droid", {
        productionId: production.id,
        count,
      });
      current[production.id] += count;
      trace.stateChange("mining-droid-allocation", {
        productionId: production.id,
        count: current[production.id],
      });
    },
  };
  return { trace, current, manager };
}

// Exact copy of the deleted factory algorithm, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const DroidManager = fixture.manager;
  if (!DroidManager.initIndustry()) {
    return { trace: fixture.trace.snapshot(), current: fixture.current };
  }

  const allProducts = Object.values(DroidManager.Productions);
  const priorityGroups = {};
  const factoryAdjustments = {};
  for (const production of allProducts) {
    if (production.weighting > 0) {
      const priority = production.resource.isDemanded()
        ? Math.max(production.priority, 100)
        : production.priority;
      if (priority !== 0) {
        priorityGroups[priority] = priorityGroups[priority] ?? [];
        priorityGroups[priority].push(production);
      }
    }
    factoryAdjustments[production.id] = 0;
  }
  const priorityList = Object.keys(priorityGroups)
    .sort((left, right) => right - left)
    .map((key) => priorityGroups[key]);
  if (priorityGroups["-1"] && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
    priorityList[0].push(...priorityGroups["-1"]);
  }

  let remainingFactories = DroidManager.maxOperating();
  for (
    let groupIndex = 0;
    groupIndex < priorityList.length && remainingFactories > 0;
    groupIndex++
  ) {
    const products = priorityList[groupIndex].sort(
      (left, right) => left.weighting - right.weighting,
    );
    while (remainingFactories > 0) {
      const factoriesToDistribute = remainingFactories;
      const totalPriorityWeight = products.reduce(
        (sum, production) => sum + production.weighting,
        0,
      );
      for (
        let index = products.length - 1;
        index >= 0 && remainingFactories > 0;
        index--
      ) {
        const production = products[index];
        const calculatedRequiredFactories = Math.min(
          remainingFactories,
          Math.max(
            1,
            Math.floor(
              (factoriesToDistribute / totalPriorityWeight) *
                production.weighting,
            ),
          ),
        );
        const actualRequiredFactories = production.resource.isUseful()
          ? calculatedRequiredFactories
          : 0;
        if (actualRequiredFactories > 0) {
          remainingFactories -= actualRequiredFactories;
          factoryAdjustments[production.id] += actualRequiredFactories;
        }
        if (actualRequiredFactories < calculatedRequiredFactories) {
          products.splice(index, 1);
        }
      }
      if (factoriesToDistribute === remainingFactories) {
        break;
      }
    }
  }
  if (remainingFactories > 0) {
    return { trace: fixture.trace.snapshot(), current: fixture.current };
  }

  for (const production of allProducts) {
    const delta =
      factoryAdjustments[production.id] -
      DroidManager.currentProduction(production);
    if (delta < 0) {
      DroidManager.decreaseProduction(production, delta * -1);
    }
  }
  for (const production of allProducts) {
    const delta =
      factoryAdjustments[production.id] -
      DroidManager.currentProduction(production);
    if (delta > 0) {
      DroidManager.increaseProduction(production, delta);
    }
  }
  return { trace: fixture.trace.snapshot(), current: fixture.current };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const outcome = runMiningDroidAutomation({
    reader: createMiningDroidReader(() => fixture.manager),
    executor: createMiningDroidCommandExecutor(() => fixture.manager),
  });
  assert.equal(outcome.status, "succeeded");
  return { trace: fixture.trace.snapshot(), current: fixture.current };
}

const parityScenarios = [
  {
    name: "uninitialised industry is inert",
    initialised: false,
    maximum: 3,
    productions: [{ id: "adam", current: 3 }],
  },
  {
    name: "zero capacity drains every current allocation",
    maximum: 0,
    productions: [
      { id: "adam", current: 2 },
      { id: "uran", current: 1 },
    ],
  },
  {
    name: "one group is split proportionally with the legacy remainder pass",
    maximum: 4,
    productions: [
      { id: "adam", weighting: 1, current: 4 },
      { id: "uran", weighting: 2, current: 0 },
    ],
  },
  {
    name: "demand raises a zero priority to one hundred",
    maximum: 2,
    productions: [
      { id: "adam", priority: 0, demanded: true, current: 0 },
      { id: "uran", priority: 0, current: 2 },
    ],
  },
  {
    name: "supplementary priority joins the current highest group",
    maximum: 4,
    productions: [
      { id: "adam", priority: 10, current: 0 },
      { id: "uran", priority: -1, current: 0 },
      { id: "coal", priority: 5, current: 4 },
    ],
  },
  {
    name: "supplementary priority preserves the legacy below-minus-one edge",
    maximum: 3,
    productions: [
      { id: "adam", priority: -1, current: 0 },
      { id: "uran", priority: -2, current: 3 },
    ],
  },
  {
    name: "an unusable high priority falls back to the next group",
    maximum: 3,
    productions: [
      { id: "adam", priority: 10, useful: false, current: 3 },
      { id: "uran", priority: 5, current: 0 },
    ],
  },
  {
    name: "an unusable weighted peer is removed and its share redistributed",
    maximum: 4,
    productions: [
      { id: "adam", weighting: 1, useful: false, current: 1 },
      { id: "uran", weighting: 3, current: 3 },
    ],
  },
  {
    name: "an incomplete allocation preserves all existing assignments",
    maximum: 5,
    productions: [
      { id: "adam", useful: false, current: 2 },
      { id: "uran", weighting: 0, current: 3 },
    ],
  },
  {
    name: "priority above one hundred outranks a demanded production",
    maximum: 3,
    productions: [
      { id: "adam", priority: 150, current: 0 },
      { id: "uran", priority: 10, demanded: true, current: 3 },
    ],
  },
  {
    name: "all decreases precede all increases in production order",
    maximum: 6,
    productions: [
      { id: "adam", weighting: 3, current: 0 },
      { id: "uran", weighting: 1, current: 4 },
      { id: "coal", weighting: 2, current: 2 },
    ],
  },
  {
    name: "disabled weight remains at zero while active fractional weights allocate",
    maximum: 3,
    productions: [
      { id: "adam", weighting: -1, current: 1 },
      { id: "uran", weighting: 0.5, current: 0 },
      { id: "coal", weighting: 1.5, current: 2 },
    ],
  },
];

for (const scenario of parityScenarios) {
  const legacy = runLegacy(scenario);
  const modern = runModern(scenario);
  assertEquivalentTraces({
    legacy: legacy.trace,
    modern: modern.trace,
    label: `mining-droid parity: ${scenario.name}`,
  });
  assert.deepEqual(modern.current, legacy.current, scenario.name);
}

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

console.log(
  "Mining-droid domain, adapter, application, and parity tests passed",
);
