import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface GeneralSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createGeneralSettings({
  getDependency,
  getOverride,
}: GeneralSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsHeader1 = liveFunction(() =>
    getDependency("addSettingsHeader1"),
  );
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsString = liveFunction(() =>
    getDependency("addSettingsString"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const document = liveObject(() => getDependency("document"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetGeneralSettings = liveFunction(() =>
    getDependency("resetGeneralSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildGeneralSettingsImpl() {
    let sectionId = "general";
    let sectionName = "General";

    let resetFunction = function () {
      resetGeneralSettings(true);
      updateSettingsFromState();
      updateGeneralSettingsContent();

      resetCheckbox("masterScriptToggle", "showSettings", "autoPrestige");
      // No need to call showSettings callback, it enabled if button was pressed, and will be still enabled on default settings
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateGeneralSettingsContent,
    );
  }

  function updateGeneralSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_generalContent");
    currentNode.empty().off("*");

    addSettingsNumber(
      currentNode,
      "tickRate",
      "Script tick rate",
      "Script runs once per this amount of game ticks. Game tick every 250ms, thus with rate 4 script will run once per second. You can set it lower to make script act faster, or increase it if you have performance issues. Tick rate should be a positive integer.",
    );
    addSettingsToggle(
      currentNode,
      "tickSchedule",
      "Schedule script ticks",
      "When enabled script will schedule its ticks to run after game ticks, instead of executing both at once. Splitting of long task allows browser to update UI in between of game and script ticks, making game run smoother, but less throttling-proof - that can make tick rate float inconsistently.",
    );

    addSettingsHeader1(currentNode, "Prioritization");
    let priority = [
      { val: "ignore", label: "Ignore", hint: "Does nothing" },
      {
        val: "save",
        label: "Save",
        hint: "Missing resources preserved from using.",
      },
      {
        val: "req",
        label: "Request",
        hint: "Production and buying of missing resources will be prioritized.",
      },
      {
        val: "savereq",
        label: "Request & Save",
        hint: "Missing resources will be prioritized, and preserved from using.",
      },
    ];

    addSettingsToggle(
      currentNode,
      "useDemanded",
      "Allow using prioritized resources for crafting",
      "When disabled script won't make craftables out of prioritized resources in foundry and factory.",
    );
    addSettingsToggle(
      currentNode,
      "researchRequest",
      "Prioritize resources for Pre-MAD researches",
      "Readjust trade routes and production to resources required for unlocked and affordable researches. Works only with no active triggers, or queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoMine, autoExtractor, autoSmelter).",
    );
    addSettingsToggle(
      currentNode,
      "researchRequestSpace",
      "Prioritize resources for Space+ researches",
      "Readjust trade routes and production to resources required for unlocked and affordable researches. Works only with no active triggers, or queue. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoMine, autoExtractor, autoSmelter).",
    );
    addSettingsToggle(
      currentNode,
      "missionRequest",
      "Prioritize resources for missions",
      "Readjust trade routes and production to resources required for unlocked and affordable missions. Missing resources will have 100 priority where applicable(autoMarket, autoGalaxyMarket, autoFactory, autoMiningDroid), or just 'top priority' where not(autoTax, autoCraft, autoCraftsmen, autoQuarry, autoMine, autoExtractor, autoSmelter).",
    );

    addSettingsSelect(
      currentNode,
      "prioritizeQueue",
      "Queue",
      "Alter script behaviour to speed up queued items, prioritizing missing resources.",
      priority,
    );
    addSettingsSelect(
      currentNode,
      "prioritizeTriggers",
      "Triggers",
      "Alter script behaviour to speed up triggers, prioritizing missing resources.",
      priority,
    );
    addSettingsSelect(
      currentNode,
      "prioritizeUnify",
      "Unification",
      "Alter script behaviour to speed up unification, prioritizing money required to purchase foreign cities.",
      priority,
    );
    addSettingsSelect(
      currentNode,
      "prioritizeOuterFleet",
      "Ship Yard Blueprint (The True Path)",
      "Alter script behaviour to assist fleet building, prioritizing resources required for current design of ship.",
      priority,
    );

    addSettingsHeader1(currentNode, "Auto clicker");
    addSettingsToggle(
      currentNode,
      "buildingAlwaysClick",
      "Always autoclick resources",
      "By default script will click only during early stage of autoBuild, to bootstrap production. With this toggled on it will continue clicking forever",
    );
    addSettingsNumber(
      currentNode,
      "buildingClickPerTick",
      "Maximum clicks per tick",
      "Number of clicks performed at once, each script tick. Will not ever click more than needed to fill storage.",
    );

    addSettingsHeader1(currentNode, "Misc");
    addSettingsString(
      currentNode,
      "scriptSettingsExportFilename",
      "Export Filename",
      "Configures the filename used when using the 'Script Settings as File' button. This is useful if you keep multiple different profiles around.",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildGeneralSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildGeneralSettings") ?? buildGeneralSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateGeneralSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateGeneralSettingsContent") ??
      updateGeneralSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildGeneralSettings, updateGeneralSettingsContent };
}
