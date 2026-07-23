import assert from "node:assert/strict";

import { runReplicatorAutomation } from "../src/application/replicator.ts";
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
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

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

// Exact copy of the deleted factory, retained only as the parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const ReplicatorManager = fixture.manager;
  const settings = fixture.settings;
  const resources = fixture.resources;
  const game = fixture.game;
  if (!ReplicatorManager.initIndustry()) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }

  const allProducts = Object.values(ReplicatorManager.Productions);
  const priorityGroups = {};
  for (const production of allProducts) {
    if (production.unlocked && production.enabled) {
      if (production.weighting > 0) {
        let priority = production.resource.isDemanded()
          ? Math.max(production.priority, 100)
          : production.priority;
        priority *= !production.resource.isUseful() ? 0 : production.priority;
        if (priority !== 0) {
          priorityGroups[priority] = priorityGroups[priority] ?? [];
          priorityGroups[priority].push(production);
        }
      }
    }
  }
  const priorityList = Object.keys(priorityGroups)
    .sort((left, right) => right - left)
    .map((key) => priorityGroups[key]);
  if (priorityGroups["-1"] && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
    priorityList[0].push(...priorityGroups["-1"]);
  }

  let weightFn;
  switch (settings.replicatorWeightingMode) {
    case "mass":
      weightFn = (production, resource) =>
        production.weighting /
        resource.atomicMass /
        (resource === resources.Elerium || resource === resources.Infernite
          ? 4
          : 1) /
        resource.currentQuantity;
      break;
    case "quantity":
      weightFn = (production, resource) =>
        production.weighting / resource.currentQuantity;
      break;
    case "legacy":
    default:
      weightFn = (production) => production.weighting;
      break;
  }
  if (priorityList.length > 0 && priorityList[0].length > 0) {
    const list = priorityList[0].sort(
      (left, right) =>
        weightFn(left, left.resource) - weightFn(right, right.resource),
    );
    const selected =
      settings.replicatorWeightingMode !== "legacy"
        ? list[list.length - 1]
        : list[0];
    ReplicatorManager.setResource(selected.id);
  }

  if (!settings.replicatorAssignGovernorTask) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }
  if (
    (scenario.governor ?? "bureaucrat") === "none" ||
    !(scenario.tech ?? true)
  ) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }
  const office = fixture.office;
  if (!office) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }
  let taskIndex = Object.values(game.global.race.governor.tasks).findIndex(
    (task) => task === "replicate",
  );
  if (taskIndex == -1) {
    taskIndex = Object.values(game.global.race.governor.tasks).findIndex(
      (task) => task === "none",
    );
    if (taskIndex == -1) {
      return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
    }
    office.setTask("replicate", taskIndex);
  }
  const govSettings = office.c?.replicate;
  if (!govSettings) {
    return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
  }
  let changed = false;
  if (govSettings.pow.on == false) {
    govSettings.pow.on = true;
    changed = true;
  }
  if (govSettings.res.que) {
    govSettings.res.que = false;
    changed = true;
  }
  if (govSettings.res.neg) {
    govSettings.res.neg = false;
    changed = true;
  }
  if (govSettings.res.cap) {
    govSettings.res.cap = false;
    changed = true;
  }
  if (govSettings.pow.cap < 1e12) {
    office.c.replicate.pow.cap = 1e12;
    changed = true;
  }
  if (changed) office.$forceUpdate();
  return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const officeAdapter = createReplicatorGovernorOffice(() => fixture.office);
  const outcome = runReplicatorAutomation({
    selectionReader: createReplicatorSelectionReader({
      getManager: () => fixture.manager,
      getSettings: () => fixture.settings,
      getResources: () => fixture.resources,
    }),
    selectionExecutor: createReplicatorSelectionExecutor(() => fixture.manager),
    governorGameReader: createReplicatorGovernorGameReader({
      getGovernor: () => scenario.governor ?? "bureaucrat",
      haveReplicatorTechnology: () => scenario.tech ?? true,
      getGame: () => fixture.game,
    }),
    governorOfficeReader: officeAdapter.reader,
    governorExecutor: officeAdapter.executor,
  });
  assert.equal(outcome.status, "succeeded");
  return { trace: fixture.trace.snapshot(), state: fixture.finalState() };
}

