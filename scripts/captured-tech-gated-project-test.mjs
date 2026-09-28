import assert from "node:assert/strict";
import { createCapturedBuildSource } from "../src/adapters/evolve/progression/build/captured-build.ts";
import { createCapturedBuildPolicyReader } from "../src/adapters/evolve/progression/build/captured-build-policy.ts";

const TEST_LAUNCH = "space-test_launch";
const MOON_LAUNCH = "space-moon_mission";
const root = {
  tech: { space: 1, space_explore: 2 },
  space: {},
};
const actionCalls = [];
const handles = new Map(
  [TEST_LAUNCH, MOON_LAUNCH].map((elementId, index) => [
    elementId,
    {
      elementId,
      generation: index + 1,
      methods: ["action"],
      data: { title: elementId },
    },
  ]),
);
const controls = {
  resolve: (elementId) => handles.get(elementId),
  invoke: (handle, method) => {
    if (!handles.has(handle.elementId) || method !== "action")
      return { ok: false, reason: "unknown-method" };
    actionCalls.push(handle.elementId);
    root.tech.space += 1;
    return { ok: true, value: true };
  },
  capturedElementIds: () => [...handles.keys()],
};
const rootState = {
  readRoot: () => root,
  isReactivitySuppressed: () => false,
  subscribeRootReplaced: () => () => {},
};
const reader = createCapturedBuildPolicyReader({
  rootState,
  controls,
  getSettings: () => ({ autoBuild: true }),
  readKnowledge: () => ({
    knowledgeRequiredByTechs: 0,
    levels: {
      cheapestTechKnowledge: 0,
      knowledgeRequiredByBuildTargets: 0,
      knowledgeCapacity: 0,
    },
  }),
});

assert.deepEqual(
  reader().buildings.map((target) => target.key),
  [TEST_LAUNCH],
  "only Test Launch is available at Space I",
);

const build = createCapturedBuildSource({
  rootState,
  controls,
  costs: {
    readCost: (elementId) =>
      handles.has(elementId) ? { cost: { Money: 1 } } : undefined,
  },
  readTargets: () => reader().buildings,
});

assert.deepEqual(
  build.beginCycle().map((candidate) => candidate.key),
  [TEST_LAUNCH],
);
const testLaunch = build.execute(TEST_LAUNCH);
assert.equal(testLaunch.clicked, true, "Space II verifies Test Launch");
assert.equal(testLaunch.disposition, "verified-success");

assert.deepEqual(
  reader().buildings.map((target) => target.key),
  [MOON_LAUNCH],
  "Moon Launch is a one-shot project available at Space II without a region count",
);
assert.deepEqual(
  build.beginCycle().map((candidate) => candidate.key),
  [MOON_LAUNCH],
);
const moonLaunch = build.execute(MOON_LAUNCH);
assert.equal(moonLaunch.clicked, true, "Space III verifies Moon Launch");
assert.equal(moonLaunch.disposition, "verified-success");
assert.deepEqual(actionCalls, [TEST_LAUNCH, MOON_LAUNCH]);
assert.deepEqual(reader().buildings, [], "completed projects are one-shot");

delete root.tech.space;
assert.deepEqual(
  reader().buildings,
  [],
  "a missing progression level is unavailable",
);

console.log("captured-tech-gated-project ok");
