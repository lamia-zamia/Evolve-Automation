import assert from "node:assert/strict";

import {
  createCapturedGovernmentAutomation,
  runCapturedGovernmentAutomation,
} from "../src/adapters/evolve/civic/captured-government.ts";

function makeRoot() {
  return {
    tech: { governor: 1 },
    race: {
      governor: {
        candidates: [{ bg: "soldier" }, { bg: "educator" }],
      },
    },
  };
}

function makeControls(invoked, available = true) {
  return {
    resolve: (elementId) =>
      available && elementId === "candidates"
        ? { elementId, generation: 1, methods: ["appoint"] }
        : undefined,
    invoke: (_handle, method, args) => {
      invoked.push({ method, args });
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => (available ? ["candidates"] : []),
  };
}

// A configured, unappointed governor selects the matching captured candidate.
{
  const root = makeRoot();
  const invoked = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  assert.deepEqual(outcome, { status: "succeeded" });
  assert.deepEqual(invoked, [{ method: "appoint", args: [1] }]);
}

// An existing appointment is not replaced.
{
  const root = makeRoot();
  root.race.governor.g = { bg: "soldier" };
  const invoked = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  assert.deepEqual(runCapturedGovernmentAutomation(automation), {
    status: "succeeded",
  });
  assert.deepEqual(invoked, []);
}

// The command is stale when the mounted candidate control is not available.
{
  const root = makeRoot();
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([], false),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "governor-controls-unavailable");
}

console.log("Captured government adapter tests passed");
