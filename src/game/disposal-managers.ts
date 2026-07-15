/* eslint-disable @typescript-eslint/no-explicit-any */
interface KeyManagerContract {
  click: (count: number) => Iterable<unknown>;
}

interface DisposalManagersDependencies {
  getGame: () => any;
  getSettings: () => Record<string, any>;
  getResources: () => Record<string, any>;
  getBuildings: () => Record<string, any>;
  getPoly: () => any;
  getVueById: (id: string) => any;
  getKeyManager: () => KeyManagerContract;
  haveTask: (task: string) => boolean;
}

export function createDisposalManagers({
  getGame,
  getSettings,
  getResources,
  getBuildings,
  getPoly,
  getVueById,
  getKeyManager,
  haveTask,
}: DisposalManagersDependencies) {
  const NaniteManager = {
    _industryVueBinding: "iNFactory",
    _industryVue: undefined as any,
    storageShift: 1.005,
    priorityList: [] as any[],

    // export const nf_resources from industry.js
    Resources: [
      "Lumber",
      "Chrysotile",
      "Stone",
      "Crystal",
      "Furs",
      "Copper",
      "Iron",
      "Aluminium",
      "Cement",
      "Coal",
      "Oil",
      "Uranium",
      "Steel",
      "Titanium",
      "Alloy",
      "Polymer",
      "Iridium",
      "Helium_3",
      "Water",
      "Deuterium",
      "Neutronium",
      "Adamantite",
      "Bolognium",
      "Orichalcum",
    ],

    resEnabled: (id: string) => getSettings()["res_nanite" + id],

    isUnlocked() {
      const game = getGame();
      const buildings = getBuildings();
      return (
        game.global.race["deconstructor"] &&
        (buildings.NaniteFactory.count > 0 ||
          buildings.RedNaniteFactory.count > 0 ||
          buildings.TauNaniteFactory.count > 0)
      );
    },

    isUseful() {
      return getResources().Nanite.storageRatio < 1;
    },

    initIndustry() {
      if (!this.isUnlocked()) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    isConsumable(res: any) {
      return this.Resources.includes(res.id);
    },

    updateResources() {
      if (!this.isUnlocked() || !getSettings().autoNanite) {
        return;
      }
      for (let resource of this.priorityList) {
        if (resource.isUnlocked()) {
          resource.rateMods["nanite"] = this.currentConsume(resource.id);
          resource.rateOfChange += resource.rateMods["nanite"];
        }
      }
    },

    managedPriorityList() {
      return this.priorityList;
    },

    maxConsume() {
      return getGame().global.city.nanite_factory.count * 50;
    },

    currentConsume(id: string) {
      return getGame().global.city.nanite_factory[id];
    },

    useRatio() {
      switch (getSettings().naniteMode) {
        case "cap":
          return [0.965];
        case "excess":
          return [-1];
        case "all":
          return [0.035];
        case "mixed":
          return [0.965, -1];
        case "full":
          return [0.965, -1, 0.035];
        default:
          return [];
      }
    },

    maxConsumeCraftable(resource: any) {
      let extraIncome = resource.rateOfChange;
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore);
    },

    maxConsumeForRatio(resource: any, keepRatio: number) {
      let extraIncome = resource.rateOfChange;
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore);
    },

    consumeMore(id: string, count: number) {
      const resources = getResources();
      resources[id].rateMods["nanite"] += count;

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue.addItem(id);
      }
    },

    consumeLess(id: string, count: number) {
      const resources = getResources();
      resources[id].rateMods["nanite"] -= count;

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue.subItem(id);
      }
    },
  };

  const SupplyManager = {
    _supplyVuePrefix: "supply",
    storageShift: 1.01,
    priorityList: [] as any[],

    resEnabled: (id: string) => getSettings()["res_supply" + id],

    isUnlocked() {
      return getBuildings().LakeTransport.count > 0;
    },

    isUseful() {
      const resources = getResources();
      const buildings = getBuildings();
      return (
        resources.Supply.storageRatio < 1 &&
        buildings.LakeTransport.stateOnCount > 0 &&
        buildings.LakeBireme.stateOnCount > 0
      );
    },

    initIndustry() {
      return this.isUnlocked();
    },

    isConsumable(res: any) {
      return getPoly().supplyValue.hasOwnProperty(res.id);
    },

    updateResources() {
      if (!this.isUnlocked() || !getSettings().autoSupply) {
        return;
      }
      for (let resource of this.priorityList) {
        if (resource.isUnlocked()) {
          resource.rateMods["supply"] =
            this.currentConsume(resource.id) * this.supplyOut(resource.id);
          resource.rateOfChange += resource.rateMods["supply"];
        }
      }
    },

    supplyIn(id: string) {
      return getPoly().supplyValue[id]?.in ?? 0;
    },

    supplyOut(id: string) {
      return getPoly().supplyValue[id]?.out ?? 0;
    },

    managedPriorityList() {
      return this.priorityList;
    },

    maxConsume() {
      return getGame().global.portal.transport.cargo.max;
    },

    currentConsume(id: string) {
      return getGame().global.portal.transport.cargo[id];
    },

    useRatio() {
      switch (getSettings().supplyMode) {
        case "cap":
          return [0.975];
        case "excess":
          return [-1];
        case "all":
          return [0.045];
        case "mixed":
          return [0.975, -1];
        case "full":
          return [0.975, -1, 0.045];
        default:
          return [];
      }
    },

    maxConsumeCraftable(resource: any) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        nanite: true,
      });
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore) / this.supplyOut(resource.id);
    },

    maxConsumeForRatio(resource: any, keepRatio: number) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        nanite: true,
      });
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore) / this.supplyOut(resource.id);
    },

    consumeMore(id: string, count: number) {
      const resources = getResources();
      let vue = getVueById(this._supplyVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["supply"] += count * this.supplyOut(id);

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.supplyMore(id);
      }
    },

    consumeLess(id: string, count: number) {
      const resources = getResources();
      let vue = getVueById(this._supplyVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["supply"] -= count * this.supplyOut(id);

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.supplyLess(id);
      }
    },
  };

  const EjectManager = {
    _ejectVuePrefix: "eject",
    storageShift: 1.015,
    priorityList: [] as any[],

    resEnabled: (id: string) => getSettings()["res_eject" + id],

    isUnlocked() {
      return getBuildings().BlackholeMassEjector.count > 0;
    },

    isUseful() {
      return true; // Never stop ejecting
    },

    initIndustry() {
      return this.isUnlocked();
    },

    isConsumable(res: any) {
      return getGame().atomic_mass.hasOwnProperty(res.id);
    },

    updateResources() {
      if (
        !this.isUnlocked() ||
        (!getSettings().autoEject && !haveTask("trash"))
      ) {
        return;
      }
      for (let resource of this.priorityList) {
        if (resource.isUnlocked()) {
          resource.rateMods["eject"] = this.currentConsume(resource.id);
          resource.rateOfChange += resource.rateMods["eject"];
        }
      }
    },

    managedPriorityList() {
      const game = getGame();
      const resources = getResources();
      return !game.global.race["artifical"]
        ? this.priorityList
        : this.priorityList.filter((r) => r !== resources.Food);
    },

    maxConsume() {
      return getGame().global.interstellar.mass_ejector.on * 1000;
    },

    currentConsume(id: string) {
      return getGame().global.interstellar.mass_ejector[id];
    },

    useRatio() {
      switch (getSettings().ejectMode) {
        case "cap":
          return [0.985];
        case "excess":
          return [-1];
        case "all":
          return [0.055];
        case "mixed":
          return [0.985, -1];
        case "full":
          return [0.985, -1, 0.055];
        default:
          return [];
      }
    },

    maxConsumeCraftable(resource: any) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        supply: true,
        nanite: true,
      });
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore);
    },

    maxConsumeForRatio(resource: any, keepRatio: number) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        supply: true,
        nanite: true,
      });
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore);
    },

    consumeMore(id: string, count: number) {
      const resources = getResources();
      let vue = getVueById(this._ejectVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["eject"] += count;

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.ejectMore(id);
      }
    },

    consumeLess(id: string, count: number) {
      const resources = getResources();
      let vue = getVueById(this._ejectVuePrefix + id);
      if (vue === undefined) {
        return false;
      }

      resources[id].rateMods["eject"] -= count;

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.ejectLess(id);
      }
    },
  };

  return { NaniteManager, SupplyManager, EjectManager };
}
