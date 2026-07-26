import assert from "node:assert/strict";

import { createReplicatorGovernorOffice } from "../src/adapters/browser/replicator-governor.ts";
import {
  createReplicatorGovernorGameReader,
  createReplicatorSelectionExecutor,
  createReplicatorSelectionReader,
} from "../src/adapters/evolve/economy/production/replicator.ts";
import {
  planReplicatorGovernorSettings,
  planReplicatorGovernorTask,
  planReplicatorPriority,
  planReplicatorSelection,
} from "../src/domain/economy/production/replicator.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

function resolveVueMethod(view, methodName) {
  const method = view?.[methodName];
  if (typeof method !== "function") {
    throw new TypeError(`${methodName} must be a function`);
  }
  return (...args) => method(...args);
}

function createGovernorConfig(definition, trace) {
  if (definition === null) return null;
  const state = {
    on: definition?.powerOn ?? false,
    cap: definition?.powerCap ?? 10_000,
    que: definition?.focusQueue ?? true,
    neg: definition?.focusNegative ?? true,
    resCap: definition?.switchOnCap ?? true,
  };
  const power = {};
  const resource = {};
  for (const [object, key, stateKey] of [
    [power, "on", "on"],
    [power, "cap", "cap"],
    [resource, "que", "que"],
    [resource, "neg", "neg"],
    [resource, "cap", "resCap"],
  ]) {
    Object.defineProperty(object, key, {
      enumerable: true,
      get: () => state[stateKey],
      set(value) {
        state[stateKey] = value;
        trace.stateChange(`governor.${key}`, { value });
      },
    });
  }
  return { value: { pow: power, res: resource }, state };
}

function createFixture(scenario) {
  const trace = createTraceRecorder();
  const resources = {};
  const productions = {};
  for (const definition of scenario.productions ?? []) {
    const resource = {
      id: definition.id,
      currentQuantity: definition.currentQuantity ?? 10,
      atomicMass: definition.atomicMass ?? 1,
      isDemanded: () => definition.demanded ?? false,
      isUseful: () => definition.useful ?? true,
    };
    resources[definition.id] = resource;
    productions[definition.key ?? definition.id] = {
      id: definition.id,
      unlocked: definition.unlocked ?? true,
      enabled: definition.enabled ?? true,
      weighting: definition.weighting ?? 1,
      priority: definition.priority ?? 1,
      resource,
    };
  }

  let selectedResource = scenario.selectedResource ?? null;
  const manager = {
    Productions: productions,
    initIndustry: () => scenario.initialised ?? true,
    setResource(id) {
      trace.managerCall("setResource", { productionId: id });
      trace.command("select-replicator-resource", { productionId: id });
      selectedResource = id;
      trace.stateChange("replicator.resource", { productionId: id });
    },
  };
  const tasks = Object.fromEntries(
    (scenario.tasks ?? ["replicate"]).map((task, index) => [`t${index}`, task]),
  );
  let config = createGovernorConfig(
    scenario.config === undefined ? {} : scenario.config,
    trace,
  );
  const office =
    scenario.officeAvailable === false
      ? null
      : {
          t: tasks,
          c: config === null ? {} : { replicate: config.value },
          setTask(task, index) {
            trace.managerCall("setTask", { task, index });
            trace.command("assign-governor-task", { task, index });
            tasks[`t${index}`] = task;
            trace.stateChange("governor.task", { index, task });
            if (scenario.configAfterAssignment !== undefined) {
              config = createGovernorConfig(
                scenario.configAfterAssignment,
                trace,
              );
              this.c = config === null ? {} : { replicate: config.value };
            }
          },
          $forceUpdate() {
            trace.managerCall("forceUpdate", {});
            trace.command("refresh-governor-office", {});
          },
        };
  const game = {
    global: {
      race: { governor: { tasks } },
    },
  };
  const settings = {
    replicatorWeightingMode: scenario.mode ?? "quantity",
    replicatorAssignGovernorTask: scenario.assignGovernor ?? false,
  };
  return {
    trace,
    resources,
    manager,
    game,
    office,
    settings,
    get selectedResource() {
      return selectedResource;
    },
    finalState() {
      return {
        selectedResource,
        tasks: { ...tasks },
        config: config?.state === undefined ? null : { ...config.state },
      };
    },
  };
}

