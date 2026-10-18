import assert from "node:assert/strict";
import { projectAdvisoryResearchResources } from "../../../src/domain/progression/advisory-resource-projection.ts";
import { planAdvisoryResearchRoutes } from "../../../src/domain/progression/research-advisory-routes.ts";

const action = (actionId, grantTechnology, requirements = []) => ({
  actionId,
  grantTechnology,
  grantLevel: 1,
  prerequisites: {
    kind: "declared",
    requirements: requirements.map((requirement) => ({
      requiredLevel: 1,
      ...requirement,
    })),
  },
  hasNativeCondition: false,
  routeRestrictions: undefined,
  restrictions: [],
});
const routePlan = ({
  definitions = [
    action("terminal", "goal", [{ technologyId: "route" }]),
    action("a", "route"),
  ],
  offers = [
    {
      actionId: "a",
      generation: 1,
      cost: { Knowledge: 10 },
      nativeAffordable: false,
    },
  ],
  grantLevels = new Map([
    ["goal", 0],
    ["route", 0],
  ]),
} = {}) =>
  planAdvisoryResearchRoutes({
    targetActionId: "terminal",
    definitions,
    grantLevels,
    offers,
    validityEpoch: "run|root:1",
    rootGeneration: 1,
    progressionEpoch: "run",
    maxDependencyExpansions: 1000,
    maxDependencyDepth: 32,
    maxCandidates: 10,
  });
const base = (overrides = {}) => ({
  routes: routePlan(),
  prices: [{ actionId: "a", price: [{ resourceId: "Knowledge", amount: 10 }] }],
  observations: [
    {
      resourceId: "Knowledge",
      amount: 2,
      capacity: 100,
      netRate: 1,
      rateConfidence: "observed",
      validityEpoch: "run|root:1",
    },
  ],
  commitments: [],
  commitmentsKnown: true,
  validityEpoch: "run|root:1",
  mandatoryEvidence: "unavailable",
  mandatoryActionIds: [],
  ...overrides,
});

{
  const initial = projectAdvisoryResearchResources(base());
  const candidate = initial.candidates[0];
  assert.equal(candidate.nativeAffordability, "unaffordable");
  assert.equal(candidate.requirements[0].holding, 2);
  assert.equal(candidate.requirements[0].capacity, 100);
  assert.equal(candidate.requirements[0].observedNetRate, 1);
  assert.equal(candidate.estimatedTimeToAfford.validated, undefined);
  assert.equal(candidate.estimatedTimeToAfford.diagnostic, 8);
  assert.equal(candidate.estimatedTimeToAfford.authority, "provisional");

  const repriced = projectAdvisoryResearchResources(
    base({
      prices: [
        { actionId: "a", price: [{ resourceId: "Knowledge", amount: 20 }] },
      ],
      routes: routePlan({
        offers: [
          {
            actionId: "a",
            generation: 1,
            cost: { Knowledge: 20 },
            nativeAffordable: false,
          },
        ],
      }),
    }),
  );
  assert.equal(repriced.candidates[0].estimatedTimeToAfford.diagnostic, 18);
  const restocked = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], amount: 9 }],
    }),
  );
  assert.equal(restocked.candidates[0].estimatedTimeToAfford.diagnostic, 1);
}

for (const [netRate, expectedStatus] of [
  [1, "uncertain"],
  [0, "uncertain"],
  [-1, "uncertain"],
]) {
  const result = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], netRate }],
    }),
  );
  assert.equal(
    result.candidates[0].currentAffordability.status,
    expectedStatus,
  );
  assert.equal(result.candidates[0].estimatedTimeToAfford.validated, undefined);
}

