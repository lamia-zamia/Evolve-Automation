/* eslint-disable @typescript-eslint/no-explicit-any */
interface IndustryVue {
  add: (production?: unknown) => void;
  sub: (production?: unknown) => void;
}

interface KeyManagerContract {
  click: (count: number) => Iterable<unknown>;
}

interface IndustryManagersDependencies {
  getGame: () => any;
  getBuildings: () => Record<string, { count: number }>;
  getVueById: (id: string) => any;
  getKeyManager: () => KeyManagerContract;
  haveTech: (tech: string, level?: number) => boolean;
}

export function createIndustryManagers({
  getGame,
  getBuildings,
  getVueById,
  getKeyManager,
  haveTech,
}: IndustryManagersDependencies) {
  const QuarryManager = {
    _industryVueBinding: "iQuarry",
    _industryVue: undefined as IndustryVue | undefined,

    initIndustry() {
      const game = getGame();
      const buildings = getBuildings();
      if (!game.global.race["smoldering"] || buildings.RockQuarry.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentProduction() {
      const game = getGame();
      return game.global.city.rock_quarry.asbestos;
    },

    increaseProduction(count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue!.add();
      }
    },

    decreaseProduction(count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue!.sub();
      }
    },
  };

  const MineManager = {
    _industryVueBinding: "iTMine",
    _industryVue: undefined as IndustryVue | undefined,

    initIndustry() {
      const buildings = getBuildings();
      if (buildings.TitanMine.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentProduction() {
      const game = getGame();
      return game.global.space.titan_mine.ratio;
    },

    increaseProduction(count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue!.add();
      }
    },

    decreaseProduction(count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue!.sub();
      }
    },
  };

  const ExtractorManager = {
    _industryVueBinding: "iMiningShip",
    _industryVue: undefined as IndustryVue | undefined,

    initIndustry() {
      const buildings = getBuildings();
      if (!haveTech("tau_roid", 4) || buildings.TauBeltMiningShip.count < 1) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentProduction(production: string) {
      const game = getGame();
      return game.global.tauceti.mining_ship[production];
    },

    increaseProduction(production: string, count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue!.add(production);
      }
    },

    decreaseProduction(production: string, count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue!.sub(production);
      }
    },
  };

  return { QuarryManager, MineManager, ExtractorManager };
}
