import assert from "node:assert/strict";

import {
  evaluateCapturedCondition,
  readCapturedOperand,
} from "../src/adapters/evolve/captured-conditions.ts";

const root = {
  race: {
    species: "human",
    universe: "standard",
    kindling_kindred: 2,
    orbit_decay: 300,
    truepath: 1,
    servants: { jobs: { farmer: 1 }, sjobs: { Plywood: 1 } },
    governor: { g: { bg: "soldier" } },
  },
  city: {
    biome: "forest",
    ptrait: ["trashed"],
    calendar: { year: 12, day: 40 },
    farm: { count: 7 },
    foundry: { Plywood: 2 },
  },
  space: {
    moon_base: { count: 1, on: 1 },
    shipyard: { ships: [{}, {}] },
  },
  civic: {
    govern: { type: "federation" },
    farmer: { workers: 3, max: 5, display: true },
    miner: { workers: 2, max: 4, display: false },
    craftsman: { workers: 0, max: 6, display: true },
  },
  portal: { carport: { damaged: 1 } },
  arpa: { launch_facility: { rank: 1, complete: 42 } },
  resource: {
    Money: { amount: 250, max: 1000, display: true },
    Plywood: { amount: 10, max: 100, display: true },
    Soul_Gem: { amount: 0, max: -1, display: false },
  },
  stats: { days: 900 },
  queue: { queue: [{ id: "city-farm" }, { id: "city-mine" }] },
  r_queue: { queue: [] },
};

// Numeric operands read one captured root field each.
assert.equal(readCapturedOperand(root, "BuildingCount", "city-farm"), 7);
assert.equal(readCapturedOperand(root, "BuildingCount", "space-moon_base"), 1);
assert.equal(
  readCapturedOperand(root, "ProjectCount", "arpalaunch_facility"),
  1,
);
assert.equal(
  readCapturedOperand(root, "ProjectProgress", "arpalaunch_facility"),
  42,
);
assert.equal(readCapturedOperand(root, "ResourceQuantity", "Money"), 250);
assert.equal(readCapturedOperand(root, "ResourceStorage", "Money"), 1000);
assert.equal(readCapturedOperand(root, "ResourceRatio", "Money"), 0.25);
// An unstorable resource reports a full ratio rather than dividing by a negative maximum.
assert.equal(readCapturedOperand(root, "ResourceRatio", "Soul_Gem"), 1);
assert.equal(readCapturedOperand(root, "TraitLevel", "kindling_kindred"), 2);
// A trait the race does not have is absent from the bag, which reads as level 0.
assert.equal(readCapturedOperand(root, "TraitLevel", "hivemind"), 0);
assert.equal(readCapturedOperand(root, "Date", "total"), 900);
assert.equal(readCapturedOperand(root, "Date", "year"), 12);
assert.equal(readCapturedOperand(root, "Date", "impact"), -600);
assert.equal(readCapturedOperand(root, "Queue", "queue"), 2);
assert.equal(readCapturedOperand(root, "Queue", "r_queue"), 0);

// Job operands read the civic entry, or the foundry table for a crafting job.
assert.equal(readCapturedOperand(root, "JobWorkers", "farmer"), 3);
assert.equal(readCapturedOperand(root, "JobWorkers", "miner"), 2);
assert.equal(readCapturedOperand(root, "JobWorkers", "Plywood"), 2);
assert.equal(readCapturedOperand(root, "JobWorkers", "nothing"), undefined);
// Unbounded basic jobs report the script's own maximum, not the civic slot count.
assert.equal(
  readCapturedOperand(root, "JobMax", "farmer"),
  Number.MAX_SAFE_INTEGER,
);
assert.equal(readCapturedOperand(root, "JobMax", "miner"), 4);
// Crafting jobs share the one cap on the craftsman entry.
assert.equal(readCapturedOperand(root, "JobMax", "Plywood"), 6);
assert.equal(readCapturedOperand(root, "JobMax", "nothing"), undefined);
// The count adds servants: the servant table, or the skilled table for crafting.
assert.equal(readCapturedOperand(root, "JobCount", "farmer"), 4);
assert.equal(readCapturedOperand(root, "JobCount", "miner"), 2);
assert.equal(readCapturedOperand(root, "JobCount", "Plywood"), 3);
assert.equal(readCapturedOperand(root, "JobCount", "nothing"), undefined);
assert.equal(readCapturedOperand(root, "JobServants", "farmer"), 1);
assert.equal(readCapturedOperand(root, "JobServants", "Plywood"), 1);
assert.equal(readCapturedOperand(root, "JobServants", "miner"), 0);
assert.equal(readCapturedOperand(root, "JobServants", "nothing"), undefined);