{
  const capped = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], capacity: 9 }],
    }),
  );
  assert.equal(
    capped.candidates[0].requirements[0].capacityConstraint,
    "below-price",
  );
  assert.equal(capped.candidates[0].currentAffordability.status, "infeasible");

  const missingHolding = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], amount: undefined }],
    }),
  );
  assert.ok(
    missingHolding.candidates[0].requirements[0].missingAuthority.includes(
      "holdings",
    ),
  );
  assert.equal(
    missingHolding.candidates[0].currentAffordability.status,
    "unavailable",
  );

  const missingResource = projectAdvisoryResearchResources(
    base({ observations: [] }),
  );
  assert.ok(
    missingResource.candidates[0].requirements[0].missingAuthority.includes(
      "resource-observation",
    ),
  );
  assert.equal(
    missingResource.candidates[0].currentAffordability.status,
    "unavailable",
  );

  const staleResource = projectAdvisoryResearchResources(
    base({
      observations: [
        { ...base().observations[0], validityEpoch: "run|root:old" },
      ],
    }),
  );
  assert.equal(
    staleResource.candidates[0].currentAffordability.status,
    "unavailable",
  );
  assert.ok(
    staleResource.candidates[0].requirements[0].missingAuthority.includes(
      "stale-resource-observation",
    ),
  );
  assert.equal(staleResource.candidates[0].requirements[0].holding, undefined);
  assert.equal(staleResource.candidates[0].requirements[0].capacity, undefined);
  assert.equal(
    staleResource.candidates[0].requirements[0].observedNetRate,
    undefined,
  );
}

{
  const input = base({
    prices: [
      {
        actionId: "a",
        price: [
          { resourceId: "Knowledge", amount: 10 },
          { resourceId: "Crystal", amount: 5 },
        ],
      },
    ],
    routes: routePlan({
      offers: [
        {
          actionId: "a",
          generation: 1,
          cost: { Knowledge: 10, Crystal: 5 },
          nativeAffordable: false,
        },
      ],
    }),
    observations: [
      ...base().observations,
      {
        resourceId: "Crystal",
        amount: 1,
        capacity: 20,
        netRate: 2,
        rateConfidence: "stable",
        validityEpoch: "old-epoch",
      },
    ],
  });
  const result = projectAdvisoryResearchResources(input);
  const [knowledge, crystal] = result.candidates[0].requirements;
  assert.equal(knowledge.holding, 2);
  assert.equal(knowledge.missingAuthority.length, 0);
  assert.equal(crystal.holding, undefined);
  assert.ok(crystal.missingAuthority.includes("stale-resource-observation"));
  assert.equal(result.candidates[0].currentAffordability.status, "unavailable");
}

{
  const result = projectAdvisoryResearchResources(
    base({
      commitments: [
        { resourceId: "Knowledge", poolId: "elsewhere", amount: 8 },
      ],
      commitmentsKnown: false,
    }),
  );
  assert.equal(result.commitments.unknownExternalCommitments, true);
  assert.equal(result.candidates[0].requirements[0].knownCommitment, 0);
  assert.equal(
    result.candidates[0].requirements[0].externalCommitments,
    "unknown",
  );
  assert.equal(
    result.candidates[0].requirements[0].affordabilityConstraint,
    "unknown",
  );
  assert.equal(result.candidates[0].estimatedTimeToAfford.validated, undefined);
  assert.equal(
    result.candidates[0].requirements[0].affordabilityConstraint,
    "unknown",
  );
}

{
  const input = base({
    observations: [{ ...base().observations[0], amount: 8 }],
    commitments: [
      { resourceId: "Knowledge", poolId: "elsewhere", amount: 7 },
      { resourceId: "Knowledge", poolId: "anywhere", amount: 2 },
    ],
    commitmentsKnown: true,
  });
  const result = projectAdvisoryResearchResources(input);
  const requirement = result.candidates[0].requirements[0];
  const shared = result.candidates[0].currentAffordability.unmetRequirements[0];
  assert.equal(requirement.knownCommitment, 2);
  assert.equal(requirement.affordabilityConstraint, "shortfall");
  assert.equal(shared.shortfall, 4);
  assert.equal(requirement.bottleneck, true);
}

