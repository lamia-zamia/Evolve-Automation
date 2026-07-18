import type {
  ResearchDecision,
  ResearchTechView,
} from "../../domain/research.ts";
import type {
  ResearchCommandExecutor,
  ResearchExecutionResult,
  ResearchReader,
} from "../../ports/research.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface ResearchReaderDependencies {
  readonly getState: () => unknown;
  readonly getCostConflict: (tech: unknown) => unknown;
}

export interface ResearchExecutorDependencies {
  readonly getState: () => unknown;
  readonly getBuildingManager: () => unknown;
  readonly getProjectManager: () => unknown;
}

function readUnlockedTechs(getState: () => unknown): unknown[] {
  const state = requireRecord(getState(), "state");
  const unlockedTechs = state["unlockedTechs"];
  if (!Array.isArray(unlockedTechs)) {
    throw new TypeError("state.unlockedTechs must be an array");
  }
  return unlockedTechs;
}

function readTechId(tech: UnknownRecord, path: string): string {
  const id = tech["id"];
  if (typeof id !== "string") {
    throw new TypeError(`${path}.id must be a string`);
  }
  return id;
}

export function createResearchReader(
  dependencies: ResearchReaderDependencies,
): ResearchReader {
  return Object.freeze({
    read(startIndex: number) {
      if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
        throw new TypeError(
          "research start index must be a non-negative integer",
        );
      }

      const unlockedTechs = readUnlockedTechs(dependencies.getState);
      const techs: ResearchTechView[] = [];
      for (let index = startIndex; index < unlockedTechs.length; index++) {
        const path = `state.unlockedTechs[${index}]`;
        const tech = requireRecord(unlockedTechs[index], path);
        const isAffordable = requireFunction(
          tech["isAffordable"],
          `${path}.isAffordable`,
        );
        const affordable = Boolean(Reflect.apply(isAffordable, tech, []));
        const view = Object.freeze({
          index,
          id: readTechId(tech, path),
          affordable,
          // Match the legacy && gate: conflict analysis is irrelevant when the
          // technology is not affordable.
          hasCostConflict: affordable
            ? Boolean(dependencies.getCostConflict(tech))
            : false,
        });
        techs.push(view);
        if (view.affordable && !view.hasCostConflict) {
          break;
        }
      }

      return Object.freeze({ techs: Object.freeze(techs) });
    },
  });
}

function executionResult(
  outcome: ResearchExecutionResult["outcome"],
  researched: boolean,
): ResearchExecutionResult {
  return Object.freeze({ outcome, researched });
}

export function createResearchCommandExecutor(
  dependencies: ResearchExecutorDependencies,
): ResearchCommandExecutor {
  return Object.freeze({
    execute(decision: Readonly<ResearchDecision>) {
      if (!Number.isSafeInteger(decision.index) || decision.index < 0) {
        return executionResult(
          rejected(
            "invalid-research-index",
            "research index must be a non-negative integer",
          ),
          false,
        );
      }

      const unlockedTechs = readUnlockedTechs(dependencies.getState);
      const value = unlockedTechs[decision.index];
      const tech =
        typeof value === "object" && value !== null
          ? (value as UnknownRecord)
          : null;
      const actualId =
        tech !== null && typeof tech["id"] === "string" ? tech["id"] : null;
      if (actualId !== decision.techId || tech === null) {
        return executionResult(
          stale("stale-research-target", "unlocked research list changed", {
            techId: decision.techId,
            index: decision.index,
            actualTechId: actualId,
          }),
          false,
        );
      }

      const click = requireFunction(
        tech["click"],
        `state.unlockedTechs[${decision.index}].click`,
      );
      // Resolve both refresh operations before the research mutation so a
      // malformed upstream manager cannot leave caches half-refreshed.
      const buildingManager = requireRecord(
        dependencies.getBuildingManager(),
        "BuildingManager",
      );
      const updateBuildings = requireFunction(
        buildingManager["updateBuildings"],
        "BuildingManager.updateBuildings",
      );
      const projectManager = requireRecord(
        dependencies.getProjectManager(),
        "ProjectManager",
      );
      const updateProjects = requireFunction(
        projectManager["updateProjects"],
        "ProjectManager.updateProjects",
      );

      if (!Reflect.apply(click, tech, [])) {
        return executionResult(SUCCEEDED, false);
      }
      Reflect.apply(updateBuildings, buildingManager, []);
      Reflect.apply(updateProjects, projectManager, []);
      return executionResult(SUCCEEDED, true);
    },
  });
}
