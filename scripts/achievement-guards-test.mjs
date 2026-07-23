import assert from "node:assert/strict";

import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
  isAchievementGuardName,
  isAchievementUnlocked,
} from "../src/domain/progression/prestige/achievement-guards.ts";

assert.equal(
  calculateAchievementStarLevel({
    challengePlasmid: false,
    challengeTrade: false,
    challengeCraft: false,
    challengeCrispr: false,
  }),
  1,
);
assert.equal(
  calculateAchievementStarLevel({
    challengePlasmid: true,
    challengeTrade: true,
    challengeCraft: true,
    challengeCrispr: true,
  }),
  5,
);
assert.equal(isAchievementUnlocked(3, 3), true);
assert.equal(isAchievementUnlocked(2, 3), false);
assert.equal(isAchievementGuardName("guardPacifist"), true);
assert.equal(isAchievementGuardName("missingGuard"), false);

const pacifist = {
  guard: "guardPacifist",
  enabled: true,
  earnedStar: 3,
  targetStar: 4,
  attacks: 0,
};
assert.equal(isAchievementGuardActive(pacifist), true);
assert.equal(isAchievementGuardActive({ ...pacifist, attacks: 1 }), false);

console.log("Achievement guard domain tests passed");
