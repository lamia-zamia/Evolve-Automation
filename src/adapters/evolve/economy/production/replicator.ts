import type {
  ReplicatorGovernorGateInput,
  ReplicatorMetric,
  ReplicatorPlanningInput,
  ReplicatorPriorityPlan,
  ReplicatorProductionInput,
  ReplicatorSelectionDecision,
} from "../../../../domain/economy/production/replicator.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type {
  ReplicatorGovernorGameReader,
  ReplicatorSelectionReader,
} from "../../../../ports/replicator.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

interface ReplicatorSession {
  readonly resourcesById: ReadonlyMap<string, UnknownRecord>;
}

function callBoolean(record: UnknownRecord, name: string, path: string) {
  return Boolean(
    Reflect.apply(requireFunction(record[name], `${path}.${name}`), record, []),
  );
}

function readProductionId(production: UnknownRecord, path: string): string {
  const id = production["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(`${path}.id must be a non-empty string`);
  }
  return id;
}

function readProductions(manager: UnknownRecord): {
  readonly values: readonly UnknownRecord[];
  readonly byId: ReadonlyMap<string, UnknownRecord>;
} {
  const productions = requireRecord(
    manager["Productions"],
    "ReplicatorManager.Productions",
  );
  const values: UnknownRecord[] = [];
  const byId = new Map<string, UnknownRecord>();
  for (const [key, value] of Object.entries(productions)) {
    const path = `ReplicatorManager.Productions.${key}`;
    const production = requireRecord(value, path);
    const id = readProductionId(production, path);
    if (byId.has(id)) {
      throw new TypeError(
        `ReplicatorManager.Productions has duplicate id ${id}`,
      );
    }
    values.push(production);
    byId.set(id, production);
  }
  return Object.freeze({ values: Object.freeze(values), byId });
}

function requireNonNegative(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number < 0) {
    throw new TypeError(`${path} must be non-negative`);
  }
  return number;
}

function requirePositive(value: unknown, path: string): number {
  const number = requireNumber(value, path);
  if (number <= 0) {
    throw new TypeError(`${path} must be positive`);
  }
  return number;
}

export interface ReplicatorSelectionReaderDependencies {
  // TRANSITIONAL: ReplicatorManager remains the narrow bridge to the current
  // Vue iReplicator control until the Milestone 5 game/bootstrap adapter.
  readonly getManager: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
}

