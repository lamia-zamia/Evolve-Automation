import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getWarManager"
  | "GameLog"
  | "getState"
  | "getSettings"
  | "getResources"
  | "inflationChallengeShouldSaveMoney"
>;
export function createAutoMerc({
  getWarManager,
  GameLog,
  getState,
  getSettings,
  getResources,
  inflationChallengeShouldSaveMoney,
}: Dependencies) {
  return function autoMerc() {
    const WarManager = getWarManager();
    const state = getState();
    const settings = getSettings();
    const resources = getResources();
    let m = WarManager;
    if (!m._garrisonVue || !m.isMercenaryUnlocked() || m.maxCityGarrison <= 0) {
      return;
    }
    if (inflationChallengeShouldSaveMoney() && state.goal !== "Reset") {
      return;
    }

    let mercenaryCost = m.mercenaryCost;
    let mercenariesHired = 0;
    let mercenaryMax = m.maxSoldiers - settings.foreignHireMercDeadSoldiers;
    let maxCost =
      state.moneyMedian * settings.foreignHireMercCostLowerThanIncome;
    let minMoney = Math.max(
      (resources.Money.maxQuantity *
        settings.foreignHireMercMoneyStoragePercent) /
        100,
      Math.min(
        resources.Money.maxQuantity - maxCost,
        settings.storageAssignExtra
          ? resources.Money.storageRequired / 1.03
          : resources.Money.storageRequired,
      ),
    );
    if (state.goal === "Reset") {
      // Get as much as possible before reset
      mercenaryMax = m.maxSoldiers;
      minMoney = 0;
      maxCost = Number.MAX_SAFE_INTEGER;
    }
    while (
      m.currentSoldiers < mercenaryMax &&
      resources.Money.currentQuantity >= mercenaryCost &&
      (resources.Money.spareQuantity - mercenaryCost > minMoney ||
        mercenaryCost < maxCost) &&
      m.hireMercenary()
    ) {
      mercenariesHired++;
      mercenaryCost = m.mercenaryCost;
    }

    // Log the interaction
    if (mercenariesHired === 1) {
      GameLog.logSuccess(
        "mercenary",
        `Hired a mercenary to join the garrison.`,
        ["combat"],
      );
    } else if (mercenariesHired > 1) {
      GameLog.logSuccess(
        "mercenary",
        `Hired ${mercenariesHired} mercenaries to join the garrison.`,
        ["combat"],
      );
    }
  };
}
