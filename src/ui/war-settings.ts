import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface WarSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createWarSettings({
  getDependency,
  getOverride,
}: WarSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const SpyManager = liveObject(() => getDependency("SpyManager"));
  const addSettingsHeader1 = liveFunction(() =>
    getDependency("addSettingsHeader1"),
  );
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildSettingsSection2 = liveFunction(() =>
    getDependency("buildSettingsSection2"),
  );
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetWarSettings = liveFunction(() =>
    getDependency("resetWarSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildWarSettingsImpl(parentNode, secondaryPrefix) {
    let sectionId = "war";
    let sectionName = "Foreign Affairs";

    let resetFunction = function () {
      resetWarSettings(true);
      updateSettingsFromState();
      updateWarSettingsContent(secondaryPrefix);

      resetCheckbox("autoFight");
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updateWarSettingsContent,
    );
  }

  function updateWarSettingsContentImpl(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}warContent`);
    currentNode.empty().off("*");

    addSettingsHeader1(currentNode, "Foreign Powers");
    addSettingsToggle(
      currentNode,
      "foreignPacifist",
      "Pacifist",
      "Turns attacks off and on",
    );

    addSettingsToggle(
      currentNode,
      "foreignUnification",
      "Perform unification",
      "Perform unification once all three powers are controlled. autoResearch should be enabled for this to work.",
    );
    addSettingsToggle(
      currentNode,
      "foreignOccupyLast",
      "Occupy last foreign power",
      "Occupy last foreign power once other two are controlled, and unification is researched to speed up unification. Disable if you want annex\\purchase achievements.",
    );
    addSettingsToggle(
      currentNode,
      "foreignForceSabotage",
      "Sabotage foreign power when useful",
      "Perform sabotage against current target if it's useful(power above 50), regardless of required power, and default action defined above",
    );
    addSettingsToggle(
      currentNode,
      "foreignTrainSpy",
      "Train spies",
      "Train spies to use against foreign powers",
    );
    addSettingsNumber(
      currentNode,
      "foreignSpyMax",
      "Maximum spies",
      "Maximum spies per foreign power",
    );

    addSettingsNumber(
      currentNode,
      "foreignPowerRequired",
      "Military Power to switch target",
      "Switches to attack next foreign power once its power lowered down to this number. When exact numbers not know script tries to approximate it.",
    );

    let policyOptions = [
      { val: "Ignore", label: "Ignore", hint: "" },
      ...(Object.entries(SpyManager.Types) as Array<[string, Loose]>).map(
        ([name, task]) => ({
          val: name,
          label: game.loc("civics_spy_" + task.id),
          hint: "",
        }),
      ),
      { val: "Occupy", label: "Occupy", hint: "" },
    ];
    addSettingsSelect(
      currentNode,
      "foreignPolicyInferior",
      "Inferior Power",
      "Perform this against inferior foreign power, with military power equal or below given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.",
      policyOptions,
    );
    addSettingsSelect(
      currentNode,
      "foreignPolicySuperior",
      "Superior Power",
      "Perform this against superior foreign power, with military power above given threshold. Complex actions includes required preparation - Annex and Purchase will incite and influence, Occupy will sabotage, until said options will be available.",
      policyOptions,
    );

    let rivalOptions = [
      { val: "Ignore", label: "Ignore", hint: "Does nothing" },
      {
        val: "Influence",
        label: "Alliance",
        hint: "Influence rival up to best relations",
      },
      { val: "Sabotage", label: "War", hint: "Sabotage and plunder rival" },
      {
        val: "Betrayal",
        label: "Betrayal",
        hint: "Influence rival up to best relations, and start sabotaging. Once military power reached minimum - start plundering it",
      },
    ];
    addSettingsSelect(
      currentNode,
      "foreignPolicyRival",
      "Rival Power (The True Path)",
      "Perform this against rival foreign power.",
      rivalOptions,
    );

    // Campaign panel
    addSettingsHeader1(currentNode, "Campaigns");
    addSettingsNumber(
      currentNode,
      "foreignAttackLivingSoldiersPercent",
      "Minimum percentage of alive soldiers for attack",
      "Only attacks if you ALSO have the target battalion size of healthy soldiers available, so this setting will only take effect if your battalion does not include all of your soldiers",
    );
    addSettingsNumber(
      currentNode,
      "foreignAttackHealthySoldiersPercent",
      "Minimum percentage of healthy soldiers for attack",
      "Set to less than 100 to take advantage of being able to heal more soldiers in a game day than get wounded in a typical attack",
    );
    addSettingsNumber(
      currentNode,
      "foreignHireMercMoneyStoragePercent",
      "Hire mercenary if money storage greater than percent",
      "Hire a mercenary if remaining money after purchase will be greater than this percent",
    );
    addSettingsNumber(
      currentNode,
      "foreignHireMercCostLowerThanIncome",
      "OR if cost lower than money earned in X seconds",
      "Combines with the money storage percent setting to determine when to hire mercenaries",
    );
    addSettingsNumber(
      currentNode,
      "foreignHireMercDeadSoldiers",
      "AND amount of dead soldiers above this number",
      "Hire a mercenary only when current amount of dead soldiers above given number",
    );

    addSettingsNumber(
      currentNode,
      "foreignMinAdvantage",
      "Minimum advantage",
      "Minimum advantage to launch campaign, ignored during ambushes. 100% chance to win will be reached at approximately(influenced by traits and selected campaign) 75% advantage.",
    );
    addSettingsNumber(
      currentNode,
      "foreignMaxAdvantage",
      "Maximum advantage",
      "Once campaign is selected, your battalion will be limited in size down to this advantage, reducing potential loses",
    );
    addSettingsNumber(
      currentNode,
      "foreignMaxSiegeBattalion",
      "Maximum siege battalion",
      "Maximum battalion for siege campaign. Only try to siege if it's possible with up to given amount of soldiers. Siege is expensive, if you'll be doing it with too big battalion it might be less profitable than other combat campaigns. This option does not applied to unifying sieges, it affect only looting.",
    );

    let protectOptions = [
      {
        val: "never",
        label: "Never",
        hint: "No additional limits to battalion size. Always send maximum soldiers allowed with current Max Advantage.",
      },
      {
        val: "always",
        label: "Always",
        hint: "Limit battalions to sizes which will neven suffer any casualties in successful fights. You still will lose soldiers after failures, increasing minimum advantage can improve winning odds. This option designed to use with armored races favoring frequent attacks, with no approppriate build it may prevent any attacks from happening.",
      },
      {
        val: "auto",
        label: "Auto",
        hint: "Tries to maximize total number of attacks, alternating between full and safe attacks based on soldiers condition, to get most from both healing and recruiting.",
      },
    ];
    addSettingsSelect(
      currentNode,
      "foreignProtect",
      "Protect soldiers",
      "Configures safety of attacks. This option does not applies to unifying sieges, it affect only looting.",
      protectOptions,
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildWarSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildWarSettings") ?? buildWarSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateWarSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateWarSettingsContent") ?? updateWarSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildWarSettings, updateWarSettingsContent };
}
