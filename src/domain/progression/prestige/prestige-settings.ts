/** Immutable description of the Prestige settings panel. */
export interface PrestigeSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type PrestigeSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
  | Readonly<{
      kind: "number" | "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly PrestigeSettingsOption[];
    }>;

export interface PrestigeSettingsReadModel {
  readonly sectionId: "prestige";
  readonly sectionName: "Prestige";
  readonly controls: readonly PrestigeSettingsControl[];
  readonly prestigeOptions: readonly PrestigeSettingsOption[];
}

export type PrestigeSettingsIntent =
  | Readonly<{ type: "reset-prestige-settings"; secondaryPrefix: string }>
  | Readonly<{ type: "set-prestige-type"; value: string }>;

export function createPrestigeSettingsReadModel(input: {
  readonly prestigeOptions: readonly PrestigeSettingsOption[];
}): PrestigeSettingsReadModel {
  const options = Object.freeze(
    input.prestigeOptions.map((option) => Object.freeze({ ...option })),
  );
  const controls: readonly PrestigeSettingsControl[] = Object.freeze([
    {
      kind: "select",
      settingName: "prestigeType",
      label: "Prestige Type",
      hint: "",
      options,
    },
    {
      kind: "toggle",
      settingName: "prestigeWaitAT",
      label: "Disable prestiging under Accelerated Time",
      hint: "Delay reset until all accelerated time will be used, to avoid wasting it",
    },
    {
      kind: "toggle",
      settingName: "prestigeMADIgnoreArpa",
      label: "Ignore early game A.R.P.A.",
      hint: "Disables building any A.R.P.A. projects until MAD is researched, or rival have appeared",
    },
    {
      kind: "toggle",
      settingName: "prestigeBioseedConstruct",
      label: "Ignore useless buildings",
      hint: "Space Dock, Bioseeder Ship and Probes will be constructed only when Bioseed prestige enabled. World Collider won't be constructed during Bioseed. Jump Ship won't be constructed during Whitehole. Stellar Engine won't be constructed during Vacuum Collapse. Mana Syphon won't be constructed during Witch Hunter's Ascension and Demonic Infusion.",
    },
    { kind: "header", label: "Mutual Assured Destruction" },
    {
      kind: "toggle",
      settingName: "prestigeMADWait",
      label: "Wait for maximum population",
      hint: "Wait for maximum population and soldiers to maximize plasmids gain",
    },
    {
      kind: "number",
      settingName: "prestigeMADPopulation",
      label: "Required population",
      hint: "Required number of workers and soldiers before performing MAD reset",
    },
    { kind: "header", label: "Bioseed" },
    {
      kind: "number",
      settingName: "prestigeBioseedProbes",
      label: "Required probes",
      hint: "Required number of probes before launching bioseeder ship",
    },
    {
      kind: "number",
      settingName: "prestigeGECK",
      label: "Required G.E.C.K",
      hint: "Required number of G.E.C.K. for Bioseed. Unlike any other buildings G.E.C.K. won't ever be constructed during inappropriate runs, or above this number. To prevent losing plasmids. It can, however, be built with triggers - you should not build G.E.C.K with triggers, unless you absolutely sure you know what you're doing.",
    },
    { kind: "header", label: "Vacuum Collapse" },
    {
      kind: "number",
      settingName: "prestigeVacuumMana",
      label: "Required Mana regeneration",
      hint: "Begin prioritizing Mana Syphons after net Mana regeneration reaches this value",
    },
    { kind: "header", label: "Whitehole" },
    {
      kind: "toggle",
      settingName: "prestigeWhiteholeSaveGems",
      label: "Save up Soul Gems for reset",
      hint: "Save up enough Soul Gems for reset, only excess gems will be used. This option does not affect triggers.",
    },
    {
      kind: "number",
      settingName: "prestigeWhiteholeMinMass",
      label: "Minimum solar mass for reset",
      hint: "Required minimum solar mass of blackhole before prestiging. Script do not stabilize on blackhole run, this number will need to be reached naturally",
    },
    { kind: "header", label: "Ascension" },
    {
      kind: "toggle",
      settingName: "prestigeAscensionPillar",
      label: "Wait for Pillar",
      hint: "Wait for Pillar before ascending, unless it was done earlier",
    },
    {
      kind: "select",
      settingName: "prestigeCustomRaceMode",
      label: "Custom race handling",
      hint: "Controls every custom-race lab reached after Ascension, Terraform, or Apotheosis. Pause lets you edit challenge-specific races even when one is already saved. Import replaces the live design with the selected preset and continues only when the game accepts it.",
      options: Object.freeze([
        {
          val: "reuse",
          label: "Reuse saved",
          hint: "Automatically reuse the saved custom; pause if none exists.",
        },
        {
          val: "pause",
          label: "Pause in lab",
          hint: "Always stop in the lab so the custom can be edited or imported manually.",
        },
        {
          val: "import",
          label: "Import selected preset",
          hint: "Apply the selected structured preset and continue automatically.",
        },
      ]),
    },
    { kind: "header", label: "Demonic Infusion" },
    {
      kind: "number",
      settingName: "prestigeDemonicFloor",
      label: "Minimum spire floor for reset",
      hint: "Perform reset after climbing up to this spire floor",
    },
    {
      kind: "number",
      settingName: "prestigeDemonicPotential",
      label: "Maximum mech potential for reset",
      hint: "Perform reset only if current mech team potential at or below given amount. Full bay of best mechs will have `1` potential. This allows postponing reset if your team is still good after reaching target floor, and can quickly clear another floor",
    },
    {
      kind: "toggle",
      settingName: "prestigeDemonicBomb",
      label: "Use Dark Energy Bomb",
      hint: "Kill Demon Lord with Dark Energy Bomb",
    },
    { kind: "header", label: "Matrix" },
    {
      kind: "select",
      settingName: "prestigeVaxStrat",
      label: "Vaccination Strategy",
      hint: "Alter script behaviour to speed up queued items, prioritizing missing resources.",
      options: Object.freeze([
        { val: "none", label: "None", hint: "Do not select strategy" },
      ]),
    },
  ]);
  return Object.freeze({
    sectionId: "prestige",
    sectionName: "Prestige",
    controls,
    prestigeOptions: options,
  });
}
