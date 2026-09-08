import assert from "node:assert/strict";
import { createCapturedJobControls } from "../src/adapters/evolve/civic/captured-job-controls.ts";

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

console.log("captured-job-controls ok");
