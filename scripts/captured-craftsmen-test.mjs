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
    city: {
      foundry: {
        Plywood: 2,
        Brick: 0,
        Bronze: 0,
        crafting: 2,
        cap: 4,
        rcap: {},
      },
    },
    civic: { craftsman: { workers: 2, max: 4 } },
    resource: {
      Plywood: { amount: 100 },
      Brick: { amount: 0 },
      Bronze: { amount: 0 },
      Iron: { amount: 100 },
    },
  };
}

const costs = {
  read: (id) => (id === "Plywood" ? new Map([["Iron", 1]]) : undefined),
};

const root = makeRoot();
const captured = controlsFor(root);
const adapter = createCapturedCraftsmenAutomation({
  rootState: source(root),
  controls: captured.controls,
  costs,
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

const initialInput = adapter.reader.readCycle(true);
assert.equal(initialInput.craftsmenMaximum, 4);
assert.equal(
  initialInput.crafting.find(({ jobToken }) => jobToken === 0).affordability,
  100,
);
assert.equal(runJobsAutomation(adapter, true).status, "succeeded");
assert.equal(root.city.foundry.Plywood, 0);
assert.equal(root.city.foundry.Brick, 2);
assert.deepEqual(captured.calls, [
  { method: "sub", id: "Plywood" },
  { method: "sub", id: "Plywood" },
  { method: "add", id: "Brick" },
  { method: "add", id: "Brick" },
]);

const cappedRoot = makeRoot();
cappedRoot.city.foundry.Plywood = 0;
cappedRoot.city.foundry.Scarletite = 2;
cappedRoot.city.foundry.crafting = 2;
cappedRoot.city.foundry.rcap.Scarletite = 1;
cappedRoot.resource.Scarletite = { amount: 0 };
const cappedControls = controlsFor(cappedRoot);
const cappedAdapter = createCapturedCraftsmenAutomation({
  rootState: source(cappedRoot),
  controls: cappedControls.controls,
  costs,
  readSettings: () => ({
    craftScarletite: true,
    job_Scarletite: true,
    foundry_w_Scarletite: 1,
  }),
});
const cappedInput = cappedAdapter.reader.readCycle(true);
assert.equal(
  cappedInput.crafting.find(
    ({ jobToken }) => cappedInput.jobs[jobToken].id === "Scarletite",
  ).buildingCapacity,
  1,
);
assert.equal(cappedInput.craftsmenMaximum, 4);

const malformedRoot = makeRoot();
const malformedControls = controlsFor(malformedRoot);
const malformedAdapter = createCapturedCraftsmenAutomation({
  rootState: source(malformedRoot),
  controls: malformedControls.controls,
  costs,
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
  costs,
  readSettings: () => ({ craftPlywood: true, job_Plywood: true }),
});
const staleInput = staleAdapter.reader.readCycle(true);
const staleDecision = planJobs(staleInput);
staleRoot.city.foundry.Plywood = 1;
assert.equal(staleAdapter.executor.execute(staleDecision).status, "stale");

const poolRoot = makeRoot();
const poolControls = controlsFor(poolRoot);
const poolAdapter = createCapturedCraftsmenAutomation({
  rootState: source(poolRoot),
  controls: poolControls.controls,
  costs,
  readSettings: () => ({ craftPlywood: true, job_Plywood: true }),
});
const poolDecision = planJobs(poolAdapter.reader.readCycle(true));
poolRoot.civic.craftsman.workers = 1;
assert.equal(poolAdapter.executor.execute(poolDecision).status, "stale");

const missingRoot = makeRoot();
const missingControls = controlsFor(missingRoot, false);
const missingAdapter = createCapturedCraftsmenAutomation({
  rootState: source(missingRoot),
  controls: missingControls.controls,
  costs,
  readSettings: () => ({}),
});
assert.equal(runJobsAutomation(missingAdapter, true).status, "succeeded");

console.log("captured-craftsmen ok");
