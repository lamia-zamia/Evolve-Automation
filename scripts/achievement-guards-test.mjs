import assert from "node:assert/strict";

import {
  calculateAchievementStarLevel,
  isAchievementGuardActive,
  isAchievementGuardName,
  isAchievementUnlocked,
} from "../src/domain/achievement-guards.ts";
import { legacyAchievementGuardActive } from "./test-support/legacy-achievement-guards.mjs";

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
const scenarios = [
  pacifist,
  { ...pacifist, attacks: 1 },
  { ...pacifist, earnedStar: 4 },
  {
    guard: "guardDreaded",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    prestigeType: "ascension",
    dreadnoughts: 0,
  },
  {
    guard: "guardCultOfPersonality",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    pacifist,
  },
  {
    guard: "guardCultOfPersonality",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    pacifist: { ...pacifist, attacks: 1 },
  },
  {
    guard: "guardAnarchist",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    prestigeType: "mad",
    government: "anarchy",
  },
  {
    guard: "guardEnergetic",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    prestigeType: "ascension",
    thermalCollectors: 0,
  },
  {
    guard: "guardRedDead",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    prestigeType: "mad",
    redSpaceports: 0,
  },
  {
    guard: "guardSecondEvolution",
    enabled: true,
    earnedStar: 0,
    targetStar: 4,
    species: "human",
    gods: "human",
  },
];

for (const scenario of scenarios) {
  assert.equal(
    isAchievementGuardActive(scenario),
    legacyAchievementGuardActive(scenario),
    `legacy trace mismatch for ${scenario.guard}`,
  );
}

console.log("Achievement guard domain tests passed");
