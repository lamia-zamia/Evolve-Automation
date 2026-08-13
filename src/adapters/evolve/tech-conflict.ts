import { findTechConflict } from "../../domain/progression/research/tech-conflicts.ts";
import type { Clock } from "../../ports/clock.ts";
import { readTechConflictInput } from "./progression/research/tech-conflicts.ts";
import type { TechConflict as TechConflictResult } from "../../domain/progression/research/tech-conflicts.ts";

interface TechConflictDependencies {
  readonly getClock: () => Clock;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly getState: () => unknown;
  readonly getGame: () => unknown;
  readonly guardActive: (setting: string) => unknown;
  readonly guardBananaRepublicActive: () => unknown;
  readonly retirementChallengeAssistActive: () => unknown;
  readonly retirementPreparationMissing: () => unknown;
  readonly isAchievementUnlocked: (
    achievement: string,
    level: number,
  ) => unknown;
  readonly fanatAchievements: unknown;
  readonly formatTechConflict: (
    conflict: Readonly<TechConflictResult>,
    formatNumber: (value: number) => string | number,
  ) => string;
  readonly getNumberString: (value: number) => string | number;
}

export interface TechConflictAdapter {
  getTechConflict(tech: unknown): false | string;
}

export function createTechConflict({
  getClock,
  getSettings,
  getResources,
  getState,
  getGame,
  guardActive,
  guardBananaRepublicActive,
  retirementChallengeAssistActive,
  retirementPreparationMissing,
  isAchievementUnlocked,
  fanatAchievements,
  formatTechConflict,
  getNumberString,
}: TechConflictDependencies): TechConflictAdapter {
  function getTechConflict(tech: unknown): false | string {
    const readResult = readTechConflictInput(
      tech,
      getSettings(),
      getResources(),
      getState(),
      getGame(),
      {
        clock: getClock(),
        guardActive,
        guardBananaRepublicActive,
        retirementChallengeAssistActive,
        retirementPreparationMissing,
        isAchievementUnlocked,
        fanatAchievements,
      },
    );
    if (readResult.status === "unavailable") {
      return "Research data unavailable";
    }
    const conflict = findTechConflict(readResult.input);
    return conflict === null
      ? false
      : formatTechConflict(conflict, getNumberString);
  }

  return { getTechConflict };
}
