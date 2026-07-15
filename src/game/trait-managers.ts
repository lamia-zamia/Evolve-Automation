/* eslint-disable @typescript-eslint/no-explicit-any */
interface TraitVue {
  gene: (traitName: string) => void;
  gain: (traitName: string) => void;
  purge: (traitName: string) => void;
}

interface TraitManagersDependencies {
  getGame: () => any;
  getSettings: () => Record<string, any>;
  getResources: () => Record<string, { currentQuantity: number }>;
  getVueById: (id: string) => TraitVue | undefined;
  haveTech: (tech: string, level?: number) => boolean;
}

export function createTraitManagers({
  getGame,
  getSettings,
  getResources,
  getVueById,
  haveTech,
}: TraitManagersDependencies) {
  const MinorTraitManager = {
    priorityList: [] as any[],
    _traitVueBinding: "geneticBreakdown",

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

    buyTrait(traitName: string) {
      getVueById(this._traitVueBinding)?.gene(traitName);
    },
  };

  const MutableTraitManager = {
    priorityList: [] as any[],
    _traitVueBinding: "geneticBreakdown",

    isUnlocked() {
      return haveTech("genetics", 3) && getGame().global.genes["mutation"];
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    gainTrait(traitName: string) {
      getVueById(this._traitVueBinding)?.gain(traitName);
    },

    purgeTrait(traitName: string) {
      getVueById(this._traitVueBinding)?.purge(traitName);
    },

    get minimumPlasmidsToPreserve() {
      const settings = getSettings();
      const resources = getResources();
      return Math.max(
        0,
        settings.minimumPlasmidsToPreserve,
        settings.doNotGoBelowPlasmidSoftcap
          ? resources.Phage.currentQuantity + 250
          : 0,
      );
    },
  };

  return { MinorTraitManager, MutableTraitManager };
}
