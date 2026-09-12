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
  // Race ids mapped to the ascension level each was pillared at.
  pillars: { human: 2, elven: 1 },
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

// --- the ascension level and pillar ranks ----------------------------------

// The game's own `alevel()` is one plus the challenges taken, capped at five; the script's operand
// reports the challenge count, so one less again. The fixture race took none.
assert.equal(readCapturedOperand(root, "Other", "alevel"), 0);
{
  const challenged = {
    ...root,
    race: { ...root.race, no_plasmid: 1, no_trade: 1, badgenes: 1 },
  };
  assert.equal(readCapturedOperand(challenged, "Other", "alevel"), 3);
  // Five is the ceiling, so a sixth challenge adds nothing.
  const everything = {
    ...root,
    race: {
      ...root.race,
      no_plasmid: 1,
      no_trade: 1,
      no_craft: 1,
      no_crispr: 1,
      weak_mastery: 1,
      nerfed: 1,
      badgenes: 1,
    },
  };
  assert.equal(readCapturedOperand(everything, "Other", "alevel"), 4);
  // A pillar earned below the current ascension level no longer counts. At the fixture's level of
  // one both ranks are enough; one challenge in, only the rank-two pillar still is.
  assert.equal(readCapturedOperand(root, "RacePillared", "human"), true);
  assert.equal(readCapturedOperand(root, "RacePillared", "species"), true);
  assert.equal(readCapturedOperand(root, "RacePillared", "elven"), true);
  const ascended = { ...root, race: { ...root.race, no_plasmid: 1 } };
  assert.equal(readCapturedOperand(ascended, "RacePillared", "human"), true);
  assert.equal(readCapturedOperand(ascended, "RacePillared", "elven"), false);
  assert.equal(readCapturedOperand(challenged, "RacePillared", "human"), false);
}
// A race the bag has never recorded is not pillared, which is a real answer.
assert.equal(readCapturedOperand(root, "RacePillared", "sharkin"), false);
// The three ids the race bag carries itself, and the Sludge host species.
assert.equal(readCapturedOperand(root, "RacePillared", "gods"), false);
assert.equal(
  readCapturedOperand(
    { ...root, race: { ...root.race, gods: "elven" }, pillars: { elven: 5 } },
    "RacePillared",
    "gods",
  ),
  true,
);
assert.equal(
  readCapturedOperand(
    { ...root, pillars: { protoplasm: 4 } },
    "RacePillared",
    "srace",
  ),
  true,
);
assert.equal(
  readCapturedOperand(
    { ...root, race: { ...root.race, srace: "human" } },
    "RacePillared",
    "srace",
  ),
  true,
);
// It is a boolean operand: the stored count is matched, not exceeded.
assert.equal(evaluateCapturedCondition(root, "RacePillared", "human", 1), true);
assert.equal(
  evaluateCapturedCondition(root, "RacePillared", "human", 0),
  false,
);
assert.equal(
  evaluateCapturedCondition(root, "RacePillared", "sharkin", 0),
  true,
);
// Without the bags neither operand is decidable.
assert.equal(readCapturedOperand({}, "RacePillared", "human"), undefined);
assert.equal(
  readCapturedOperand({ race: {} }, "RacePillared", "human"),
  undefined,
);
assert.equal(readCapturedOperand({}, "Other", "alevel"), undefined);

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

// --- the project unlock operand, answered from the drawn A.R.P.A. panel ---

// The panel draws exactly the projects the game offers, so membership is the whole answer.
const arpaPanel = {
  unlockedProjects: new Set(["arpalaunch_facility", "arpamonument"]),
};
assert.equal(
  readCapturedOperand(
    root,
    "ProjectUnlocked",
    "arpalaunch_facility",
    arpaPanel,
  ),
  true,
);
// A project the panel did not draw is locked, off the current tech path, or finished at its rank
// cap. The compatibility runtime's Vue-binding read reported every one of those as not unlocked.
assert.equal(
  readCapturedOperand(root, "ProjectUnlocked", "arpalhc", arpaPanel),
  false,
);
// A drawn panel holding no projects at all is a real "nothing unlocked".
assert.equal(
  readCapturedOperand(root, "ProjectUnlocked", "arpalhc", {
    unlockedProjects: new Set(),
  }),
  false,
);
// A pass that was not taken leaves the operand unanswered, never false.
assert.equal(
  readCapturedOperand(root, "ProjectUnlocked", "arpalaunch_facility"),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "ProjectUnlocked", "arpalaunch_facility", {
    grantedTechs: research.grantedTechs,
  }),
  undefined,
);
// It is a boolean operand: the stored count is matched, not exceeded.
assert.equal(
  evaluateCapturedCondition(
    root,
    "ProjectUnlocked",
    "arpalaunch_facility",
    1,
    arpaPanel,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ProjectUnlocked",
    "arpalaunch_facility",
    0,
    arpaPanel,
  ),
  false,
);
assert.equal(
  evaluateCapturedCondition(root, "ProjectUnlocked", "arpalhc", 0, arpaPanel),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "ProjectUnlocked", "arpalhc", 0),
  undefined,
);

// --- the building unlock operand, answered from the drawn region panels ---

// Each region is sampled separately, so the sample says which regions it can speak for.
const cityAndSpace = {
  buildingUnlocks: {
    unlocked: new Set(["city-farm", "city-mine", "space-titan_spaceport"]),
    regions: new Set(["city", "space"]),
  },
};
assert.equal(
  readCapturedOperand(root, "BuildingUnlocked", "city-farm", cityAndSpace),
  true,
);
// A building the panel did not draw is not offered, and a built-out one stays drawn, so a missing
// id never means "already finished".
assert.equal(
  readCapturedOperand(root, "BuildingUnlocked", "city-bank", cityAndSpace),
  false,
);
// Outer-Sol rows carry the same `space-` prefix as inner ones, so one region covers both panels.
assert.equal(
  readCapturedOperand(
    root,
    "BuildingUnlocked",
    "space-titan_spaceport",
    cityAndSpace,
  ),
  true,
);
// A region the sample did not draw is unanswered, never false.
assert.equal(
  readCapturedOperand(root, "BuildingUnlocked", "portal-carport", cityAndSpace),
  undefined,
);
// So is an argument that names no region at all, and an absent sample.
assert.equal(
  readCapturedOperand(root, "BuildingUnlocked", "farm", cityAndSpace),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingUnlocked", "city-farm"),
  undefined,
);
// It is a boolean operand: the stored count is matched, not exceeded.
assert.equal(
  evaluateCapturedCondition(
    root,
    "BuildingUnlocked",
    "city-farm",
    1,
    cityAndSpace,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "BuildingUnlocked",
    "city-bank",
    0,
    cityAndSpace,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "BuildingUnlocked",
    "portal-carport",
    0,
    cityAndSpace,
  ),
  undefined,
);

// Nothing the capture does not hold is guessed at.
assert.equal(readCapturedOperand(root, "Eval", "1 + 1"), undefined);
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "autoBuild"),
  undefined,
);
// `rname` needs the module-level race catalog, which nothing captures.
assert.equal(readCapturedOperand(root, "Other", "rname"), undefined);
assert.equal(readCapturedOperand(root, "RaceGenus", "humanoid"), undefined);
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
