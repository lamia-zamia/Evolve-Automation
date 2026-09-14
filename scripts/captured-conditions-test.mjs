import assert from "node:assert/strict";
import { actionPrice } from "./test-support/action-price.mjs";

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
    Money: { amount: 250, max: 1000, display: true, diff: 12 },
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
    // `city-mine` drew a power switch; the other two rows drew none.
    states: new Map([["city-mine", { on: 4, off: 1 }]]),
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

// --- the building switch operands, answered from the same drawn rows ---

// A row that drew the on/off pair reports both halves. The off count is the game's own
// `on_cap() - on`, so it is what the row rendered rather than a recomputed `count - on`.
assert.equal(
  readCapturedOperand(root, "BuildingEnabled", "city-mine", cityAndSpace),
  4,
);
assert.equal(
  readCapturedOperand(root, "BuildingDisabled", "city-mine", cityAndSpace),
  1,
);
// A drawn row with no switch has no power state, which the script's own reader reports as zero.
// The game answers this by not drawing the spans, so the sample's silence is the answer.
assert.equal(
  readCapturedOperand(root, "BuildingEnabled", "city-farm", cityAndSpace),
  0,
);
assert.equal(
  readCapturedOperand(root, "BuildingDisabled", "city-farm", cityAndSpace),
  0,
);
// A building the panel never offered is not a building with zero copies switched on: nothing was
// drawn to read, so it stays unanswered rather than reading as an idle building.
assert.equal(
  readCapturedOperand(root, "BuildingEnabled", "city-bank", cityAndSpace),
  undefined,
);
// So is a region nobody drew, an argument naming no region, and an absent sample.
assert.equal(
  readCapturedOperand(root, "BuildingDisabled", "portal-carport", cityAndSpace),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingEnabled", "mine", cityAndSpace),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingEnabled", "city-mine"),
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

// --- the building affordability operand, over the cycle's own prices ---

// The game's `isAffordable(true)`: the cost has to fit under storage capacity, not be on hand.
const priced = {
  buildingCosts: new Map([
    ["city-farm", actionPrice({ Money: 500 })],
    ["city-bank", actionPrice({ Money: 5000 })],
    ["city-shrine", actionPrice({ Money: 10, Soul_Gem: 1 })],
    ["city-temple", actionPrice({ Morale: 2 })],
  ]),
};
assert.equal(
  readCapturedOperand(root, "BuildingAffordable", "city-farm", priced),
  true,
);
assert.equal(
  readCapturedOperand(root, "BuildingAffordable", "city-bank", priced),
  false,
);
// It asks nothing about holdings: Money is 250 against a 500 cost and still affordable.
assert.equal(readCapturedOperand(root, "ResourceQuantity", "Money"), 250);
// A positive cost in a resource the game is not displaying is refused — Soul_Gem here.
assert.equal(
  readCapturedOperand(root, "BuildingAffordable", "city-shrine", priced),
  false,
);
// A cost the comparison cannot make stays unanswered rather than guessing.
assert.equal(
  readCapturedOperand(root, "BuildingAffordable", "city-temple", priced),
  undefined,
);
// A building the cycle did not price is unanswered, and so is every building without the pass.
assert.equal(
  readCapturedOperand(root, "BuildingAffordable", "city-mine", priced),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingAffordable", "city-farm"),
  undefined,
);
// --- once the game splits resources by supply zone ---

