import type {
  CapturedComputedTechRequirementsContext,
  CapturedTechDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type {
  NativeResearchActionDefinition,
  NativeResearchApplicability,
} from "../../../../domain/progression/research-prerequisite-planning.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

type CapturedTechEligibility = CapturedTechDefinition["eligibility"];

/** A computed prerequisite can participate only in the root and progression sample that observed it. */
export function readFreshCapturedComputedTechRequirements(
  definition: CapturedTechDefinition,
  context: CapturedComputedTechRequirementsContext,
): CapturedTechDefinition["prerequisites"] | undefined {
  const observation = definition.computedRequirements?.find(
    (candidate) =>
      candidate.status === "observed" &&
      candidate.complete &&
      candidate.validation === "valid" &&
      candidate.requirements !== undefined &&
      candidate.rootGeneration === context.rootGeneration &&
      candidate.progressionEpoch === context.progressionEpoch,
  );
  return observation?.requirements === undefined
    ? undefined
    : Object.freeze({
        kind: "declared",
        requirements: observation.requirements,
      });
}

export interface EffectiveCapturedTechPrerequisiteSnapshot {
  readonly definitions: readonly NativeResearchActionDefinition[] | undefined;
  readonly identity: string;
}

export function combineCapturedTechEligibility(
  observations: readonly NativeResearchApplicability[],
): NativeResearchApplicability {
  const excluded = observations.filter(
    (observation) => observation.status === "excluded",
  );
  if (excluded.length > 0)
    return Object.freeze({
      status: "excluded",
      reasons: Object.freeze(
        observations.flatMap((observation) =>
          observation.status === "excluded" ? observation.reasons : [],
        ),
      ),
    });
  const unknown = observations.filter(
    (observation) => observation.status === "unknown",
  );
  if (unknown.length > 0)
    return Object.freeze({
      status: "unknown",
      reasons: Object.freeze(
        observations.flatMap((observation) =>
          observation.status === "unknown" ? observation.reasons : [],
        ),
      ),
    });
  return Object.freeze({ status: "eligible" });
}

/** Uses only complete current computed requirements and keeps all other declarations uncertain. */
export function createEffectiveCapturedTechPrerequisiteSnapshot(
  definitions: readonly CapturedTechDefinition[] | undefined,
  context: CapturedComputedTechRequirementsContext,
): Readonly<EffectiveCapturedTechPrerequisiteSnapshot> {
  if (definitions === undefined)
    return Object.freeze({ definitions: undefined, identity: "unavailable" });

  const effective = definitions.map((definition) => {
    const computed = readFreshCapturedComputedTechRequirements(
      definition,
      context,
    );
    return {
      definition,
      prerequisites: computed ?? definition.prerequisites,
      source: computed === undefined ? "static" : "computed",
    } as const;
  });
  const identity = JSON.stringify(
    effective.map(({ definition, prerequisites, source }) => ({
      actionId: definition.actionId,
      registryKey: definition.registryKey,
      grantTechnology: definition.grantTechnology,
      grantLevel: definition.grantLevel,
      prerequisites: prerequisiteIdentity(prerequisites),
      source,
      computed: (definition.computedRequirements ?? []).map((observation) => ({
        actionId: observation.actionId,
        registryKey: observation.registryKey,
        actionIdentity: observation.actionIdentity,
        reqsIdentity: observation.reqsIdentity,
        source: observation.source,
        effectiveEra: observation.effectiveEra,
        arguments: observation.arguments,
        rootGeneration: observation.rootGeneration,
        progressionEpoch: observation.progressionEpoch,
        requirements:
          observation.requirements?.map((requirement) => ({
            technologyId: requirement.technologyId,
            requiredLevel: requirement.requiredLevel,
            applicabilityBoundary: requirement.applicabilityBoundary,
          })) ?? null,
        status: observation.status,
        complete: observation.complete,
        validation: observation.validation,
      })),
      eligibility: {
        hasNativeCondition: definition.eligibility.hasNativeCondition,
        routeRestrictions: definition.eligibility.routeRestrictions,
        restrictions: definition.eligibility.restrictions,
      },
    })),
  );
  return Object.freeze({
    definitions: Object.freeze(
      effective.map(({ definition, prerequisites }) =>
        Object.freeze({
          actionId: definition.actionId,
          grantTechnology: definition.grantTechnology,
          grantLevel: definition.grantLevel,
          prerequisites,
          hasNativeCondition: definition.eligibility.hasNativeCondition,
          routeRestrictions: definition.eligibility.routeRestrictions,
          restrictions: definition.eligibility.restrictions,
        }),
      ),
    ),
    identity,
  });
}

function prerequisiteIdentity(
  prerequisites: CapturedTechDefinition["prerequisites"],
): unknown {
  return prerequisites.kind === "declared"
    ? {
        kind: prerequisites.kind,
        requirements: prerequisites.requirements.map((requirement) => ({
          technologyId: requirement.technologyId,
          requiredLevel: requirement.requiredLevel,
          applicabilityBoundary: requirement.applicabilityBoundary,
        })),
      }
    : { kind: prerequisites.kind, reason: prerequisites.reason };
}

function capturedTruth(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") return value.length > 0;
  return undefined;
}

function readBag(
  root: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const value = readProperty(root, key);
  return isNonArrayRecord(value) ? value : undefined;
}

/** Resolves only static Research exclusions; native offers remain executable authority. */
export function readCapturedTechApplicability(
  root: unknown,
  definitions: readonly CapturedTechDefinition[] | undefined,
): ReadonlyMap<string, NativeResearchApplicability> | undefined {
  if (definitions === undefined) return undefined;
  const race = readBag(root, "race");
  const genes = readBag(root, "genes");
  const tech = readBag(root, "tech");
  if (race === undefined || genes === undefined || tech === undefined)
    return undefined;

  const iceage = capturedTruth(readProperty(race, "iceage"));
  const truepath = capturedTruth(readProperty(race, "truepath"));
  if (iceage === undefined || truepath === undefined) return undefined;
  const route = iceage ? "iceage" : truepath ? "truepath" : "standard";
  const applicability = new Map<string, NativeResearchApplicability>();

  for (const definition of definitions) {
    const eligibility: CapturedTechEligibility = definition.eligibility;
    const excluded: string[] = [];
    const unknown: string[] = [];
    if (
      eligibility.routeRestrictions !== undefined &&
      !eligibility.routeRestrictions.includes(route)
    )
      excluded.push(`native path excludes route ${route}`);

    for (const restriction of eligibility.restrictions) {
      const bag =
        restriction.kind === "trait" || restriction.kind === "not_trait"
          ? race
          : restriction.kind === "gene" || restriction.kind === "not_gene"
            ? genes
            : tech;
      for (const key of restriction.values) {
        // Upstream qualification treats lazily absent race/gene/tech keys as false.
        const value = capturedTruth(readProperty(bag, key));
        if (value === undefined) {
          unknown.push(`${restriction.kind} ${key} could not be read`);
          continue;
        }
        const isNegative =
          restriction.kind === "not_trait" ||
          restriction.kind === "not_gene" ||
          restriction.kind === "not_tech";
        if (isNegative ? value : !value)
          excluded.push(`${restriction.kind} excludes ${key}`);
      }
    }

    applicability.set(
      definition.actionId,
      excluded.length > 0
        ? Object.freeze({
            status: "excluded",
            reasons: Object.freeze(excluded),
          })
        : unknown.length > 0
          ? Object.freeze({
              status: "unknown",
              reasons: Object.freeze(unknown),
            })
          : Object.freeze({ status: "eligible" }),
    );
  }
  return applicability;
}

/** Mirrors the pinned `tech.js` `mad.condition`; it reads state without invoking native callbacks. */
export function readCapturedMadTargetCondition(
  root: unknown,
): NativeResearchApplicability {
  const race = readBag(root, "race");
  const tech = readBag(root, "tech");
  if (race === undefined || tech === undefined)
    return Object.freeze({
      status: "unknown",
      reasons: Object.freeze(["MAD target condition state is unavailable"]),
    });
  const sludge = capturedTruth(readProperty(race, "sludge"));
  const ultraSludge = capturedTruth(readProperty(race, "ultra_sludge"));
  const truepath = capturedTruth(readProperty(race, "truepath"));
  const worldControl = capturedTruth(readProperty(tech, "world_control"));
  if (
    sludge === undefined ||
    ultraSludge === undefined ||
    truepath === undefined ||
    worldControl === undefined
  )
    return Object.freeze({
      status: "unknown",
      reasons: Object.freeze(["MAD target condition facts are incomplete"]),
    });
  if (sludge || ultraSludge)
    return Object.freeze({
      status: "excluded",
      reasons: Object.freeze(["native MAD condition excludes sludge races"]),
    });
  if (truepath && !worldControl)
    return Object.freeze({
      status: "excluded",
      reasons: Object.freeze([
        "native MAD condition requires world control on Truepath",
      ]),
    });
  return Object.freeze({ status: "eligible" });
}
