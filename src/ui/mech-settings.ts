import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface MechSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createMechSettings({
  getDependency,
  getOverride,
}: MechSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const MechManager = liveObject(() => getDependency("MechManager"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addStandardHeading = liveFunction(() =>
    getDependency("addStandardHeading"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const calculateMechStats = liveFunction(() =>
    getDependency("calculateMechStats"),
  );
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const removeMechInfo = liveFunction(() => getDependency("removeMechInfo"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetMechSettings = liveFunction(() =>
    getDependency("resetMechSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildMechSettingsImpl() {
    let sectionId = "mech";
    let sectionName = "Mech & Spire";

    let resetFunction = function () {
      resetMechSettings(true);
      updateSettingsFromState();
      updateMechSettingsContent();

      resetCheckbox("autoMech");
      removeMechInfo();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateMechSettingsContent,
    );
  }

  function updateMechSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_mechContent");
    currentNode.empty().off("*");

    let scrapOptions = [
      {
        val: "none",
        label: "None",
        hint: "Nothing will be scrapped automatically",
      },
      {
        val: "single",
        label: "Full bay",
        hint: "Scrap mechs only when mech bay is full, and script need more room to build mechs",
      },
      {
        val: "all",
        label: "All inefficient",
        hint: "Scrap all inefficient mechs immediately, using refounded resources to build better ones",
      },
      {
        val: "mixed",
        label: "Excess inefficient",
        hint: "Scrap as much inefficient mechs as possible, trying to preserve just enough of old mechs to fill bay to max by the time when next floor will be reached, calculating threshold based on progress speed and resources incomes",
      },
    ];
    addSettingsSelect(
      currentNode,
      "mechScrap",
      "Scrap mechs",
      "Configures what will be scrapped. Infernal mechs won't ever be scrapped.",
      scrapOptions,
    );
    addSettingsNumber(
      currentNode,
      "mechScrapEfficiency",
      "Scrap efficiency",
      "Scrap mechs only when '((OldMechRefund / NewMechCost) / (OldMechDamage / NewMechDamage))' more than given number.&#xA;For the cases when exchanged mechs have same size(1/3 refund) it means that with 1 eff. script allowed to scrap mechs under 33.3%. 1.5 eff. - under 22.2%, 2 eff. - under 16.6%, 0.5 eff. - under 66.6%, 0 eff. - under 100%, etc.&#xA;Efficiency below '1' is not recommended, unless scrap set to 'Full bay', as it's a breakpoint when refunded resources can immidiately compensate lost damage, resulting with best damage growth rate.&#xA;Efficiency above '1' is useful to save resources for more desperate times, or to compensate low soul gems income.",
    );
    addSettingsNumber(
      currentNode,
      "mechCollectorValue",
      "Collector value",
      "Collectors can't be directly compared with combat mechs, having no firepower. Script will assume that one collector/size is equal to this amount of scout/size. If you feel that script is too reluctant to scrap old collectors - you can decrease this value. Or increase, to make them more persistant. 1 value - 50% collector equial to 50% scout, 0.5 value - 50% collector equial to 25% scout, 2 value - 50% collector equial to 100% scout, etc.",
    );

    let buildOptions = [
      {
        val: "none",
        label: "None",
        hint: "Nothing will be build automatically",
      },
      {
        val: "random",
        label: "Random good",
        hint: "Build random mech with size chosen below, and best possible efficiency",
      },
      {
        val: "user",
        label: "Current design",
        hint: "Build whatever currently set in Mech Lab",
      },
    ];
    addSettingsSelect(
      currentNode,
      "mechBuild",
      "Build mechs",
      "Configures what will be built. Infernal mechs won't ever be built.",
      buildOptions,
    );

    // TODO: Make auto truly auto - some way to pick best "per x", depends on current bottleneck
    let sizeOptions = [
      {
        val: "auto",
        label: "Damage Per Size",
        hint: "Select affordable mech with most damage per size on current floor",
      },
      {
        val: "gems",
        label: "Damage Per Gems",
        hint: "Select affordable mech with most damage per gems on current floor",
      },
      {
        val: "supply",
        label: "Damage Per Supply",
        hint: "Select affordable mech with most damage per supply on current floor",
      },
      ...MechManager.Size.map((id) => ({
        val: id,
        label: game.loc(`portal_mech_size_${id}`),
        hint: game.loc(`portal_mech_size_${id}_desc`),
      })),
    ];
    addSettingsSelect(
      currentNode,
      "mechSize",
      "Preferred mech size",
      "Size of random mechs",
      sizeOptions,
    );
    addSettingsSelect(
      currentNode,
      "mechSizeGravity",
      "Gravity mech size",
      "Override preferred size with this on floors with high gravity",
      sizeOptions,
    );

    let specialOptions = [
      {
        val: "always",
        label: "Always",
        hint: "Add special equipment to all mechs",
      },
      {
        val: "prefered",
        label: "Preferred",
        hint: "Add special equipment when it doesn't reduce efficiency for current floor",
      },
      {
        val: "random",
        label: "Random",
        hint: "Special equipment will have same chance to be added as all others",
      },
      { val: "never", label: "Never", hint: "Never add special equipment" },
    ];
    addSettingsSelect(
      currentNode,
      "mechSpecial",
      "Special mechs",
      "Configures special equip",
      specialOptions,
    );
    addSettingsNumber(
      currentNode,
      "mechWaygatePotential",
      "Maximum mech potential for Waygate",
      "Fight Demon Lord only when current mech team potential below given amount. Full bay of best mechs will have `1` potential. Damage against Demon Lord does not affected by floor modifiers, all mechs always does 100% damage to him. Thus it's most time-efficient to fight him at times when mechs can't make good progress against regular monsters, and waiting for rebuilding. Auto Power needs to be on for this to work.",
    );
    addSettingsNumber(
      currentNode,
      "mechMinSupply",
      "Minimum supply income",
      "Build collectors if current supply income below given number",
    );
    addSettingsNumber(
      currentNode,
      "mechMaxCollectors",
      "Maximum collectors ratio",
      "Limiter for above option, maximum space used by collectors. 0.5 means up to 50% of total bay capacity will be dedicated to collectors, and such.",
    );
    addSettingsNumber(
      currentNode,
      "mechSaveSupplyRatio",
      "Save up supplies for next floor",
      "Ratio of supplies to save up for next floor. Script will stop spending supplies on new mechs when it estimates that by the time when floor will be cleared you'll be under this supply ratio. That allows build bunch of new mechs suited for next enemy right after entering new floor. With 1 value script will try to start new floors with full supplies, 0.5 - with half, 0 - any, effectively disabling this option, etc.",
    );
    addSettingsNumber(
      currentNode,
      "mechScouts",
      "Minimum scouts ratio",
      "Scouts compensate terrain penalty of suboptimal mechs. Build them up to this ratio.",
    );
    addSettingsToggle(
      currentNode,
      "mechInfernalCollector",
      "Build infernal collectors",
      "Infernal collectors have incresed supply cost, and payback time, but becomes more profitable after ~30 minutes of uptime.",
    );
    addSettingsToggle(
      currentNode,
      "mechScoutsRebuild",
      "Rebuild scouts",
      "Scouts provides full bonus to other mechs even being infficient, this option prevent rebuilding them saving resources.",
    );
    addSettingsToggle(
      currentNode,
      "mechFillBay",
      "Build smaller mechs when preferred not available",
      "Build smaller mechs when preferred size can't be used due to low remaining bay space, or supplies cap",
    );
    addSettingsToggle(
      currentNode,
      "buildingMechsFirst",
      "Build spire buildings only with full bay",
      "Fill mech bays up to current limit before spending resources on additional spire buildings",
    );
    addSettingsToggle(
      currentNode,
      "mechBaysFirst",
      "Scrap mechs only after building maximum bays",
      "Scrap old mechs only when no new bays and purifiers can be builded",
    );

    addStandardHeading(currentNode, "Mech Stats");
    let statsControls = $(
      `<div style="margin-top: 5px; display: inline-flex;"></div>`,
    );
    Object.entries({
      Compact: true,
      Efficient: true,
      Special: true,
      Gravity: false,
    }).forEach(([option, value]) => {
      statsControls.append(`
              <label class="switch" title="This switch have no ingame effect, and used to configure calculator below">
                <input id="script_mechStats${option}" type="checkbox"${
                  value ? " checked" : ""
                }>
                <span class="check"></span><span style="margin-left: 10px;">${option}</span>
              </label>`);
    });
    statsControls.append(`
          <label class="switch" title="This input have no ingame effect, and used to configure calculator below">
            <input id="script_mechStatsScouts" class="input is-small" style="height: 25px; width: 50px" type="text" value="0">
            <span style="margin-left: 10px;">Scouts</span>
          </label>`);
    statsControls.on("input", calculateMechStats);
    currentNode.append(statsControls);
    currentNode.append(
      `<table class="selectable"><tbody id="script_mechStatsTable"><tbody></table>`,
    );
    calculateMechStats();

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildMechSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildMechSettings") ?? buildMechSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateMechSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateMechSettingsContent") ?? updateMechSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildMechSettings, updateMechSettingsContent };
}
