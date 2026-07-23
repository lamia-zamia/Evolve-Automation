import assert from "node:assert/strict";

import {
  getBlackholeMass,
  isApocalypsePrestigeAvailable,
  isAscensionPrestigeAvailable,
  isBioseedPrestigeAvailable,
  isCataclysmPrestigeAvailable,
  isDemonicPrestigeAvailable,
  isGeckNeeded,
  isPillarFinished,
  isPrestigeAllowed,
  isWhiteholePrestigeAvailable,
  isWitchAscensionPrestigeAvailable,
} from "../src/domain/progression/prestige/prestige-eligibility.ts";
import { legacyPrestigeTrace } from "./test-support/legacy-prestige-eligibility.mjs";

function makeView(overrides = {}) {
  const base = {
    settings: {
      autoPrestige: true,
      waitForArpa: false,
      selectedType: "bioseed",
      requiredBioseedProbes: 25,
      requiredGecks: 1,
      minimumBlackholeMass: 12,
      requirePillar: true,
      autoMech: false,
      maximumMechPotential: 0.5,
      minimumSpireFloor: 75,
    },
    game: {
      activeArpaProjects: 0,
      species: "human",
      universe: "standard",
      fasting: false,
      ascensionLevel: 4,
      blackholeMass: 10,
      blackholeExotic: 2,
    },
    resources: { harmony: 1 },
    buildings: {
      spaceDock: 1,
      shipSegments: 100,
      probes: 25,
      gecks: 1,
      siriusAscendUnlocked: true,
      absorptionChambers: 100,
      soulCapacitorEnergy: 100_000_000,
      spireFloor: 76,
    },
    tech: {
      cataclysmUnlocked: true,
      exoticInfusionUnlocked: true,
      infusionCheckUnlocked: false,
      infusionConfirmUnlocked: false,
      protocol66Unlocked: true,
      protocol66aUnlocked: false,
      demonicInfusionUnlocked: true,
      demonicInfusionAffordable: true,
      finalIngredientUnlocked: true,
      finalIngredientAffordable: true,
      forbiddenLevelFive: true,
      dishLevelTwo: true,
    },
    achievement: { lamentisStandardFive: false },
    mech: { active: false, potential: 0.5 },
  };
  return Object.freeze({
    ...base,
    ...overrides,
    settings: Object.freeze({ ...base.settings, ...overrides.settings }),
    game: Object.freeze({ ...base.game, ...overrides.game }),
    resources: Object.freeze({ ...base.resources, ...overrides.resources }),
    buildings: Object.freeze({ ...base.buildings, ...overrides.buildings }),
    tech: Object.freeze({ ...base.tech, ...overrides.tech }),
    achievement: Object.freeze({
      ...base.achievement,
      ...overrides.achievement,
    }),
    mech: Object.freeze({ ...base.mech, ...overrides.mech }),
  });
}

function modernTrace(view) {
  return {
    allowed: isPrestigeAllowed(view),
    matching: isPrestigeAllowed(view, "bioseed"),
    other: isPrestigeAllowed(view, "mad"),
    cataclysm: isCataclysmPrestigeAvailable(view),
    bioseed: isBioseedPrestigeAvailable(view),
    whitehole: isWhiteholePrestigeAvailable(view),
    apocalypse: isApocalypsePrestigeAvailable(view),
    ascension: isAscensionPrestigeAvailable(view),
    witchAscension: isWitchAscensionPrestigeAvailable(view),
    witchDemonic: isWitchAscensionPrestigeAvailable(view, true),
    demonic: isDemonicPrestigeAvailable(view),
    pillarFinished: isPillarFinished(view),
    geckNeeded: isGeckNeeded(view),
    blackholeMass: getBlackholeMass(view),
  };
}

const equivalentCases = [
  ["baseline", makeView()],
  [
    "permission and GECK gates",
    makeView({
      settings: { waitForArpa: true, requiredGecks: 2 },
      game: { activeArpaProjects: 1 },
      achievement: { lamentisStandardFive: true },
    }),
  ],
  ["unfinished pillar", makeView({ game: { speciesPillarLevel: 3 } })],
  [
    "micro pillar bypass",
    makeView({ game: { universe: "micro", speciesPillarLevel: 0 } }),
  ],
  [
    "fasting reset and dish gate",
    makeView({
      game: { fasting: true },
      tech: { dishLevelTwo: false, finalIngredientAffordable: false },
    }),
  ],
  [
    "active mech gate",
    makeView({
      settings: { autoMech: true, maximumMechPotential: 0.5 },
      mech: { active: true, potential: 0.5 },
    }),
  ],
];

for (const [name, view] of equivalentCases) {
  assert.deepEqual(modernTrace(view), legacyPrestigeTrace(view), name);
}

const exactFloor = makeView({ buildings: { spireFloor: 75 } });
assert.equal(legacyPrestigeTrace(exactFloor).demonic, false);
assert.equal(
  isDemonicPrestigeAvailable(exactFloor),
  true,
  "configured minimum floor is inclusive",
);

const exactPotential = makeView({
  settings: { autoMech: true, maximumMechPotential: 0.5 },
  mech: { active: false, potential: 0.5 },
});
assert.equal(isDemonicPrestigeAvailable(exactPotential), true);

console.log("Prestige eligibility domain tests passed");
