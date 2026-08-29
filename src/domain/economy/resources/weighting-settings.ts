/** Immutable description of the AutoBuild Weighting settings panel. */
export interface WeightingSettingsControl {
  readonly kind: "toggle";
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface WeightingSettingsRule {
  readonly target: string;
  readonly condition: string;
  readonly settingName: string;
}

export interface WeightingSettingsReadModel {
  readonly sectionId: "weighting";
  readonly sectionName: "AutoBuild Weighting";
  readonly controls: readonly WeightingSettingsControl[];
  readonly rules: readonly WeightingSettingsRule[];
}

export type WeightingSettingsIntent = Readonly<{
  type: "reset-weighting-settings";
}>;

const weightingSettingsReadModel: WeightingSettingsReadModel = Object.freeze({
  sectionId: "weighting",
  sectionName: "AutoBuild Weighting",
  controls: Object.freeze([
    Object.freeze({
      kind: "toggle",
      settingName: "buildingBuildIfStorageFull",
      label: "Ignore weighting and build if any storage is full",
      hint: "Ignore weighting and immediately construct building if it uses any capped resource, preventing wasting them by overflowing. Weight still need to be positive(above zero) for this to happen.",
    }),
  ]),
  rules: Object.freeze([
    Object.freeze({
      target: "Any",
      condition: "New building",
      settingName: "buildingWeightingNew",
    }),
    Object.freeze({
      target: "Powered building",
      condition: "Low available energy",
      settingName: "buildingWeightingUnderpowered",
    }),
    Object.freeze({
      target: "Power plant",
      condition: "Low available energy",
      settingName: "buildingWeightingNeedfulPowerPlant",
    }),
    Object.freeze({
      target: "Power plant",
      condition: "Producing more energy than required",
      settingName: "buildingWeightingUselessPowerPlant",
    }),
    Object.freeze({
      target: "Knowledge storage",
      condition: "Have unaffordable researches or build targets",
      settingName: "buildingWeightingNeedfulKnowledge",
    }),
    Object.freeze({
      target: "Knowledge storage",
      condition: "All researches and build targets already affordable",
      settingName: "buildingWeightingUselessKnowledge",
    }),
    Object.freeze({
      target: "Building with state (city)",
      condition: "Some instances of this building are not working",
      settingName: "buildingWeightingNonOperatingCity",
    }),
    Object.freeze({
      target: "Building with state (space)",
      condition: "Some instances of this building are not working",
      settingName: "buildingWeightingNonOperating",
    }),
    Object.freeze({
      target: "Building with consumption",
      condition: "Missing consumables to operate",
      settingName: "buildingWeightingMissingSupply",
    }),
    Object.freeze({
      target: "Support consumer",
      condition: "Missing support to operate",
      settingName: "buildingWeightingMissingSupport",
    }),
    Object.freeze({
      target: "Support provider",
      condition: "Provided support not currently needed",
      settingName: "buildingWeightingUselessSupport",
    }),
    Object.freeze({
      target: "All fuel depots",
      condition: "Missing Oil or Helium for techs and missions",
      settingName: "buildingWeightingMissingFuel",
    }),
    Object.freeze({
      target: "Not housing, barrack, oil derrick, or knowledge building",
      condition: "MAD prestige enabled, and affordable",
      settingName: "buildingWeightingMADUseless",
    }),
    Object.freeze({
      target: "Mass Ejector",
      condition: "Existed ejectors not fully utilized",
      settingName: "buildingWeightingUnusedEjectors",
    }),
    Object.freeze({
      target: "Freight Yard, Container Port, Munitions Depot",
      condition: "Have unused crates or containers",
      settingName: "buildingWeightingCrateUseless",
    }),
    Object.freeze({
      target: "Horseshoes",
      condition: "No more Horseshoes needed",
      settingName: "buildingWeightingHorseshoeUseless",
    }),
    Object.freeze({
      target: "Meditation Chamber",
      condition: "No more Meditation Space needed",
      settingName: "buildingWeightingZenUseless",
    }),
    Object.freeze({
      target: "Gate Turret",
      condition: "Gate demons fully supressed",
      settingName: "buildingWeightingGateTurret",
    }),
    Object.freeze({
      target: "Warehouses, Garage, Cargo Yard, Storehouse",
      condition: "Need more storage",
      settingName: "buildingWeightingNeedStorage",
    }),
    Object.freeze({
      target: "Housing",
      condition: "Less than 90% of houses are used",
      settingName: "buildingWeightingUselessHousing",
    }),
    Object.freeze({
      target: "Orbital Decay",
      condition: "City and Moon buildings",
      settingName: "buildingWeightingTemporal",
    }),
    Object.freeze({
      target: "The True Path",
      condition: "Solar buildings after reaching Tau Ceti",
      settingName: "buildingWeightingSolar",
    }),
    Object.freeze({
      target: "Mana Pylons and Mana Syphon",
      condition: "Vacuum Collapse",
      settingName: "buildingWeightingVacuumCollapse",
    }),
    Object.freeze({
      target: "Eris Control Relays, Tanks, and Android Troopers",
      condition: "The True Path Digsite is not yet secured",
      settingName: "buildingWeightingTruepathDigsite",
    }),
    Object.freeze({
      target: "Womlings Missions",
      condition: "Womlings unlock actions conflicting with Overlord",
      settingName: "buildingWeightingOverlord",
    }),
    Object.freeze({
      target: "Banana Republic objectives",
      condition:
        "World Collider and Monuments while their objectives are unfinished",
      settingName: "buildingWeightingBananaObjective",
    }),
    Object.freeze({
      target: "Inflation Money helpers",
      condition:
        "Money storage until $250B cap is reachable, then Money income",
      settingName: "buildingWeightingInflationMoney",
    }),
    Object.freeze({
      target: "Retirement preparation",
      condition:
        "Tau Fusion Generators, Factories, and Disease Labs below the pre-Isolation targets",
      settingName: "buildingWeightingRetirementPrep",
    }),
    Object.freeze({
      target: "Matrix cure preparation",
      condition:
        "Tau Disease Labs while a Matrix run still needs the plague cure",
      settingName: "buildingWeightingMatrixCure",
    }),
  ]),
});

export function getWeightingSettingsReadModel(): WeightingSettingsReadModel {
  return weightingSettingsReadModel;
}
