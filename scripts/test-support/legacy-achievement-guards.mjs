export function legacyAchievementGuardActive(input) {
  if (!input.enabled || input.earnedStar >= input.targetStar) return false;
  switch (input.guard) {
    case "guardPacifist":
      return input.attacks === 0;
    case "guardDreaded":
      return input.prestigeType === "ascension" && input.dreadnoughts === 0;
    case "guardCultOfPersonality":
      return !legacyAchievementGuardActive(input.pacifist);
    case "guardAnarchist":
      return input.prestigeType === "mad" && input.government === "anarchy";
    case "guardEnergetic":
      return (
        input.prestigeType === "ascension" && input.thermalCollectors === 0
      );
    case "guardRedDead":
      return input.prestigeType === "mad" && input.redSpaceports === 0;
    case "guardSecondEvolution":
      return input.gods === input.species;
  }
}
