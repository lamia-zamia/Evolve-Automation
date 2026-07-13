import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getSpyManager"
  | "getWarManager"
  | "getHaveTask"
  | "getHaveTech"
  | "inflationChallengeShouldSaveMoney"
  | "getResources"
  | "getSettings"
  | "getPoly"
  | "GameLog"
  | "getGovName"
  | "getGame"
>;
export function createAutoSpy({ getSpyManager, getWarManager, getHaveTask, getHaveTech, inflationChallengeShouldSaveMoney, getResources, getSettings, getPoly, GameLog, getGovName, getGame }: Dependencies) {
  return function autoSpy() {
    const SpyManager = getSpyManager();
    const WarManager = getWarManager();
    const haveTask = getHaveTask();
    const haveTech = getHaveTech();
    const resources = getResources();
    const settings = getSettings();
    const poly = getPoly();
    const game = getGame();
    let m = SpyManager;
    if (
      !m._foreignVue ||
      haveTask("combo_spy") ||
      haveTask("spyop") ||
      !haveTech("spy")
    ) {
      return;
    }
    if (inflationChallengeShouldSaveMoney()) {
      return;
    }

    // Have no excess money, nor ability to use spies
    if (!haveTech("spy", 2) && resources.Money.storageRatio < 0.9) {
      return;
    }

    // Train spies
    if (settings.foreignTrainSpy) {
      for (let foreign of m.foreignActive) {
        // Spy already in training, or can't be afforded, or foreign is under control
        if (
          m._foreignVue.spy_disabled(foreign.id) ||
          foreign.gov.occ ||
          foreign.gov.anx ||
          foreign.gov.buy
        ) {
          continue;
        }

        let spiesRequired =
          settings.foreignSpyMax >= 0
            ? settings.foreignSpyMax
            : Number.MAX_SAFE_INTEGER;
        if (
          spiesRequired < 1 &&
          foreign.policy !== "Occupy" &&
          foreign.policy !== "Ignore"
        ) {
          spiesRequired = 1;
        }
        // We need 3 spies to purchase, but only if we have enough money cap to purchase
        if (
          spiesRequired < 3 &&
          foreign.policy === "Purchase" &&
          resources.Money.maxQuantity >= poly.govPrice(foreign.id)
        ) {
          spiesRequired = 3;
        }

        // We reached the max number of spies allowed
        if (
          foreign.gov.spy >= spiesRequired ||
          (m.purchaseMoney > 0 &&
            foreign.policy !== "Purchase" &&
            foreign.gov.spy > 0)
        ) {
          continue;
        }

        GameLog.logSuccess(
          "spying",
          `Training a spy to send against ${getGovName(foreign.id)}.`,
          ["spy"],
        );
        m._foreignVue.spy(foreign.id);
      }
    }

    // We can't use our spies yet
    if (!haveTech("spy", 2)) {
      return;
    }

    // Perform espionage
    for (let foreign of m.foreignActive) {
      // Spy is missing, busy, or have nosthing to do
      if (
        foreign.gov.spy < 1 ||
        foreign.gov.sab !== 0 ||
        foreign.policy === "None"
      ) {
        continue;
      }

      let espionageMission = null;
      if (foreign.policy === "Betrayal") {
        if (foreign.gov.mil <= 75 || foreign.gov.hstl <= 0) {
          espionageMission = m.Types.Sabotage;
        } else {
          espionageMission = m.Types.Influence;
        }
      } else if (foreign.policy === "Occupy") {
        espionageMission = m.Types.Sabotage;
      } else {
        espionageMission = m.Types[foreign.policy];
      }
      if (!espionageMission) {
        continue;
      }

      // Don't kill spies doing other things if we already can purchase
      if (
        m.purchaseMoney > 0 &&
        m.purchaseForeigngs.includes(foreign.id) &&
        espionageMission === m.Types.Purchase &&
        foreign.gov.spy < 3 &&
        !game.global.race["elusive"]
      ) {
        continue;
      }

      // Unoccupy power if it's controlled, but we want something different
      if (
        (foreign.gov.anx && foreign.policy !== "Annex") ||
        (foreign.gov.buy && foreign.policy !== "Purchase") ||
        (foreign.gov.occ && foreign.policy !== "Occupy")
      ) {
        WarManager.release(foreign.id);
        foreign.released = true;
      } else if (!foreign.gov.anx && !foreign.gov.buy && !foreign.gov.occ) {
        m.performEspionage(
          foreign.id,
          espionageMission.id,
          foreign !== m.foreignTarget,
        );
      }
    }
  }
}
