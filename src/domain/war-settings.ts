/** Immutable description of the Foreign Affairs settings panel. */
export interface WarSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type WarSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
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
      options: readonly WarSettingsOption[];
    }>;

export interface WarSettingsReadModel {
  readonly sectionId: "war";
  readonly sectionName: "Foreign Affairs";
  readonly controls: readonly WarSettingsControl[];
}

export type WarSettingsIntent = Readonly<{
  type: "reset-war-settings";
  secondaryPrefix: string;
}>;

const rivalOptions: readonly WarSettingsOption[] = Object.freeze([
  Object.freeze({ val: "Ignore", label: "Ignore", hint: "Does nothing" }),
  Object.freeze({
    val: "Influence",
    label: "Alliance",
    hint: "Influence rival up to best relations",
  }),
  Object.freeze({
    val: "Sabotage",
    label: "War",
    hint: "Sabotage and plunder rival",
  }),
  Object.freeze({
    val: "Betrayal",
    label: "Betrayal",
    hint: "Influence rival up to best relations, and start sabotaging. Once military power reached minimum - start plundering it",
  }),
]);

const protectOptions: readonly WarSettingsOption[] = Object.freeze([
  Object.freeze({
    val: "never",
    label: "Never",
    hint: "No additional limits to battalion size. Always send maximum soldiers allowed with current Max Advantage.",
  }),
  Object.freeze({
    val: "always",
    label: "Always",
    hint: "Limit battalions to sizes which will neven suffer any casualties in successful fights. You still will lose soldiers after failures, increasing minimum advantage can improve winning odds. This option designed to use with armored races favoring frequent attacks, with no approppriate build it may prevent any attacks from happening.",
  }),
  Object.freeze({
    val: "auto",
    label: "Auto",
    hint: "Tries to maximize total number of attacks, alternating between full and safe attacks based on soldiers condition, to get most from both healing and recruiting.",
  }),
]);

export function createWarSettingsReadModel(
  policyOptions: readonly WarSettingsOption[],
): WarSettingsReadModel {
  const controls: readonly WarSettingsControl[] = Object.freeze([
    Object.freeze({ kind: "header", label: "Foreign Powers" }),
    Object.freeze({
      kind: "toggle",
      settingName: "foreignPacifist",
      label: "Pacifist",
      hint: "Turns attacks off and on",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "foreignUnification",
      label: "Perform unification",
      hint: "Perform unification once all three powers are controlled. autoResearch should be enabled for this to work.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "foreignOccupyLast",
      label: "Occupy last foreign power",
      hint: "Occupy last foreign power once other two are controlled, and unification is researched to speed up unification. Disable if you want annex\\purchase achievements.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "foreignForceSabotage",
      label: "Sabotage foreign power when useful",
      hint: "Perform sabotage against current target if it's useful(power above 50), regardless of required power, and default action defined above",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "foreignTrainSpy",
      label: "Train spies",
      hint: "Train spies to use against foreign powers",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignSpyMax",
      label: "Maximum spies",
      hint: "Maximum spies per foreign power",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignPowerRequired",
      label: "Military Power to switch target",
      hint: "Switches to attack next foreign power once its power lowered down to this number. When exact numbers not know script tries to approximate it.",
    }),
    Object.freeze({
      kind: "select",
      settingName: "foreignPolicyInferior",
      label: "Inferior Power",
      hint: "Perform this against inferior foreign power, with military power equal or below given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.",
      options: policyOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "foreignPolicySuperior",
      label: "Superior Power",
      hint: "Perform this against superior foreign power, with military power above given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.",
      options: policyOptions,
    }),
    Object.freeze({
      kind: "select",
      settingName: "foreignPolicyRival",
      label: "Rival Power (The True Path)",
      hint: "Perform this against rival foreign power.",
      options: rivalOptions,
    }),
    Object.freeze({ kind: "header", label: "Campaigns" }),
    Object.freeze({
      kind: "number",
      settingName: "foreignAttackLivingSoldiersPercent",
      label: "Minimum percentage of alive soldiers for attack",
      hint: "Only attacks if you ALSO have the target battalion size of healthy soldiers available, so this setting will only take effect if your battalion does not include all of your soldiers",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignAttackHealthySoldiersPercent",
      label: "Minimum percentage of healthy soldiers for attack",
      hint: "Set to less than 100 to take advantage of being able to heal more soldiers in a game day than get wounded in a typical attack",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignHireMercMoneyStoragePercent",
      label: "Hire mercenary if money storage greater than percent",
      hint: "Hire a mercenary if remaining money after purchase will be greater than this percent",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignHireMercCostLowerThanIncome",
      label: "OR if cost lower than money earned in X seconds",
      hint: "Combines with the money storage percent setting to determine when to hire mercenaries",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignHireMercDeadSoldiers",
      label: "AND amount of dead soldiers above this number",
      hint: "Hire a mercenary only when current amount of dead soldiers above given number",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignMinAdvantage",
      label: "Minimum advantage",
      hint: "Minimum advantage to launch campaign, ignored during ambushes. 100% chance to win will be reached at approximately(influenced by traits and selected campaign) 75% advantage.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignMaxAdvantage",
      label: "Maximum advantage",
      hint: "Once campaign is selected, your battalion will be limited in size down to this advantage, reducing potential loses",
    }),
    Object.freeze({
      kind: "number",
      settingName: "foreignMaxSiegeBattalion",
      label: "Maximum siege battalion",
      hint: "Maximum battalion for siege campaign. Only try to siege if it's possible with up to given amount of soldiers. Siege is expensive, if you'll be doing it with too big battalion it might be less profitable than other combat campaigns. This option does not applied to unifying sieges, it affect only looting.",
    }),
    Object.freeze({
      kind: "select",
      settingName: "foreignProtect",
      label: "Protect soldiers",
      hint: "Configures safety of attacks. This option does not applies to unifying sieges, it affect only looting.",
      options: protectOptions,
    }),
  ]);
  return Object.freeze({
    sectionId: "war",
    sectionName: "Foreign Affairs",
    controls,
  });
}
