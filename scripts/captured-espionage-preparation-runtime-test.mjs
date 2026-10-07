import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import {
  readCapturedForeignTargets,
  selectCapturedForeignStrategy,
} from "../src/adapters/evolve/combat/captured-foreign-state.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

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
const preparationModalHosts = [];
let preparationCycle;
let preparationOperationGeneration = 0;
let preparationOperationControl;
const preparationModalMethods = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
];

const preparationBody = element("div", { id: "page" });
const preparationDocument = createTestDocument(preparationBody);
const preparationTimers = new Map();
let preparationTimerId = 0;
/**
 * A real timer registry, so the capture's temporary replacement can be shown to leave nothing
 * behind: any handle it hands back that reaches this one is a leak.
 */
function realSetInterval(callback, delay) {
  const handle = ++preparationTimerId;
  preparationTimers.set(handle, { callback, delay });
  return handle;
}
function realClearInterval(handle) {
  preparationTimers.delete(handle);
}
const preparationPage = {
  document: preparationDocument,
  setInterval: realSetInterval,
  clearInterval: realClearInterval,
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

/**
 * Stands in for `foreign.trigModal(gov)` reaching the private `drawEspModal(gov)`: it reproduces the
 * part of the upstream draw the automation depends on — a fresh `#espModal` control bound to
 * `gov${gov}` — and nothing else. The real game builds the methods itself; here the stub does.
 */
const preparationSynthesis = {
  available: true,
  invoke(request) {
    assert.equal(request.elementId, "foreign");
    assert.equal(request.method, "trigModal");
    assert.deepEqual(request.receiver?.noOpMethods, ["$buefy.modal.open"]);
    const governmentId = request.args[0];
    preparationModalHosts.push(
      preparationDocument.querySelector("#modalBox") !== null,
    );
    preparationOperationGeneration += 1;
    preparationOperationControl = {
      elementId: "espModal",
      generation: preparationOperationGeneration,
      methods: preparationModalMethods,
      data: preparationRoot.civic.foreign[`gov${governmentId}`],
    };
    return { ok: true, value: undefined };
  },
};

const preparationControls = {
  resolve(elementId) {
    if (elementId === "foreign") return preparationForeignControl;
    if (elementId === "garrison") return preparationGarrisonControl;
    if (elementId === "espModal") return preparationOperationControl;
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
    return preparationOperationControl === undefined
      ? ["foreign", "garrison"]
      : ["foreign", "garrison", "espModal"];
  },
};

const preparationStop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    mechanics: {
      readStructures: () => undefined,
      readStructureIdentities: () => undefined,
    },
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
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
      withMountingEnabled: (draw) => draw(),
    },
    synthesis: preparationSynthesis,
    uninstall: () => {},
  },
  document: preparationDocument,
  settingsHostWindow: preparationPage,
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
  "autoFight.espionage uses the shared strategy's secondary/primary status, one capture per government",
);
assert.deepEqual(
  preparationModalHosts,
  [true, true],
  "each capture ran against a synthetic #modalBox host",
);
assert.equal(
  preparationDocument.querySelector("#modalBox"),
  null,
  "no espionage modal host outlives a capture",
);
assert.equal(
  preparationDocument.querySelectorAll(".modal.is-active").length,
  0,
  "the espionage phase opens no modal",
);
assert.equal(preparationPage.setInterval, realSetInterval);
assert.equal(preparationPage.clearInterval, realClearInterval);
assert.equal(
  preparationTimers.size,
  0,
  "the page's own timer registry is untouched",
);
assert.equal(preparationRoot.civic.foreign.gov0.hstl, 0);
assert.equal(preparationRoot.civic.foreign.gov1.unrest, 25);
assert.equal(
  preparationErrors.some((message) => message.includes("autoFight.")),
  false,
);
assert.equal(preparationErrors.length, 0, preparationErrors.join(" | "));

console.log("captured espionage preparation runtime checks passed");
