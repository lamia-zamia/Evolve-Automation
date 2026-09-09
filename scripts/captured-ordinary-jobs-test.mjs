import assert from "node:assert/strict";
import { planJobs } from "../src/domain/civic/jobs.ts";
import {
  createCapturedFullJobsAutomation,
  createCapturedOrdinaryJobsAutomation,
} from "../src/adapters/evolve/civic/captured-ordinary-jobs.ts";

const root = {
  civic: {
    d_job: "unemployed",
    unemployed: {
      job: "unemployed",
      assigned: 3,
      workers: 3,
      max: 0,
      display: true,
    },
    farmer: {
      job: "farmer",
      assigned: 0,
      workers: 0,
      max: -1,
      display: true,
    },
  },
  resource: { Population: { amount: 3, max: 10 } },
};
const calls = [];
const controls = {
  capturedElementIds: () => ["civ-unemployed", "civ-farmer"],
  resolve: (elementId) =>
    elementId.startsWith("civ-")
      ? { elementId, generation: 1, methods: ["add", "sub", "setDefault"] }
      : undefined,
  invoke: (handle, method, args = []) => {
    calls.push({ elementId: handle.elementId, method, args });
    if (method === "setDefault") {
      root.civic.d_job = args[0];
    } else {
      const id = handle.elementId.slice("civ-".length);
      root.civic[id].workers += method === "add" ? 1 : -1;
    }
    return { ok: true, value: undefined };
  },
};
const automation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    job_unemployed: true,
    job_farmer: true,
    jobSetDefault: true,
  }),
});

const input = automation.reader.readCycle(false);
assert.equal(input.available, true);
const decision = planJobs(input);
assert.ok(decision);
assert.equal(automation.executor.execute(decision).status, "succeeded");
assert.equal(root.civic.farmer.workers, 3);
assert.equal(root.civic.d_job, "farmer");
assert.deepEqual(calls, [
  { elementId: "civ-unemployed", method: "sub", args: [] },
  { elementId: "civ-unemployed", method: "sub", args: [] },
  { elementId: "civ-unemployed", method: "sub", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "setDefault", args: ["farmer"] },
]);

const authorityAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ authorityManage: true }),
});
assert.equal(
  authorityAutomation.reader.readCycle(false).available,
  false,
  "authority management stays unavailable until its live inputs are captured",
);

const partialAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed"],
    resolve: (elementId) =>
      elementId === "civ-unemployed"
        ? {
            elementId,
            generation: 1,
            methods: ["add", "sub", "setDefault"],
          }
        : undefined,
  },
  readSettings: () => ({ job_unemployed: true, job_farmer: true }),
});
assert.equal(
  partialAutomation.reader.readCycle(false).available,
  false,
  "a partial live job catalog cannot plan against uncaptured workers",
);

const fullRoot = {
  civic: {
    d_job: "unemployed",
    unemployed: {
      job: "unemployed",
      assigned: 4,
      workers: 4,
      max: 0,
      display: true,
    },
    farmer: {
      job: "farmer",
      assigned: 0,
      workers: 0,
      max: -1,
      display: true,
    },
    craftsman: { workers: 1, max: 2 },
  },
  city: {
    foundry: {
      Plywood: 1,
      Brick: 0,
      crafting: 1,
      cap: 2,
      rcap: {},
    },
  },
  race: {
    servants: {
      jobs: {},
      sjobs: { Plywood: 1 },
      max: 0,
      used: 0,
      smax: 1,
      sused: 1,
    },
  },
  resource: {
    Population: { amount: 4, max: 10 },
    Plywood: { amount: 100 },
    Brick: { amount: 0 },
    Iron: { amount: 100 },
  },
};
const fullCalls = [];
const fullControls = {
  capturedElementIds: () => [
    "civ-unemployed",
    "civ-farmer",
    "foundry",
    "scraftPlywood",
    "scraftBrick",
  ],
  resolve: (elementId) =>
    elementId === "foundry" ||
    elementId.startsWith("civ-") ||
    elementId.startsWith("scraft")
      ? {
          elementId,
          generation: 1,
          methods:
            elementId === "foundry" || elementId.startsWith("scraft")
              ? ["add", "sub"]
              : ["add", "sub", "setDefault"],
        }
      : undefined,
  invoke: (handle, method, args = []) => {
    fullCalls.push({ elementId: handle.elementId, method, args });
    if (handle.elementId.startsWith("scraft")) {
      const id = args[0];
      fullRoot.race.servants.sjobs[id] =
        (fullRoot.race.servants.sjobs[id] ?? 0) + (method === "add" ? 1 : -1);
      fullRoot.race.servants.sused += method === "add" ? 1 : -1;
    } else if (handle.elementId === "foundry") {
      const id = args[0];
      fullRoot.city.foundry[id] += method === "add" ? 1 : -1;
      fullRoot.city.foundry.crafting += method === "add" ? 1 : -1;
      fullRoot.civic.craftsman.workers += method === "add" ? 1 : -1;
      fullRoot.civic.unemployed.workers += method === "add" ? -1 : 1;
    } else if (method === "setDefault") {
      fullRoot.civic.d_job = args[0];
    } else {
      const id = handle.elementId.slice("civ-".length);
      fullRoot.civic[id].workers += method === "add" ? 1 : -1;
    }
    return { ok: true, value: undefined };
  },
};
const fullAutomation = createCapturedFullJobsAutomation({
  rootState: { readRoot: () => fullRoot },
  controls: fullControls,
  readSettings: () => ({
    job_unemployed: true,
    job_farmer: true,
    productionCraftsmen: "always",
    craftPlywood: true,
    job_Plywood: true,
    foundry_w_Plywood: 1,
    craftBrick: true,
    job_Brick: true,
    foundry_w_Brick: 1,
  }),
  costs: {
    read: (id) =>
      id === "Plywood" || id === "Brick" ? new Map([["Iron", 1]]) : undefined,
  },
});
const fullInput = fullAutomation.reader.readCycle(false);
assert.equal(fullInput.available, true);
const fullDecision = planJobs(fullInput);
assert.ok(fullDecision);
assert.equal(
  fullDecision.assignments.some(
    ({ jobToken, workers }) => jobToken >= 2 && workers > 0,
  ),
  true,
);
assert.equal(fullAutomation.executor.execute(fullDecision).status, "succeeded");
assert.equal(fullRoot.city.foundry.Brick, 2);
assert.equal(
  fullCalls.some(({ elementId }) => elementId === "foundry"),
  true,
);
assert.equal(
  fullCalls.some(({ elementId }) => elementId.startsWith("scraft")),
  true,
);

console.log("captured-ordinary-jobs ok");