{
  const input = base({
    observations: [{ ...base().observations[0], amount: 8 }],
    commitments: [{ resourceId: "Knowledge", poolId: "anywhere", amount: 2 }],
    commitmentsKnown: false,
  });
  const result = projectAdvisoryResearchResources(input);
  const requirement = result.candidates[0].requirements[0];
  const shared = result.candidates[0].currentAffordability.unmetRequirements[0];
  assert.equal(requirement.externalCommitments, "unknown");
  assert.equal(requirement.affordabilityConstraint, "unknown");
  assert.equal(requirement.knownCommitment, 2);
  assert.equal(requirement.bottleneck, true);
  assert.equal(shared.shortfall, 4);
}

{
  const competingRoutes = routePlan({
    definitions: [
      action("terminal", "goal", [{ technologyId: "choice" }]),
      action("route-a", "choice"),
      action("route-b", "choice"),
    ],
    offers: [
      {
        actionId: "route-a",
        generation: 1,
        cost: { Knowledge: 10 },
        nativeAffordable: false,
      },
      {
        actionId: "route-b",
        generation: 1,
        cost: { Knowledge: 12 },
        nativeAffordable: true,
      },
    ],
    grantLevels: new Map([
      ["goal", 0],
      ["choice", 0],
    ]),
  });
  const result = projectAdvisoryResearchResources(
    base({
      routes: competingRoutes,
      prices: [
        {
          actionId: "route-a",
          price: [{ resourceId: "Knowledge", amount: 10 }],
        },
        {
          actionId: "route-b",
          price: [{ resourceId: "Knowledge", amount: 12 }],
        },
      ],
    }),
  );
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.candidates[0].advancesRequirements[0].alternativeActionIds,
    ["route-a", "route-b"],
  );
  assert.deepEqual(
    result.candidates[0].orAlternativePotentialNeeds[0].alternatives.map(
      (entry) => entry.actionId,
    ),
    ["route-a", "route-b"],
  );
  assert.deepEqual(result.affordabilityComparisons, [
    {
      feasibleActionId: "route-b",
      infeasibleActionId: "route-a",
      dimension: "known-current-affordability",
    },
  ]);
  assert.deepEqual(result.comparisons, [
    {
      lessExpensiveActionId: "route-a",
      moreExpensiveActionId: "route-b",
      dimension: "current-native-price-component-dominance",
      resourceIds: ["Knowledge"],
    },
  ]);
  assert.equal(result.mandatoryGoalNeeds.status, "none-established");
}

{
  const tradeoff = routePlan({
    definitions: [
      action("terminal", "goal", [{ technologyId: "choice" }]),
      action("money-route", "choice"),
      action("ore-route", "choice"),
    ],
    offers: [
      {
        actionId: "money-route",
        generation: 1,
        cost: { Money: 1 },
        nativeAffordable: false,
      },
      {
        actionId: "ore-route",
        generation: 1,
        cost: { Ore: 1 },
        nativeAffordable: false,
      },
    ],
    grantLevels: new Map([
      ["goal", 0],
      ["choice", 0],
    ]),
  });
  const result = projectAdvisoryResearchResources(
    base({
      routes: tradeoff,
      prices: [
        {
          actionId: "money-route",
          price: [{ resourceId: "Money", amount: 1 }],
        },
        { actionId: "ore-route", price: [{ resourceId: "Ore", amount: 1 }] },
      ],
    }),
  );
  assert.deepEqual(result.comparisons, []);
  assert.equal(result.candidates[0].nativeAffordability, "unaffordable");
  assert.equal(result.candidates[1].nativeAffordability, "unaffordable");
}

