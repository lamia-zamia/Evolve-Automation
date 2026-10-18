import assert from "node:assert/strict";

import {
  bindNativeResearchEligibilityEvidence,
  classifyMandatoryNativeResearchObligations,
  classifyMandatoryResearchPrerequisiteObligations,
  currentMandatoryResearchEvidence,
  planIndependentResearchResourceClaims,
} from "../../../src/domain/progression/research-prerequisite-obligations.ts";
import { planNativeResearchPrerequisites } from "../../../src/domain/progression/research-prerequisite-planning.ts";

const requirement = (
  id,
  technologyId,
  candidateActionIds,
  status = "unsatisfied",
) => ({
  id,
  technologyId,
  requiredLevel: 1,
  observedLevel: 0,
  declaredStatus: "unsatisfied",
  status,
  candidateActionIds,
  reasons: [],
});

const action = (actionId, status, prerequisiteIds = []) => ({
  actionId,
  grantTechnology: actionId,
  grantLevel: 1,
  status,
  prerequisiteIds,
  reasons: [],
});

const graph = (
  actions,
  requirements,
  targetPrerequisiteIds = requirements.map(({ id }) => id),
) => ({
  targetActionId: "tech-terminal",
  targetStatus: "unsatisfied",
  dependencyEvidence: "complete",
  actions: [
    action("tech-terminal", "unsatisfied", targetPrerequisiteIds),
    ...actions,
  ],
  requirements,
  actionableFrontier: actions
    .filter(({ status }) => status === "frontier")
    .map(({ actionId }) => actionId),
  cycles: [],
  limits: [],
  unavailableFacts: [],
  provenance: "retained-native-static-research-registry",
  freshness: {
    cycle: 1,
    progressionEpoch: "epoch-1",
    rootGeneration: 1,
    offerGenerations: [],
  },
});

{
  const result = classifyMandatoryResearchPrerequisiteObligations(
    graph(
      [
        action("tech-black_powder", "frontier"),
        action("tech-mad_science", "frontier"),
      ],
      [
        requirement("research:explosives:1", "explosives", [
          "tech-black_powder",
        ]),
        requirement("research:high_tech:1", "high_tech", ["tech-mad_science"]),
      ],
    ),
    true,
  );
  assert.equal(result.status, "verified");
  assert.deepEqual(result.mandatoryActionIds, [
    "tech-black_powder",
    "tech-mad_science",
  ]);
}

const nativeDefinition = (
  actionId,
  grantTechnology,
  grantLevel,
  requirements = [],
  options = {},
) => ({
  actionId,
  grantTechnology,
  grantLevel,
  prerequisites:
    options.conditional === true
      ? {
          kind: "conditional",
          reason: "native reqs function was not evaluated",
        }
      : { kind: "declared", requirements },
  hasNativeCondition: options.hasNativeCondition ?? false,
  routeRestrictions: options.routeRestrictions,
  restrictions: [],
});

const nativeGraph = (
  targetActionId,
  definitions,
  frontier,
  grantLevels,
  applicabilityByActionId,
) =>
  planNativeResearchPrerequisites({
    targetActionId,
    definitions,
    grantLevels,
    applicabilityByActionId,
    offeredActionIds: new Set(frontier),
    offerGenerations: new Map(
      frontier.map((actionId, index) => [actionId, index + 1]),
    ),
    cycle: 1,
    progressionEpoch: "epoch-1",
    rootGeneration: 1,
    maxDepth: 12,
    maxActions: 40,
  });

const eligibilityFor = (currentGraph) =>
  bindNativeResearchEligibilityEvidence(currentGraph, {
    actionId: currentGraph.targetActionId,
    status: "eligible",
  });

