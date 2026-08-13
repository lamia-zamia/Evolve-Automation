import type { GameIndustryControlsPort } from "../ports/game-industry-controls.ts";

interface ProductionResource {
  id: string;
  isUnlocked: () => boolean;
}

interface ProductionResources extends Record<string, ProductionResource> {
  Adamantite: ProductionResource;
  Aluminium: ProductionResource;
  Alloy: ProductionResource;
  Coal: ProductionResource;
  Copper: ProductionResource;
  Food: ProductionResource;
  Furs: ProductionResource;
  Infernite: ProductionResource;
  Iridium: ProductionResource;
  Iron: ProductionResource;
  Lumber: ProductionResource;
  Money: ProductionResource;
  Nano_Tube: ProductionResource;
  Neutronium: ProductionResource;
  Oil: ProductionResource;
  Polymer: ProductionResource;
  Stanene: ProductionResource;
  Steel: ProductionResource;
  Uranium: ProductionResource;
}

interface ProductionCost {
  resource: ProductionResource;
}

type ProductionCostInput = number | (() => number | ProductionResource);

interface ProductionDefinition {
  id: string;
  resource?: ProductionResource;
  unlocked?: boolean | (() => boolean);
  enabled?: boolean;
  weighting?: number;
  priority?: number;
  cost?: ProductionCost[] | (() => ProductionCost[]);
  cost_kk?: ProductionCost[];
  cost_normal?: ProductionCost[];
}

interface ManagedProduction extends ProductionDefinition {
  priority: number;
  weighting: number;
  enabled: boolean;
}

interface ProductionBuilding {
  count: number;
  stateOnCount: number;
  instance?: {
    count: number;
    on: number;
    [key: string]: number;
  };
}

interface ProductionBuildings extends Record<string, ProductionBuilding> {
  AlphaGraphenePlant: ProductionBuilding;
  AlphaMegaFactory: ProductionBuilding;
  AlphaMiningDroid: ProductionBuilding;
  Factory: ProductionBuilding;
  RedFactory: ProductionBuilding;
  Smelter: ProductionBuilding;
  TauFactory: ProductionBuilding;
  TitanGraphene: ProductionBuilding;
  WastelandHellFactory: ProductionBuilding;
  WastelandTwistedLab: ProductionBuilding;
}

interface ProductionRace {
  species: string;
  [key: string]: boolean | string;
}

interface ProductionGame {
  global: {
    resource: Record<string, { display: boolean }>;
    race: ProductionRace;
    tech: Record<string, number>;
    city: {
      smelter: Record<string, number> & { Star: number; cap: number };
      factory?: Record<string, number>;
    };
    portal?: { hell_factory?: { rank?: number } };
    interstellar: {
      mining_droid: Record<string, number> & { on: number };
    };
  };
  f_rate: Record<string, Record<string, Record<number, number>>>;
}

interface GrapheneFuel {
  id: string;
  cost: ProductionCost;
}

interface ProductionManagersDependencies {
  getGame: () => ProductionGame;
  getResources: () => ProductionResources;
  getBuildings: () => ProductionBuildings;
  industryControls: GameIndustryControlsPort;
  haveTech: (tech: string, level?: number) => boolean;
  isLumberRace: () => boolean;
  addProps: (
    target: Record<string, ProductionDefinition>,
    idFn: (item: ProductionDefinition) => string,
    specs: { s: string; p: string }[],
  ) => Record<string, ManagedProduction>;
  normalizeProperties: (
    target: Record<string, ProductionDefinition>,
    classes?: unknown[],
  ) => Record<string, ProductionDefinition>;
  replicableResources: string[];
  ResourceProductionCost: new (
    resource: ProductionResource | (() => ProductionResource),
    a: ProductionCostInput,
    b: number,
  ) => ProductionCost;
}

