import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getGame"
  | "getSettings"
  | "getDocument"
>;
export function createAutoUniverseSelection({ getGame, getSettings, getDocument }: Dependencies) {
  return function autoUniverseSelection() {
    const game = getGame();
    const settings = getSettings();
    const document = getDocument();
    if (!game.global.race["bigbang"]) {
      return;
    }
    if (game.global.race.universe !== "bigbang") {
      return;
    }
    if (settings.userUniverseTargetName === "none") {
      return;
    }

    let action = document.getElementById(
      `uni-${settings.userUniverseTargetName}`,
    );

    if (action !== null) {
      action.children[0].click();
    }
  }
}
