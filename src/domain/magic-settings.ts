/** Immutable description of the Magic settings panel. */
export type MagicSettingsControl =
  | Readonly<{
      kind: "heading";
      label: string;
    }>
  | Readonly<{
      kind: "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>;

export interface MagicAlchemyRow {
  readonly id: string;
  readonly label: string;
  readonly color: "has-text-advanced" | "has-text-info";
  readonly enabledSettingName: string;
  readonly weightingSettingName: string;
}

export interface MagicPylonRow {
  readonly id: string;
  readonly label: string;
  readonly weightingSettingName: string;
}

export interface MagicSettingsReadModel {
  readonly sectionId: "magic";
  readonly sectionName: "Magic";
  readonly alchemyControls: readonly MagicSettingsControl[];
  readonly pylonControls: readonly MagicSettingsControl[];
  readonly alchemyRows: readonly MagicAlchemyRow[];
  readonly pylonRows: readonly MagicPylonRow[];
}

export type MagicSettingsIntent = Readonly<{
  type: "reset-magic-settings";
}>;

function freezeAlchemyRow(row: MagicAlchemyRow): MagicAlchemyRow {
  return Object.freeze({ ...row });
}

function freezePylonRow(row: MagicPylonRow): MagicPylonRow {
  return Object.freeze({ ...row });
}

/** Build the Magic panel model from validated Alchemy and Pylon catalogs. */
export function createMagicSettingsReadModel({
  alchemyRows,
  pylonRows,
}: {
  readonly alchemyRows: readonly MagicAlchemyRow[];
  readonly pylonRows: readonly MagicPylonRow[];
}): MagicSettingsReadModel {
  return Object.freeze({
    sectionId: "magic",
    sectionName: "Magic",
    alchemyControls: Object.freeze([
      Object.freeze({ kind: "heading", label: "Alchemy" }),
      Object.freeze({
        kind: "number",
        settingName: "magicAlchemyManaUse",
        label: "Mana income used",
        hint: "Income portion to use on alchemy. Setting to 1 is not recommended, leftover mana will be used for rituals.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "magicFullmetalHelper",
        label: "Fullmetal helper",
        hint: "In Magic universe with Alchemy II, keep one non-basic alchemy transmutation active long enough to claim Fullmetal if the achievement is still below the current star level. Requires autoAlchemy.",
      }),
    ]),
    pylonControls: Object.freeze([
      Object.freeze({ kind: "heading", label: "Pylon" }),
      Object.freeze({
        kind: "number",
        settingName: "productionRitualManaUse",
        label: "Mana income used",
        hint: "Income portion to use on rituals. Setting to 1 is not recommended, as it will halt mana regeneration. Applied only when mana not capped - with capped mana script will always use all income.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "productionRitualSafe",
        label: "Safe rituals",
        hint: "Limit max rituals to safe, unsuspicious amount. Have no effect out of Witch Hunter scenario.",
      }),
    ]),
    alchemyRows: Object.freeze(alchemyRows.map(freezeAlchemyRow)),
    pylonRows: Object.freeze(pylonRows.map(freezePylonRow)),
  });
}