export function createProductionManagers({
  getGame,
  getResources,
  getBuildings,
  industryControls,
  haveTech,
  isLumberRace,
  addProps,
  normalizeProperties,
  replicableResources,
  ResourceProductionCost,
}: ProductionManagersDependencies) {
  // Productions/Fuels are built once at construction, matching the original
  // module-init behavior; the resource catalog identity is stable thereafter.
  const resources = getResources();

  const SmelterManager = {
    _industryElementId: "iSmelter",

    Productions: normalizeProperties(
      {
        Iron: {
          id: "Iron",
          unlocked: () => true,
          resource: resources.Iron,
          cost: [],
        },
        Steel: {
          id: "Steel",
          unlocked: () =>
            resources.Steel.isUnlocked() && haveTech("smelting", 2),
          resource: resources.Steel,
          cost: [
            new ResourceProductionCost(resources.Coal, 0.25, 1.25),
            new ResourceProductionCost(resources.Iron, 2, 6),
          ],
        },
        Iridium: {
          id: "Iridium",
          unlocked: () =>
            resources.Iridium.isUnlocked() &&
            (haveTech("m_smelting", 2) || haveTech("irid_smelting")),
          resource: resources.Iridium,
          cost: [],
        },
      },
      [ResourceProductionCost],
    ),

    Fuels: addProps(
      normalizeProperties(
        {
          Oil: {
            id: "Oil",
            unlocked: () => getGame().global.resource.Oil?.display ?? false,
            cost: [new ResourceProductionCost(resources.Oil, 0.35, 2)],
          },
          Coal: {
            id: "Coal",
            unlocked: () => getGame().global.resource.Coal?.display ?? false,
            cost: [
              new ResourceProductionCost(
                resources.Coal,
                () => (!isLumberRace() ? 0.15 : 0.25),
                2,
              ),
            ],
          },
          Wood: {
            id: "Wood",
            unlocked: () =>
              isLumberRace() || Boolean(getGame().global.race["evil"]),
            cost: [
              new ResourceProductionCost(
                () =>
                  getGame().global.race["evil"]
                    ? getGame().global.race["soul_eater"] &&
                      getGame().global.race.species !== "wendigo"
                      ? resources.Food
                      : resources.Furs
                    : resources.Lumber,
                () =>
                  (getGame().global.race["evil"] &&
                    !getGame().global.race["soul_eater"]) ||
                  getGame().global.race.species === "wendigo"
                    ? 1
                    : 3,
                6,
              ),
            ],
          },
          Inferno: {
            id: "Inferno",
            unlocked: () => haveTech("smelting", 8),
            cost: [
              new ResourceProductionCost(resources.Coal, 50, 50),
              new ResourceProductionCost(resources.Oil, 35, 50),
              new ResourceProductionCost(resources.Infernite, 0.5, 50),
            ],
          },
        },
        [ResourceProductionCost],
      ),
      (f) => f.id,
      [{ s: "smelter_fuel_p_", p: "priority" }],
    ),

    initIndustry() {
      const game = getGame();
      const buildings = getBuildings();
      if (
        game.global.race["steelen"] ||
        (buildings.Smelter.count < 1 &&
          !game.global.race["cataclysm"] &&
          !game.global.race["orbit_decayed"] &&
          !haveTech("isolation") &&
          !game.global.race["warlord"])
      ) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    managedFuelPriorityList() {
      return Object.values(this.Fuels).sort(
        (a: ManagedProduction, b: ManagedProduction) => a.priority - b.priority,
      );
    },

    fueledCount(fuel: ManagedProduction) {
      if (!fuel.unlocked) {
        return 0;
      }

      return getGame().global.city.smelter[fuel.id];
    },

    smeltingCount(production: ManagedProduction) {
      if (!production.unlocked) {
        return 0;
      }

      return getGame().global.city.smelter[production.id];
    },

    increaseFuel(fuel: ManagedProduction, count: number): boolean {
      if (count === 0 || !fuel.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.decreaseFuel(fuel, count * -1);
      }

      return industryControls.increaseFuel({
        elementId: this._industryElementId,
        id: fuel.id,
        count,
      });
    },

    decreaseFuel(fuel: ManagedProduction, count: number): boolean {
      if (count === 0 || !fuel.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.increaseFuel(fuel, count * -1);
      }

      return industryControls.decreaseFuel({
        elementId: this._industryElementId,
        id: fuel.id,
        count,
      });
    },

    increaseSmelting(id: string, count: number): boolean {
      const production = this.Productions[id];
      if (count === 0 || !production?.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.decreaseSmelting(id, count * -1);
      }

      return industryControls.increaseMetal({
        elementId: this._industryElementId,
        id,
        count,
      });
    },

    decreaseSmelting(id: string, count: number): boolean {
      const production = this.Productions[id];
      if (count === 0 || !production?.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.increaseSmelting(id, count * -1);
      }

      return industryControls.decreaseMetal({
        elementId: this._industryElementId,
        id,
        count,
      });
    },

    maxOperating() {
      const game = getGame();
      return game.global.city.smelter.cap - game.global.city.smelter.Star;
    },

    extraOperating() {
      return getGame().global.city.smelter.Star;
    },
  };

  const factoryRate = (production: string, resource: string) => {
    const game = getGame();
    const productionRates = game.f_rate[production];
    const resourceRates = productionRates?.[resource];
    return resourceRates?.[game.global.tech["factory"] || 0] ?? 0;
  };

  const FactoryManager = {
    _industryElementId: "iFactory",

    Productions: addProps(
      normalizeProperties(
        {
          LuxuryGoods: {
            id: "Lux",
            resource: resources.Money,
            unlocked: () => true,
            cost: [
              new ResourceProductionCost(
                resources.Furs,
                () => factoryRate("Lux", "fur"),
                5,
              ),
            ],
          },
          Furs: {
            id: "Furs",
            resource: resources.Furs,
            unlocked: () => haveTech("synthetic_fur"),
            cost: [
              new ResourceProductionCost(
                resources.Money,
                () => factoryRate("Furs", "money"),
                1000,
              ),
              new ResourceProductionCost(
                resources.Polymer,
                () => factoryRate("Furs", "polymer"),
                10,
              ),
            ],
          },
          Alloy: {
            id: "Alloy",
            resource: resources.Alloy,
            unlocked: () => true,
            cost: [
              new ResourceProductionCost(
                resources.Copper,
                () => factoryRate("Alloy", "copper"),
                5,
              ),
              new ResourceProductionCost(
                resources.Aluminium,
                () => factoryRate("Alloy", "aluminium"),
                5,
              ),
            ],
          },
          Polymer: {
            id: "Polymer",
            resource: resources.Polymer,
            unlocked: () => haveTech("polymer"),
            cost: function () {
              return !isLumberRace()
                ? (this.cost_kk ?? [])
                : (this.cost_normal ?? []);
            },
            cost_kk: [
              new ResourceProductionCost(
                resources.Oil,
                () => factoryRate("Polymer", "oil_kk"),
                2,
              ),
            ],
            cost_normal: [
              new ResourceProductionCost(
                resources.Oil,
                () => factoryRate("Polymer", "oil"),
                2,
              ),
              new ResourceProductionCost(
                resources.Lumber,
                () => factoryRate("Polymer", "lumber"),
                50,
              ),
            ],
          },
          NanoTube: {
            id: "Nano",
            resource: resources.Nano_Tube,
            unlocked: () => haveTech("nano"),
            cost: [
              new ResourceProductionCost(
                resources.Coal,
                () => factoryRate("Nano_Tube", "coal"),
                15,
              ),
              new ResourceProductionCost(
                resources.Neutronium,
                () => factoryRate("Nano_Tube", "neutronium"),
                0.2,
              ),
            ],
          },
          Stanene: {
            id: "Stanene",
            resource: resources.Stanene,
            unlocked: () => haveTech("stanene"),
            cost: [
              new ResourceProductionCost(
                resources.Aluminium,
                () => factoryRate("Stanene", "aluminium"),
                50,
              ),
              new ResourceProductionCost(
                resources.Nano_Tube,
                () => factoryRate("Stanene", "nano"),
                5,
              ),
            ],
          },
        },
        [ResourceProductionCost],
      ),
      (p) => p.resource!.id,
      [
        { s: "production_", p: "enabled" },
        { s: "production_w_", p: "weighting" },
        { s: "production_p_", p: "priority" },
      ],
    ),

    initIndustry() {
      const buildings = getBuildings();
      if (
        buildings.Factory.count < 1 &&
        buildings.RedFactory.count < 1 &&
        buildings.TauFactory.count < 1 &&
        buildings.WastelandHellFactory.count < 1
      ) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    f_rate(production: string, resource: string) {
      return factoryRate(production, resource);
    },

    currentOperating() {
      const game = getGame();
      let total = 0;
      for (let key in this.Productions) {
        const production = this.Productions[key];
        if (!production) {
          continue;
        }
        total += game.global.city.factory![production.id]!;
      }
      return total;
    },

    maxOperating() {
      const game = getGame();
      const buildings = getBuildings();
      let max =
        buildings.Factory.stateOnCount +
        buildings.RedFactory.stateOnCount +
        buildings.AlphaMegaFactory.stateOnCount * 2 +
        buildings.TauFactory.stateOnCount * (haveTech("isolation") ? 5 : 3) +
        buildings.WastelandHellFactory.stateOnCount *
          (3 + (game.global.portal?.hell_factory?.rank || 1));
      if (!game.global.city.factory) {
        return max;
      }
      for (let key in this.Productions) {
        const production = this.Productions[key];
        if (!production) {
          continue;
        }
        if (production.unlocked && !production.enabled) {
          max -= game.global.city.factory[production.id]!;
        }
      }
      return max;
    },

    currentProduction(production: ManagedProduction) {
      const game = getGame();
      return production.unlocked
        ? game.global.city.factory![production.id]!
        : 0;
    },

    increaseProduction(production: ManagedProduction, count: number): boolean {
      if (count === 0 || !production.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      return industryControls.increaseItem({
        elementId: this._industryElementId,
        id: production.id,
        count,
      });
    },

    decreaseProduction(production: ManagedProduction, count: number): boolean {
      if (count === 0 || !production.unlocked) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      return industryControls.decreaseItem({
        elementId: this._industryElementId,
        id: production.id,
        count,
      });
    },
  };

  const ReplicatorManager = {
    _industryElementId: "iReplicator",

    Productions: addProps(
      normalizeProperties(
        replicableResources
          .map((resId) => resources[resId])
          .reduce(
            (a, res) => {
              if (!res) {
                return a;
              }
              return {
                ...a,
                [res.id]: {
                  id: res.id,
                  resource: res,
                  unlocked: () => res.isUnlocked(),
                  cost: [],
                },
              };
            },
            {} as Record<string, ProductionDefinition>,
          ),
      ),
      (p) => p.resource!.id,
      [
        { s: "replicator_", p: "enabled" },
        { s: "replicator_w_", p: "weighting" },
        { s: "replicator_p_", p: "priority" },
      ],
    ),

    initIndustry() {
      if (!haveTech("replicator")) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    setResource(res: string): boolean {
      return industryControls.select({
        elementId: this._industryElementId,
        id: res,
      });
    },
  };

  const DroidManager = {
    _industryElementId: "iDroid",

    Productions: addProps(
      {
        Adamantite: { id: "adam", resource: resources.Adamantite },
        Uranium: { id: "uran", resource: resources.Uranium },
        Coal: { id: "coal", resource: resources.Coal },
        Aluminium: { id: "alum", resource: resources.Aluminium },
      },
      (p) => p.resource!.id,
      [
        { s: "droid_w_", p: "weighting" },
        { s: "droid_pr_", p: "priority" },
      ],
    ),

    initIndustry() {
      const buildings = getBuildings();
      if (buildings.AlphaMiningDroid.count < 1) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    currentOperating() {
      const game = getGame();
      let total = 0;
      for (let key in this.Productions) {
        const production = this.Productions[key];
        if (!production) {
          continue;
        }
        total += game.global.interstellar.mining_droid[production.id] ?? 0;
      }
      return total;
    },

    maxOperating() {
      return getGame().global.interstellar.mining_droid.on;
    },

    currentProduction(production: ManagedProduction) {
      return getGame().global.interstellar.mining_droid[production.id];
    },

    increaseProduction(production: ManagedProduction, count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      return industryControls.increaseItem({
        elementId: this._industryElementId,
        id: production.id,
        count,
      });
    },

    decreaseProduction(production: ManagedProduction, count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      return industryControls.decreaseItem({
        elementId: this._industryElementId,
        id: production.id,
        count,
      });
    },
  };

  const GrapheneManager = {
    _industryElementId: "iGraphene",
    _graphPlant: null as ProductionBuilding | null,

    Fuels: {
      Lumber: {
        id: "Lumber",
        cost: new ResourceProductionCost(resources.Lumber, 350, 100),
      },
      Coal: {
        id: "Coal",
        cost: new ResourceProductionCost(resources.Coal, 25, 10),
      },
      Oil: {
        id: "Oil",
        cost: new ResourceProductionCost(resources.Oil, 15, 10),
      },
    },

    initIndustry() {
      const game = getGame();
      const buildings = getBuildings();
      this._graphPlant = game.global.race["warlord"]
        ? buildings.WastelandTwistedLab
        : game.global.race["truepath"]
          ? buildings.TitanGraphene
          : buildings.AlphaGraphenePlant;
      if ((this._graphPlant.instance?.count ?? 0) < 1) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    maxOperating() {
      return this._graphPlant!.instance!.on;
    },

    fueledCount(fuel: GrapheneFuel) {
      return this._graphPlant!.instance![fuel.id]!;
    },

    increaseFuel(fuel: GrapheneFuel, count: number): boolean {
      if (count === 0 || !fuel.cost.resource.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.decreaseFuel(fuel, count * -1);
      }

      return industryControls.increaseFuel({
        elementId: this._industryElementId,
        id: fuel.id,
        count,
      });
    },

    decreaseFuel(fuel: GrapheneFuel, count: number): boolean {
      if (count === 0 || !fuel.cost.resource.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.increaseFuel(fuel, count * -1);
      }

      return industryControls.decreaseFuel({
        elementId: this._industryElementId,
        id: fuel.id,
        count,
      });
    },
  };

  return {
    SmelterManager,
    FactoryManager,
    ReplicatorManager,
    DroidManager,
    GrapheneManager,
  };
}
