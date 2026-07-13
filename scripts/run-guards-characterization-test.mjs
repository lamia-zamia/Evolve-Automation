import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const readyCallbacks = [];
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({
    ready(callback) {
      readyCallbacks.push(callback);
    },
  }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setRunGuardTestContext, "function");
for (const name of [
  "getStarLevel",
  "getAchievementStar",
  "isAchievementUnlocked",
  "guardActive",
  "bananaRepublicObjectiveComplete",
  "bananaRepublicSmoothieComplete",
  "bananaRepublicReadyForUnification",
  "guardBananaRepublicActive",
  "inflationChallengeAssistActive",
  "inflationChallengeMoneyReachable",
  "inflationChallengeSecondsToFinish",
  "inflationChallengeShouldSaveMoney",
  "retirementChallengeAssistActive",
  "retirementPreparationMissing",
]) {
  assert.equal(
    typeof hooks.runGuards[name],
    "function",
    `${name} hook missing`,
  );
}

function makeContext() {
  const universe = "standard";
  return {
    settings: {
      achievementGuards: true,
      guardPacifist: true,
      guardDreaded: true,
      guardCultOfPersonality: true,
      guardAnarchist: true,
      guardEnergetic: true,
      guardRedDead: true,
      guardSecondEvolution: true,
      guardBananaRepublic: true,
      inflationChallengeAssist: true,
      inflationChallengeSaveMinutes: 30,
      retirementChallengeAssist: true,
      prestigeType: "ascension",
    },
    game: {
      alevel: () => 4,
      global: {
        civic: { govern: { type: "anarchy" } },
        race: {
          species: "human",
          gods: "human",
          banana: true,
          inflation: true,
          truepath: true,
        },
        resource: {
          Food: { trade: -500 },
          Lumber: { trade: 250 },
          Stone: { trade: 250 },
          Money: {},
        },
        stats: {
          attacks: 0,
          achieve: {},
          feat: {},
          banana: {},
        },
        tech: {},
      },
    },
    poly: {
      universeAffix: (requestedUniverse = universe) => `u-${requestedUniverse}`,
    },
    resources: {
      Money: {
        currentQuantity: 249_999_999_000,
        maxQuantity: 250_000_000_000,
        rateOfChange: 10,
      },
      Graphene: {
        name: "Graphene",
        currentQuantity: 150_000_000,
        maxQuantity: 250_000_000,
      },
    },
    buildings: {
      Dreadnought: { count: 0 },
      SiriusThermalCollector: { count: 0 },
      RedSpaceport: { count: 0 },
      TauFusionGenerator: { name: "Fusion Generator", count: 19 },
      TauFactory: { name: "Factory", count: 18 },
      TauDiseaseLab: { name: "Disease Lab", count: 10 },
    },
  };
}

function snapshot(context) {
  hooks.setRunGuardTestContext(context);
  const guards = hooks.runGuards;
  return {
    starLevels: [
      guards.getStarLevel({}),
      guards.getStarLevel({
        challenge_plasmid: true,
        challenge_trade: true,
        challenge_craft: true,
        challenge_crispr: true,
      }),
    ],
    achievementStar: guards.getAchievementStar("pacifist"),
    achievementStarInEvil: guards.getAchievementStar("pacifist", "evil"),
    achievementUnlocked: guards.isAchievementUnlocked("pacifist", 3),
    activeGuards: Object.fromEntries(
      [
        "guardPacifist",
        "guardDreaded",
        "guardCultOfPersonality",
        "guardAnarchist",
        "guardEnergetic",
        "guardRedDead",
        "guardSecondEvolution",
        "missingGuard",
      ].map((name) => [name, guards.guardActive(name)]),
    ),
    banana: {
      b1: guards.bananaRepublicObjectiveComplete("b1"),
      smoothie: guards.bananaRepublicSmoothieComplete(),
      ready: guards.bananaRepublicReadyForUnification(),
      guarded: guards.guardBananaRepublicActive(),
    },
    inflation: {
      active: guards.inflationChallengeAssistActive(),
      reachable: guards.inflationChallengeMoneyReachable(),
      seconds: guards.inflationChallengeSecondsToFinish(),
      save: guards.inflationChallengeShouldSaveMoney(),
    },
    retirement: {
      active: guards.retirementChallengeAssistActive(),
      missing: [...guards.retirementPreparationMissing()],
    },
  };
}

const armed = makeContext();
armed.game.global.stats.achieve.pacifist = {
  "u-standard": 3,
  "u-evil": 4,
};
armed.game.global.stats.banana = Object.fromEntries(
  ["b1", "b2", "b3", "b4", "b5"].map((id) => [id, { "u-standard": true }]),
);

assert.deepEqual(snapshot(armed), {
  starLevels: [1, 5],
  achievementStar: 3,
  achievementStarInEvil: 4,
  achievementUnlocked: true,
  activeGuards: {
    guardPacifist: true,
    guardDreaded: true,
    guardCultOfPersonality: false,
    guardAnarchist: false,
    guardEnergetic: true,
    guardRedDead: false,
    guardSecondEvolution: true,
    missingGuard: false,
  },
  banana: { b1: true, smoothie: true, ready: true, guarded: false },
  inflation: { active: true, reachable: true, seconds: 100, save: true },
  retirement: {
    active: false,
    missing: [],
  },
});

const constrained = makeContext();
constrained.settings.prestigeType = "retire";
constrained.resources.Money.maxQuantity = 249_999_999_999;
constrained.resources.Money.rateOfChange = 0;
constrained.game.global.stats.feat.banana = 1;
constrained.game.global.stats.feat.energetic = 4;
constrained.game.global.race.gods = "elven";

assert.deepEqual(snapshot(constrained), {
  starLevels: [1, 5],
  achievementStar: 0,
  achievementStarInEvil: 0,
  achievementUnlocked: false,
  activeGuards: {
    guardPacifist: true,
    guardDreaded: false,
    guardCultOfPersonality: false,
    guardAnarchist: false,
    guardEnergetic: false,
    guardRedDead: false,
    guardSecondEvolution: false,
    missingGuard: false,
  },
  banana: { b1: false, smoothie: true, ready: false, guarded: true },
  inflation: {
    active: true,
    reachable: false,
    seconds: Number.POSITIVE_INFINITY,
    save: false,
  },
  retirement: {
    active: true,
    missing: [
      "Fusion Generator 19/20",
      "Disease Lab 10/11",
      "Graphene stockpile 150.0M/200.0M",
    ],
  },
});

constrained.settings.achievementGuards = false;
constrained.settings.inflationChallengeAssist = false;
constrained.game.global.tech.isolation = 1;
const released = snapshot(constrained);
assert.equal(released.activeGuards.guardPacifist, false);
assert.equal(released.banana.guarded, false);
assert.equal(released.inflation.active, false);
assert.equal(released.retirement.active, false);
assert.deepEqual(released.retirement.missing, []);

console.log("Run guard bundled characterization tests passed");
