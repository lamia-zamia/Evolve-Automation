/**
 * Samples the captured game facts that a condition operand cannot read from the root alone.
 * Both stored triggers and stored setting overrides use this reader so each operand has one
 * source of truth and each caller samples only the facts its conditions need.
 */

import {
  SWARM_SATELLITE_ACTION_ID,
  splitCapturedBuildingCostArgument,
  type CapturedConditionContext,
  type CapturedConditionDemand,
} from "./captured-conditions.ts";
import type {
  GameActionCostReader,
  GameActionPrice,
} from "../../ports/game-action-costs.ts";
import type { OfferedProject } from "../../ports/game-project-catalog.ts";
import type { OfferedTech } from "../../ports/game-tech-catalog.ts";
import { isRecord, splitActionId } from "../validation.ts";

export interface CapturedConditionContextRequirement {
  readonly type: string;
  readonly argument: unknown;
}

export interface CapturedConditionContextReadOptions {
  /** Trigger actions also need catalogs to price their targets. */
  readonly includeTechCatalog?: boolean;
  readonly includeProjectCatalog?: boolean;
  /** Overrides take a new demand sample at the current period wake. */
  readonly readDemandSample?: () => CapturedConditionDemand | undefined;
}

export interface CapturedConditionContextRead {
  readonly context: Readonly<CapturedConditionContext>;
  readonly offeredTechs?: readonly Readonly<OfferedTech>[];
  readonly grantedTechs?: ReadonlySet<string>;
  readonly offeredProjects?: readonly Readonly<OfferedProject>[];
}

export interface CapturedConditionContextReaderDependencies {
  readonly costs: GameActionCostReader;
  readonly readOfferedTechs?:
    (() => readonly Readonly<OfferedTech>[] | undefined) | undefined;
  readonly readGrantedTechs?:
    (() => ReadonlySet<string> | undefined) | undefined;
  readonly readProjects?:
    (() => readonly Readonly<OfferedProject>[] | undefined) | undefined;
  readonly readBuildingUnlocks?:
    | ((
        regions: ReadonlySet<string>,
      ) => CapturedConditionContext["buildingUnlocks"] | undefined)
    | undefined;
  readonly readBuildingCapacity?:
    | ((
        actionIds: ReadonlySet<string>,
      ) => ReadonlyMap<string, boolean | undefined>)
    | undefined;
  readonly readDemandSample?:
    (() => CapturedConditionDemand | undefined) | undefined;
  readonly readTechKnowledge?: (() => number | undefined) | undefined;
  readonly readHellGarrison?: (() => number | undefined) | undefined;
}

const CAPTURED_CONDITION_DEMAND_TYPES: ReadonlySet<string> = new Set([
  "ResourceDemanded",
  "ResourceSatisfied",
  "ResourceSatisfyRatio",
  "ResourceMaxCost",
]);

const CAPTURED_CONDITION_REGION_TYPES: ReadonlySet<string> = new Set([
  "BuildingUnlocked",
  "BuildingClickable",
  "BuildingEnabled",
  "BuildingDisabled",
]);

export function capturedConditionsNeedDemand(
  requirements: readonly CapturedConditionContextRequirement[],
): boolean {
  return requirements.some(({ type }) =>
    CAPTURED_CONDITION_DEMAND_TYPES.has(type),
  );
}

export function capturedConditionsNeedGrantedTechs(
  requirements: readonly CapturedConditionContextRequirement[],
): boolean {
  return requirements.some(({ type }) => type === "ResearchComplete");
}

export function capturedConditionsNeedTechKnowledge(
  requirements: readonly CapturedConditionContextRequirement[],
): boolean {
  return requirements.some(
    ({ type, argument }) => type === "Other" && argument === "tknow",
  );
}

function capturedConditionCostBuildingId(
  requirement: CapturedConditionContextRequirement,
): string | undefined {
  if (
    requirement.type === "BuildingAffordable" ||
    requirement.type === "BuildingClickable"
  ) {
    return typeof requirement.argument === "string"
      ? requirement.argument
      : undefined;
  }
  if (requirement.type === "BuildingCost") {
    if (typeof requirement.argument !== "string") return undefined;
    return splitCapturedBuildingCostArgument(requirement.argument)?.buildingId;
  }
  if (requirement.type === "Other" && requirement.argument === "satcost") {
    return SWARM_SATELLITE_ACTION_ID;
  }
  return undefined;
}

