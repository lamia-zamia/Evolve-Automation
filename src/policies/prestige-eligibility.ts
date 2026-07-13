type PrestigeSettings = {
  autoPrestige: boolean;
  prestigeWaitAT: boolean;
  prestigeType: string;
  prestigeBioseedProbes: number;
  prestigeGECK: number;
  prestigeWhiteholeMinMass: number;
  prestigeAscensionPillar: boolean;
  autoMech: boolean;
  prestigeDemonicPotential: number;
  prestigeDemonicFloor: number;
};

type PrestigeGame = {
  alevel: () => number;
  global: {
    settings: { at: number };
    race: {
      species: string;
      universe: string;
      [key: string]: unknown;
    };
    pillars: Record<string, number | undefined>;
    interstellar: {
      stellar_engine?: { mass: number; exotic: number } | null;
    };
  };
};

type PrestigeResources = {
  Harmony: { currentQuantity: number };
};

type PrestigeBuildings = {
  GasSpaceDock: { count: number };
  GasSpaceDockShipSegment: { count: number };
  GasSpaceDockProbe: { count: number };
  GasSpaceDockGECK: { count: number };
  SiriusAscend: { isUnlocked: () => boolean };
  PitAbsorptionChamber: { count: number };
  PitSoulCapacitor: { instance: { energy: number } };
  SpireTower: { count: number };
};

type TechAction = {
  isUnlocked: () => boolean;
  isAffordable: () => boolean;
};

type PrestigeMechManager = {
  isActive: boolean;
  mechsPotential: number;
};

type PrestigeEligibilityDependencies = {
  getSettings: () => PrestigeSettings;
  getGame: () => PrestigeGame;
  getResources: () => PrestigeResources;
  getBuildings: () => PrestigeBuildings;
  getTechIds: () => Record<string, TechAction>;
  getMechManager: () => PrestigeMechManager;
  getHaveTech: () => (research: string, level?: number) => boolean;
  getIsAchievementUnlocked: () => (
    id: string,
    level: number,
    universe?: string,
  ) => boolean;
};

export function createPrestigeEligibility({
  getSettings,
  getGame,
  getResources,
  getBuildings,
  getTechIds,
  getMechManager,
  getHaveTech,
  getIsAchievementUnlocked,
}: PrestigeEligibilityDependencies) {
  function isPrestigeAllowed(type?: string) {
    const settings = getSettings();
    const game = getGame();
    return (
      settings.autoPrestige &&
      !(settings.prestigeWaitAT && game.global.settings.at > 0) &&
      (!type || settings.prestigeType === type)
    );
  }

  function isCataclysmPrestigeAvailable() {
    return getTechIds()["tech-dial_it_to_11"].isUnlocked();
  }

  function isBioseederPrestigeAvailable() {
    const buildings = getBuildings();
    const settings = getSettings();
    return (
      !isGECKNeeded() &&
      buildings.GasSpaceDock.count >= 1 &&
      buildings.GasSpaceDockShipSegment.count >= 100 &&
      buildings.GasSpaceDockProbe.count >= settings.prestigeBioseedProbes
    );
  }

  function isWhiteholePrestigeAvailable() {
    const settings = getSettings();
    const techIds = getTechIds();
    return (
      getBlackholeMass() >= settings.prestigeWhiteholeMinMass &&
      (techIds["tech-exotic_infusion"].isUnlocked() ||
        techIds["tech-infusion_check"].isUnlocked() ||
        techIds["tech-infusion_confirm"].isUnlocked())
    );
  }

  function isApocalypsePrestigeAvailable() {
    const techIds = getTechIds();
    return (
      techIds["tech-protocol66"].isUnlocked() ||
      techIds["tech-protocol66a"].isUnlocked()
    );
  }

  function isAscensionPrestigeAvailable() {
    return getBuildings().SiriusAscend.isUnlocked() && isPillarFinished();
  }

  function isWitchAscensionPrestigeAvailable(demonic?: boolean) {
    const game = getGame();
    const haveTech = getHaveTech();
    if (
      demonic &&
      (!haveTech("forbidden", 5) ||
        (game.global.race["fasting"] && !haveTech("dish", 2)))
    ) {
      return false;
    }
    const buildings = getBuildings();
    return (
      buildings.PitAbsorptionChamber.count >= 100 &&
      buildings.PitSoulCapacitor.instance.energy >= 100000000 &&
      isPillarFinished()
    );
  }

  function isDemonicPrestigeAvailable() {
    const settings = getSettings();
    const MechManager = getMechManager();
    if (
      settings.autoMech &&
      ((MechManager.isActive && settings.prestigeDemonicPotential < 1) ||
        MechManager.mechsPotential > settings.prestigeDemonicPotential)
    ) {
      return false;
    }
    const game = getGame();
    const resetTech =
      getTechIds()[
        game.global.race["fasting"]
          ? "tech-final_ingredient"
          : "tech-demonic_infusion"
      ];
    return (
      getBuildings().SpireTower.count > settings.prestigeDemonicFloor &&
      resetTech.isUnlocked() &&
      resetTech.isAffordable()
    );
  }

  function isPillarFinished() {
    const game = getGame();
    const speciesPillarLevel = game.global.pillars[game.global.race.species];
    const canPillar =
      !speciesPillarLevel &&
      getResources().Harmony.currentQuantity >= 1 &&
      game.global.race.universe !== "micro";
    const canUpgrade =
      speciesPillarLevel &&
      speciesPillarLevel < game.alevel() &&
      game.global.race.universe !== "micro";
    // Always consider pillared if user doesn't want to wait for pillar, OR can't pillar + can't upgrade existing pillar
    return (
      !getSettings().prestigeAscensionPillar || (!canPillar && !canUpgrade)
    );
  }

  function isGECKNeeded() {
    return (
      getIsAchievementUnlocked()("lamentis", 5, "standard") &&
      getBuildings().GasSpaceDockGECK.count < getSettings().prestigeGECK
    );
  }

  function getBlackholeMass() {
    const engine = getGame().global.interstellar.stellar_engine;
    return engine ? engine.mass + engine.exotic : 0;
  }

  return {
    isPrestigeAllowed,
    isCataclysmPrestigeAvailable,
    isBioseederPrestigeAvailable,
    isWhiteholePrestigeAvailable,
    isApocalypsePrestigeAvailable,
    isAscensionPrestigeAvailable,
    isWitchAscensionPrestigeAvailable,
    isDemonicPrestigeAvailable,
    isPillarFinished,
    isGECKNeeded,
    getBlackholeMass,
  };
}
