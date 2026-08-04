/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameIndustryControlsPort } from "../ports/game-industry-controls.ts";

interface ProductionManagersDependencies {
  getGame: () => any;
  getResources: () => Record<string, any>;
  getBuildings: () => Record<string, any>;
  industryControls: GameIndustryControlsPort;
  haveTech: (tech: string, level?: number) => boolean;
  isLumberRace: () => boolean;
  addProps: (
    target: any,
    idFn: (item: any) => string,
    specs: { s: string; p: string }[],
  ) => any;
  normalizeProperties: (target: any, classes?: any[]) => any;
  replicableResources: string[];
  ResourceProductionCost: new (resource: any, a: any, b: any) => any;
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
            unlocked: () => getGame().global.resource.Oil.display,
            cost: [new ResourceProductionCost(resources.Oil, 0.35, 2)],
          },
          Coal: {
            id: "Coal",
            unlocked: () => getGame().global.resource.Coal.display,
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
            unlocked: () => isLumberRace() || getGame().global.race["evil"],
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
        (a: any, b: any) => a.priority - b.priority,
      );
    },

    fueledCount(fuel: any) {
      if (!fuel.unlocked) {
        return 0;
      }

      return getGame().global.city.smelter[fuel.id];
    },

    smeltingCount(production: any) {
      if (!production.unlocked) {
        return 0;
      }

      return getGame().global.city.smelter[production.id];
    },

    increaseFuel(fuel: any, count: number): boolean {
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

    decreaseFuel(fuel: any, count: number): boolean {
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
      if (count === 0 || !this.Productions[id].unlocked) {
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
      if (count === 0 || !this.Productions[id].unlocked) {
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
                () => FactoryManager.f_rate("Lux", "fur"),
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
                () => FactoryManager.f_rate("Furs", "money"),
                1000,
              ),
              new ResourceProductionCost(
                resources.Polymer,
                () => FactoryManager.f_rate("Furs", "polymer"),
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
                () => FactoryManager.f_rate("Alloy", "copper"),
                5,
              ),
              new ResourceProductionCost(
                resources.Aluminium,
                () => FactoryManager.f_rate("Alloy", "aluminium"),
                5,
              ),
            ],
          },
          Polymer: {
            id: "Polymer",
            resource: resources.Polymer,
            unlocked: () => haveTech("polymer"),
            cost: function () {
              return !isLumberRace() ? this.cost_kk : this.cost_normal;
            },
            cost_kk: [
              new ResourceProductionCost(
                resources.Oil,
                () => FactoryManager.f_rate("Polymer", "oil_kk"),
                2,
              ),
            ],
            cost_normal: [
              new ResourceProductionCost(
                resources.Oil,
                () => FactoryManager.f_rate("Polymer", "oil"),
                2,
              ),
              new ResourceProductionCost(
                resources.Lumber,
                () => FactoryManager.f_rate("Polymer", "lumber"),
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
                () => FactoryManager.f_rate("Nano_Tube", "coal"),
                15,
              ),
              new ResourceProductionCost(
                resources.Neutronium,
                () => FactoryManager.f_rate("Nano_Tube", "neutronium"),
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
                () => FactoryManager.f_rate("Stanene", "aluminium"),
                50,
              ),
              new ResourceProductionCost(
                resources.Nano_Tube,
                () => FactoryManager.f_rate("Stanene", "nano"),
                5,
              ),
            ],
          },
        },
        [ResourceProductionCost],
      ),
      (p) => p.resource.id,
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
      const game = getGame();
      return game.f_rate[production][resource][
        game.global.tech["factory"] || 0
      ];
    },

    currentOperating() {
      const game = getGame();
      let total = 0;
      for (let key in this.Productions) {
        let production = this.Productions[key];
        total += game.global.city.factory[production.id];
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
        let production = this.Productions[key];
        if (production.unlocked && !production.enabled) {
          max -= game.global.city.factory[production.id];
        }
      }
      return max;
    },

    currentProduction(production: any) {
      const game = getGame();
      return production.unlocked ? game.global.city.factory[production.id] : 0;
    },

    increaseProduction(production: any, count: number): boolean {
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

    decreaseProduction(production: any, count: number): boolean {
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
            (a, res) => ({
              ...a,
              [res.id]: {
                id: res.id,
                resource: res,
                unlocked: () => res.isUnlocked(),
                cost: [],
              },
            }),
            {},
          ),
      ),
      (p) => p.resource.id,
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

    setResource(res: any): boolean {
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
      (p) => p.resource.id,
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
        let production = this.Productions[key];
        total += game.global.interstellar.mining_droid[production.id];
      }
      return total;
    },

    maxOperating() {
      return getGame().global.interstellar.mining_droid.on;
    },

    currentProduction(production: any) {
      return getGame().global.interstellar.mining_droid[production.id];
    },

    increaseProduction(production: any, count: number): boolean {
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

    decreaseProduction(production: any, count: number): boolean {
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
    _graphPlant: null as any,

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
      return this._graphPlant.instance.on;
    },

    fueledCount(fuel: any) {
      return this._graphPlant.instance[fuel.id];
    },

    increaseFuel(fuel: any, count: number): boolean {
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

    decreaseFuel(fuel: any, count: number): boolean {
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