// Servant output scales with the rank of high_pop, which the root does not carry: a high_pop
// run with servants assigned is unanswerable, while one without servants stays exact.
{
  const highPop = {
    ...root,
    race: { ...root.race, high_pop: 1 },
  };
  assert.equal(readCapturedOperand(highPop, "JobCount", "farmer"), undefined);
  assert.equal(readCapturedOperand(highPop, "JobCount", "miner"), 2);
  assert.equal(readCapturedOperand(highPop, "JobServants", "farmer"), 1);
}

// The True Path fleet, Mass Relay, and carport fields.
assert.equal(readCapturedOperand(root, "Other", "tpfleet"), 2);
assert.equal(readCapturedOperand(root, "Other", "bcar"), 1);
assert.ok(Number.isNaN(readCapturedOperand(root, "Other", "mrelay")));
assert.equal(
  readCapturedOperand(
    { ...root, space: { ...root.space, m_relay: { charged: 5000 } } },
    "Other",
    "mrelay",
  ),
  0.5,
);
assert.equal(readCapturedOperand({ ...root, portal: {} }, "Other", "bcar"), 0);
assert.equal(
  readCapturedOperand({ ...root, space: {} }, "Other", "tpfleet"),
  0,
);

// Orbit Decay is the only scenario that creates `race.orbit_decay`.
assert.equal(
  readCapturedOperand(
    { ...root, race: { species: "human" } },
    "Date",
    "impact",
  ),
  -1,
);

// Boolean operands.
assert.equal(readCapturedOperand(root, "Boolean", true), true);
assert.equal(readCapturedOperand(root, "ResourceUnlocked", "Money"), true);
assert.equal(readCapturedOperand(root, "ResourceUnlocked", "Soul_Gem"), false);
assert.equal(readCapturedOperand(root, "JobUnlocked", "farmer"), true);
assert.equal(readCapturedOperand(root, "JobUnlocked", "miner"), false);
// A crafting job unlocks with its resource rather than a civic entry.
assert.equal(readCapturedOperand(root, "JobUnlocked", "Plywood"), true);
assert.equal(readCapturedOperand(root, "JobUnlocked", "nothing"), undefined);
assert.equal(readCapturedOperand(root, "Challenge", "truepath"), true);
assert.equal(readCapturedOperand(root, "Challenge", "junker"), false);
assert.equal(readCapturedOperand(root, "Universe", "standard"), true);
assert.equal(readCapturedOperand(root, "Universe", "evil"), false);
assert.equal(readCapturedOperand(root, "Government", "federation"), true);
assert.equal(readCapturedOperand(root, "Governor", "soldier"), true);
assert.equal(readCapturedOperand(root, "Governor", "mayor"), false);
// Without an appointed governor the reader reports "none", like the script's own reader.
assert.equal(
  readCapturedOperand(
    { ...root, race: { ...root.race, governor: undefined } },
    "Governor",
    "none",
  ),
  true,
);
assert.equal(readCapturedOperand(root, "MimicGenus", "none"), true);
assert.equal(readCapturedOperand(root, "PlanetBiome", "forest"), true);
assert.equal(readCapturedOperand(root, "PlanetTrait", "trashed"), true);
assert.equal(readCapturedOperand(root, "PlanetTrait", "unstable"), false);

// --- the research operands, answered from the drawn panel ------------------

