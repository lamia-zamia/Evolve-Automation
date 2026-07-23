import assert from "node:assert/strict";

import { runGovernmentAutomation } from "../src/application/government.ts";
import { createGovernmentControls } from "../src/adapters/browser/government-controls.ts";
import {
  createGovernmentCommandExecutor,
  readGovernmentInput,
} from "../src/adapters/evolve/civic/government.ts";
import { planGovernment } from "../src/domain/civic/government.ts";

// End-to-end reader + planner + apply through the typed application use-case,
// asserting the resulting setGovernment / Vue appoint calls.
function runGovernmentCase({
  guard = false,
  qFactory = true,
  currentGovernor = "none",
} = {}) {
  const governmentChanges = [];
  const appointments = [];
  const settings = {
    govSpace: "federation",
    govFinal: "democracy",
    govInterim: "republic",
    govGovernor: "entrepreneur",
  };
  const game = {
    global: {
      race: {
        governor: {
          candidates: [{ bg: "criminal" }, { bg: "entrepreneur" }],
        },
      },
    },
  };
  const GovernmentManager = {
    Types: {
      federation: { isUnlocked: () => true },
      democracy: { isUnlocked: () => true },
      republic: { isUnlocked: () => true },
    },
    isEnabled: () => true,
    setGovernment: (government) => governmentChanges.push(government),
  };
  const getVueById = (id) =>
    id === "candidates"
      ? { appoint: (candidate) => appointments.push(candidate) }
      : undefined;
  const executor = createGovernmentCommandExecutor({
    getGovernmentManager: () => GovernmentManager,
    getGame: () => game,
    getGovernor: () => currentGovernor,
    controls: createGovernmentControls(getVueById),
  });

  const readerDependencies = {
    getGovernmentManager: () => GovernmentManager,
    getSettings: () => settings,
    getGame: () => game,
    guardActive: (setting) => setting === "guardAnarchist" && guard,
    haveTech: (tech) =>
      tech === "governor" || (tech === "q_factory" && qFactory),
    getGovernor: () => currentGovernor,
  };
  const reader = { read: () => readGovernmentInput(readerDependencies) };
  assert.equal(
    runGovernmentAutomation({ reader, executor }).status,
    "succeeded",
  );
  return { governmentChanges, appointments };
}

const spaceCase = runGovernmentCase();
assert.deepEqual(spaceCase.governmentChanges, ["federation"]);
assert.deepEqual(spaceCase.appointments, [1]);

const preSpaceCase = runGovernmentCase({ qFactory: false });
assert.deepEqual(preSpaceCase.governmentChanges, ["democracy"]);

const guardedCase = runGovernmentCase({
  guard: true,
  currentGovernor: "entrepreneur",
});
assert.deepEqual(
  guardedCase.governmentChanges,
  [],
  "the Anarchist guard must preserve Anarchy",
);
assert.deepEqual(
  guardedCase.appointments,
  [],
  "an existing governor must not be appointed again",
);

// Planner unit coverage: interim fallback, no matching candidate, disabled manager.
assert.deepEqual(
  planGovernment({
    isEnabled: true,
    guardAnarchist: false,
    haveQFactory: false,
    haveGovernorTech: true,
    currentGovernor: "none",
    govSpace: "federation",
    govFinal: "none",
    govInterim: "republic",
    govGovernor: "scientist",
    govSpaceUnlocked: true,
    govFinalUnlocked: false,
    govInterimUnlocked: true,
    candidateBackgrounds: ["criminal", "entrepreneur"],
  }),
  {
    government: "republic",
    appointCandidate: null,
    appointCandidateBackground: null,
  },
  "space needs q_factory; final is none so interim wins; no scientist candidate",
);

assert.deepEqual(
  planGovernment({
    isEnabled: false,
    guardAnarchist: false,
    haveQFactory: true,
    haveGovernorTech: false,
    currentGovernor: "none",
    govSpace: "federation",
    govFinal: "democracy",
    govInterim: "republic",
    govGovernor: "entrepreneur",
    govSpaceUnlocked: true,
    govFinalUnlocked: true,
    govInterimUnlocked: true,
    candidateBackgrounds: ["entrepreneur"],
  }),
  {
    government: null,
    appointCandidate: null,
    appointCandidateBackground: null,
  },
  "disabled manager and missing governor tech produce no actions",
);

// Adapter: absent governor candidates normalize to an empty list (no throw).
{
  const input = readGovernmentInput({
    getGovernmentManager: () => ({
      Types: {},
      isEnabled: () => false,
    }),
    getSettings: () => ({
      govSpace: "none",
      govFinal: "none",
      govInterim: "none",
      govGovernor: "none",
    }),
    getGame: () => ({ global: { race: {} } }),
    guardActive: () => false,
    haveTech: () => false,
    getGovernor: () => "none",
  });
  assert.deepEqual(input.candidateBackgrounds, []);
  assert.equal(input.govSpaceUnlocked, false);
  assert.ok(Object.isFrozen(input));
}

// Disabled government must not inspect guards, tech, types, governor, or candidates.
{
  const calls = [];
  const input = readGovernmentInput({
    getGovernmentManager: () => ({
      get Types() {
        throw new Error("disabled government types must not be read");
      },
      isEnabled: () => (calls.push("enabled"), false),
    }),
    getSettings: () => ({
      govSpace: "removed-government",
      govFinal: "removed-government",
      govInterim: "removed-government",
      govGovernor: "none",
    }),
    getGame: () => ({ global: { race: {} } }),
    guardActive: () => {
      throw new Error("guard must not be read when disabled");
    },
    haveTech: (tech) => (calls.push(`tech:${tech}`), false),
    getGovernor: () => {
      throw new Error("governor must not be read when unavailable");
    },
  });
  assert.equal(input.isEnabled, false);
  assert.deepEqual(calls, ["enabled", "tech:governor"]);
}

console.log("Government automation regression tests passed");
