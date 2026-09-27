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

let root = { settings: { civTabs: 3 } };
let nowMs = 0;
const unavailable = [];
const techHandles = new Map([
  ["tech-mining", { elementId: "tech-mining", generation: 1 }],
]);
const researchControl = createCapturedProgressionControl({
  rootState: {
    readRoot: () => root,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: (id) => techHandles.get(id),
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [...techHandles.keys()],
  },
  mountSuppression: { available: false, withoutMounting: () => undefined },
  panels: { open: () => ({ close: () => {} }) },
  drawnActions: {
    exists: (selector) => selector === "#tech",
    read: (selector) =>
      selector === "#tech .action"
        ? [{ id: "tech-mining", cost: { Knowledge: 5 } }]
        : [{ id: "tech-old-mining", cost: {} }],
  },
  drawnProjects: { read: () => undefined, exists: () => false },
  readSettings: () => ({}),
  needGrantedTechs: () => true,
  onUnavailable: (reason) => unavailable.push(reason),
  nowMs: () => nowMs,
});

assert.deepEqual(
  researchControl.sampleOfferedTechs()?.map(({ elementId }) => elementId),
  ["tech-mining"],
  unavailable.join("; "),
);
assert.deepEqual([...researchControl.readGrantedTechs()], ["tech-old-mining"]);
nowMs = 20_000;
root = undefined;
assert.equal(researchControl.sampleOfferedTechs(), undefined);
assert.equal(researchControl.readGrantedTechs(), undefined);

console.log("captured-progression-control ok");
