import type { GameIndustryControlsPort } from "../ports/game-industry-controls.ts";

interface IndustryGame {
  global: {
    race: Record<string, boolean>;
    city: {
      rock_quarry: { asbestos: number };
    };
    space: {
      titan_mine: { ratio: number };
    };
    tauceti: {
      mining_ship: Record<string, number>;
    };
  };
}

interface IndustryManagersDependencies {
  getGame: () => IndustryGame;
  getBuildings: () => Record<string, { count: number }>;
  industryControls: GameIndustryControlsPort;
  haveTech: (tech: string, level?: number) => boolean;
}

export function createIndustryManagers({
  getGame,
  getBuildings,
  industryControls,
  haveTech,
}: IndustryManagersDependencies) {
  const QuarryManager = {
    _industryElementId: "iQuarry",

    initIndustry(): boolean {
      const game = getGame();
      const buildings = getBuildings();
      if (!game.global.race["smoldering"] || buildings.RockQuarry!.count < 1) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    currentProduction() {
      const game = getGame();
      return game.global.city.rock_quarry.asbestos;
    },

    increaseProduction(count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(-count);
      }

      return industryControls.increase({
        elementId: this._industryElementId,
        count,
      });
    },

    decreaseProduction(count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(-count);
      }

      return industryControls.decrease({
        elementId: this._industryElementId,
        count,
      });
    },
  };

  const MineManager = {
    _industryElementId: "iTMine",

    initIndustry(): boolean {
      const buildings = getBuildings();
      if (buildings.TitanMine!.count < 1) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    currentProduction() {
      const game = getGame();
      return game.global.space.titan_mine.ratio;
    },

    increaseProduction(count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(-count);
      }

      return industryControls.increase({
        elementId: this._industryElementId,
        count,
      });
    },

    decreaseProduction(count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(-count);
      }

      return industryControls.decrease({
        elementId: this._industryElementId,
        count,
      });
    },
  };

  const ExtractorManager = {
    _industryElementId: "iMiningShip",

    initIndustry(): boolean {
      const buildings = getBuildings();
      if (!haveTech("tau_roid", 4) || buildings.TauBeltMiningShip!.count < 1) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    currentProduction(production: string) {
      const game = getGame();
      return game.global.tauceti.mining_ship[production];
    },

    increaseProduction(production: string, count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, -count);
      }

      return industryControls.increase({
        elementId: this._industryElementId,
        count,
        id: production,
      });
    },

    decreaseProduction(production: string, count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, -count);
      }

      return industryControls.decrease({
        elementId: this._industryElementId,
        count,
        id: production,
      });
    },
  };

  return { QuarryManager, MineManager, ExtractorManager };
}
