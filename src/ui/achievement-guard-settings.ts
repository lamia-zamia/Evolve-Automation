import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface AchievementGuardSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createAchievementGuardSettings({
  getDependency,
  getOverride,
}: AchievementGuardSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const document = liveObject(() => getDependency("document"));
  const resetAchievementGuardSettings = liveFunction(() =>
    getDependency("resetAchievementGuardSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildAchievementGuardSettingsImpl() {
    let sectionId = "achievementGuard";
    let sectionName = "Achievement Guard";

    let resetFunction = function () {
      resetAchievementGuardSettings(true);
      updateSettingsFromState();
      updateAchievementGuardSettingsContent();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateAchievementGuardSettingsContent,
    );
  }

  function updateAchievementGuardSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_achievementGuardContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "achievementGuards",
      "Enable achievement guards",
      "Constrain automation so the current run stays eligible for the guarded achievements below. Each guard arms only while its achievement is still unearned at the current star level in the current universe, and releases as soon as it's earned, already lost this run, or out of scope for the current prestige type.",
    );
    addSettingsToggle(
      currentNode,
      "guardPacifist",
      "Pacifist",
      "Never attack foreign powers. Also allows unification researches regardless of the 'Perform unification' toggle. Foreign policies must be set to Annex/Purchase for unification to actually happen without attacking.",
    );
    addSettingsToggle(
      currentNode,
      "guardDreaded",
      "Dreaded",
      "Never build a Dreadnought during ascension runs. If the Chthonian Mission outcome is set to Dreadnought, it will be executed as High losses instead.",
    );
    addSettingsToggle(
      currentNode,
      "guardCultOfPersonality",
      "Cult of Personality",
      "Never unify - blocks unification researches. Yields to the Pacifist guard while both are armed, since Pacifist requires unification.",
    );
    addSettingsToggle(
      currentNode,
      "guardAnarchist",
      "Anarchist",
      "Never set a government during MAD runs, staying in Anarchy until reset.",
    );
    addSettingsToggle(
      currentNode,
      "guardEnergetic",
      "Energetic",
      "Never build a Thermal Collector during ascension runs.",
    );
    addSettingsToggle(
      currentNode,
      "guardRedDead",
      "Red Dead",
      "Never build a Spaceport during MAD runs (Cataclysm scenario).",
    );
    addSettingsToggle(
      currentNode,
      "guardSecondEvolution",
      "Second Evolution",
      "Research Fanaticism instead of Anthropology while worshipping own species as gods.",
    );
    addSettingsToggle(
      currentNode,
      "guardBananaRepublic",
      "Banana Republic",
      "Block unification while the Banana Republic scenario still has unfinished objectives in the current universe, or while the 500 import and 500 export feat condition is still unmet. Also boosts World Collider and Monument weighting for unfinished Banana objectives.",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildAchievementGuardSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildAchievementGuardSettings") ??
      buildAchievementGuardSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateAchievementGuardSettingsContent(
    this: Loose,
    ...args: Loose[]
  ) {
    const implementation =
      getOverride("updateAchievementGuardSettingsContent") ??
      updateAchievementGuardSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return {
    buildAchievementGuardSettings,
    updateAchievementGuardSettingsContent,
  };
}
