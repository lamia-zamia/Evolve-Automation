/** Immutable description of the Ejector, Supply & Nanite settings panel. */
export interface EjectorSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

interface EjectorSettingsControlBase {
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export type EjectorSettingsControl =
  | (EjectorSettingsControlBase & {
      readonly kind: "select";
      readonly options: readonly EjectorSettingsOption[];
    })
  | (EjectorSettingsControlBase & { readonly kind: "toggle" })
  | (EjectorSettingsControlBase & { readonly kind: "number" });

export interface EjectorSettingsRow {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly atomicMass: number;
  readonly ejectEnabled: boolean;
  readonly naniteEnabled: boolean;
  readonly supplyEnabled: boolean;
  readonly ejectSettingName: string;
  readonly naniteSettingName: string;
  readonly supplySettingName: string;
  readonly supplyOut: string;
  readonly supplyIn: string;
  readonly showEject: boolean;
  readonly showNanite: boolean;
  readonly showSupply: boolean;
}

export interface EjectorSettingsReadModel {
  readonly sectionId: "ejector";
  readonly sectionName: "Ejector, Supply & Nanite";
  readonly controls: readonly EjectorSettingsControl[];
  readonly rows: readonly EjectorSettingsRow[];
}

export type EjectorSettingsIntent = Readonly<{
  type: "reset-ejector-settings";
}>;

const spendOptions: readonly EjectorSettingsOption[] = Object.freeze([
  Object.freeze({ val: "cap", label: "Capped", hint: "Use capped resources" }),
  Object.freeze({
    val: "excess",
    label: "Excess",
    hint: "Use excess resources",
  }),
  Object.freeze({
    val: "all",
    label: "All",
    hint: "Use all resources. This option can prevent script from progressing, and intended to use with additional conditions.",
  }),
  Object.freeze({
    val: "mixed",
    label: "Capped > Excess",
    hint: "Use capped resources first, switching to excess resources when capped alone is not enough.",
  }),
  Object.freeze({
    val: "full",
    label: "Capped > Excess > All",
    hint: "Use capped first, then excess, then everything else. Same as 'All' option can be potentialy dungerous.",
  }),
]);

const spendDescription =
  "Configures threshold when script will be allowed to use resources. With any option script will try to use most expensive of allowed resources within selected group. Craftables, when enabled, always use excess amount as threshold, having no cap.";

const controls: readonly EjectorSettingsControl[] = Object.freeze([
  Object.freeze({
    kind: "select",
    settingName: "ejectMode",
    label: "Eject mode",
    hint: spendDescription,
    options: spendOptions,
  }),
  Object.freeze({
    kind: "select",
    settingName: "supplyMode",
    label: "Supply mode",
    hint: spendDescription,
    options: spendOptions,
  }),
  Object.freeze({
    kind: "select",
    settingName: "naniteMode",
    label: "Nanite mode",
    hint: spendDescription,
    options: spendOptions,
  }),
  Object.freeze({
    kind: "toggle",
    settingName: "prestigeWhiteholeStabiliseMass",
    label: "Stabilize blackhole",
    hint: "Stabilizes the blackhole with exotic materials, disabled on whitehole runs",
  }),
  Object.freeze({
    kind: "number",
    settingName: "prestigeWhiteholeStabiliseCooldown",
    label: "Cooldown between stabilizes",
    hint: "Waits this many seconds between stabilizes. Stabilizing too frequently may cause significant lag in late game due to frequent full page redraws. Set to 0 to disable cooldown.",
  }),
]);

export function createEjectorSettingsReadModel(
  rows: readonly EjectorSettingsRow[],
): EjectorSettingsReadModel {
  return Object.freeze({
    sectionId: "ejector",
    sectionName: "Ejector, Supply & Nanite",
    controls,
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
  });
}
