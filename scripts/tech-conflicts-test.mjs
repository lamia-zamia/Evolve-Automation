import assert from "node:assert/strict";

import { createTechConflicts } from "../src/policies/tech-conflicts.ts";

let settings;
let resources;
let state;
let game;
let isAchievementUnlocked = () => false;
let guardResults = {};
let bananaActive = false;
let retirementActive = false;
let retirementMissing = [];

function baseSettings(overrides = {}) {
  return {
    researchIgnore: [],
    prestigeType: "mad",
    prestigeWhiteholeSaveGems: false,
    prestigeVaxStrat: "strat1",
    prestigeDemonicBomb: false,
    foreignUnification: false,
    prestigeWhiteholeStabiliseMass: false,
    prestigeWhiteholeStabiliseCooldown: 0,
    userResearchTheology_1: "auto",
    userResearchTheology_2: "auto",
    fleetAlienGiftKnowledge: 1_000_000,
    ...overrides,
  };
}

settings = baseSettings();
resources = {
  Soul_Gem: { name: "Soul Gem", currentQuantity: 100 },
  Knowledge: { name: "Knowledge", currentQuantity: 500, maxQuantity: 500 },
};
state = { whiteholeLastStabilise: 0 };
game = {
  global: { race: { species: "human", gods: "none" } },
  alevel: () => 1,
};

const conflicts = createTechConflicts({
  getSettings: () => settings,
  getResources: () => resources,
  getState: () => state,
  getGame: () => game,
  getIsAchievementUnlocked: () => isAchievementUnlocked,
  getNumberString: (value) => `#${value}`,
  guardActive: (name) => Boolean(guardResults[name]),
  guardBananaRepublicActive: () => bananaActive,
  retirementChallengeAssistActive: () => retirementActive,
  retirementPreparationMissing: () => retirementMissing,
  fanatAchievements: [{ race: "human", god: "sharkin", achieve: "genocide" }],
});

const tech = (binding, cost = {}) => ({ _vueBinding: binding, cost });

// Live getter resolution: replacing the whole settings object is observed.
settings = baseSettings({ researchIgnore: ["tech-blah"] });
assert.equal(conflicts.getTechConflict(tech("tech-blah")), "Ignored research");
assert.equal(conflicts.getTechConflict(tech("tech-other")), false);

// Injected number formatter is used verbatim for the Alien Gift message
// (Knowledge maxQuantity 500 is below the required 900).
settings = baseSettings({ fleetAlienGiftKnowledge: 900 });
assert.equal(
  conflicts.getTechConflict(tech("tech-xeno_gift")),
  "#900 Max Knowledge required",
);

// Banana Republic guard delegation (bundled test kept guards inert).
settings = baseSettings();
bananaActive = true;
assert.equal(
  conflicts.getTechConflict(tech("tech-unification2")),
  "Banana Republic guard",
);
bananaActive = false;
guardResults = { guardCultOfPersonality: true };
assert.equal(
  conflicts.getTechConflict(tech("tech-unite")),
  "Cult of Personality achievement guard",
);
guardResults = {};

// Second Evolution guard on Anthropology.
guardResults = { guardSecondEvolution: true };
assert.equal(
  conflicts.getTechConflict(tech("tech-anthropology")),
  "Second Evolution achievement guard",
);
guardResults = {};

// Retirement preparation incomplete delegates to the injected guard results.
settings = baseSettings({ prestigeType: "retire" });
retirementActive = true;
retirementMissing = ["Tau Fusion Generator 0/20"];
assert.equal(
  conflicts.getTechConflict(tech("tech-isolation_protocol")),
  "Retirement preparation incomplete: Tau Fusion Generator 0/20",
);
retirementMissing = [];
assert.equal(conflicts.getTechConflict(tech("tech-isolation_protocol")), false);
retirementActive = false;

// isFanatRace uses live game + injected achievement lookup: matching combo blocks
// Anthropology when the achievement is not yet unlocked.
settings = baseSettings();
game = {
  global: { race: { species: "human", gods: "sharkin" } },
  alevel: () => 1,
};
isAchievementUnlocked = () => false; // combo unmet -> isFanatRace true
assert.equal(
  conflicts.getTechConflict(tech("tech-anthropology")),
  "Undesirable theology path",
);
isAchievementUnlocked = () => true; // achievement unlocked -> not a fanat race
assert.equal(conflicts.getTechConflict(tech("tech-anthropology")), false);

console.log("Tech conflict module tests passed");
