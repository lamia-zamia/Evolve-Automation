import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "GovernmentManager"
  | "getSettings"
  | "getGame"
  | "guardActive"
  | "haveTech"
  | "getGovernor"
  | "getVueById"
>;
export function createAutoGovernment({
  GovernmentManager,
  getSettings,
  getGame,
  guardActive,
  haveTech,
  getGovernor,
  getVueById,
}: Dependencies) {
  return function autoGovernment() {
    const settings = getSettings();
    const game = getGame();

    // Change government
    if (GovernmentManager.isEnabled() && !guardActive("guardAnarchist")) {
      if (
        settings.govSpace !== "none" &&
        haveTech("q_factory") &&
        GovernmentManager.Types[settings.govSpace].isUnlocked()
      ) {
        GovernmentManager.setGovernment(settings.govSpace);
      } else if (
        settings.govFinal !== "none" &&
        GovernmentManager.Types[settings.govFinal].isUnlocked()
      ) {
        GovernmentManager.setGovernment(settings.govFinal);
      } else if (
        settings.govInterim !== "none" &&
        GovernmentManager.Types[settings.govInterim].isUnlocked()
      ) {
        GovernmentManager.setGovernment(settings.govInterim);
      }
    }

    // Appoint governor
    if (
      haveTech("governor") &&
      settings.govGovernor !== "none" &&
      getGovernor() === "none"
    ) {
      let candidates = game.global.race.governor?.candidates ?? [];
      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].bg === settings.govGovernor) {
          getVueById("candidates")?.appoint(i);
          break;
        }
      }
    }
  };
}
