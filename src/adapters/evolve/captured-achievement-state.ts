import type { AchievementStateSample } from "../../domain/game-achievements.ts";
import type { GameAchievementSource } from "../../ports/game-achievement-state.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { isNonArrayRecord, readProperty } from "../validation.ts";

function universeAffix(universe: unknown): string | undefined {
  if (typeof universe !== "string") return undefined;
  switch (universe) {
    case "evil":
      return "e";
    case "antimatter":
      return "a";
    case "heavy":
      return "h";
    case "micro":
      return "m";
    case "magic":
      return "mg";
    default:
      return "l";
  }
}

export function createCapturedAchievementSource(
  rootState: GameRootStateSource,
): GameAchievementSource {
  return Object.freeze({
    readAchievementState(
      achievementIds: Iterable<string>,
      bananaObjectiveIds: Iterable<string>,
    ): AchievementStateSample | undefined {
      const achievementIdsList = [...achievementIds];
      const bananaObjectiveIdsList = [...bananaObjectiveIds];
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      const stats = readProperty(root, "stats");
      const race = readProperty(root, "race");
      if (!isNonArrayRecord(stats) || !isNonArrayRecord(race)) return undefined;
      const affix = universeAffix(readProperty(race, "universe"));
      if (affix === undefined) return undefined;

      const stars = new Map<string, number>();
      const achievements = readProperty(stats, "achieve");
      if (!isNonArrayRecord(achievements)) return undefined;
      for (const id of achievementIdsList) {
        const achievement = readProperty(achievements, id);
        if (achievement === undefined || achievement === null) {
          stars.set(id, 0);
          continue;
        }
        if (!isNonArrayRecord(achievement)) return undefined;
        const star = readProperty(achievement, affix);
        if (star === undefined || star === null) {
          stars.set(id, 0);
        } else if (
          typeof star === "number" &&
          Number.isFinite(star) &&
          star >= 0
        ) {
          stars.set(id, star);
        } else {
          return undefined;
        }
      }

      const objectives = new Map<string, boolean>();
      const banana = readProperty(stats, "banana");
      if (!isNonArrayRecord(banana) && bananaObjectiveIdsList.length > 0) {
        return undefined;
      }
      for (const id of bananaObjectiveIdsList) {
        const objective = readProperty(banana, id);
        if (!isNonArrayRecord(objective)) return undefined;
        const complete = readProperty(objective, affix);
        if (typeof complete !== "boolean") return undefined;
        objectives.set(id, complete);
      }

      return Object.freeze({
        stars: Object.freeze(stars),
        bananaObjectives: Object.freeze(objectives),
      });
    },
  });
}
