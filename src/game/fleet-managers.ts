import type { GameFleetControlsPort } from "../ports/game-fleet-controls.ts";

/** A ship design: one part per blueprint dimension, plus the game's own name. */
type ShipBlueprint = Record<string, string>;

/** The blueprint dimensions every configured or built ship carries. */
type ShipParts = {
  class: string;
  power: string;
  weapon: string;
  armor: string;
  engine: string;
  sensor: string;
};

/** A ship the game has built and parked. */
type Ship = ShipParts & {
  location: string;
  transit: number;
  fueled: boolean;
  damage: number;
};

type Shipyard = {
  blueprint: ShipBlueprint;
  /** The game adds the list with the first built ship. */
  ships?: Ship[];
};

type SpaceActionInfo = {
  name: string | (() => string);
  /** Only regions that can be raided define it. */
  syndicate?: () => boolean;
  /**
   * Only the outer regions whose piracy cap scales define it, and the divisor
   * switch below reaches the call for exactly those regions.
   */
  syndicate_cap: () => number;
};

type GameSurface = {
  global: {
    tech: Record<string, number>;
    race: Record<string, unknown>;
    civic: { foreign: { gov3: { hstl: number } } };
    space: {
      // Evolve creates both bags lazily with the Truepath content that unlocks
      // them. Every read below guards for their absence.
      shipyard?: Shipyard;
      syndicate?: Record<string, number>;
    };
  };
  actions: { space: Record<string, { info: SpaceActionInfo }> };
  loc(key: string): string;
};

type SettingsSurface = Record<string, unknown>;

type ResourcesSurface = Record<
  string,
  {
    currentQuantity: number;
    maxQuantity: number;
    hasStorage(): boolean;
  }
>;

type BuildingsSurface = Record<string, { stateOnCount: number }>;

type PolySurface = {
  shipCosts(ship: ShipBlueprint): Record<string, number>;
};

type HaveTech = (id: string, level?: number) => unknown;

/** The piracy rating of one region, broken down. */
type SyndicateRating = { p: number; r: number; s: number };

type FleetManagerOuterShape = {
  _fleetElementId: string;
  _explorerBlueprint: ShipBlueprint;

  nextShipName: string | null;
  nextShipCost: Record<string, number> | null;
  nextShipAffordable: boolean | null;
  nextShipExpandable: boolean | null;
  nextShipMsg: string | null;

  WeaponPower: Record<string, number>;
  SensorRange: Record<string, number>;
  ClassPower: Record<string, number>;
  ClassCrew: Record<string, number>;
  Regions: string[];
  ShipConfig: Record<string, string[]>;

  getWeighting(id: string): unknown;
  getMaxDefense(id: string): unknown;
  getMaxScouts(id: string): unknown;
  getShipName(ship: ShipBlueprint): string;
  getLocName(loc: string): string;
  isUnlocked(id: string): boolean;
  updateNextShip(ship: ShipBlueprint | null): void;
  initFleet(): boolean;
  getFighterBlueprint(): Record<string, unknown>;
  getScoutBlueprint(): Record<string, unknown>;
  getMissingResource(ship: ShipBlueprint): string | null;
  avail(ship: ShipBlueprint): boolean;
  build(ship: ShipBlueprint, region: string): boolean;
  getShipAttackPower(ship: ShipParts): number;
  shipCount(loc: string, template: ShipParts): number;
  syndicate(
    region: string,
    extra: boolean,
    all: boolean,
  ): SyndicateRating | number;
};

type FleetManagerShape = {
  _fleetElementId: string;
  /** Per-ship on-counts needed for full piracy coverage, set by autoFleet when crew reclaim is active. */
  neededShips: Record<string, number> | null;
  initFleet(): boolean;
  addShip(region: string, ship: string, count: number): boolean;
  subShip(region: string, ship: string, count: number): boolean;
};

type FleetManagerDependencies = {
  getGame: () => GameSurface;
  getSettings: () => SettingsSurface;
  getResources: () => ResourcesSurface;
  getBuildings: () => BuildingsSurface;
  getPoly: () => PolySurface;
  getHaveTech: () => HaveTech;
  fleetControls: GameFleetControlsPort;
};