{
  const definitions = [
    nativeDefinition("tech-terminal", "terminal", 1, [
      { technologyId: "required", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-required", "required", 1),
  ];
  const frontier = ["tech-required"];
  const currentGraph = nativeGraph(
    "tech-terminal",
    definitions,
    frontier,
    new Map(["terminal", "required"].map((id) => [id, 0])),
    new Map([["tech-required", { status: "eligible" }]]),
  );
  const result = classifyMandatoryNativeResearchObligations(currentGraph, {
    targetEligibility: eligibilityFor(currentGraph),
    definitions,
    grantLevels: new Map(["terminal", "required"].map((id) => [id, 0])),
    applicabilityByActionId: new Map([
      ["tech-required", { status: "eligible" }],
    ]),
    offeredActionIds: new Set(frontier),
  });
  const currentOffers = new Map(currentGraph.freshness.offerGenerations);
  const currentEvidence = {
    goalActionId: "tech-terminal",
    progressionEpoch: "epoch-1",
    rootGeneration: 1,
    offers: currentOffers,
  };
  assert.equal(result.status, "verified");
  assert.deepEqual(result.mandatoryActionIds, ["tech-required"]);
  assert.equal(
    currentMandatoryResearchEvidence(result, currentGraph, currentEvidence),
    "complete",
  );
  assert.equal(
    currentMandatoryResearchEvidence(result, currentGraph, {
      ...currentEvidence,
      goalActionId: "different-goal",
    }),
    "partial",
  );
  assert.equal(
    currentMandatoryResearchEvidence(
      {
        ...result,
        authority: {
          ...result.authority,
          snapshotIdentity: "stale-snapshot",
        },
      },
      currentGraph,
      currentEvidence,
    ),
    "partial",
  );
  assert.equal(
    currentMandatoryResearchEvidence(result, currentGraph, {
      ...currentEvidence,
      rootGeneration: 2,
    }),
    "partial",
  );
  assert.equal(
    currentMandatoryResearchEvidence(result, currentGraph, {
      ...currentEvidence,
      progressionEpoch: "epoch-2",
    }),
    "partial",
  );
  assert.equal(
    currentMandatoryResearchEvidence(result, currentGraph, {
      ...currentEvidence,
      offers: new Map([["tech-required", 99]]),
    }),
    "partial",
  );
}

{
  const definitions = [
    nativeDefinition("tech-mad", "prestige", 1, [
      { technologyId: "explosives", requiredLevel: 3 },
      { technologyId: "high_tech", requiredLevel: 7 },
      { technologyId: "uranium", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-uranium", "uranium", 1),
    nativeDefinition("tech-black_powder", "explosives", 1),
    nativeDefinition("tech-dynamite", "explosives", 2, [
      { technologyId: "explosives", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-anfo", "explosives", 3, [
      { technologyId: "explosives", requiredLevel: 2 },
    ]),
    nativeDefinition("tech-mad_science", "high_tech", 1),
    nativeDefinition("tech-electricity", "high_tech", 2, [
      { technologyId: "high_tech", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-industrialization", "high_tech", 3, [
      { technologyId: "high_tech", requiredLevel: 2 },
    ]),
    nativeDefinition("tech-electronics", "high_tech", 4, [
      { technologyId: "high_tech", requiredLevel: 3 },
    ]),
    nativeDefinition("tech-fission", "high_tech", 5, [
      { technologyId: "high_tech", requiredLevel: 4 },
    ]),
    nativeDefinition("tech-arpa", "high_tech", 6, [
      { technologyId: "high_tech", requiredLevel: 5 },
    ]),
    nativeDefinition("tech-rocketry", "high_tech", 7, [
      { technologyId: "high_tech", requiredLevel: 6 },
    ]),
    nativeDefinition(
      "tech-surface_breach",
      "high_tech",
      7,
      [{ technologyId: "high_tech", requiredLevel: 6 }],
      { routeRestrictions: ["iceage"] },
    ),
  ];
  const frontier = ["tech-black_powder", "tech-mad_science"];
  const grantLevels = new Map([
    ["prestige", 0],
    ["explosives", 0],
    ["high_tech", 0],
    ["uranium", 0],
  ]);
  const applicabilityByActionId = new Map([
    ["tech-black_powder", { status: "eligible" }],
    ["tech-mad_science", { status: "eligible" }],
    ["tech-surface_breach", { status: "excluded", reasons: ["iceage route"] }],
  ]);
  const currentGraph = nativeGraph(
    "tech-mad",
    definitions,
    frontier,
    grantLevels,
    applicabilityByActionId,
  );
  const result = classifyMandatoryNativeResearchObligations(currentGraph, {
    targetEligibility: eligibilityFor(currentGraph),
    definitions,
    grantLevels,
    applicabilityByActionId,
    offeredActionIds: new Set(frontier),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.inputConsistency, "incomplete");
  assert.deepEqual(result.mandatoryActionIds, []);
  assert.match(result.reasons.join(" "), /unresolved native alternatives/);

  const freshEligibility = eligibilityFor(currentGraph);
  for (const staleFreshness of [
    { ...freshEligibility.freshness, rootGeneration: 2 },
    { ...freshEligibility.freshness, progressionEpoch: "epoch-2" },
    {
      ...freshEligibility.freshness,
      offerGenerations: [["tech-black_powder", 99]],
    },
  ]) {
    const stale = classifyMandatoryNativeResearchObligations(currentGraph, {
      targetEligibility: { ...freshEligibility, freshness: staleFreshness },
      definitions,
      grantLevels,
      applicabilityByActionId,
      offeredActionIds: new Set(frontier),
    });
    assert.equal(stale.status, "unavailable");
    assert.match(stale.reasons.join(" "), /stale/);
  }
  const staleSnapshot = classifyMandatoryNativeResearchObligations(
    currentGraph,
    {
      targetEligibility: {
        ...freshEligibility,
        snapshotIdentity: "previous prerequisite snapshot",
      },
      definitions,
      grantLevels,
      applicabilityByActionId,
      offeredActionIds: new Set(frontier),
    },
  );
  assert.equal(staleSnapshot.status, "unavailable");
  assert.match(staleSnapshot.reasons.join(" "), /current graph snapshot/);
  const missingEligibility = classifyMandatoryNativeResearchObligations(
    currentGraph,
    {
      targetEligibility: undefined,
      definitions,
      grantLevels,
      applicabilityByActionId,
      offeredActionIds: new Set(frontier),
    },
  );
  assert.equal(missingEligibility.status, "unavailable");
  assert.match(missingEligibility.reasons.join(" "), /missing or stale/);
}

{
  const definitions = [
    nativeDefinition("tech-mad", "prestige", 1, [
      { technologyId: "explosives", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-black_powder", "explosives", 1),
    nativeDefinition("tech-alternate_powder", "explosives", 1),
  ];
  const frontier = ["tech-black_powder", "tech-alternate_powder"];
  const grantLevels = new Map([
    ["prestige", 0],
    ["explosives", 0],
  ]);
  const applicabilityByActionId = new Map();
  const currentGraph = nativeGraph(
    "tech-mad",
    definitions,
    frontier,
    grantLevels,
    applicabilityByActionId,
  );
  const result = classifyMandatoryNativeResearchObligations(currentGraph, {
    targetEligibility: eligibilityFor(currentGraph),
    definitions,
    grantLevels,
    applicabilityByActionId,
    offeredActionIds: new Set(frontier),
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(result.mandatoryActionIds, []);
  assert.ok(result.alternativeGroups.length > 0);
}

{
  const definitions = [
    nativeDefinition("tech-mad", "prestige", 1, [
      { technologyId: "high_tech", requiredLevel: 7 },
    ]),
    nativeDefinition("tech-mad_science", "high_tech", 1),
    nativeDefinition("tech-electricity", "high_tech", 2, [
      { technologyId: "high_tech", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-industrialization", "high_tech", 3, [
      { technologyId: "high_tech", requiredLevel: 2 },
    ]),
    nativeDefinition("tech-electronics", "high_tech", 4, [
      { technologyId: "high_tech", requiredLevel: 3 },
    ]),
    nativeDefinition("tech-fission", "high_tech", 5, [
      { technologyId: "high_tech", requiredLevel: 4 },
    ]),
    nativeDefinition("tech-arpa", "high_tech", 6, [
      { technologyId: "high_tech", requiredLevel: 5 },
    ]),
    nativeDefinition("tech-rocketry", "high_tech", 7, [
      { technologyId: "high_tech", requiredLevel: 6 },
    ]),
    nativeDefinition("tech-dynamic_route", "high_tech", 12, [], {
      conditional: true,
    }),
  ];
  const frontier = ["tech-mad_science"];
  const grantLevels = new Map([
    ["prestige", 0],
    ["high_tech", 0],
  ]);
  const applicabilityByActionId = new Map([
    ["tech-mad_science", { status: "eligible" }],
  ]);
  const currentGraph = nativeGraph(
    "tech-mad",
    definitions,
    frontier,
    grantLevels,
    applicabilityByActionId,
  );
  const result = classifyMandatoryNativeResearchObligations(currentGraph, {
    targetEligibility: eligibilityFor(currentGraph),
    definitions,
    grantLevels,
    applicabilityByActionId,
    offeredActionIds: new Set(frontier),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.inputConsistency, "incomplete");
  assert.deepEqual(result.mandatoryActionIds, []);
  assert.match(result.reasons.join(" "), /unresolved native alternatives/);
  assert.equal(
    currentMandatoryResearchEvidence(result, currentGraph, {
      goalActionId: "tech-mad",
      progressionEpoch: "epoch-1",
      rootGeneration: 1,
      offers: new Map(currentGraph.freshness.offerGenerations),
    }),
    "unavailable",
  );
}

{
  const definitions = [
    nativeDefinition("tech-industrialization", "high_tech", 3, [
      { technologyId: "steel_container", requiredLevel: 1 },
    ]),
    nativeDefinition("tech-steel_containers", "steel_container", 1),
    nativeDefinition("tech-gantry_crane", "steel_container", 2, [
      { technologyId: "steel_container", requiredLevel: 1 },
      { technologyId: "high_tech", requiredLevel: 2 },
    ]),
    nativeDefinition("tech-alloy_containers", "steel_container", 3, [
      { technologyId: "steel_container", requiredLevel: 2 },
    ]),
    nativeDefinition("tech-mythril_containers", "steel_container", 4, [
      { technologyId: "steel_container", requiredLevel: 1 },
      { technologyId: "space", requiredLevel: 3 },
    ]),
    nativeDefinition("tech-adamantite_containers", "steel_container", 5, [
      { technologyId: "steel_container", requiredLevel: 4 },
    ]),
  ];
  const frontier = ["tech-steel_containers"];
  const grantLevels = new Map([
    ["high_tech", 0],
    ["steel_container", 0],
    ["space", 0],
  ]);
  const applicabilityByActionId = new Map(
    definitions.map(({ actionId }) => [actionId, { status: "eligible" }]),
  );
  const input = {
    definitions,
    grantLevels,
    applicabilityByActionId,
    offeredActionIds: new Set(frontier),
  };
  const currentGraph = nativeGraph(
    "tech-industrialization",
    definitions,
    frontier,
    grantLevels,
    applicabilityByActionId,
  );
  const dominatedAlternatives = classifyMandatoryNativeResearchObligations(
    currentGraph,
    { ...input, targetEligibility: eligibilityFor(currentGraph) },
  );
  assert.equal(dominatedAlternatives.status, "unavailable");
  assert.deepEqual(dominatedAlternatives.mandatoryActionIds, []);
  assert.match(
    dominatedAlternatives.reasons.join(" "),
    /unresolved native alternatives/,
  );

  const genuineBypass = nativeDefinition(
    "tech-alternate_container_route",
    "steel_container",
    1,
  );
  const bypassDefinitions = [...definitions, genuineBypass];
  const bypassApplicability = new Map([
    ...input.applicabilityByActionId,
    [genuineBypass.actionId, { status: "eligible" }],
  ]);
  const withBypassGraph = nativeGraph(
    "tech-industrialization",
    bypassDefinitions,
    frontier,
    grantLevels,
    bypassApplicability,
  );
  const withBypass = classifyMandatoryNativeResearchObligations(
    withBypassGraph,
    {
      ...input,
      targetEligibility: eligibilityFor(withBypassGraph),
      definitions: bypassDefinitions,
      applicabilityByActionId: bypassApplicability,
    },
  );
  assert.equal(withBypass.status, "unavailable");
  assert.deepEqual(
    withBypass.mandatoryActionIds,
    [],
    "a valid alternative grant with no Steel Containers prerequisite bypasses the level-1 action",
  );
}

{
  const result = classifyMandatoryResearchPrerequisiteObligations(
    graph(
      [action("tech-a", "frontier"), action("tech-b", "frontier")],
      [requirement("research:shared:1", "shared", ["tech-a", "tech-b"])],
    ),
    true,
  );
  assert.equal(result.status, "verified");
  assert.deepEqual(result.mandatoryActionIds, []);
  assert.deepEqual(result.alternativeGroups, [
    { requirementId: "research:shared:1", actionIds: ["tech-a", "tech-b"] },
  ]);
}

{
  const result = classifyMandatoryResearchPrerequisiteObligations(
    graph(
      [
        action("tech-current", "frontier"),
        action("tech-unknown", "conditional"),
      ],
      [
        requirement("research:shared:1", "shared", [
          "tech-current",
          "tech-unknown",
        ]),
      ],
    ),
    true,
  );
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.mandatoryActionIds, []);
}

{
  const result = classifyMandatoryResearchPrerequisiteObligations(
    graph(
      [action("tech-a", "frontier")],
      [requirement("research:shared:1", "shared", ["tech-a"])],
    ),
    false,
  );
  assert.equal(result.status, "unavailable");
}

const evidence = (overrides = {}) => ({
  terminalGoalId: "prestige:mad",
  immediateGoalId: "research:tech-a",
  owner: "goal-planner",
  provenance: "verified-native-prerequisite",
  prerequisiteRelation: "verified",
  nativeActionId: "tech-a",
  targetGrantTechnology: "shared",
  targetGrantLevel: 1,
  resourceId: "Mana",
  poolId: "anywhere",
  requiredQuantity: 50,
  observedStock: 10,
  observedCapacity: 200,
  observedNativePrice: 50,
  offerSetIdentity: "offers-1",
  offerObservationId: "observation-1",
  offerBindingGeneration: 1,
  controlBinding: { elementId: "tech-a", generation: 1 },
  nativeOfferCurrent: true,
  nativeActionEligible: true,
  researchPermission: true,
  queueEvidence: "empty",
  rootGeneration: 1,
  progressionGeneration: "epoch-1",
  observationValid: true,
  precedence: "terminal-prerequisite",
  allocationAuthority: { kind: "independent" },
  forecastProductionPerSecond: undefined,
  uncertaintyReasons: [],
  unavailableReasons: [],
  ...overrides,
});

{
  const result = planIndependentResearchResourceClaims([
    evidence(),
    evidence(),
    evidence({
      immediateGoalId: "research:tech-b",
      nativeActionId: "tech-b",
      requiredQuantity: 100,
      observedNativePrice: 100,
      controlBinding: { elementId: "tech-b", generation: 1 },
    }),
  ]);
  assert.equal(result.status, "available");
  assert.deepEqual(
    result.claims.map((claim) => claim.requiredQuantity).sort((a, b) => a - b),
    [50, 100],
    "identical obligations are counted once and distinct obligations retain their own amount",
  );
}

{
  const result = planIndependentResearchResourceClaims([
    evidence({
      allocationAuthority: {
        kind: "selected-alternative",
        groupId: "research:shared:1",
        selectedActionId: "tech-a",
        authorityId: "selection-1",
      },
    }),
    evidence({
      immediateGoalId: "research:tech-b",
      nativeActionId: "tech-b",
      controlBinding: { elementId: "tech-b", generation: 1 },
      allocationAuthority: {
        kind: "selected-alternative",
        groupId: "research:shared:1",
        selectedActionId: "tech-a",
        authorityId: "selection-1",
      },
    }),
  ]);
  assert.equal(result.status, "available");
  assert.deepEqual(
    result.claims.map(({ nativeActionId }) => nativeActionId),
    ["tech-a"],
  );
}

{
  const result = planIndependentResearchResourceClaims([
    evidence({
      requiredQuantity: 60,
      observedNativePrice: 60,
      observedCapacity: 100,
    }),
    evidence({
      immediateGoalId: "research:tech-b",
      nativeActionId: "tech-b",
      requiredQuantity: 60,
      observedNativePrice: 60,
      observedCapacity: 100,
      controlBinding: { elementId: "tech-b", generation: 1 },
    }),
  ]);
  assert.equal(result.status, "unavailable");
  assert.match(result.reasons.join(" "), /aggregate prerequisite quantity/);
  assert.deepEqual(result.claims, []);
}

console.log("Research prerequisite obligation tests passed");
