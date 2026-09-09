/** Bounded DeadSpace storage allocation and expansion through captured controls. */

import type {
  ApplyStorageAllocationDecision,
  StorageAllocationInput,
  StorageAllocationResourceInput,
  StorageTargetInput,
} from "../../../../domain/economy/storage/storage-allocation.ts";
import {
  planStorageExpansion,
  type CraftableStorageView,
  type StorageExpansionSnapshot,
  type StorageResourceCost,
} from "../../../../domain/economy/storage/storage-expansion.ts";
import { crateCost } from "../../../../domain/economy/storage/crate-cost.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { CostReservationSource } from "../../../../ports/game-cost-reservations.ts";
import type { ConstructionObservations } from "../../../../ports/game-construction-observations.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GameBuildTarget } from "../../../../ports/game-build-targets.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type {
  StorageAllocationReader,
  StorageExpansionRequester,
} from "../../../../ports/storage-allocation.ts";
import { createSnapshotMetadata } from "../../../../domain/snapshot.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const STORAGE_CONSTRUCTION_CONTROL = "createHead";

interface CapturedStorageDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readStorageRequired: (resourceId: string) => number;
  readonly reservations: CostReservationSource;
  readonly construction?: ConstructionObservations;
  /** Managed construction targets, sampled from the same captured build policy as autoBuild. */
  readonly readBuildTargets?: () => readonly Readonly<GameBuildTarget>[];
  /** The game's current cost for a captured build target. */
  readonly costs?: GameActionCostReader;
  readonly onSkipped?: (key: string, reason: string) => void;
  readonly nowMs: () => number;
}

