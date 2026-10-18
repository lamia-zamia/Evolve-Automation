import assert from "node:assert/strict";

import {
  evaluateResearchGoalCandidates,
  hasVerifiedNonManaAffordabilityForManaOffer,
} from "../../../src/domain/progression/research-goal-candidates.ts";
import { planNativeResearchPrerequisites } from "../../../src/domain/progression/research-prerequisite-planning.ts";
import { classifyMandatoryResearchPrerequisiteObligations } from "../../../src/domain/progression/research-prerequisite-obligations.ts";
import {
  decodeResearchGoalCandidateResponse,
  installResearchGoalCandidatesWorker,
  researchGoalOfferIdentity,
  RESEARCH_GOAL_CANDIDATES_TASK,
} from "../../../src/adapters/browser/research-goal-candidates-worker.ts";

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
  assert.equal(evaluation.preferredActionId, undefined);
  assert.equal(evaluation.preference, "blocked-by-missing-native-authority");
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
  const mismatched = evaluateResearchGoalCandidates(
    input({
      obligations: {
        status: "verified",
        mandatoryActionIds: ["tech-luxury"],
        alternativeGroups: [],
        reasons: [],
      },
    }),
  );
  assert.equal(mismatched.preferredActionId, undefined);
  assert.equal(mismatched.preference, "blocked-by-missing-native-authority");
  assert.ok(
    mismatched.frontierSelection.reasons.some((reason) =>
      reason.includes(
        "tech-luxury is not mandatory in the current prerequisite graph",
      ),
    ),
    "a mandatory obligation from a different prerequisite snapshot cannot be ranked",
  );

  const coherentGraph = planNativeResearchPrerequisites({
    targetActionId: "tech-terminal",
    definitions: [
      definition("tech-terminal", "terminal", [
        { technologyId: "luxury", requiredLevel: 1 },
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
  const coherentObligations = classifyMandatoryResearchPrerequisiteObligations(
    coherentGraph,
    true,
  );
  const coherent = evaluateResearchGoalCandidates(
    input({ graph: coherentGraph, obligations: coherentObligations }),
  );
  assert.deepEqual(coherentGraph.actionableFrontier, ["tech-luxury"]);
  assert.deepEqual(coherentObligations.mandatoryActionIds, ["tech-luxury"]);
  assert.equal(
    coherent.candidates.find(
      (candidate) => candidate.actionId === "tech-luxury",
    )?.relevance,
    "verified-prerequisite",
    "the graph and obligation classifier agree when both consume the same effective B requirement",
  );
}

{
  const madGraph = (blackPowderApplicability = "eligible") =>
    planNativeResearchPrerequisites({
      targetActionId: "tech-mad",
      definitions: [
        definition("tech-mad", "mad", [
          { technologyId: "explosives", requiredLevel: 1 },
          { technologyId: "high_tech", requiredLevel: 1 },
        ]),
        definition("tech-black_powder", "explosives"),
        definition("tech-mad_science", "high_tech"),
      ],
      grantLevels: new Map([
        ["mad", 0],
        ["explosives", 0],
        ["high_tech", 0],
      ]),
      applicabilityByActionId: new Map([
        ["tech-mad", { status: "eligible", reasons: [] }],
        [
          "tech-black_powder",
          { status: blackPowderApplicability, reasons: [] },
        ],
        ["tech-mad_science", { status: "eligible", reasons: [] }],
      ]),
      offeredActionIds: new Set(["tech-black_powder", "tech-mad_science"]),
      offerGenerations: new Map([
        ["tech-black_powder", 4],
        ["tech-mad_science", 8],
      ]),
      cycle: 12,
      progressionEpoch: "run:5",
      rootGeneration: 3,
      maxDepth: 12,
      maxActions: 40,
    });
  const madPrices = Object.freeze({
    "tech-black_powder": Object.freeze({
      Knowledge: 4500,
      Mana: 100,
      Crystal: 250,
      Coal: 300,
    }),
    "tech-mad_science": Object.freeze({
      Money: 10000,
      Mana: 50,
      Knowledge: 6750,
      Crystal: 1000,
      Aluminium: 750,
    }),
  });
  const resourceAmounts = {
    Money: 10000,
    Knowledge: 6750,
    Mana: 10,
    Crystal: 1000,
    Coal: 300,
    Aluminium: 750,
  };
  const makeMadInput = ({
    manaAmount = 10,
    coalRate = 0.5,
    coalAmount = 300,
    aluminiumAmount = 750,
    blackPowderManaPrice = 100,
    blackPowderApplicability = "eligible",
  } = {}) => {
    const targetGraph = madGraph(blackPowderApplicability);
    const validityEpoch = "run:5|root:3|cycle:12";
    const resourceStocks = Object.entries({
      ...resourceAmounts,
      Mana: manaAmount,
      Coal: coalAmount,
      Aluminium: aluminiumAmount,
    }).map(([resourceId, amount]) => ({
      resourceId,
      poolId: "anywhere",
      amount,
      capacity: 100000,
      netRate: resourceId === "Mana" ? 2 : resourceId === "Coal" ? coalRate : 1,
      rateConfidence: "observed",
      validityEpoch,
    }));
    return input({
      targetActionId: "tech-mad",
      graph: targetGraph,
      obligations: {
        status: "verified",
        mandatoryActionIds: ["tech-black_powder", "tech-mad_science"],
        alternativeGroups: [],
        reasons: [],
      },
      resourceStocks,
      commitmentsKnown: false,
      offers: [
        {
          actionId: "tech-black_powder",
          grantTechnology: "explosives",
          grantLevel: 1,
          index: 0,
          generation: 4,
          cost: {
            ...madPrices["tech-black_powder"],
            Mana: blackPowderManaPrice,
          },
          nativeAffordable: false,
          resourceAffordable: false,
          hasCostConflict: undefined,
          hasExplicitExclusion:
            blackPowderApplicability === "excluded" ? true : false,
        },
        {
          actionId: "tech-mad_science",
          grantTechnology: "high_tech",
          grantLevel: 1,
          index: 1,
          generation: 8,
          cost: madPrices["tech-mad_science"],
          nativeAffordable: false,
          resourceAffordable: false,
          hasCostConflict: undefined,
          hasExplicitExclusion: false,
        },
      ],
    });
  };
  const baseline = evaluateResearchGoalCandidates(makeMadInput());
  assert.deepEqual(
    baseline.frontierSelection.comparedActionIds,
    ["tech-black_powder", "tech-mad_science"],
    "the saved MAD evidence treats both direct AND requirements as mandatory",
  );
  assert.equal(
    baseline.frontierSelection.status,
    "provisional-mandatory-prerequisite-choice",
  );
  assert.equal(
    baseline.frontierSelection.actionId,
    "tech-mad_science",
    "the 50-Mana offer is actionable sooner than the 100-Mana offer at the same observed Mana rate",
  );
  assert.equal(
    baseline.candidates.find(
      (candidate) => candidate.actionId === "tech-black_powder",
    )?.frontierTime?.estimatedTime,
    45,
    "the current 100-Mana native price determines the wait at the observed Mana rate",
  );
  assert.ok(
    baseline.frontierSelection.reasons.some((reason) =>
      reason.includes("commitments are incomplete"),
    ),
    "incomplete spend-owner coverage remains explicit",
  );

  const fasterCoal = evaluateResearchGoalCandidates(
    makeMadInput({
      coalAmount: 0,
      coalRate: 20,
      aluminiumAmount: 0,
    }),
  );
  assert.equal(
    fasterCoal.frontierSelection.actionId,
    "tech-black_powder",
    "a changed current production rate can change the selected mandatory frontier",
  );
  const changedPrice = evaluateResearchGoalCandidates(
    makeMadInput({ coalRate: 20, blackPowderManaPrice: 25 }),
  );
  assert.equal(
    changedPrice.frontierSelection.actionId,
    "tech-black_powder",
    "a changed native price can change the selected mandatory frontier",
  );
  const changedStock = evaluateResearchGoalCandidates(
    makeMadInput({ manaAmount: 100 }),
  );
  assert.equal(
    changedStock.frontierSelection.status,
    "blocked-by-missing-native-authority",
    "when both choices are immediately affordable, unknown downstream completion time is not treated as a tie",
  );
  const changedApplicability = evaluateResearchGoalCandidates(
    makeMadInput({ blackPowderApplicability: "excluded" }),
  );
  assert.equal(
    changedApplicability.frontierSelection.status,
    "blocked-by-missing-native-authority",
    "a mandatory obligation contradicted by current native exclusion evidence is blocked",
  );
  assert.ok(
    changedApplicability.frontierSelection.reasons.some((reason) =>
      reason.includes("excluded by current native applicability evidence"),
    ),
  );
  const unresolvedOrGraph = planNativeResearchPrerequisites({
    targetActionId: "tech-mad",
    definitions: [
      definition("tech-mad", "mad", [
        { technologyId: "choice", requiredLevel: 1 },
      ]),
      definition("tech-black_powder", "choice"),
      definition("tech-mad_science", "choice"),
    ],
    grantLevels: new Map([
      ["mad", 0],
      ["choice", 0],
    ]),
    offeredActionIds: new Set(["tech-black_powder", "tech-mad_science"]),
    offerGenerations: new Map([
      ["tech-black_powder", 4],
      ["tech-mad_science", 8],
    ]),
    cycle: 12,
    progressionEpoch: "run:5",
    rootGeneration: 3,
    maxDepth: 12,
    maxActions: 40,
  });
  const unresolvedOrObligations =
    classifyMandatoryResearchPrerequisiteObligations(unresolvedOrGraph, true);
  const unresolvedOr = evaluateResearchGoalCandidates({
    ...makeMadInput(),
    graph: unresolvedOrGraph,
    obligations: unresolvedOrObligations,
  });
  assert.equal(
    unresolvedOr.frontierSelection.status,
    "ambiguous-alternatives",
    "an OR gate remains ambiguous without complete terminal-time evidence",
  );
  assert.equal(
    evaluateResearchGoalCandidates({
      ...makeMadInput(),
      obligations: undefined,
    }).frontierSelection.status,
    "blocked-by-missing-native-authority",
  );
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
  assert.equal(
    hasVerifiedNonManaAffordabilityForManaOffer({ Mana: 100, Iron: 20 }, false),
    false,
    "a mandatory Mana offer with an unavailable non-Mana resource is rejected",
  );
  assert.equal(
    hasVerifiedNonManaAffordabilityForManaOffer({ Mana: 100 }, undefined),
    false,
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
  assert.equal(investment.preferredActionId, undefined);
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
    "verified-prerequisite",
    "a declared dependency stays visible even when the terminal action's eligibility is unresolved",
  );
  assert.equal(
    evaluation.candidates[0]?.dependencyRelation,
    "declared-prerequisite",
  );
  assert.equal(
    evaluation.candidates[0]?.pathApplicability,
    "eligible",
    "an unresolved terminal condition does not change a currently offered prerequisite's applicability",
  );
  assert.equal(evaluation.candidates[0]?.actionability, "current-native-offer");
  assert.equal(
    evaluation.preferredActionId,
    undefined,
    "current native offer membership establishes actionability, not economic desirability",
  );
}

{
  const madGraph = planNativeResearchPrerequisites({
    targetActionId: "tech-mad",
    definitions: [
      {
        ...definition("tech-mad", "mad", [
          { technologyId: "high_tech", requiredLevel: 7 },
        ]),
        hasNativeCondition: true,
      },
      { ...definition("tech-high_tech", "high_tech"), grantLevel: 7 },
    ],
    grantLevels: new Map([
      ["mad", 0],
      ["high_tech", 0],
    ]),
    offeredActionIds: new Set(["tech-high_tech"]),
    offerGenerations: new Map([["tech-high_tech", 11]]),
    cycle: 12,
    progressionEpoch: "run:5",
    rootGeneration: 3,
    maxDepth: 12,
    maxActions: 40,
  });
  const evaluation = evaluateResearchGoalCandidates(
    input({
      targetActionId: "tech-mad",
      graph: madGraph,
      offers: [
        {
          actionId: "tech-high_tech",
          grantTechnology: "high_tech",
          grantLevel: 7,
          index: 0,
          generation: 11,
          cost: Object.freeze({ Knowledge: 30_000 }),
          nativeAffordable: false,
          resourceAffordable: undefined,
          hasCostConflict: undefined,
          hasExplicitExclusion: undefined,
        },
      ],
      baselineSelectedActionId: undefined,
    }),
  );
  assert.equal(
    evaluation.candidates[0]?.dependencyRelation,
    "declared-prerequisite",
  );
  assert.equal(evaluation.candidates[0]?.relevance, "verified-prerequisite");
  assert.equal(
    evaluation.candidates[0]?.pathApplicability,
    "eligible",
    "the native MAD condition remains separate from High Tech 7 actionability",
  );
  assert.equal(evaluation.candidates[0]?.actionability, "current-native-offer");
  assert.equal(
    evaluation.preferredActionId,
    undefined,
    "static dependency evidence does not authorize a recommendation through an unresolved MAD condition",
  );
}

{
  let onRequest;
  const sent = [];
  installResearchGoalCandidatesWorker({
    addEventListener: (_type, listener) => {
      onRequest = listener;
    },
    postMessage: (message) => sent.push(message),
  });
  assert.deepEqual(sent.shift(), { kind: "worker-ready" });
  const cases = [
    input(),
    input({ goalSatisfied: true }),
    input({ cycle: 13 }),
    input({
      graph: { ...graph, targetStatus: "unavailable" },
    }),
    input({
      offers: input().offers.map((offer) =>
        offer.actionId === "tech-ore"
          ? { ...offer, generation: offer.generation + 1 }
          : offer,
      ),
    }),
    input({
      offers: input().offers.map((offer) =>
        offer.actionId === "tech-ore"
          ? { ...offer, hasCostConflict: true }
          : offer,
      ),
    }),
  ];
  const conditionalGraph = planNativeResearchPrerequisites({
    targetActionId: "tech-terminal",
    definitions: [
      {
        ...definition("tech-terminal", "terminal"),
        prerequisites: { kind: "conditional", reason: "game condition" },
      },
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
  cases.push(input({ graph: conditionalGraph }));
  const alternativeOffers = [
    ...input().offers,
    {
      ...input().offers[0],
      actionId: "tech-ore-alternative",
      index: 2,
      generation: 10,
    },
  ];
  const alternativeGraph = planNativeResearchPrerequisites({
    targetActionId: "tech-terminal",
    definitions: [
      definition("tech-terminal", "terminal", [
        { technologyId: "ore", requiredLevel: 1 },
      ]),
      definition("tech-ore", "ore"),
      definition("tech-ore-alternative", "ore"),
      definition("tech-luxury", "luxury"),
    ],
    grantLevels: new Map([
      ["terminal", 0],
      ["ore", 0],
      ["luxury", 0],
    ]),
    offeredActionIds: new Set(alternativeOffers.map((offer) => offer.actionId)),
    offerGenerations: new Map(
      alternativeOffers.map((offer) => [offer.actionId, offer.generation]),
    ),
    cycle: 12,
    progressionEpoch: "run:5",
    rootGeneration: 3,
    maxDepth: 12,
    maxActions: 40,
  });
  cases.push(input({ graph: alternativeGraph, offers: alternativeOffers }));
  for (const [index, plannerInput] of cases.entries()) {
    const identity = {
      task: RESEARCH_GOAL_CANDIDATES_TASK,
      rootGeneration: plannerInput.rootGeneration,
      progressionEpoch: plannerInput.progressionEpoch,
      offerIdentity: researchGoalOfferIdentity(plannerInput),
      snapshotVersion: index + 1,
    };
    onRequest({
      data: {
        requestId: index + 1,
        identity,
        input: structuredClone(plannerInput),
      },
    });
    const response = decodeResearchGoalCandidateResponse(sent.shift());
    assert.equal(response.requestId, index + 1);
    assert.deepEqual(
      response.outcome.value,
      evaluateResearchGoalCandidates(plannerInput),
      "worker dispatch reuses the same pure planner and input semantics",
    );
  }
}

console.log("Research goal candidate evaluation tests passed");
