import assert from "node:assert/strict";

import {
  combinePrerequisiteStatuses,
  planMadGoal,
  traverseGoalGraph,
} from "../../../src/domain/progression/goal-planning.ts";
import { runCapturedDiagnosticSafely } from "../../../src/bootstrap/captured-diagnostic.ts";

const goal = (id, children = [], operator = "all") => ({
  id,
  scope: "run",
  predicate: id,
  provenance: "native-prerequisite",
  reason: "test edge",
  status: "unsatisfied",
  ...(children.length === 0
    ? {}
    : { prerequisites: { operator, goalIds: children } }),
});

const madInput = (overrides = {}) => ({
  selectedPrestige: "mad",
  prestigePermission: true,
  resetConfirmed: false,
  madResearchLevel: 0,
  madControlDisplay: true,
  madControlBound: true,
  madArmed: false,
  madCataclysm: false,
  madWaitPolicyGate: true,
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

const goalById = (plan, id) => plan.goals.find((entry) => entry.id === id);

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
  graph.set("terminal", goal("terminal", ["left", "right"], "any"));
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

{
  const plan = planMadGoal(
    madInput({
      offeredMadTech: {
        action: { family: "research", nativeId: "tech-mad" },
        costs: { Knowledge: 120_000, Oil: 8_500, Uranium: 1_250 },
        nativeAffordable: false,
        generation: 7,
      },
      resources: new Map([
        ["Knowledge", { amount: 20_000, capacity: 200_000, netRate: 25 }],
        ["Oil", { amount: 1_000, capacity: -1, netRate: 2 }],
        ["Uranium", { amount: 500, capacity: 10_000, netRate: -2 }],
      ]),
    }),
  );
  const rootEdges = goalById(plan, "prestige:mad").prerequisites;
  assert.equal(rootEdges.operator, "all");
  assert.deepEqual(rootEdges.goalIds, [
    "research:mad",
    "prestige:mad-reset-eligibility",
  ]);
  const offerEdges = goalById(plan, "research:mad:current-offer").prerequisites;
  assert.equal(offerEdges.operator, "all");
  assert.deepEqual(offerEdges.goalIds, [
    "resource:Knowledge",
    "resource:Oil",
    "resource:Uranium",
  ]);
  assert.equal(new Set(offerEdges.goalIds).size, 3);
  assert.deepEqual(
    plan.frontierTrace.filter((entry) => entry.startsWith("resource:")),
    [
      "resource:Knowledge:unsatisfied",
      "resource:Oil:unsatisfied",
      "resource:Uranium:unsatisfied",
    ],
  );
  assert.equal(plan.status, "unsatisfied");
  assert.equal(plan.affordability, "consistent");
  assert.deepEqual(plan.blockers, [
    "Knowledge:stock-below-native-price",
    "Oil:stock-below-native-price",
    "Uranium:stock-below-native-price",
    "Uranium:nonpositive-net-production",
  ]);
  assert.ok(!plan.blockers.includes("Oil:capacity-below-native-price"));
  assert.equal(plan.currentSubgoal, "tech-mad");
  assert.equal(plan.freshness.offerGeneration, 7);
}

{
  const inconsistentGrantAndControl = planMadGoal(
    madInput({
      madResearchLevel: 0,
      madControlDisplay: true,
      madControlBound: true,
      offeredMadTech: undefined,
      offerCatalogAvailable: false,
    }),
  );
  assert.equal(
    goalById(inconsistentGrantAndControl, "research:mad").status,
    "unsatisfied",
  );
  assert.equal(
    goalById(inconsistentGrantAndControl, "prestige:mad-control").status,
    "satisfied",
  );
  assert.equal(
    goalById(inconsistentGrantAndControl, "prestige:mad-reset-eligibility")
      .status,
    "satisfied",
  );
  assert.equal(inconsistentGrantAndControl.status, "unsatisfied");
  assert.equal(inconsistentGrantAndControl.currentSubgoal, "research:mad");

  const grantedButHidden = planMadGoal(
    madInput({
      madResearchLevel: 1,
      madControlDisplay: false,
      madControlBound: undefined,
      offeredMadTech: undefined,
      offerCatalogAvailable: false,
    }),
  );
  assert.equal(goalById(grantedButHidden, "research:mad").status, "satisfied");
  assert.equal(grantedButHidden.currentSubgoal, "prestige:mad-control");
  assert.equal(grantedButHidden.status, "unsatisfied");
  assert.equal(
    goalById(grantedButHidden, "prestige:mad-control").status,
    "unsatisfied",
  );

  const missingControlFact = planMadGoal(
    madInput({
      madResearchLevel: 1,
      madControlDisplay: undefined,
      madControlBound: undefined,
      offeredMadTech: undefined,
      offerCatalogAvailable: false,
    }),
  );
  assert.equal(missingControlFact.status, "unavailable");
  assert.equal(missingControlFact.currentSubgoal, "prestige:mad-control");
  assert.equal(
    goalById(missingControlFact, "research:mad").status,
    "satisfied",
  );
}

{
  const missingRoot = planMadGoal(
    madInput({
      madResearchLevel: undefined,
      madControlDisplay: undefined,
      madControlBound: undefined,
      madArmed: undefined,
      madCataclysm: undefined,
      madWaitPolicyGate: undefined,
      offeredMadTech: undefined,
      offerCatalogAvailable: false,
    }),
  );
  assert.equal(missingRoot.status, "unavailable");
  assert.equal(goalById(missingRoot, "research:mad").status, "unavailable");
  assert.ok(
    missingRoot.unavailableFacts.some((fact) => fact.includes("tech.mad")),
  );

  const knownMissingResearch = planMadGoal(
    madInput({
      offeredMadTech: undefined,
      offerCatalogAvailable: true,
    }),
  );
  assert.equal(
    goalById(knownMissingResearch, "research:mad").status,
    "unsatisfied",
  );
  assert.equal(knownMissingResearch.status, "unsatisfied");
  assert.equal(knownMissingResearch.currentSubgoal, "research:mad");
  assert.ok(
    knownMissingResearch.unavailableFacts.some((fact) =>
      fact.includes("locked requirements are unavailable"),
    ),
  );

  const missingCatalog = planMadGoal(
    madInput({ offeredMadTech: undefined, offerCatalogAvailable: false }),
  );
  assert.equal(missingCatalog.status, "unsatisfied");
  assert.equal(goalById(missingCatalog, "research:mad").status, "unsatisfied");
  assert.ok(
    missingCatalog.unavailableFacts.some((fact) =>
      fact.includes("offer catalog is unavailable"),
    ),
  );
}

{
  const armed = planMadGoal(
    madInput({
      madResearchLevel: 1,
      offeredMadTech: undefined,
      madArmed: true,
      madWaitPolicyGate: true,
    }),
  );
  assert.equal(goalById(armed, "research:mad").status, "satisfied");
  assert.equal(armed.currentSubgoal, "prestige:mad-native-launch-gate");
  assert.equal(armed.status, "unsatisfied");
  assert.ok(
    !armed.blockers.includes("MAD is armed or otherwise manually owned"),
  );

  const disabled = planMadGoal(
    madInput({
      madResearchLevel: 1,
      offeredMadTech: undefined,
      prestigePermission: false,
    }),
  );
  assert.equal(disabled.status, "blocked");
  assert.deepEqual(disabled.blockers, ["automation-permission-disabled"]);

  const waitNotMet = planMadGoal(
    madInput({
      madResearchLevel: 1,
      offeredMadTech: undefined,
      madWaitPolicyGate: false,
    }),
  );
  assert.equal(waitNotMet.currentSubgoal, "prestige:mad-population-soldiers");
  assert.equal(waitNotMet.status, "unsatisfied");

  const readyButUnconfirmed = planMadGoal(
    madInput({
      madResearchLevel: 1,
      madControlDisplay: true,
      madControlBound: true,
      madArmed: false,
      madCataclysm: false,
      madWaitPolicyGate: true,
      resetConfirmed: false,
    }),
  );
  assert.equal(
    goalById(readyButUnconfirmed, "prestige:mad-reset-eligibility").status,
    "satisfied",
  );
  assert.equal(readyButUnconfirmed.status, "unsatisfied");

  assert.equal(
    planMadGoal(
      madInput({
        resetConfirmed: true,
        madResearchLevel: undefined,
        madControlDisplay: undefined,
        madControlBound: undefined,
        madArmed: undefined,
        madCataclysm: undefined,
        madWaitPolicyGate: undefined,
        offeredMadTech: undefined,
        offerCatalogAvailable: false,
      }),
    ).status,
    "satisfied",
  );
}

{
  const unlimited = planMadGoal(
    madInput({
      resources: new Map([
        ["Knowledge", { amount: 50_000, capacity: -1, netRate: 0 }],
      ]),
    }),
  );
  assert.deepEqual(unlimited.blockers, [
    "Knowledge:stock-below-native-price",
    "Knowledge:nonpositive-net-production",
  ]);

  const disagreement = planMadGoal(
    madInput({
      offeredMadTech: {
        action: { family: "research", nativeId: "tech-mad" },
        costs: { Knowledge: 120_000 },
        nativeAffordable: true,
        generation: 7,
      },
      resources: new Map([
        ["Knowledge", { amount: 20_000, capacity: 200_000, netRate: 25 }],
      ]),
    }),
  );
  assert.equal(disagreement.affordability, "inconsistent");
  assert.equal(
    goalById(disagreement, "research:mad:current-offer").status,
    "unavailable",
  );
  assert.ok(
    disagreement.unavailableFacts.some((fact) =>
      fact.includes("disagrees with captured stock and capacity"),
    ),
  );

  const capacityLimited = planMadGoal(
    madInput({
      offeredMadTech: {
        action: { family: "research", nativeId: "tech-mad" },
        costs: { Knowledge: 120_000 },
        nativeAffordable: false,
        generation: 7,
      },
      resources: new Map([
        ["Knowledge", { amount: 130_000, capacity: 100_000, netRate: 25 }],
      ]),
    }),
  );
  assert.equal(capacityLimited.affordability, "consistent");
  assert.equal(
    goalById(capacityLimited, "resource:Knowledge").status,
    "unsatisfied",
  );
  assert.ok(
    capacityLimited.blockers.includes("Knowledge:capacity-below-native-price"),
  );

  const unknownPrice = planMadGoal(
    madInput({
      offeredMadTech: {
        action: { family: "research", nativeId: "tech-mad" },
        costs: { Knowledge: 10, Army: 2 },
        nativeAffordable: false,
        generation: 7,
      },
      resources: new Map([
        ["Knowledge", { amount: 100, capacity: 200, netRate: 1 }],
      ]),
    }),
  );
  assert.equal(unknownPrice.affordability, "unavailable");
  assert.equal(goalById(unknownPrice, "resource:Army").status, "unavailable");
  assert.ok(
    unknownPrice.unavailableFacts.some((fact) =>
      fact.includes("Army is unavailable"),
    ),
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

{
  const weightA = planMadGoal(madInput());
  const weightB = planMadGoal(
    madInput({ operationalWeightMagnitude: 999_999 }),
  );
  assert.deepEqual(weightA, weightB);
}

{
  let failureObserved = false;
  let laterPhaseCount = 0;
  runCapturedDiagnosticSafely(
    () => {
      throw new Error("injected goal observation failure");
    },
    (error) => {
      failureObserved = error instanceof Error;
    },
  );
  const runLaterAutomationPhase = () => {
    laterPhaseCount += 1;
  };
  runLaterAutomationPhase();
  assert.equal(failureObserved, true);
  assert.equal(laterPhaseCount, 1);

  assert.doesNotThrow(() =>
    runCapturedDiagnosticSafely(
      () => {
        throw new Error("observation failed");
      },
      () => {
        throw new Error("diagnostic sink failed");
      },
    ),
  );
}
