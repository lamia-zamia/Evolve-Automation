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
  },
  city: {
    biome: "forest",
    ptrait: ["trashed"],
    calendar: { year: 12, day: 40 },
    farm: { count: 7 },
  },
  space: { moon_base: { count: 1, on: 1 } },
  civic: { govern: { type: "federation" } },
  arpa: { launch_facility: { rank: 1, complete: 42 } },
  resource: {
    Money: { amount: 250, max: 1000, display: true },
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
assert.equal(readCapturedOperand(root, "Challenge", "truepath"), true);
assert.equal(readCapturedOperand(root, "Challenge", "junker"), false);
assert.equal(readCapturedOperand(root, "Universe", "standard"), true);
assert.equal(readCapturedOperand(root, "Universe", "evil"), false);
assert.equal(readCapturedOperand(root, "Government", "federation"), true);
assert.equal(readCapturedOperand(root, "MimicGenus", "none"), true);
assert.equal(readCapturedOperand(root, "PlanetBiome", "forest"), true);
assert.equal(readCapturedOperand(root, "PlanetTrait", "trashed"), true);
assert.equal(readCapturedOperand(root, "PlanetTrait", "unstable"), false);

// Nothing the captured root does not hold is guessed at.
assert.equal(
  readCapturedOperand(root, "ResearchComplete", "tech-mad"),
  undefined,
);
assert.equal(readCapturedOperand(root, "Eval", "1 + 1"), undefined);
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "autoBuild"),
  undefined,
);
assert.equal(readCapturedOperand(root, "Other", "alevel"), undefined);
assert.equal(readCapturedOperand(root, "Queue", "evo"), undefined);
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
assert.equal(
  evaluateCapturedCondition(root, "ResearchComplete", "tech-mad", 1),
  undefined,
);
assert.equal(
  evaluateCapturedCondition(root, "BuildingCount", "city-farm", "nope"),
  undefined,
);

console.log("Captured condition operand tests passed");
