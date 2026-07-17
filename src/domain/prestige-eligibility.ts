export interface PrestigeEligibilityView {
  readonly settings: {
    readonly autoPrestige: boolean;
    readonly waitForArpa: boolean;
    readonly selectedType: string;
    readonly requiredBioseedProbes: number;
    readonly requiredGecks: number;
    readonly minimumBlackholeMass: number;
    readonly requirePillar: boolean;
    readonly autoMech: boolean;
    readonly maximumMechPotential: number;
    readonly minimumSpireFloor: number;
  };
  readonly game: {
    readonly activeArpaProjects: number;
    readonly species: string;
    readonly universe: string;
    readonly fasting: boolean;
    readonly ascensionLevel: number;
    readonly speciesPillarLevel?: number;
    readonly blackholeMass: number;
    readonly blackholeExotic: number;
  };
  readonly resources: { readonly harmony: number };
  readonly buildings: {
    readonly spaceDock: number;
    readonly shipSegments: number;
    readonly probes: number;
    readonly gecks: number;
    readonly siriusAscendUnlocked: boolean;
    readonly absorptionChambers: number;
    readonly soulCapacitorEnergy: number;
    readonly spireFloor: number;
  };
  readonly tech: {
    readonly cataclysmUnlocked: boolean;
    readonly exoticInfusionUnlocked: boolean;
    readonly infusionCheckUnlocked: boolean;
    readonly infusionConfirmUnlocked: boolean;
    readonly protocol66Unlocked: boolean;
    readonly protocol66aUnlocked: boolean;
    readonly demonicInfusionUnlocked: boolean;
    readonly demonicInfusionAffordable: boolean;
    readonly finalIngredientUnlocked: boolean;
    readonly finalIngredientAffordable: boolean;
    readonly forbiddenLevelFive: boolean;
    readonly dishLevelTwo: boolean;
  };
  readonly achievement: { readonly lamentisStandardFive: boolean };
  readonly mech: {
    readonly active: boolean;
    readonly potential: number;
  };
}

export interface PrestigePermissionView {
  readonly settings: Pick<
    PrestigeEligibilityView["settings"],
    "autoPrestige" | "waitForArpa" | "selectedType"
  >;
  readonly game: Pick<PrestigeEligibilityView["game"], "activeArpaProjects">;
}

export interface PillarEligibilityView {
  readonly settings: Pick<PrestigeEligibilityView["settings"], "requirePillar">;
  readonly game: Pick<
    PrestigeEligibilityView["game"],
    "universe" | "ascensionLevel" | "speciesPillarLevel"
  >;
  readonly resources: PrestigeEligibilityView["resources"];
}

export interface AscensionEligibilityView extends PillarEligibilityView {
  readonly buildings: Pick<
    PrestigeEligibilityView["buildings"],
    "siriusAscendUnlocked"
  >;
}

export interface WitchAscensionEligibilityView extends PillarEligibilityView {
  readonly game: PillarEligibilityView["game"] &
    Pick<PrestigeEligibilityView["game"], "fasting">;
  readonly buildings: Pick<
    PrestigeEligibilityView["buildings"],
    "absorptionChambers" | "soulCapacitorEnergy"
  >;
  readonly tech: Pick<
    PrestigeEligibilityView["tech"],
    "forbiddenLevelFive" | "dishLevelTwo"
  >;
}

export interface GeckEligibilityView {
  readonly settings: Pick<PrestigeEligibilityView["settings"], "requiredGecks">;
  readonly buildings: Pick<PrestigeEligibilityView["buildings"], "gecks">;
  readonly achievement: PrestigeEligibilityView["achievement"];
}

export function isPrestigeAllowed(
  view: Readonly<PrestigePermissionView>,
  type?: string,
): boolean {
  return (
    view.settings.autoPrestige &&
    !(view.settings.waitForArpa && view.game.activeArpaProjects > 0) &&
    (type === undefined || view.settings.selectedType === type)
  );
}

export function getBlackholeMass(
  view: Readonly<PrestigeEligibilityView>,
): number {
  return view.game.blackholeMass + view.game.blackholeExotic;
}

export function isGeckNeeded(view: Readonly<GeckEligibilityView>): boolean {
  return (
    view.achievement.lamentisStandardFive &&
    view.buildings.gecks < view.settings.requiredGecks
  );
}

export function isPillarFinished(
  view: Readonly<PillarEligibilityView>,
): boolean {
  const pillarLevel = view.game.speciesPillarLevel;
  const outsideMicro = view.game.universe !== "micro";
  const canPillar = !pillarLevel && view.resources.harmony >= 1 && outsideMicro;
  const canUpgrade =
    pillarLevel !== undefined &&
    pillarLevel !== 0 &&
    pillarLevel < view.game.ascensionLevel &&
    outsideMicro;
  return !view.settings.requirePillar || (!canPillar && !canUpgrade);
}

export function isCataclysmPrestigeAvailable(
  view: Readonly<PrestigeEligibilityView>,
): boolean {
  return view.tech.cataclysmUnlocked;
}

export function isBioseedPrestigeAvailable(
  view: Readonly<PrestigeEligibilityView>,
): boolean {
  return (
    !isGeckNeeded(view) &&
    view.buildings.spaceDock >= 1 &&
    view.buildings.shipSegments >= 100 &&
    view.buildings.probes >= view.settings.requiredBioseedProbes
  );
}

export function isWhiteholePrestigeAvailable(
  view: Readonly<PrestigeEligibilityView>,
): boolean {
  return (
    getBlackholeMass(view) >= view.settings.minimumBlackholeMass &&
    (view.tech.exoticInfusionUnlocked ||
      view.tech.infusionCheckUnlocked ||
      view.tech.infusionConfirmUnlocked)
  );
}

export function isApocalypsePrestigeAvailable(
  view: Readonly<PrestigeEligibilityView>,
): boolean {
  return view.tech.protocol66Unlocked || view.tech.protocol66aUnlocked;
}

export function isAscensionPrestigeAvailable(
  view: Readonly<AscensionEligibilityView>,
): boolean {
  return view.buildings.siriusAscendUnlocked && isPillarFinished(view);
}

export function isWitchAscensionPrestigeAvailable(
  view: Readonly<WitchAscensionEligibilityView>,
  demonic = false,
): boolean {
  if (
    demonic &&
    (!view.tech.forbiddenLevelFive ||
      (view.game.fasting && !view.tech.dishLevelTwo))
  ) {
    return false;
  }
  return (
    view.buildings.absorptionChambers >= 100 &&
    view.buildings.soulCapacitorEnergy >= 100_000_000 &&
    isPillarFinished(view)
  );
}

export function isDemonicPrestigeAvailable(
  view: Readonly<PrestigeEligibilityView>,
): boolean {
  if (
    view.settings.autoMech &&
    ((view.mech.active && view.settings.maximumMechPotential < 1) ||
      view.mech.potential > view.settings.maximumMechPotential)
  ) {
    return false;
  }
  const resetTechUnlocked = view.game.fasting
    ? view.tech.finalIngredientUnlocked
    : view.tech.demonicInfusionUnlocked;
  const resetTechAffordable = view.game.fasting
    ? view.tech.finalIngredientAffordable
    : view.tech.demonicInfusionAffordable;

  // The configured value is explicitly the minimum floor. Power and mech
  // automation already use >= at this same boundary.
  return (
    view.buildings.spireFloor >= view.settings.minimumSpireFloor &&
    resetTechUnlocked &&
    resetTechAffordable
  );
}
