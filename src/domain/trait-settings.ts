/** Immutable description of the Trait settings panel. */
export interface TraitSettingsSelectOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type TraitSettingsControl =
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly TraitSettingsSelectOption[];
    }>;

export interface TraitSettingsOcularRow {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

export interface TraitSettingsMinorRow {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

export interface TraitSettingsMutableRow {
  readonly id: string;
  readonly sourceLabel: string;
  readonly sourceHint: string;
  readonly sourceColor: "has-text-special" | "has-text";
  readonly traitLabel: string;
  readonly traitHint: string;
  readonly traitColor: "has-text-success" | "has-text-danger";
  readonly costLabel: string;
  readonly costHint: string;
  readonly gainable: boolean;
  readonly resettable: boolean;
}

export interface TraitSettingsReadModel {
  readonly sectionId: "trait";
  readonly sectionName: "Traits";
  readonly controls: readonly TraitSettingsControl[];
  readonly genusOptions: readonly TraitSettingsSelectOption[];
  readonly imitateOptions: readonly TraitSettingsSelectOption[];
  readonly imitateRaceId: string;
  readonly imitateRaceCompleted: boolean | undefined;
  readonly psychicOptions: readonly TraitSettingsSelectOption[];
  readonly psychicBoostOptions: readonly TraitSettingsSelectOption[];
  readonly wishMinorOptions: readonly TraitSettingsSelectOption[];
  readonly wishMajorOptions: readonly TraitSettingsSelectOption[];
  readonly ocularRows: readonly TraitSettingsOcularRow[];
  readonly minorRows: readonly TraitSettingsMinorRow[];
  readonly mutableRows: readonly TraitSettingsMutableRow[];
}

export type TraitSettingsIntent =
  | Readonly<{ type: "reset-trait-settings" }>
  | Readonly<{ type: "clear-evolution-target" }>
  | Readonly<{ type: "reorder-minor-traits"; traitIds: readonly string[] }>
  | Readonly<{ type: "reorder-mutable-traits"; traitIds: readonly string[] }>
  | Readonly<{
      type: "set-trait-setting";
      settingName: string;
      value: boolean;
    }>;

export function createTraitSettingsReadModel(input: {
  readonly controls: readonly TraitSettingsControl[];
  readonly genusOptions: readonly TraitSettingsSelectOption[];
  readonly imitateOptions: readonly TraitSettingsSelectOption[];
  readonly imitateRaceId: string;
  readonly imitateRaceCompleted: boolean | undefined;
  readonly psychicOptions: readonly TraitSettingsSelectOption[];
  readonly psychicBoostOptions: readonly TraitSettingsSelectOption[];
  readonly wishMinorOptions: readonly TraitSettingsSelectOption[];
  readonly wishMajorOptions: readonly TraitSettingsSelectOption[];
  readonly ocularRows: readonly TraitSettingsOcularRow[];
  readonly minorRows: readonly TraitSettingsMinorRow[];
  readonly mutableRows: readonly TraitSettingsMutableRow[];
}): TraitSettingsReadModel {
  const freezeOptions = (options: readonly TraitSettingsSelectOption[]) =>
    Object.freeze(options.map((option) => Object.freeze({ ...option })));
  return Object.freeze({
    sectionId: "trait",
    sectionName: "Traits",
    controls: Object.freeze(
      input.controls.map((control) =>
        Object.freeze({
          ...control,
          ...(control.kind === "select"
            ? { options: freezeOptions(control.options) }
            : {}),
        }),
      ),
    ),
    genusOptions: freezeOptions(input.genusOptions),
    imitateOptions: freezeOptions(input.imitateOptions),
    imitateRaceId: input.imitateRaceId,
    imitateRaceCompleted: input.imitateRaceCompleted,
    psychicOptions: freezeOptions(input.psychicOptions),
    psychicBoostOptions: freezeOptions(input.psychicBoostOptions),
    wishMinorOptions: freezeOptions(input.wishMinorOptions),
    wishMajorOptions: freezeOptions(input.wishMajorOptions),
    ocularRows: Object.freeze(
      input.ocularRows.map((row) => Object.freeze({ ...row })),
    ),
    minorRows: Object.freeze(
      input.minorRows.map((row) => Object.freeze({ ...row })),
    ),
    mutableRows: Object.freeze(
      input.mutableRows.map((row) => Object.freeze({ ...row })),
    ),
  });
}
