/**
 * The one authoritative description of what each settings section owns.
 *
 * A section id appears in three places that used to disagree: the reset it runs, the persisted
 * keys it may delete when a stale entity leaves the game's catalogs, and the panel button that
 * asks for the reset. Splitting those across a section->reset map, a prefix map, and a per-adapter
 * prefix constant let one copy claim keys another section owns — `job_*` claimed wholesale by
 * Production deleted ordinary job overrides. Ownership is expressed once, here, as a predicate.
 *
 * The predicate covers only *dynamic* keys: those named after a game entity, which a reset's
 * computed defaults can no longer mention once the entity is gone. Keys the defaults do mention
 * are cleared by `applySettings(record, def, true)` itself, so they are deliberately not repeated.
 */

import { CRAFTER_RESOURCE_KEYS } from "./economy/production/crafter-resources.ts";

/** `job_<crafter>` is a Production crafter toggle; every other `job_*` key belongs to Jobs. */
const CRAFTER_JOB_KEYS: ReadonlySet<string> = new Set(
  CRAFTER_RESOURCE_KEYS.map((id) => `job_${id}`),
);

const OWNS_NOTHING_DYNAMIC = (): boolean => false;

function ownsPrefix(...prefixes: readonly string[]): (key: string) => boolean {
  return (key: string) => prefixes.some((prefix) => key.startsWith(prefix));
}

const ownsProductionPrefix = ownsPrefix(
  "craft",
  "foundry_",
  "production_",
  "droid_",
  "replicator_",
  "smelter_",
);

export interface SettingsSectionPolicy {
  /** The id the panel's reset button and the lifecycle both use, lower-case. */
  readonly id: string;
  /** The `createSettingsResets` member this section's reset runs. */
  readonly resetName: string;
  /**
   * Whether this section may delete a persisted override named after a game entity. Sections
   * whose defaults are entirely static own no dynamic key and answer `false` for everything.
   */
  readonly ownsDynamicKey: (key: string) => boolean;
}

/**
 * Declaration order is the startup default order: `migrateSettingsRecord` runs the resets in the
 * order they appear here, so a section that seeds keys another section reads must precede it.
 */
export const SETTINGS_SECTION_POLICIES: readonly SettingsSectionPolicy[] =
  Object.freeze([
    {
      id: "evolution",
      resetName: "resetEvolutionSettings",
      // One toggle per challenge the universe offers.
      ownsDynamicKey: ownsPrefix("challenge_"),
    },
    {
      id: "war",
      resetName: "resetWarSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "hell",
      resetName: "resetHellSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "mech",
      resetName: "resetMechSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "fleet",
      resetName: "resetFleetSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "government",
      resetName: "resetGovernmentSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "authority",
      resetName: "resetAuthoritySettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "building",
      resetName: "resetBuildingSettings",
      ownsDynamicKey: ownsPrefix("bat", "bld_"),
    },
    {
      id: "weighting",
      resetName: "resetWeightingSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "market",
      resetName: "resetMarketSettings",
      ownsDynamicKey: ownsPrefix(
        "buy",
        "sell",
        "res_buy_",
        "res_sell_",
        "res_trade_",
        "res_galaxy_",
      ),
    },
    {
      id: "research",
      resetName: "resetResearchSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "project",
      resetName: "resetProjectSettings",
      ownsDynamicKey: ownsPrefix("arpa_"),
    },
    {
      id: "job",
      resetName: "resetJobSettings",
      // Ordinary jobs, their priorities and their breakpoints. The crafter toggles Production
      // writes into the same namespace are explicitly not ours.
      ownsDynamicKey: (key: string) =>
        key.startsWith("job_") && !CRAFTER_JOB_KEYS.has(key),
    },
    {
      id: "magic",
      resetName: "resetMagicSettings",
      ownsDynamicKey: ownsPrefix("res_alchemy_", "spell_w_"),
    },
    {
      id: "production",
      resetName: "resetProductionSettings",
      // Crafters, foundry, factory, droids, replicator and smelter. `job_<crafter>` is the
      // crafter's own enable toggle and is the only `job_*` key this section may delete.
      ownsDynamicKey: (key: string) =>
        CRAFTER_JOB_KEYS.has(key) || ownsProductionPrefix(key),
    },
    {
      id: "storage",
      resetName: "resetStorageSettings",
      ownsDynamicKey: ownsPrefix(
        "res_storage",
        "res_min_store",
        "res_max_store",
        "res_containers_m_",
        "res_crates_m_",
      ),
    },
    {
      id: "general",
      resetName: "resetGeneralSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "interface",
      resetName: "resetInterfaceSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "statelog",
      resetName: "resetStateLogSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "achievementguard",
      resetName: "resetAchievementGuardSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "challengehelper",
      resetName: "resetChallengeHelperSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "prestige",
      resetName: "resetPrestigeSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "ejector",
      resetName: "resetEjectorSettings",
      ownsDynamicKey: ownsPrefix("res_eject", "res_supply", "res_nanite"),
    },
    {
      id: "planet",
      resetName: "resetPlanetSettings",
      // Per-biome, per-genus-trait and per-extra weightings for planet scoring.
      ownsDynamicKey: ownsPrefix("biome_w_", "trait_w_", "extra_w_"),
    },
    {
      id: "logging",
      resetName: "resetLoggingSettings",
      // One toggle per game log type, plus the script's own log settings under the same prefix.
      ownsDynamicKey: ownsPrefix("log_"),
    },
    {
      id: "trigger",
      resetName: "resetTriggerSettings",
      ownsDynamicKey: OWNS_NOTHING_DYNAMIC,
    },
    {
      id: "minortrait",
      resetName: "resetMinorTraitSettings",
      // `mTrait_<id>`, its `_p_`/`_w_` variants, and the Ocular Power trait choices.
      // `mutableTrait_*` does not start with `mTrait_`, so the two trait sections stay disjoint.
      ownsDynamicKey: ownsPrefix("mTrait_", "ocularPower_"),
    },
    {
      id: "mutabletrait",
      resetName: "resetMutableTraitSettings",
      // Priority plus the purge/gain/reset toggles for each mutable trait.
      ownsDynamicKey: ownsPrefix("mutableTrait_"),
    },
  ]);

/** The startup reset order, derived from the one section table rather than restated. */
export const SETTINGS_RESET_ORDER: readonly string[] = Object.freeze(
  SETTINGS_SECTION_POLICIES.map((policy) => policy.resetName),
);

const POLICY_BY_ID: ReadonlyMap<string, SettingsSectionPolicy> = new Map(
  SETTINGS_SECTION_POLICIES.map((policy) => [policy.id, policy]),
);

/** Case-insensitive, matching the panel's section ids. `undefined` for an unknown section. */
export function findSettingsSectionPolicy(
  section: string,
): SettingsSectionPolicy | undefined {
  return POLICY_BY_ID.get(section.toLowerCase());
}