// Above `tech.shadow >= 5` the capacity compared against is the paying pool's share, which the same
// probe that priced the building reported. A resource whose `regMax` ledger has any entry in it is
// one the game has split (upstream's own `capsKnown`), and the named pool's share is the ceiling.
{
  const regional = {
    ...root,
    tech: { shadow: 5 },
    resource: {
      ...root.resource,
      Money: {
        ...root.resource.Money,
        max: 100000,
        regMax: { spc_home: 1000, spc_moon: 250 },
      },
    },
  };
  const pooled = {
    buildingCosts: new Map([
      ["city-farm", actionPrice({ Money: 500 }, "spc_home")],
      ["space-moon_base", actionPrice({ Money: 500 }, "spc_moon")],
      // No pool named: a civilization-wide cost, judged against the combined capacity.
      ["city-bank", actionPrice({ Money: 5000 })],
      // The game's ANYWHERE sentinel is the same civilization-wide question.
      ["city-wharf", actionPrice({ Money: 5000 }, "*")],
      // A pool the ledger does not name holds nothing at all, so nothing fits in it.
      ["portal-carport", actionPrice({ Money: 1 }, "spc_hell")],
    ]),
  };
  assert.equal(
    readCapturedOperand(regional, "BuildingAffordable", "city-farm", pooled),
    true,
  );
  // The same cost against the smaller world's share does not fit.
  assert.equal(
    readCapturedOperand(
      regional,
      "BuildingAffordable",
      "space-moon_base",
      pooled,
    ),
    false,
  );
  assert.equal(
    readCapturedOperand(regional, "BuildingAffordable", "city-bank", pooled),
    true,
  );
  assert.equal(
    readCapturedOperand(regional, "BuildingAffordable", "city-wharf", pooled),
    true,
  );
  assert.equal(
    readCapturedOperand(
      regional,
      "BuildingAffordable",
      "portal-carport",
      pooled,
    ),
    false,
  );
  // An empty ledger cannot say whether the resource is split at all, so the comparison stays
  // civilization-wide — exactly right for a resource the game never splits, and the same optimistic
  // answer as before for one whose first storage pass has not run.
  const unsplit = {
    ...regional,
    resource: {
      ...regional.resource,
      Money: { ...regional.resource.Money, max: 100000, regMax: {} },
    },
  };
  assert.equal(
    readCapturedOperand(unsplit, "BuildingAffordable", "city-farm", pooled),
    true,
  );
  // An uncapped resource is uncapped in every pool, which is the game's own `-1`.
  const uncapped = {
    ...regional,
    resource: {
      ...regional.resource,
      Money: { ...regional.resource.Money, max: -1, regMax: { spc_home: 0 } },
    },
  };
  assert.equal(
    readCapturedOperand(uncapped, "BuildingAffordable", "city-farm", pooled),
    true,
  );
}
// It is a boolean operand: the stored count is matched, not exceeded.
assert.equal(
  evaluateCapturedCondition(root, "BuildingAffordable", "city-farm", 1, priced),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "BuildingAffordable", "city-bank", 0, priced),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "BuildingAffordable",
    "city-temple",
    0,
    priced,
  ),
  undefined,
);

// --- the queued-building operand, from the captured game queue --------------

// Membership in the displayed build queue: the first entry, or every entry with the queue's
// "buy any affordable" setting on.
const queued = {
  ...root,
  settings: { qAny: false },
  queue: { display: true, queue: [{ id: "city-farm" }, { id: "city-mine" }] },
};
assert.equal(readCapturedOperand(queued, "BuildingQueued", "city-farm"), true);
assert.equal(readCapturedOperand(queued, "BuildingQueued", "city-mine"), false);
assert.equal(
  readCapturedOperand(
    { ...queued, settings: { qAny: true } },
    "BuildingQueued",
    "city-mine",
  ),
  true,
);
// A hidden queue — or none at all — is an empty list, so false rather than unanswered.
assert.equal(
  readCapturedOperand(
    { ...queued, queue: { display: false, queue: [{ id: "city-farm" }] } },
    "BuildingQueued",
    "city-farm",
  ),
  false,
);
assert.equal(readCapturedOperand(root, "BuildingQueued", "city-farm"), false);
// An argument naming no `<region>-<id>` pair names no building at all.
assert.equal(readCapturedOperand(queued, "BuildingQueued", "farm"), undefined);
// It is a boolean operand: the stored count is matched, not exceeded.
assert.equal(
  evaluateCapturedCondition(queued, "BuildingQueued", "city-farm", 1),
  true,
);
assert.equal(
  evaluateCapturedCondition(queued, "BuildingQueued", "city-mine", 0),
  true,
);
assert.equal(
  evaluateCapturedCondition(queued, "BuildingQueued", "city-farm", 0),
  false,
);

// --- the demand-reading operands, from the trigger-excluding sample ---------

// Whether something else is accumulating the resource, how far holdings cover the committed
// storage need, and the largest single committed cost.
const accumulating = {
  demand: {
    isDemanded: (id) => id === "Money",
    storageRequired: (id) => (id === "Money" ? 500 : 1),
    maxCost: (id) => (id === "Money" ? 600 : 0),
  },
};
assert.equal(
  readCapturedOperand(root, "ResourceDemanded", "Money", accumulating),
  true,
);
assert.equal(
  readCapturedOperand(root, "ResourceDemanded", "Plywood", accumulating),
  false,
);
// 250 held against a 500 need is not satisfied; 10 held against no need is.
assert.equal(
  readCapturedOperand(root, "ResourceSatisfied", "Money", accumulating),
  false,
);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfied", "Plywood", accumulating),
  true,
);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfyRatio", "Money", accumulating),
  0.5,
);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfyRatio", "Plywood", accumulating),
  10,
);
assert.equal(
  readCapturedOperand(root, "ResourceMaxCost", "Money", accumulating),
  600,
);
assert.equal(
  readCapturedOperand(root, "ResourceMaxCost", "Plywood", accumulating),
  0,
);
// Boolean operands match their stored count; numerics compare with `>=`.
assert.equal(
  evaluateCapturedCondition(root, "ResourceDemanded", "Money", 1, accumulating),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "ResourceDemanded", "Money", 0, accumulating),
  false,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ResourceSatisfied",
    "Money",
    0,
    accumulating,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ResourceSatisfyRatio",
    "Money",
    0.5,
    accumulating,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ResourceSatisfyRatio",
    "Money",
    0.6,
    accumulating,
  ),
  false,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ResourceMaxCost",
    "Money",
    600,
    accumulating,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "ResourceMaxCost",
    "Money",
    601,
    accumulating,
  ),
  false,
);

