/** Immutable description of the Challenge Helper settings panel. */
export interface ChallengeHelperSettingsControl {
  readonly kind: "toggle" | "number";
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface ChallengeHelperSettingsReadModel {
  readonly sectionId: "challengeHelper";
  readonly sectionName: "Challenge Helper";
  readonly controls: readonly ChallengeHelperSettingsControl[];
}

export type ChallengeHelperSettingsIntent = Readonly<{
  type: "reset-challenge-helper-settings";
}>;

const challengeHelperSettingsReadModel: ChallengeHelperSettingsReadModel =
  Object.freeze({
    sectionId: "challengeHelper",
    sectionName: "Challenge Helper",
    controls: Object.freeze([
      Object.freeze({
        kind: "toggle",
        settingName: "inflationChallengeAssist",
        label: "Inflation challenge",
        hint: "During Inflation, demand the $250B Wheelbarrow target, boost Money storage or income buildings as appropriate, and stop optional Money spending once the target can be reached soon.",
      }),
      Object.freeze({
        kind: "number",
        settingName: "inflationChallengeSaveMinutes",
        label: "Inflation save-up minutes",
        hint: "When the $250B target is reachable within this many real-time minutes at current Money income, stop optional Money spending and imports until Wheelbarrow is earned. Set negative to disable the final save-up freeze while keeping the helper's weighting and demand.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "retirementChallengeAssist",
        label: "Retirement preparation",
        hint: "When the selected prestige is Retirement, boost the recommended pre-Isolation Tau buildings, reserve and stockpile 200M Graphene, and block Isolation Protocol until there are 20 Fusion Generators, 18 Factories, 11 Disease Labs, and the Graphene stockpile. Disable this to manage the irreversible transition manually.",
      }),
    ]),
  });

export function getChallengeHelperSettingsReadModel(): ChallengeHelperSettingsReadModel {
  return challengeHelperSettingsReadModel;
}
