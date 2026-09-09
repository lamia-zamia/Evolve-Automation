import assert from "node:assert/strict";
import {
  createCapturedJobControls,
  executeCapturedJobDecision,
} from "../src/adapters/evolve/civic/captured-job-controls.ts";

const calls = [];
const handles = new Map([
  [
    "civ-farmer",
    {
      elementId: "civ-farmer",
      generation: 1,
      methods: ["add", "sub", "setDefault"],
    },
  ],
  [
    "civ-hunter",
    {
      elementId: "civ-hunter",
      generation: 1,
      methods: ["add", "sub", "setDefault"],
    },
  ],
  [
    "servant-farmer",
    { elementId: "servant-farmer", generation: 1, methods: ["add", "sub"] },
  ],
  [
    "servant-hunter",
    { elementId: "servant-hunter", generation: 1, methods: ["add", "sub"] },
  ],
  ["foundry", { elementId: "foundry", generation: 2, methods: ["add", "sub"] }],
]);
const controls = createCapturedJobControls({
  controls: {
    resolve: (elementId) => handles.get(elementId),
    invoke: (handle, method, args = []) => {
      calls.push({ elementId: handle.elementId, method, args });
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => [...handles.keys()],
  },
});

assert.equal(controls.assign({ elementId: "civ-farmer", count: 2.1 }), true);
assert.deepEqual(calls, [
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
]);

calls.length = 0;
assert.equal(
  controls.unassign({
    elementId: "foundry",
    count: 1,
    craftedResourceId: "Plywood",
  }),
  true,
);
assert.deepEqual(calls, [
  { elementId: "foundry", method: "sub", args: ["Plywood"] },
]);

calls.length = 0;
assert.equal(controls.assign({ elementId: "civ-farmer", count: 0 }), true);
assert.deepEqual(calls, []);
assert.equal(
  controls.setDefault({ elementId: "civ-farmer", jobId: "farmer" }),
  true,
);
assert.deepEqual(calls, [
  { elementId: "civ-farmer", method: "setDefault", args: ["farmer"] },
]);

assert.equal(controls.assign({ elementId: "missing", count: 1 }), false);
assert.equal(
  controls.assign({ elementId: "civ-farmer", count: Infinity }),
  false,
);

calls.length = 0;
assert.deepEqual(
  executeCapturedJobDecision(
    controls,
    {
      manageServants: true,
      jobs: [
        { token: 1, id: "farmer", workers: 3, servants: 2, serves: true },
        { token: 2, id: "hunter", workers: 1, servants: 0, serves: true },
      ],
    },
    {
      kind: "assign-jobs",
      assignments: [
        { jobToken: 1, workers: 1, servants: 1 },
        { jobToken: 2, workers: 2, servants: 2 },
      ],
      selectedDefaultToken: 2,
      moraleIncomeAdjusted: false,
      ironIncomeAdjusted: false,
      maximumSpaceMiners: 0,
      lastPopulationCount: 0,
      lastFarmerCount: 1,
      authorityEntertainerCap: null,
      clearAuthorityEntertainerCap: false,
      craftWinner: null,
      craftDebugMessage: null,
      authorityDebugMessage: null,
    },
  ),
  { status: "succeeded" },
);
assert.deepEqual(calls, [
  { elementId: "civ-farmer", method: "sub", args: [] },
  { elementId: "civ-farmer", method: "sub", args: [] },
  { elementId: "civ-hunter", method: "add", args: [] },
  { elementId: "servant-farmer", method: "sub", args: [] },
  { elementId: "servant-hunter", method: "add", args: [] },
  { elementId: "servant-hunter", method: "add", args: [] },
  { elementId: "civ-hunter", method: "setDefault", args: ["hunter"] },
]);

console.log("captured-job-controls ok");
