import assert from "node:assert/strict";

import {
  BOSS_WEAPON_RATINGS,
  CLASSIC_MECH_WEAPONS,
} from "../src/domain/combat/mech-boss-armory.ts";
import {
  bestDesignFigures,
  bestMechBodies,
  bestMechWeapons,
  chooseAutoDesign,
  choosePreferredSize,
  mechGeneralSlotCount,
  mechHardpoints,
  rateMechDesign,
} from "../src/domain/combat/mech-design.ts";
import {
  mechFrameCost,
  mechFrameGemCost,
  mechFrameRefund,
  mechFrameSpace,
  mechFrameSupplyCost,
} from "../src/domain/combat/mech-costs.ts";

const first = () => 0;

// Game-owned cost figures (portal.js mechCost/mechSize).
assert.deepEqual(mechFrameCost("small", 0), {
  supply: 75_000,
  gems: 1,
  space: 2,
});
assert.deepEqual(mechFrameCost("small", 2), {
  supply: 50_000,
  gems: 1,
  space: 2,
});
assert.deepEqual(mechFrameCost("titan", 2), {
  supply: 750_000,
  gems: 75,
  space: 20,
});
assert.deepEqual(mechFrameCost("collector", 2), {
  supply: 8_000,
  gems: 1,
  space: 1,
});
assert.equal(mechFrameSupplyCost("medium", 0), 180_000);
assert.equal(mechFrameGemCost("large"), 20);
assert.equal(mechFrameSpace("medium", 0), 5);
assert.equal(mechFrameSpace("medium", 3), 4);
assert.deepEqual(mechFrameRefund("small", 0), { supply: 25_000, gems: 0 });
assert.deepEqual(mechFrameRefund("titan", 0), { supply: 250_000, gems: 37 });
assert.equal(mechFrameCost("archfiend", 0), undefined);
assert.equal(mechFrameCost("warlord", 0), undefined);

// Armory shape: every transcribed boss rates all eight classic weapons.
assert.equal(Object.keys(BOSS_WEAPON_RATINGS).length, 42);
assert.equal(CLASSIC_MECH_WEAPONS.length, 8);
for (const [boss, ratings] of Object.entries(BOSS_WEAPON_RATINGS)) {
  assert.equal(ratings.length, 8, boss);
  for (const rating of ratings) {
    assert.equal(Number.isFinite(rating), true, `${boss}: ${rating}`);
    assert.equal(rating >= 0, true, `${boss}: ${rating}`);
  }
}

const floor = {
  terrain: "sand",
  statuses: [],
  boss: "snake",
  spireCount: 1,
  scouts: 0,
  prepared: 0,
  wrath: 0,
  gladiatorLevel: 0,
  collectorValue: 0.5,
};

// Small wheel laser on sand vs a uniform boss:
// 0.0025 base * (0.9 terrain + jump-jet gap fill to 0.965) * 0.5 weapon.
const rated = rateMechDesign(
  { size: "small", chassis: "wheel", hardpoint: ["laser"], equip: ["special"] },
  floor,
);
assert.deepEqual(rated, { power: 0.00120625, efficiency: 0.000603125 });

// Infrared answers dark; without it the design keeps 10%.
const darkFloor = { ...floor, statuses: ["dark"] };
const blind = rateMechDesign(
  { size: "small", chassis: "wheel", hardpoint: ["laser"], equip: ["special"] },
  darkFloor,
);
const seeing = rateMechDesign(
  {
    size: "small",
    chassis: "wheel",
    hardpoint: ["laser"],
    equip: ["special", "infrared"],
  },
  darkFloor,
);
assert.equal(blind !== null && seeing !== null, true);
assert.ok(
  Math.abs(blind.power - seeing.power * 0.1) < 1e-12,
  `dark derate: ${blind.power} vs ${seeing.power}`,
);

