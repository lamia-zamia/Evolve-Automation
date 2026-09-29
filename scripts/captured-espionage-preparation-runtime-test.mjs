import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import {
  capturedForeignEspionageTriggerSelector,
  readCapturedForeignTargets,
  selectCapturedForeignStrategy,
} from "../src/adapters/evolve/combat/captured-foreign-state.ts";

const preparationSettings = {
  masterScriptToggle: true,
  tickRate: 1,
  autoFight: true,
  foreignTrainSpy: false,
  foreignSpyMax: 3,
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Annex",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignUnification: false,
  foreignForceSabotage: false,
  foreignOccupyLast: false,
  foreignPacifist: false,
  autoHell: false,
  achievementGuards: false,
};

function preparationGovernment() {
  return {
    mil: 10,
    spy: 3,
    sab: 0,
    act: "none",
    hstl: 30,
    unrest: 20,
    eco: 1,
    occ: false,
    anx: false,
    buy: false,
  };
}

const preparationRoot = {
  race: { elusive: false, governor: { tasks: { t0: "none" } } },
  tech: { spy: 2, unify: 0, world_control: 1, armor: 0 },
  stats: { attacks: 0, achieve: {} },
  city: { biome: "plains", ptrait: [], morale: { current: 250 } },
  civic: {
    govern: { type: "democracy" },
    garrison: {
      display: true,
      workers: 20,
      max: 20,
      crew: 0,
      wounded: 0,
      raid: 0,
      tactic: 0,
      progress: 0,
      rate: 1,
      cityGarrison: 20,
      maxCityGarrison: 20,
      mercs: false,
    },
    foreign: {
      gov0: preparationGovernment(),
      gov1: preparationGovernment(),
    },
  },
  resource: {
    Money: { amount: 0, max: 100_000, display: true, diff: 0, value: 1 },
    Knowledge: { amount: 0, max: 100_000, display: true, diff: 0, value: 1 },
  },
  space: {},
  portal: {},
  eden: {},
  settings: { civTabs: 3, spaceTabs: 0, showPortal: false, mKeys: false },
};

const preparationEvents = [];
const preparationErrors = [];
let preparationCycle;
let preparationModalGeneration = 0;
let preparationModalControl;
let preparationModalElement;
const preparationActiveModals = [];
const preparationModalMethods = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
];

function removePreparationModal() {
  if (preparationModalElement !== undefined) {
    const index = preparationActiveModals.indexOf(preparationModalElement);
    if (index >= 0) preparationActiveModals.splice(index, 1);
  }
  preparationModalElement = undefined;
  preparationModalControl = undefined;
}

function openPreparationModal(governmentId) {
  const background = { click: removePreparationModal };
  preparationModalElement = {
    style: {},
    querySelector: (selector) =>
      selector === ".modal-background" ? background : null,
  };
  preparationActiveModals.push(preparationModalElement);
  preparationModalGeneration += 1;
  preparationModalControl = {
    elementId: "espModal",
    generation: preparationModalGeneration,
    methods: preparationModalMethods,
    data: preparationRoot.civic.foreign[`gov${governmentId}`],
  };
}

const preparationDocument = {
  querySelectorAll(selector) {
    return selector === ".modal.is-active" ? preparationActiveModals : [];
  },
  querySelector(selector) {
    if (selector === "#espModal") return preparationModalElement ?? null;
    for (const governmentId of [0, 1]) {
      if (selector === capturedForeignEspionageTriggerSelector(governmentId)) {
        return { click: () => openPreparationModal(governmentId) };
      }
    }
    return null;
  },
};

const preparationForeignControl = {
  elementId: "foreign",
  generation: 1,
  methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
};
const preparationGarrisonControl = {
  elementId: "garrison",
  generation: 1,
  methods: [
    "campaign",
    "next",
    "last",
    "aNext",
    "aLast",
    "rating",
    "hell",
    "s_max",
  ],
};

const preparationControls = {
  resolve(elementId) {
    if (elementId === "foreign") return preparationForeignControl;
    if (elementId === "garrison") return preparationGarrisonControl;
    if (elementId === "espModal") return preparationModalControl;
    return undefined;
  },
  invoke(control, method, args = []) {
    const governmentId = args[0];
    if (control.elementId === "foreign") {
      if (method === "vis") return { ok: true, value: true };
      if (method === "gvis") {
        return {
          ok: true,
          value:
            preparationRoot.civic.foreign[`gov${governmentId}`] !== undefined,
        };
      }
      return { ok: true, value: false };
    }
    if (control.elementId === "espModal") {
      const government = preparationRoot.civic.foreign[`gov${governmentId}`];
      preparationEvents.push({ governmentId, operation: method });
      if (method === "influence") government.hstl = 0;
      if (method === "incite") government.unrest += 5;
      return { ok: true, value: undefined };
    }
    return { ok: true, value: undefined };
  },
  capturedElementIds() {
    return preparationModalControl === undefined
      ? ["foreign", "garrison"]
      : ["foreign", "garrison", "espModal"];
  },
};

const preparationStop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    rootState: {
      readRoot: () => preparationRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: preparationControls,
    controlUsage: { readUsage: () => [] },
    keyState: { readPressed: () => false },
    periods: {
      subscribe(next) {
        preparationCycle = next;
        return () => {};
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  },
  document: preparationDocument,
  mouseEvent: class {},
  storage: { getItem: () => JSON.stringify(preparationSettings) },
  logError: (message) => preparationErrors.push(message),
});

try {
  const strategyTargets = readCapturedForeignTargets(
    preparationRoot,
    preparationControls,
    preparationForeignControl,
    preparationSettings,
  );
  const strategy = selectCapturedForeignStrategy(
    preparationRoot,
    preparationSettings,
    strategyTargets,
  );
  assert.equal(strategy.selectedTargetId, 1);
  assert.equal(strategy.battleTargetId, 1);

  for (
    let period = 0;
    period < 8 && preparationEvents.length < 2;
    period += 1
  ) {
    preparationCycle({ periods: 1 });
  }
} finally {
  preparationStop();
}

assert.deepEqual(
  preparationEvents,
  [
    { governmentId: 0, operation: "influence" },
    { governmentId: 1, operation: "incite" },
  ],
  "autoFight.spy uses the shared strategy's secondary/primary status before modal execution",
);
assert.equal(preparationRoot.civic.foreign.gov0.hstl, 0);
assert.equal(preparationRoot.civic.foreign.gov1.unrest, 25);
assert.equal(
  preparationErrors.some((message) => message.includes("autoFight.")),
  false,
);

console.log("captured espionage preparation runtime checks passed");