export function createReplicatorSelectionReader(
  dependencies: ReplicatorSelectionReaderDependencies,
): ReplicatorSelectionReader {
  let session: ReplicatorSession | null = null;

  return Object.freeze({
    readPlanningInput(): ReplicatorPlanningInput {
      const manager = requireRecord(
        dependencies.getManager(),
        "ReplicatorManager",
      );
      if (!callBoolean(manager, "initIndustry", "ReplicatorManager")) {
        session = null;
        return Object.freeze({
          initialised: false,
          assignGovernorTask: false,
          scoreMode: "weight",
          selectHighestScore: false,
          productions: Object.freeze([]),
        });
      }

      const settings = requireRecord(dependencies.getSettings(), "settings");
      const rawMode = settings["replicatorWeightingMode"];
      const scoreMode =
        rawMode === "mass"
          ? "mass"
          : rawMode === "quantity"
            ? "quantity"
            : "weight";
      const rawProductions = readProductions(manager);
      const resourcesById = new Map<string, UnknownRecord>();
      const productions: ReplicatorProductionInput[] =
        rawProductions.values.map((production, index) => {
          const path = `ReplicatorManager.Productions[${index}]`;
          const id = readProductionId(production, path);
          const unlocked = Boolean(production["unlocked"]);
          const enabled = Boolean(production["enabled"]);
          if (!unlocked || !enabled) {
            return Object.freeze({
              id,
              unlocked,
              enabled,
              weighting: 0,
              priority: 0,
              demanded: false,
              useful: false,
            });
          }
          const weighting = requireNumber(
            production["weighting"],
            `${path}.weighting`,
          );
          if (weighting <= 0) {
            return Object.freeze({
              id,
              unlocked,
              enabled,
              weighting,
              priority: 0,
              demanded: false,
              useful: false,
            });
          }
          const resource = requireRecord(
            production["resource"],
            `${path}.resource`,
          );
          resourcesById.set(id, resource);
          return Object.freeze({
            id,
            unlocked,
            enabled,
            weighting,
            priority: requireNumber(production["priority"], `${path}.priority`),
            demanded: callBoolean(resource, "isDemanded", `${path}.resource`),
            useful: callBoolean(resource, "isUseful", `${path}.resource`),
          });
        });
      session = Object.freeze({ resourcesById });
      return Object.freeze({
        initialised: true,
        assignGovernorTask: Boolean(settings["replicatorAssignGovernorTask"]),
        scoreMode,
        // Preserve the legacy split between the switch default and this test:
        // unknown modes use weight scores but select the final/highest entry.
        selectHighestScore: rawMode !== "legacy",
        productions: Object.freeze(productions),
      });
    },

    readMetrics(
      priorityPlan: Readonly<ReplicatorPriorityPlan>,
    ): readonly ReplicatorMetric[] {
      if (session === null) {
        throw new Error(
          "replicator planning input must be read before selection metrics",
        );
      }
      const activeSession = session;
      const allResources =
        priorityPlan.scoreMode === "mass"
          ? requireRecord(dependencies.getResources(), "resources")
          : null;
      const seen = new Set<string>();
      const metrics = priorityPlan.candidates.map((candidate) => {
        if (seen.has(candidate.productionId)) {
          throw new TypeError(
            `duplicate replicator metric id ${candidate.productionId}`,
          );
        }
        seen.add(candidate.productionId);
        const resource = activeSession.resourcesById.get(
          candidate.productionId,
        );
        if (resource === undefined) {
          throw new TypeError(
            `unknown replicator metric id ${candidate.productionId}`,
          );
        }
        if (priorityPlan.scoreMode === "weight") {
          return Object.freeze({
            productionId: candidate.productionId,
            currentQuantity: 0,
            atomicMass: 1,
            exotic: false,
          });
        }
        const currentQuantity = requireNonNegative(
          resource["currentQuantity"],
          `resources.${candidate.productionId}.currentQuantity`,
        );
        const atomicMass =
          priorityPlan.scoreMode === "mass"
            ? requirePositive(
                resource["atomicMass"],
                `resources.${candidate.productionId}.atomicMass`,
              )
            : 1;
        return Object.freeze({
          productionId: candidate.productionId,
          currentQuantity,
          atomicMass,
          exotic:
            priorityPlan.scoreMode === "mass" &&
            (resource === allResources?.["Elerium"] ||
              resource === allResources?.["Infernite"]),
        });
      });
      return Object.freeze(metrics);
    },
  });
}

export function createReplicatorSelectionExecutor(
  getManager: () => unknown,
): DecisionExecutor<ReplicatorSelectionDecision> {
  return Object.freeze({
    execute(decision: Readonly<ReplicatorSelectionDecision>) {
      const manager = requireRecord(getManager(), "ReplicatorManager");
      const production = readProductions(manager).byId.get(
        decision.productionId,
      );
      if (production === undefined) {
        return stale(
          "stale-replicator-production",
          "replicator production list changed",
          { productionId: decision.productionId },
        );
      }
      const setResource = requireFunction(
        manager["setResource"],
        "ReplicatorManager.setResource",
      );
      Reflect.apply(setResource, manager, [decision.productionId]);
      return SUCCEEDED;
    },
  });
}

export interface ReplicatorGovernorGameReaderDependencies {
  readonly getGovernor: () => unknown;
  readonly haveReplicatorTechnology: () => unknown;
  readonly getGame: () => unknown;
}

export function createReplicatorGovernorGameReader(
  dependencies: ReplicatorGovernorGameReaderDependencies,
): ReplicatorGovernorGameReader {
  return Object.freeze({
    readGate(): ReplicatorGovernorGateInput {
      const governor = dependencies.getGovernor();
      if (governor === "none") {
        return Object.freeze({
          governorPresent: false,
          replicatorTechnology: false,
        });
      }
      return Object.freeze({
        governorPresent: true,
        replicatorTechnology: Boolean(dependencies.haveReplicatorTechnology()),
      });
    },

    readTasks(): readonly string[] {
      const game = requireRecord(dependencies.getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const governor = requireRecord(
        race["governor"],
        "game.global.race.governor",
      );
      const tasks = requireRecord(
        governor["tasks"],
        "game.global.race.governor.tasks",
      );
      return Object.freeze(
        Object.values(tasks).map((task, index) => {
          if (typeof task !== "string") {
            throw new TypeError(
              `game.global.race.governor.tasks[${index}] must be a string`,
            );
          }
          return task;
        }),
      );
    },
  });
}
