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
 * | `prestigeDemonicFloor` | `captured-mad.ts` demonic branch |
 * | `prestigeMADIgnoreArpa`, `prestigeVacuumMana` | `captured-project-context.ts` |
 * | `prestigeBioseedConstruct` | `captured-factory.ts`, `captured-resource-demand.ts`, `captured-project-context.ts` |
 * | `prestigeWhiteholeSaveGems` | `captured-build-policy.ts`, `script-build-policy.ts` |
 *
 * Withheld, with the feature each one waits on:
 *
 * - `prestigeWaitAT` — only `prestige-eligibility.ts`, which no captured composition imports.
 *   `captured-project-context.ts` already says in a comment that it does not consult it.
 * - `prestigeDemonicPotential` — same module; needs a captured mech-potential sample as well.
 * - `prestigeDemonicBomb`, `prestigeVaxStrat` — the tech-conflict feature
 *   (`src/adapters/evolve/tech-conflict.ts`) is entirely compatibility-only.
 * - `prestigeCustomRaceMode`, `prestigeCustomRacePreset` — read only by `src/ui/custom-race-ui.ts`,
 *   which the captured panel does not compose.
 *
 * The prestige-type confirmation ("you may prestige immediately") needs the compatibility
 * building/tech surface to answer, so the captured reader returns no warning. That is a lost
 * prompt, not a lost behaviour: the setting itself is applied either way.
 */

import {
  createPrestigeSettingsReadModel,
  type PrestigeSettingsOption,
  type PrestigeSettingsReadModel,
} from "../../../../domain/progression/prestige/prestige-settings.ts";
import { PRESTIGE_TYPES } from "../../../../domain/progression/prestige/prestige-types.ts";

/** The exposed set, in no particular order; the read model keeps the section's own ordering. */
export const CAPTURED_PRESTIGE_SETTINGS: ReadonlySet<string> = Object.freeze(
  new Set([
    "prestigeType",
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
  ]),
);

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

export function createCapturedPrestigeSettingsAdapter(): CapturedPrestigeSettingsAdapter {
  const readModel = createPrestigeSettingsReadModel({
    prestigeOptions: capturedPrestigeOptions,
    exposedSettings: CAPTURED_PRESTIGE_SETTINGS,
  });
  return Object.freeze({
    read: () => readModel,
    getConfirmationText: () => "",
  });
}
