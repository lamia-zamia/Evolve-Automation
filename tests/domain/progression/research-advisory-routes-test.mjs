import assert from "node:assert/strict";
import { planAdvisoryResearchRoutes } from "../../../src/domain/progression/research-advisory-routes.ts";
import { planNativeResearchPrerequisites } from "../../../src/domain/progression/research-prerequisite-planning.ts";

const action = (
  actionId,
  grantTechnology,
  grantLevel,
  requirements = [],
  extra = {},
) => ({
  actionId,
  grantTechnology,
  grantLevel,
  prerequisites: { kind: "declared", requirements },
  hasNativeCondition: false,
  routeRestrictions: undefined,
  restrictions: [],
  ...extra,
});
const req = (technologyId, requiredLevel = 1) => ({
  technologyId,
  requiredLevel,
});
const offer = (actionId, cost = { knowledge: 10 }, generation = 1) => ({
  actionId,
  cost,
  generation,
  nativeAffordable: false,
});
const setup = (definitions, grants, offers, extra = {}) => ({
  targetActionId: "terminal",
  definitions,
  grantLevels: new Map(grants),
  offers,
  validityEpoch: "run-1",
  rootGeneration: 4,
  progressionEpoch: "p-1",
  maxDependencyExpansions: 1000,
  maxDependencyDepth: 64,
  maxCandidates: 20,
  ...extra,
});

