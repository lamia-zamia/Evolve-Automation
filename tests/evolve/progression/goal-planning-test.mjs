import assert from "node:assert/strict";

import {
  combinePrerequisiteStatuses,
  planMadGoal,
  traverseGoalGraph,
} from "../../../src/domain/progression/goal-planning.ts";

const goal = (id, children = []) => ({
  id,
  scope: "run",
  predicate: id,
  provenance: "native-prerequisite",
  reason: "test edge",
  status: "unsatisfied",
  ...(children.length === 0
    ? {}
    : { prerequisites: { operator: "all", goalIds: children } }),
});

{
  const graph = new Map([
    ["terminal", goal("terminal", ["left", "right"])],
    ["left", goal("left", ["shared"])],
    ["right", goal("right", ["shared"])],
    ["shared", goal("shared")],
  ]);
  assert.deepEqual(
    traverseGoalGraph("terminal", graph, { maxDepth: 5, maxGoals: 8 }),
    {
      visited: ["terminal", "left", "shared", "right"],
      cycles: [],
      limits: [],
      missing: [],
    },
  );
  graph.set("terminal", {
    ...goal("terminal", ["left", "right"]),
    prerequisites: { operator: "any", goalIds: ["left", "right"] },
  });
  assert.equal(graph.get("terminal").prerequisites.operator, "any");
  assert.equal(
    combinePrerequisiteStatuses("all", ["satisfied", "unsatisfied"]),
    "unsatisfied",
  );
  assert.equal(
    combinePrerequisiteStatuses("any", ["blocked", "satisfied"]),
    "satisfied",
  );
  assert.equal(
    combinePrerequisiteStatuses("all", ["satisfied", "unavailable"]),
    "unavailable",
  );
  assert.equal(
    combinePrerequisiteStatuses("all", ["satisfied", "satisfied"]),
    "satisfied",
  );
  assert.equal(
    combinePrerequisiteStatuses("any", ["blocked", "unsatisfied"]),
    "unsatisfied",
  );
}

const madInput = (overrides = {}) => ({
  selectedPrestige: "mad",
  prestigePermission: true,
  manualOwnership: false,
  resetConfirmed: false,
  madResearchLevel: 0,
  madResearchGate: false,
  madResetGate: false,
  offeredMadTech: {
    action: { family: "research", nativeId: "tech-mad" },
    costs: { Knowledge: 120_000 },
    nativeAffordable: false,
    generation: 7,
  },
  offerCatalogAvailable: true,
  resources: new Map([
    ["Knowledge", { amount: 20_000, capacity: 200_000, netRate: 25 }],
  ]),
  cycle: 8,
  progressionEpoch: "run:4",
  ...overrides,
});

{
  const result = planMadGoal(madInput());
  assert.equal(result.selectedGoal.id, "prestige:mad");
  assert.equal(result.status, "blocked");
  assert.equal(result.currentSubgoal, "tech-mad");
  assert.deepEqual(result.verifiedChain, [
    "prestige:mad",
    "research:mad",
    "tech-mad",
    "resource:Knowledge",
  ]);
  assert.deepEqual(result.blockers, ["Knowledge:stock-below-native-price"]);
  assert.equal(result.freshness.offerGeneration, 7);
}

{
  const satisfiedResearch = planMadGoal(
    madInput({
      madResearchLevel: 1,
      madResearchGate: true,
      madResetGate: false,
      offeredMadTech: undefined,
    }),
  );
  assert.equal(satisfiedResearch.currentSubgoal, "prestige:mad-reset-gate");
  assert.deepEqual(satisfiedResearch.blockers, [
    "native soldier or population reset gate is unsatisfied",
  ]);
  assert.equal(
    planMadGoal(madInput({ selectedPrestige: "bioseed" })).status,
    "unavailable",
  );
}

{
  const resources = new Map([
    ["Knowledge", { amount: 100_000, capacity: 100_000, netRate: 0 }],
  ]);
  const result = planMadGoal(
    madInput({
      resources,
      offeredMadTech: {
        action: { family: "research", nativeId: "tech-mad" },
        costs: { Knowledge: 120_000 },
        nativeAffordable: false,
        generation: 7,
      },
    }),
  );
  assert.deepEqual(result.blockers, [
    "Knowledge:stock-below-native-price",
    "Knowledge:capacity-below-native-price",
    "Knowledge:nonpositive-net-production",
  ]);
}

{
  const result = planMadGoal(
    madInput({
      resources: new Map([["Knowledge", { amount: 20_000, netRate: -3 }]]),
    }),
  );
  assert.deepEqual(result.blockers, [
    "Knowledge:stock-below-native-price",
    "Knowledge:nonpositive-net-production",
  ]);
  assert.ok(
    result.unavailableFacts.includes(
      "current capacity for Knowledge is unavailable",
    ),
  );
}

{
  assert.equal(
    planMadGoal(
      madInput({
        madResearchLevel: 1,
        madResearchGate: true,
        madResetGate: true,
        resetConfirmed: true,
        offeredMadTech: undefined,
        offerCatalogAvailable: false,
      }),
    ).status,
    "satisfied",
  );

  const missingOffer = planMadGoal(
    madInput({
      offeredMadTech: undefined,
    }),
  );
  assert.equal(missingOffer.currentSubgoal, "research:mad");
  assert.match(
    missingOffer.unavailableFacts[0],
    /locked dependencies are unavailable/,
  );
}

{
  const disabled = planMadGoal(
    madInput({
      madResearchLevel: 1,
      madResearchGate: true,
      madResetGate: true,
      prestigePermission: false,
      manualOwnership: true,
    }),
  );
  assert.deepEqual(disabled.blockers, [
    "automation-permission-disabled",
    "MAD is armed or otherwise manually owned",
  ]);
  const unexplainedNativeGate = planMadGoal(
    madInput({
      prestigePermission: false,
      resources: new Map([
        ["Knowledge", { amount: 150_000, capacity: 200_000, netRate: 25 }],
      ]),
    }),
  );
  assert.ok(
    unexplainedNativeGate.unavailableFacts.includes(
      "native affordability is false but captured costs do not explain it",
    ),
  );
  const operationalWeightMagnitude = 999_999;
  assert.deepEqual(
    planMadGoal(madInput()),
    planMadGoal(madInput({ operationalWeightMagnitude })),
  );
}

{
  const graph = new Map([
    ["a", goal("a", ["b"])],
    ["b", goal("b", ["a", "missing"])],
  ]);
  const result = traverseGoalGraph("a", graph, { maxDepth: 3, maxGoals: 8 });
  assert.deepEqual(result.cycles, [["a", "b", "a"]]);
  assert.deepEqual(result.missing, ["missing"]);
  assert.deepEqual(
    traverseGoalGraph("a", graph, { maxDepth: 0, maxGoals: 8 }).limits,
    ["depth:b"],
  );
  assert.deepEqual(
    traverseGoalGraph("a", graph, { maxDepth: 3, maxGoals: 1 }).limits,
    ["goals:b"],
  );
}
