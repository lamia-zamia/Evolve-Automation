/** Captured read/write adapter for the Trait settings surface. */

import {
  createTraitSettingsReadModel,
  type TraitSettingsMutableRow,
  type TraitSettingsReadModel,
  type TraitSettingsSelectOption,
} from "../../../domain/traits/trait-settings.ts";
import {
  computeMinorTraitDefaults,
  computeMutableTraitDefaults,
} from "../../../domain/settings-defaults.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  buildTraitBoostOptions,
  buildTraitGenusOptions,
  buildTraitImitateOptions,
  buildTraitPsychicOptions,
  buildTraitWishOptions,
  CAPTURED_TRAIT_GAINABLE,
  CAPTURED_TRAIT_GENUS_TYPES,
  CAPTURED_TRAIT_MINOR,
  CAPTURED_TRAIT_MUTABLE,
  CAPTURED_TRAIT_NEG_ROLL,
  CAPTURED_TRAIT_OCULAR,
  CAPTURED_TRAIT_RACES,
  CAPTURED_TRAIT_STATIC_CONTROLS,
  readCapturedMinorTraitContext,
  readCapturedMutableTraitContext,
} from "./captured-trait-settings-catalog.ts";
import {
  CAPTURED_MUTATION_MULTIPLIED_SPECIES,
  readCapturedMutationBaseCost,
  readCapturedMutationMultipliedBaseCost,
  readCapturedMutationTraitValue,
} from "./captured-mutation-cost.ts";

export interface CapturedTraitSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedTraitSettingsAdapter {
  readTraitSettingsReadModel(): TraitSettingsReadModel;
  resetMinorTraits(): void;
  resetMutableTraits(): void;
  reorderMinorTraits(traitIds: readonly string[]): void;
  reorderMutableTraits(traitIds: readonly string[]): void;
  setBoolean(settingName: string, value: boolean): void;
}

function readSettingsRecord(
  getSettingsRaw: () => unknown,
): Record<string, unknown> {
  const raw = getSettingsRaw();
  return isRecord(raw) ? raw : {};
}