export function createFleetManagers({
  getGame,
  getSettings,
  getResources,
  getBuildings,
  getPoly,
  getHaveTech,
  fleetControls,
}: FleetManagerDependencies) {
  const haveTech: HaveTech = (...args) => getHaveTech()(...args);

  const FleetManagerOuter: FleetManagerOuterShape = {
    _fleetElementId: "shipPlans",
    _explorerBlueprint: {
      class: "explorer",
      armor: "neutronium",
      weapon: "railgun",
      engine: "emdrive",
      power: "elerium",
      sensor: "quantum",
    },

    nextShipName: null,
    nextShipCost: null,
    nextShipAffordable: null,
    nextShipExpandable: null,
    nextShipMsg: null,

    WeaponPower: {
      railgun: 36,
      laser: 64,
      p_laser: 54,
      plasma: 90,
      phaser: 114,
      disruptor: 156,
    },
    SensorRange: { visual: 1, radar: 20, lidar: 35, quantum: 60 },
    ClassPower: {
      corvette: 1,
      frigate: 1.5,
      destroyer: 2.75,
      cruiser: 5.5,
      battlecruiser: 10,
      dreadnought: 22,
      explorer: 1.2,
    },
    ClassCrew: {
      corvette: 2,
      frigate: 3,
      destroyer: 4,
      cruiser: 6,
      battlecruiser: 8,
      dreadnought: 10,
      explorer: 10,
    },

    // spc_dwarf is ignored, never having any syndicate
    Regions: [
      "spc_moon",
      "spc_red",
      "spc_gas",
      "spc_gas_moon",
      "spc_belt",
      "spc_titan",
      "spc_enceladus",
      "spc_triton",
      "spc_kuiper",
      "spc_eris",
    ],

    ShipConfig: {
      class: [
        "corvette",
        "frigate",
        "destroyer",
        "cruiser",
        "battlecruiser",
        "dreadnought",
        "explorer",
      ],
      power: ["solar", "diesel", "fission", "fusion", "elerium"],
      weapon: ["railgun", "laser", "p_laser", "plasma", "phaser", "disruptor"],
      armor: ["steel", "alloy", "neutronium"],
      engine: ["ion", "tie", "pulse", "photon", "vacuum", "emdrive"],
      sensor: ["visual", "radar", "lidar", "quantum"],
    },

    getWeighting(id) {
      const settings = getSettings();
      return settings["fleet_outer_pr_" + id];
    },

    getMaxDefense(id) {
      const settings = getSettings();
      return settings["fleet_outer_def_" + id];
    },

    getMaxScouts(id) {
      const settings = getSettings();
      return settings["fleet_outer_sc_" + id];
    },

    getShipName(ship) {
      const game = getGame();
      return game.loc(`outer_shipyard_class_${ship.class}`);
    },

    getLocName(loc) {
      const game = getGame();
      let locRef =
        loc === "tauceti"
          ? game.loc("tech_era_tauceti")
          : game.actions.space[loc]!.info.name;
      return typeof locRef === "function" ? locRef() : locRef;
    },

    isUnlocked(id) {
      const game = getGame();
      return id === "spc_moon" && game.global.race["orbit_decayed"]
        ? false
        : (game.actions.space[id]!.info.syndicate?.() ?? false);
    },

    updateNextShip(ship) {
      if (ship) {
        const poly = getPoly();
        const resources = getResources();
        let cost = poly.shipCosts(ship);
        this.nextShipCost = cost;
        this.nextShipAffordable = true;
        this.nextShipExpandable = true;
        this.nextShipMsg = null;
        this.nextShipName = null;
        for (let res in cost) {
          if (resources[res]!.maxQuantity < cost[res]!) {
            this.nextShipAffordable = false;
            if (!resources[res]!.hasStorage()) {
              this.nextShipExpandable = false;
            }
          }
        }
      } else {
        this.nextShipCost = null;
        this.nextShipAffordable = null;
        this.nextShipExpandable = null;
        this.nextShipMsg = null;
        this.nextShipName = null;
      }
    },

    initFleet() {
      const game = getGame();
      if (
        !game.global.tech.syndicate ||
        !Object.hasOwn(game.global.space.shipyard ?? {}, "blueprint")
      ) {
        return false;
      }

      return fleetControls.isRendered(this._fleetElementId);
    },

    getFighterBlueprint() {
      const settings = getSettings();
      return Object.fromEntries(
        Object.keys(this.ShipConfig).map((type) => [
          type,
          settings["fleet_outer_" + type],
        ]),
      );
    },

    getScoutBlueprint() {
      const settings = getSettings();
      return Object.fromEntries(
        Object.keys(this.ShipConfig).map((type) => [
          type,
          settings["fleet_scout_" + type],
        ]),
      );
    },

    getMissingResource(ship) {
      const poly = getPoly();
      const resources = getResources();
      let cost = poly.shipCosts(ship);
      for (let res in cost) {
        if (resources[res]!.currentQuantity < cost[res]!) {
          return res;
        }
      }
      return null;
    },

    avail(ship) {
      const game = getGame();
      let yard = game.global.space.shipyard;
      if (!yard) {
        return false;
      }
      if (
        ship.class === "explorer" &&
        (ship.weapon !== "railgun" || ship.sensor !== "quantum")
      ) {
        return false;
      }
      for (let [type, part] of Object.entries(ship)) {
        if (
          type !== "name" &&
          yard.blueprint[type] !== part &&
          !(
            ship.class === "explorer" &&
            (part === "weapon" || part === "sensor")
          )
        ) {
          if (
            !fleetControls.isPartAvailable({
              elementId: this._fleetElementId,
              type,
              part,
              index: this.ShipConfig[type]!.indexOf(part),
            })
          ) {
            return false;
          }
        }
      }
      return true;
    },

    build(ship, region) {
      const game = getGame();
      const poly = getPoly();
      const resources = getResources();
      let yard = game.global.space.shipyard;
      if (!yard) {
        return false;
      }
      for (let [type, part] of Object.entries(ship)) {
        if (
          type !== "name" &&
          (yard.blueprint[type] !== part ||
            ship.class === "explorer" ||
            yard.blueprint.class === "explorer")
        ) {
          fleetControls.setPart({
            elementId: this._fleetElementId,
            type,
            part,
          });
        }
      }
      if (!fleetControls.hasShipPower(this._fleetElementId)) {
        return false;
      }

      let cost = poly.shipCosts(ship);
      for (let res in cost) {
        resources[res]!.currentQuantity -= cost[res]!;
      }

      return fleetControls.buildShip({
        elementId: this._fleetElementId,
        region,
      });
    },

    getShipAttackPower(ship) {
      return Math.round(
        this.WeaponPower[ship.weapon]! * this.ClassPower[ship.class]!,
      );
    },

    shipCount(loc, template) {
      const game = getGame();
      let count = 0;
      for (let ship of game.global.space.shipyard?.ships ?? []) {
        if (
          ship.location === loc &&
          ship.class === template.class &&
          ship.power === template.power &&
          ship.weapon === template.weapon &&
          ship.armor === template.armor &&
          ship.engine === template.engine &&
          ship.sensor === template.sensor
        ) {
          count++;
        }
      }
      return count;
    },

    // export function syndicate(region,extra) from truepath.js with added "all" argument
    syndicate(region, extra, all) {
      const game = getGame();
      const buildings = getBuildings();
      if (
        !game.global.tech["syndicate"] ||
        !game.global.race["truepath"] ||
        !Object.hasOwn(game.global.space.syndicate ?? {}, region)
      ) {
        return extra ? { p: 1, r: 0, s: 0 } : 1;
      }
      let rivalRel = game.global.civic.foreign.gov3.hstl;
      let rival =
        rivalRel < 10
          ? 250 - 25 * rivalRel
          : rivalRel > 60
            ? -13 * (rivalRel - 60)
            : 0;

      let divisor = 1000;
      switch (region) {
        case "spc_home":
        case "spc_moon":
        case "spc_red":
        case "spc_hell":
          divisor = 1250 + rival;
          break;
        case "spc_gas":
        case "spc_gas_moon":
        case "spc_belt":
          divisor = 1020 + rival;
          break;
        case "spc_titan":
        case "spc_enceladus":
          divisor = !haveTech("triton")
            ? 600
            : game.actions.space[region]!.info.syndicate_cap!();
          break;
        case "spc_triton":
        case "spc_kuiper":
        case "spc_eris":
          divisor = game.actions.space[region]!.info.syndicate_cap!();
          break;
      }

      let piracy = game.global.space.syndicate?.[region] ?? 0;
      let patrol = 0;
      let sensor = 0;
      const ships = game.global.space.shipyard?.ships;
      if (ships) {
        for (let ship of ships) {
          if (
            ship.location === region &&
            ((ship.transit === 0 && ship.fueled) || all)
          ) {
            let rating = this.getShipAttackPower(ship);
            patrol +=
              ship.damage > 0
                ? Math.round((rating * (100 - ship.damage)) / 100)
                : rating;
            sensor += this.SensorRange[ship.sensor]!;
          }
        }

        if (region === "spc_enceladus") {
          patrol += buildings.EnceladusBase!.stateOnCount * 50;
        } else if (region === "spc_titan") {
          patrol += buildings.TitanSAM!.stateOnCount * 25;
        } else if (
          region === "spc_triton" &&
          buildings.TritonFOB!.stateOnCount > 0
        ) {
          patrol += 500;
          sensor += 10;
        }

        if (sensor > 100) {
          sensor =
            Math.round(((sensor - 100) / (sensor - 100 + 200)) * 100) + 100;
        }

        patrol = Math.round(patrol * ((sensor + 25) / 125));
        piracy = piracy - patrol > 0 ? piracy - patrol : 0;
      }
      if (extra) {
        return {
          p: 1 - +(piracy / divisor).toFixed(4),
          r: piracy,
          s: sensor,
        };
      } else {
        return 1 - +(piracy / divisor).toFixed(4);
      }
    },
  };

  const FleetManager: FleetManagerShape = {
    _fleetElementId: "fleet",
    neededShips: null,

    initFleet() {
      const game = getGame();
      if (!game.global.tech.piracy) {
        return false;
      }

      return fleetControls.isRendered(this._fleetElementId);
    },

    addShip(region, ship, count) {
      return fleetControls.addShips({
        elementId: this._fleetElementId,
        region,
        ship,
        count,
      });
    },

    subShip(region, ship, count) {
      return fleetControls.subShips({
        elementId: this._fleetElementId,
        region,
        ship,
        count,
      });
    },
  };

  return { FleetManagerOuter, FleetManager };
}
