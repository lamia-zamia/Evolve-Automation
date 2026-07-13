import assert from "node:assert/strict";

import { createGameRates } from "../src/game/rates.ts";

let tickRate = 2;
let game = {
  global: {
    settings: { at: 0 },
    race: {},
    stats: { achieve: {} },
    tech: {},
    city: {
      s_alter: { regen: 0 },
      banquet: { strength: 0 },
      calendar: {
        weather: 0,
        temp: 0,
        wind: 1,
        day: 0,
        orbit: 100,
        season: 0,
      },
      biome: "grassland",
      ptrait: [],
    },
    genes: {},
  },
};
const neutralTrait = (_trait, _index, operation) =>
  operation === "+" || operation === "-" || operation === "="
    ? 1
    : (operation ?? 0);
const rates = createGameRates({
  getSettings: () => ({ tickRate }),
  getGame: () => game,
  getBuildings: () => ({
    EnceladusBase: { stateOnCount: 0 },
    BootCamp: { count: 0 },
    Hospital: { count: 0 },
    Banquet: { stateOnCount: 0, count: 0 },
  }),
  getState: () => ({ astroSign: "none" }),
  getResources: () => ({ Population: { currentQuantity: 100 } }),
  getJobs: () => ({ Meditator: { count: 0 } }),
  getTraitVal: () => neutralTrait,
  getGovernor: () => "none",
  getHaveTech: () => () => false,
  getDate: () => ({ getMonth: () => 0, getDate: () => 1 }),
});

assert.equal(rates.ticksPerSecond(), 2);
assert.equal(rates.getFoodConsume(), 1);
assert.equal(rates.getResourcesPerClick(), 1);

tickRate = 4;
game = { ...game, global: { ...game.global, settings: { at: 1 } } };
assert.equal(rates.ticksPerSecond(), 0.5);

console.log("Game rate module tests passed");
