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
let pacifistGuardActive = false;
const read = () =>
  readForeignAchievementGoal({
    getSettings: () => settings,
    getGame: () => game,
    isAchievementUnlocked: (id) => unlocked.has(id),
    isPacifistGuardActive: () => pacifistGuardActive,
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
    isPacifistGuardActive: () => false,
  }),
  null,
);

// An armed Pacifist guard forbids attacking, so World Domination is unreachable
// and must not be queried; Syndicate remains a pacifist-compatible path.
settings.achievementGuards = true;
pacifistGuardActive = true;
unlocked.delete("world_domination");
assert.equal(read(), "syndicate");
assert.equal(
  readForeignAchievementGoal({
    getSettings: () => settings,
    getGame: () => game,
    isAchievementUnlocked: (id) => {
      if (id === "world_domination") {
        throw new Error("pacifist runs must not query world domination");
      }
      return unlocked.has(id);
    },
    isPacifistGuardActive: () => true,
  }),
  "syndicate",
);
unlocked.add("syndicate");
assert.equal(read(), null);
unlocked.delete("syndicate");
pacifistGuardActive = false;

// A guard reader that cannot answer leaves the goal unselected rather than
// silently picking an attacking path.
assert.equal(
  readForeignAchievementGoal({
    getSettings: () => settings,
    getGame: () => game,
    isAchievementUnlocked: (id) => unlocked.has(id),
    isPacifistGuardActive: () => undefined,
  }),
  null,
);
settings.achievementGuards = false;

game = { global: { civic: { foreign: {} } } };
assert.equal(read(), null);

console.log("Foreign achievement Evolve adapter tests passed");