// With no commitments the sample degenerates to the values the compatibility reader sees after
// its own accumulator reset: nothing demanded, a storage need of 1, a max cost of 0.
const uncommitted = {
  demand: {
    isDemanded: () => false,
    storageRequired: () => 1,
    maxCost: () => 0,
  },
};
assert.equal(
  readCapturedOperand(root, "ResourceDemanded", "Money", uncommitted),
  false,
);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfied", "Money", uncommitted),
  true,
);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfyRatio", "Money", uncommitted),
  250,
);
assert.equal(
  readCapturedOperand(root, "ResourceMaxCost", "Money", uncommitted),
  0,
);
// An uncapped resource reports a satisfied ratio of 1 however little it holds.
assert.equal(
  readCapturedOperand(root, "ResourceSatisfied", "Soul_Gem", uncommitted),
  true,
);
// A resource the root does not hold is unanswerable rather than undemanded, and so is every
// operand without the demand pass.
assert.equal(
  readCapturedOperand(root, "ResourceDemanded", "Lumber", accumulating),
  undefined,
);
assert.equal(readCapturedOperand(root, "ResourceDemanded", "Money"), undefined);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfied", "Money"),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "ResourceSatisfyRatio", "Money"),
  undefined,
);
assert.equal(readCapturedOperand(root, "ResourceMaxCost", "Money"), undefined);

// --- the soldier operands, recomputed from the captured root ----------------

// Garrison, fortress, and forward-base fields the game backfills or the manager zeroes read the
// same way: a missing bag is zero, matching the manager before its first update.
const garrisoned = {
  ...root,
  civic: {
    ...root.civic,
    garrison: { workers: 10, max: 12, crew: 1, wounded: 2 },
  },
  portal: { fortress: { garrison: 5, patrols: 1, patrol_size: 2 } },
  space: { ...root.space, fob: { troops: 1 } },
};
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "workers"), 10);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "max"), 12);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "crew"), 1);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "wounded"), 2);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "deadSoldiers"), 2);
assert.equal(
  readCapturedOperand(garrisoned, "Soldiers", "currentCityGarrison"),
  3,
);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "maxCityGarrison"), 6);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "hellSoldiers"), 5);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "hellPatrols"), 1);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "hellPatrolSize"), 2);
// The assault-forge reserve and the mercenary price need settings and catalogs no capture holds,
// and anything but the twelve trackable fields names no operand at all.
assert.equal(
  readCapturedOperand(garrisoned, "Soldiers", "hellGarrison"),
  undefined,
);
assert.equal(
  readCapturedOperand(garrisoned, "Soldiers", "mercenaryCost"),
  undefined,
);
assert.equal(readCapturedOperand(garrisoned, "Soldiers", "raid"), undefined);
// Before the garrison exists every count is zero, like the manager before its first update.
assert.equal(readCapturedOperand(root, "Soldiers", "workers"), 0);
assert.equal(readCapturedOperand(root, "Soldiers", "currentCityGarrison"), 0);
assert.equal(readCapturedOperand(root, "Soldiers", "hellSoldiers"), 0);
// Numeric conditions compare with `>=`.
assert.equal(
  evaluateCapturedCondition(garrisoned, "Soldiers", "workers", 10),
  true,
);
assert.equal(
  evaluateCapturedCondition(garrisoned, "Soldiers", "workers", 11),
  false,
);

// --- the smelter slot operand, from the captured city bag -------------------

// The script's own count is total capacity minus the separately managed Star slots.
const smelting = {
  ...root,
  city: { ...root.city, smelter: { cap: 10, Star: 3 } },
};
assert.equal(readCapturedOperand(smelting, "Industry", "smelters"), 7);
// A smelter the game never built leaves the operand unanswered, never zero, and so does a factory
// bag the game has not created.
assert.equal(readCapturedOperand(root, "Industry", "smelters"), undefined);
assert.equal(readCapturedOperand(smelting, "Industry", "factories"), undefined);