function readPriorityKeys(
  settings: Record<string, unknown>,
  prefix: string,
): readonly string[] {
  return Object.freeze(
    Object.keys(settings)
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({
        id: key.slice(prefix.length),
        priority:
          typeof settings[key] === "number"
            ? (settings[key] as number)
            : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.id),
  );
}

function readCompletedRaceIds(
  rootState: GameRootStateSource,
): ReadonlySet<string> {
  const root = rootState.readRoot();
  const stats = readProperty(root, "stats");
  const synth = readProperty(stats, "synth");
  if (!isRecord(synth)) return new Set();
  return new Set(Object.keys(synth));
}

function findRaceName(raceId: string): string {
  return (
    CAPTURED_TRAIT_RACES.find((race) => race.id === raceId)?.name ?? raceId
  );
}

function findGenusLabel(genusId: string): string {
  return (
    CAPTURED_TRAIT_GENUS_TYPES.find((genus) => genus.id === genusId)?.label ??
    genusId
  );
}

function readMinorRows(
  settings: Record<string, unknown>,
): TraitSettingsReadModel["minorRows"] {
  return Object.freeze(
    readPriorityKeys(settings, "mTrait_p_").map((id) => {
      const known = CAPTURED_TRAIT_MINOR.find((trait) => trait.id === id);
      return Object.freeze({
        id,
        label: known?.label ?? id,
        hint: known?.hint ?? "",
      });
    }),
  );
}

function mutableCostLabel(traitId: string): string {
  const cost = readCapturedMutationBaseCost(traitId);
  return cost === undefined ? "?" : `${cost}`;
}

const MULTIPLIED_SPECIES_HINT_LABEL = ((names: readonly string[]): string => {
  const lastName = names[names.length - 1] ?? "";
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${lastName}`
    : lastName;
})(Object.values(CAPTURED_MUTATION_MULTIPLIED_SPECIES));

function mutableCostHint(traitId: string): string {
  const cost = readCapturedMutationMultipliedBaseCost(traitId);
  return cost === undefined
    ? ""
    : `${cost} for ${MULTIPLIED_SPECIES_HINT_LABEL} species`;
}

function readMutableRows(
  settings: Record<string, unknown>,
): readonly TraitSettingsMutableRow[] {
  return Object.freeze(
    readPriorityKeys(settings, "mutableTrait_p_").map((id) => {
      const known = CAPTURED_TRAIT_MUTABLE.find((trait) => trait.id === id);
      const type = known?.type ?? "major";
      const source = known?.source ?? id;
      const value = readCapturedMutationTraitValue(id);
      return Object.freeze({
        id,
        sourceLabel:
          type === "genus" ? findGenusLabel(source) : findRaceName(source),
        sourceHint: type === "genus" ? "Genus" : "Major",
        sourceColor: type === "genus" ? "has-text-special" : "has-text",
        traitLabel: known?.label ?? id,
        traitHint: known?.hint ?? "",
        traitColor:
          value !== undefined && value < 0
            ? "has-text-danger"
            : "has-text-success",
        costLabel: mutableCostLabel(id),
        costHint: mutableCostHint(id),
        gainable: CAPTURED_TRAIT_GAINABLE.has(id),
        resettable: CAPTURED_TRAIT_NEG_ROLL.has(id),
      });
    }),
  );
}

export function createCapturedTraitSettingsAdapter({
  rootState,
  getSettingsRaw,
}: CapturedTraitSettingsDependencies): CapturedTraitSettingsAdapter {
  return Object.freeze({
    readTraitSettingsReadModel(): TraitSettingsReadModel {
      const settings = readSettingsRecord(getSettingsRaw);
      const completed = readCompletedRaceIds(rootState);
      const genusOptions = buildTraitGenusOptions();
      const imitateOptions = buildTraitImitateOptions(completed);
      const psychicOptions = buildTraitPsychicOptions();
      const psychicBoostOptions = buildTraitBoostOptions();
      const imitateRaceId =
        typeof settings["imitateRace"] === "string"
          ? settings["imitateRace"]
          : "";
      const imitateKnown = CAPTURED_TRAIT_RACES.some(
        (race) => race.id === imitateRaceId,
      );
      // Static controls sit between the catalog-driven selects in compat order:
      // shrine and slave income after imitate, the rest after the wishes.
      return createTraitSettingsReadModel({
        controls: Object.freeze([
          ...genusSelect(genusOptions),
          ...imitateSelect(imitateOptions),
          ...CAPTURED_TRAIT_STATIC_CONTROLS.slice(0, 1),
          ...CAPTURED_TRAIT_STATIC_CONTROLS.slice(1, 2),
          ...psychicSelect(psychicOptions),
          ...psychicBoostSelect(psychicBoostOptions),
          ...wishSelect(
            "wishMinor",
            "Minor Wish",
            "Uses this minor wish when available.",
            "minor",
          ),
          ...wishSelect(
            "wishMajor",
            "Major Wish",
            "Uses this major wish when available.",
            "major",
          ),
          ...CAPTURED_TRAIT_STATIC_CONTROLS.slice(2),
        ]),
        genusOptions,
        imitateOptions,
        imitateRaceId,
        imitateRaceCompleted: imitateKnown
          ? completed.has(imitateRaceId)
          : undefined,
        psychicOptions,
        psychicBoostOptions,
        wishMinorOptions: buildTraitWishOptions("minor"),
        wishMajorOptions: buildTraitWishOptions("major"),
        ocularRows: Object.freeze(
          CAPTURED_TRAIT_OCULAR.map((power) =>
            Object.freeze({
              id: power.id,
              label: power.label,
              hint: power.hint,
            }),
          ),
        ),
        minorRows: readMinorRows(settings),
        mutableRows: readMutableRows(settings),
      });
    },
    resetMinorTraits() {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      Object.assign(
        raw,
        computeMinorTraitDefaults(readCapturedMinorTraitContext()).def,
      );
    },
    resetMutableTraits() {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      Object.assign(
        raw,
        computeMutableTraitDefaults(readCapturedMutableTraitContext()).def,
      );
    },
    reorderMinorTraits(traitIds: readonly string[]) {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      // No script-side manager owns the list on the captured path; the settings
      // record is the order authority the captured automation reads.
      traitIds.forEach((id, index) => {
        raw[`mTrait_p_${id}`] = index;
      });
    },
    reorderMutableTraits(traitIds: readonly string[]) {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      traitIds.forEach((id, index) => {
        raw[`mutableTrait_p_${id}`] = index;
      });
    },
    setBoolean(settingName: string, value: boolean) {
      const raw = getSettingsRaw();
      if (!isRecord(raw) || settingName.length === 0) return;
      raw[settingName] = value;
    },
  });
}

function selectControl(
  settingName: string,
  label: string,
  hint: string,
  options: readonly TraitSettingsSelectOption[],
) {
  return Object.freeze([
    { kind: "select" as const, settingName, label, hint, options },
  ]);
}

function genusSelect(options: readonly TraitSettingsSelectOption[]) {
  return selectControl(
    "shifterGenus",
    "Mimic genus",
    "Mimic selected genus, if avaialble. If you want to add some conditional overrides to this setting, keep in mind changing genus redraws game page, frequent changes can drastically harm game performance.",
    options,
  );
}

function imitateSelect(options: readonly TraitSettingsSelectOption[]) {
  return selectControl(
    "imitateRace",
    "Imitate race",
    "Imitate selected race, if available.",
    options,
  );
}

function psychicSelect(options: readonly TraitSettingsSelectOption[]) {
  return selectControl(
    "psychicPower",
    "Psychic Powers",
    "Activates selected power with full energy. 10 murders required to research advanced powers will be performed automatically, if needed.",
    options,
  );
}

function psychicBoostSelect(options: readonly TraitSettingsSelectOption[]) {
  return selectControl(
    "psychicBoostRes",
    "Boosted Resource",
    "Resource for Boost Resource Production psychic power.",
    options,
  );
}

function wishSelect(
  settingName: string,
  label: string,
  hint: string,
  kind: "minor" | "major",
) {
  return selectControl(settingName, label, hint, buildTraitWishOptions(kind));
}
