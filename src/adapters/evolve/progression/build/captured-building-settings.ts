/** Captured read/write adapter for the Building settings surface. */

import {
  createBuildingSettingsReadModel,
  type BuildingSettingsReadModel,
} from "../../../../domain/progression/build/building-settings.ts";
import type { GameActionCostReader } from "../../../../ports/game-action-costs.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import {
  readCapturedBuildingEntries,
  type CapturedBuildingEntry,
} from "./captured-building-catalog.ts";

import {
  sortByStoredPriority,
  writeDefaultPriorityOrder,
  writeExplicitPriorityOrder,
} from "../../../../domain/settings-priority-order.ts";
import { readCapturedResourceLabel } from "../../captured-resource-metadata.ts";

export interface CapturedBuildingSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
  readonly getOverrideKey: () => string;
  readonly getRealNumber: (text: string) => number;
  /** Pure condition-language comparison supplied by composition from the canonical policy. */
  readonly getComparison: (
    operator: string,
  ) => ((left: unknown, right: unknown) => boolean) | undefined;
  readonly ensureControls?: () => void;
  readonly costs?: GameActionCostReader;
}

export interface CapturedBuildingSettingsAdapter {
  readBuildingSettingsReadModel(): BuildingSettingsReadModel;
  filterBuildingSettings(query: string): readonly string[] | undefined;
  resetPriorities(): void;
  reorderBuildings(buildingIds: readonly string[]): void;
  setAllAutoBuild(enabled: boolean): void;
  setAllAutoPower(enabled: boolean): void;
  setLinkedSmartState(buildingIds: readonly string[], enabled: boolean): void;
}

function readCapturedBuildingSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function readCapturedBuildingOverrides(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const overrides = raw["overrides"];
  return isRecord(overrides) && !Array.isArray(overrides) ? overrides : {};
}

function hasCapturedBuildingOverride(
  overrides: Record<string, unknown>,
  key: string,
): boolean {
  const value = overrides[key];
  return Array.isArray(value) && value.length > 0;
}

function readCapturedBuildingColor(region: string) {
  if (region === "space") return "has-text-danger" as const;
  if (region === "galaxy" || region === "eden")
    return "has-text-advanced" as const;
  if (region === "interstellar") return "has-text-special" as const;
  if (region === "portal" || region === "tauceti")
    return "has-text-warning" as const;
  return "has-text-info" as const;
}

function readCapturedBuildingFilterNumber(
  getRealNumber: (text: string) => number,
  value: string,
): number {
  try {
    return getRealNumber(value);
  } catch {
    return Number.NaN;
  }
}