// Factory slots are the line pool: every switched-on factory across all eight structures that
// carry lines, which is upstream's own `factoryCapacity()`.
const factories = {
  ...root,
  city: { ...root.city, factory: { count: 4, on: 3 } },
};
assert.equal(readCapturedOperand(factories, "Industry", "factories"), 3);
// The seven regional structures each contribute at their own upstream rate: red 1x,
// interstellar 2x, portal `3 + rank`, underground 2x, Venus 2x, and Tau Ceti 3x without the
// isolation technology.
const spreadFactories = {
  ...root,
  tech: { ...root.tech },
  city: { ...root.city, factory: { count: 2, on: 2 } },
  space: {
    ...root.space,
    red_factory: { count: 1, on: 1 },
    industrial_complex: { count: 1, on: 1 },
  },
  interstellar: { int_factory: { count: 1, on: 1 } },
  portal: { hell_factory: { count: 1, on: 1, rank: 2 } },
  underground: { under_factory: { count: 1, on: 1 } },
  tauceti: { tau_factory: { count: 1, on: 1 } },
};
assert.equal(
  readCapturedOperand(spreadFactories, "Industry", "factories"),
  2 + 1 + 2 + 5 + 2 + 2 + 3,
);
// A switched-off factory holds no lines, so the pool follows `on` and not `count`.
assert.equal(
  readCapturedOperand(
    { ...root, city: { ...root.city, factory: { count: 9, on: 0 } } },
    "Industry",
    "factories",
  ),
  0,
);
assert.equal(
  evaluateCapturedCondition(smelting, "Industry", "smelters", 7),
  true,
);
assert.equal(
  evaluateCapturedCondition(smelting, "Industry", "smelters", 8),
  false,
);

// --- the building cost operand, over the cycle's own prices -----------------

// One entry of the priced building's adjusted cost, the same pass `BuildingAffordable` compares.
const pricedCost = {
  buildingCosts: new Map([
    ["city-farm", actionPrice({ Money: 500, Wood: 200 })],
  ]),
};
assert.equal(
  readCapturedOperand(root, "BuildingCost", "city-farm.Money", pricedCost),
  500,
);
// A priced building missing the named resource costs nothing in it.
assert.equal(
  readCapturedOperand(root, "BuildingCost", "city-farm.Stone", pricedCost),
  0,
);
// A building the cycle never priced, and an argument naming no entry, stay unanswered.
assert.equal(
  readCapturedOperand(root, "BuildingCost", "city-mine.Money", pricedCost),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingCost", "city-farm", pricedCost),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "BuildingCost", "city-farm.Money"),
  undefined,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "BuildingCost",
    "city-farm.Money",
    500,
    pricedCost,
  ),
  true,
);
assert.equal(
  evaluateCapturedCondition(
    root,
    "BuildingCost",
    "city-farm.Money",
    501,
    pricedCost,
  ),
  false,
);

// --- the satellite price operand, from the same priced pass -----------------

// The swarm satellite's next-copy Money price, under its game action id.
const pricedSat = {
  buildingCosts: new Map([
    ["space-swarm_satellite", actionPrice({ Money: 5000 })],
  ]),
};
assert.equal(readCapturedOperand(root, "Other", "satcost", pricedSat), 5000);
// A priced satellite missing the Money entry costs nothing in it.
assert.equal(
  readCapturedOperand(root, "Other", "satcost", {
    buildingCosts: new Map([["space-swarm_satellite", actionPrice({})]]),
  }),
  0,
);
// A satellite the cycle never priced stays unanswered rather than reading as free.
assert.equal(readCapturedOperand(root, "Other", "satcost", priced), undefined);
assert.equal(readCapturedOperand(root, "Other", "satcost"), undefined);
assert.equal(
  evaluateCapturedCondition(root, "Other", "satcost", 5000, pricedSat),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "Other", "satcost", 5001, pricedSat),
  false,
);

// --- the Tech Knowledge operand, from the knowledge gate's figure ------------