const parityScenarios = [
  {
    name: "uninitialised replicator is inert",
    initialised: false,
    productions: [{ id: "Iron" }],
  },
  {
    name: "locked disabled and zero-weight products are skipped",
    productions: [
      { id: "Iron", unlocked: false },
      { id: "Coal", enabled: false },
      { id: "Oil", weighting: 0 },
    ],
  },
  {
    name: "quantity mode selects the greatest weighting per quantity",
    mode: "quantity",
    productions: [
      { id: "Iron", weighting: 5, currentQuantity: 100 },
      { id: "Coal", weighting: 2, currentQuantity: 10 },
    ],
  },
  {
    name: "mass mode applies atomic mass and exotic penalty",
    mode: "mass",
    productions: [
      { id: "Iron", weighting: 4, atomicMass: 2, currentQuantity: 10 },
      { id: "Elerium", weighting: 12, atomicMass: 1, currentQuantity: 10 },
    ],
  },
  {
    name: "legacy mode selects the lowest weight after ascending sort",
    mode: "legacy",
    productions: [
      { id: "Iron", weighting: 5 },
      { id: "Coal", weighting: 2 },
    ],
  },
  {
    name: "unknown mode uses weight scores but selects the highest",
    mode: "imported-unknown",
    productions: [
      { id: "Iron", weighting: 5 },
      { id: "Coal", weighting: 2 },
    ],
  },
  {
    name: "demand promotion is multiplied by configured priority",
    productions: [
      { id: "Iron", priority: 5, weighting: 1 },
      { id: "Coal", priority: 1, demanded: true, weighting: 1 },
    ],
  },
  {
    name: "supplementary and lower negative groups preserve legacy splice",
    mode: "legacy",
    productions: [
      { id: "Iron", priority: 1, weighting: 3 },
      { id: "Coal", priority: -0.01, demanded: true, weighting: 1 },
      { id: "Oil", priority: -0.02, demanded: true, weighting: 0.5 },
    ],
  },
  {
    name: "not-useful production is excluded from selection",
    productions: [
      { id: "Iron", priority: 10, useful: false },
      { id: "Coal", priority: 1 },
    ],
  },
  {
    name: "governor toggle off stops after resource selection",
    assignGovernor: false,
    productions: [{ id: "Iron" }],
  },
  {
    name: "missing governor short-circuits governor configuration",
    assignGovernor: true,
    governor: "none",
    productions: [{ id: "Iron" }],
  },
  {
    name: "missing technology short-circuits governor configuration",
    assignGovernor: true,
    tech: false,
    productions: [{ id: "Iron" }],
  },
  {
    name: "missing office short-circuits before task inspection",
    assignGovernor: true,
    officeAvailable: false,
    productions: [{ id: "Iron" }],
  },
  {
    name: "no free governor slot leaves settings untouched",
    assignGovernor: true,
    tasks: ["market", "storage"],
  },
  {
    name: "assigned task receives every required setting change in order",
    assignGovernor: true,
    tasks: ["replicate", "none"],
    config: {},
  },
  {
    name: "free slot assignment is followed by a fresh configuration read",
    assignGovernor: true,
    tasks: ["market", "none"],
    config: null,
    configAfterAssignment: {
      powerOn: false,
      powerCap: 5,
      focusQueue: true,
      focusNegative: false,
      switchOnCap: true,
    },
  },
  {
    name: "missing replicator config after assigned task is inert",
    assignGovernor: true,
    tasks: ["replicate"],
    config: null,
  },
  {
    name: "already desired governor settings do not force update",
    assignGovernor: true,
    tasks: ["replicate"],
    config: {
      powerOn: true,
      powerCap: 1e12,
      focusQueue: false,
      focusNegative: false,
      switchOnCap: false,
    },
  },
];

for (const scenario of parityScenarios) {
  const legacy = runLegacy(scenario);
  const modern = runModern(scenario);
  assertEquivalentTraces({
    legacy: legacy.trace,
    modern: modern.trace,
    label: `replicator parity: ${scenario.name}`,
  });
  assert.deepEqual(modern.state, legacy.state, scenario.name);
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

const closedOffice = createReplicatorGovernorOffice(() => null);
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
const staleTaskOffice = createReplicatorGovernorOffice(() => ({
  t: { t0: "market" },
  c: {},
  setTask: (...args) => staleTaskCalls.push(args),
}));
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
const preflightOffice = createReplicatorGovernorOffice(() => ({
  t: { t0: "replicate" },
  c: { replicate: preflightConfig },
}));
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

console.log(
  "Replicator domain, adapters, application, and parity tests passed",
);
