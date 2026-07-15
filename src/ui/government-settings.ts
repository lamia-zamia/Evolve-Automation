import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface GovernmentSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createGovernmentSettings({
  getDependency,
  getOverride,
}: GovernmentSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const GovernmentManager = liveObject(() =>
    getDependency("GovernmentManager"),
  );
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const buildSettingsSection2 = liveFunction(() =>
    getDependency("buildSettingsSection2"),
  );
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const governors = liveObject(() => getDependency("governors"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetGovernmentSettings = liveFunction(() =>
    getDependency("resetGovernmentSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildGovernmentSettingsImpl(parentNode, secondaryPrefix) {
    let sectionId = "government";
    let sectionName = "Government";

    let resetFunction = function () {
      resetGovernmentSettings(true);
      updateSettingsFromState();
      updateGovernmentSettingsContent(secondaryPrefix);

      resetCheckbox("autoTax", "autoGovernment");
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updateGovernmentSettingsContent,
    );
  }

  function updateGovernmentSettingsContentImpl(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}governmentContent`);
    currentNode.empty().off("*");

    addSettingsNumber(
      currentNode,
      "generalRequestedTaxRate",
      "Forced tax rate",
      "Set tax rate as close to this value as possible, ignores morale. Set to -1 to disable this option",
    );
    addSettingsNumber(
      currentNode,
      "generalMinimumTaxRate",
      "Minimum allowed tax rate",
      "Minimum tax rate for autoTax. Will still go below this amount if money storage is full",
    );
    addSettingsNumber(
      currentNode,
      "generalMinimumMorale",
      "Minimum allowed morale",
      "Use this to set a minimum allowed morale. Remember that less than 100% can cause riots and weather can cause sudden swings",
    );
    addSettingsNumber(
      currentNode,
      "generalMaximumMorale",
      "Maximum allowed morale",
      "Use this to set a maximum allowed morale. The tax rate will be raised to lower morale to this maximum",
    );
    let governmentOptions = [
      { val: "none", label: "None", hint: "Do not select government" },
      ...(Object.values(GovernmentManager.Types) as Loose[])
        .filter((g) => g.selectable !== false)
        .map((g) => ({
          val: g.id,
          label: game.loc(`govern_${g.id}`),
          hint: game.loc(`govern_${g.id}_desc`),
        })),
    ];
    addSettingsSelect(
      currentNode,
      "govInterim",
      "Interim Government",
      "Temporary low tier government until you research other governments",
      governmentOptions,
    );
    addSettingsSelect(
      currentNode,
      "govFinal",
      "Second Government",
      "Second government choice, chosen once becomes available. Can be the same as above",
      governmentOptions,
    );
    addSettingsSelect(
      currentNode,
      "govSpace",
      "Space Government",
      "Government for bioseed+. Chosen once you researched Quantum Manufacturing. Can be the same as above",
      governmentOptions,
    );

    let governorsOptions = [
      { val: "none", label: "None", hint: "Do not select governor" },
      ...governors.map((id) => ({
        val: id,
        label: game.loc(`governor_${id}`),
        hint: game.loc(`governor_${id}_desc`),
      })),
    ];
    addSettingsSelect(
      currentNode,
      "govGovernor",
      "Governor",
      "Chosen governor will be appointed.",
      governorsOptions,
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildGovernmentSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildGovernmentSettings") ?? buildGovernmentSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateGovernmentSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateGovernmentSettingsContent") ??
      updateGovernmentSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildGovernmentSettings, updateGovernmentSettingsContent };
}
