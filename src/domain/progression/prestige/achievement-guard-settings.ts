/** Immutable description of the Achievement Guard settings panel. */
export interface AchievementGuardSettingsControl {
  readonly kind: "toggle";
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface AchievementGuardSettingsReadModel {
  readonly sectionId: "achievementGuard";
  readonly sectionName: "Achievement Guard";
  readonly controls: readonly AchievementGuardSettingsControl[];
}

export type AchievementGuardSettingsIntent = Readonly<{
  type: "reset-achievement-guard-settings";
}>;

const achievementGuardSettingsReadModel: AchievementGuardSettingsReadModel =
  Object.freeze({
    sectionId: "achievementGuard",
    sectionName: "Achievement Guard",
    controls: Object.freeze([
      Object.freeze({
        kind: "toggle",
        settingName: "achievementGuards",
        label: "Enable achievement guards",
        hint: "Constrain automation so the current run stays eligible for the guarded achievements below. Each guard arms only while its achievement is still unearned at the current star level in the current universe, and releases as soon as it's earned, already lost this run, or out of scope for the current prestige type.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardPacifist",
        label: "Pacifist",
        hint: "Never attack foreign powers. Also allows unification researches regardless of the 'Perform unification' toggle. Foreign policies must be set to Annex/Purchase for unification to actually happen without attacking.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardDreaded",
        label: "Dreaded",
        hint: "Never build a Dreadnought during ascension runs. If the Chthonian Mission outcome is set to Dreadnought, it will be executed as High losses instead.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardCultOfPersonality",
        label: "Cult of Personality",
        hint: "Never unify - blocks unification researches. Yields to the Pacifist guard while both are armed, since Pacifist requires unification.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardAnarchist",
        label: "Anarchist",
        hint: "Never set a government during MAD runs, staying in Anarchy until reset.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardEnergetic",
        label: "Energetic",
        hint: "Never build a Thermal Collector during ascension runs.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardRedDead",
        label: "Red Dead",
        hint: "Never build a Red Spaceport during Whitehole or Vacuum Collapse runs, unless an active Pacifist, World Domination, or Syndicate guard needs it to unlock unification.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardSecondEvolution",
        label: "Second Evolution",
        hint: "Research Fanaticism instead of Anthropology while worshipping own species as gods.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardWorldDomination",
        label: "World Domination",
        hint: "While unearned and still possible, prefer Occupy for the three core foreign powers. Existing foreign policy settings resume if the path is lost or the achievement is earned. If both World Domination and Syndicate are enabled on a clean slate, World Domination is selected.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardSyndicate",
        label: "Syndicate",
        hint: "While unearned and still possible, prefer Purchase for the three core foreign powers. Existing foreign policy settings resume if the path is lost or the achievement is earned. Disable World Domination to select Syndicate from a clean slate.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardTradeFederation",
        label: "Trade Federation",
        hint: "When Trade Federation is still unearned and 750 city plus 50 galactic trade routes are already active, temporarily switch to Federation without changing route allocation. The preferred government resumes afterward.",
      }),
      Object.freeze({
        kind: "toggle",
        settingName: "guardBananaRepublic",
        label: "Banana Republic",
        hint: "Block unification while the Banana Republic scenario still has unfinished objectives in the current universe, or while the 500 import and 500 export feat condition is still unmet. Also boosts World Collider and Monument weighting for unfinished Banana objectives.",
      }),
    ]),
  });

export function getAchievementGuardSettingsReadModel(): AchievementGuardSettingsReadModel {
  return achievementGuardSettingsReadModel;
}