const priorityPlan = planReplicatorPriority({
  initialised: true,
  assignGovernorTask: false,
  scoreMode: "quantity",
  selectHighestScore: true,
  productions: [
    {
      id: "Iron",
      unlocked: true,
      enabled: true,
      weighting: 1,
      priority: 1,
      demanded: false,
      useful: true,
    },
    {
      id: "Coal",
      unlocked: true,
      enabled: true,
      weighting: 2,
      priority: 1,
      demanded: false,
      useful: true,
    },
  ],
});
assert.deepEqual(
  planReplicatorSelection(priorityPlan, [
    {
      productionId: "Iron",
      currentQuantity: 100,
      atomicMass: 1,
      exotic: false,
    },
    {
      productionId: "Coal",
      currentQuantity: 10,
      atomicMass: 1,
      exotic: false,
    },
  ]),
  { productionId: "Coal" },
);
assert.deepEqual(planReplicatorGovernorTask(["market", "none"]), {
  status: "ready",
  assignment: {
    kind: "assign-governor-task",
    taskIndex: 1,
    expectedTask: "none",
  },
});
assert.deepEqual(planReplicatorGovernorTask(["replicate", "none"]), {
  status: "ready",
  assignment: null,
});
assert.deepEqual(planReplicatorGovernorTask(["market"]), {
  status: "unavailable",
});
assert.equal(
  planReplicatorGovernorSettings({
    powerOn: true,
    focusQueue: false,
    focusNegative: false,
    switchOnCap: false,
    powerCap: 1e12,
  }),
  null,
);

assert.deepEqual(
  createReplicatorSelectionReader({
    getManager: () => ({ initIndustry: () => false }),
    getSettings: () => assert.fail("locked reader accessed settings"),
    getResources: () => assert.fail("locked reader accessed resources"),
  }).readPlanningInput(),
  {
    initialised: false,
    assignGovernorTask: false,
    scoreMode: "weight",
    selectHighestScore: false,
    productions: [],
  },
);

let inactiveResourceRead = false;
const guardedReader = createReplicatorSelectionReader({
  getManager: () => ({
    initIndustry: () => true,
    Productions: {
      Iron: {
        id: "Iron",
        unlocked: false,
        get weighting() {
          throw new Error("inactive production read weighting");
        },
        get resource() {
          inactiveResourceRead = true;
          throw new Error("inactive production read resource");
        },
      },
    },
  }),
  getSettings: () => ({
    replicatorWeightingMode: "legacy",
    replicatorAssignGovernorTask: false,
  }),
  getResources: () => assert.fail("weight mode accessed all resources"),
});
assert.equal(guardedReader.readPlanningInput().productions[0].unlocked, false);
assert.equal(inactiveResourceRead, false);

assert.throws(
  () =>
    createReplicatorSelectionReader({
      getManager: () => ({
        initIndustry: () => true,
        Productions: {
          First: { id: "same" },
          Second: { id: "same" },
        },
      }),
      getSettings: () => ({}),
      getResources: () => ({}),
    }).readPlanningInput(),
  /duplicate id same/,
);

const invalidMetricFixture = createFixture({
  mode: "quantity",
  productions: [{ id: "Iron", currentQuantity: -1 }],
});
const invalidMetricReader = createReplicatorSelectionReader({
  getManager: () => invalidMetricFixture.manager,
  getSettings: () => invalidMetricFixture.settings,
  getResources: () => invalidMetricFixture.resources,
});
const invalidMetricPlan = planReplicatorPriority(
  invalidMetricReader.readPlanningInput(),
);
assert.throws(
  () => invalidMetricReader.readMetrics(invalidMetricPlan),
  /currentQuantity must be non-negative/,
);

