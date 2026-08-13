import {
  migrateSettingsRecord,
  type SettingsMigrationContext,
  type SettingsRecord,
} from "../../domain/settings-migration.ts";
import { describeDroppedOverride } from "../../domain/override-resolution.ts";

interface MigrationSettings {
  readonly prestigeAscensionSkipCustom: unknown;
}

interface MigrationBuilding {
  readonly vueBinding: string;
  readonly switchable: boolean;
}

interface MigrationLog {
  logDanger(category: string, message: string, tags: string[]): void;
}

interface SettingsMigrationRunnerDependencies {
  readonly getSettingsRaw: () => SettingsRecord;
  readonly getSettings: () => MigrationSettings;
  readonly getSettingsSections: () => readonly string[];
  readonly getDefaultResets: () => readonly ((reset: boolean) => void)[];
  readonly getTechIds: () => Record<string, unknown>;
  readonly getMarketPriorityIds: () => readonly string[];
  readonly getResourceIds: () => readonly string[];
  readonly getProjectIds: () => readonly string[];
  readonly getBuildings: () => readonly MigrationBuilding[];
  readonly getCrafterOriginalIds: () => readonly string[];
  readonly getGameLog: () => MigrationLog;
}

export interface SettingsMigrationRunner {
  updateStandAloneSettings(): void;
}

export function createSettingsMigrationRunner({
  getSettingsRaw,
  getSettings,
  getSettingsSections,
  getDefaultResets,
  getTechIds,
  getMarketPriorityIds,
  getResourceIds,
  getProjectIds,
  getBuildings,
  getCrafterOriginalIds,
  getGameLog,
}: SettingsMigrationRunnerDependencies): SettingsMigrationRunner {
  function updateStandAloneSettings(): void {
    const context: SettingsMigrationContext = {
      settingsSections: getSettingsSections(),
      // The default-reset builders, in their load-bearing order.
      defaultResets: getDefaultResets(),
      prestigeAscensionSkipCustom: Boolean(
        getSettings().prestigeAscensionSkipCustom,
      ),
      techIds: getTechIds(),
      marketPriorityIds: getMarketPriorityIds(),
      resourceIds: getResourceIds(),
      projectIds: getProjectIds(),
      buildings: getBuildings(),
      crafterOriginalIds: getCrafterOriginalIds(),
    };
    const report = migrateSettingsRecord(getSettingsRaw(), context);
    for (const dropped of report.droppedOverrides) {
      getGameLog().logDanger("special", describeDroppedOverride(dropped), [
        "events",
        "major_events",
      ]);
    }
  }

  return { updateStandAloneSettings };
}
