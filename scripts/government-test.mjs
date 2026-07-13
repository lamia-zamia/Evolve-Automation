import assert from "node:assert/strict";

import { createAutoGovernment } from "../src/subsystems/government.ts";

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

  const autoGovernment = createAutoGovernment({
    GovernmentManager,
    getSettings: () => settings,
    getGame: () => game,
    guardActive: (setting) => setting === "guardAnarchist" && guard,
    haveTech: (tech) =>
      tech === "governor" || (tech === "q_factory" && qFactory),
    getGovernor: () => currentGovernor,
    getVueById: (id) =>
      id === "candidates"
        ? { appoint: (candidate) => appointments.push(candidate) }
        : undefined,
  });

  autoGovernment();
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

console.log("Government automation regression tests passed");
