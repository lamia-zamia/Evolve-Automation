import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "AlchemyManager"
  | "getResources"
  | "getSettings"
  | "getGame"
  | "getAchievementStar"
>;
export function createAutoAlchemy({
  AlchemyManager,
  getResources,
  getSettings,
  getGame,
  getAchievementStar,
}: Dependencies) {
  return function autoAlchemy() {
    const resources = getResources();
    const settings = getSettings();
    const game = getGame();
    let m = AlchemyManager;
    if (!m.isUnlocked()) {
      return;
    }

    let fullList = m.managedPriorityList();
    let adjustAlchemy = Object.fromEntries(
      fullList.map((res) => [res.id, m.currentCount(res.id) * -1]),
    );

    // Calculate required transmutations
    if (!resources.Crystal.isDemanded()) {
      let activeList = fullList.filter(
        (res) => m.resWeighting(res.id) > 0 && res.isUseful(),
      );
      let totalWeigthing = 0,
        currentTransmute = 0;
      for (let res of activeList) {
        totalWeigthing += m.resWeighting(res.id);
        currentTransmute += m.currentCount(res.id);
      }
      let manaAvailable =
        (currentTransmute + resources.Mana.rateOfChange) *
        (!settings.autoPylon && resources.Mana.storageRatio > 0.99
          ? 1
          : settings.magicAlchemyManaUse);
      let crystalAvailable =
        currentTransmute * 0.15 +
        resources.Crystal.currentQuantity +
        resources.Crystal.rateOfChange;
      let maxTransmute = Math.floor(
        Math.min(manaAvailable, crystalAvailable * (1 / 0.15)),
      );
      activeList.forEach(
        (res) =>
          (adjustAlchemy[res.id] += Math.floor(
            maxTransmute * (m.resWeighting(res.id) / totalWeigthing),
          )),
      );
    }

    if (
      settings.magicFullmetalHelper &&
      game.global.race.universe === "magic" &&
      game.global.tech.alchemy >= 2 &&
      getAchievementStar("fullmetal") < game.alevel() &&
      resources.Mana.currentQuantity >= 1 &&
      resources.Crystal.currentQuantity >= 0.15
    ) {
      let fullmetalResource = fullList.find(
        (res) => m.transmuteTier(res) > 1 && !res.instance?.basic,
      );
      if (fullmetalResource) {
        adjustAlchemy[fullmetalResource.id] = Math.max(
          adjustAlchemy[fullmetalResource.id],
          1 - m.currentCount(fullmetalResource.id),
        );
      }
    }

    // Apply adjustment
    Object.entries(adjustAlchemy).forEach(
      ([id, delta]) => delta < 0 && m.transmuteLess(id, delta * -1),
    );
    Object.entries(adjustAlchemy).forEach(
      ([id, delta]) => delta > 0 && m.transmuteMore(id, delta),
    );
  };
}
