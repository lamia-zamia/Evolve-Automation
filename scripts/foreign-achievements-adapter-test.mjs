import assert from "node:assert/strict";
import { readForeignAchievementGoal } from "../src/adapters/evolve/combat/foreign-achievements.ts";

const foreignGovernment = (overrides = {}) => ({
  occ: false,
  anx: false,
  buy: false,
  ...overrides,
});

let settings = {
  achievementGuards: true,
  guardWorldDomination: true,
  guardSyndicate: true,
};
let game = {
  global: {
    civic: {
      foreign: {
        gov0: foreignGovernment(),
        gov1: foreignGovernment(),
        gov2: foreignGovernment(),
      },
    },
  },
};
const unlocked = new Set();
const read = () =>
  readForeignAchievementGoal({
    getSettings: () => settings,
    getGame: () => game,
    isAchievementUnlocked: (id) => unlocked.has(id),
  });

assert.equal(read(), "world-domination");
game.global.civic.foreign.gov1.buy = true;
assert.equal(read(), "syndicate");
game.global.civic.foreign.gov1.buy = false;
game.global.civic.foreign.gov0.anx = true;
assert.equal(read(), null);
game.global.civic.foreign.gov0.anx = false;
unlocked.add("world_domination");
assert.equal(read(), "syndicate");
settings.guardSyndicate = false;
assert.equal(read(), null);
settings.guardSyndicate = true;
settings.achievementGuards = false;
assert.equal(read(), null);

assert.equal(
  readForeignAchievementGoal({
    getSettings: () => ({
      achievementGuards: true,
      guardWorldDomination: false,
      guardSyndicate: false,
    }),
    getGame: () => game,
    isAchievementUnlocked: () => {
      throw new Error("disabled toggles must not query achievements");
    },
  }),
  null,
);

game = { global: { civic: { foreign: {} } } };
assert.equal(read(), null);

console.log("Foreign achievement Evolve adapter tests passed");
