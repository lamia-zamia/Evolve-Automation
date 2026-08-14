import {
  createJobSettingsControl,
  createLoggingSettingsControl,
  createMagicSettingsControl,
  createProjectSettingsControl,
  createStorageSettingsControl,
  createWeightingSettingsControl,
} from "./settings/core-settings-controls.ts";
import { createBuildingSettingsControl } from "./settings/building-settings-control.ts";
import { createProductionSettingsControl } from "./settings/production-settings-control.ts";

type ProductionDependencies = Parameters<
  typeof createProductionSettingsControl
>[0];
type StorageDependencies = Parameters<typeof createStorageSettingsControl>[0];
type MagicDependencies = Parameters<typeof createMagicSettingsControl>[0];
type JobDependencies = Parameters<typeof createJobSettingsControl>[0];
type WeightingDependencies = Parameters<
  typeof createWeightingSettingsControl
>[0];
type BuildingDependencies = Parameters<typeof createBuildingSettingsControl>[0];
type ProjectDependencies = Parameters<typeof createProjectSettingsControl>[0];
type LoggingDependencies = Parameters<typeof createLoggingSettingsControl>[0];

export interface CoreSettingsPanelDependencies {
  production: ProductionDependencies;
  storage: StorageDependencies;
  magic: MagicDependencies;
  job: JobDependencies;
  weighting: WeightingDependencies;
  building: BuildingDependencies;
  project: ProjectDependencies;
  logging: LoggingDependencies;
}

export function createCoreSettingsPanelControl({
  production,
  storage,
  magic,
  job,
  weighting,
  building,
  project,
  logging,
}: CoreSettingsPanelDependencies) {
  return {
    productionSettingsBrowserAdapter:
      createProductionSettingsControl(production),
    storageSettingsBrowserAdapter: createStorageSettingsControl(storage),
    magicSettingsBrowserAdapter: createMagicSettingsControl(magic),
    jobSettingsBrowserAdapter: createJobSettingsControl(job),
    weightingSettingsBrowserAdapter: createWeightingSettingsControl(weighting),
    buildingSettingsBrowserAdapter: createBuildingSettingsControl(building),
    projectSettingsBrowserAdapter: createProjectSettingsControl(project),
    loggingSettingsBrowserAdapter: createLoggingSettingsControl(logging),
  };
}
