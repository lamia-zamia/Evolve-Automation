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

export interface CapturedSettingsLifecycle {
  /** Loads, shapes, migrates, defaults, normalizes, and persists the raw record. */
  initialize(): void;
  /** Replaces an imported record, then runs the same lifecycle before returning. */
  replaceAndInitialize(next: Record<string, unknown>): void;
  /** Applies one section's defaults forcefully, clears that section's overrides, and persists. */
  resetSection(section: string): void;
  /** Adds newly discovered dynamic defaults without overwriting player choices. */
  ensureDynamicDefaults(): void;
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
    persistIfChanged(before);
  };

  const persistIfChanged = (before: string) => {
    if (snapshot(settings.readRaw()) !== before) settings.persist();
  };

  return Object.freeze({
    initialize,
    replaceAndInitialize(next: Record<string, unknown>) {
      settings.replaceRaw(next);
      initialized = false;
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
      persistIfChanged(before);
    },
    ensureDynamicDefaults() {
      if (!initialized) initialize();
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
      persistIfChanged(before);
    },
    readRaw: settings.readRaw,
    readEffective: () => effective,
  });
}
