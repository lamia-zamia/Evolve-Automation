/**
 * Owns the captured runtime's persisted/effective settings boundary.
 *
 * The store is the raw, player-editable record. Migration and defaults mutate that record once at
 * startup (and after import); the override application owns a separate effective object. Keeping
 * those two lifetimes explicit prevents a UI edit or an imported blob from being mistaken for a
 * resolved per-tick value.
 */

import type { CapturedSettingsStore } from "../ports/captured-settings-store.ts";
import { createSettingsResets } from "./settings-reset.ts";
import {
  migrateSettingsRecord,
  type SettingsMigrationContext,
  type SettingsRecord,
} from "../domain/settings-migration.ts";
import { normalizeStoredOverrides } from "../domain/override-resolution.ts";
import type { CapturedSettingsDefaults } from "../ports/captured-settings-defaults.ts";
import { isNonArrayRecord, isRecord } from "../validation/records.ts";
import {
  findSettingsSectionPolicy,
  SETTINGS_RESET_ORDER,
} from "../domain/settings-sections.ts";

/** What the lifecycle actually did, so a test can assert that repeated work was skipped. */
export interface CapturedSettingsLifecycleStats {
  /** Times the migration/default sweep ran from `initialize`. */
  readonly initializations: number;
  /** Times `ensureDynamicDefaults` did its work. */
  readonly dynamicDefaultRuns: number;
  /** Times it returned without doing any, because nothing it depends on had changed. */
  readonly dynamicDefaultSkips: number;
}

export interface CapturedSettingsLifecycle {
  /** Loads, shapes, migrates, defaults, normalizes, and persists the raw record. */
  initialize(): void;
  /** Replaces an imported record, then runs the same lifecycle before returning. */
  replaceAndInitialize(next: Record<string, unknown>): void;
  /** Applies one section's defaults forcefully, clears that section's overrides, and persists. */
  resetSection(section: string): void;
  /** Adds newly discovered dynamic defaults without overwriting player choices. */
  ensureDynamicDefaults(): void;
  /**
   * Forces the next `ensureDynamicDefaults` to do its work. The composition calls this when the
   * game replaces its root: the catalogs are read from that object, so a replacement can change
   * them without changing any count this lifecycle can see.
   */
  invalidateDynamicDefaults(): void;
  readonly stats: () => CapturedSettingsLifecycleStats;
  readRaw(): Record<string, unknown>;
  /** Mutable effective layer; only the override application writes own properties here. */
  readEffective(): Record<string, unknown>;
}

function asSettingsRecord(raw: Record<string, unknown>): SettingsRecord {
  if (!isNonArrayRecord(raw.overrides)) raw.overrides = {};
  else raw.overrides = normalizeStoredOverrides(raw.overrides, raw).overrides;
  if (Array.isArray(raw.triggers)) {
    raw.triggers = raw.triggers.filter(isNonArrayRecord);
  } else {
    raw.triggers = [];
  }
  if (
    Object.prototype.hasOwnProperty.call(raw, "arpa") &&
    !isRecord(raw.arpa)
  ) {
    delete raw.arpa;
  }
  return raw as SettingsRecord;
}

function snapshot(raw: Record<string, unknown>): string {
  return JSON.stringify(raw);
}

