import assert from "node:assert/strict";
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

let graph;
let obligations;
let currentEvidence = "unavailable";
let effectiveDefinitions;
let grantLevels;
let applicability;
let targetEligibility;
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
  grantLevels = new Map(authority.grantLevels);
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
let steelRelationship = "unknown";
if (steelOffer === undefined) {
  steelRelationship = "unavailable";
} else if (obligations?.mandatoryActionIds.includes(steelOffer.actionId)) {
  steelRelationship = "mandatory";
} else if (
  obligations?.alternativeGroups.some(({ actionIds }) =>
    actionIds.includes(steelOffer.actionId),
  )
) {
  steelRelationship = "alternative";
} else if (
  graph?.actions.some(
    ({ actionId, status }) =>
      actionId === steelOffer.actionId &&
      (status === "conditional" || status === "unavailable"),
  ) ||
  steelDefinition?.prerequisites.kind !== "declared" ||
  applicability?.get(steelOffer.actionId)?.status === "unknown"
) {
  steelRelationship = "conditional-or-advisory";
} else if (
  obligations?.status === "verified" &&
  obligations.inputConsistency === "consistent" &&
  currentEvidence === "complete" &&
  graph?.dependencyEvidence === "complete" &&
  graph.limits.length === 0 &&
  targetEligibility?.status === "eligible"
) {
  steelRelationship = "unrelated";
}

const certificateComplete =
  issues.length === 0 &&
  obligations?.status === "verified" &&
  obligations.inputConsistency === "consistent" &&
  currentEvidence === "complete" &&
  targetEligibility?.status === "eligible" &&
  authority?.queueEvidence === "empty";
const report = {
  schema: "p13j-current-mad-owner-obligation-v1",
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
    missingEvidence: [...new Set(issues)],
    graph: graph
      ? {
          targetStatus: graph.targetStatus,
          dependencyEvidence: graph.dependencyEvidence,
          limits: graph.limits,
          unavailableFacts: graph.unavailableFacts,
          expandedActions: graph.actions.length,
          expandedRequirements: graph.requirements.length,
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
    steelContainersRelationship: steelRelationship,
  },
  diagnostic: {
    prerequisitePlannerInvocations: graph === undefined ? 0 : 1,
    nativeObligationClassifierInvocations: obligations === undefined ? 0 : 1,
    diagnosticInvocations: graph === undefined ? 0 : 1,
    additionalResearchDraws: 0,
    additionalNativeControlInvocations: 0,
    additionalCatalogScans: 0,
    traversalRecurring: false,
  },
  result: certificateComplete
    ? obligations.mandatoryActionIds.length > 0 &&
      (obligations.mandatoryActionIds.length > 1 ||
        obligations.alternativeGroups.length > 0)
      ? "B"
      : "A"
    : "C",
};

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
