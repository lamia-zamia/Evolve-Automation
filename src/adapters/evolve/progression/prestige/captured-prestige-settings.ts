/**
 * Captured read model for the Prestige settings surface.
 *
 * Every historical Prestige control was traced to its real consumer, and only those the captured
 * production composition actually reaches are offered. `CAPTURED_PRESTIGE_SETTINGS` is that list,
 * with the module each one reaches:
 *
 * | setting | captured consumer |
 * | --- | --- |
 * | `prestigeType` | `captured-mad.ts` branch selection, plus build/factory/demand/project policy |
 * | `prestigeMADWait`, `prestigeMADPopulation` | `captured-mad.ts` MAD branch |
 * | `prestigeBioseedProbes`, `prestigeGECK` | `captured-mad.ts` bioseed branch |
 * | `prestigeWhiteholeMinMass` | `captured-mad.ts` whitehole branch |
 * | `prestigeAscensionPillar` | `captured-mad.ts` ascension branch |
 * | `prestigeCustomRaceMode`, `prestigeCustomRacePreset` | `captured-mad.ts` and Custom Race preset editor |
 * | `prestigeDemonicFloor` | `captured-mad.ts` demonic branch |
 * | `prestigeDemonicPotential` | `captured-mad.ts` demonic Mech readiness |
 * | `prestigeMADIgnoreArpa`, `prestigeVacuumMana` | `captured-project-context.ts` |
 * | `prestigeBioseedConstruct` | `captured-factory.ts`, `captured-resource-demand.ts`, `captured-project-context.ts` |
 * | `prestigeWhiteholeSaveGems` | `captured-build-policy.ts`, `script-build-policy.ts` |
 * | `prestigeDemonicBomb`, `prestigeVaxStrat` | `captured-tech-conflicts.ts` research exclusions |
 *
 * Withheld, with the feature each one waits on:
 *
 * - `prestigeWaitAT` — only `prestige-eligibility.ts`, which no captured composition imports.
 *   `captured-project-context.ts` already says in a comment that it does not consult it.
 *
 * The prestige-type confirmation ("you may prestige immediately") needs the compatibility
 * building/tech surface to answer, so the captured reader returns no warning. That is a lost
 * prompt, not a lost behaviour: the setting itself is applied either way.
 */

import {
  createPrestigeSettingsReadModel,
  NO_VACCINATION_STRATEGY,
  VACCINATION_STRATEGY_IDS,
  type PrestigeSettingsOption,
  type PrestigeSettingsReadModel,
} from "../../../../domain/progression/prestige/prestige-settings.ts";
import { customRacePresetOptions as getCustomRacePresetOptions } from "../../../../domain/progression/prestige/custom-race.ts";
import { PRESTIGE_TYPES } from "../../../../domain/progression/prestige/prestige-types.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
// The captured path's one way to turn a `tech_*` localization key into the label the game drew.
// The vaccination strategies are technologies, so they read their labels through the same helper
// the Research section uses rather than carrying a second copy of that rule.
import { createCapturedResearchLocalize } from "../research/captured-research-settings-catalog.ts";

/** The exposed set, in no particular order; the read model keeps the section's own ordering. */
export const CAPTURED_PRESTIGE_SETTINGS: ReadonlySet<string> = Object.freeze(
  new Set([
    "prestigeType",
    "prestigeCustomRaceMode",
    "prestigeCustomRacePreset",
    "prestigeMADIgnoreArpa",
    "prestigeBioseedConstruct",
    "prestigeMADWait",
    "prestigeMADPopulation",
    "prestigeBioseedProbes",
    "prestigeGECK",
    "prestigeVacuumMana",
    "prestigeWhiteholeSaveGems",
    "prestigeWhiteholeMinMass",
    "prestigeAscensionPillar",
    "prestigeDemonicFloor",
    "prestigeDemonicPotential",
    "prestigeDemonicBomb",
    "prestigeVaxStrat",
  ]),
);

/**
 * The vaccination strategies, labeled from the technologies the game has drawn. Without a control
 * registry there is nothing to localize against, so only "none" is offered — an empty select is a
 * truthful "this surface cannot name them", never a silently mislabeled one.
 */
function readCapturedVaccinationOptions(
  controls: GameControlRegistry | undefined,
): readonly PrestigeSettingsOption[] {
  if (controls === undefined) return Object.freeze([NO_VACCINATION_STRATEGY]);
  const localize = createCapturedResearchLocalize(controls);
  return Object.freeze([
    NO_VACCINATION_STRATEGY,
    ...VACCINATION_STRATEGY_IDS.map((id) =>
      Object.freeze({
        val: id,
        label: localize(`tech_vax_${id}`),
        hint: localize(`tech_vax_${id}_effect`),
      }),
    ),
  ]);
}

const capturedPrestigeOptions: readonly PrestigeSettingsOption[] =
  Object.freeze(
    PRESTIGE_TYPES.map((type) =>
      Object.freeze({ val: type.val, label: type.label, hint: type.hint }),
    ),
  );

export interface CapturedPrestigeSettingsAdapter {
  read(): PrestigeSettingsReadModel;
  getConfirmationText(value: string): string;
}

export function createCapturedPrestigeSettingsAdapter(
  dependencies: {
    /** Labels the vaccination strategies from the technologies the game has drawn. */
    readonly controls?: GameControlRegistry;
    /** Raw settings are validated before preset names become select options. */
    readonly readSettings?: () => unknown;
  } = {},
): CapturedPrestigeSettingsAdapter {
  // The strategy labels come from drawn controls, so the model is rebuilt per read rather than
  // frozen at construction: a technology the game draws later must be able to name itself.
  const read = (): PrestigeSettingsReadModel =>
    createPrestigeSettingsReadModel({
      prestigeOptions: capturedPrestigeOptions,
      vaccinationOptions: readCapturedVaccinationOptions(dependencies.controls),
      customRacePresetOptions: getCustomRacePresetOptions(
        dependencies.readSettings?.(),
      ),
      exposedSettings: CAPTURED_PRESTIGE_SETTINGS,
    });
  return Object.freeze({ read, getConfirmationText: () => "" });
}
