import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface ChallengeHelperSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createChallengeHelperSettings({
  getDependency,
  getOverride,
}: ChallengeHelperSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const document = liveObject(() => getDependency("document"));
  const resetChallengeHelperSettings = liveFunction(() =>
    getDependency("resetChallengeHelperSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildChallengeHelperSettingsImpl() {
    let sectionId = "challengeHelper";
    let sectionName = "Challenge Helper";

    let resetFunction = function () {
      resetChallengeHelperSettings(true);
      updateSettingsFromState();
      updateChallengeHelperSettingsContent();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateChallengeHelperSettingsContent,
    );
  }

  function updateChallengeHelperSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_challengeHelperContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "inflationChallengeAssist",
      "Inflation challenge",
      "During Inflation, demand the $250B Wheelbarrow target, boost Money storage or income buildings as appropriate, and stop optional Money spending once the target can be reached soon.",
    );
    addSettingsNumber(
      currentNode,
      "inflationChallengeSaveMinutes",
      "Inflation save-up minutes",
      "When the $250B target is reachable within this many real-time minutes at current Money income, stop optional Money spending and imports until Wheelbarrow is earned. Set negative to disable the final save-up freeze while keeping the helper's weighting and demand.",
    );
    addSettingsToggle(
      currentNode,
      "retirementChallengeAssist",
      "Retirement preparation",
      "When the selected prestige is Retirement, boost the recommended pre-Isolation Tau buildings, reserve and stockpile 200M Graphene, and block Isolation Protocol until there are 20 Fusion Generators, 18 Factories, 11 Disease Labs, and the Graphene stockpile. Disable this to manage the irreversible transition manually.",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildChallengeHelperSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildChallengeHelperSettings") ??
      buildChallengeHelperSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateChallengeHelperSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateChallengeHelperSettingsContent") ??
      updateChallengeHelperSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildChallengeHelperSettings, updateChallengeHelperSettingsContent };
}
