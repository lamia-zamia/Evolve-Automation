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

const RESET_ORDER = [
  "resetEvolutionSettings",
  "resetWarSettings",
  "resetHellSettings",
  "resetMechSettings",
  "resetFleetSettings",
  "resetGovernmentSettings",
  "resetAuthoritySettings",
  "resetBuildingSettings",
  "resetWeightingSettings",
  "resetMarketSettings",
  "resetResearchSettings",
  "resetProjectSettings",
  "resetJobSettings",
  "resetMagicSettings",
  "resetProductionSettings",
  "resetStorageSettings",
  "resetGeneralSettings",
  "resetInterfaceSettings",
  "resetStateLogSettings",
  "resetAchievementGuardSettings",
  "resetChallengeHelperSettings",
  "resetPrestigeSettings",
  "resetEjectorSettings",
  "resetPlanetSettings",
  "resetLoggingSettings",
  "resetTriggerSettings",
  "resetMinorTraitSettings",
  "resetMutableTraitSettings",
] as const;

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

const SECTION_TO_RESET: Readonly<Record<string, (typeof RESET_ORDER)[number]>> =
  Object.freeze(
    Object.fromEntries(
      RESET_ORDER.map((name) => [
        name.replace(/^reset|Settings$/gu, "").toLowerCase(),
        name,
      ]),
    ),
  ) as Readonly<Record<string, (typeof RESET_ORDER)[number]>>;

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
  const resetByName = Object.fromEntries(
    RESET_ORDER.map((name) => [name, resets[name as keyof typeof resets]]),
  ) as Record<(typeof RESET_ORDER)[number], (reset: boolean) => void>;
  const startupResetByName = Object.fromEntries(
    RESET_ORDER.map((name) => [
      name,
      startupResets[name as keyof typeof startupResets],
    ]),
  ) as Record<(typeof RESET_ORDER)[number], (reset: boolean) => void>;
  const effective = Object.create(null) as Record<string, unknown>;
  let initialized = false;

  const migrationContext = (): SettingsMigrationContext => ({
    settingsSections: defaults.settingsSections,
    defaultResets: RESET_ORDER.map((name) => startupResetByName[name]),
    prestigeAscensionSkipCustom: raw().prestigeAscensionSkipCustom !== false,
    techIds: defaults.techIds,
    marketPriorityIds: defaults.marketPriorityIds,
    resourceIds: defaults.resourceIds,
    projectIds: defaults.projectIds,
    buildings: defaults.buildings,
    crafterOriginalIds: defaults.crafterOriginalIds,
  });

  const persistIfChanged = (before: string) => {
    if (snapshot(settings.readRaw()) !== before) settings.persist();
  };

  return Object.freeze({
    initialize() {
      const before = snapshot(settings.readRaw());
      migrateSettingsRecord(raw(), migrationContext());
      initialized = true;
      persistIfChanged(before);
    },
    replaceAndInitialize(next: Record<string, unknown>) {
      settings.replaceRaw(next);
      initialized = false;
      this.initialize();
    },
    resetSection(section: string) {
      const resetName = SECTION_TO_RESET[section.toLowerCase()];
      if (resetName === undefined) return;
      const before = snapshot(settings.readRaw());
      resetByName[resetName](true);
      persistIfChanged(before);
    },
    ensureDynamicDefaults() {
      if (!initialized) this.initialize();
      const before = snapshot(settings.readRaw());
      // Jobs and the other game-backed catalogs are discovered lazily. Re-running their
      // non-resetting builders after a draw fills dynamic keys without touching edits.
      for (const name of defaults.discoveredResetNames) {
        if (!RESET_ORDER.includes(name as (typeof RESET_ORDER)[number]))
          continue;
        resetByName[name as (typeof RESET_ORDER)[number]](false);
      }
      persistIfChanged(before);
    },
    readRaw: settings.readRaw,
    readEffective: () => effective,
  });
}
