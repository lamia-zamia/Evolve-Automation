import type { CapturedTechDefinition } from "../../../../ports/captured-game-mechanics.ts";
import type { NativeResearchApplicability } from "../../../../domain/progression/research-prerequisite-planning.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

type CapturedTechEligibility = CapturedTechDefinition["eligibility"];

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
