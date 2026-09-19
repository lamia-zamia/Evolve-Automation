import type {
  SettingsResetEffects,
  SettingsResetReader,
} from "./settings-reset.ts";

export interface CapturedSettingsMigrationCatalogs {
  readonly techIds: Record<string, unknown>;
  readonly marketPriorityIds: readonly string[];
  readonly resourceIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly buildings: readonly {
    readonly vueBinding: string;
    readonly switchable: boolean;
  }[];
  readonly crafterOriginalIds: readonly string[];
}

/** The captured runtime's narrow settings-default capability. */
export interface CapturedSettingsDefaults {
  /** Root-free reader used to establish every record-level default at startup. */
  readonly startupReader: SettingsResetReader;
  /** Live reader used after the corresponding captured catalog has been discovered. */
  readonly reader: SettingsResetReader;
  readonly effects: SettingsResetEffects;
  readonly settingsSections: readonly string[];
  readonly techIds: Record<string, unknown>;
  readonly marketPriorityIds: readonly string[];
  readonly resourceIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly buildings: readonly {
    readonly vueBinding: string;
    readonly switchable: boolean;
  }[];
  readonly crafterOriginalIds: readonly string[];
  /** Dynamic defaults that are safe to refresh from the captured controls today. */
  readonly discoveredResetNames: readonly string[];
  /** Reads migration catalogs after the page has exposed its current controls and root. */
  readonly readMigrationCatalogs: () => CapturedSettingsMigrationCatalogs;
  /**
   * A value that changes whenever the captured catalogs could name a dynamic key they did not
   * name before. The lifecycle skips its migration and default work while this is unchanged, so
   * it must be cheap — cheaper than the work it guards — and it must never miss a growth.
   */
  readonly readCatalogGeneration: () => string;
}
