import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  "getGame" | "getSettings" | "getVueById" | "clickSelector"
>;
export function createAutoWish({
  getGame,
  getSettings,
  getVueById,
  clickSelector,
}: Dependencies) {
  return function autoWish() {
    const game = getGame();
    const settings = getSettings();
    if (!game.global.race["wish"] || !game.global.tech["wish"]) {
      return false;
    }

    if (
      game.global.race.wishStats.minor === 0 &&
      settings.wishMinor !== "none"
    ) {
      const vueMinor = getVueById("minorWish");
      if (!vueMinor) return false;

      clickSelector(`#wish${settings.wishMinor}`);
    }

    if (
      game.global.tech["wish"] >= 2 &&
      game.global.race.wishStats.major === 0 &&
      settings.wishMajor !== "none"
    ) {
      const vueMajor = getVueById("majorWish");
      if (!vueMajor) return false;

      clickSelector(`#wish${settings.wishMajor}`);
    }
  };
}
