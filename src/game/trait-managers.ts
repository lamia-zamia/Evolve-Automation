/* eslint-disable @typescript-eslint/no-explicit-any */
interface TraitManagersDependencies {
  getGame: () => any;
  getSettings: () => Record<string, any>;
  getResources: () => Record<string, { currentQuantity: number }>;
  haveTech: (tech: string, level?: number) => boolean;
}

export function createTraitManagers({
  getGame,
  getSettings,
  getResources,
  haveTech,
}: TraitManagersDependencies) {
  const MinorTraitManager = {
    priorityList: [] as any[],

    isUnlocked() {
      return haveTech("genetics", 3);
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      return this.priorityList.filter(
        (trait) => trait.enabled && trait.isUnlocked(),
      );
    },
  };

  const MutableTraitManager = {
    priorityList: [] as any[],

    isUnlocked() {
      return haveTech("genetics", 3) && getGame().global.genes["mutation"];
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    get minimumPlasmidsToPreserve() {
      const settings = getSettings();
      const resources = getResources();
      return Math.max(
        0,
        settings.minimumPlasmidsToPreserve,
        settings.doNotGoBelowPlasmidSoftcap
          ? resources.Phage!.currentQuantity + 250
          : 0,
      );
    },
  };

  return { MinorTraitManager, MutableTraitManager };
}
