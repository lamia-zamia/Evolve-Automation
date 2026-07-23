import type {
  ApplyStorageAllocationDecision,
  StorageAllocationInput,
  StorageAllocationResourceInput,
  StorageCostInput,
  StorageTargetInput,
  StorageTargetSourceInput,
} from "../../domain/economy/storage/storage-allocation.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { StorageAllocationReader } from "../../ports/storage-allocation.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

interface StorageSession {
  readonly manager: UnknownRecord;
  readonly priority: readonly UnknownRecord[];
  readonly resources: ReadonlyMap<string, UnknownRecord>;
  readonly managedIds: ReadonlySet<string>;
  readonly crates: UnknownRecord;
  readonly containers: UnknownRecord;
  readonly crateValue: number;
  readonly containerValue: number;
}

export interface StorageAllocationAdapterDependencies {
  // TRANSITIONAL: StorageManager remains the narrow bridge to the current
  // stack-resource Vue controls until Milestone 5.
  readonly getStorageManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildingManager: () => unknown;
  readonly getProjectManager: () => unknown;
  readonly getFleetManagerOuter: () => unknown;
  readonly readDebugEnabled: () => boolean;
  readonly log: (message: string) => void;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function resourceId(resource: UnknownRecord, path: string): string {
  return readString(resource["id"], `${path}.id`);
}

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
): boolean {
  return Boolean(
    Reflect.apply(requireFunction(record[name], `${path}.${name}`), record, []),
  );
}

function finiteProperty(
  record: UnknownRecord,
  name: string,
  path: string,
): number {
  return requireNumber(record[name], `${path}.${name}`);
}

function optionalSellRatio(resource: UnknownRecord, path: string): number {
  const value = resource["autoSellRatio"];
  return value === undefined || value === null
    ? 0
    : requireNumber(value, `${path}.autoSellRatio`);
}

function emptyInput(initialized: boolean): StorageAllocationInput {
  return Object.freeze({
    initialized,
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
  });
}

function targetLabel(target: UnknownRecord): string {
  for (const name of ["_dbgLabel", "_originalName", "name", "actionId"]) {
    const value = target[name];
    if (value !== undefined && value !== null) return String(value);
  }
  return "?";
}

function readCosts(
  target: UnknownRecord,
  path: string,
  resources: UnknownRecord,
  register: (value: unknown, path: string, managed: boolean) => void,
): readonly StorageCostInput[] {
  const cost = requireRecord(target["cost"], `${path}.cost`);
  const result: StorageCostInput[] = [];
  for (const key in cost) {
    const quantity = requireNumber(cost[key], `${path}.cost.${key}`);
    register(resources[key], `resources.${key}`, false);
    result.push(Object.freeze({ resourceId: key, quantity }));
  }
  return Object.freeze(result);
}

