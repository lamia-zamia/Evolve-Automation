import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  classifyDeclaredRelationship,
  classifyP13KOutcome,
  reconstructDeclaredResearchWitness,
} from "../../experiments/p13k-declared-witness.mjs";
import {
  currentMandatoryResearchEvidence,
  researchPrerequisiteSnapshotIdentity,
} from "../../src/domain/progression/research-prerequisite-obligations.ts";

const definition = (
  actionId,
  grantTechnology,
  grantLevel,
  requirements = [],
) => ({
  actionId,
  grantTechnology,
  grantLevel,
  prerequisites: { kind: "declared", requirements },
  hasNativeCondition: false,
  restrictions: [],
});

const makeGraph = ({
  definitions,
  frontier,
  dependencyEvidence = "complete",
  rootGeneration = 1,
}) => {
  const offers = new Map(
    frontier.map((actionId, index) => [actionId, index + 1]),
  );
  const requirements = new Map();
  for (const action of definitions) {
    if (action.prerequisites.kind !== "declared") continue;
    for (const prerequisite of action.prerequisites.requirements) {
      const id = `research:${prerequisite.technologyId}:${prerequisite.requiredLevel}`;
      if (requirements.has(id)) continue;
      const observedLevel = 0;
      const candidates = definitions
        .filter(
          (candidate) =>
            candidate.grantTechnology === prerequisite.technologyId &&
            candidate.grantLevel >= prerequisite.requiredLevel,
        )
        .map(({ actionId }) => actionId);
      requirements.set(id, {
        id,
        technologyId: prerequisite.technologyId,
        requiredLevel: prerequisite.requiredLevel,
        observedLevel,
        declaredStatus: "unsatisfied",
        status: "unsatisfied",
        candidateActionIds: candidates,
        reasons: [],
      });
    }
  }
  const gates = [...requirements.values()];
  const actions = definitions.map((action) => ({
    actionId: action.actionId,
    grantTechnology: action.grantTechnology,
    grantLevel: action.grantLevel,
    status: frontier.includes(action.actionId) ? "frontier" : "unsatisfied",
    prerequisiteIds:
      action.prerequisites.kind === "declared"
        ? action.prerequisites.requirements.map(
            ({ technologyId, requiredLevel }) =>
              `research:${technologyId}:${requiredLevel}`,
          )
        : [],
    reasons: [],
  }));
  const graph = {
    targetActionId: "tech-mad",
    targetStatus: "unsatisfied",
    dependencyEvidence,
    actions,
    requirements: gates,
    actionableFrontier: frontier,
    cycles: [],
    limits: [],
    unavailableFacts:
      dependencyEvidence === "complete"
        ? []
        : ["unrelated incomplete declaration"],
    provenance: "effective-native-research-definition-snapshot",
    freshness: {
      cycle: 232,
      progressionEpoch: "progression-232",
      rootGeneration,
      offerGenerations: [...offers],
    },
  };
  const levels = new Map(
    ["mad", "high_tech", "steel_container", "barns", "other"].map((id) => [
      id,
      0,
    ]),
  );
  const applicability = new Map(
    definitions.map(({ actionId }) => [actionId, { status: "eligible" }]),
  );
  return { graph, offers, levels, applicability };
};

const steelPathDefinitions = [
  definition("tech-mad", "mad", 1, [
    { technologyId: "high_tech", requiredLevel: 2 },
  ]),
  definition("tech-industrialization", "high_tech", 2, [
    { technologyId: "steel_container", requiredLevel: 1 },
  ]),
  definition("tech-steel_containers", "steel_container", 1),
];

