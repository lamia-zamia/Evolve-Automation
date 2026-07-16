import assert from "node:assert/strict";

import { createRunGuards } from "../src/policies/run-guards.ts";

let settings = {
  achievementGuards: true,
  guardPacifist: true,
  inflationChallengeAssist: true,
  inflationChallengeSaveMinutes: 10,
  retirementChallengeAssist: true,
  prestigeType: "retire",
};
let game = {
  alevel: () => 2,
  global: {
    civic: { govern: { type: "anarchy" } },
    race: {
      species: "human",
      gods: "human",
      inflation: true,
      truepath: true,
    },
    resource: {},
    stats: { attacks: 0, achieve: {}, feat: {}, banana: {} },
    tech: {},
  },
};
let resources = {
  Money: {
    currentQuantity: 250_000_000_000,
    maxQuantity: 250_000_000_000,
    rateOfChange: 0,
  },
  Graphene: {
    name: "Graphene",
    currentQuantity: 0,
    maxQuantity: 100_000_000,
  },
};
let buildings = {
  Dreadnought: { count: 0 },
  SiriusThermalCollector: { count: 0 },
  RedSpaceport: { count: 0 },
  TauFusionGenerator: { name: "Fusion", count: 20 },
  TauFactory: { name: "Factory", count: 18 },
  TauDiseaseLab: { name: "Lab", count: 11 },
};

const guards = createRunGuards({
  getSettings: () => settings,
  getGame: () => game,
  getResources: () => resources,
  getBuildings: () => buildings,
  getAchievementStar: (id) => game.global.stats.achieve[id]?.standard ?? 0,
  haveTech: (tech) => Boolean(game.global.tech[tech]),
  getNumberString: (amount) => `${amount / 1_000_000}M`,
  inflationChallengeMoney: 250_000_000_000,
  retirementPreparation: {
    fusionGenerators: 20,
    factories: 18,
    scienceLabs: 11,
    graphene: 200_000_000,
  },
});

assert.equal(guards.inflationChallengeSecondsToFinish(), 0);
assert.equal(guards.inflationChallengeShouldSaveMoney(), true);
settings.inflationChallengeSaveMinutes = -1;
assert.equal(guards.inflationChallengeShouldSaveMoney(), false);

assert.deepEqual(guards.retirementPreparationMissing(), [
  "Graphene storage 100M/200M",
]);
resources = {
  ...resources,
  Graphene: {
    name: "Graphene",
    currentQuantity: 150_000_000,
    maxQuantity: 250_000_000,
  },
};
assert.deepEqual(guards.retirementPreparationMissing(), [
  "Graphene stockpile 150M/200M",
]);
game = {
  ...game,
  global: {
    ...game.global,
    tech: { isolation: 1 },
  },
};
assert.deepEqual(guards.retirementPreparationMissing(), []);

console.log("Run guard module regression tests passed");