export function createCapturedBuildingSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
  getOverrideKey,
  getRealNumber,
  getComparison,
  ensureControls,
  costs,
}: CapturedBuildingSettingsDependencies): CapturedBuildingSettingsAdapter {
  const readBuildingEntriesForSettings =
    (): readonly Readonly<CapturedBuildingEntry>[] => {
      ensureControls?.();
      return readCapturedBuildingEntries(rootState.readRoot(), controls);
    };

  const readModel = (): BuildingSettingsReadModel => {
    const raw = readCapturedBuildingSettingsRecord(getSettingsRaw());
    const overrides = readCapturedBuildingOverrides(raw);
    const entries = sortByStoredPriority(
      readBuildingEntriesForSettings(),
      raw,
      (entry) => `bld_p_${entry.binding}`,
    );
    return createBuildingSettingsReadModel({
      rows: entries.map((entry) => {
        const stateSettingName = entry.switchable
          ? `bld_s_${entry.binding}`
          : undefined;
        const smartSettingName = entry.smart
          ? `bld_s2_${entry.binding}`
          : undefined;
        return {
          id: entry.binding,
          label: entry.label,
          color: readCapturedBuildingColor(entry.region),
          autoBuildSettingName: `bat${entry.binding}`,
          maximumSettingName: `bld_m_${entry.binding}`,
          weightingSettingName: `bld_w_${entry.binding}`,
          ...(stateSettingName === undefined
            ? {}
            : {
                stateSettingName,
                stateEnabled: Boolean(raw[stateSettingName]),
              }),
          ...(smartSettingName === undefined
            ? {}
            : {
                smartSettingName,
                smartEnabled: Boolean(raw[smartSettingName]),
                ...(entry.smartLinkedIds === undefined
                  ? {}
                  : { smartLinkedIds: entry.smartLinkedIds }),
              }),
          hasStateOverride:
            stateSettingName === undefined
              ? false
              : hasCapturedBuildingOverride(overrides, stateSettingName),
          hasSmartOverride:
            smartSettingName === undefined
              ? false
              : hasCapturedBuildingOverride(overrides, smartSettingName),
        };
      }),
      allEnabled: Boolean(raw["buildingEnabledAll"]),
      allState: Boolean(raw["buildingStateAll"]),
      overrideKey: getOverrideKey(),
    });
  };

  const filterBuildingSettings = (
    query: string,
  ): readonly string[] | undefined => {
    const match = query
      .toUpperCase()
      .match(/^(.+)(<=|>=|===|==|<|>|!==|!=)(.+)$/);
    if (match === null) return undefined;
    const left = match[1]?.trim() ?? "";
    const operator = match[2] ?? "";
    const rightText = match[3]?.trim() ?? "";
    const compare = getComparison(operator);
    if (compare === undefined) return undefined;
    const right =
      rightText === "ON" || rightText === "TRUE"
        ? true
        : rightText === "OFF" || rightText === "FALSE"
          ? false
          : readCapturedBuildingFilterNumber(getRealNumber, rightText);
    const root = rootState.readRoot();
    const raw = readCapturedBuildingSettingsRecord(getSettingsRaw());
    const entries = readBuildingEntriesForSettings();
    const valueFor = (entry: Readonly<CapturedBuildingEntry>): unknown => {
      switch (left) {
        case "BUILD":
        case "AUTOBUILD":
          return raw[`bat${entry.binding}`];
        case "POWER":
        case "AUTOPOWER":
          return raw[`bld_s_${entry.binding}`];
        case "WEIGHT":
        case "WEIGHTING":
          return raw[`bld_w_${entry.binding}`];
        case "MAX":
        case "MAXBUILD":
          return raw[`bld_m_${entry.binding}`];
        case "POWERED":
          return readProperty(entry.state, "powered");
        case "KNOW":
        case "KNOWLEDGE":
          return entry.knowledge;
        default: {
          const price = costs?.readCost(entry.elementId);
          if (price === undefined) return 0;
          const cost = Object.entries(price.cost).find(([resourceId]) =>
            readCapturedResourceLabel(root, resourceId)
              .toUpperCase()
              .includes(left),
          );
          return cost?.[1] ?? 0;
        }
      }
    };
    return Object.freeze(
      entries
        .filter((entry) => compare(valueFor(entry), right))
        .map((entry) => entry.binding),
    );
  };

  const writeForEntries = (
    write: (
      raw: Record<string, unknown>,
      entries: readonly Readonly<CapturedBuildingEntry>[],
    ) => void,
  ): void => {
    const raw = readCapturedBuildingSettingsRecord(getSettingsRaw());
    write(raw, readBuildingEntriesForSettings());
  };

  return Object.freeze({
    readBuildingSettingsReadModel: readModel,
    filterBuildingSettings,
    resetPriorities() {
      writeForEntries((raw, entries) => {
        writeDefaultPriorityOrder(
          raw,
          entries.map((entry) => entry.binding),
          (binding) => `bld_p_${binding}`,
        );
      });
    },
    reorderBuildings(buildingIds: readonly string[]) {
      writeExplicitPriorityOrder(
        readCapturedBuildingSettingsRecord(getSettingsRaw()),
        buildingIds,
        readBuildingEntriesForSettings().map((entry) => entry.binding),
        (buildingId) => `bld_p_${buildingId}`,
      );
    },
    setAllAutoBuild(enabled: boolean) {
      writeForEntries((raw, entries) => {
        raw["buildingEnabledAll"] = enabled;
        entries.forEach((entry) => (raw[`bat${entry.binding}`] = enabled));
      });
    },
    setAllAutoPower(enabled: boolean) {
      writeForEntries((raw, entries) => {
        raw["buildingStateAll"] = enabled;
        entries
          .filter((entry) => entry.switchable)
          .forEach((entry) => (raw[`bld_s_${entry.binding}`] = enabled));
      });
    },
    setLinkedSmartState(buildingIds: readonly string[], enabled: boolean) {
      const raw = readCapturedBuildingSettingsRecord(getSettingsRaw());
      buildingIds.forEach((buildingId: string) => {
        raw[`bld_s2_${buildingId}`] = enabled;
      });
    },
  });
}