export function createStorageAllocationAdapter(
  dependencies: StorageAllocationAdapterDependencies,
): {
  readonly reader: StorageAllocationReader;
  readonly executor: DecisionExecutor<ApplyStorageAllocationDecision>;
} {
  let session: StorageSession | null = null;

  const reader: StorageAllocationReader = Object.freeze({
    read(): StorageAllocationInput {
      const manager = requireRecord(
        dependencies.getStorageManager(),
        "StorageManager",
      );
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const state = requireRecord(dependencies.getState(), "state");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const buildingManager = requireRecord(
        dependencies.getBuildingManager(),
        "BuildingManager",
      );
      const projectManager = requireRecord(
        dependencies.getProjectManager(),
        "ProjectManager",
      );
      const fleet = requireRecord(
        dependencies.getFleetManagerOuter(),
        "FleetManagerOuter",
      );
      if (!callBoolean(manager, "initStorage", "StorageManager")) {
        session = null;
        return emptyInput(false);
      }
      const crateValue = finiteProperty(
        manager,
        "crateValue",
        "StorageManager",
      );
      const containerValue = finiteProperty(
        manager,
        "containerValue",
        "StorageManager",
      );
      if (crateValue <= 0 || containerValue <= 0) {
        session = null;
        return Object.freeze({
          ...emptyInput(true),
          crateValue,
          containerValue,
        });
      }
      const priorityValue = manager["priorityList"];
      if (!Array.isArray(priorityValue)) {
        throw new TypeError("StorageManager.priorityList must be an array");
      }
      const priority = priorityValue.map((value, index) =>
        requireRecord(value, `StorageManager.priorityList[${index}]`),
      );
      const records = new Map<string, UnknownRecord>();
      const inputs = new Map<string, StorageAllocationResourceInput>();
      const managedIds = new Set<string>();
      const register = (
        value: unknown,
        path: string,
        managed: boolean,
      ): void => {
        const resource = requireRecord(value, path);
        const id = resourceId(resource, path);
        const existing = records.get(id);
        if (existing !== undefined && existing !== resource) {
          throw new TypeError(`storage resource ${id} changed identity`);
        }
        if (existing === undefined) {
          const unlocked = managed
            ? callBoolean(resource, "isUnlocked", path)
            : true;
          const managedStorage =
            managed && unlocked
              ? callBoolean(resource, "isManagedStorage", path)
              : false;
          records.set(id, resource);
          inputs.set(
            id,
            managed
              ? Object.freeze({
                  id,
                  unlocked,
                  managed: managedStorage,
                  currentQuantity: finiteProperty(
                    resource,
                    "currentQuantity",
                    path,
                  ),
                  maxQuantity: finiteProperty(resource, "maxQuantity", path),
                  maxStorage: finiteProperty(resource, "maxStorage", path),
                  storageRequired: finiteProperty(
                    resource,
                    "storageRequired",
                    path,
                  ),
                  minStorage: finiteProperty(resource, "minStorage", path),
                  currentCrates: finiteProperty(
                    resource,
                    "currentCrates",
                    path,
                  ),
                  currentContainers: finiteProperty(
                    resource,
                    "currentContainers",
                    path,
                  ),
                  storeOverflow: Boolean(resource["storeOverflow"]),
                  autoSellEnabled: Boolean(resource["autoSellEnabled"]),
                  autoSellRatio: optionalSellRatio(resource, path),
                })
              : Object.freeze({
                  id,
                  unlocked: true,
                  managed: false,
                  currentQuantity: 0,
                  maxQuantity: finiteProperty(resource, "maxQuantity", path),
                  maxStorage: -1,
                  storageRequired: 0,
                  minStorage: 0,
                  currentCrates: 0,
                  currentContainers: 0,
                  storeOverflow: false,
                  autoSellEnabled: false,
                  autoSellRatio: 0,
                }),
          );
        }
        const input = inputs.get(id);
        if (managed && input?.unlocked && input.managed) managedIds.add(id);
      };
      for (let index = 0; index < priority.length; index++) {
        register(
          priority[index],
          `StorageManager.priorityList[${index}]`,
          true,
        );
      }
      const priorityResourceIds = priority.map((resource, index) =>
        resourceId(resource, `StorageManager.priorityList[${index}]`),
      );
      if (new Set(priorityResourceIds).size !== priorityResourceIds.length) {
        throw new TypeError("StorageManager.priorityList has duplicate ids");
      }
      if (managedIds.size === 0) {
        session = null;
        return Object.freeze({
          ...emptyInput(true),
          crateValue,
          containerValue,
          resources: Object.freeze([...inputs.values()]),
          priorityResourceIds: Object.freeze(priorityResourceIds),
        });
      }

      const makeSynthetic = (
        label: string,
        select: (resource: StorageAllocationResourceInput) => number | null,
      ): StorageTargetInput =>
        Object.freeze({
          costs: Object.freeze(
            priorityResourceIds.flatMap((id) => {
              const resource = inputs.get(id);
              if (resource === undefined || !managedIds.has(id)) return [];
              const quantity = select(resource);
              return quantity === null
                ? []
                : [Object.freeze({ resourceId: id, quantity })];
            }),
          ),
          isList: true,
          label,
          unlocked: true,
          autoBuildEnabled: true,
        });

      const readTarget = (
        value: unknown,
        path: string,
        filterBuildable = false,
      ): StorageTargetInput => {
        const target = requireRecord(value, path);
        const unlocked = filterBuildable
          ? callBoolean(target, "isUnlocked", path)
          : true;
        const autoBuildEnabled = filterBuildable
          ? unlocked && Boolean(target["autoBuildEnabled"])
          : true;
        return Object.freeze({
          costs:
            !filterBuildable || autoBuildEnabled
              ? readCosts(target, path, resources, register)
              : Object.freeze([]),
          isList: Boolean(target["isList"]),
          label: targetLabel(target),
          unlocked,
          autoBuildEnabled,
        });
      };
      const readArray = (
        value: unknown,
        path: string,
        filterBuildable = false,
      ): readonly StorageTargetInput[] => {
        if (!Array.isArray(value)) {
          throw new TypeError(`${path} must be an array`);
        }
        return Object.freeze(
          value.map((target, index) =>
            readTarget(target, `${path}[${index}]`, filterBuildable),
          ),
        );
      };

      const assignExtra = Boolean(settings["storageAssignExtra"]);
      const noTrade = assignExtra
        ? Boolean(
            requireRecord(
              requireRecord(game["global"], "game.global")["race"],
              "game.global.race",
            )["no_trade"],
          )
        : false;
      const sources: StorageTargetSourceInput[] = [
        Object.freeze({
          kind: "safe-current",
          enabled: Boolean(settings["storageSafeReassign"]),
          targets: Object.freeze([
            makeSynthetic(
              "safeReassign(currentQty)",
              (resource) => resource.currentQuantity,
            ),
          ]),
        }),
        Object.freeze({
          kind: "minimum",
          enabled: true,
          targets: Object.freeze([
            makeSynthetic("minStorage", (resource) => resource.minStorage),
          ]),
        }),
        Object.freeze({
          kind: "overflow",
          enabled: true,
          targets: Object.freeze([
            makeSynthetic("overflow(currentQty*1.03)", (resource) =>
              resource.storeOverflow ? resource.currentQuantity * 1.03 : null,
            ),
          ]),
        }),
        Object.freeze({
          kind: "queued",
          enabled: true,
          targets: readArray(
            state["queuedTargetsAll"],
            "state.queuedTargetsAll",
          ),
        }),
        Object.freeze({
          kind: "triggered",
          enabled: true,
          targets: readArray(state["triggerTargets"], "state.triggerTargets"),
        }),
      ];
      const fleetEnabled =
        Boolean(settings["autoFleet"]) &&
        Boolean(fleet["nextShipExpandable"]) &&
        settings["prioritizeOuterFleet"] !== "ignore";
      sources.push(
        Object.freeze({
          kind: "fleet",
          enabled: fleetEnabled,
          targets: fleetEnabled
            ? Object.freeze([
                readTarget(
                  {
                    cost: requireRecord(
                      fleet["nextShipCost"],
                      "FleetManagerOuter.nextShipCost",
                    ),
                  },
                  "FleetManagerOuter.nextShip",
                ),
              ])
            : Object.freeze([]),
        }),
        Object.freeze({
          kind: "technology",
          enabled: true,
          targets: readArray(state["unlockedTechs"], "state.unlockedTechs"),
        }),
        Object.freeze({
          kind: "project",
          enabled: true,
          targets: readArray(
            projectManager["priorityList"],
            "ProjectManager.priorityList",
            true,
          ),
        }),
        Object.freeze({
          kind: "building",
          enabled: true,
          targets: readArray(
            buildingManager["priorityList"],
            "BuildingManager.priorityList",
            true,
          ),
        }),
        Object.freeze({
          kind: "required",
          enabled: Boolean(settings["storageAssignPart"]),
          targets: Object.freeze([
            makeSynthetic(
              "storageRequired",
              (resource) => resource.storageRequired,
            ),
          ]),
        }),
      );

      const crates = requireRecord(resources["Crates"], "resources.Crates");
      const containers = requireRecord(
        resources["Containers"],
        "resources.Containers",
      );
      session = Object.freeze({
        manager,
        priority: Object.freeze(priority),
        resources: records,
        managedIds,
        crates,
        containers,
        crateValue,
        containerValue,
      });
      return Object.freeze({
        initialized: true,
        crateValue,
        containerValue,
        freeCrates: finiteProperty(
          crates,
          "currentQuantity",
          "resources.Crates",
        ),
        freeContainers: finiteProperty(
          containers,
          "currentQuantity",
          "resources.Containers",
        ),
        assignExtra,
        assignPart: Boolean(settings["storageAssignPart"]),
        safeReassign: Boolean(settings["storageSafeReassign"]),
        noTrade,
        autoMarket: Boolean(settings["autoMarket"]),
        debug: dependencies.readDebugEnabled(),
        resources: Object.freeze([...inputs.values()]),
        priorityResourceIds: Object.freeze(priorityResourceIds),
        targetSources: Object.freeze(sources),
      });
    },
  });

  function validateDecision(
    decision: Readonly<ApplyStorageAllocationDecision>,
  ): string | null {
    if (
      decision.kind !== "apply-storage-allocation" ||
      !Number.isFinite(decision.crateValue) ||
      !Number.isFinite(decision.containerValue) ||
      !Number.isFinite(decision.expectedFreeCrates) ||
      !Number.isFinite(decision.expectedFreeContainers)
    ) {
      return "storage allocation decision contains invalid values";
    }
    const ids = new Set<string>();
    for (const adjustment of decision.adjustments) {
      if (
        typeof adjustment.resourceId !== "string" ||
        adjustment.resourceId.length === 0 ||
        ids.has(adjustment.resourceId) ||
        !Number.isSafeInteger(adjustment.expectedCrates) ||
        !Number.isSafeInteger(adjustment.expectedContainers) ||
        !Number.isSafeInteger(adjustment.crateDelta) ||
        !Number.isSafeInteger(adjustment.containerDelta) ||
        !Number.isFinite(adjustment.expectedMaximum)
      ) {
        return "storage allocation adjustments must have unique ids and finite integer counts";
      }
      ids.add(adjustment.resourceId);
    }
    return null;
  }

  const executor: DecisionExecutor<ApplyStorageAllocationDecision> =
    Object.freeze({
      execute(decision: Readonly<ApplyStorageAllocationDecision>) {
        const invalid = validateDecision(decision);
        if (invalid !== null) {
          return rejected("invalid-storage-allocation", invalid);
        }
        const active = session;
        if (active === null) {
          return stale(
            "storage-allocation-session-missing",
            "Storage allocation session is missing",
          );
        }
        const priorityValue = active.manager["priorityList"];
        if (
          !Array.isArray(priorityValue) ||
          priorityValue.length !== active.priority.length ||
          priorityValue.some(
            (resource, index) => resource !== active.priority[index],
          ) ||
          decision.expectedPriorityResourceIds.length !== active.priority.length
        ) {
          return stale(
            "storage-priority-changed",
            "Storage priority list changed",
          );
        }
        for (let index = 0; index < active.priority.length; index++) {
          const resource = active.priority[index];
          const expectedId = decision.expectedPriorityResourceIds[index];
          if (
            resource === undefined ||
            expectedId === undefined ||
            resourceId(resource, `StorageManager.priorityList[${index}]`) !==
              expectedId
          ) {
            return stale(
              "storage-priority-changed",
              "Storage priority ids changed",
            );
          }
        }
        if (
          finiteProperty(active.manager, "crateValue", "StorageManager") !==
            decision.crateValue ||
          finiteProperty(active.manager, "containerValue", "StorageManager") !==
            decision.containerValue ||
          finiteProperty(
            active.crates,
            "currentQuantity",
            "resources.Crates",
          ) !== decision.expectedFreeCrates ||
          finiteProperty(
            active.containers,
            "currentQuantity",
            "resources.Containers",
          ) !== decision.expectedFreeContainers
        ) {
          return stale(
            "storage-capacity-changed",
            "Storage capacities or free counts changed",
          );
        }
        const resolved: {
          readonly adjustment: (typeof decision.adjustments)[number];
          readonly resource: UnknownRecord;
        }[] = [];
        for (const adjustment of decision.adjustments) {
          const resource = active.resources.get(adjustment.resourceId);
          if (
            resource === undefined ||
            !active.managedIds.has(adjustment.resourceId)
          ) {
            return stale(
              "storage-resource-changed",
              "Managed storage resource changed",
              { resourceId: adjustment.resourceId },
            );
          }
          if (
            finiteProperty(
              resource,
              "currentCrates",
              `resources.${adjustment.resourceId}`,
            ) !== adjustment.expectedCrates ||
            finiteProperty(
              resource,
              "currentContainers",
              `resources.${adjustment.resourceId}`,
            ) !== adjustment.expectedContainers ||
            finiteProperty(
              resource,
              "maxQuantity",
              `resources.${adjustment.resourceId}`,
            ) !== adjustment.expectedMaximum
          ) {
            return stale(
              "storage-resource-balance-changed",
              "Storage resource allocation changed",
              { resourceId: adjustment.resourceId },
            );
          }
          if (adjustment.crateDelta < 0) {
            requireFunction(
              active.manager["unassignCrate"],
              "StorageManager.unassignCrate",
            );
          } else if (adjustment.crateDelta > 0) {
            requireFunction(
              active.manager["assignCrate"],
              "StorageManager.assignCrate",
            );
          }
          if (adjustment.containerDelta < 0) {
            requireFunction(
              active.manager["unassignContainer"],
              "StorageManager.unassignContainer",
            );
          } else if (adjustment.containerDelta > 0) {
            requireFunction(
              active.manager["assignContainer"],
              "StorageManager.assignContainer",
            );
          }
          resolved.push({ adjustment, resource });
        }

        for (const message of decision.logs) dependencies.log(message);
        for (const { adjustment, resource } of resolved) {
          if (adjustment.crateDelta < 0) {
            Reflect.apply(
              requireFunction(
                active.manager["unassignCrate"],
                "StorageManager.unassignCrate",
              ),
              active.manager,
              [resource, adjustment.crateDelta * -1],
            );
            resource["maxQuantity"] =
              finiteProperty(
                resource,
                "maxQuantity",
                `resources.${adjustment.resourceId}`,
              ) +
              adjustment.crateDelta * decision.crateValue;
            active.crates["currentQuantity"] =
              finiteProperty(
                active.crates,
                "currentQuantity",
                "resources.Crates",
              ) - adjustment.crateDelta;
          }
          if (adjustment.containerDelta < 0) {
            Reflect.apply(
              requireFunction(
                active.manager["unassignContainer"],
                "StorageManager.unassignContainer",
              ),
              active.manager,
              [resource, adjustment.containerDelta * -1],
            );
            resource["maxQuantity"] =
              finiteProperty(
                resource,
                "maxQuantity",
                `resources.${adjustment.resourceId}`,
              ) +
              adjustment.containerDelta * decision.containerValue;
            active.containers["currentQuantity"] =
              finiteProperty(
                active.containers,
                "currentQuantity",
                "resources.Containers",
              ) - adjustment.containerDelta;
          }
        }
        for (const { adjustment, resource } of resolved) {
          if (adjustment.crateDelta > 0) {
            Reflect.apply(
              requireFunction(
                active.manager["assignCrate"],
                "StorageManager.assignCrate",
              ),
              active.manager,
              [resource, adjustment.crateDelta],
            );
            resource["maxQuantity"] =
              finiteProperty(
                resource,
                "maxQuantity",
                `resources.${adjustment.resourceId}`,
              ) +
              adjustment.crateDelta * decision.crateValue;
            // Legacy cache reconciliation increments here even though Evolve's
            // canonical assign operation decrements the available amount.
            active.crates["currentQuantity"] =
              finiteProperty(
                active.crates,
                "currentQuantity",
                "resources.Crates",
              ) + adjustment.crateDelta;
          }
          if (adjustment.containerDelta > 0) {
            Reflect.apply(
              requireFunction(
                active.manager["assignContainer"],
                "StorageManager.assignContainer",
              ),
              active.manager,
              [resource, adjustment.containerDelta],
            );
            resource["maxQuantity"] =
              finiteProperty(
                resource,
                "maxQuantity",
                `resources.${adjustment.resourceId}`,
              ) +
              adjustment.containerDelta * decision.containerValue;
            active.containers["currentQuantity"] =
              finiteProperty(
                active.containers,
                "currentQuantity",
                "resources.Containers",
              ) + adjustment.containerDelta;
          }
        }
        return SUCCEEDED;
      },
    });

  return Object.freeze({ reader, executor });
}