interface StorageSession {
  readonly root: unknown;
  readonly crateValue: number;
  readonly containerValue: number;
  readonly freeCrates: number;
  readonly freeContainers: number;
  readonly priorityResourceIds: readonly string[];
  readonly resources: ReadonlyMap<string, StorageAllocationResourceInput>;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStorageCount(value: unknown, fallback = 0): number | undefined {
  if (value === undefined) return fallback;
  const parsed = finite(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : undefined;
}

function settingsRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

function descriptorCapacity(
  controls: GameControlRegistry,
  method: string,
): number | undefined {
  const handle = controls.resolve(STORAGE_CONSTRUCTION_CONTROL);
  if (handle === undefined || !handle.methods.includes(method))
    return undefined;
  const result = controls.invoke(handle, method);
  if (!result.ok || typeof result.value !== "string") return undefined;
  // DeadSpace's localized sentence puts the build cost first and capacity second.
  const value = result.value.match(/\d[\d,]*(?:\.\d+)?/g)?.[1];
  if (value === undefined) return undefined;
  const capacity = Number(value.replaceAll(",", ""));
  return Number.isFinite(capacity) && capacity > 0 ? capacity : undefined;
}

function storageView(
  resources: Record<PropertyKey, unknown>,
  resourceId: string,
  storagePerUnit: number,
  cost: Readonly<Record<string, number>>,
): CraftableStorageView | undefined {
  const resource = readProperty(resources, resourceId);
  if (!isRecord(resource)) return undefined;
  const maxQuantity = finite(resource["max"]);
  const currentQuantity = finite(resource["amount"]);
  if (maxQuantity === undefined || currentQuantity === undefined) {
    return undefined;
  }
  const costs: StorageResourceCost[] = [];
  for (const [costResourceId, costPerUnit] of Object.entries(cost)) {
    const available = finite(
      readProperty(readProperty(resources, costResourceId), "amount"),
    );
    if (available === undefined || !Number.isFinite(costPerUnit))
      return undefined;
    costs.push(
      Object.freeze({ resourceId: costResourceId, costPerUnit, available }),
    );
  }
  return Object.freeze({
    resourceId,
    maxQuantity,
    currentQuantity,
    storagePerUnit,
    costs: Object.freeze(costs),
  });
}

function earlyGame(root: unknown): boolean {
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (
    Boolean(readProperty(race, "cataclysm")) ||
    Boolean(readProperty(race, "orbit_decayed")) ||
    Boolean(readProperty(race, "lone_survivor")) ||
    Boolean(readProperty(race, "warlord"))
  ) {
    return false;
  }
  const highTech = finite(readProperty(tech, "high_tech")) ?? 0;
  if (
    Boolean(readProperty(race, "truepath")) ||
    Boolean(readProperty(race, "sludge")) ||
    Boolean(readProperty(race, "ultra_sludge"))
  ) {
    return highTech < 7;
  }
  return (finite(readProperty(tech, "mad")) ?? 0) < 1;
}

function targetFromCost(
  label: string,
  cost: Readonly<Record<string, number | undefined>>,
): StorageTargetInput {
  return Object.freeze({
    costs: Object.freeze(
      Object.entries(cost).flatMap(([resourceId, quantity]) =>
        quantity === undefined || !Number.isFinite(quantity)
          ? []
          : [Object.freeze({ resourceId, quantity })],
      ),
    ),
    isList: false,
    label,
    unlocked: true,
    autoBuildEnabled: true,
  });
}

function readBuildingTargets(
  dependencies: CapturedStorageDependencies,
): readonly StorageTargetInput[] | undefined {
  if (
    dependencies.readBuildTargets === undefined ||
    dependencies.costs === undefined
  )
    return undefined;
  const result: StorageTargetInput[] = [];
  for (const target of dependencies.readBuildTargets()) {
    if (
      typeof target.key !== "string" ||
      typeof target.elementId !== "string" ||
      target.key.length === 0 ||
      target.elementId.length === 0
    ) {
      dependencies.onSkipped?.(
        "storage-building",
        "captured build target identity is invalid",
      );
      return undefined;
    }
    const cost = dependencies.costs.readCost(target.elementId);
    if (cost === undefined) {
      dependencies.onSkipped?.(
        target.key,
        "captured build target cost is unavailable",
      );
      return undefined;
    }
    if (
      !isRecord(cost) ||
      Object.values(cost).some(
        (quantity) =>
          typeof quantity !== "number" || !Number.isFinite(quantity),
      )
    ) {
      dependencies.onSkipped?.(
        target.key,
        "captured build target cost is invalid",
      );
      return undefined;
    }
    result.push(targetFromCost(target.key, cost));
  }
  return Object.freeze(result);
}

function readResource(
  resources: Record<PropertyKey, unknown>,
  settings: Record<PropertyKey, unknown>,
  id: string,
  readStorageRequired: (resourceId: string) => number,
): StorageAllocationResourceInput | undefined {
  const resource = readProperty(resources, id);
  if (!isRecord(resource)) return undefined;
  const currentQuantity = finite(resource["amount"]);
  const rawMax = finite(resource["max"]);
  const currentCrates = readStorageCount(resource["crates"]);
  const currentContainers = readStorageCount(resource["containers"]);
  const storageRequired = readStorageRequired(id);
  if (
    currentQuantity === undefined ||
    rawMax === undefined ||
    currentCrates === undefined ||
    currentContainers === undefined ||
    !Number.isFinite(storageRequired)
  ) {
    return undefined;
  }
  const maxStorage = finite(settings[`res_max_store${id}`]) ?? -1;
  const minStorage = finite(settings[`res_min_store${id}`]) ?? 1;
  const autoSellRatio = finite(settings[`res_sell_r_${id}`]);
  return Object.freeze({
    id,
    unlocked: resource["display"] === true,
    managed:
      resource["stackable"] === true && settings[`res_storage${id}`] === true,
    currentQuantity,
    maxQuantity: rawMax >= 0 ? rawMax : Number.MAX_SAFE_INTEGER,
    maxStorage,
    storageRequired,
    minStorage,
    currentCrates,
    currentContainers,
    storeOverflow: settings[`res_storage_o_${id}`] === true,
    autoSellEnabled: settings[`sell${id}`] === true,
    autoSellRatio:
      autoSellRatio !== undefined && autoSellRatio > 0 ? autoSellRatio : 0,
  });
}

function readInput(dependencies: CapturedStorageDependencies): {
  readonly input: StorageAllocationInput;
  readonly session: StorageSession | null;
} {
  const root = dependencies.rootState.readRoot();
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");
  if (!isRecord(resources) || !isRecord(race)) {
    return {
      input: Object.freeze({
        initialized: false,
        crateValue: 0,
        containerValue: 0,
        freeCrates: 0,
        freeContainers: 0,
        assignExtra: false,
        assignPart: false,
        safeReassign: false,
        noTrade: false,
        autoMarket: false,
        debug: false,
        resources: Object.freeze([]),
        priorityResourceIds: Object.freeze([]),
        targetSources: Object.freeze([]),
      }),
      session: null,
    };
  }
  const crateValue = descriptorCapacity(
    dependencies.controls,
    "buildCrateDesc",
  );
  const containerValue = descriptorCapacity(
    dependencies.controls,
    "buildContainerDesc",
  );
  const crates = readProperty(resources, "Crates");
  const containers = readProperty(resources, "Containers");
  const freeCrates = finite(readProperty(crates, "amount"));
  const freeContainers = finite(readProperty(containers, "amount"));
  if (
    crateValue === undefined ||
    containerValue === undefined ||
    freeCrates === undefined ||
    freeContainers === undefined
  ) {
    return {
      input: Object.freeze({
        initialized: false,
        crateValue: 0,
        containerValue: 0,
        freeCrates: 0,
        freeContainers: 0,
        assignExtra: false,
        assignPart: false,
        safeReassign: false,
        noTrade: false,
        autoMarket: false,
        debug: false,
        resources: Object.freeze([]),
        priorityResourceIds: Object.freeze([]),
        targetSources: Object.freeze([]),
      }),
      session: null,
    };
  }
  const settings = settingsRecord(dependencies.readSettings());
  const ids = Object.keys(resources);
  const priorityResourceIds = ids
    .map((id, index) => ({
      id,
      index,
      priority:
        finite(settings[`res_storage_p_${id}`]) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.priority - right.priority || left.index - right.index,
    )
    .map(({ id }) => id);
  const resourceInputs = priorityResourceIds.map((id) =>
    readResource(resources, settings, id, dependencies.readStorageRequired),
  );
  if (resourceInputs.some((resource) => resource === undefined)) {
    return {
      input: Object.freeze({
        initialized: false,
        crateValue,
        containerValue,
        freeCrates,
        freeContainers,
        assignExtra: false,
        assignPart: false,
        safeReassign: false,
        noTrade: false,
        autoMarket: false,
        debug: false,
        resources: Object.freeze([]),
        priorityResourceIds: Object.freeze([]),
        targetSources: Object.freeze([]),
      }),
      session: null,
    };
  }
  const resourcesInput = Object.freeze(
    resourceInputs as readonly StorageAllocationResourceInput[],
  );
  const targets: StorageTargetInput[] = [];
  const reservations = dependencies.reservations.readReservations();
  if (!reservations.unavailable) {
    for (const target of reservations.targets) {
      targets.push(targetFromCost(target.name, target.cost));
    }
  }
  const saving = dependencies.construction?.readSavingTarget() ?? null;
  if (saving !== null) targets.push(targetFromCost(saving.name, saving.cost));
  const requiredTargets = resourcesInput
    .filter((resource) => resource.unlocked && resource.managed)
    .map((resource) =>
      targetFromCost(`storageRequired/${resource.id}`, {
        [resource.id]: resource.storageRequired,
      }),
    );
  const buildingTargets = readBuildingTargets(dependencies);
  const input = Object.freeze({
    initialized: true,
    crateValue,
    containerValue,
    freeCrates,
    freeContainers,
    assignExtra: settings["storageAssignExtra"] === true,
    assignPart: settings["storageAssignPart"] === true,
    safeReassign: settings["storageSafeReassign"] === true,
    noTrade: Boolean(race["no_trade"]),
    autoMarket: settings["autoMarket"] === true,
    debug: false,
    resources: resourcesInput,
    priorityResourceIds: Object.freeze(priorityResourceIds),
    targetSources: Object.freeze([
      Object.freeze({
        kind: "queued" as const,
        enabled: true,
        targets: Object.freeze(targets),
      }),
      Object.freeze({
        kind: "building" as const,
        enabled: buildingTargets !== undefined,
        targets: buildingTargets ?? Object.freeze([]),
      }),
      Object.freeze({
        kind: "required" as const,
        enabled: true,
        targets: Object.freeze(requiredTargets),
      }),
    ]),
  });
  return {
    input,
    session: Object.freeze({
      root,
      crateValue,
      containerValue,
      freeCrates,
      freeContainers,
      priorityResourceIds: Object.freeze(priorityResourceIds),
      resources: new Map(
        resourcesInput.map((resource) => [resource.id, resource]),
      ),
    }),
  };
}

function readExpansionSnapshot(
  dependencies: CapturedStorageDependencies,
  storageToBuild: number,
): StorageExpansionSnapshot | undefined {
  const root = dependencies.rootState.readRoot();
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");
  if (!isRecord(resources) || !isRecord(race)) return undefined;
  const crateValue = descriptorCapacity(
    dependencies.controls,
    "buildCrateDesc",
  );
  const containerValue = descriptorCapacity(
    dependencies.controls,
    "buildContainerDesc",
  );
  if (crateValue === undefined || containerValue === undefined)
    return undefined;
  const crates = storageView(
    resources,
    "Crates",
    crateValue,
    crateCost({
      smoldering: Boolean(race["smoldering"]),
      kindlingKindred: Boolean(race["kindling_kindred"]),
      iceAge: Boolean(race["iceage"]),
      ironWood: Boolean(race["iron_wood"]),
    }),
  );
  const containers = storageView(resources, "Containers", containerValue, {
    Steel: 125,
  });
  const steel = readProperty(resources, "Steel");
  const plywood = readProperty(resources, "Plywood");
  if (!crates || !containers || !isRecord(steel) || !isRecord(plywood)) {
    return undefined;
  }
  const steelAmount = finite(steel["amount"]);
  const steelMax = finite(steel["max"]);
  const plywoodAmount = finite(plywood["amount"]);
  const steelStorageRequired = dependencies.readStorageRequired("Steel");
  if (
    steelAmount === undefined ||
    steelMax === undefined ||
    plywoodAmount === undefined ||
    !Number.isFinite(steelStorageRequired)
  ) {
    return undefined;
  }
  const capturedAtMs = dependencies.nowMs();
  const libraryCount =
    finite(
      readProperty(
        readProperty(readProperty(root, "city"), "library"),
        "count",
      ),
    ) ?? 0;
  return Object.freeze({
    metadata: createSnapshotMetadata({
      id: `captured-storage-expansion-${capturedAtMs}`,
      capturedAtMs,
    }),
    storageToBuild,
    crates,
    containers,
    isEarlyGame: earlyGame(root),
    isLumberRace: !race["kindling_kindred"] && !race["smoldering"],
    steel: Object.freeze({
      storageRatio: steelMax > 0 ? steelAmount / steelMax : 0,
      maxQuantity: steelMax,
      storageRequired: steelStorageRequired,
    }),
    library: Object.freeze({ count: libraryCount, plywoodCost: null }),
    plywoodAvailable: plywoodAmount,
  });
}

function executeExpansion(
  dependencies: CapturedStorageDependencies,
  storageToBuild: number,
): boolean {
  const sampledRoot = dependencies.rootState.readRoot();
  const snapshot = readExpansionSnapshot(dependencies, storageToBuild);
  if (snapshot === undefined) return false;
  const settings = settingsRecord(dependencies.readSettings());
  const commands = planStorageExpansion(snapshot, {
    storageLimitPreMad:
      typeof settings["storageLimitPreMad"] === "boolean"
        ? settings["storageLimitPreMad"]
        : true,
  });
  let built = 0;
  for (const command of commands) {
    if (command.count <= 0) continue;
    const handle = dependencies.controls.resolve(STORAGE_CONSTRUCTION_CONTROL);
    const method = command.unit === "crate" ? "crate" : "container";
    if (handle === undefined || !handle.methods.includes(method)) return false;
    for (let index = 0; index < command.count; index += 1) {
      if (dependencies.rootState.readRoot() !== sampledRoot) return false;
      const before = finite(
        readProperty(
          readProperty(dependencies.rootState.readRoot(), "resource"),
          command.producedResourceId,
        ) &&
          readProperty(
            readProperty(
              readProperty(dependencies.rootState.readRoot(), "resource"),
              command.producedResourceId,
            ),
            "amount",
          ),
      );
      const result = dependencies.controls.invoke(handle, method);
      if (!result.ok) return false;
      const after = finite(
        readProperty(
          readProperty(
            readProperty(dependencies.rootState.readRoot(), "resource"),
            command.producedResourceId,
          ),
          "amount",
        ),
      );
      if (before === undefined || after === undefined || after <= before)
        return false;
      built += after - before;
    }
  }
  return built > 0;
}

function storageExecutor(
  dependencies: CapturedStorageDependencies,
  readSession: () => StorageSession | null,
): DecisionExecutor<ApplyStorageAllocationDecision> {
  return Object.freeze({
    execute(
      decision: Readonly<ApplyStorageAllocationDecision>,
    ): CommandExecutionOutcome {
      const session = readSession();
      if (session === null)
        return stale(
          "captured-storage-session-missing",
          "storage sample is unavailable",
        );
      if (dependencies.rootState.readRoot() !== session.root)
        return stale(
          "captured-storage-root-changed",
          "captured game root changed",
        );
      if (
        decision.crateValue !== session.crateValue ||
        decision.containerValue !== session.containerValue ||
        decision.expectedFreeCrates !== session.freeCrates ||
        decision.expectedFreeContainers !== session.freeContainers ||
        decision.expectedPriorityResourceIds.some(
          (id, index) => id !== session.priorityResourceIds[index],
        )
      ) {
        return stale(
          "captured-storage-capacity-changed",
          "storage sample changed",
        );
      }
      const adjustments = decision.adjustments;
      for (const adjustment of adjustments) {
        const resource = session.resources.get(adjustment.resourceId);
        const rootResource = readProperty(
          readProperty(dependencies.rootState.readRoot(), "resource"),
          adjustment.resourceId,
        );
        if (
          resource === undefined ||
          finite(readProperty(rootResource, "crates")) !==
            adjustment.expectedCrates ||
          finite(readProperty(rootResource, "containers")) !==
            adjustment.expectedContainers ||
          finite(readProperty(rootResource, "max")) !==
            adjustment.expectedMaximum
        ) {
          return stale(
            "captured-storage-resource-changed",
            `${adjustment.resourceId}: storage allocation changed`,
          );
        }
      }
      const ordered = [
        ...adjustments.filter(
          (adjustment) =>
            adjustment.crateDelta < 0 || adjustment.containerDelta < 0,
        ),
        ...adjustments.filter(
          (adjustment) =>
            adjustment.crateDelta > 0 || adjustment.containerDelta > 0,
        ),
      ];
      for (const adjustment of ordered) {
        const handle = dependencies.controls.resolve(
          `stack-${adjustment.resourceId}`,
        );
        if (handle === undefined)
          return rejected(
            "captured-storage-control-missing",
            `${adjustment.resourceId}: stack control is unavailable`,
          );
        for (const [delta, method] of [
          [
            adjustment.crateDelta,
            adjustment.crateDelta < 0 ? "subCrate" : "addCrate",
          ],
          [
            adjustment.containerDelta,
            adjustment.containerDelta < 0 ? "subCon" : "addCon",
          ],
        ] as const) {
          if (delta === 0) continue;
          if (!handle.methods.includes(method))
            return rejected(
              "captured-storage-control-missing",
              `${adjustment.resourceId}: ${method} control is unavailable`,
            );
          for (let index = 0; index < Math.abs(delta); index += 1) {
            const result = dependencies.controls.invoke(handle, method, [
              adjustment.resourceId,
            ]);
            if (!result.ok)
              return rejected(
                "captured-storage-control-failed",
                result.detail ?? result.reason,
              );
          }
        }
      }
      const finalRoot = dependencies.rootState.readRoot();
      if (finalRoot !== session.root)
        return stale(
          "captured-storage-root-changed",
          "captured game root changed",
        );
      const finalResources = readProperty(finalRoot, "resource");
      const finalCrates = finite(
        readProperty(readProperty(finalResources, "Crates"), "amount"),
      );
      const finalContainers = finite(
        readProperty(readProperty(finalResources, "Containers"), "amount"),
      );
      const crateDelta = adjustments.reduce(
        (total, adjustment) => total + adjustment.crateDelta,
        0,
      );
      const containerDelta = adjustments.reduce(
        (total, adjustment) => total + adjustment.containerDelta,
        0,
      );
      if (
        finalCrates !== session.freeCrates - crateDelta ||
        finalContainers !== session.freeContainers - containerDelta
      )
        return rejected(
          "captured-storage-assignment-unchanged",
          "storage pool counts did not match the requested allocation",
        );
      for (const adjustment of adjustments) {
        const resource = readProperty(finalResources, adjustment.resourceId);
        const finalCrateCount = finite(readProperty(resource, "crates"));
        const finalContainerCount = finite(
          readProperty(resource, "containers"),
        );
        const finalMaximum = finite(readProperty(resource, "max"));
        const expectedMaximum =
          adjustment.expectedMaximum +
          adjustment.crateDelta * session.crateValue +
          adjustment.containerDelta * session.containerValue;
        if (
          finalCrateCount !==
            adjustment.expectedCrates + adjustment.crateDelta ||
          finalContainerCount !==
            adjustment.expectedContainers + adjustment.containerDelta ||
          finalMaximum !== expectedMaximum
        )
          return rejected(
            "captured-storage-assignment-unchanged",
            `${adjustment.resourceId}: allocation did not match the requested change`,
          );
      }
      return SUCCEEDED;
    },
  });
}

export function createCapturedStoragePorts(
  dependencies: CapturedStorageDependencies,
): {
  readonly reader: StorageAllocationReader;
  readonly executor: DecisionExecutor<ApplyStorageAllocationDecision>;
  readonly expansion: StorageExpansionRequester;
} {
  let session: StorageSession | null = null;
  const reader: StorageAllocationReader = Object.freeze({
    read(): StorageAllocationInput {
      const sample = readInput(dependencies);
      session = sample.session;
      return sample.input;
    },
  });
  const expansion: StorageExpansionRequester = Object.freeze({
    expand(storageToBuild: number): boolean {
      if (!Number.isFinite(storageToBuild) || storageToBuild <= 0) return false;
      return executeExpansion(dependencies, storageToBuild);
    },
  });
  return Object.freeze({
    reader,
    executor: storageExecutor(dependencies, () => session),
    expansion,
  });
}
