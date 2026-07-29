type PrestigeTech = {
  isUnlocked: () => boolean;
  isAffordable: (max?: boolean) => boolean;
};

type PrestigeIntelligenceDependencies = {
  getSettings: () => { autoPrestige: boolean; prestigeType: string };
  getTechIds: () => { "tech-mad": PrestigeTech };
  getHaveTech: () => (research: string, level?: number) => unknown;
};

export function createPrestigeIntelligence({
  getSettings,
  getTechIds,
  getHaveTech,
}: PrestigeIntelligenceDependencies) {
  // MAD is the selected prestige route and its tech is either already
  // researched or affordable right now, so the buildings the reset makes
  // worthless are no longer worth building.
  //
  // The settings check gates the rest: `isUnlocked` queries the tech's DOM node
  // and `isAffordable` prices the whole tech, and neither is worth doing every
  // build phase of a run that is not headed for MAD.
  function madPrestigeAwaited(): boolean {
    const settings = getSettings();
    if (!settings.autoPrestige || settings.prestigeType !== "mad") {
      return false;
    }
    // haveTech answers with undefined, not false, for an untouched tech tree.
    if (getHaveTech()("mad")) {
      return true;
    }
    const mad = getTechIds()["tech-mad"];
    return mad.isUnlocked() && mad.isAffordable(true);
  }

  return { madPrestigeAwaited };
}