const invalidMassFixture = createFixture({
  mode: "mass",
  productions: [{ id: "Iron", atomicMass: 0 }],
});
const invalidMassReader = createReplicatorSelectionReader({
  getManager: () => invalidMassFixture.manager,
  getSettings: () => invalidMassFixture.settings,
  getResources: () => invalidMassFixture.resources,
});
const invalidMassPlan = planReplicatorPriority(
  invalidMassReader.readPlanningInput(),
);
assert.throws(
  () => invalidMassReader.readMetrics(invalidMassPlan),
  /atomicMass must be positive/,
);
assert.throws(
  () =>
    createReplicatorSelectionReader({
      getManager: () => ({}),
      getSettings: () => ({}),
      getResources: () => ({}),
    }).readMetrics(priorityPlan),
  /planning input must be read/,
);

const staleSelection = createReplicatorSelectionExecutor(() => ({
  Productions: {},
  setResource: () => assert.fail("stale selection mutated state"),
})).execute({ productionId: "Iron" });
assert.equal(staleSelection.status, "stale");

let technologyRead = false;
assert.deepEqual(
  createReplicatorGovernorGameReader({
    getGovernor: () => "none",
    haveReplicatorTechnology: () => {
      technologyRead = true;
      return true;
    },
    getGame: () => ({}),
  }).readGate(),
  { governorPresent: false, replicatorTechnology: false },
);
assert.equal(technologyRead, false);
assert.throws(
  () =>
    createReplicatorGovernorGameReader({
      getGovernor: () => "bureaucrat",
      haveReplicatorTechnology: () => true,
      getGame: () => ({
        global: { race: { governor: { tasks: { t0: 4 } } } },
      }),
    }).readTasks(),
  /tasks\[0\] must be a string/,
);

const closedOffice = createReplicatorGovernorOffice(
  () => null,
  resolveVueMethod,
);
assert.equal(closedOffice.reader.open(), false);
assert.throws(() => closedOffice.reader.readSettings(), /must be opened/);
assert.equal(
  closedOffice.executor.execute({
    kind: "assign-governor-task",
    taskIndex: 0,
    expectedTask: "none",
  }).status,
  "rejected",
);

const staleTaskCalls = [];
const staleTaskOffice = createReplicatorGovernorOffice(
  () => ({
    t: { t0: "market" },
    c: {},
    setTask: (...args) => staleTaskCalls.push(args),
  }),
  resolveVueMethod,
);
assert.equal(staleTaskOffice.reader.open(), true);
assert.equal(
  staleTaskOffice.executor.execute({
    kind: "assign-governor-task",
    taskIndex: 0,
    expectedTask: "none",
  }).status,
  "stale",
);
assert.deepEqual(staleTaskCalls, []);

const staleSettingsFixture = createFixture({
  assignGovernor: true,
  config: {},
});
const staleSettingsOffice = createReplicatorGovernorOffice(
  () => staleSettingsFixture.office,
  resolveVueMethod,
);
staleSettingsOffice.reader.open();
const sampledSettings = staleSettingsOffice.reader.readSettings();
const settingsDecision = planReplicatorGovernorSettings(sampledSettings);
staleSettingsFixture.office.c.replicate.pow.cap = 50_000;
assert.equal(
  staleSettingsOffice.executor.execute(settingsDecision).status,
  "stale",
);

const preflightConfig = {
  pow: { on: false, cap: 1 },
  res: { que: true, neg: true, cap: true },
};
const preflightOffice = createReplicatorGovernorOffice(
  () => ({
    t: { t0: "replicate" },
    c: { replicate: preflightConfig },
  }),
  resolveVueMethod,
);
preflightOffice.reader.open();
const preflightDecision = planReplicatorGovernorSettings(
  preflightOffice.reader.readSettings(),
);
assert.throws(
  () => preflightOffice.executor.execute(preflightDecision),
  /\$forceUpdate must be a function/,
);
assert.deepEqual(preflightConfig, {
  pow: { on: false, cap: 1 },
  res: { que: true, neg: true, cap: true },
});

console.log("Replicator domain, adapters, and application tests passed");
