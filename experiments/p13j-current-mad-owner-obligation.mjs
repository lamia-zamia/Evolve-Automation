import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import {
  combineCapturedTechEligibility,
  createEffectiveCapturedTechPrerequisiteSnapshot,
} from "../src/adapters/evolve/progression/research/captured-tech-applicability.ts";
import {
  bindNativeResearchEligibilityEvidence,
  classifyMandatoryNativeResearchObligations,
  currentMandatoryResearchEvidence,
} from "../src/domain/progression/research-prerequisite-obligations.ts";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";
import {
  classifyDeclaredRelationship,
  classifyP13KOutcome,
  reconstructDeclaredResearchWitness,
} from "./p13k-declared-witness.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const capture = JSON.parse(
  await readFile(
    new URL(
      "../test-artifacts/benchmark/tmp/p13h-research-owner-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const observation = capture.observations.find(({ cycle }) => cycle === 232);
assert.ok(observation, "P13H cycle 232 capture is required");
assert.equal(observation.actionId, "tech-steel_containers");
const authority = observation.currentMadAuthority;
const issues = [];
if (authority === undefined)
  issues.push("same-cycle MAD authority was not captured");
if (authority?.selectedPrestige !== "mad")
  issues.push("MAD is not the current selected terminal objective");
if (authority?.researchPermission !== true)
  issues.push("Research permission is not enabled at this owner boundary");
if (authority?.queueEvidence !== "empty")
  issues.push("player Research queue evidence is not empty and known");
if (
  authority?.catalogCurrent !== true ||
  authority?.offerBindingsCurrent !== true
)
  issues.push("current offer/root/progression/binding identity is incomplete");
if (
  !Number.isSafeInteger(authority?.rootGeneration) ||
  authority.rootGeneration < 0
)
  issues.push("current root generation identity is missing or invalid");
if (typeof authority?.progressionEpoch !== "string")
  issues.push("current progression identity is unavailable");
if (authority?.cycle !== observation.cycle)
  issues.push(
    "Research observation cycle does not match its owner publication",
  );

let graph;
let obligations;
let currentEvidence = "unavailable";
let effectiveDefinitions;
let grantLevels;
let applicability;
let targetEligibility;
let effectiveDefinitionIdentity;
let grantLevelIdentity;
if (
  authority?.definitions !== undefined &&
  authority?.grantLevels !== undefined &&
  authority?.applicability !== undefined &&
  Number.isSafeInteger(authority?.rootGeneration) &&
  authority.rootGeneration >= 0 &&
  typeof authority?.progressionEpoch === "string"
) {
  const context = {
    rootGeneration: authority.rootGeneration,
    progressionEpoch: authority.progressionEpoch,
  };
  const snapshot = createEffectiveCapturedTechPrerequisiteSnapshot(
    authority.definitions,
    context,
  );
  effectiveDefinitions = snapshot.definitions;
  effectiveDefinitionIdentity = sha256(snapshot.identity);
  grantLevels = new Map(authority.grantLevels);
  grantLevelIdentity = sha256(
    JSON.stringify(
      [...grantLevels].sort(([first], [second]) => first.localeCompare(second)),
    ),
  );
  applicability = new Map(authority.applicability);
  const offerGenerations = new Map(
    observation.offers.map(({ actionId, bindingGeneration }) => [
      actionId,
      bindingGeneration,
    ]),
  );
  if (
    observation.offerMembership !== "complete" ||
    observation.offers.some(({ bindingGeneration }) => !(bindingGeneration > 0))
  )
    issues.push(
      "offer membership or a native offer binding generation is incomplete",
    );
  graph = planNativeResearchPrerequisites({
    targetActionId: "tech-mad",
    definitions: effectiveDefinitions,
    grantLevels,
    applicabilityByActionId: applicability,
    offeredActionIds: new Set(offerGenerations.keys()),
    offerGenerations,
    cycle: authority.cycle,
    progressionEpoch: authority.progressionEpoch,
    rootGeneration: authority.rootGeneration,
    maxDepth: 16,
    maxActions: 256,
  });
  const madApplicability = applicability.get("tech-mad") ?? {
    status: "unknown",
    reasons: ["terminal tech-mad applicability was not captured"],
  };
  targetEligibility = combineCapturedTechEligibility([
    madApplicability,
    authority.madTargetCondition ?? {
      status: "unknown",
      reasons: ["native MAD target condition was not captured"],
    },
  ]);
  obligations = classifyMandatoryNativeResearchObligations(graph, {
    targetEligibility: bindNativeResearchEligibilityEvidence(graph, {
      actionId: "tech-mad",
      ...targetEligibility,
    }),
    definitions: effectiveDefinitions,
    grantLevels,
    applicabilityByActionId: applicability,
    offeredActionIds: new Set(offerGenerations.keys()),
  });
  currentEvidence = currentMandatoryResearchEvidence(obligations, graph, {
    goalActionId: "tech-mad",
    ownerCycle: authority.cycle,
    progressionEpoch: authority.progressionEpoch,
    rootGeneration: authority.rootGeneration,
    offers: offerGenerations,
  });
} else {
  issues.push(
    "native definitions, grants, applicability, or current identity are missing",
  );
}

const steelOffer = observation.offers.find(
  ({ actionId }) => actionId === "tech-steel_containers",
);
const steelDefinition = effectiveDefinitions?.find(
  ({ actionId }) => actionId === "tech-steel_containers",
);
const declaredWitness =
  graph !== undefined && effectiveDefinitions !== undefined
    ? reconstructDeclaredResearchWitness(
        graph,
        effectiveDefinitions,
        applicability,
        grantLevels,
        "tech-mad",
        "tech-steel_containers",
      )
    : undefined;
const currentAuthorityValid =
  authority?.selectedPrestige === "mad" &&
  authority?.cycle === observation.cycle &&
  authority?.researchPermission === true &&
  authority?.queueEvidence === "empty" &&
  authority?.catalogCurrent === true &&
  authority?.offerBindingsCurrent === true &&
  Number.isSafeInteger(authority?.rootGeneration) &&
  authority.rootGeneration >= 0 &&
  typeof authority?.progressionEpoch === "string" &&
  observation.offerMembership === "complete" &&
  typeof observation.offerSetIdentitySha256 === "string" &&
  observation.offers.every(
    ({ bindingGeneration }) =>
      Number.isSafeInteger(bindingGeneration) && bindingGeneration > 0,
  ) &&
  effectiveDefinitionIdentity !== undefined &&
  grantLevelIdentity !== undefined &&
  applicability !== undefined &&
  grantLevels !== undefined &&
  targetEligibility?.status === "eligible";
if (!currentAuthorityValid)
  issues.push("current same-cycle relationship authority is incomplete");
const currentSteelOffer =
  currentAuthorityValid &&
  steelOffer !== undefined &&
  Number.isSafeInteger(steelOffer.bindingGeneration) &&
  steelOffer.bindingGeneration > 0
    ? steelOffer
    : undefined;
const steelRelationship = classifyDeclaredRelationship({
  goalActionId: "tech-mad",
  definition: steelDefinition,
  witness: declaredWitness,
  mandatoryActionIds: obligations?.mandatoryActionIds ?? [],
  alternativeGroups: obligations?.alternativeGroups ?? [],
  inputConsistency: obligations?.inputConsistency,
  currentOffer: currentSteelOffer,
  currentEvidence,
  currentAuthority: currentAuthorityValid,
});

const certificateComplete =
  issues.length === 0 &&
  obligations?.status === "verified" &&
  obligations.inputConsistency === "consistent" &&
  currentEvidence === "complete" &&
  targetEligibility?.status === "eligible" &&
  authority?.queueEvidence === "empty" &&
  authority?.cycle === observation.cycle;
const actionableObligationCount = new Set(
  [
    ...(obligations?.mandatoryActionIds ?? []),
    ...(obligations?.alternativeGroups.flatMap(({ actionIds }) => actionIds) ??
      []),
  ].filter((actionId) => graph?.actionableFrontier.includes(actionId)),
).size;
const witnessRequirementTechnologyIds = new Set([
  ...(effectiveDefinitions?.find(({ actionId }) => actionId === "tech-mad")
    ?.prerequisites.kind === "declared"
    ? effectiveDefinitions
        .find(({ actionId }) => actionId === "tech-mad")
        .prerequisites.requirements.map(({ technologyId }) => technologyId)
    : []),
  ...(declaredWitness?.witness?.actions.flatMap((action) =>
    action.andRequirements.map(({ technologyId }) => technologyId),
  ) ?? []),
  ...(steelDefinition?.prerequisites.kind === "declared"
    ? steelDefinition.prerequisites.requirements.map(
        ({ technologyId }) => technologyId,
      )
    : []),
]);
const retainedPrerequisiteEdges =
  graph?.actions.reduce(
    (count, action) => count + action.prerequisiteIds.length,
    0,
  ) ?? 0;
const retainedCandidateEdges =
  graph?.requirements.reduce(
    (count, requirement) => count + requirement.candidateActionIds.length,
    0,
  ) ?? 0;
const highTechAlternativeEvidence = [3, 4, 5, 6, 7].map((requiredLevel) => {
  const gate = graph?.requirements.find(
    ({ technologyId, requiredLevel: level }) =>
      technologyId === "high_tech" && level === requiredLevel,
  );
  return {
    requirementId: `research:high_tech:${requiredLevel}`,
    status: gate?.status ?? "unavailable",
    candidateCount: gate?.candidateActionIds.length ?? 0,
    candidates: (gate?.candidateActionIds ?? []).map((actionId) => ({
      actionId,
      graphStatus: graph?.actions.find((action) => action.actionId === actionId)
        ?.status,
      declaredPrerequisites:
        effectiveDefinitions?.find(
          (definition) => definition.actionId === actionId,
        )?.prerequisites.kind ?? "missing-definition",
      applicability: applicability?.get(actionId)?.status ?? "unknown",
    })),
  };
});
const report = {
  schema: "p13k-indirect-mad-prerequisite-authority-v1",
  observation: {
    cycle: observation.cycle,
    actionId: observation.actionId,
    offerObservationId: observation.offerObservationId,
    offerSetIdentitySha256: observation.offerSetIdentitySha256,
    selectedPrestige: authority?.selectedPrestige,
    researchPermission: authority?.researchPermission,
    rootGeneration: authority?.rootGeneration,
    progressionEpoch: authority?.progressionEpoch,
    currentOwnerCycle: authority?.cycle,
    currentRelationshipAuthority: currentAuthorityValid
      ? "verified for this Research-owner cycle only"
      : "unavailable",
    catalogCurrent: authority?.catalogCurrent,
    offerBindingsCurrent: authority?.offerBindingsCurrent,
    madControl: authority?.madControl ?? "unavailable at this observation",
    queueEvidence: authority?.queueEvidence,
    selectedActionOffer: steelOffer,
  },
  terminal: {
    actionId: "tech-mad",
    distinction:
      "Research grant unlocks the MAD civic action; the MAD civic action performs the reset",
    definition: (() => {
      const definition = effectiveDefinitions?.find(
        ({ actionId }) => actionId === "tech-mad",
      );
      return definition === undefined
        ? undefined
        : {
            actionId: definition.actionId,
            grantTechnology: definition.grantTechnology,
            grantLevel: definition.grantLevel,
            prerequisites: definition.prerequisites,
            hasNativeCondition: definition.hasNativeCondition,
            routeRestrictions: definition.routeRestrictions,
            restrictions: definition.restrictions,
          };
    })(),
    applicability: applicability?.get("tech-mad"),
    nativeMadCondition: authority?.madTargetCondition,
    combinedEligibility: targetEligibility,
    relevantGrantLevels: Object.fromEntries(
      (effectiveDefinitions?.find(({ actionId }) => actionId === "tech-mad")
        ?.prerequisites.kind === "declared"
        ? effectiveDefinitions
            .find(({ actionId }) => actionId === "tech-mad")
            .prerequisites.requirements.map(({ technologyId }) => technologyId)
        : []
      ).map((technologyId) => [technologyId, grantLevels?.get(technologyId)]),
    ),
    totalCapturedGrantLevels: authority?.grantLevels?.length,
    nativeMadControl:
      authority?.madControl ?? "unavailable at this observation",
    effectiveDefinitionIdentitySha256: effectiveDefinitionIdentity,
    grantLevelIdentitySha256: grantLevelIdentity,
    currentOfferSetIdentity: observation.offerSetIdentitySha256,
    currentOfferGenerations: observation.offers.map(
      ({ actionId, bindingGeneration }) => [actionId, bindingGeneration],
    ),
  },
  certificate: {
    status: certificateComplete ? "verified" : "unavailable",
    classifierStatus: obligations?.status ?? "unavailable",
    mandatoryActionIds: obligations?.mandatoryActionIds ?? [],
    mandatoryProofs: obligations?.mandatoryProofs ?? [],
    alternativeGroups: obligations?.alternativeGroups ?? [],
    inputConsistency: obligations?.inputConsistency ?? "unavailable",
    inputConsistencyReasons: obligations?.inputConsistencyReasons ?? [],
    classifierReasons: obligations?.reasons ?? [],
    currentMandatoryEvidence: currentEvidence,
    mandatoryCertificateStatus:
      certificateComplete && obligations?.mandatoryActionIds.length > 0
        ? "complete"
        : "unavailable",
    missingEvidence: [...new Set(issues)],
    graph: graph
      ? {
          targetStatus: graph.targetStatus,
          dependencyEvidence: graph.dependencyEvidence,
          limits: graph.limits,
          unavailableFacts: graph.unavailableFacts,
          expandedActions: graph.actions.length,
          expandedRequirements: graph.requirements.length,
          retainedPrerequisiteEdges,
          retainedCandidateEdges,
          retainedEdgeCount: retainedPrerequisiteEdges + retainedCandidateEdges,
          actionableFrontier: graph.actionableFrontier,
          frontierOfferEvidence: graph.actionableFrontier.map((actionId) => {
            const offer = observation.offers.find(
              (entry) => entry.actionId === actionId,
            );
            return offer === undefined
              ? { actionId, status: "not in current offer set" }
              : {
                  actionId,
                  cost: offer.cost,
                  nativeAffordable: offer.nativeAffordableAtDraw,
                  bindingGeneration: offer.bindingGeneration,
                };
          }),
          cycleCount: graph.cycles.length,
          graphWork: {
            actions: graph.actions.length,
            requirements: graph.requirements.length,
            maxDepth: 16,
            maxActions: 256,
          },
        }
      : undefined,
    obligationWork: obligations?.work,
    highTechAlternativeEvidence,
    steelContainersRelationship: steelRelationship,
    declaredSteelContainersWitness: declaredWitness
      ? {
          status: declaredWitness.status,
          witness: declaredWitness.witness
            ? {
                actions: declaredWitness.witness.actions.map((action) => ({
                  ...action,
                  applicability: applicability?.get(action.actionId),
                })),
                requirementOrBranches: declaredWitness.witness.branches,
              }
            : undefined,
          work: declaredWitness.work,
          truncationReasons: declaredWitness.truncationReasons,
          unknownReasons: declaredWitness.unknownReasons,
          frontierActionDefinition:
            steelDefinition === undefined
              ? { status: "unavailable" }
              : {
                  actionId: steelDefinition.actionId,
                  grantTechnology: steelDefinition.grantTechnology,
                  grantLevel: steelDefinition.grantLevel,
                  nativeAndRequirements:
                    steelDefinition.prerequisites.kind === "declared"
                      ? steelDefinition.prerequisites.requirements
                      : {
                          status: steelDefinition.prerequisites.kind,
                          reason: steelDefinition.prerequisites.reason,
                        },
                  applicability: applicability?.get(steelDefinition.actionId),
                  status:
                    "current offer frontier; its prerequisite gates are not expanded by the retained graph",
                },
          currentGrantLevels: Object.fromEntries(
            [...witnessRequirementTechnologyIds]
              .sort()
              .map((technologyId) => [
                technologyId,
                grantLevels?.get(technologyId) ?? "unavailable",
              ]),
          ),
        }
      : {
          status: "unavailable",
          reason: "retained graph or definitions unavailable",
        },
    economicDecision: {
      cycle: 232,
      decision: "no incremental resource intervention justified",
      reason:
        "ordinary Research had sufficient Knowledge and Steel, and the native Steel Containers purchase succeeded at this Research boundary",
      smelterAuthority:
        "none; Research price and affordability do not carry into another owner cycle",
    },
  },
  diagnostic: {
    prerequisitePlannerInvocations: graph === undefined ? 0 : 1,
    nativeObligationClassifierInvocations: obligations === undefined ? 0 : 1,
    diagnosticInvocations: graph === undefined ? 0 : 1,
    witnessReconstructionInvocations: declaredWitness === undefined ? 0 : 1,
    witnessWork: declaredWitness?.work,
    additionalResearchDraws: 0,
    additionalNativeControlInvocations: 0,
    additionalCatalogScans: 0,
    traversalRecurring: false,
  },
  result: classifyP13KOutcome({
    certificateComplete,
    actionableObligationCount,
  }),
};
assert.equal(
  report.observation.cycle,
  232,
  "P13H cycle 232 is the retained sample",
);
assert.equal(report.observation.currentOwnerCycle, report.observation.cycle);
assert.equal(report.certificate.currentMandatoryEvidence, "partial");
assert.equal(report.certificate.mandatoryCertificateStatus, "unavailable");
assert.equal(
  report.certificate.steelContainersRelationship,
  "indirect-declared-path-candidate",
);
assert.equal(report.result, "C", "P13H cycle 232 remains fail-closed");
assert.equal(
  report.certificate.economicDecision.decision,
  "no incremental resource intervention justified",
);

await writeFile(
  new URL(
    "../test-artifacts/benchmark/tmp/p13j-current-mad-owner-obligation.json",
    import.meta.url,
  ),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      result: report.result,
      cycle: report.observation.cycle,
      steelContainersRelationship:
        report.certificate.steelContainersRelationship,
      certificateStatus: report.certificate.status,
      classifierStatus: report.certificate.classifierStatus,
      inputConsistency: report.certificate.inputConsistency,
      mandatoryActionIds: report.certificate.mandatoryActionIds,
      alternativeGroups: report.certificate.alternativeGroups,
      graphWork: report.certificate.graph?.graphWork,
      limitCount: report.certificate.graph?.limits.length,
      obligationWork: report.certificate.obligationWork,
      diagnostic: report.diagnostic,
    },
    null,
    2,
  ),
);
