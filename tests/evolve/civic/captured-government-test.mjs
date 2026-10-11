import assert from "node:assert/strict";

import {
  createCapturedGovernmentAutomation,
  runCapturedGovernmentAutomation,
} from "../../../src/adapters/evolve/civic/captured-government.ts";

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

function makeModal(apply = () => ({ status: "succeeded" })) {
  return { apply, dispose() {} };
}

// A configured, unappointed governor selects the matching captured candidate.
{
  const root = makeRoot();
  const invoked = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    modal: makeModal(),
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
    modal: makeModal(),
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
    modal: makeModal(),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "governor-controls-unavailable");
}

// Government type selection delegates its native modal lifecycle to the modal controller.
{
  const root = makeRoot();
  root.tech.govern = 1;
  root.civic = { govern: { type: "anarchy", rev: 0 } };
  const modalCalls = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((government) => {
      modalCalls.push(government);
      root.civic.govern.type = government;
      return { status: "succeeded" };
    }),
    readSettings: () => ({
      autoGovernment: true,
      govInterim: "democracy",
      govGovernor: "none",
    }),
  });
  assert.deepEqual(runCapturedGovernmentAutomation(automation), {
    status: "succeeded",
  });
  assert.equal(root.civic.govern.type, "democracy");
  assert.deepEqual(modalCalls, ["democracy"]);
}

// A pending revolution and a locked target never open the native modal.
for (const [government, revision] of [
  ["democracy", 10],
  ["republic", 0],
]) {
  const root = makeRoot();
  root.tech.govern = 1;
  root.civic = { govern: { type: "anarchy", rev: revision } };
  const modalCalls = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((target) => {
      modalCalls.push(target);
      return { status: "succeeded" };
    }),
    readSettings: () => ({
      autoGovernment: true,
      govInterim: government,
      govGovernor: "none",
    }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  if (revision > 0) assert.equal(outcome.status, "stale");
  assert.deepEqual(modalCalls, []);
}

console.log("Captured government adapter tests passed");
