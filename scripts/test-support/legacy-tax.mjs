/** Exact pre-migration tax implementation retained only for dual-run characterization. */
export function createLegacyAutoTax({
  KeyManager,
  getPoly,
  getResources,
  getSettings,
  getGame,
  getVueById,
}) {
  return function autoTax() {
    const resources = getResources();
    const settings = getSettings();
    const game = getGame();
    const poly = getPoly();

    if (resources.Morale.incomeAdusted) return;
    const taxVue = getVueById("tax_rates");
    if (taxVue === undefined || !game.global.civic.taxes.display) return;

    let currentTaxRate = game.global.civic.taxes.tax_rate;
    const currentMorale = resources.Morale.currentQuantity;
    const realMorale = resources.Morale.rateOfChange;
    let maxMorale = resources.Morale.maxQuantity;
    let minMorale = settings.generalMinimumMorale;
    const maxTaxRate = poly.taxCap(false);
    let minTaxRate = poly.taxCap(true);

    if (settings.generalRequestedTaxRate != -1) {
      const requestedTaxRateCappedToLimits = Math.min(
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
    const optimalTax = game.global.race["banana"]
      ? minTaxRate
      : resources.Money.isDemanded()
        ? maxTaxRate
        : Math.round(
            (maxTaxRate - minTaxRate) *
              Math.max(0, 0.9 - resources.Money.storageRatio),
          ) + minTaxRate;
    if (!game.global.race["banana"]) {
      if (currentTaxRate < 20) {
        maxMorale -= 10 - Math.floor(currentTaxRate / 2);
      }
      if (optimalTax < 20) {
        maxMorale += 10 - Math.floor(minTaxRate / 2);
      }
    }
    if (resources.Money.storageRatio < 0.9) {
      maxMorale = Math.min(maxMorale, settings.generalMaximumMorale);
    }
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
