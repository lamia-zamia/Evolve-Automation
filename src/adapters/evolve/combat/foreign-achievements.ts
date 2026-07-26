import {
  planForeignAchievementGoal,
  type ForeignAchievementGoal,
  type ForeignAchievementState,
} from "../../../domain/combat/foreign-achievements.ts";
import { requireRecord, type UnknownRecord } from "../../validation.ts";

export interface ForeignAchievementGoalDependencies {
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly isAchievementUnlocked: (
    achievement: string,
    level: number,
  ) => unknown;
}

function readForeignStates(game: UnknownRecord): ForeignAchievementState[] {
  const global = requireRecord(game["global"], "game.global");
  const civic = requireRecord(global["civic"], "game.global.civic");
  const foreign = requireRecord(civic["foreign"], "game.global.civic.foreign");
  return [0, 1, 2].map((index) => {
    const government = requireRecord(
      foreign[`gov${index}`],
      `game.global.civic.foreign.gov${index}`,
    );
    // These flags are absent before a foreign system is initialized; absent
    // is the legacy-equivalent false state for this eligibility check.
    return Object.freeze({
      occupied: Boolean(government["occ"]),
      annexed: Boolean(government["anx"]),
      purchased: Boolean(government["buy"]),
    });
  });
}

function readGuardSetting(settings: UnknownRecord, name: string): boolean {
  const value = settings[name];
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`settings.${name} must be a boolean`);
  }
  return value !== false;
}

function readAchievement(
  dependencies: ForeignAchievementGoalDependencies,
  id: string,
): boolean {
  const result = dependencies.isAchievementUnlocked(id, 1);
  if (typeof result !== "boolean") {
    throw new TypeError(`isAchievementUnlocked(${id}) must return a boolean`);
  }
  return result;
}

/** Read current foreign state and select one safe positive achievement path. */
export function readForeignAchievementGoal(
  dependencies: ForeignAchievementGoalDependencies,
): ForeignAchievementGoal | null {
  try {
    const settings = requireRecord(dependencies.getSettings(), "settings");
    // Achievement guards are opt-in through the existing master toggle.
    if (settings["achievementGuards"] !== true) return null;

    const guardWorldDomination = readGuardSetting(
      settings,
      "guardWorldDomination",
    );
    const guardSyndicate = readGuardSetting(settings, "guardSyndicate");
    if (!guardWorldDomination && !guardSyndicate) return null;

    const foreignStates = readForeignStates(
      requireRecord(dependencies.getGame(), "game"),
    );
    return planForeignAchievementGoal({
      guardWorldDomination,
      guardSyndicate,
      worldDominationUnlocked: guardWorldDomination
        ? readAchievement(dependencies, "world_domination")
        : false,
      syndicateUnlocked: guardSyndicate
        ? readAchievement(dependencies, "syndicate")
        : false,
      foreignStates,
    });
  } catch {
    return null;
  }
}