{
  const retained = makeGraph({
    definitions: steelPathDefinitions,
    frontier: ["tech-steel_containers"],
    dependencyEvidence: "partial",
  });
  const witness = reconstructDeclaredResearchWitness(
    retained.graph,
    steelPathDefinitions,
    retained.applicability,
    retained.levels,
    "tech-mad",
    "tech-steel_containers",
  );
  assert.equal(
    witness.status,
    "found",
    "a locally valid witness survives unrelated incompleteness",
  );
  assert.deepEqual(
    witness.witness.actions.map(({ actionId }) => actionId),
    ["tech-mad", "tech-industrialization"],
  );
  assert.deepEqual(witness.witness.actions[1].andRequirements, [
    { technologyId: "steel_container", requiredLevel: 1 },
  ]);
  assert.deepEqual(witness.witness.branches[0].candidateActionIds, [
    "tech-industrialization",
  ]);
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "incomplete",
      currentOffer: {
        actionId: "tech-steel_containers",
        bindingGeneration: 251,
      },
      currentEvidence: "partial",
      currentAuthority: true,
    }),
    "indirect-declared-path-candidate",
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: {
        actionId: "tech-steel_containers",
        bindingGeneration: 1,
      },
      currentEvidence: "complete",
      currentAuthority: false,
    }),
    "unknown-current-authority",
    "a retained path cannot make a stale owner offer current",
  );
  assert.ok(witness.work.nodesExamined <= witness.work.maxNodes);
  assert.ok(witness.work.edgesExamined <= witness.work.maxEdges);
}

{
  const complete = makeGraph({
    definitions: steelPathDefinitions,
    frontier: ["tech-steel_containers"],
  });
  const witness = reconstructDeclaredResearchWitness(
    complete.graph,
    steelPathDefinitions,
    complete.applicability,
    complete.levels,
    "tech-mad",
    "tech-steel_containers",
  );
  assert.equal(witness.status, "found");
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness,
      mandatoryActionIds: ["tech-steel_containers"],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-steel_containers", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "mandatory",
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness,
      mandatoryActionIds: ["tech-steel_containers"],
      alternativeGroups: [],
      inputConsistency: "incomplete",
      currentOffer: { actionId: "tech-steel_containers", bindingGeneration: 1 },
      currentEvidence: "partial",
      currentAuthority: true,
    }),
    "indirect-declared-path-candidate",
    "scoped mandatory output does not become a complete mandatory certificate",
  );
  const missingApplicability = new Map(complete.applicability);
  missingApplicability.delete("tech-industrialization");
  const incompletePath = reconstructDeclaredResearchWitness(
    complete.graph,
    steelPathDefinitions,
    missingApplicability,
    complete.levels,
    "tech-mad",
    "tech-steel_containers",
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness: incompletePath,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "incomplete",
      currentOffer: { actionId: "tech-steel_containers", bindingGeneration: 1 },
      currentEvidence: "partial",
      currentAuthority: true,
    }),
    "unknown-path-applicability",
  );
}

{
  const bypass = definition("tech-alternate_high_tech", "high_tech", 2);
  assert.equal(bypass.grantTechnology, "high_tech");
  const bypassGraph = makeGraph({
    definitions: [...steelPathDefinitions, bypass],
    frontier: ["tech-steel_containers", bypass.actionId],
  });
  assert.ok(
    bypassGraph.graph.requirements
      .find(({ id }) => id === "research:high_tech:2")
      .candidateActionIds.includes(bypass.actionId),
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness: reconstructDeclaredResearchWitness(
        bypassGraph.graph,
        [...steelPathDefinitions, bypass],
        new Map(
          [...steelPathDefinitions, bypass].map(({ actionId }) => [
            actionId,
            { status: "eligible" },
          ]),
        ),
        new Map([
          ["mad", 0],
          ["high_tech", 0],
          ["steel_container", 0],
        ]),
        "tech-mad",
        "tech-steel_containers",
      ),
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-steel_containers", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "indirect-declared-path-candidate",
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: steelPathDefinitions[2],
      witness: reconstructDeclaredResearchWitness(
        bypassGraph.graph,
        [...steelPathDefinitions, bypass],
        new Map(
          [...steelPathDefinitions, bypass].map(({ actionId }) => [
            actionId,
            { status: "eligible" },
          ]),
        ),
        new Map([
          ["mad", 0],
          ["high_tech", 0],
          ["steel_container", 0],
        ]),
        "tech-mad",
        "tech-steel_containers",
      ),
      mandatoryActionIds: [],
      alternativeGroups: [
        {
          requirementId: "research:high_tech:2",
          actionIds: ["tech-steel_containers", bypass.actionId],
        },
      ],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-steel_containers", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "one-of-several-mandatory-alternatives",
  );
}

