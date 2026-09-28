import assert from "node:assert/strict";
import { createCapturedBuildSource } from "../src/adapters/evolve/progression/build/captured-build.ts";
import { createCapturedBuildPolicyReader } from "../src/adapters/evolve/progression/build/captured-build-policy.ts";
import { CAPTURED_TEST_LAUNCH } from "../src/adapters/evolve/progression/build/captured-test-launch.ts";

assert.equal(CAPTURED_TEST_LAUNCH.elementId, "space-test_launch");
const root = {
  tech: { space: 1 },
  space: {},
};
const actionCalls = [];
const launchHandle = {
  elementId: CAPTURED_TEST_LAUNCH.elementId,
  generation: 1,
  methods: ["action"],
  data: { title: "Test Launch" },
};
const controls = {
  resolve: (elementId) =>
    elementId === CAPTURED_TEST_LAUNCH.elementId ? launchHandle : undefined,
  invoke: (handle, method) => {
    if (handle !== launchHandle || method !== "action")
      return { ok: false, reason: "unknown-method" };
    actionCalls.push(method);
    root.tech.space = 2;
    return { ok: true, value: true };
  },
  capturedElementIds: () => [CAPTURED_TEST_LAUNCH.elementId],
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

assert.ok(
  reader().buildings.some(
    (target) => target.key === CAPTURED_TEST_LAUNCH.elementId,
  ),
  "Auto Build must include the offered Test Launch action after Space I",
);

const build = createCapturedBuildSource({
  rootState,
  controls,
  costs: {
    readCost: (elementId) =>
      elementId === CAPTURED_TEST_LAUNCH.elementId
        ? { cost: { Money: 100_000, Oil: 7_500 } }
        : undefined,
  },
  readTargets: () => reader().buildings,
});
assert.deepEqual(
  build.beginCycle().map((candidate) => candidate.key),
  [CAPTURED_TEST_LAUNCH.elementId],
);
const result = build.execute(CAPTURED_TEST_LAUNCH.elementId);
assert.equal(result.clicked, true, "Space II verifies the launch completion");
assert.equal(result.disposition, "verified-success");
assert.deepEqual(actionCalls, ["action"]);
assert.deepEqual(reader().buildings, [], "a completed launch is one-shot");

delete root.tech.space;
assert.deepEqual(
  reader().buildings,
  [],
  "an uninitialized tech.space is unavailable",
);
