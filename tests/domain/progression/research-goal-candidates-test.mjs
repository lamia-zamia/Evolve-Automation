import assert from "node:assert/strict";

import { evaluateResearchGoalCandidates } from "../../../src/domain/progression/research-goal-candidates.ts";
import { planNativeResearchPrerequisites } from "../../../src/domain/progression/research-prerequisite-planning.ts";

const definition = (actionId, grantTechnology, requirements = []) => ({
  actionId,
  grantTechnology,
  grantLevel: 1,
  prerequisites: { kind: "declared", requirements },
  hasNativeCondition: false,
  routeRestrictions: undefined,
  restrictions: [],
});

const currentOffers = [
  {
    actionId: "tech-ore",
    grantTechnology: "ore",
    grantLevel: 1,
    generation: 4,
  },
  {
    actionId: "tech-luxury",
    grantTechnology: "luxury",
    grantLevel: 1,
    generation: 8,
  },
];
const graph = planNativeResearchPrerequisites({
  targetActionId: "tech-terminal",
  definitions: [
    definition("tech-terminal", "terminal", [
      { technologyId: "ore", requiredLevel: 1 },
    ]),
    definition("tech-ore", "ore"),
    definition("tech-luxury", "luxury"),
  ],
  grantLevels: new Map([
    ["terminal", 0],
    ["ore", 0],
    ["luxury", 0],
  ]),
  offeredActionIds: new Set(currentOffers.map((offer) => offer.actionId)),
  offerGenerations: new Map(
    currentOffers.map((offer) => [offer.actionId, offer.generation]),
  ),
  cycle: 12,
  progressionEpoch: "run:5",
  rootGeneration: 3,
  maxDepth: 12,
  maxActions: 40,
});

const input = (overrides = {}) => ({
  goalId: "prestige:mad",
  targetActionId: "tech-terminal",
  goalSatisfied: false,
  graph,
  cycle: 12,
  progressionEpoch: "run:5",
  rootGeneration: 3,
  offers: [
    {
      ...currentOffers[0],
      index: 0,
      cost: Object.freeze({ Knowledge: 100 }),
      nativeAffordable: true,
      resourceAffordable: true,
      hasCostConflict: false,
      hasExplicitExclusion: false,
    },
    {
      ...currentOffers[1],
      index: 1,
      cost: Object.freeze({ Knowledge: 25 }),
      nativeAffordable: true,
      resourceAffordable: true,
      hasCostConflict: false,
      hasExplicitExclusion: false,
    },
  ],
  baselineSelectedActionId: "tech-luxury",
  ...overrides,
});

{
  const evaluation = evaluateResearchGoalCandidates(input());
  assert.equal(evaluation.baselineSelectedActionId, "tech-luxury");
  assert.equal(evaluation.preferredActionId, "tech-ore");
  assert.equal(evaluation.candidates[0]?.relevance, "verified-prerequisite");
  assert.equal(evaluation.candidates[0]?.index, 0);
  assert.equal(evaluation.candidates[0]?.grantTechnology, "ore");
  assert.equal(evaluation.candidates[0]?.evidenceFresh, true);
  assert.equal(evaluation.candidates[0]?.downstreamCosts, "unknown");
  assert.deepEqual(evaluation.candidates[0]?.chainActionIds, [
    "tech-terminal",
    "tech-ore",
  ]);
  assert.equal(evaluation.candidates[1]?.relevance, "unrelated");
}

{
  const unaffordable = evaluateResearchGoalCandidates(
    input({
      offers: input().offers.map((candidate) =>
        candidate.actionId === "tech-ore"
          ? { ...candidate, resourceAffordable: false }
          : candidate,
      ),
    }),
  );
  assert.equal(unaffordable.preferredActionId, undefined);
  assert.equal(
    unaffordable.candidates[0]?.resourceAffordability,
    "insufficient",
  );
}

