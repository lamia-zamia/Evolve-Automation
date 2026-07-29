import assert from "node:assert/strict";

import { createPrestigeIntelligence } from "../src/game/prestige-intelligence.ts";

let settings = { autoPrestige: true, prestigeType: "mad" };
let researched = false;
let techReads = [];
let mad = { unlocked: true, affordable: true };

const intelligence = createPrestigeIntelligence({
  getSettings: () => settings,
  getTechIds: () => ({
    "tech-mad": {
      isUnlocked: () => {
        techReads.push("isUnlocked");
        return mad.unlocked;
      },
      isAffordable: (max) => {
        techReads.push(`isAffordable(${max})`);
        return mad.affordable;
      },
    },
  }),
  getHaveTech: () => (research) =>
    research === "mad" ? researched : undefined,
});

// An unresearched MAD is awaited once its tech is unlocked and affordable, and
// affordability is asked with the max-cost flag the rule always used.
assert.equal(intelligence.madPrestigeAwaited(), true);
assert.deepEqual(techReads, ["isUnlocked", "isAffordable(true)"]);

techReads = [];
mad = { unlocked: true, affordable: false };
assert.equal(intelligence.madPrestigeAwaited(), false);
mad = { unlocked: false, affordable: true };
assert.equal(intelligence.madPrestigeAwaited(), false);
assert.deepEqual(techReads, ["isUnlocked", "isAffordable(true)", "isUnlocked"]);

// A researched MAD is awaited without pricing the tech at all.
techReads = [];
researched = true;
assert.equal(intelligence.madPrestigeAwaited(), true);
assert.deepEqual(techReads, []);

// A run that is not headed for MAD reads neither the tech tree nor the tech.
researched = false;
mad = { unlocked: true, affordable: true };
settings = { autoPrestige: false, prestigeType: "mad" };
assert.equal(intelligence.madPrestigeAwaited(), false);
settings = { autoPrestige: true, prestigeType: "bioseed" };
assert.equal(intelligence.madPrestigeAwaited(), false);
assert.deepEqual(techReads, []);

console.log("Prestige intelligence module tests passed");
