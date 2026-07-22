type LooseFunction = (...args: any[]) => any;
type LooseObject = Record<PropertyKey, any>;

type GameCompatibilityDependencies = {
  getGame: () => LooseObject;
  getBuildings: () => LooseObject;
  getTraitVal: () => LooseFunction;
  getHaveTech: () => LooseFunction;
  getGovernor: () => string;
  getVueById: LooseFunction;
  normalizeProperties: LooseFunction;
  cloneIntoPage: (value: unknown, options?: LooseObject) => any;
  getDate: () => { getMonth: () => number; getDate: () => number };
};

export function createGameCompatibility({
  getGame,
  getBuildings,
  getTraitVal,
  getHaveTech,
  getGovernor,
  getVueById,
  normalizeProperties,
  cloneIntoPage,
  getDate,
}: GameCompatibilityDependencies) {
  const traitVal: LooseFunction = (...args) => getTraitVal()(...args);
  const haveTech: LooseFunction = (...args) => getHaveTech()(...args);

  const poly = {
    // Taken directly from game code with no functional changes, and minified.
    // export function astrologySign() from seasons.js
    astrologySign: function () {
      let t = getDate();
      if (
        (0 === t.getMonth() && t.getDate() >= 20) ||
        (1 === t.getMonth() && 18 >= t.getDate())
      )
        return "aquarius";
      if (
        (1 === t.getMonth() && t.getDate() >= 19) ||
        (2 === t.getMonth() && 20 >= t.getDate())
      )
        return "pisces";
      if (
        (2 === t.getMonth() && t.getDate() >= 21) ||
        (3 === t.getMonth() && 19 >= t.getDate())
      )
        return "aries";
      if (
        (3 === t.getMonth() && t.getDate() >= 20) ||
        (4 === t.getMonth() && 20 >= t.getDate())
      )
        return "taurus";
      if (
        (4 === t.getMonth() && t.getDate() >= 21) ||
        (5 === t.getMonth() && 21 >= t.getDate())
      )
        return "gemini";
      else if (
        (5 === t.getMonth() && t.getDate() >= 22) ||
        (6 === t.getMonth() && 22 >= t.getDate())
      )
        return "cancer";
      else if (
        (6 === t.getMonth() && t.getDate() >= 23) ||
        (7 === t.getMonth() && 22 >= t.getDate())
      )
        return "leo";
      else if (
        (7 === t.getMonth() && t.getDate() >= 23) ||
        (8 === t.getMonth() && 22 >= t.getDate())
      )
        return "virgo";
      else if (
        (8 === t.getMonth() && t.getDate() >= 23) ||
        (9 === t.getMonth() && 22 >= t.getDate())
      )
        return "libra";
      else if (
        (9 === t.getMonth() && t.getDate() >= 23) ||
        (10 === t.getMonth() && 22 >= t.getDate())
      )
        return "scorpio";
      else if (
        (10 === t.getMonth() && t.getDate() >= 23) ||
        (11 === t.getMonth() && 21 >= t.getDate())
      )
        return "sagittarius";
      else if (
        (11 === t.getMonth() && t.getDate() >= 22) ||
        (0 === t.getMonth() && 19 >= t.getDate())
      )
        return "capricorn";
      else return "time itself is broken";
    },
    // export function arpaAdjustCosts(costs) from arpa.js
    arpaAdjustCosts: function (t) {
      return (
        (t = (function (t) {
          var r = traitVal("creative", 1, "-");
          if (r < 1) {
            var a = {};
            return (
              Object.keys(t).forEach(function (e) {
                a[e] = function () {
                  return t[e]() * r;
                };
              }),
              a
            );
          }
          return t;
        })(t)),
        poly.adjustCosts({ cost: t })
      );
    },
    // function govPrice(gov) from civics.js
    govPrice: function (e) {
      let o = getGame().global.civic.foreign[`gov${e}`],
        i = 15384 * o.eco;
      return (
        (i *= 1 + (1.6 * o.hstl) / 100),
        +(i *= 1 - (0.25 * o.unrest) / 100).toFixed(0)
      );
    },
    // export const galaxyOffers from resources.js
    galaxyOffers: normalizeProperties([
      { buy: { res: "Deuterium", vol: 5 }, sell: { res: "Helium_3", vol: 25 } },
      {
        buy: { res: "Neutronium", vol: 2.5 },
        sell: { res: "Copper", vol: 200 },
      },
      { buy: { res: "Adamantite", vol: 3 }, sell: { res: "Iron", vol: 300 } },
      { buy: { res: "Elerium", vol: 1 }, sell: { res: "Oil", vol: 125 } },
      {
        buy: { res: "Nano_Tube", vol: 10 },
        sell: { res: "Titanium", vol: 20 },
      },
      {
        buy: { res: "Graphene", vol: 25 },
        sell: {
          res: () =>
            getGame().global.race.kindling_kindred ||
            getGame().global.race.smoldering
              ? getGame().global.race.smoldering
                ? "Chrysotile"
                : "Stone"
              : "Lumber",
          vol: 1e3,
        },
      },
      {
        buy: { res: "Stanene", vol: 40 },
        sell: { res: "Aluminium", vol: 800 },
      },
      {
        buy: { res: "Bolognium", vol: 0.75 },
        sell: { res: "Uranium", vol: 4 },
      },
      { buy: { res: "Vitreloy", vol: 1 }, sell: { res: "Infernite", vol: 1 } },
    ]),
    // export const supplyValue from resources.js
    supplyValue: {
      Lumber: { in: 0.5, out: 25e3 },
      Chrysotile: { in: 0.5, out: 25e3 },
      Stone: { in: 0.5, out: 25e3 },
      Crystal: { in: 3, out: 25e3 },
      Furs: { in: 3, out: 25e3 },
      Copper: { in: 1.5, out: 25e3 },
      Iron: { in: 1.5, out: 25e3 },
      Aluminium: { in: 2.5, out: 25e3 },
      Cement: { in: 3, out: 25e3 },
      Coal: { in: 1.5, out: 25e3 },
      Oil: { in: 2.5, out: 12e3 },
      Uranium: { in: 5, out: 300 },
      Steel: { in: 3, out: 25e3 },
      Titanium: { in: 3, out: 25e3 },
      Alloy: { in: 6, out: 25e3 },
      Polymer: { in: 6, out: 25e3 },
      Iridium: { in: 8, out: 25e3 },
      Helium_3: { in: 4.5, out: 12e3 },
      Deuterium: { in: 4, out: 1e3 },
      Neutronium: { in: 15, out: 1e3 },
      Adamantite: { in: 12.5, out: 1e3 },
      Infernite: { in: 25, out: 250 },
      Elerium: { in: 30, out: 250 },
      Nano_Tube: { in: 6.5, out: 1e3 },
      Graphene: { in: 5, out: 1e3 },
      Stanene: { in: 4.5, out: 1e3 },
      Bolognium: { in: 18, out: 1e3 },
      Vitreloy: { in: 14, out: 1e3 },
      Orichalcum: { in: 10, out: 1e3 },
      Plywood: { in: 10, out: 250 },
      Brick: { in: 10, out: 250 },
      Wrought_Iron: { in: 10, out: 250 },
      Sheet_Metal: { in: 10, out: 250 },
      Mythril: { in: 12.5, out: 250 },
      Aerogel: { in: 16.5, out: 250 },
      Nanoweave: { in: 18, out: 250 },
      Scarletite: { in: 35, out: 250 },
    },
    // export const monsters from portal.js
    monsters: {
      fire_elm: {
        weapon: {
          laser: 1.05,
          flame: 0,
          plasma: 0.25,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 1,
          shotgun: 0.75,
          tesla: 0.65,
          claws: 0.5,
          venom: 0.62,
          cold: 1.25,
          shock: 0.68,
          fire: 0,
          acid: 0.25,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.3,
          ice: 1.12,
          magma: 0,
          axe: 0.5,
          hammer: 0.5,
        },
        nozone: { freeze: !0, flooded: !0 },
        amp: { hot: 1.75, humid: 0.8, steam: 0.9 },
      },
      water_elm: {
        weapon: {
          laser: 0.65,
          flame: 0.5,
          plasma: 1,
          kinetic: 0.2,
          missile: 0.5,
          sonic: 0.5,
          shotgun: 0.25,
          tesla: 0.75,
          claws: 0.4,
          venom: 0.8,
          cold: 1.1,
          shock: 0.68,
          fire: 0.8,
          acid: 0.25,
          stone: 0.4,
          iron: 0.3,
          flesh: 0.5,
          ice: 1.1,
          magma: 0.75,
          axe: 0.45,
          hammer: 0.45,
        },
        nozone: { hot: !0, freeze: !0 },
        amp: { steam: 1.5, river: 1.1, flooded: 2, rain: 1.75, humid: 1.25 },
      },
      rock_golem: {
        weapon: {
          laser: 1,
          flame: 0.5,
          plasma: 1,
          kinetic: 0.65,
          missile: 0.95,
          sonic: 0.75,
          shotgun: 0.35,
          tesla: 0,
          claws: 0.7,
          venom: 0.25,
          cold: 0.35,
          shock: 0,
          fire: 0.9,
          acid: 1,
          stone: 0.5,
          iron: 0.65,
          flesh: 0.3,
          ice: 0.3,
          magma: 0.9,
          axe: 0.2,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      bone_golem: {
        weapon: {
          laser: 0.45,
          flame: 0.35,
          plasma: 0.55,
          kinetic: 1,
          missile: 1,
          sonic: 0.75,
          shotgun: 0.75,
          tesla: 0.15,
          claws: 0.75,
          venom: 0,
          cold: 0.2,
          shock: 0.15,
          fire: 0.4,
          acid: 0.85,
          stone: 0.9,
          iron: 1,
          flesh: 0.15,
          ice: 0.3,
          magma: 0.9,
          axe: 0.65,
          hammer: 1.2,
        },
        nozone: {},
        amp: {},
      },
      mech_dino: {
        weapon: {
          laser: 0.85,
          flame: 0.05,
          plasma: 0.55,
          kinetic: 0.45,
          missile: 0.5,
          sonic: 0.35,
          shotgun: 0.5,
          tesla: 1,
          claws: 0.38,
          venom: 0.1,
          cold: 0.5,
          shock: 1.1,
          fire: 0.5,
          acid: 0.75,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.15,
          ice: 0.3,
          magma: 0.9,
          axe: 0.6,
          hammer: 0.4,
        },
        nozone: {},
        amp: {},
      },
      plant: {
        weapon: {
          laser: 0.42,
          flame: 1,
          plasma: 0.65,
          kinetic: 0.2,
          missile: 0.25,
          sonic: 0.75,
          shotgun: 0.35,
          tesla: 0.38,
          claws: 0.25,
          venom: 0.25,
          cold: 0.65,
          shock: 0.28,
          fire: 1,
          acid: 0.45,
          stone: 0.6,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.55,
          magma: 1,
          axe: 0.25,
          hammer: 0.15,
        },
        nozone: {},
        amp: {},
      },
      crazed: {
        weapon: {
          laser: 0.5,
          flame: 0.85,
          plasma: 0.65,
          kinetic: 1,
          missile: 0.35,
          sonic: 0.15,
          shotgun: 0.95,
          tesla: 0.6,
          claws: 1,
          venom: 0.5,
          cold: 0.5,
          shock: 0.75,
          fire: 0.5,
          acid: 0.5,
          stone: 0.7,
          iron: 0.8,
          flesh: 0.9,
          ice: 0.4,
          magma: 0.5,
          axe: 1,
          hammer: 0.75,
        },
        nozone: {},
        amp: {},
      },
      minotaur: {
        weapon: {
          laser: 0.32,
          flame: 0.5,
          plasma: 0.82,
          kinetic: 0.44,
          missile: 1,
          sonic: 0.15,
          shotgun: 0.2,
          tesla: 0.35,
          claws: 0.6,
          venom: 1.1,
          cold: 0.5,
          shock: 0.3,
          fire: 0.5,
          acid: 1,
          stone: 0.6,
          iron: 0.9,
          flesh: 0.3,
          ice: 0.4,
          magma: 0.55,
          axe: 0.75,
          hammer: 0.6,
        },
        nozone: {},
        amp: {},
      },
      ooze: {
        weapon: {
          laser: 0.2,
          flame: 0.65,
          plasma: 1,
          kinetic: 0,
          missile: 0,
          sonic: 0.85,
          shotgun: 0,
          tesla: 0.15,
          claws: 0,
          venom: 0.15,
          cold: 1.5,
          shock: 0.2,
          fire: 0.6,
          acid: 0.5,
          stone: 0,
          iron: 0,
          flesh: 0,
          ice: 1.25,
          magma: 0.7,
          axe: 0,
          hammer: 0,
        },
        nozone: {},
        amp: {},
      },
      zombie: {
        weapon: {
          laser: 0.35,
          flame: 1,
          plasma: 0.45,
          kinetic: 0.08,
          missile: 0.8,
          sonic: 0.18,
          shotgun: 0.95,
          tesla: 0.05,
          claws: 0.85,
          venom: 0,
          cold: 0.2,
          shock: 0.35,
          fire: 0.95,
          acid: 0.5,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.35,
          ice: 0.25,
          magma: 0.9,
          axe: 1,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      raptor: {
        weapon: {
          laser: 0.68,
          flame: 0.55,
          plasma: 0.85,
          kinetic: 1,
          missile: 0.44,
          sonic: 0.22,
          shotgun: 0.33,
          tesla: 0.66,
          claws: 0.85,
          venom: 0.5,
          cold: 0.5,
          shock: 0.88,
          fire: 0.6,
          acid: 0.6,
          stone: 1,
          iron: 0.85,
          flesh: 0.45,
          ice: 0.5,
          magma: 0.65,
          axe: 0.9,
          hammer: 0.6,
        },
        nozone: {},
        amp: {},
      },
      frost_giant: {
        weapon: {
          laser: 0.9,
          flame: 0.82,
          plasma: 1,
          kinetic: 0.25,
          missile: 0.08,
          sonic: 0.45,
          shotgun: 0.28,
          tesla: 0.5,
          claws: 0.35,
          venom: 0.15,
          cold: 0,
          shock: 0.6,
          fire: 1.2,
          acid: 0.5,
          stone: 0.35,
          iron: 1,
          flesh: 0.3,
          ice: 0,
          magma: 1.1,
          axe: 0.5,
          hammer: 1,
        },
        nozone: { hot: !0 },
        amp: { freeze: 2.5, hail: 1.65 },
      },
      swarm: {
        weapon: {
          laser: 0.02,
          flame: 1,
          plasma: 0.04,
          kinetic: 0.01,
          missile: 0.08,
          sonic: 0.66,
          shotgun: 0.38,
          tesla: 0.45,
          claws: 0.05,
          venom: 0.01,
          cold: 0.8,
          shock: 0.75,
          fire: 0.8,
          acid: 0.75,
          stone: 0.03,
          iron: 0.03,
          flesh: 0.03,
          ice: 0.3,
          magma: 0.5,
          axe: 0.01,
          hammer: 0.05,
        },
        nozone: {},
        amp: {},
      },
      dragon: {
        weapon: {
          laser: 0.18,
          flame: 0,
          plasma: 0.12,
          kinetic: 0.35,
          missile: 1,
          sonic: 0.22,
          shotgun: 0.65,
          tesla: 0.15,
          claws: 0.38,
          venom: 0.88,
          cold: 0.8,
          shock: 0.35,
          fire: 0,
          acid: 0.85,
          stone: 0.03,
          iron: 0.03,
          flesh: 0.03,
          ice: 0.3,
          magma: 0,
          axe: 0.4,
          hammer: 0.55,
        },
        nozone: {},
        amp: {},
      },
      mech_dragon: {
        weapon: {
          laser: 0.84,
          flame: 0.1,
          plasma: 0.68,
          kinetic: 0.18,
          missile: 0.75,
          sonic: 0.22,
          shotgun: 0.28,
          tesla: 1,
          claws: 0.28,
          venom: 0,
          cold: 0.35,
          shock: 1,
          fire: 0.15,
          acid: 0.72,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.2,
          magma: 0.15,
          axe: 0.25,
          hammer: 0.8,
        },
        nozone: {},
        amp: {},
      },
      construct: {
        weapon: {
          laser: 0.5,
          flame: 0.2,
          plasma: 0.6,
          kinetic: 0.34,
          missile: 0.9,
          sonic: 0.08,
          shotgun: 0.28,
          tesla: 1,
          claws: 0.28,
          venom: 0,
          cold: 0.45,
          shock: 1.1,
          fire: 0.22,
          acid: 0.68,
          stone: 0.55,
          iron: 0.55,
          flesh: 0.4,
          ice: 0.4,
          magma: 0.18,
          axe: 0.42,
          hammer: 0.95,
        },
        nozone: {},
        amp: {},
      },
      beholder: {
        weapon: {
          laser: 0.75,
          flame: 0.15,
          plasma: 1,
          kinetic: 0.45,
          missile: 0.05,
          sonic: 0.01,
          shotgun: 0.12,
          tesla: 0.3,
          claws: 0.48,
          venom: 0.9,
          cold: 0.88,
          shock: 0.24,
          fire: 0.18,
          acid: 0.9,
          stone: 0.72,
          iron: 0.45,
          flesh: 0.85,
          ice: 0.92,
          magma: 0.16,
          axe: 0.44,
          hammer: 0.08,
        },
        nozone: {},
        amp: {},
      },
      worm: {
        weapon: {
          laser: 0.55,
          flame: 0.38,
          plasma: 0.45,
          kinetic: 0.2,
          missile: 0.05,
          sonic: 1,
          shotgun: 0.02,
          tesla: 0.01,
          claws: 0.18,
          venom: 0.65,
          cold: 1,
          shock: 0.02,
          fire: 0.38,
          acid: 0.48,
          stone: 0.22,
          iron: 0.24,
          flesh: 0.35,
          ice: 1,
          magma: 0.4,
          axe: 0.15,
          hammer: 0.05,
        },
        nozone: {},
        amp: {},
      },
      hydra: {
        weapon: {
          laser: 0.85,
          flame: 0.75,
          plasma: 0.85,
          kinetic: 0.25,
          missile: 0.45,
          sonic: 0.5,
          shotgun: 0.6,
          tesla: 0.65,
          claws: 0.3,
          venom: 0.65,
          cold: 0.55,
          shock: 0.65,
          fire: 0.75,
          acid: 0.85,
          stone: 0.25,
          iron: 0.15,
          flesh: 0.2,
          ice: 0.55,
          magma: 0.75,
          axe: 0.45,
          hammer: 0.65,
        },
        nozone: {},
        amp: {},
      },
      colossus: {
        weapon: {
          laser: 1,
          flame: 0.05,
          plasma: 0.75,
          kinetic: 0.45,
          missile: 1,
          sonic: 0.35,
          shotgun: 0.35,
          tesla: 0.5,
          claws: 0.48,
          venom: 0.22,
          cold: 0.25,
          shock: 0.65,
          fire: 0.15,
          acid: 0.95,
          stone: 0.55,
          iron: 0.95,
          flesh: 0.25,
          ice: 0.35,
          magma: 0.2,
          axe: 0.55,
          hammer: 0.35,
        },
        nozone: {},
        amp: {},
      },
      lich: {
        weapon: {
          laser: 0.1,
          flame: 0.1,
          plasma: 0.1,
          kinetic: 0.45,
          missile: 0.75,
          sonic: 0.35,
          shotgun: 0.75,
          tesla: 0.5,
          claws: 0.4,
          venom: 0.01,
          cold: 0.1,
          shock: 0.5,
          fire: 0.1,
          acid: 0.1,
          stone: 0.35,
          iron: 0.25,
          flesh: 0.95,
          ice: 0.1,
          magma: 0.1,
          axe: 0.4,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      ape: {
        weapon: {
          laser: 1,
          flame: 0.95,
          plasma: 0.85,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 0.05,
          shotgun: 0.35,
          tesla: 0.68,
          claws: 0.65,
          venom: 0.95,
          cold: 0.5,
          shock: 0.5,
          fire: 0.75,
          acid: 0.65,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.5,
          magma: 0.75,
          axe: 0.65,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      bandit: {
        weapon: {
          laser: 0.65,
          flame: 0.5,
          plasma: 0.85,
          kinetic: 1,
          missile: 0.5,
          sonic: 0.25,
          shotgun: 0.75,
          tesla: 0.25,
          claws: 1,
          venom: 0.15,
          cold: 0.5,
          shock: 0.25,
          fire: 0.5,
          acid: 0.5,
          stone: 0.5,
          iron: 0.8,
          flesh: 0.5,
          ice: 0.5,
          magma: 0.5,
          axe: 1,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      croc: {
        weapon: {
          laser: 0.65,
          flame: 0.05,
          plasma: 0.6,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 1,
          shotgun: 0.2,
          tesla: 0.75,
          claws: 1,
          venom: 0.5,
          cold: 1,
          shock: 0.75,
          fire: 0.05,
          acid: 0.08,
          stone: 0.6,
          iron: 0.5,
          flesh: 0.25,
          ice: 0.95,
          magma: 0.05,
          axe: 0.75,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      djinni: {
        weapon: {
          laser: 0,
          flame: 0.35,
          plasma: 1,
          kinetic: 0.15,
          missile: 0,
          sonic: 0.65,
          shotgun: 0.22,
          tesla: 0.4,
          claws: 0.18,
          venom: 0.12,
          cold: 0.9,
          shock: 0.45,
          fire: 0.3,
          acid: 0.1,
          stone: 0.2,
          iron: 0.95,
          flesh: 0.2,
          ice: 0.9,
          magma: 0.3,
          axe: 0.12,
          hammer: 0,
        },
        nozone: {},
        amp: {},
      },
      snake: {
        weapon: {
          laser: 0.5,
          flame: 0.5,
          plasma: 0.5,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 0.5,
          shotgun: 0.5,
          tesla: 0.5,
          claws: 0.5,
          venom: 0.02,
          cold: 0.75,
          shock: 0.5,
          fire: 0.5,
          acid: 0.5,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.75,
          magma: 0.5,
          axe: 0.5,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      centipede: {
        weapon: {
          laser: 0.5,
          flame: 0.85,
          plasma: 0.95,
          kinetic: 0.65,
          missile: 0.6,
          sonic: 0,
          shotgun: 0.5,
          tesla: 0.01,
          claws: 0.65,
          venom: 0.01,
          cold: 0,
          shock: 0.01,
          fire: 0.88,
          acid: 0.95,
          stone: 0.6,
          iron: 0.45,
          flesh: 0.55,
          ice: 0,
          magma: 0.88,
          axe: 0.7,
          hammer: 0.4,
        },
        nozone: {},
        amp: {},
      },
      spider: {
        weapon: {
          laser: 0.65,
          flame: 1,
          plasma: 0.22,
          kinetic: 0.75,
          missile: 0.15,
          sonic: 0.38,
          shotgun: 0.9,
          tesla: 0.18,
          claws: 0.12,
          venom: 0.05,
          cold: 0.5,
          shock: 0.32,
          fire: 1,
          acid: 0.65,
          stone: 0.8,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.5,
          magma: 1,
          axe: 0.18,
          hammer: 0.75,
        },
        nozone: {},
        amp: {},
      },
      manticore: {
        weapon: {
          laser: 0.05,
          flame: 0.25,
          plasma: 0.95,
          kinetic: 0.5,
          missile: 0.15,
          sonic: 0.48,
          shotgun: 0.4,
          tesla: 0.6,
          claws: 0.5,
          venom: 0.5,
          cold: 0.8,
          shock: 0.75,
          fire: 0.15,
          acid: 0.95,
          stone: 0.25,
          iron: 0.5,
          flesh: 0.8,
          ice: 0.8,
          magma: 0.15,
          axe: 0.5,
          hammer: 0.25,
        },
        nozone: {},
        amp: {},
      },
      fiend: {
        weapon: {
          laser: 0.75,
          flame: 0.25,
          plasma: 0.5,
          kinetic: 0.25,
          missile: 0.75,
          sonic: 0.25,
          shotgun: 0.5,
          tesla: 0.5,
          claws: 0.65,
          venom: 0.1,
          cold: 0.65,
          shock: 0.5,
          fire: 0.2,
          acid: 0.5,
          stone: 0.25,
          iron: 0.75,
          flesh: 1,
          ice: 0.65,
          magma: 0.2,
          axe: 0.75,
          hammer: 0.25,
        },
        nozone: {},
        amp: {},
      },
      bat: {
        weapon: {
          laser: 0.16,
          flame: 0.18,
          plasma: 0.12,
          kinetic: 0.25,
          missile: 0.02,
          sonic: 1,
          shotgun: 0.9,
          tesla: 0.58,
          claws: 0.1,
          venom: 0.1,
          cold: 0.8,
          shock: 0.65,
          fire: 0.15,
          acid: 0.5,
          stone: 0.1,
          iron: 0.1,
          flesh: 0.5,
          ice: 0.8,
          magma: 0.2,
          axe: 0.1,
          hammer: 0.1,
        },
        nozone: {},
        amp: {},
      },
      medusa: {
        weapon: {
          laser: 0.35,
          flame: 0.1,
          plasma: 0.3,
          kinetic: 0.95,
          missile: 1,
          sonic: 0.15,
          shotgun: 0.88,
          tesla: 0.26,
          claws: 0.42,
          venom: 0.3,
          cold: 0.48,
          shock: 0.28,
          fire: 0.1,
          acid: 0.85,
          stone: 1,
          iron: 0.25,
          flesh: 0.75,
          ice: 0.52,
          magma: 0.12,
          axe: 0.34,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      ettin: {
        weapon: {
          laser: 0.5,
          flame: 0.35,
          plasma: 0.8,
          kinetic: 0.5,
          missile: 0.25,
          sonic: 0.3,
          shotgun: 0.6,
          tesla: 0.09,
          claws: 0.5,
          venom: 0.95,
          cold: 0.3,
          shock: 0.8,
          fire: 0.38,
          acid: 0.9,
          stone: 0.6,
          iron: 0.75,
          flesh: 0.4,
          ice: 0.28,
          magma: 0.32,
          axe: 0.45,
          hammer: 0.25,
        },
        nozone: {},
        amp: {},
      },
      faceless: {
        weapon: {
          laser: 0.6,
          flame: 0.28,
          plasma: 0.6,
          kinetic: 0,
          missile: 0.05,
          sonic: 0.8,
          shotgun: 0.15,
          tesla: 1,
          claws: 0.02,
          venom: 0.01,
          cold: 0,
          shock: 1,
          fire: 0.25,
          acid: 0.55,
          stone: 0.15,
          iron: 0.15,
          flesh: 0.95,
          ice: 0,
          magma: 0.25,
          axe: 0.01,
          hammer: 0.05,
        },
        nozone: {},
        amp: {},
      },
      enchanted: {
        weapon: {
          laser: 1,
          flame: 0.02,
          plasma: 0.95,
          kinetic: 0.2,
          missile: 0.7,
          sonic: 0.05,
          shotgun: 0.65,
          tesla: 0.01,
          claws: 0.1,
          venom: 0,
          cold: 0.5,
          shock: 0.01,
          fire: 0.02,
          acid: 1,
          stone: 0.25,
          iron: 0.75,
          flesh: 0.1,
          ice: 0.5,
          magma: 0.03,
          axe: 0.1,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      gargoyle: {
        weapon: {
          laser: 0.15,
          flame: 0.4,
          plasma: 0.3,
          kinetic: 0.5,
          missile: 0.5,
          sonic: 0.85,
          shotgun: 1,
          tesla: 0.2,
          claws: 0.45,
          venom: 0.05,
          cold: 0.15,
          shock: 0.08,
          fire: 0.38,
          acid: 0.85,
          stone: 1,
          iron: 0.85,
          flesh: 0.25,
          ice: 0.15,
          magma: 0.35,
          axe: 0.42,
          hammer: 1,
        },
        nozone: {},
        amp: {},
      },
      chimera: {
        weapon: {
          laser: 0.38,
          flame: 0.6,
          plasma: 0.42,
          kinetic: 0.85,
          missile: 0.35,
          sonic: 0.5,
          shotgun: 0.65,
          tesla: 0.8,
          claws: 0.92,
          venom: 0.5,
          cold: 0.45,
          shock: 0.8,
          fire: 0.56,
          acid: 0.4,
          stone: 0.5,
          iron: 0.5,
          flesh: 0.5,
          ice: 0.48,
          magma: 0.54,
          axe: 0.88,
          hammer: 0.42,
        },
        nozone: {},
        amp: {},
      },
      gorgon: {
        weapon: {
          laser: 0.65,
          flame: 0.65,
          plasma: 0.64,
          kinetic: 0.65,
          missile: 0.66,
          sonic: 0.65,
          shotgun: 0.65,
          tesla: 0.65,
          claws: 0.65,
          venom: 0.65,
          cold: 0.65,
          shock: 0.65,
          fire: 0.65,
          acid: 0.65,
          stone: 0.65,
          iron: 0.65,
          flesh: 0.65,
          ice: 0.65,
          magma: 0.65,
          axe: 0.65,
          hammer: 0.65,
        },
        nozone: {},
        amp: {},
      },
      kraken: {
        weapon: {
          laser: 0.75,
          flame: 0.35,
          plasma: 0.75,
          kinetic: 0.35,
          missile: 0.5,
          sonic: 0.18,
          shotgun: 0.05,
          tesla: 0.85,
          claws: 0.32,
          venom: 0.8,
          cold: 0.66,
          shock: 0.82,
          fire: 0.33,
          acid: 0.75,
          stone: 0.45,
          iron: 0.35,
          flesh: 0.4,
          ice: 0.66,
          magma: 0.33,
          axe: 0.36,
          hammer: 0.5,
        },
        nozone: {},
        amp: {},
      },
      homunculus: {
        weapon: {
          laser: 0.05,
          flame: 1,
          plasma: 0.1,
          kinetic: 0.85,
          missile: 0.65,
          sonic: 0.5,
          shotgun: 0.75,
          tesla: 0.2,
          claws: 0.85,
          venom: 0.4,
          cold: 0.12,
          shock: 0.22,
          fire: 1,
          acid: 0.13,
          stone: 0.65,
          iron: 0.68,
          flesh: 0.95,
          ice: 0.18,
          magma: 0.9,
          axe: 0.85,
          hammer: 0.65,
        },
        nozone: {},
        amp: {},
      },
      giant_chicken: {
        weapon: {
          laser: 0.95,
          flame: 0.95,
          plasma: 0.95,
          kinetic: 0.95,
          missile: 0.95,
          sonic: 0.95,
          shotgun: 0.95,
          tesla: 0.95,
          claws: 0.95,
          venom: 0.96,
          cold: 0.95,
          shock: 0.95,
          fire: 0.95,
          acid: 0.95,
          stone: 0.95,
          iron: 0.95,
          flesh: 0.94,
          ice: 0.95,
          magma: 0.95,
          axe: 0.95,
          hammer: 0.95,
        },
        nozone: {},
        amp: {},
      },
      skeleton_pack: {
        weapon: {
          laser: 0.5,
          flame: 0.1,
          plasma: 0.5,
          kinetic: 1,
          missile: 1.2,
          sonic: 0.5,
          shotgun: 1.05,
          tesla: 0.2,
          claws: 0.65,
          venom: 0,
          cold: 0.11,
          shock: 0.22,
          fire: 0.1,
          acid: 0.5,
          stone: 1,
          iron: 0.65,
          flesh: 0.25,
          ice: 0.1,
          magma: 0.12,
          axe: 0.15,
          hammer: 1.08,
        },
        nozone: {},
        amp: {},
      },
    },
    // export function hellSupression(area, val) from portal.js
    hellSupression: function (t, e) {
      switch (t) {
        case "ruins": {
          let t = e || getBuildings().RuinsGuardPost.stateOnCount,
            r = 75 * getBuildings().RuinsArcology.stateOnCount,
            a = getGame().armyRating(
              t * traitVal("high_pop", 0, 1),
              "hellArmy",
              0,
            );
          a *= traitVal("holy", 1, "+");
          let l = (a + r) / 5e3;
          return { supress: l > 1 ? 1 : l, rating: a + r };
        }
        case "gate": {
          let t = poly.hellSupression("ruins", e),
            r = 100 * getBuildings().GateTurret.stateOnCount;
          r *= traitVal("holy", 1, "+");
          let a = (t.rating + r) / 7500;
          return { supress: a > 1 ? 1 : a, rating: t.rating + r };
        }
        default:
          return 0;
      }
    },
    // function taxCap(min) from civics.js
    taxCap: function (e) {
      let a =
        (haveTech("currency", 5) || getGame().global.race.terrifying) &&
        !getGame().global.race.noble;
      if (e) return a ? 0 : traitVal("noble", 0, 10);
      {
        let e = traitVal("noble", 1, 30);
        return (
          a && (e += 20),
          "oligarchy" === getGame().global.civic.govern.type &&
            (e += "bureaucrat" === getGovernor() ? 25 : 20),
          "noble" === getGovernor() && (e += 20),
          getGame().global.race["wish"] &&
            getGame().global.race["wishStats"] &&
            (e += getGame().global.race.wishStats.tax),
          e
        );
      }
    },
    // export function mechCost(size,infernal) from portal.js
    mechCost: function (e, a, x) {
      let l = 9999,
        r = 1e7;
      switch (e) {
        case "small":
          {
            let e = (x ?? getGame().global.blood.prepared) >= 2 ? 5e4 : 75e3;
            ((r = a ? 2.5 * e : e), (l = a ? 20 : 1));
          }
          break;
        case "medium":
          ((r = a ? 45e4 : 18e4), (l = a ? 100 : 4));
          break;
        case "large":
          ((r = a ? 925e3 : 375e3), (l = a ? 500 : 20));
          break;
        case "titan":
          ((r = a ? 15e5 : 75e4), (l = a ? 1500 : 75));
          break;
        case "collector": {
          let e = (x ?? getGame().global.blood.prepared) >= 2 ? 8e3 : 1e4;
          ((r = a ? 2.5 * e : e), (l = 1));
        }
      }
      return { s: l, c: r };
    },
    // function terrainRating(mech,rating,effects) from portal.js
    terrainRating: function (e, i, s, x) {
      return (
        !e.equip.includes("special") ||
          ("small" !== e.size &&
            "medium" !== e.size &&
            "collector" !== e.size) ||
          (i < 1 && (i += (1 - i) * (s.includes("gravity") ? 0.1 : 0.2))),
        "small" !== e.size &&
          i < 1 &&
          (i +=
            (s.includes("fog") || s.includes("dark") ? 0.005 : 0.01) *
            (x ?? getGame().global.portal.mechbay.scouts)) > 1 &&
          (i = 1),
        i
      );
    },
    // function weaponPower(mech,power) from portal.js
    weaponPower: function (e, i) {
      return (
        i < 1 &&
          0 !== i &&
          e.equip.includes("special") &&
          "titan" === e.size &&
          (i += 0.25 * (1 - i)),
        !e.equip.includes("special") ||
          ("large" !== e.size && "cyberdemon" !== e.size) ||
          (i *= 1.02),
        i
      );
    },
    // export function timeFormat(time) from functions.js
    timeFormat: function (e) {
      let i;
      if (e < 0) i = getGame().loc("time_never");
      else if ((e = +e.toFixed(0)) > 60) {
        let l: any = e % 60,
          s: any = (e - l) / 60;
        if (s >= 60) {
          let e: any = s % 60,
            l: any = (s - e) / 60;
          if (l > 24) {
            i = `${(l - (e = l % 24)) / 24}d ${e}h`;
          } else i = `${l}h ${(e = ("0" + e).slice(-2))}m`;
        } else
          i = `${(s = ("0" + s).slice(-2))}m ${(l = ("0" + l).slice(-2))}s`;
      } else i = `${(e = ("0" + e).slice(-2))}s`;
      return i;
    },
    // export universeAffix(universe) from achieve.js
    universeAffix: function (e) {
      switch ((e = e || getGame().global.race.universe)) {
        case "evil":
          return "e";
        case "antimatter":
          return "a";
        case "heavy":
          return "h";
        case "micro":
          return "m";
        case "magic":
          return "mg";
        default:
          return "l";
      }
    },
    // export const genus_traits from races.js (added spores:1 to fungi manually)
    genus_traits: {
      humanoid: { adaptable: 1, wasteful: 1 },
      carnivore: { carnivore: 1, beast: 1, cautious: 1 },
      herbivore: { herbivore: 1, instinct: 1 },
      small: { small: 1, weak: 1 },
      giant: { large: 1, strong: 1 },
      reptilian: { cold_blooded: 1, scales: 1 },
      avian: { flier: 1, hollow_bones: 1, sky_lover: 1 },
      insectoid: { high_pop: 1, fast_growth: 1, high_metabolism: 1 },
      plant: { sappy: 1, asymmetrical: 1 },
      fungi: { detritivore: 1, spongy: 1, spores: 1 },
      aquatic: { submerged: 1, low_light: 1 },
      fey: { elusive: 1, iron_allergy: 1 },
      heat: { smoldering: 1, cold_intolerance: 1 },
      polar: { chilled: 1, heat_intolerance: 1 },
      sand: { scavenger: 1, nomadic: 1 },
      demonic: { immoral: 1, evil: 1, soul_eater: 1 },
      angelic: { blissful: 1, pompous: 1, holy: 1 },
      synthetic: { artifical: 1, powered: 1 },
      eldritch: { psychic: 1, tormented: 1, darkness: 1, unfathomable: 1 },
      hybrid: {},
    },
    // export const neg_roll_traits from races.js
    neg_roll_traits: [
      "angry",
      "arrogant",
      "atrophy",
      "diverse",
      "dumb",
      "fragrant",
      "frail",
      "freespirit",
      "gluttony",
      "gnawer",
      "greedy",
      "hard_of_hearing",
      "heavy",
      "hooved",
      "invertebrate",
      "lazy",
      "mistrustful",
      "nearsighted",
      "nyctophilia",
      "paranoid",
      "pathetic",
      "pessimistic",
      "puny",
      "pyrophobia",
      "skittish",
      "slow",
      "slow_regen",
      "snowy",
      "solitary",
      "unorganized",
    ],

    // Reimplemented:
    // export function crateValue() from resources.js
    crateValue: () =>
      Number(
        getVueById("createHead")?.buildCrateDesc().match(/(\d+)/g)[1] ?? 0,
      ),
    // export function containerValue() from resources.js
    containerValue: () =>
      Number(
        getVueById("createHead")?.buildContainerDesc().match(/(\d+)/g)[1] ?? 0,
      ),

    // Firefox compatibility:
    adjustCosts: (c_action, wiki?) =>
      getGame().adjustCosts(
        cloneIntoPage(c_action, { cloneFunctions: true }),
        wiki,
      ),
    loc: (key, variables) => getGame().loc(key, cloneIntoPage(variables)),
    messageQueue: (msg, color, dnr, tags) =>
      getGame().messageQueue(msg, color, dnr, cloneIntoPage(tags)),
    shipCosts: (bp) => getGame().shipCosts(cloneIntoPage(bp)),
  };

  return poly;
}
