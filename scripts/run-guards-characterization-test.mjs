import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const readyCallbacks = [];
const { hooks } = await loadCharacterizationBundle({
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

const cultPrecedence = makeContext();
assert.equal(snapshot(cultPrecedence).activeGuards.guardPacifist, true);
assert.equal(
  snapshot(cultPrecedence).activeGuards.guardCultOfPersonality,
  false,
  "Pacifist wins while both incompatible guards are armed",
);
cultPrecedence.game.global.stats.attacks = 1;
assert.equal(snapshot(cultPrecedence).activeGuards.guardPacifist, false);
assert.equal(
  snapshot(cultPrecedence).activeGuards.guardCultOfPersonality,
  true,
);
cultPrecedence.game.global.stats.attacks = 0;
cultPrecedence.settings.guardPacifist = false;
assert.equal(
  snapshot(cultPrecedence).activeGuards.guardCultOfPersonality,
  true,
);
cultPrecedence.settings.guardPacifist = true;
cultPrecedence.game.global.stats.achieve.pacifist = { "u-standard": 4 };
assert.equal(snapshot(cultPrecedence).activeGuards.guardPacifist, false);
assert.equal(
  snapshot(cultPrecedence).activeGuards.guardCultOfPersonality,
  true,
);

const malformedAchievement = makeContext();
malformedAchievement.game.global.stats.achieve.pacifist = {
  "u-standard": Number.NaN,
};
hooks.setRunGuardTestContext(malformedAchievement);
assert.equal(hooks.runGuards.getAchievementStar("pacifist"), 0);
assert.equal(hooks.runGuards.isAchievementUnlocked("pacifist", 1), false);
assert.equal(
  hooks.runGuards.guardActive("guardPacifist"),
  true,
  "malformed achievement data must not release an armed safety guard",
);
assert.equal(
  hooks.runGuards.guardActive("guardCultOfPersonality"),
  false,
  "Pacifist precedence must remain fail-closed on malformed data",
);

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

const smoothieThreshold = makeContext();
smoothieThreshold.game.global.resource = {
  Food: { trade: -500 },
  Lumber: { trade: 499 },
  Money: {},
};
hooks.setRunGuardTestContext(smoothieThreshold);
assert.equal(hooks.runGuards.bananaRepublicSmoothieComplete(), false);
smoothieThreshold.game.global.resource.Lumber.trade = 500;
assert.equal(hooks.runGuards.bananaRepublicSmoothieComplete(), true);
smoothieThreshold.game.global.resource.Food.trade = -499;
assert.equal(hooks.runGuards.bananaRepublicSmoothieComplete(), false);

const malformedBanana = makeContext();
malformedBanana.game.global.stats.banana.b1 = { "u-standard": "yes" };
hooks.setRunGuardTestContext(malformedBanana);
assert.equal(hooks.runGuards.bananaRepublicObjectiveComplete("b1"), false);
assert.equal(hooks.runGuards.bananaRepublicReadyForUnification(), false);
assert.equal(
  hooks.runGuards.guardBananaRepublicActive(),
  true,
  "malformed objective state must not release the Banana Republic guard",
);
malformedBanana.game.global.stats.banana.b1 = { "u-standard": true };
malformedBanana.game.global.resource.Food.trade = Number.NaN;
assert.equal(hooks.runGuards.bananaRepublicSmoothieComplete(), false);
assert.equal(hooks.runGuards.guardBananaRepublicActive(), true);

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