{
  const definitions = [
    action("terminal", "goal", 1, [req("alpha", 2)]),
    action("a1", "alpha", 1, [req("ore")]),
    action("a2", "alpha", 2, [req("alpha"), req("beta")]),
    action("ore", "ore", 1),
    action("beta", "beta", 1, [req("ore")]),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["alpha", 0],
        ["beta", 0],
        ["ore", 0],
      ],
      [offer("ore"), offer("beta")],
    ),
  );
  assert.equal(plan.status, "complete");
  assert.deepEqual(
    plan.candidates.map((candidate) => candidate.actionId),
    ["beta", "ore"],
  );
  assert.ok(
    plan.candidates.every(
      (candidate) =>
        candidate.currentActionability === "current-native-offer" &&
        candidate.mandatoryObligation === "not-certified" &&
        candidate.authorizationToSpend === false,
    ),
  );
  assert.ok(
    plan.candidates
      .find((candidate) => candidate.actionId === "ore")
      .dependencyWitness.pathActionIds.includes("terminal"),
  );
  assert.ok(
    plan.candidates.some((candidate) => candidate.actionId === "beta"),
    "cross-technology intermediate frontier is relevant",
  );
  const strictGraph = planNativeResearchPrerequisites({
    targetActionId: "terminal",
    definitions,
    grantLevels: new Map([
      ["goal", 0],
      ["alpha", 0],
      ["beta", 0],
      ["ore", 0],
    ]),
    offeredActionIds: new Set(["ore", "beta"]),
    offerGenerations: new Map([
      ["ore", 1],
      ["beta", 1],
    ]),
    cycle: 1,
    progressionEpoch: "p-1",
    rootGeneration: 4,
    maxDepth: 16,
    maxActions: 100,
  });
  assert.equal(strictGraph.targetStatus, "conditional");
  assert.equal(
    strictGraph.requirements.find((gate) => gate.id === "research:alpha:2")
      .status,
    "conditional",
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("choice")]),
    action("route-a", "choice", 1),
    action("route-b", "choice", 1),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["choice", 0],
      ],
      [offer("route-a"), offer("route-b")],
    ),
  );
  assert.ok(
    plan.candidates.every((candidate) =>
      candidate.dependencyWitness.advancesRequirements.some(
        (requirement) =>
          requirement.alternativeActionIds.join(",") === "route-a,route-b",
      ),
    ),
    "one requirement's OR grant choices remain visible with each witness",
  );
  assert.equal(plan.selectedActionId, undefined);
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("alpha")]),
    action("dynamic-alpha", "alpha", 1, [], {
      prerequisites: { kind: "unknown", reason: "native gate not captured" },
    }),
    action("side-offer", "side", 1),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["alpha", 0],
        ["side", 0],
      ],
      [offer("dynamic-alpha"), offer("side-offer")],
    ),
  );
  assert.equal(plan.status, "complete");
  assert.equal(
    plan.candidates.find((candidate) => candidate.actionId === "side-offer")
      .routeEvidence,
    "unknown",
  );
  assert.ok(
    plan.candidates
      .find((candidate) => candidate.actionId === "side-offer")
      .dependencyWitness.reasons.some((reason) =>
        reason.includes("unknown prerequisite declaration"),
      ),
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("alpha"), req("beta")]),
    action("alpha", "alpha", 1),
    action("beta", "beta", 1),
  ];
  const grants = [
    ["goal", 0],
    ["alpha", 0],
    ["beta", 0],
  ];
  const stocks = [
    {
      resourceId: "knowledge",
      poolId: "anywhere",
      amount: 0,
      capacity: 100,
      netRate: 2,
      rateConfidence: "stable",
      validityEpoch: "run-1",
    },
    {
      resourceId: "oil",
      poolId: "anywhere",
      amount: 0,
      capacity: 100,
      netRate: 1,
      rateConfidence: "stable",
      validityEpoch: "run-1",
    },
  ];
  const choose = (offers, currentStocks = stocks) =>
    planAdvisoryResearchRoutes(
      setup(definitions, grants, offers, {
        resourceStocks: currentStocks,
        commitmentsKnown: true,
      }),
    );
  assert.equal(
    choose([offer("alpha", { knowledge: 10 }), offer("beta", { oil: 10 })])
      .selectedActionId,
    undefined,
  );
  assert.equal(
    choose([offer("alpha", { knowledge: 30 }), offer("beta", { oil: 10 })])
      .selectedActionId,
    undefined,
  );
  assert.equal(
    choose(
      [offer("alpha", { knowledge: 10 }), offer("beta", { oil: 10 })],
      [stocks[0], { ...stocks[1], netRate: 4 }],
    ).selectedActionId,
    undefined,
  );
  const alreadySatisfied = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["alpha", 1],
        ["beta", 1],
      ],
      [offer("alpha"), offer("beta")],
    ),
  );
  assert.deepEqual(
    alreadySatisfied.candidates.map((candidate) => candidate.routeEvidence),
    ["unrelated", "unrelated"],
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("left"), req("right")]),
    action("left", "left", 1, [req("shared")]),
    action("right", "right", 1, [req("shared")]),
    action("shared", "shared", 1),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["left", 0],
        ["right", 0],
        ["shared", 0],
      ],
      [offer("shared")],
    ),
  );
  assert.equal(plan.candidates.length, 1);
  assert.ok(plan.work.sharedSubgraphReuse > 0);
  assert.equal(
    plan.candidates[0].dependencyWitness.advancesRequirementId,
    "research:shared:1",
  );
  assert.ok(
    plan.candidates[0].dependencyWitness.pathActionIds.includes("left"),
    "the shared action retains its left AND branch context",
  );
  assert.ok(
    plan.candidates[0].dependencyWitness.remainingRequirements.some(
      (requirement) => requirement.technologyId === "right",
    ),
    "the shared action retains its right AND branch context",
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("choice")]),
    action("route-a", "choice", 1, [req("a")], { hasNativeCondition: true }),
    action("route-b", "choice", 1, [req("b")]),
    action("a", "a", 1),
    action("b", "b", 1),
  ];
  const applicability = new Map([
    ["route-b", { status: "excluded", reasons: ["route b restriction"] }],
  ]);
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["choice", 0],
        ["a", 0],
        ["b", 0],
      ],
      [offer("a"), offer("b")],
      { applicabilityByActionId: applicability },
    ),
  );
  assert.equal(plan.candidates.length, 2);
  assert.ok(
    plan.candidates
      .find((candidate) => candidate.actionId === "a")
      .dependencyWitness.reasons.includes("native condition not evaluated"),
  );
  assert.ok(
    plan.candidates
      .find((candidate) => candidate.actionId === "b")
      .dependencyWitness.reasons.includes("route b restriction"),
  );
  assert.equal(
    plan.candidates.find((candidate) => candidate.actionId === "b")
      .routeEvidence,
    "excluded",
  );
  assert.equal(plan.selectedActionId, undefined);
  assert.equal(plan.selection, "none");
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("alpha"), req("beta")]),
    action("alpha", "alpha", 1, [], {
      prerequisites: {
        kind: "conditional",
        reason: "dynamic native requirements unavailable",
      },
    }),
    action("beta", "beta", 1),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["alpha", 0],
        ["beta", 0],
      ],
      [offer("beta")],
    ),
  );
  assert.ok(
    plan.candidates[0].dependencyWitness.reasons.includes(
      "dynamic native requirements unavailable",
    ),
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("a")]),
    action("a", "a", 1),
  ];
  const base = setup(
    definitions,
    [
      ["goal", 0],
      ["a", 0],
    ],
    [offer("a", { knowledge: 10 })],
    {
      commitmentsKnown: true,
      resourceStocks: [
        {
          resourceId: "knowledge",
          poolId: "anywhere",
          amount: 0,
          capacity: 100,
          netRate: 2,
          rateConfidence: "stable",
          validityEpoch: "run-1",
        },
      ],
    },
  );
  const slow = planAdvisoryResearchRoutes(base);
  const expensive = planAdvisoryResearchRoutes({
    ...base,
    offers: [offer("a", { knowledge: 20 })],
  });
  const fastProduction = planAdvisoryResearchRoutes({
    ...base,
    resourceStocks: [{ ...base.resourceStocks[0], netRate: 4 }],
  });
  assert.equal(slow.candidates[0].currentAffordability.estimatedTime, 5);
  assert.equal(expensive.candidates[0].currentAffordability.estimatedTime, 10);
  assert.equal(
    fastProduction.candidates[0].currentAffordability.estimatedTime,
    2.5,
  );
  const blockedByCapacity = planAdvisoryResearchRoutes({
    ...base,
    resourceStocks: [{ ...base.resourceStocks[0], capacity: 5 }],
  });
  assert.equal(
    blockedByCapacity.candidates[0].currentAffordability.status,
    "infeasible",
  );
  assert.equal(
    planAdvisoryResearchRoutes({ ...base, expectedRootGeneration: 3 }).status,
    "unavailable",
  );
  assert.equal(
    planAdvisoryResearchRoutes({ ...base, expectedProgressionEpoch: "p-2" })
      .status,
    "unavailable",
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("a")]),
    action("a", "a", 1, [req("b"), req("c")]),
    action("b", "b", 1, [req("a")]),
    action("c", "c", 1),
  ];
  const cycle = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["a", 0],
        ["b", 0],
        ["c", 0],
      ],
      [offer("c")],
    ),
  );
  assert.ok(cycle.work.cycles > 0);
  const limited = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["a", 0],
        ["b", 0],
        ["c", 0],
      ],
      [offer("c")],
      { maxDependencyExpansions: 22 },
    ),
  );
  assert.equal(limited.status, "incomplete");
  assert.equal(limited.work.truncated, true);
  assert.equal(limited.selectedActionId, undefined);
  assert.equal(limited.work.operations, 22);
  assert.ok(limited.work.retainedActionWitnesses > 0);
  assert.ok(limited.work.retainedReasonReferences <= limited.work.operations);
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("a")]),
    action("a-action", "a", 1, [req("b"), req("c")]),
    action("b-action", "b", 1),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["a", 0],
        ["b", 0],
        ["c", 0],
      ],
      [offer("b-action")],
    ),
  );
  const candidate = plan.candidates[0];
  assert.equal(
    candidate.dependencyWitness.advancesRequirementId,
    "research:b:1",
  );
  assert.ok(
    candidate.dependencyWitness.remainingRequirements.some(
      (requirement) =>
        requirement.id === "research:c:1" &&
        requirement.status === "unsatisfied" &&
        requirement.alternativeActionIds.length === 0,
    ),
    "B is evidence for one conjunct while C remains unsupported",
  );
  assert.ok(
    candidate.dependencyWitness.remainingRequirements.some(
      (requirement) =>
        requirement.id === "research:c:1" &&
        requirement.alternativeActionIds.length === 0,
    ),
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("choice")]),
    action("excluded-a", "choice", 1),
    action("excluded-b", "choice", 1),
  ];
  const applicability = new Map([
    ["excluded-a", { status: "excluded", reasons: ["branch A barred"] }],
    ["excluded-b", { status: "excluded", reasons: ["branch B barred"] }],
  ]);
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["choice", 0],
      ],
      [offer("excluded-a"), offer("excluded-b")],
      { applicabilityByActionId: applicability },
    ),
  );
  assert.deepEqual(
    plan.candidates.map((candidate) => candidate.routeEvidence),
    ["excluded", "excluded"],
  );
  assert.equal(plan.selectedActionId, undefined);
  assert.ok(
    plan.candidates.every(
      (candidate) => candidate.dependencyWitness.reasons.length > 0,
    ),
  );
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("choice")]),
    action("route-a", "choice", 1),
    action("route-b", "choice", 1),
  ];
  const plan = planAdvisoryResearchRoutes(
    setup(
      definitions,
      [
        ["goal", 0],
        ["choice", 0],
      ],
      [{ ...offer("route-a"), nativeAffordable: true }, offer("route-b")],
      {
        maxDependencyExpansions: 1000,
        maxCandidates: 1,
        resourceStocks: [
          {
            resourceId: "knowledge",
            poolId: "anywhere",
            amount: 100,
            capacity: 100,
            netRate: 0,
            rateConfidence: "stable",
            validityEpoch: "run-1",
          },
        ],
        commitmentsKnown: true,
      },
    ),
  );
  assert.equal(plan.status, "incomplete");
  assert.ok(
    plan.candidates.some(
      (candidate) =>
        candidate.nativeAffordable &&
        candidate.currentAffordability?.estimatedTime === 0,
    ),
  );
  assert.equal(plan.selectedActionId, undefined);
  assert.ok(plan.work.operations <= 1000);
  assert.ok(plan.work.actionExpansions > 0);
  assert.ok(plan.work.requirementExpansions > 0);
  assert.ok(plan.work.retainedActionWitnesses <= plan.work.operations);
  assert.ok(plan.work.retainedRequirementWitnesses <= plan.work.operations);
  assert.ok(plan.work.retainedAlternativeReferences <= plan.work.operations);
  assert.ok(plan.work.retainedReasonReferences <= plan.work.operations);
  assert.ok(plan.work.retainedPathActionReferences <= plan.work.operations);
  assert.ok(plan.work.peakPendingWalkStates <= plan.work.operations);
  assert.ok(
    plan.candidates.every(
      (candidate) => candidate.routeEvidence !== "unrelated",
    ),
  );
  assert.ok(plan.reasons.some((reason) => reason.includes("coverage")));
}