// Missing facts never guess.
assert.equal(
  rateMechDesign(
    {
      size: "small",
      chassis: "wheel",
      hardpoint: ["laser"],
      equip: ["special"],
    },
    { ...floor, boss: "abyssal" },
  ),
  null,
);
assert.equal(
  rateMechDesign(
    {
      size: "small",
      chassis: "wheel",
      hardpoint: ["laser"],
      equip: ["special"],
    },
    { ...floor, statuses: ["ashfall", "bubbly"] },
  ),
  null,
);
assert.equal(
  rateMechDesign(
    {
      size: "small",
      chassis: "hydra",
      hardpoint: ["laser"],
      equip: ["special"],
    },
    floor,
  ),
  null,
);
assert.equal(
  rateMechDesign(
    {
      size: "small",
      chassis: "wheel",
      hardpoint: ["claws"],
      equip: ["special"],
    },
    floor,
  ),
  null,
);
assert.equal(
  rateMechDesign(
    {
      size: "small",
      chassis: "wheel",
      hardpoint: ["laser"],
      equip: ["special", "manashield"],
    },
    floor,
  ),
  null,
);

// Weapon ties keep every best weapon; unique maxima resolve.
assert.deepEqual(bestMechWeapons("snake"), [...CLASSIC_MECH_WEAPONS]);
assert.deepEqual(bestMechWeapons("water_elm"), ["plasma"]);
assert.deepEqual(bestMechWeapons("bat"), ["sonic"]);
assert.equal(bestMechWeapons("abyssal"), null);

// Slots and mounts follow the current frames.
assert.equal(mechGeneralSlotCount("titan", 0), 4);
assert.equal(mechGeneralSlotCount("small", 1), 2);
assert.equal(mechHardpoints("medium"), 2);
assert.equal(mechHardpoints("collector"), 0);
assert.equal(mechHardpoints("archfiend"), undefined);

// Automatic choice is deterministic for a fixed pick and fully legal.
const firstChoice = chooseAutoDesign("large", floor, first);
assert.equal(firstChoice !== null, true);
assert.equal(firstChoice.size, "large");
assert.equal(firstChoice.hardpoint.length, 2);
assert.equal(firstChoice.equip[0], "special");
assert.equal(firstChoice.power > 0, true);
assert.deepEqual(chooseAutoDesign("large", floor, first), firstChoice);
assert.equal(
  chooseAutoDesign("titan", { ...floor, boss: "abyssal" }, first),
  null,
);
assert.ok(
  (bestMechBodies("small", floor) ?? []).length > 0,
  "expected tied-best small bodies",
);

// Rankings cover the whole classic line.
const figures = bestDesignFigures(floor, first);
assert.equal(figures !== null, true);
for (const size of ["small", "medium", "large", "titan", "collector"]) {
  assert.equal(figures[size].power > 0, true, size);
}
assert.equal(bestDesignFigures({ ...floor, boss: "abyssal" }, first), null);

// Preferred size: the historical policy branches.
const base = {
  bayMaximum: 25,
  bayOccupied: 0,
  bayScouts: 2,
  supplyRate: 5_000,
  supplyMaximum: 200_000,
  supplyRatio: 1,
  gemsSpare: 500,
  prepared: 0,
  gravityFloor: false,
  preferredSize: "titan",
  gravitySize: "medium",
  fillBay: true,
  minimumSupplyRate: 1_000,
  maximumCollectorShare: 0.5,
  scoutsRatio: 0.05,
  rankByEff: ["titan", "large", "medium", "small", "collector"],
  rankByGems: ["small", "collector", "medium", "large", "titan"],
  rankBySupply: ["collector", "small", "medium", "large", "titan"],
};
assert.deepEqual(
  choosePreferredSize({ ...base, preferredSize: "medium", fillBay: false }),
  {
    size: "medium",
    force: false,
  },
);
assert.deepEqual(
  choosePreferredSize({
    ...base,
    supplyRatio: 0.5,
    supplyRate: 100,
    bayScouts: 0,
  }),
  { size: "collector", force: true },
);
assert.deepEqual(choosePreferredSize({ ...base, bayScouts: 0 }), {
  size: "small",
  force: true,
});
assert.deepEqual(
  choosePreferredSize({ ...base, gravityFloor: true, fillBay: false }),
  { size: "medium", force: false },
);
assert.deepEqual(
  choosePreferredSize({ ...base, preferredSize: "gems", fillBay: false }),
  { size: "small", force: false },
);
assert.deepEqual(choosePreferredSize({ ...base, bayOccupied: 24 }), {
  size: "collector",
  force: true,
});

console.log("captured mech design checks passed");
