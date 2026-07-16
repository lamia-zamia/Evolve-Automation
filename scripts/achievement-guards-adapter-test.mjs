import assert from "node:assert/strict";

import {
  readAchievementGuardInput,
  readAchievementStar,
  readAchievementStarLevelContext,
} from "../src/adapters/evolve/achievement-guards.ts";
import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
} from "../src/domain/achievement-guards.ts";

function makeInput() {
  const input = {
    settings: {
      achievementGuards: true,
      guardPacifist: true,
      guardDreaded: true,
      guardCultOfPersonality: true,
      guardAnarchist: true,
      guardEnergetic: true,
      guardRedDead: true,
      guardSecondEvolution: true,
      prestigeType: "ascension",
    },
    game: {
      alevel() {
        assert.equal(this, input.game);
        return 4;
      },
      global: {
        civic: { govern: { type: "anarchy" } },
        race: { species: "human", gods: "human" },
        stats: {
          attacks: 0,
          achieve: { pacifist: { standard: 3 } },
          feat: {},
        },
      },
    },
    poly: {
      universeAffix(universe = "standard") {
        assert.equal(this, input.poly);
        return universe;
      },
    },
    buildings: {
      Dreadnought: { count: 0 },
      SiriusThermalCollector: { count: 0 },
      RedSpaceport: { count: 0 },
    },
  };
  return input;
}

let input = makeInput();
assert.deepEqual(readAchievementStar(input.game, input.poly, "pacifist"), {
  status: "ready",
  star: 3,
});
assert.deepEqual(readAchievementStar(input.game, input.poly, "missing"), {
  status: "ready",
  star: 0,
});
const level = readAchievementStarLevelContext({
  challenge_plasmid: true,
  challenge_trade: false,
  challenge_craft: true,
});
assert.equal(level.status, "ready");
assert.equal(calculateAchievementStarLevel(level.context), 3);

let guard = readAchievementGuardInput(
  input.settings,
  input.game,
  input.poly,
  input.buildings,
  "guardPacifist",
);
assert.equal(guard.status, "ready");
assert.equal(isAchievementGuardActive(guard.input), true);

guard = readAchievementGuardInput(
  input.settings,
  input.game,
  input.poly,
  input.buildings,
  "guardCultOfPersonality",
);
assert.equal(guard.status, "ready");
assert.equal(isAchievementGuardActive(guard.input), false);
input.game.global.stats.attacks = 1;
guard = readAchievementGuardInput(
  input.settings,
  input.game,
  input.poly,
  input.buildings,
  "guardCultOfPersonality",
);
assert.equal(guard.status, "ready");
assert.equal(isAchievementGuardActive(guard.input), true);

input = makeInput();
input.game.global.stats.achieve.pacifist.standard = Number.NaN;
guard = readAchievementGuardInput(
  input.settings,
  input.game,
  input.poly,
  input.buildings,
  "guardPacifist",
);
assert.deepEqual(guard, {
  status: "unavailable",
  reason: "invalid-achievement",
  field: "achieve.pacifist.standard",
  fallbackActive: true,
});
assert.equal(
  readAchievementStar(input.game, input.poly, "pacifist").status,
  "unavailable",
  "malformed stars must not escape the Evolve adapter",
);

input = makeInput();
input.game.global.stats.achieve.pacifist.standard = Number.NaN;
guard = readAchievementGuardInput(
  input.settings,
  input.game,
  input.poly,
  input.buildings,
  "guardCultOfPersonality",
);
assert.equal(guard.status, "unavailable");
assert.equal(
  guard.fallbackActive,
  false,
  "Cult must stay behind conservatively armed Pacifist on malformed data",
);

input = makeInput();
input.settings.guardPacifist = false;
assert.deepEqual(
  readAchievementGuardInput(input.settings, {}, {}, {}, "guardPacifist"),
  { status: "inactive" },
);
guard = readAchievementGuardInput(
  input.settings,
  input.game,
  input.poly,
  input.buildings,
  "guardCultOfPersonality",
);
assert.equal(guard.status, "ready");
assert.equal(isAchievementGuardActive(guard.input), true);
assert.deepEqual(
  readAchievementGuardInput(
    input.settings,
    input.game,
    input.poly,
    input.buildings,
    "missingGuard",
  ),
  { status: "inactive" },
);
assert.equal(
  readAchievementStarLevelContext({ challenge_plasmid: "true" }).status,
  "unavailable",
);

console.log("Achievement guard Evolve adapter tests passed");
