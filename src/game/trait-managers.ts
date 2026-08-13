interface TraitGame {
  global: {
    genes: Record<string, boolean>;
  };
}

interface TraitSettings {
  minimumPlasmidsToPreserve: number;
  doNotGoBelowPlasmidSoftcap: boolean;
  [key: string]: boolean | number | undefined;
}

interface ManagedTrait {
  priority: number;
  enabled: boolean;
  isUnlocked: () => boolean;
}

interface TraitManagersDependencies {
  getGame: () => TraitGame;
  getSettings: () => TraitSettings;
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
    priorityList: [] as ManagedTrait[],

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
    priorityList: [] as ManagedTrait[],

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
