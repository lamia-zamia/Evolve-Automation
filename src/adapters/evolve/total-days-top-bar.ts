import { requireNumber, requireRecord } from "../validation.ts";
import type { TotalDaysTopBarReader } from "../../ports/total-days-top-bar.ts";

export interface TotalDaysTopBarEvolveDependencies {
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
}

/** Evolve adapter for the settings and game-stat reads used by the top-bar UI. */
export function createTotalDaysTopBarEvolveAdapter({
  getSettings,
  getGame,
}: TotalDaysTopBarEvolveDependencies): TotalDaysTopBarReader {
  return Object.freeze({
    readDisplayEnabled(): boolean {
      const settings = requireRecord(getSettings(), "settings");
      // This setting is absent while Evolve is still initializing; legacy code treated that as disabled.
      return Boolean(settings["displayTotalDaysTypeInTopBar"]);
    },

    readTotalDays(): number {
      const game = requireRecord(getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const stats = requireRecord(global["stats"], "game.global.stats");
      return requireNumber(stats["days"], "game.global.stats.days");
    },
  });
}
