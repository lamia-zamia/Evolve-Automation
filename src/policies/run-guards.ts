type RetirementPreparation = {
  fusionGenerators: number;
  factories: number;
  scienceLabs: number;
  graphene: number;
};

type RunGuardDependencies = {
  getSettings: () => any;
  getGame: () => any;
  getPoly: () => any;
  getResources: () => any;
  getBuildings: () => any;
  haveTech: (research: string, level?: number) => boolean;
  getNumberString: (amount: number) => string | number;
  inflationChallengeMoney: number;
  retirementPreparation: RetirementPreparation;
};

type AchievementGuard = {
  id: string;
  feat?: boolean;
  when: () => boolean;
};

export function createRunGuards({
  getSettings,
  getGame,
  getPoly,
  getResources,
  getBuildings,
  haveTech,
  getNumberString,
  inflationChallengeMoney,
  retirementPreparation,
}: RunGuardDependencies) {
  function getStarLevel(context: Record<string, any>) {
    let aLevel = 1;
    if (context.challenge_plasmid) {
      aLevel++;
    }
    if (context.challenge_trade) {
      aLevel++;
    }
    if (context.challenge_craft) {
      aLevel++;
    }
    if (context.challenge_crispr) {
      aLevel++;
    }
    return aLevel;
  }

  function getAchievementStar(id: string, universe?: string) {
    const game = getGame();
    const poly = getPoly();
    return game.global.stats.achieve[id]?.[poly.universeAffix(universe)] ?? 0;
  }

  function isAchievementUnlocked(id: string, level: number, universe?: string) {
    return getAchievementStar(id, universe) >= level;
  }

  // Achievement guards constrain automation so the current run stays eligible. A guard arms only
  // while the achievement is unearned at the current star level in the current universe (feats are
  // universe-wide), and releases once earned, lost this run, or out of scope for the reset type.
  const achievementGuardDefs: Record<string, AchievementGuard> = {
    guardPacifist: {
      id: "pacifist",
      when: () => getGame().global.stats.attacks === 0,
    },
    guardDreaded: {
      id: "dreaded",
      when: () =>
        getSettings().prestigeType === "ascension" &&
        getBuildings().Dreadnought.count === 0,
    },
    // Pacifist requires unification, Cult of Personality forbids it - Pacifist wins while armed.
    guardCultOfPersonality: {
      id: "cult_of_personality",
      when: () => !guardActive("guardPacifist"),
    },
    guardAnarchist: {
      id: "anarchist",
      when: () => {
        const game = getGame();
        return (
          getSettings().prestigeType === "mad" &&
          game.global.civic.govern.type === "anarchy"
        );
      },
    },
    guardEnergetic: {
      id: "energetic",
      feat: true,
      when: () =>
        getSettings().prestigeType === "ascension" &&
        getBuildings().SiriusThermalCollector.count === 0,
    },
    guardRedDead: {
      id: "red_dead",
      when: () =>
        getSettings().prestigeType === "mad" &&
        getBuildings().RedSpaceport.count === 0,
    },
    guardSecondEvolution: {
      id: "second_evolution",
      when: () => {
        const race = getGame().global.race;
        return race.gods === race.species;
      },
    },
  };

  function guardActive(setting: string) {
    const settings = getSettings();
    if (!settings.achievementGuards || !settings[setting]) {
      return false;
    }
    const guard = achievementGuardDefs[setting];
    if (!guard) {
      return false;
    }
    const game = getGame();
    const star = guard.feat
      ? (game.global.stats.feat?.[guard.id] ?? 0)
      : getAchievementStar(guard.id);
    return star < game.alevel() && guard.when();
  }

  function bananaRepublicObjectiveComplete(id: string) {
    const game = getGame();
    const bananaStats = game.global.stats.banana;
    const universe = getPoly().universeAffix();
    return Boolean(bananaStats?.[id]?.[universe]);
  }

  function bananaRepublicSmoothieComplete() {
    const game = getGame();
    if ((game.global.stats.feat?.banana ?? 0) > 0) {
      return true;
    }

    let exportRoutes = 0;
    let hasBigImport = false;
    (Object.values(game.global.resource) as any[]).forEach((resource) => {
      if (!resource.hasOwnProperty("trade")) {
        return;
      }
      if (resource.trade > 0) {
        exportRoutes += resource.trade;
      } else if (resource.trade <= -500) {
        hasBigImport = true;
      }
    });
    return hasBigImport && exportRoutes >= 500;
  }

  function bananaRepublicReadyForUnification() {
    return (
      ["b1", "b2", "b3", "b4", "b5"].every(bananaRepublicObjectiveComplete) &&
      bananaRepublicSmoothieComplete()
    );
  }

  function guardBananaRepublicActive() {
    const settings = getSettings();
    return (
      settings.achievementGuards &&
      settings.guardBananaRepublic &&
      getGame().global.race["banana"] &&
      !bananaRepublicReadyForUnification()
    );
  }

  function inflationChallengeAssistActive() {
    const settings = getSettings();
    const game = getGame();
    return (
      settings.inflationChallengeAssist &&
      game.global.race.hasOwnProperty("inflation") &&
      game.global.race.inflation !== false &&
      getAchievementStar("wheelbarrow") < game.alevel()
    );
  }

  function inflationChallengeMoneyReachable() {
    return getResources().Money.maxQuantity >= inflationChallengeMoney;
  }

  function inflationChallengeSecondsToFinish() {
    if (!inflationChallengeMoneyReachable()) {
      return Number.POSITIVE_INFINITY;
    }
    const money = getResources().Money;
    const remaining = inflationChallengeMoney - money.currentQuantity;
    if (remaining <= 0) {
      return 0;
    }
    return money.rateOfChange > 0
      ? remaining / money.rateOfChange
      : Number.POSITIVE_INFINITY;
  }

  function inflationChallengeShouldSaveMoney() {
    const settings = getSettings();
    return (
      inflationChallengeAssistActive() &&
      settings.inflationChallengeSaveMinutes >= 0 &&
      inflationChallengeSecondsToFinish() <=
        settings.inflationChallengeSaveMinutes * 60
    );
  }

  function retirementChallengeAssistActive() {
    const settings = getSettings();
    return (
      settings.retirementChallengeAssist &&
      getGame().global.race["truepath"] &&
      settings.prestigeType === "retire" &&
      !haveTech("isolation")
    );
  }

  function retirementPreparationMissing() {
    if (!retirementChallengeAssistActive()) {
      return [];
    }

    const buildings = getBuildings();
    const resources = getResources();
    const missing: string[] = [];
    if (
      buildings.TauFusionGenerator.count <
      retirementPreparation.fusionGenerators
    ) {
      missing.push(
        `${buildings.TauFusionGenerator.name} ${buildings.TauFusionGenerator.count}/${retirementPreparation.fusionGenerators}`,
      );
    }
    if (buildings.TauFactory.count < retirementPreparation.factories) {
      missing.push(
        `${buildings.TauFactory.name} ${buildings.TauFactory.count}/${retirementPreparation.factories}`,
      );
    }
    if (buildings.TauDiseaseLab.count < retirementPreparation.scienceLabs) {
      missing.push(
        `${buildings.TauDiseaseLab.name} ${buildings.TauDiseaseLab.count}/${retirementPreparation.scienceLabs}`,
      );
    }
    if (resources.Graphene.maxQuantity < retirementPreparation.graphene) {
      missing.push(
        `${resources.Graphene.name} storage ${getNumberString(resources.Graphene.maxQuantity)}/${getNumberString(retirementPreparation.graphene)}`,
      );
    } else if (
      resources.Graphene.currentQuantity < retirementPreparation.graphene
    ) {
      missing.push(
        `${resources.Graphene.name} stockpile ${getNumberString(resources.Graphene.currentQuantity)}/${getNumberString(retirementPreparation.graphene)}`,
      );
    }
    return missing;
  }

  return {
    getStarLevel,
    getAchievementStar,
    isAchievementUnlocked,
    guardActive,
    bananaRepublicObjectiveComplete,
    bananaRepublicSmoothieComplete,
    bananaRepublicReadyForUnification,
    guardBananaRepublicActive,
    inflationChallengeAssistActive,
    inflationChallengeMoneyReachable,
    inflationChallengeSecondsToFinish,
    inflationChallengeShouldSaveMoney,
    retirementChallengeAssistActive,
    retirementPreparationMissing,
  };
}
