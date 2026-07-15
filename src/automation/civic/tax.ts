import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "KeyManager"
  | "getPoly"
  | "getResources"
  | "getSettings"
  | "getGame"
  | "getVueById"
>;
export function createAutoTax({
  KeyManager,
  getPoly,
  getResources,
  getSettings,
  getGame,
  getVueById,
}: Dependencies) {
  return function autoTax() {
    const resources = getResources();
    const settings = getSettings();
    const game = getGame();
    const poly = getPoly();

    if (resources.Morale.incomeAdusted) {
      return;
    }

    let taxVue = getVueById("tax_rates");
    if (taxVue === undefined || !game.global.civic.taxes.display) {
      return;
    }

    let currentTaxRate = game.global.civic.taxes.tax_rate;
    let currentMorale = resources.Morale.currentQuantity;
    let realMorale = resources.Morale.rateOfChange;
    let maxMorale = resources.Morale.maxQuantity;
    let minMorale = settings.generalMinimumMorale;

    let maxTaxRate = poly.taxCap(false);
    let minTaxRate = poly.taxCap(true);

    if (settings.generalRequestedTaxRate != -1) {
      var requestedTaxRateCappedToLimits = Math.min(
        Math.max(settings.generalRequestedTaxRate, minTaxRate),
        maxTaxRate,
      );
      KeyManager.set(false, false, false);
      while (currentTaxRate > requestedTaxRateCappedToLimits) {
        taxVue.sub();
        currentTaxRate--;
      }
      while (currentTaxRate < requestedTaxRateCappedToLimits) {
        taxVue.add();
        currentTaxRate++;
      }
      resources.Morale.incomeAdusted = true;
      return;
    }

    if (resources.Money.storageRatio < 0.9 && !game.global.race["banana"]) {
      minTaxRate = Math.max(minTaxRate, settings.generalMinimumTaxRate);
    }

    let optimalTax = game.global.race["banana"]
      ? minTaxRate
      : resources.Money.isDemanded()
        ? maxTaxRate
        : Math.round(
            (maxTaxRate - minTaxRate) *
              Math.max(0, 0.9 - resources.Money.storageRatio),
          ) + minTaxRate;

    if (!game.global.race["banana"]) {
      if (currentTaxRate < 20) {
        // Exposed morale cap includes bonus of current low taxes, roll it back
        maxMorale -= 10 - Math.floor(currentTaxRate / 2);
      }
      if (optimalTax < 20) {
        // And add full bonus if we actually need it
        maxMorale += 10 - Math.floor(minTaxRate / 2);
      }
    }
    if (resources.Money.storageRatio < 0.9) {
      maxMorale = Math.min(maxMorale, settings.generalMaximumMorale);
    }

    // Evil universe: Authority is recalculated every tick, and morale above 100 drains it 1:1.
    // While Authority sits below target, cap morale at 100 so taxes convert the excess into
    // Authority instead. Applied regardless of money storage: Authority below 100 is a global
    // production penalty (0.35% per point), which outweighs the morale production bonus.
    if (
      settings.authorityManage &&
      settings.generalMinimumAuthority !== 0 &&
      resources.Authority.isUnlocked() &&
      resources.Authority.currentQuantity <
        (settings.generalMinimumAuthority < 0
          ? resources.Authority.maxQuantity
          : settings.generalMinimumAuthority)
    ) {
      minMorale = Math.min(minMorale, 100);
      maxMorale = Math.min(maxMorale, 100);
    }

    if (
      currentTaxRate < maxTaxRate &&
      currentMorale >= minMorale + 1 &&
      (currentTaxRate < optimalTax ||
        currentMorale >= maxMorale + 1 ||
        (realMorale >= currentMorale + 1 && optimalTax >= 20))
    ) {
      KeyManager.set(false, false, false);
      taxVue.add();
      resources.Morale.incomeAdusted = true;
    }

    if (
      currentTaxRate > minTaxRate &&
      currentMorale < maxMorale &&
      (currentTaxRate > optimalTax || currentMorale < minMorale)
    ) {
      KeyManager.set(false, false, false);
      taxVue.sub();
      resources.Morale.incomeAdusted = true;
    }
  };
}
