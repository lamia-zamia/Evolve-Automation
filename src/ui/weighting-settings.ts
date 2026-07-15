import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface WeightingSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createWeightingSettings({
  getDependency,
  getOverride,
}: WeightingSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const document = liveObject(() => getDependency("document"));
  const resetWeightingSettings = liveFunction(() =>
    getDependency("resetWeightingSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildWeightingSettingsImpl() {
    let sectionId = "weighting";
    let sectionName = "AutoBuild Weighting";

    let resetFunction = function () {
      resetWeightingSettings(true);
      updateSettingsFromState();
      updateWeightingSettingsContent();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateWeightingSettingsContent,
    );
  }

  function updateWeightingSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_weightingContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "buildingBuildIfStorageFull",
      "Ignore weighting and build if any storage is full",
      "Ignore weighting and immediately construct building if it uses any capped resource, preventing wasting them by overflowing. Weight still need to be positive(above zero) for this to happen.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Target</th>
              <th class="has-text-warning" style="width:60%">Condition</th>
              <th class="has-text-warning" style="width:10%">Multiplier</th>
            </tr>
            <tbody id="script_weightingTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_weightingTableBody");

    addWeightingRule(
      tableBodyNode,
      "Any",
      "New building",
      "buildingWeightingNew",
    );
    addWeightingRule(
      tableBodyNode,
      "Powered building",
      "Low available energy",
      "buildingWeightingUnderpowered",
    );
    addWeightingRule(
      tableBodyNode,
      "Power plant",
      "Low available energy",
      "buildingWeightingNeedfulPowerPlant",
    );
    addWeightingRule(
      tableBodyNode,
      "Power plant",
      "Producing more energy than required",
      "buildingWeightingUselessPowerPlant",
    );
    addWeightingRule(
      tableBodyNode,
      "Knowledge storage",
      "Have unaffordable researches or build targets",
      "buildingWeightingNeedfulKnowledge",
    );
    addWeightingRule(
      tableBodyNode,
      "Knowledge storage",
      "All researches and build targets already affordable",
      "buildingWeightingUselessKnowledge",
    );
    addWeightingRule(
      tableBodyNode,
      "Building with state (city)",
      "Some instances of this building are not working",
      "buildingWeightingNonOperatingCity",
    );
    addWeightingRule(
      tableBodyNode,
      "Building with state (space)",
      "Some instances of this building are not working",
      "buildingWeightingNonOperating",
    );
    addWeightingRule(
      tableBodyNode,
      "Building with consumption",
      "Missing consumables to operate",
      "buildingWeightingMissingSupply",
    );
    addWeightingRule(
      tableBodyNode,
      "Support consumer",
      "Missing support to operate",
      "buildingWeightingMissingSupport",
    );
    addWeightingRule(
      tableBodyNode,
      "Support provider",
      "Provided support not currently needed",
      "buildingWeightingUselessSupport",
    );
    addWeightingRule(
      tableBodyNode,
      "All fuel depots",
      "Missing Oil or Helium for techs and missions",
      "buildingWeightingMissingFuel",
    );
    addWeightingRule(
      tableBodyNode,
      "Not housing, barrack, oil derrick, or knowledge building",
      "MAD prestige enabled, and affordable",
      "buildingWeightingMADUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Mass Ejector",
      "Existed ejectors not fully utilized",
      "buildingWeightingUnusedEjectors",
    );
    addWeightingRule(
      tableBodyNode,
      "Freight Yard, Container Port, Munitions Depot",
      "Have unused crates or containers",
      "buildingWeightingCrateUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Horseshoes",
      "No more Horseshoes needed",
      "buildingWeightingHorseshoeUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Meditation Chamber",
      "No more Meditation Space needed",
      "buildingWeightingZenUseless",
    );
    addWeightingRule(
      tableBodyNode,
      "Gate Turret",
      "Gate demons fully supressed",
      "buildingWeightingGateTurret",
    );
    addWeightingRule(
      tableBodyNode,
      "Warehouses, Garage, Cargo Yard, Storehouse",
      "Need more storage",
      "buildingWeightingNeedStorage",
    );
    addWeightingRule(
      tableBodyNode,
      "Housing",
      "Less than 90% of houses are used",
      "buildingWeightingUselessHousing",
    );
    addWeightingRule(
      tableBodyNode,
      "Orbital Decay",
      "City and Moon buildings",
      "buildingWeightingTemporal",
    );
    addWeightingRule(
      tableBodyNode,
      "The True Path",
      "Solar buildings after reaching Tau Ceti",
      "buildingWeightingSolar",
    );
    addWeightingRule(
      tableBodyNode,
      "Eris Control Relays, Tanks, and Android Troopers",
      "The True Path Digsite is not yet secured",
      "buildingWeightingTruepathDigsite",
    );
    addWeightingRule(
      tableBodyNode,
      "Womlings Missions",
      "Womlings unlock actions conflicting with Overlord",
      "buildingWeightingOverlord",
    );
    addWeightingRule(
      tableBodyNode,
      "Banana Republic objectives",
      "World Collider and Monuments while their objectives are unfinished",
      "buildingWeightingBananaObjective",
    );
    addWeightingRule(
      tableBodyNode,
      "Inflation Money helpers",
      "Money storage until $250B cap is reachable, then Money income",
      "buildingWeightingInflationMoney",
    );
    addWeightingRule(
      tableBodyNode,
      "Retirement preparation",
      "Tau Fusion Generators, Factories, and Disease Labs below the pre-Isolation targets",
      "buildingWeightingRetirementPrep",
    );
    addWeightingRule(
      tableBodyNode,
      "Authority cap buildings (Evil universe)",
      "Authority cap below configured minimum",
      "buildingWeightingAuthority",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function addWeightingRuleImpl(table, targetName, conditionDesc, settingKey) {
    let ruleNode = $(`
          <tr>
            <td style="width:30%"><span class="has-text-info">${targetName}</span></td>
            <td style="width:60%"><span class="has-text-info">${conditionDesc}</span></td>
            <td style="width:10%"></td>
          </tr>`);
    addTableInput(ruleNode.find("td:eq(2)"), settingKey);
    table.append(ruleNode);
  }

  function buildWeightingSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildWeightingSettings") ?? buildWeightingSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateWeightingSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateWeightingSettingsContent") ??
      updateWeightingSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function addWeightingRule(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("addWeightingRule") ?? addWeightingRuleImpl;
    return implementation.apply(this, args);
  }

  return {
    buildWeightingSettings,
    updateWeightingSettingsContent,
    addWeightingRule,
  };
}
