type RetirementPreparation = {
  fusionGenerators: number;
  factories: number;
  scienceLabs: number;
  graphene: number;
};

type RunGuardDependencies = {
  getSettings: () => any;
  getGame: () => any;
  getResources: () => any;
  getBuildings: () => any;
  getAchievementStar: (id: string, universe?: string) => number;
  haveTech: (research: string, level?: number) => boolean;
  getNumberString: (amount: number) => string | number;
  inflationChallengeMoney: number;
  retirementPreparation: RetirementPreparation;
};

export function createRunGuards({
  getSettings,
  getGame,
  getResources,
  getBuildings,
  getAchievementStar,
  haveTech,
  getNumberString,
  inflationChallengeMoney,
  retirementPreparation,
}: RunGuardDependencies) {
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
    inflationChallengeAssistActive,
    inflationChallengeMoneyReachable,
    inflationChallengeSecondsToFinish,
    inflationChallengeShouldSaveMoney,
    retirementChallengeAssistActive,
    retirementPreparationMissing,
  };
}
