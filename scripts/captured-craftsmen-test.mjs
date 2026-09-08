import assert from "node:assert/strict";
import { runJobsAutomation } from "../src/application/jobs.ts";
import { planJobs } from "../src/domain/civic/jobs.ts";
import { createCapturedCraftsmenAutomation } from "../src/adapters/evolve/civic/captured-craftsmen.ts";

function source(root) {
  return {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
}

function controlsFor(root, includeFoundry = true) {
  const calls = [];
  const handle = includeFoundry
    ? { elementId: "foundry", generation: 1, methods: ["add", "sub"] }
    : undefined;
  return {
    calls,
    controls: {
      resolve: (elementId) => (elementId === "foundry" ? handle : undefined),
      invoke: (current, method, args = []) => {
        calls.push({ method, id: args[0] });
        const id = args[0];
        if (id === undefined) return { ok: false, reason: "threw" };
        if (method === "sub") {
          root.city.foundry[id] -= 1;
          root.city.foundry.crafting -= 1;
        } else {
          root.city.foundry[id] += 1;
          root.city.foundry.crafting += 1;
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => (handle === undefined ? [] : ["foundry"]),
    },
  };
}

function makeRoot() {
  return {
    city: { foundry: { Plywood: 2, Brick: 0, Bronze: 0, crafting: 2 } },
    resource: {
      Plywood: { amount: 100 },
      Brick: { amount: 0 },
      Bronze: { amount: 0 },
    },
  };
}

const root = makeRoot();
const captured = controlsFor(root);
const adapter = createCapturedCraftsmenAutomation({
  rootState: source(root),
  controls: captured.controls,
  readSettings: () => ({
    autoCraftsmen: true,
    craftPlywood: true,
    job_Plywood: true,
    foundry_w_Plywood: 1,
    craftBrick: true,
    job_Brick: true,
    foundry_w_Brick: 1,
  }),
});

assert.equal(runJobsAutomation(adapter, true).status, "succeeded");
assert.equal(root.city.foundry.Plywood, 0);
assert.equal(root.city.foundry.Brick, 2);
assert.deepEqual(captured.calls, [
  { method: "sub", id: "Plywood" },
  { method: "sub", id: "Plywood" },
  { method: "add", id: "Brick" },
  { method: "add", id: "Brick" },
]);

const malformedRoot = makeRoot();
const malformedControls = controlsFor(malformedRoot);
const malformedAdapter = createCapturedCraftsmenAutomation({
  rootState: source(malformedRoot),
  controls: malformedControls.controls,
  readSettings: () => ({
    craftPlywood: true,
    job_Plywood: true,
    foundry_w_Plywood: "not-a-number",
    craftBrick: false,
    job_Brick: true,
  }),
});
assert.equal(runJobsAutomation(malformedAdapter, true).status, "succeeded");
assert.equal(malformedRoot.city.foundry.Plywood, 2);
assert.equal(malformedRoot.city.foundry.Brick, 0);

const staleRoot = makeRoot();
const staleControls = controlsFor(staleRoot);
const staleAdapter = createCapturedCraftsmenAutomation({
  rootState: source(staleRoot),
  controls: staleControls.controls,
  readSettings: () => ({ craftPlywood: true, job_Plywood: true }),
});
const staleInput = staleAdapter.reader.readCycle(true);
const staleDecision = planJobs(staleInput);
staleRoot.city.foundry.Plywood = 1;
assert.equal(staleAdapter.executor.execute(staleDecision).status, "stale");

const missingRoot = makeRoot();
const missingControls = controlsFor(missingRoot, false);
const missingAdapter = createCapturedCraftsmenAutomation({
  rootState: source(missingRoot),
  controls: missingControls.controls,
  readSettings: () => ({}),
});
assert.equal(runJobsAutomation(missingAdapter, true).status, "succeeded");

console.log("captured-craftsmen ok");
