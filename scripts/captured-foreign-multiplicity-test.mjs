import assert from "node:assert/strict";

import * as capturedEspionageApplication from "../src/application/captured-espionage.ts";
import { createCapturedEspionage } from "../src/adapters/evolve/combat/captured-espionage.ts";
import {
  selectCapturedForeignStrategy,
  readCapturedForeignTargets,
} from "../src/adapters/evolve/combat/captured-foreign-state.ts";

const root = {
  tech: { spy: 2 },
  city: { morale: { current: 250 } },
  resource: { Money: { amount: 20_000 } },
  civic: {
    foreign: {
      gov0: {
        mil: 70,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 30,
        unrest: 20,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
      gov1: {
        mil: 80,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 30,
        unrest: 20,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
      gov2: {
        mil: 40,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 0,
        unrest: 20,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
    },
  },
};
const settings = {
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Sabotage",
  foreignPolicySuperior: "Influence",
  foreignPolicyRival: "Ignore",
  foreignForceSabotage: false,
  foreignUnification: false,
  foreignOccupyLast: false,
};

const foreignMethods = ["vis", "gvis", "trigModal", "spy_disabled", "spy"];
const operationMethods = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
];
const controlsById = new Map();
let operationGeneration = 0;
const captures = [];
const foreign = {
  elementId: "foreign",
  generation: 1,
  methods: foreignMethods,
};
controlsById.set("foreign", foreign);

/**
 * The synthetic capture the production bootstrap buys its per-government `#espModal` control with.
 * A fresh generation bound to the requested government is the whole contract: the game builds a new
 * set per `drawEspModal(gov)`, so reusing one would apply another government's closure.
 */
const operations = {
  blockedByPlayerModal: () => false,
  capture(governmentId) {
    operationGeneration += 1;
    captures.push(governmentId);
    const control = {
      elementId: "espModal",
      generation: operationGeneration,
      methods: [...operationMethods],
      data: root.civic.foreign[`gov${governmentId}`],
    };
    controlsById.set("espModal", control);
    return control;
  },
};

const controls = {
  resolve: (elementId) => controlsById.get(elementId),
  invoke(control, method, args = []) {
    if (
      control.generation !== controlsById.get(control.elementId)?.generation
    ) {
      return { ok: false, reason: "stale-control" };
    }
    if (control.elementId === "foreign") {
      if (method === "vis") return { ok: true, value: true };
      if (method === "gvis") return { ok: true, value: args[0] < 3 };
      return { ok: false, reason: "unknown-method" };
    }
    const government = root.civic.foreign[`gov${args[0]}`];
    government.sab = 300;
    government.act = method;
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => [...controlsById.keys()],
};

const stateSource = {
  readRoot: () => root,
  isReactivitySuppressed: () => false,
  subscribeRootReplaced: () => () => {},
};
const adapter = createCapturedEspionage({
  rootState: stateSource,
  controls,
  readSettings: () => settings,
  operations,
});

assert.equal(
  typeof capturedEspionageApplication.createCapturedEspionageRunner,
  "function",
  "the application must own a per-government espionage cycle",
);

const targets = readCapturedForeignTargets(root, controls, foreign, settings);
const strategy = selectCapturedForeignStrategy(root, settings, targets);
assert.equal(strategy.battleTargetId, 2);
assert.deepEqual(
  targets.map((target) => target.governmentId),
  [0, 1, 2],
);
assert.deepEqual(
  adapter.reader.readAll().map((input) => input.governmentId),
  [0, 1, 2],
);

const run = capturedEspionageApplication.createCapturedEspionageRunner(adapter);
assert.equal(run().failure.code, "captured-espionage-postcondition-pending");
assert.equal(root.civic.foreign.gov0.act, "sabotage");
assert.equal(root.civic.foreign.gov0.sab, 300);

assert.equal(run().failure.code, "captured-espionage-postcondition-pending");
assert.equal(root.civic.foreign.gov1.act, "influence");
assert.equal(root.civic.foreign.gov1.sab, 300);
assert.equal(root.civic.foreign.gov2.act, "none");
assert.equal(root.civic.foreign.gov2.sab, 0);
assert.deepEqual(
  captures,
  [0, 1],
  "one capture per operation, each scoped to the government it acted on",
);

const refreshedTargets = readCapturedForeignTargets(
  root,
  controls,
  foreign,
  settings,
);
const refreshedStrategy = selectCapturedForeignStrategy(
  root,
  settings,
  refreshedTargets,
);
assert.equal(refreshedStrategy.battleTargetId, 2);
assert.equal(root.civic.foreign.gov1.act, "influence");

console.log("captured foreign multiplicity checks passed");
