/** Immutable description of the Government settings panel. */
export interface GovernmentSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type GovernmentSettingsControl =
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
      options: readonly GovernmentSettingsOption[];
    }>;

export interface GovernmentSettingsReadModel {
  readonly sectionId: "government";
  readonly sectionName: "Government";
  readonly controls: readonly GovernmentSettingsControl[];
}

export interface GovernmentSettingsReadModelInput {
  readonly governmentOptions: readonly GovernmentSettingsOption[];
  readonly governorOptions: readonly GovernmentSettingsOption[];
}

export type GovernmentSettingsIntent = Readonly<{
  type: "reset-government-settings";
  secondaryPrefix: string;
}>;

function freezeOption(
  option: GovernmentSettingsOption,
): GovernmentSettingsOption {
  return Object.freeze({ ...option });
}

function freezeOptions(
  options: readonly GovernmentSettingsOption[],
): readonly GovernmentSettingsOption[] {
  return Object.freeze(options.map(freezeOption));
}

/** Build the panel read model from validated government and governor options. */
export function createGovernmentSettingsReadModel({
  governmentOptions,
  governorOptions,
}: GovernmentSettingsReadModelInput): GovernmentSettingsReadModel {
  const frozenGovernmentOptions = freezeOptions(governmentOptions);
  const frozenGovernorOptions = freezeOptions(governorOptions);

  return Object.freeze({
    sectionId: "government",
    sectionName: "Government",
    controls: Object.freeze([
      Object.freeze({
        kind: "number",
        settingName: "generalRequestedTaxRate",
        label: "Forced tax rate",
        hint: "Set tax rate as close to this value as possible, ignores morale. Set to -1 to disable this option",
      }),
      Object.freeze({
        kind: "number",
        settingName: "generalMinimumTaxRate",
        label: "Minimum allowed tax rate",
        hint: "Minimum tax rate for autoTax. Will still go below this amount if money storage is full",
      }),
      Object.freeze({
        kind: "number",
        settingName: "generalMinimumMorale",
        label: "Minimum allowed morale",
        hint: "Use this to set a minimum allowed morale. Remember that less than 100% can cause riots and weather can cause sudden swings",
      }),
      Object.freeze({
        kind: "number",
        settingName: "generalMaximumMorale",
        label: "Maximum allowed morale",
        hint: "Use this to set a maximum allowed morale. The tax rate will be raised to lower morale to this maximum",
      }),
      Object.freeze({
        kind: "select",
        settingName: "govInterim",
        label: "Interim Government",
        hint: "Temporary low tier government until you research other governments",
        options: frozenGovernmentOptions,
      }),
      Object.freeze({
        kind: "select",
        settingName: "govFinal",
        label: "Second Government",
        hint: "Second government choice, chosen once becomes available. Can be the same as above",
        options: frozenGovernmentOptions,
      }),
      Object.freeze({
        kind: "select",
        settingName: "govSpace",
        label: "Space Government",
        hint: "Government for bioseed+. Chosen once you researched Quantum Manufacturing. Can be the same as above",
        options: frozenGovernmentOptions,
      }),
      Object.freeze({
        kind: "select",
        settingName: "govGovernor",
        label: "Governor",
        hint: "Chosen governor will be appointed.",
        options: frozenGovernorOptions,
      }),
    ]),
  });
}
