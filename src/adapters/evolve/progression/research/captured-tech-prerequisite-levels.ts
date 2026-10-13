import type { CapturedTechDefinition } from "../../../../ports/captured-game-mechanics.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";

/** Indexes static registry identities once and reads live tech levels afresh on every call. */
export function createCapturedTechPrerequisiteLevelReader(): (
  root: unknown,
  definitions: readonly CapturedTechDefinition[] | undefined,
) => ReadonlyMap<string, number> | undefined {
  let indexedDefinitions: readonly CapturedTechDefinition[] | undefined;
  let technologyIds: ReadonlySet<string> | undefined;
  return (root, definitions) => {
    if (definitions === undefined) return undefined;
    if (definitions !== indexedDefinitions) {
      const nextTechnologyIds = new Set<string>();
      for (const definition of definitions) {
        nextTechnologyIds.add(definition.grantTechnology);
        if (definition.prerequisites.kind === "declared")
          for (const prerequisite of definition.prerequisites.requirements)
            nextTechnologyIds.add(prerequisite.technologyId);
      }
      indexedDefinitions = definitions;
      technologyIds = nextTechnologyIds;
    }
    const tech = readProperty(root, "tech");
    if (!isNonArrayRecord(tech) || technologyIds === undefined)
      return undefined;
    const levels = new Map<string, number>();
    for (const technologyId of technologyIds) {
      const rawLevel = readProperty(tech, technologyId);
      // actions.js checkTechRequirements uses `global.tech[req] || 0`; an uninitialized tech key
      // therefore means level zero for the declared prerequisite comparison.
      const level = rawLevel === undefined || rawLevel === null ? 0 : rawLevel;
      if (typeof level !== "number" || !Number.isFinite(level) || level < 0)
        return undefined;
      levels.set(technologyId, level);
    }
    return levels;
  };
}
