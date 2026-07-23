export const ACHIEVEMENT_GUARD_NAMES = [
  "guardPacifist",
  "guardDreaded",
  "guardCultOfPersonality",
  "guardAnarchist",
  "guardEnergetic",
  "guardRedDead",
  "guardSecondEvolution",
] as const;

export type AchievementGuardName = (typeof ACHIEVEMENT_GUARD_NAMES)[number];

export interface AchievementStarLevelContext {
  readonly challengePlasmid: boolean;
  readonly challengeTrade: boolean;
  readonly challengeCraft: boolean;
  readonly challengeCrispr: boolean;
}

interface AchievementGuardBase {
  readonly enabled: boolean;
  readonly earnedStar: number;
  readonly targetStar: number;
}

export type AchievementGuardInput =
  | (AchievementGuardBase & {
      readonly guard: "guardPacifist";
      readonly attacks: number;
    })
  | (AchievementGuardBase & {
      readonly guard: "guardDreaded";
      readonly prestigeType: string;
      readonly dreadnoughts: number;
    })
  | (AchievementGuardBase & {
      readonly guard: "guardCultOfPersonality";
      readonly pacifist: Readonly<AchievementGuardInput>;
    })
  | (AchievementGuardBase & {
      readonly guard: "guardAnarchist";
      readonly prestigeType: string;
      readonly government: string;
    })
  | (AchievementGuardBase & {
      readonly guard: "guardEnergetic";
      readonly prestigeType: string;
      readonly thermalCollectors: number;
    })
  | (AchievementGuardBase & {
      readonly guard: "guardRedDead";
      readonly prestigeType: string;
      readonly redSpaceports: number;
    })
  | (AchievementGuardBase & {
      readonly guard: "guardSecondEvolution";
      readonly species: string;
      readonly gods: string;
    });

export function isAchievementGuardName(
  value: string,
): value is AchievementGuardName {
  return (ACHIEVEMENT_GUARD_NAMES as readonly string[]).includes(value);
}

export function calculateAchievementStarLevel(
  context: Readonly<AchievementStarLevelContext>,
): number {
  return (
    1 +
    Number(context.challengePlasmid) +
    Number(context.challengeTrade) +
    Number(context.challengeCraft) +
    Number(context.challengeCrispr)
  );
}

export function isAchievementUnlocked(
  earnedStar: number,
  requiredStar: number,
): boolean {
  return earnedStar >= requiredStar;
}

/** Keeps a run eligible for one configured, currently unearned achievement. */
export function isAchievementGuardActive(
  input: Readonly<AchievementGuardInput>,
): boolean {
  if (!input.enabled || input.earnedStar >= input.targetStar) return false;

  switch (input.guard) {
    case "guardPacifist":
      return input.attacks === 0;
    case "guardDreaded":
      return input.prestigeType === "ascension" && input.dreadnoughts === 0;
    case "guardCultOfPersonality":
      return !isAchievementGuardActive(input.pacifist);
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
