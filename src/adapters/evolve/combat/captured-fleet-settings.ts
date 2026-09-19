/** Captured read/write adapter for the Fleet settings surface. */

import {
  createFleetSettingsReadModel,
  type FleetSettingsReadModel,
  type FleetSettingsRegion,
} from "../../../domain/combat/fleet-settings.ts";
import { computeFleetDefaults } from "../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import { isRecord } from "../../validation.ts";
import {
  CAPTURED_ANDROMEDA_REGION_IDS,
  CAPTURED_FLEET_ANDROMEDA_CONTROLS,
  CAPTURED_FLEET_OUTER_CONTROLS,
  CAPTURED_OUTER_REGION_IDS,
  CAPTURED_SHIP_COMPONENTS,
  readCapturedFleetRegionLabel,
} from "./captured-fleet-settings-catalog.ts";

export interface CapturedFleetSettingsDependencies {
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedFleetSettingsAdapter {
  readFleetSettingsReadModel(): FleetSettingsReadModel;
  resetToDefaults(): void;
  reorderAndromeda(regionIds: readonly string[]): void;
}

function readFleetPriority(
  settings: Record<string, unknown>,
  name: string,
): number {
  const value = settings[name];
  return typeof value === "number" ? value : 0;
}

function readOverriddenNames(
  settings: Record<string, unknown>,
): ReadonlySet<string> {
  // Overrides are created lazily by the override editor; an uninitialized record
  // means no region priority has been overridden yet.
  const overrides = settings["overrides"];
  if (!isRecord(overrides)) return new Set();
  return new Set(Object.keys(overrides));
}

function readAndromedaRegions(
  controls: GameControlRegistry,
  settings: Record<string, unknown>,
): readonly FleetSettingsRegion[] {
  const overridden = readOverriddenNames(settings);
  return Object.freeze(
    CAPTURED_ANDROMEDA_REGION_IDS.map((id) => ({
      id,
      label: readCapturedFleetRegionLabel(controls, `galaxy-${id}`, id),
      settingName: `fleet_pr_${id}`,
      priority: readFleetPriority(settings, `fleet_pr_${id}`),
    }))
      .sort((a, b) => a.priority - b.priority)
      .map((region) =>
        Object.freeze({
          id: region.id,
          label: region.label,
          ...(overridden.has(region.settingName)
            ? { settingName: region.settingName }
            : {}),
        }),
      ),
  );
}

export function createCapturedFleetSettingsAdapter({
  controls,
  getSettingsRaw,
}: CapturedFleetSettingsDependencies): CapturedFleetSettingsAdapter {
  return Object.freeze({
    readFleetSettingsReadModel(): FleetSettingsReadModel {
      const raw = getSettingsRaw();
      const settings = isRecord(raw) ? raw : {};
      return createFleetSettingsReadModel({
        outerControls: CAPTURED_FLEET_OUTER_CONTROLS,
        outerComponents: CAPTURED_SHIP_COMPONENTS,
        outerRegions: Object.freeze(
          CAPTURED_OUTER_REGION_IDS.map((id) =>
            Object.freeze({
              id,
              label: readCapturedFleetRegionLabel(controls, `space-${id}`, id),
            }),
          ),
        ),
        andromedaControls: CAPTURED_FLEET_ANDROMEDA_CONTROLS,
        andromedaRegions: readAndromedaRegions(controls, settings),
      });
    },
    resetToDefaults() {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      Object.assign(raw, computeFleetDefaults().def);
    },
    reorderAndromeda(regionIds: readonly string[]) {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      regionIds.forEach((regionId, index) => {
        raw[`fleet_pr_${regionId}`] = index;
      });
    },
  });
}
