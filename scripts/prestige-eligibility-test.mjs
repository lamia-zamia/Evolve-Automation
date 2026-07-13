import assert from "node:assert/strict";

import { createPrestigeEligibility } from "../src/policies/prestige-eligibility.ts";

function tech(unlocked = false, affordable = false) {
  return {
    isUnlocked: () => unlocked,
    isAffordable: () => affordable,
  };
}

function makeContext() {
  return {
    settings: {
      autoPrestige: true,
      prestigeWaitAT: false,
      prestigeType: "bioseed",
      prestigeBioseedProbes: 1,
      prestigeGECK: 1,
      prestigeWhiteholeMinMass: 10,
      prestigeAscensionPillar: false,
      autoMech: false,
      prestigeDemonicPotential: 0,
      prestigeDemonicFloor: 0,
    },
    game: {
      alevel: () => 1,
      global: {
        settings: { at: 0 },
        race: { species: "human", universe: "standard" },
        pillars: {},
        interstellar: { stellar_engine: null },
      },
    },
    resources: { Harmony: { currentQuantity: 0 } },
    buildings: {
      GasSpaceDock: { count: 1 },
      GasSpaceDockShipSegment: { count: 100 },
      GasSpaceDockProbe: { count: 1 },
      GasSpaceDockGECK: { count: 0 },
      SiriusAscend: { isUnlocked: () => true },
      PitAbsorptionChamber: { count: 100 },
      PitSoulCapacitor: { instance: { energy: 100_000_000 } },
      SpireTower: { count: 1 },
    },
    techIds: {
      "tech-dial_it_to_11": tech(),
      "tech-exotic_infusion": tech(),
      "tech-infusion_check": tech(),
      "tech-infusion_confirm": tech(),
      "tech-protocol66": tech(),
      "tech-protocol66a": tech(),
      "tech-demonic_infusion": tech(true, true),
      "tech-final_ingredient": tech(true, true),
    },
    MechManager: { isActive: false, mechsPotential: 0 },
    haveTech: () => false,
    isAchievementUnlocked: () => false,
  };
}

let context = makeContext();
const eligibility = createPrestigeEligibility({
  getSettings: () => context.settings,
  getGame: () => context.game,
  getResources: () => context.resources,
  getBuildings: () => context.buildings,
  getTechIds: () => context.techIds,
  getMechManager: () => context.MechManager,
  getHaveTech: () => context.haveTech,
  getIsAchievementUnlocked: () => context.isAchievementUnlocked,
});

assert.equal(eligibility.isPrestigeAllowed("bioseed"), true);
assert.equal(eligibility.isCataclysmPrestigeAvailable(), false);
assert.equal(eligibility.isGECKNeeded(), false);

context = makeContext();
context.settings.prestigeType = "mad";
context.techIds["tech-dial_it_to_11"] = tech(true);
context.isAchievementUnlocked = () => true;

assert.equal(eligibility.isPrestigeAllowed("bioseed"), false);
assert.equal(eligibility.isCataclysmPrestigeAvailable(), true);
assert.equal(eligibility.isGECKNeeded(), true);
assert.equal(eligibility.isBioseederPrestigeAvailable(), false);

console.log("Prestige eligibility module tests passed");