// The research panel draws each technology on the current path in one of two halves. Both come in
// through the condition context, because the game's own grant keys are private to its catalog.
const research = {
  offeredTechs: new Set(["tech-smelting", "tech-theology"]),
  grantedTechs: new Set(["tech-mad", "tech-mining"]),
};
assert.equal(
  readCapturedOperand(root, "ResearchComplete", "tech-mad", research),
  true,
);
assert.equal(
  readCapturedOperand(root, "ResearchComplete", "tech-smelting", research),
  false,
);
assert.equal(
  readCapturedOperand(root, "ResearchUnlocked", "tech-smelting", research),
  true,
);
assert.equal(
  readCapturedOperand(root, "ResearchUnlocked", "tech-mad", research),
  false,
);
// A technology in neither half — off the current tech path — is drawn nowhere, which the
// compatibility runtime's DOM read also reported as neither offered nor researched.
assert.equal(
  readCapturedOperand(root, "ResearchUnlocked", "tech-elsewhere", research),
  false,
);
assert.equal(
  readCapturedOperand(root, "ResearchComplete", "tech-elsewhere", research),
  false,
);
// A pass that was not taken leaves its operand unanswered, never false.
assert.equal(
  readCapturedOperand(root, "ResearchComplete", "tech-mad", {
    offeredTechs: research.offeredTechs,
  }),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "ResearchUnlocked", "tech-smelting", {
    grantedTechs: research.grantedTechs,
  }),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "ResearchComplete", "tech-mad"),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "ResearchUnlocked", "tech-mad"),
  undefined,
);
// Both are boolean operands: the stored count is matched, not exceeded.
assert.equal(
  evaluateCapturedCondition(root, "ResearchComplete", "tech-mad", 1, research),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "ResearchComplete", "tech-mad", 0, research),
  false,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ResearchComplete",
    "tech-smelting",
    0,
    research,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "ResearchComplete", "tech-mad", 1),
  undefined,
);

// Nothing the capture does not hold is guessed at.
assert.equal(readCapturedOperand(root, "Eval", "1 + 1"), undefined);
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "autoBuild"),
  undefined,
);
assert.equal(readCapturedOperand(root, "Other", "alevel"), undefined);
assert.equal(readCapturedOperand(root, "Other", "rname"), undefined);
assert.equal(readCapturedOperand(root, "Queue", "evo"), undefined);
// Manager-computed and script-computed operands stay unanswered.
assert.equal(readCapturedOperand(root, "Soldiers", "workers"), undefined);
assert.equal(readCapturedOperand(root, "Industry", "smelters"), undefined);
assert.equal(readCapturedOperand(root, "ResourceIncome", "Money"), undefined);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfied", "Money"),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingCount", "city-nothing"),
  undefined,
);
assert.equal(readCapturedOperand(root, "BuildingCount", "farm"), undefined);
assert.equal(readCapturedOperand(root, "ResourceQuantity", "Power"), undefined);
assert.equal(
  readCapturedOperand(undefined, "BuildingCount", "city-farm"),
  undefined,
);
assert.equal(readCapturedOperand(root, 7, "city-farm"), undefined);

// Numeric conditions compare with `>=`, boolean ones for equality.
assert.equal(
  evaluateCapturedCondition(root, "BuildingCount", "city-farm", 7),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "BuildingCount", "city-farm", 8),
  false,
);
assert.equal(evaluateCapturedCondition(root, "Challenge", "truepath", 1), true);
assert.equal(
  evaluateCapturedCondition(root, "Challenge", "truepath", 0),
  false,
);
assert.equal(evaluateCapturedCondition(root, "Challenge", "junker", 0), true);
assert.equal(evaluateCapturedCondition(root, "Challenge", "junker", 2), false);
assert.equal(evaluateCapturedCondition(root, "JobCount", "farmer", 4), true);
assert.equal(evaluateCapturedCondition(root, "JobCount", "farmer", 5), false);
assert.equal(evaluateCapturedCondition(root, "Governor", "soldier", 1), true);
assert.equal(evaluateCapturedCondition(root, "Governor", "mayor", 1), false);
assert.equal(evaluateCapturedCondition(root, "JobUnlocked", "miner", 0), true);
assert.equal(
  evaluateCapturedCondition(root, "BuildingCount", "city-farm", "nope"),
  undefined,
);

console.log("Captured condition operand tests passed");
