import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  "getGame" | "getSettings" | "getVueById"
>;
export function createAutoShapeshift({
  getGame,
  getSettings,
  getVueById,
}: Dependencies) {
  return function autoShapeshift() {
    const game = getGame();
    const settings = getSettings();
    if (
      !game.global.race["shapeshifter"] ||
      settings.shifterGenus === "ignore" ||
      game.global.race.ss_genus === settings.shifterGenus
    ) {
      return false;
    }

    // TODO: Do not imitate own genus.
    getVueById("sshifter")?.setShape(settings.shifterGenus);
  };
}
