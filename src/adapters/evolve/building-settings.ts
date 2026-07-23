import {
  createBuildingSettingsReadModel,
  type BuildingSettingsReadModel,
  type BuildingSettingsRow,
} from "../../domain/progression/build/building-settings.ts";
import {
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

interface BuildingSettingsEvolveDependencies {
  readonly getBuildingManager: () => unknown;
  readonly getBuildingIds: () => unknown;
  readonly getResources: () => unknown;
  readonly getLinkedBuildings: () => unknown;
  readonly getCheckCompare: () => unknown;
  readonly getOverrideKey: () => unknown;
  readonly getRealNumber: () => unknown;
  readonly getInitBuildingState: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface BuildingSettingsEvolveAdapter {
  readBuildingSettingsReadModel(): BuildingSettingsReadModel;
  filterBuildingSettings(query: string): readonly string[] | undefined;
  resetPriorities(): void;
  reorderBuildings(buildingIds: readonly string[]): void;
  setAllAutoBuild(enabled: boolean): void;
  setAllAutoPower(enabled: boolean): void;
  setLinkedSmartState(buildingIds: readonly string[], enabled: boolean): void;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readPriorityList(manager: UnknownRecord): readonly UnknownRecord[] {
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError("BuildingManager.priorityList must be an array");
  }
  return priorityList.map((building, index) =>
    requireRecord(building, `BuildingManager.priorityList[${index}]`),
  );
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readColor(tab: string): BuildingSettingsRow["color"] {
  if (tab === "space" || tab === "starDock") return "has-text-danger";
  if (tab === "galaxy" || tab === "eden") return "has-text-advanced";
  if (tab === "interstellar") return "has-text-special";
  if (tab === "portal" || tab === "tauceti") return "has-text-warning";
  return "has-text-info";
}

function readLinkedIds(
  building: UnknownRecord,
  linkedBuildings: readonly unknown[],
  path: string,
): readonly string[] | undefined {
  for (let setIndex = 0; setIndex < linkedBuildings.length; setIndex += 1) {
    const rawSet = linkedBuildings[setIndex];
    if (!Array.isArray(rawSet)) {
      throw new TypeError(`linkedBuildings[${setIndex}] must be an array`);
    }
    const set = rawSet.map((item, itemIndex) =>
      requireRecord(item, `linkedBuildings[${setIndex}][${itemIndex}]`),
    );
    if (set.some((item) => item === building)) {
      return set.map((item, itemIndex) =>
        requireString(
          item["_vueBinding"],
          `${path}.linkedBuildings[${setIndex}][${itemIndex}]._vueBinding`,
        ),
      );
    }
  }
  return undefined;
}

function readRows(
  manager: UnknownRecord,
  settingsRaw: UnknownRecord,
  linkedBuildings: readonly unknown[],
): readonly BuildingSettingsRow[] {
  const overrides = requireRecord(
    settingsRaw["overrides"],
    "settingsRaw.overrides",
  );
  return readPriorityList(manager).map((building, index) => {
    const path = `BuildingManager.priorityList[${index}]`;
    const id = requireString(building["_vueBinding"], `${path}._vueBinding`);
    const flags = requireRecord(building["is"], `${path}.is`);
    const stateSettingName = Reflect.apply(
      requireFunction(building["isSwitchable"], `${path}.isSwitchable`),
      building,
      [],
    )
      ? `bld_s_${id}`
      : undefined;
    const smartSettingName = flags["smart"] ? `bld_s2_${id}` : undefined;
    const linkedIds = smartSettingName
      ? readLinkedIds(building, linkedBuildings, path)
      : undefined;
    return {
      id,
      label: requireString(building["name"], `${path}.name`),
      color: readColor(readOptionalString(building["_tab"])),
      autoBuildSettingName: `bat${id}`,
      maximumSettingName: `bld_m_${id}`,
      weightingSettingName: `bld_w_${id}`,
      ...(stateSettingName ? { stateSettingName } : {}),
      ...(stateSettingName
        ? { stateEnabled: Boolean(settingsRaw[stateSettingName]) }
        : {}),
      ...(smartSettingName ? { smartSettingName } : {}),
      ...(smartSettingName
        ? { smartEnabled: Boolean(settingsRaw[smartSettingName]) }
        : {}),
      ...(linkedIds ? { smartLinkedIds: linkedIds } : {}),
      hasStateOverride: stateSettingName
        ? Boolean(overrides[stateSettingName])
        : false,
      hasSmartOverride: smartSettingName
        ? Boolean(overrides[smartSettingName])
        : false,
    };
  });
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean`);
  }
  return value;
}

/** Maps volatile Evolve building state and commands for the settings panel. */
export function createBuildingSettingsEvolveAdapter({
  getBuildingManager,
  getBuildingIds,
  getResources,
  getLinkedBuildings,
  getCheckCompare,
  getOverrideKey,
  getRealNumber,
  getInitBuildingState,
  getSettingsRaw,
}: BuildingSettingsEvolveDependencies): BuildingSettingsEvolveAdapter {
  function readBuildingSettingsReadModel(): BuildingSettingsReadModel {
    const manager = requireRecord(getBuildingManager(), "BuildingManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    return createBuildingSettingsReadModel({
      rows: readRows(
        manager,
        settingsRaw,
        (() => {
          const value = getLinkedBuildings();
          if (!Array.isArray(value)) {
            throw new TypeError("linkedBuildings must be an array");
          }
          return value;
        })(),
      ),
      allEnabled: Boolean(settingsRaw["buildingEnabledAll"]),
      allState: Boolean(settingsRaw["buildingStateAll"]),
      overrideKey: requireString(getOverrideKey(), "overrideKey"),
    });
  }

  function filterBuildingSettings(
    query: string,
  ): readonly string[] | undefined {
    const filter = query.toUpperCase();
    const reg = filter.match(/^(.+)(<=|>=|===|==|<|>|!==|!=)(.+)$/);
    if (!reg) return undefined;
    const leftOperand = reg[1] ?? "";
    const operator = reg[2] ?? "";
    const rightOperand = reg[3] ?? "";

    const buildingValue = (building: UnknownRecord): unknown => {
      switch (leftOperand.trim()) {
        case "BUILD":
        case "AUTOBUILD":
          return building["autoBuildEnabled"];
        case "POWER":
        case "AUTOPOWER":
          return building["autoStateEnabled"];
        case "WEIGHT":
        case "WEIGHTING":
          return building["_weighting"];
        case "MAX":
        case "MAXBUILD":
          return building["_autoMax"];
        case "POWERED":
          return building["powered"];
        case "KNOW":
        case "KNOWLEDGE":
          return requireRecord(building["is"], "building.is")["knowledge"];
        default: {
          const cost = requireRecord(building["cost"], "building.cost");
          const resources = requireRecord(getResources(), "resources");
          const match = Object.entries(cost).find(([resourceId]) => {
            const resource = requireRecord(
              resources[resourceId],
              `resources.${resourceId}`,
            );
            return requireString(
              resource["title"],
              `resources.${resourceId}.title`,
            )
              .toUpperCase()
              .includes(leftOperand.trim());
          });
          return match?.[1] ?? 0;
        }
      }
    };

    const testValue: unknown = (() => {
      switch (rightOperand.trim()) {
        case "ON":
        case "TRUE":
          return true;
        case "OFF":
        case "FALSE":
          return false;
        default:
          return Reflect.apply(
            requireFunction(getRealNumber(), "getRealNumber"),
            undefined,
            [rightOperand.trim()],
          );
      }
    })();
    const comparisons = requireRecord(getCheckCompare(), "checkCompare");
    const compare = requireFunction(
      comparisons[operator],
      `checkCompare.${operator}`,
    );
    const buildingIds = requireRecord(getBuildingIds(), "buildingIds");
    const matchingIds: string[] = [];
    for (const [id, rawBuilding] of Object.entries(buildingIds)) {
      const building = requireRecord(rawBuilding, `buildingIds.${id}`);
      if (
        Reflect.apply(compare, comparisons, [
          buildingValue(building),
          testValue,
        ])
      ) {
        matchingIds.push(id);
      }
    }
    return matchingIds;
  }

  function resetPriorities(): void {
    const manager = requireRecord(getBuildingManager(), "BuildingManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    Reflect.apply(
      requireFunction(getInitBuildingState(), "initBuildingState"),
      undefined,
      [],
    );
    const priorityList = readPriorityList(manager);
    for (let index = 0; index < priorityList.length; index += 1) {
      const id = requireString(
        priorityList[index]?.["_vueBinding"],
        `BuildingManager.priorityList[${index}]._vueBinding`,
      );
      settingsRaw[`bld_p_${id}`] = index;
    }
  }

  function reorderBuildings(buildingIds: readonly string[]): void {
    const manager = requireRecord(getBuildingManager(), "BuildingManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const sortByPriority = requireFunction(
      manager["sortByPriority"],
      "BuildingManager.sortByPriority",
    );
    buildingIds.forEach((buildingId, index) => {
      const id = requireString(buildingId, `buildingIds[${index}]`);
      settingsRaw[`bld_p_${id}`] = index;
    });
    Reflect.apply(sortByPriority, manager, []);
  }

  function setAllAutoBuild(enabled: boolean): void {
    const manager = requireRecord(getBuildingManager(), "BuildingManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    settingsRaw["buildingEnabledAll"] = requireBoolean(enabled, "enabled");
    for (const [index, building] of readPriorityList(manager).entries()) {
      const id = requireString(
        building["_vueBinding"],
        `BuildingManager.priorityList[${index}]._vueBinding`,
      );
      settingsRaw[`bat${id}`] = enabled;
    }
  }

  function setAllAutoPower(enabled: boolean): void {
    const manager = requireRecord(getBuildingManager(), "BuildingManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    settingsRaw["buildingStateAll"] = requireBoolean(enabled, "enabled");
    for (const [index, building] of readPriorityList(manager).entries()) {
      const id = requireString(
        building["_vueBinding"],
        `BuildingManager.priorityList[${index}]._vueBinding`,
      );
      settingsRaw[`bld_s_${id}`] = enabled;
    }
  }

  function setLinkedSmartState(
    buildingIds: readonly string[],
    enabled: boolean,
  ): void {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const value = requireBoolean(enabled, "enabled");
    buildingIds.forEach((buildingId, index) => {
      const id = requireString(buildingId, `buildingIds[${index}]`);
      settingsRaw[`bld_s2_${id}`] = value;
    });
  }

  return Object.freeze({
    readBuildingSettingsReadModel,
    filterBuildingSettings,
    resetPriorities,
    reorderBuildings,
    setAllAutoBuild,
    setAllAutoPower,
    setLinkedSmartState,
  });
}