{
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: undefined,
      witness: undefined,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-missing", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "unknown-definition-unavailable",
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: { actionId: "tech-steel_containers" },
      witness: undefined,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-steel_containers", bindingGeneration: 0 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "unknown-current-binding-invalid",
  );
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: { actionId: "tech-barns" },
      witness: undefined,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-barns", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "proven-unrelated",
  );

  const unrelatedDefinition = definition("tech-barns", "barns", 1);
  const definitions = [...steelPathDefinitions, unrelatedDefinition];
  const unrelated = makeGraph({ definitions, frontier: ["tech-barns"] });
  const unrelatedWitness = reconstructDeclaredResearchWitness(
    unrelated.graph,
    definitions,
    unrelated.applicability,
    unrelated.levels,
    "tech-mad",
    "tech-barns",
  );
  assert.equal(unrelatedWitness.status, "not-found");
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: unrelatedDefinition,
      witness: unrelatedWitness,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-barns", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "proven-unrelated",
  );

  const missingIntermediate = {
    ...unrelated.graph,
    actions: unrelated.graph.actions.filter(
      ({ actionId }) => actionId !== "tech-industrialization",
    ),
  };
  const missingIntermediateWitness = reconstructDeclaredResearchWitness(
    missingIntermediate,
    definitions,
    unrelated.applicability,
    unrelated.levels,
    "tech-mad",
    "tech-barns",
  );
  assert.equal(missingIntermediateWitness.status, "unknown");
  assert.equal(
    classifyDeclaredRelationship({
      goalActionId: "tech-mad",
      definition: unrelatedDefinition,
      witness: missingIntermediateWitness,
      mandatoryActionIds: [],
      alternativeGroups: [],
      inputConsistency: "consistent",
      currentOffer: { actionId: "tech-barns", bindingGeneration: 1 },
      currentEvidence: "complete",
      currentAuthority: true,
    }),
    "unknown-witness-incomplete",
    "a missing intermediate graph action cannot prove non-ancestry",
  );
  assert.equal(
    classifyP13KOutcome({
      certificateComplete: true,
      actionableObligationCount: 0,
    }),
    "C",
  );
  assert.equal(
    classifyP13KOutcome({
      certificateComplete: true,
      actionableObligationCount: 1,
    }),
    "A",
  );
  assert.equal(
    classifyP13KOutcome({
      certificateComplete: false,
      actionableObligationCount: 1,
    }),
    "C",
  );
}

{
  const complete = makeGraph({
    definitions: steelPathDefinitions,
    frontier: ["tech-steel_containers"],
    rootGeneration: 0,
  });
  const plan = {
    status: "verified",
    inputConsistency: "consistent",
    mandatoryActionIds: ["tech-steel_containers"],
    alternativeGroups: [],
    authority: {
      targetActionId: "tech-mad",
      freshness: complete.graph.freshness,
      snapshotIdentity: researchPrerequisiteSnapshotIdentity(complete.graph),
    },
  };
  const authority = {
    goalActionId: "tech-mad",
    ownerCycle: 232,
    progressionEpoch: "progression-232",
    rootGeneration: 0,
    offers: complete.offers,
  };
  assert.equal(
    currentMandatoryResearchEvidence(plan, complete.graph, authority),
    "complete",
  );
  assert.equal(
    currentMandatoryResearchEvidence(plan, complete.graph, {
      ...authority,
      offers: new Map([["tech-steel_containers", 0]]),
    }),
    "partial",
  );
  for (const changed of [
    { ...authority, ownerCycle: 233 },
    { ...authority, progressionEpoch: "progression-changed" },
    { ...authority, rootGeneration: 1 },
    { ...authority, offers: new Map([["tech-steel_containers", 2]]) },
  ])
    assert.equal(
      currentMandatoryResearchEvidence(plan, complete.graph, changed),
      "partial",
    );
}

{
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../../experiments/stage3f-mana-claim-manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(manifest.results.D.selectedClaim.mandatoryActionIds, [
    "tech-black_powder",
    "tech-mad_science",
  ]);
  assert.deepEqual(
    manifest.results.D.selectedClaim.claims.map(
      ({ requiredQuantity }) => requiredQuantity,
    ),
    [100, 50],
  );
}

console.log("P13K declared witness and authority checks passed");
