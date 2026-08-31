import assert from "node:assert/strict";

import { formatTechConflict } from "../src/application/tech-conflicts.ts";
import { findTechConflict } from "../src/domain/progression/research/tech-conflicts.ts";

function makeInput(overrides = {}) {
  const base = {
    itemId: "tech-mining",
    soulGemCost: null,
    settings: {
      ignoredResearch: [],
      prestigeType: "mad",
      saveWhiteholeSoulGems: false,
      vaccinationStrategy: "strat1",
      useDemonicBomb: false,
      allowForeignUnification: false,
      stabilizeBlackhole: false,
      stabilizationCooldownSeconds: 0,
      theologyChoiceOne: "auto",
      theologyChoiceTwo: "auto",
      alienGiftKnowledge: 1_000_000,
    },
    resources: { soulGems: 100, maximumKnowledge: 500 },
    stabilization: {
      lastAtMs: null,
      nowMs: 1_000_000,
      whiteholeResetInterrupted: false,
    },
    race: { species: "human", gods: "none", achievementLevel: 1 },
    guards: {
      bananaRepublic: false,
      cultOfPersonality: false,
      pacifist: false,
      secondEvolution: false,
      retirementAssist: false,
      retirementMissing: [],
    },
    fanaticismAchievements: [],
  };
  return Object.freeze({
    ...base,
    ...overrides,
    settings: Object.freeze({ ...base.settings, ...overrides.settings }),
    resources: Object.freeze({ ...base.resources, ...overrides.resources }),
    stabilization: Object.freeze({
      ...base.stabilization,
      ...overrides.stabilization,
    }),
    race: Object.freeze({ ...base.race, ...overrides.race }),
    guards: Object.freeze({ ...base.guards, ...overrides.guards }),
    fanaticismAchievements: Object.freeze(
      overrides.fanaticismAchievements ?? base.fanaticismAchievements,
    ),
  });
}

function code(itemId, overrides = {}) {
  return findTechConflict(makeInput({ itemId, ...overrides }))?.code ?? null;
}

assert.equal(code("tech-mining"), null);
assert.equal(
  code("tech-ignored", { settings: { ignoredResearch: ["tech-ignored"] } }),
  "ignored-research",
);
assert.equal(code("tech-demonic_infusion"), "reset-research");
assert.equal(
  code("tech-soul", {
    soulGemCost: 95,
    settings: { prestigeType: "whitehole", saveWhiteholeSoulGems: true },
  }),
  "saving-soul-gems",
);
assert.equal(code("tech-isolation_protocol"), "retirement-fork");
assert.deepEqual(
  findTechConflict(
    makeInput({
      itemId: "tech-isolation_protocol",
      settings: { prestigeType: "retire" },
      guards: {
        retirementAssist: true,
        retirementMissing: ["Tau Factory 0/10"],
      },
    }),
  ),
  {
    code: "retirement-preparation",
    missing: ["Tau Factory 0/10"],
  },
);
assert.equal(code("tech-outerplane_summon"), "witch-demonic-fork");
assert.equal(code("tech-focus_cure"), "matrix-fork");
assert.equal(code("tech-purify_essence"), "apotheosis-fork");
assert.equal(code("tech-vax_strat2"), "vaccination-strategy");
assert.equal(code("tech-vax_strat1"), null);
assert.equal(code("tech-dark_bomb"), "dark-bomb-disabled");
assert.equal(code("tech-incorporeal"), "prestige-unneeded");
assert.deepEqual(findTechConflict(makeInput({ itemId: "tech-xeno_gift" })), {
  code: "maximum-knowledge",
  required: 1_000_000,
});

assert.equal(
  code("tech-unification2", { guards: { bananaRepublic: true } }),
  "banana-republic-guard",
);
assert.equal(
  code("tech-unite", { guards: { cultOfPersonality: true } }),
  "cult-of-personality-guard",
);
assert.equal(code("tech-unification2"), "unification-disabled");
assert.equal(code("tech-unification2", { guards: { pacifist: true } }), null);

assert.equal(code("tech-stabilize_blackhole"), "stabilization-disabled");
// An interrupted whitehole reset leaves stabilizing as the only control that
// can still restart the infusion chain, so it overrides every stabilization
// setting rather than leaving the run unable to prestige at all.
assert.equal(
  code("tech-stabilize_blackhole", {
    settings: {
      stabilizeBlackhole: false,
      prestigeType: "whitehole",
      stabilizationCooldownSeconds: 3600,
    },
    stabilization: {
      lastAtMs: 1_000_000,
      nowMs: 1_001_000,
      whiteholeResetInterrupted: true,
    },
  }),
  null,
);
assert.equal(
  code("tech-stabilize_blackhole", {
    settings: { stabilizeBlackhole: true, prestigeType: "whitehole" },
  }),
  "stabilization-during-whitehole",
);
const cooldown = findTechConflict(
  makeInput({
    itemId: "tech-stabilize_blackhole",
    settings: {
      stabilizeBlackhole: true,
      stabilizationCooldownSeconds: 3600,
    },
    stabilization: { lastAtMs: 1_000_000, nowMs: 1_001_000 },
  }),
);
assert.deepEqual(cooldown, {
  code: "stabilization-cooldown",
  seconds: 3599,
});
assert.equal(
  findTechConflict(
    makeInput({
      itemId: "tech-stabilize_blackhole",
      settings: {
        stabilizeBlackhole: true,
        stabilizationCooldownSeconds: 3600,
      },
      stabilization: { lastAtMs: 1_000_000, nowMs: 4_600_000 },
    }),
  ),
  null,
  "cooldown releases exactly at the configured threshold",
);

assert.equal(
  code("tech-anthropology", { guards: { secondEvolution: true } }),
  "second-evolution-guard",
);
assert.equal(code("tech-fanaticism"), "theology-path");
assert.equal(code("tech-study"), null);
assert.equal(code("tech-deify"), "theology-path");
assert.equal(
  code("tech-anthropology", {
    race: { gods: "sharkin" },
    fanaticismAchievements: [
      { race: "human", god: "sharkin", unlocked: false },
    ],
  }),
  "theology-path",
);

assert.equal(
  formatTechConflict(
    { code: "maximum-knowledge", required: 900 },
    (value) => `#${value}`,
  ),
  "#900 Max Knowledge required",
);
assert.equal(
  formatTechConflict({ code: "stabilization-during-whitehole" }, String),
  "Disabled during whitehole reset",
);
assert.ok(Object.isFrozen(cooldown));

console.log("Tech conflict domain and formatting tests passed");