{
  const definitions = [
    action("terminal", "goal", 1, [req("choice")]),
    action("route-a", "choice", 1),
    action("route-b", "choice", 1),
    action("unrelated", "side", 1),
  ];
  const grants = [
    ["goal", 0],
    ["choice", 0],
    ["side", 0],
  ];
  const offers = [offer("route-a"), offer("route-b"), offer("unrelated")];
  const first = planAdvisoryResearchRoutes(setup(definitions, grants, offers));
  const permuted = planAdvisoryResearchRoutes(
    setup([...definitions].reverse(), grants, [...offers].reverse()),
  );
  const comparable = (plan) => ({
    ...plan,
    work: { ...plan.work, operations: undefined },
  });
  assert.deepEqual(
    comparable(permuted),
    comparable(first),
    "registry and offer ordering cannot change evidence or retained counts",
  );
}

{
  const definitions = [action("terminal", "goal", 1, [req("missing")])];
  const plan = planAdvisoryResearchRoutes(
    setup(definitions, [["goal", 0]], []),
  );
  assert.equal(plan.status, "complete");
  assert.ok(plan.reasons.length === 0);
  assert.equal(plan.selectedActionId, undefined);
}

{
  const plan = planAdvisoryResearchRoutes(
    setup([action("offered", "side", 1)], [["side", 0]], [offer("offered")]),
  );
  assert.equal(plan.status, "unavailable");
  assert.equal(plan.selectedActionId, undefined);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].routeEvidence, "unknown");
  assert.ok(
    plan.candidates[0].dependencyWitness.reasons.some((reason) =>
      reason.includes("terminal action definition is unavailable"),
    ),
  );
}

console.log("Research advisory route tests passed");
