import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
  isAchievementUnlocked as isAchievementUnlockedPolicy,
} from "../../domain/progression/prestige/achievement-guards.ts";
import {
  isBananaRepublicGuardActive as isBananaRepublicGuardActivePolicy,
  isBananaRepublicReadyForUnification as isBananaRepublicReadyForUnificationPolicy,
  isBananaRepublicSmoothieComplete as isBananaRepublicSmoothieCompletePolicy,
} from "../../domain/civic/banana-republic.ts";
import {
  inflationSecondsToFinish as inflationSecondsToFinishPolicy,
  isInflationAssistActive as isInflationAssistActivePolicy,
  isInflationMoneyReachable as isInflationMoneyReachablePolicy,
  shouldSaveInflationMoney as shouldSaveInflationMoneyPolicy,
} from "../../domain/economy/resources/inflation-assist.ts";
import {
  assessRetirementPreparation as assessRetirementPreparationPolicy,
  isRetirementAssistActive as isRetirementAssistActivePolicy,
} from "../../domain/progression/prestige/retirement-prep.ts";
import type { RetirementShortfall } from "../../domain/progression/prestige/retirement-prep.ts";
import type { RetirementThresholds } from "../../domain/progression/prestige/retirement-prep.ts";
import type { AchievementGuardName } from "../../domain/progression/prestige/achievement-guards.ts";
import {
  readAchievementGuardInput,
  readAchievementStar,
  readAchievementStarLevelContext,
} from "./progression/prestige/achievement-guards.ts";
import {
  readBananaRepublicGuardInput,
  readBananaRepublicObjective,
  readBananaRepublicProgress,
  readBananaRepublicSmoothieInput,
} from "./civic/banana-republic.ts";
import {
  readInflationAssistInput,
  readInflationMoneyInput,
  readInflationSaveInput,
} from "./economy/resources/inflation-assist.ts";
import {
  readRetirementAssistInput,
  readRetirementPreparationInput,
} from "./progression/prestige/retirement-prep.ts";

interface RunGuardDependencies {
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getPoly: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly haveTech: (...args: unknown[]) => unknown;
  readonly getNumberString: (value: number) => string | number;
  readonly formatRetirementShortfalls: (
    shortfalls: readonly Readonly<RetirementShortfall>[],
    formatNumber: (value: number) => string | number,
  ) => string[];
  readonly inflationChallengeMoney: number;
  readonly retirementPreparation: Readonly<RetirementThresholds>;
}

export interface RunGuards {
  getStarLevel(context: unknown): number;
  getAchievementStar(id: string, universe?: string): number;
  isAchievementUnlocked(id: string, level: unknown, universe?: string): boolean;
  guardActive(setting: AchievementGuardName): boolean;
  bananaRepublicObjectiveComplete(objective: string): boolean;
  bananaRepublicSmoothieComplete(): boolean;
  bananaRepublicReadyForUnification(): boolean;
  guardBananaRepublicActive(): boolean;
  inflationChallengeAssistActive(): boolean;
  inflationChallengeMoneyReachable(): boolean;
  inflationChallengeSecondsToFinish(): number;
  inflationChallengeShouldSaveMoney(): boolean;
  retirementChallengeAssistActive(): boolean;
  retirementPreparationMissing(): string[];
}

export function createRunGuards({
  getSettings,
  getGame,
  getPoly,
  getResources,
  getBuildings,
  haveTech,
  getNumberString,
  formatRetirementShortfalls,
  inflationChallengeMoney,
  retirementPreparation,
}: RunGuardDependencies): RunGuards {
  function getStarLevel(context: unknown): number {
    const result = readAchievementStarLevelContext(context);
    return result.status === "ready"
      ? calculateAchievementStarLevel(result.context)
      : 1;
  }

  function getAchievementStar(id: string, universe?: string): number {
    const result = readAchievementStar(getGame(), getPoly(), id, universe);
    return result.status === "ready" ? result.star : 0;
  }

  function isAchievementUnlocked(
    id: string,
    level: unknown,
    universe?: string,
  ): boolean {
    if (typeof level !== "number" || !Number.isFinite(level) || level < 0) {
      return false;
    }
    const result = readAchievementStar(getGame(), getPoly(), id, universe);
    return (
      result.status === "ready" &&
      isAchievementUnlockedPolicy(result.star, level)
    );
  }

  function guardActive(setting: AchievementGuardName): boolean {
    const result = readAchievementGuardInput(
      getSettings(),
      getGame(),
      getPoly(),
      getBuildings(),
      setting,
    );
    if (result.status === "ready")
      return isAchievementGuardActive(result.input);
    return result.status === "unavailable" ? result.fallbackActive : false;
  }

  function bananaRepublicObjectiveComplete(objective: string): boolean {
    const result = readBananaRepublicObjective(getGame(), getPoly(), objective);
    return result.status === "ready" ? result.complete : false;
  }

  function bananaRepublicSmoothieComplete(): boolean {
    const result = readBananaRepublicSmoothieInput(getGame());
    return result.status === "ready"
      ? isBananaRepublicSmoothieCompletePolicy(result.input)
      : false;
  }

  function bananaRepublicReadyForUnification(): boolean {
    const result = readBananaRepublicProgress(getGame(), getPoly());
    return result.status === "ready"
      ? isBananaRepublicReadyForUnificationPolicy(result.progress)
      : false;
  }

  function guardBananaRepublicActive(): boolean {
    const result = readBananaRepublicGuardInput(
      getSettings(),
      getGame(),
      getPoly(),
    );
    if (result.status === "ready") {
      return isBananaRepublicGuardActivePolicy(result.input);
    }
    return result.status === "unavailable" ? result.fallbackActive : false;
  }

  function inflationChallengeAssistActive(): boolean {
    const result = readInflationAssistInput(
      getSettings(),
      getGame(),
      getAchievementStar("wheelbarrow"),
    );
    return result.status === "ready"
      ? isInflationAssistActivePolicy(result.input)
      : false;
  }

  function inflationChallengeMoneyReachable(): boolean {
    const result = readInflationMoneyInput(
      getResources(),
      inflationChallengeMoney,
    );
    return result.status === "ready"
      ? isInflationMoneyReachablePolicy(result.input)
      : false;
  }

  function inflationChallengeSecondsToFinish(): number {
    const result = readInflationMoneyInput(
      getResources(),
      inflationChallengeMoney,
    );
    return result.status === "ready"
      ? inflationSecondsToFinishPolicy(result.input)
      : Number.POSITIVE_INFINITY;
  }

  function inflationChallengeShouldSaveMoney(): boolean {
    const result = readInflationSaveInput(
      getSettings(),
      getGame(),
      getResources(),
      getAchievementStar("wheelbarrow"),
      inflationChallengeMoney,
    );
    return result.status === "ready"
      ? shouldSaveInflationMoneyPolicy(result.input)
      : false;
  }

  function retirementChallengeAssistActive(): boolean {
    const result = readRetirementAssistInput(
      getSettings(),
      getGame(),
      Boolean(haveTech("isolation")),
    );
    return result.status === "ready"
      ? isRetirementAssistActivePolicy(result.input)
      : false;
  }

  function retirementPreparationMissing(): string[] {
    if (!retirementChallengeAssistActive()) return [];
    const result = readRetirementPreparationInput(
      getBuildings(),
      getResources(),
      retirementPreparation,
    );
    return result.status === "ready"
      ? formatRetirementShortfalls(
          assessRetirementPreparationPolicy(result.input),
          getNumberString,
        )
      : [];
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
