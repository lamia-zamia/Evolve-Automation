import type { GameDisposalControlsPort } from "../ports/game-disposal-controls.ts";
import type { GameIndustryControlsPort } from "../ports/game-industry-controls.ts";

interface DisposalResource {
  id: string;
  isUnlocked: () => boolean;
  rateOfChange: number;
  rateMods: Record<string, number>;
  currentQuantity: number;
  storageRequired: number;
  storageRatio: number;
  maxQuantity: number;
  calculateRateOfChange: (options: {
    buy: boolean;
    supply?: boolean;
    nanite?: boolean;
  }) => number;
}

interface DisposalResources extends Record<string, DisposalResource> {
  Food: DisposalResource;
  Supply: DisposalResource;
}

interface DisposalBuilding {
  count: number;
  stateOnCount: number;
}

interface DisposalBuildings extends Record<string, DisposalBuilding> {
  BlackholeMassEjector: DisposalBuilding;
  LakeBireme: DisposalBuilding;
  LakeTransport: DisposalBuilding;
}

interface DisposalSettings {
  autoEject: boolean;
  autoNanite: boolean;
  autoSupply: boolean;
  ejectMode: string;
  naniteMode: string;
  supplyMode: string;
  [key: string]: boolean | number | string | undefined;
}

interface DisposalGame {
  global: {
    city: { nanite_factory: { count: number; [key: string]: number } };
    portal: { transport: { cargo: { max: number; [key: string]: number } } };
    interstellar: {
      mass_ejector: { on: number; [key: string]: number };
    };
    race: Record<string, boolean>;
  };
  atomic_mass: Record<string, number>;
}

interface DisposalPoly {
  supplyValue: Record<string, { in?: number; out?: number }>;
}

interface DisposalManagersDependencies {
  getGame: () => DisposalGame;
  getSettings: () => DisposalSettings;
  getResources: () => DisposalResources;
  getBuildings: () => DisposalBuildings;
  getPoly: () => DisposalPoly;
  haveTask: (task: string) => boolean;
  industryControls: GameIndustryControlsPort;
  disposalControls: GameDisposalControlsPort;
}

export function createDisposalManagers({
  getGame,
  getSettings,
  getResources,
  getBuildings,
  getPoly,
  haveTask,
  industryControls,
  disposalControls,
}: DisposalManagersDependencies) {
  const NaniteManager = {
    _industryElementId: "iNFactory",
    storageShift: 1.005,
    priorityList: [] as DisposalResource[],

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

      return industryControls.isRendered(this._industryElementId);
    },

    isConsumable(res: DisposalResource) {
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

    maxConsumeCraftable(resource: DisposalResource) {
      let extraIncome = resource.rateOfChange;
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore);
    },

    maxConsumeForRatio(resource: DisposalResource, keepRatio: number) {
      let extraIncome = resource.rateOfChange;
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore);
    },

    consumeMore(id: string, count: number) {
      const resources = getResources();
      resources[id].rateMods["nanite"] += count;

      return industryControls.increaseItem({
        elementId: this._industryElementId,
        id,
        count,
      });
    },

    consumeLess(id: string, count: number) {
      const resources = getResources();
      resources[id].rateMods["nanite"] -= count;

      return industryControls.decreaseItem({
        elementId: this._industryElementId,
        id,
        count,
      });
    },
  };

  const SupplyManager = {
    _supplyElementPrefix: "supply",
    storageShift: 1.01,
    priorityList: [] as DisposalResource[],

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

    isConsumable(res: DisposalResource) {
      return Object.hasOwn(getPoly().supplyValue, res.id);
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

    maxConsumeCraftable(resource: DisposalResource) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        nanite: true,
      });
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore) / this.supplyOut(resource.id);
    },

    maxConsumeForRatio(resource: DisposalResource, keepRatio: number) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        nanite: true,
      });
      let extraStore =
        (resource.storageRatio - keepRatio) * resource.maxQuantity;
      return Math.max(extraIncome, extraStore) / this.supplyOut(resource.id);
    },

    consumeMore(id: string, count: number) {
      if (
        !disposalControls.increaseSupply({
          elementId: this._supplyElementPrefix + id,
          id,
          count,
        })
      ) {
        return false;
      }

      getResources()[id].rateMods["supply"] += count * this.supplyOut(id);
      return true;
    },

    consumeLess(id: string, count: number) {
      if (
        !disposalControls.decreaseSupply({
          elementId: this._supplyElementPrefix + id,
          id,
          count,
        })
      ) {
        return false;
      }

      getResources()[id].rateMods["supply"] -= count * this.supplyOut(id);
      return true;
    },
  };

  const EjectManager = {
    _ejectElementPrefix: "eject",
    storageShift: 1.015,
    priorityList: [] as DisposalResource[],

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

    isConsumable(res: DisposalResource) {
      return Object.hasOwn(getGame().atomic_mass, res.id);
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

    maxConsumeCraftable(resource: DisposalResource) {
      let extraIncome = resource.calculateRateOfChange({
        buy: false,
        supply: true,
        nanite: true,
      });
      let extraStore =
        resource.currentQuantity - resource.storageRequired * this.storageShift;
      return Math.max(extraIncome, extraStore);
    },

    maxConsumeForRatio(resource: DisposalResource, keepRatio: number) {
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
      if (
        !disposalControls.increaseEject({
          elementId: this._ejectElementPrefix + id,
          id,
          count,
        })
      ) {
        return false;
      }

      getResources()[id].rateMods["eject"] += count;
      return true;
    },

    consumeLess(id: string, count: number) {
      if (
        !disposalControls.decreaseEject({
          elementId: this._ejectElementPrefix + id,
          id,
          count,
        })
      ) {
        return false;
      }

      getResources()[id].rateMods["eject"] -= count;
      return true;
    },
  };

  return { NaniteManager, SupplyManager, EjectManager };
}