{
  const sharedAnd = routePlan({
    definitions: [
      action("terminal", "goal", [{ technologyId: "route" }]),
      action("a", "route", [{ technologyId: "x" }, { technologyId: "y" }]),
      action("x-action", "x"),
      action("y-action", "y"),
    ],
    offers: [
      {
        actionId: "x-action",
        generation: 1,
        cost: { Knowledge: 10 },
        nativeAffordable: false,
      },
    ],
    grantLevels: new Map([
      ["goal", 0],
      ["route", 0],
      ["x", 0],
      ["y", 0],
    ]),
  });
  const result = projectAdvisoryResearchResources(
    base({
      routes: sharedAnd,
      prices: [
        {
          actionId: "x-action",
          price: [{ resourceId: "Knowledge", amount: 10 }],
        },
      ],
    }),
  );
  assert.ok(
    result.candidates[0].remainingRequirements.some(
      (requirement) =>
        requirement.technologyId === "y" &&
        requirement.status === "unsatisfied",
    ),
  );
  assert.ok(
    result.candidates[0].routePotentialNeeds.some(
      (need) =>
        need.actionId === "x-action" &&
        need.priceStatus === "currently-offered",
    ),
  );
  assert.ok(
    result.candidates[0].routePotentialNeeds.some(
      (need) => need.priceStatus === "not-currently-offered",
    ),
  );
  assert.equal(result.mandatoryGoalNeeds.status, "none-established");
}

{
  const actionId = "a";
  const intervention = {
    id: "observed-production-change",
    goalId: `current-action:${actionId}`,
    preconditions: { satisfied: true, reasons: [] },
    acquisitionCosts: [],
    productionChanges: [
      { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 1 },
    ],
    effectsComplete: true,
    effectAuthority: "validated",
    validityEpoch: "run|root:1",
    unavailableReasons: [],
  };
  const improved = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], rateConfidence: "stable" }],
      interventionsByActionId: new Map([[actionId, [intervention]]]),
    }),
  );
  const comparison = improved.candidates[0].interventionComparison;
  assert.equal(comparison.status, "available");
  assert.equal(comparison.evidence.strategies[1].completionTime, 4);
  assert.equal(comparison.evidence.winner, "observed-production-change");

  const unsupported = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], rateConfidence: "stable" }],
      interventionsByActionId: new Map([
        [actionId, [{ ...intervention, productionChanges: undefined }]],
      ]),
    }),
  );
  assert.equal(
    unsupported.candidates[0].interventionComparison.status,
    "unavailable",
  );
  assert.equal(
    unsupported.candidates[0].interventionComparison.evidence,
    undefined,
  );
  assert.match(
    unsupported.candidates[0].interventionComparison.reasons[0],
    /effects/i,
  );

  const missingAcquisitionCost = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], rateConfidence: "stable" }],
      interventionsByActionId: new Map([
        [actionId, [{ ...intervention, acquisitionCosts: undefined }]],
      ]),
    }),
  );
  assert.equal(
    missingAcquisitionCost.candidates[0].interventionComparison.status,
    "unavailable",
  );
  assert.equal(
    missingAcquisitionCost.candidates[0].interventionComparison.evidence,
    undefined,
  );

  const incompleteEffects = projectAdvisoryResearchResources(
    base({
      observations: [{ ...base().observations[0], rateConfidence: "stable" }],
      interventionsByActionId: new Map([
        [actionId, [{ ...intervention, effectsComplete: false }]],
      ]),
    }),
  );
  assert.equal(
    incompleteEffects.candidates[0].interventionComparison.status,
    "unavailable",
  );
}

