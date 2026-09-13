import assert from "node:assert/strict";
import { createCapturedProgressionControl } from "../src/bootstrap/captured-progression-control.ts";

const control = createCapturedProgressionControl({
  rootState: {
    readRoot: () => undefined,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [],
  },
  mountSuppression: {
    begin: () => undefined,
  },
  panels: { open: () => undefined },
  drawnActions: {
    read: () => [],
    exists: () => false,
  },
  drawnProjects: {
    read: () => undefined,
    exists: () => false,
  },
  getBuildingManager: () => {
    throw new Error("must not read the manager before a cycle");
  },
  readSettings: () => ({}),
  getState: () => ({}),
  getResources: () => ({}),
  nowMs: () => 0,
});

assert.deepEqual(control.runConstructionCycle(), {
  status: "rejected",
  failure: {
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  },
});
assert.deepEqual(control.runResearchCycle(), {
  status: "rejected",
  failure: {
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  },
});

console.log("captured-progression-control ok");