export function createCapturedSettingsLifecycle({
  settings,
  defaults,
}: {
  readonly settings: CapturedSettingsStore;
  readonly defaults: CapturedSettingsDefaults;
}): CapturedSettingsLifecycle {
  const raw = () => asSettingsRecord(settings.readRaw());
  const startupResets = createSettingsResets({
    getSettingsRaw: raw,
    reader: defaults.startupReader,
    effects: defaults.effects,
  });
  const resets = createSettingsResets({
    getSettingsRaw: raw,
    reader: defaults.reader,
    effects: defaults.effects,
  });
  type SectionReset = (reset: boolean) => void;
  const byName = (
    table: Record<string, SectionReset>,
  ): Record<string, SectionReset | undefined> =>
    Object.fromEntries(SETTINGS_RESET_ORDER.map((name) => [name, table[name]]));
  const resetByName = byName(resets);
  const startupResetByName = byName(startupResets);
  const effective = Object.create(null) as Record<string, unknown>;
  let initialized = false;
  // The catalog generations the two sweeps were last completed against. They are tracked
  // separately because they do different work: `initialize` migrates and defaults the record,
  // `ensureDynamicDefaults` adds the keys named after a discovered catalog. `undefined` means the
  // work is owed — at startup, after an import, after a section reset, after a root replacement.
  let migratedGeneration: string | undefined;
  let appliedGeneration: string | undefined;
  let initializations = 0;
  let dynamicDefaultRuns = 0;
  let dynamicDefaultSkips = 0;

  const migrationContext = (): SettingsMigrationContext => ({
    settingsSections: defaults.settingsSections,
    defaultResets: SETTINGS_RESET_ORDER.flatMap(
      (name) => startupResetByName[name] ?? [],
    ),
    prestigeAscensionSkipCustom: raw().prestigeAscensionSkipCustom !== false,
    techIds: defaults.techIds,
    marketPriorityIds: defaults.marketPriorityIds,
    resourceIds: defaults.resourceIds,
    projectIds: defaults.projectIds,
    buildings: defaults.buildings,
    crafterOriginalIds: defaults.crafterOriginalIds,
  });

  const purgeDynamicOverrides = (
    ownsDynamicKey: (key: string) => boolean,
  ): void => {
    const overrides = raw().overrides;
    for (const key of Object.keys(overrides)) {
      if (ownsDynamicKey(key)) delete overrides[key];
    }
  };

  const initialize = (): void => {
    const before = snapshot(settings.readRaw());
    migrateSettingsRecord(raw(), migrationContext());
    initialized = true;
    initializations += 1;
    persistIfChanged(before);
  };

  const persistIfChanged = (before: string) => {
    if (snapshot(settings.readRaw()) !== before) settings.persist();
  };

  return Object.freeze({
    initialize() {
      // Opening the settings UI asks for this on every draw. Once the record has been migrated
      // and defaulted against the current catalogs there is nothing left for a second sweep to
      // find, and the sweep is the expensive half of the lifecycle.
      const generation = defaults.readCatalogGeneration();
      if (initialized && migratedGeneration === generation) return;
      initialize();
      migratedGeneration = generation;
    },
    replaceAndInitialize(next: Record<string, unknown>) {
      settings.replaceRaw(next);
      initialized = false;
      migratedGeneration = undefined;
      appliedGeneration = undefined;
      // The imported record is authoritative even when it is already normalized and migration
      // has nothing to change. Persist after initialization rather than relying on a diff.
      initialize();
      settings.persist();
    },
    resetSection(section: string) {
      const policy = findSettingsSectionPolicy(section);
      if (policy === undefined) return;
      const before = snapshot(settings.readRaw());
      // `applySettings(..., true)` already drops the overrides of every key the section's
      // defaults name. The purge is for the rest: keys named after an entity the current
      // catalogs no longer produce, which no computed default can reach.
      resetByName[policy.resetName]?.(true);
      purgeDynamicOverrides(policy.ownsDynamicKey);
      // A reset rewrites one section's keys from the startup defaults, which are not the live
      // catalog ones. Owe both sweeps again so anything the catalogs add on top is restored.
      migratedGeneration = undefined;
      appliedGeneration = undefined;
      persistIfChanged(before);
    },
    ensureDynamicDefaults() {
      const generation = defaults.readCatalogGeneration();
      if (initialized && appliedGeneration === generation) {
        // Nothing the dynamic defaults are named after has appeared since the last sweep, and a
        // player edit cannot create a key a catalog does not name. This is the common case: the
        // tick calls this after every discovery phase.
        dynamicDefaultSkips += 1;
        return;
      }
      if (!initialized) {
        initialize();
      }
      dynamicDefaultRuns += 1;
      const before = snapshot(settings.readRaw());
      const catalogs = defaults.readMigrationCatalogs();
      const liveContext: SettingsMigrationContext = {
        ...migrationContext(),
        ...catalogs,
      };
      // The game-backed catalogs are discovered lazily. Re-running their non-resetting builders
      // after a draw fills dynamic keys without touching edits. The live migration context is
      // equally important: data-dependent migrations must be retried only once their catalogs
      // prove the referenced ids exist.
      migrateSettingsRecord(raw(), liveContext);
      for (const name of defaults.discoveredResetNames) {
        const reset = resetByName[name];
        if (reset === undefined) continue;
        reset(false);
      }
      appliedGeneration = generation;
      persistIfChanged(before);
    },
    invalidateDynamicDefaults() {
      migratedGeneration = undefined;
      appliedGeneration = undefined;
    },
    stats: () => ({
      initializations,
      dynamicDefaultRuns,
      dynamicDefaultSkips,
    }),
    readRaw: settings.readRaw,
    readEffective: () => effective,
  });
}