{
  const intervention = (overrides = {}) => ({
    id: "smelter-steel",
    goalId: "current-action:a",
    preconditions: { satisfied: true, reasons: [] },
    acquisitionCosts: [],
    productionChanges: [
      { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 1 },
    ],
    effectsComplete: true,
    effectAuthority: "validated",
    validityEpoch: "run|root:1",
    unavailableReasons: [],
    ...overrides,
  });
  const compare = (overrides = {}, candidate = intervention()) => {
    const input = base({
      observations: [{ ...base().observations[0], rateConfidence: "stable" }],
      interventionsByActionId: new Map([["a", [candidate]]]),
      ...overrides,
    });
    return projectAdvisoryResearchResources(input).candidates[0]
      .interventionComparison;
  };

  const plentiful = compare({
    observations: [
      { ...base().observations[0], amount: 20, rateConfidence: "stable" },
    ],
  });
  assert.equal(plentiful.evidence.strategies[0].completionTime, 0);
  assert.equal(plentiful.evidence.winner, "wait");

  const scarce = compare({
    observations: [
      { ...base().observations[0], amount: 2, rateConfidence: "stable" },
    ],
  });
  assert.equal(scarce.evidence.strategies[0].completionTime, 8);
  assert.equal(scarce.evidence.strategies[1].completionTime, 4);
  assert.equal(scarce.evidence.winner, "smelter-steel");

  const zeroProduction = compare(
    {
      observations: [
        {
          ...base().observations[0],
          amount: 2,
          netRate: 0,
          rateConfidence: "stable",
        },
      ],
    },
    intervention({
      productionChanges: [
        { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 1 },
      ],
    }),
  );
  assert.equal(zeroProduction.evidence.strategies[0].status, "infeasible");
  assert.equal(zeroProduction.evidence.strategies[1].completionTime, 8);
  assert.equal(zeroProduction.evidence.winner, "smelter-steel");

  const changedProduction = compare(
    {
      observations: [
        { ...base().observations[0], amount: 2, rateConfidence: "stable" },
      ],
    },
    intervention({
      productionChanges: [
        { resourceId: "Knowledge", poolId: "anywhere", netRateDelta: 0 },
      ],
    }),
  );
  assert.equal(changedProduction.evidence.strategies[1].completionTime, 8);
  assert.equal(changedProduction.evidence.winner, "wait");

  const missingInput = compare(
    {},
    intervention({
      acquisitionCosts: [{ resourceId: "Ore", poolId: "anywhere", amount: 1 }],
    }),
  );
  assert.equal(missingInput.status, "unavailable");
  assert.equal(missingInput.evidence, undefined);

  const expensiveAcquisition = compare(
    {
      observations: [
        { ...base().observations[0], amount: 8, rateConfidence: "stable" },
        {
          resourceId: "Money",
          amount: 0,
          capacity: 200,
          netRate: 1,
          rateConfidence: "stable",
          validityEpoch: "run|root:1",
        },
      ],
    },
    intervention({
      acquisitionCosts: [
        { resourceId: "Money", poolId: "anywhere", amount: 100 },
      ],
    }),
  );
  assert.equal(expensiveAcquisition.evidence.winner, "wait");

  const capacityBlocked = compare({
    observations: [
      { ...base().observations[0], capacity: 9, rateConfidence: "stable" },
    ],
  });
  assert.equal(capacityBlocked.evidence.strategies[0].status, "infeasible");
  assert.equal(capacityBlocked.evidence.winner, undefined);

  const anotherOwnerCommitted = compare({
    observations: [
      { ...base().observations[0], amount: 8, rateConfidence: "stable" },
    ],
    commitments: [{ resourceId: "Knowledge", poolId: "anywhere", amount: 2 }],
    commitmentsKnown: true,
  });
  assert.equal(anotherOwnerCommitted.evidence.strategies[0].completionTime, 4);

  const incompleteCommitments = compare({
    observations: [
      { ...base().observations[0], amount: 2, rateConfidence: "stable" },
    ],
    commitmentsKnown: false,
  });
  assert.equal(incompleteCommitments.status, "partial");
  assert.equal(incompleteCommitments.evidence.winner, undefined);

  const permissionRevoked = compare(
    {},
    intervention({
      preconditions: { satisfied: false, reasons: ["autoSmelter is disabled"] },
    }),
  );
  assert.equal(permissionRevoked.status, "unavailable");

  const selectedRouteChanged = projectAdvisoryResearchResources(
    base({
      routes: routePlan({
        definitions: [
          action("terminal", "goal", [{ technologyId: "route" }]),
          action("other", "route"),
        ],
        offers: [
          {
            actionId: "other",
            generation: 1,
            cost: { Knowledge: 10 },
            nativeAffordable: false,
          },
        ],
      }),
      prices: [
        { actionId: "other", price: [{ resourceId: "Knowledge", amount: 10 }] },
      ],
      interventionsByActionId: new Map([["a", [intervention()]]]),
    }),
  );
  assert.equal(selectedRouteChanged.candidates[0].actionId, "other");
  assert.equal(
    selectedRouteChanged.candidates[0].interventionComparison.status,
    "unavailable",
  );
}

console.log("Advisory resource projection tests passed");