// The Knowledge the most expensive offered technology costs; 0 means no catalog has been read,
// while a missing sample leaves the operand unanswered.
assert.equal(
  readCapturedOperand(root, "Other", "tknow", {
    knowledgeRequiredByTechs: 12000,
  }),
  12000,
);
assert.equal(
  readCapturedOperand(root, "Other", "tknow", { knowledgeRequiredByTechs: 0 }),
  0,
);
assert.equal(readCapturedOperand(root, "Other", "tknow", pricedSat), undefined);
assert.equal(readCapturedOperand(root, "Other", "tknow"), undefined);
assert.equal(
  evaluateCapturedCondition(root, "Other", "tknow", 12000, {
    knowledgeRequiredByTechs: 12000,
  }),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "Other", "tknow", 12001, {
    knowledgeRequiredByTechs: 12000,
  }),
  false,
);

// --- the stored-settings operands, from the cycle's own settings ------------

// The reset type, a setting value, and the evolution-queue length all come from the stored
// settings the trigger sample already holds, not from game state.
const stored = {
  settings: {
    prestigeType: "mad",
    tickRate: 8,
    autoBuild: true,
    autoMarket: false,
    customName: "yes",
    evolutionQueue: ["human", "elven", "orc"],
  },
};
assert.equal(readCapturedOperand(root, "ResetType", "mad", stored), true);
assert.equal(readCapturedOperand(root, "ResetType", "bioseed", stored), false);
// A boolean operand matches its stored count rather than exceeding it.
assert.equal(
  evaluateCapturedCondition(root, "ResetType", "mad", 1, stored),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "ResetType", "mad", 0, stored),
  false,
);
assert.equal(
  evaluateCapturedCondition(root, "ResetType", "bioseed", 0, stored),
  true,
);
// Without the settings sample there is nothing to match against.
assert.equal(readCapturedOperand(root, "ResetType", "mad"), undefined);
// A numeric setting reads directly; a boolean rides as 0 or 1 so the script's `>=` holds.
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "tickRate", stored),
  8,
);
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "autoBuild", stored),
  1,
);
// Stored defaults read the same blob: the runtime parses stored settings fresh on every read
// and no automation tick writes them back, so there is no live layer for a default to differ.
assert.equal(
  readCapturedOperand(root, "SettingDefault", "tickRate", stored),
  8,
);
assert.equal(
  readCapturedOperand(root, "SettingDefault", "autoBuild", stored),
  1,
);
assert.equal(
  readCapturedOperand(root, "SettingDefault", "customName", stored),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "SettingDefault", "tickRate"),
  undefined,
);
assert.equal(
  evaluateCapturedCondition(root, "SettingDefault", "tickRate", 8, stored),
  true,
);
// Anything that is neither — strings, absent keys, a missing sample — stays unanswered.
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "customName", stored),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "nothing", stored),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "SettingCurrent", "tickRate"),
  undefined,
);
assert.equal(
  evaluateCapturedCondition(root, "SettingCurrent", "tickRate", 8, stored),
  true,
);
assert.equal(
  evaluateCapturedCondition(root, "SettingCurrent", "tickRate", 9, stored),
  false,
);
assert.equal(
  evaluateCapturedCondition(root, "SettingCurrent", "autoBuild", 0, stored),
  true,
);
// The evolution plan is the stored queue's length; anything but an array is unanswered.
assert.equal(readCapturedOperand(root, "Queue", "evo", stored), 3);
assert.equal(
  readCapturedOperand(root, "Queue", "evo", {
    settings: { evolutionQueue: "human" },
  }),
  undefined,
);
assert.equal(evaluateCapturedCondition(root, "Queue", "evo", 3, stored), true);
assert.equal(evaluateCapturedCondition(root, "Queue", "evo", 4, stored), false);

// ResourceIncome is exact when the finalized resource rate has no private market or decay
// adjustment. The live diff is deliberately not guessed when either adjustment could apply.
assert.equal(readCapturedOperand(root, "ResourceIncome", "Money", stored), 12);
assert.equal(
  readCapturedOperand(
    { ...root, race: { ...root.race, decay: 1 } },
    "ResourceIncome",
    "Money",
    stored,
  ),
  undefined,
);
assert.equal(
  readCapturedOperand(root, "ResourceIncome", "Money", {
    settings: { autoMarket: true },
  }),
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
// `tknow` without the gate's figure, like every operand without its pass, is unanswered.
assert.equal(readCapturedOperand(root, "Other", "tknow", stored), undefined);
assert.equal(readCapturedOperand(root, "RaceGenus", "humanoid"), undefined);
assert.equal(readCapturedOperand(root, "Queue", "evo"), undefined);
// Manager-computed and script-computed operands stay unanswered.
assert.equal(readCapturedOperand(root, "Soldiers", "hellGarrison"), undefined);
assert.equal(readCapturedOperand(root, "Soldiers", "mercenaryCost"), undefined);
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
