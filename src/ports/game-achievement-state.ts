import type { AchievementStateSample } from "../domain/game-achievements.ts";

/** A narrow sample of persistent achievement state, not a clone of the stats bag. */
export interface GameAchievementSource {
  readAchievementState(
    achievementIds: Iterable<string>,
    bananaObjectiveIds: Iterable<string>,
  ): AchievementStateSample | undefined;
}
