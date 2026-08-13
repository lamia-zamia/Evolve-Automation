import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

class FixedDate {
  static now() {
    return 0;
  }
  getMonth() {
    return 0;
  }
  getDate() {
    return 1;
  }
}
const { hooks } = await loadCharacterizationBundle({
  console,
  Date: FixedDate,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.setGameRateTestContext, "function");
const rates = hooks.gameRates;
for (const name of [
  "ticksPerSecond",
  "getHealingRate",
  "getFoodConsume",
  "getGrowthRate",
  "getResourcesPerClick",
]) {
  assert.equal(typeof rates?.[name], "function", `${name} hook missing`);
}

function neutralTrait(_trait, _index, operation) {
  if (operation === "+" || operation === "-" || operation === "=") {
    return 1;
  }
  return operation ?? 0;
}

function makeContext() {
  return {
    settings: { tickRate: 2 },
    game: {
      global: {
        settings: { at: 0 },
        race: { species: "human" },
        stats: { achieve: {} },
        tech: { medic: 2 },
        city: {
          s_alter: { regen: 0 },
          banquet: { strength: 0 },
          calendar: {
            weather: 0,
            temp: 0,
            wind: 1,
            day: 10,
            orbit: 100,
            season: 0,
          },
          biome: "grassland",
          ptrait: [],
        },
        genes: {},
      },
    },
    buildings: {
      EnceladusBase: { stateOnCount: 0 },
      BootCamp: { count: 0 },
      Hospital: { count: 10 },
      Banquet: { stateOnCount: 0, count: 0 },
    },
    state: { astroSign: "none" },
    resources: { Population: { currentQuantity: 100 } },
    jobs: { Meditator: { count: 0 } },
    traitVal: neutralTrait,
  };
}

let context = makeContext();
hooks.setGameRateTestContext(context);
assert.equal(rates.ticksPerSecond(), 2);
context.game.global.settings.at = 1;
assert.equal(rates.ticksPerSecond(), 1);
assert.equal(rates.getHealingRate(), 2);
assert.equal(rates.getFoodConsume(), 1);
context.game.global.race.artifical = true;
assert.equal(rates.getGrowthRate(), 0);
assert.equal(rates.getResourcesPerClick(), 1);

context = makeContext();
Object.assign(context.game.global.race, {
  orbit_decayed: true,
  truepath: true,
  rejuvenated: true,
  fibroblast: 3,
  governor: { g: { bg: "sports" } },
});
context.game.global.stats.achieve.lamentis = { l: 7 };
context.game.global.city.s_alter.regen = 1;
context.game.global.city.banquet.strength = 100;
context.buildings.EnceladusBase.stateOnCount = 5;
context.buildings.Banquet = { stateOnCount: 1, count: 2 };
context.state.astroSign = "cancer";
context.traitVal = (trait, index, operation) => {
  if (trait === "cannibalize" && operation === "+") return 1.2;
  if (trait === "high_pop" && index === 2) return 1.5;
  if (trait === "slow_regen") return 1.5;
  if (trait === "regenerative") return 2;
  return neutralTrait(trait, index, operation);
};
hooks.setGameRateTestContext(context);
let healingBase = 10 * 1.05 * 2 + 6;
healingBase *= 1.2 * 1.5 * 1.5 * (1 + 100 ** 0.65 / 100);
healingBase = Math.round(healingBase);
const maxBound = 30;
const leftover = healingBase % maxBound;
let success = 0;
for (let i = 0; i < leftover; i++) {
  for (let j = 0; j < maxBound; j++) {
    success += i > j;
  }
}
const expectedHealing =
  2 + Math.floor(healingBase / maxBound) + success / (leftover * maxBound);
assert.equal(rates.getHealingRate(), expectedHealing);

context = makeContext();
Object.assign(context.game.global.race, { photosynth: true });
Object.assign(context.game.global.city.calendar, { weather: 1, season: 3 });
context.settings.tickRate = 4;
context.traitVal = (trait, index, operation) => {
  const values = {
    gluttony: 1.2,
    high_metabolism: 1.1,
    sticky: 0.8,
    photosynth: 0.7,
    ravenous: 1.3,
    hibernator: 0.5,
    high_pop: 2,
  };
  return values[trait] ?? neutralTrait(trait, index, operation);
};
hooks.setGameRateTestContext(context);
assert.equal(rates.getFoodConsume(), 0.24024);

context = makeContext();
context.game.global.tech.reproduction = 2;
context.game.global.genes = { birth: 1, enhance: 1 };
context.game.global.race.promiscuous = 2;
context.game.global.city.biome = "taiga";
context.buildings.Hospital.count = 3;
context.state.astroSign = "libra";
context.traitVal = (trait, index, operation) => {
  if (trait === "fast_growth" && index === 0) return 1.5;
  if (trait === "fast_growth" && index === 1) return 2;
  if (trait === "high_pop" && index === 2) return 1.2;
  if (trait === "strong") return 1.5;
  return neutralTrait(trait, index, operation);
};
hooks.setGameRateTestContext(context);
const expectedGrowth = 24.75 / ((100 * 1.810792884997279) / 2);
assert.equal(rates.getGrowthRate(), expectedGrowth);
assert.equal(rates.getResourcesPerClick(), 3);

console.log("Game rate bundled characterization tests passed");
