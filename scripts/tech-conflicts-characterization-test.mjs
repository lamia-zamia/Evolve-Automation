import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
function jquery() {
  return { ready() {} };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;
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
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.getTechConflict, "function");
assert.equal(typeof hooks.setTechConflictTestContext, "function");

// Guards are inert here (achievementGuards false, no banana/truepath race), so the
// pure prestige-fork / research policy branches are exercised deterministically.
function baseContext(overrides = {}) {
  return {
    settings: {
      researchIgnore: ["tech-ignored_example"],
      prestigeType: "mad",
      prestigeWhiteholeSaveGems: false,
      prestigeVaxStrat: "strat1",
      prestigeDemonicBomb: false,
      foreignUnification: false,
      prestigeWhiteholeStabiliseMass: false,
      prestigeWhiteholeStabiliseCooldown: 0,
      whiteholeLastStabilise: 0,
      userResearchTheology_1: "auto",
      userResearchTheology_2: "auto",
      fleetAlienGiftKnowledge: 1_000_000,
      achievementGuards: false,
      retirementChallengeAssist: false,
      inflationChallengeAssist: false,
      ...(overrides.settings || {}),
    },
    game: {
      global: {
        race: { species: "human", gods: "none" },
        tech: {},
        stats: {},
      },
      alevel: () => 1,
      ...(overrides.game || {}),
    },
    state: { whiteholeLastStabilise: 0, ...(overrides.state || {}) },
    resources: {
      Soul_Gem: { name: "Soul Gem", currentQuantity: 100 },
      Knowledge: { name: "Knowledge", currentQuantity: 500, maxQuantity: 500 },
      Money: { maxQuantity: 0, currentQuantity: 0, rateOfChange: 0 },
      ...(overrides.resources || {}),
    },
    buildings: overrides.buildings || {},
    isAchievementUnlocked: overrides.isAchievementUnlocked || (() => false),
    clock: overrides.clock,
  };
}

function conflictFor(binding, cost, overrides) {
  hooks.setTechConflictTestContext(baseContext(overrides));
  return hooks.getTechConflict({ _vueBinding: binding, cost: cost || {} });
}

// Ignored research
assert.equal(conflictFor("tech-ignored_example"), "Ignored research");

// Reset-option techs are never auto-clicked
assert.equal(conflictFor("tech-exotic_infusion"), "Reset research");
assert.equal(conflictFor("tech-demonic_infusion"), "Reset research");
assert.equal(conflictFor("tech-final_ingredient"), "Reset research");

// Soul Gem saving during whitehole
assert.equal(
  conflictFor(
    "tech-some_soul_tech",
    { Soul_Gem: 95 },
    {
      settings: { prestigeType: "whitehole", prestigeWhiteholeSaveGems: true },
    },
  ),
  "Saving up Soul Gems for prestige",
);

// Progression forks blocked when the chosen prestige differs
assert.equal(
  conflictFor("tech-isolation_protocol"),
  "Progression fork to Retirement reset",
);
assert.equal(
  conflictFor("tech-outerplane_summon"),
  "Progression fork to Witch Hunter's Demonic Infusion",
);
assert.equal(
  conflictFor("tech-focus_cure"),
  "Progression fork to Matrix reset",
);
assert.equal(
  conflictFor("tech-purify_essence"),
  "Progression fork to Apotheosis",
);

// Vaccination strategy: mismatched strat blocked, matching strat allowed through
assert.equal(
  conflictFor("tech-vax_strat2"),
  "Undesirable Vaccination Strategy",
);
assert.equal(conflictFor("tech-vax_strat1"), false);

// Dark Bomb disabled unless demonic + enabled
assert.equal(conflictFor("tech-dark_bomb"), "Dark Bomb disabled");

// Ascension-only techs are skipped on non-ascension prestige
assert.equal(
  conflictFor("tech-incorporeal"),
  "Not needed for current prestige",
);

// Alien Gift requires enough Max Knowledge
const xeno = conflictFor("tech-xeno_gift");
assert.ok(
  typeof xeno === "string" && xeno.endsWith(" Max Knowledge required"),
  `unexpected xeno gift conflict: ${xeno}`,
);
assert.ok(xeno.length > " Max Knowledge required".length);
assert.equal(
  conflictFor(
    "tech-xeno_gift",
    {},
    {
      resources: {
        Knowledge: {
          name: "Knowledge",
          currentQuantity: 500,
          maxQuantity: 2_000_000,
        },
      },
    },
  ),
  false,
);

// Unification disabled when the setting is off and guards are inactive
assert.equal(conflictFor("tech-unification2"), "Unification disabled");
assert.equal(conflictFor("tech-unite"), "Unification disabled");
assert.equal(
  conflictFor(
    "tech-unification2",
    {},
    { settings: { foreignUnification: true } },
  ),
  false,
);

// Blackhole stabilization disabled by default
assert.equal(
  conflictFor("tech-stabilize_blackhole"),
  "Blackhole stabilization disabled",
);
assert.equal(
  conflictFor(
    "tech-stabilize_blackhole",
    {},
    {
      settings: {
        prestigeWhiteholeStabiliseMass: true,
        prestigeType: "whitehole",
      },
    },
  ),
  "Disabled during whitehole reset",
);
// Stabilization cooldown
const cooldown = conflictFor(
  "tech-stabilize_blackhole",
  {},
  {
    settings: {
      prestigeWhiteholeStabiliseMass: true,
      prestigeWhiteholeStabiliseCooldown: 3600,
    },
    state: { whiteholeLastStabilise: 1_000_000 },
    clock: { nowMs: () => 1_001_000 },
  },
);
assert.equal(cooldown, "On cooldown for 3599 more seconds");

// A malformed explicit Soul Gem cost currently falls through as no conflict.
assert.equal(
  conflictFor(
    "tech-malformed_soul_cost",
    { Soul_Gem: NaN },
    {
      settings: { prestigeType: "whitehole", prestigeWhiteholeSaveGems: true },
    },
  ),
  "Research data unavailable",
);

// Theology: auto + mad + non-fanatic race allows Anthropology, blocks Fanaticism
assert.equal(conflictFor("tech-anthropology"), false);
assert.equal(conflictFor("tech-fanaticism"), "Undesirable theology path");

// Second theology tier: mad is a short run, so Study allowed, Deify blocked
assert.equal(conflictFor("tech-study"), false);
assert.equal(conflictFor("tech-deify"), "Undesirable theology path");

// A plain unrelated tech has no conflict
assert.equal(conflictFor("tech-mining"), false);

console.log("Tech conflict bundled characterization tests passed");