export function createCapturedConditionContextReader({
  costs: conditionContextCosts,
  readOfferedTechs: readConditionOfferedTechs,
  readGrantedTechs: readConditionGrantedTechs,
  readProjects: readConditionProjects,
  readBuildingUnlocks: readConditionBuildingUnlocks,
  readBuildingCapacity: readConditionBuildingCapacity,
  readDemandSample: readConditionDemandSample,
  readTechKnowledge: readConditionTechKnowledge,
  readHellGarrison: readConditionHellGarrison,
}: CapturedConditionContextReaderDependencies) {
  return Object.freeze({
    read(
      requirements: readonly CapturedConditionContextRequirement[],
      settings: unknown,
      options: CapturedConditionContextReadOptions = {},
    ): CapturedConditionContextRead {
      const needsOfferedTechs =
        options.includeTechCatalog === true ||
        requirements.some(
          ({ type }) =>
            type === "ResearchUnlocked" || type === "ResearchComplete",
        );
      const needsOfferedTechKnowledge = requirements.some(
        ({ type, argument }) => type === "Other" && argument === "tknow",
      );
      const offeredTechs =
        needsOfferedTechs || needsOfferedTechKnowledge
          ? readConditionOfferedTechs?.()
          : undefined;
      const grantedTechs = needsOfferedTechs
        ? readConditionGrantedTechs?.()
        : undefined;

      const needsProjects =
        options.includeProjectCatalog === true ||
        requirements.some(({ type }) => type === "ProjectUnlocked");
      const offeredProjects = needsProjects
        ? readConditionProjects?.()
        : undefined;

      const buildingRegions = new Set<string>();
      for (const requirement of requirements) {
        if (!CAPTURED_CONDITION_REGION_TYPES.has(requirement.type)) continue;
        if (typeof requirement.argument !== "string") continue;
        const parts = splitActionId(requirement.argument);
        if (parts !== undefined) buildingRegions.add(parts.region);
      }
      const buildingUnlocks =
        buildingRegions.size === 0
          ? undefined
          : readConditionBuildingUnlocks?.(buildingRegions);

      const buildingCosts = new Map<string, GameActionPrice>();
      for (const requirement of requirements) {
        const buildingId = capturedConditionCostBuildingId(requirement);
        if (buildingId === undefined || buildingCosts.has(buildingId)) {
          continue;
        }
        const price = conditionContextCosts.readCost(buildingId);
        if (price !== undefined) buildingCosts.set(buildingId, price);
      }

      const buildingCapacityIds = new Set<string>();
      for (const requirement of requirements) {
        if (
          requirement.type === "BuildingClickable" &&
          typeof requirement.argument === "string"
        ) {
          buildingCapacityIds.add(requirement.argument);
        }
      }
      const buildingCapacity =
        buildingCapacityIds.size === 0
          ? undefined
          : readConditionBuildingCapacity?.(buildingCapacityIds);

      const demandRequested = capturedConditionsNeedDemand(requirements);
      const demand = demandRequested
        ? (options.readDemandSample ?? readConditionDemandSample)?.()
        : undefined;
      const knowledgeRequiredByTechs = capturedConditionsNeedTechKnowledge(
        requirements,
      )
        ? readConditionTechKnowledge?.()
        : undefined;
      const hellGarrison = requirements.some(
        ({ type, argument }) =>
          type === "Soldiers" && argument === "hellGarrison",
      )
        ? readConditionHellGarrison?.()
        : undefined;

      const offeredTechIds =
        offeredTechs === undefined
          ? undefined
          : new Set(offeredTechs.map((tech) => tech.elementId));
      const unlockedProjectIds =
        offeredProjects === undefined
          ? undefined
          : new Set(offeredProjects.map((project) => project.elementId));
      const storedSettings = isRecord(settings) ? settings : undefined;
      const context = Object.freeze({
        ...(offeredTechIds === undefined
          ? {}
          : { offeredTechs: offeredTechIds }),
        ...(grantedTechs === undefined ? {} : { grantedTechs }),
        ...(unlockedProjectIds === undefined
          ? {}
          : { unlockedProjects: unlockedProjectIds }),
        ...(buildingUnlocks === undefined ? {} : { buildingUnlocks }),
        ...(buildingCosts.size === 0 ? {} : { buildingCosts }),
        ...(buildingCapacity === undefined ? {} : { buildingCapacity }),
        ...(storedSettings === undefined ? {} : { settings: storedSettings }),
        ...(demand === undefined ? {} : { demand }),
        ...(knowledgeRequiredByTechs === undefined
          ? {}
          : { knowledgeRequiredByTechs }),
        ...(hellGarrison === undefined ? {} : { hellGarrison }),
      });
      return Object.freeze({
        context,
        ...(offeredTechs === undefined ? {} : { offeredTechs }),
        ...(grantedTechs === undefined ? {} : { grantedTechs }),
        ...(offeredProjects === undefined ? {} : { offeredProjects }),
      });
    },
  });
}