{
  const unknownResources = evaluateResearchGoalCandidates(
    input({
      offers: input().offers.map((candidate) => ({
        ...candidate,
        resourceAffordable: undefined,
      })),
    }),
  );
  assert.equal(unknownResources.preferredActionId, undefined);
  assert.equal(
    unknownResources.candidates[0]?.resourceAffordability,
    "unknown",
  );
}

{
  const reserved = evaluateResearchGoalCandidates(
    input({
      offers: input().offers.map((candidate) =>
        candidate.actionId === "tech-ore"
          ? { ...candidate, hasCostConflict: true }
          : candidate,
      ),
    }),
  );
  assert.equal(reserved.preferredActionId, undefined);
  assert.equal(reserved.candidates[0]?.reservationConflict, true);
}

{
  const stale = evaluateResearchGoalCandidates(
    input({ offers: input().offers.slice(0, 1) }),
  );
  assert.equal(stale.preferredActionId, undefined);
  assert.ok(
    stale.candidates.every(
      (candidate) => candidate.relevance === "unavailable",
    ),
  );
}

{
  const staleGeneration = evaluateResearchGoalCandidates(
    input({
      offers: input().offers.map((candidate) =>
        candidate.actionId === "tech-ore"
          ? { ...candidate, generation: candidate.generation + 1 }
          : candidate,
      ),
    }),
  );
  assert.equal(staleGeneration.preferredActionId, undefined);
  assert.ok(
    staleGeneration.candidates.every(
      (candidate) => candidate.relevance === "unavailable",
    ),
  );
}

{
  const changedObjective = evaluateResearchGoalCandidates(
    input({
      goalId: "prestige:bioseed",
      targetActionId: "tech-enceladus",
    }),
  );
  assert.equal(changedObjective.preferredActionId, undefined);
  assert.ok(
    changedObjective.candidates.every(
      (candidate) => candidate.relevance === "unavailable",
    ),
    "a graph captured for the prior objective cannot be reused after a goal change",
  );
}

{
  const satisfied = evaluateResearchGoalCandidates(
    input({ goalSatisfied: true }),
  );
  assert.equal(satisfied.preferredActionId, undefined);
  assert.ok(
    satisfied.candidates.every(
      (candidate) => candidate.relevance === "unrelated",
    ),
  );
}

{
  const investment = evaluateResearchGoalCandidates(
    input({
      offers: input().offers.map((candidate) =>
        candidate.actionId === "tech-luxury"
          ? { ...candidate, optionalInvestmentEffectKnown: true }
          : candidate,
      ),
    }),
  );
  assert.equal(investment.candidates[1]?.relevance, "optional-investment");
  assert.equal(investment.preferredActionId, "tech-ore");
}

{
  const conditionalGraph = planNativeResearchPrerequisites({
    targetActionId: "tech-terminal",
    definitions: [
      definition("tech-terminal", "terminal", [
        { technologyId: "middle", requiredLevel: 1 },
      ]),
      definition("tech-middle", "middle", [
        { technologyId: "ore", requiredLevel: 1 },
      ]),
      {
        ...definition("tech-ore", "ore"),
        hasNativeCondition: true,
      },
    ],
    grantLevels: new Map([
      ["terminal", 0],
      ["middle", 0],
      ["ore", 0],
    ]),
    offeredActionIds: new Set(["tech-ore", "tech-luxury"]),
    offerGenerations: new Map([
      ["tech-ore", 4],
      ["tech-luxury", 8],
    ]),
    cycle: 12,
    progressionEpoch: "run:5",
    rootGeneration: 3,
    maxDepth: 12,
    maxActions: 40,
  });
  const evaluation = evaluateResearchGoalCandidates(
    input({ graph: conditionalGraph }),
  );
  assert.equal(
    evaluation.candidates[0]?.relevance,
    "conditional-prerequisite",
    "an offered frontier below an unresolved ancestor remains conditional",
  );
  assert.equal(evaluation.preferredActionId, undefined);
}

console.log("Research goal candidate evaluation tests passed");
