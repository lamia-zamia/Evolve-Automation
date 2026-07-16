import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const readyCallbacks = [];
const hooks = {};
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
  $: () => ({
    ready(callback) {
      readyCallbacks.push(callback);
    },
  }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setPrestigeEligibilityTestContext, "function");
for (const name of [
  "isPrestigeAllowed",
  "isCataclysmPrestigeAvailable",
  "isBioseederPrestigeAvailable",
  "isWhiteholePrestigeAvailable",
  "isApocalypsePrestigeAvailable",
  "isAscensionPrestigeAvailable",
  "isWitchAscensionPrestigeAvailable",
  "isDemonicPrestigeAvailable",
  "isPillarFinished",
  "isGECKNeeded",
  "getBlackholeMass",
]) {
  assert.equal(
    typeof hooks.prestigeEligibility[name],
    "function",
    `${name} hook missing`,
  );
}

function tech({ unlocked = false, affordable = false } = {}) {
  return {
    isUnlocked: () => unlocked,
    isAffordable: () => affordable,
  };
}

function makeContext() {
  const researched = new Map();
  return {
    settings: {
      autoPrestige: true,
      prestigeWaitAT: false,
      prestigeType: "bioseed",
      prestigeBioseedProbes: 25,
      prestigeGECK: 1,
      prestigeWhiteholeMinMass: 12,
      prestigeAscensionPillar: true,
      autoMech: false,
      prestigeDemonicPotential: 0.5,
      prestigeDemonicFloor: 75,
    },
    game: {
      alevel: () => 4,
      global: {
        settings: { at: 0 },
        race: { species: "human", universe: "standard" },
        pillars: {},
        interstellar: { stellar_engine: { mass: 10, exotic: 2 } },
      },
    },
    resources: {
      Harmony: { currentQuantity: 1 },
    },
    buildings: {
      GasSpaceDock: { count: 1 },
      GasSpaceDockShipSegment: { count: 100 },
      GasSpaceDockProbe: { count: 25 },
      GasSpaceDockGECK: { count: 0 },
      SiriusAscend: { isUnlocked: () => true },
      PitAbsorptionChamber: { count: 100 },
      PitSoulCapacitor: { instance: { energy: 100_000_000 } },
      SpireTower: { count: 76 },
    },
    techIds: {
      "tech-dial_it_to_11": tech({ unlocked: true }),
      "tech-exotic_infusion": tech({ unlocked: true }),
      "tech-infusion_check": tech(),
      "tech-infusion_confirm": tech(),
      "tech-protocol66": tech({ unlocked: true }),
      "tech-protocol66a": tech(),
      "tech-demonic_infusion": tech({ unlocked: true, affordable: true }),
      "tech-final_ingredient": tech({ unlocked: true, affordable: true }),
    },
    MechManager: { isActive: false, mechsPotential: 0.5 },
    haveTech: (id, level = 1) => (researched.get(id) ?? 0) >= level,
    isAchievementUnlocked: () => false,
    researched,
  };
}

function use(context) {
  hooks.setPrestigeEligibilityTestContext(context);
  return hooks.prestigeEligibility;
}

const baseline = makeContext();
let eligibility = use(baseline);
assert.deepEqual(
  {
    anyPrestige: eligibility.isPrestigeAllowed(),
    matchingPrestige: eligibility.isPrestigeAllowed("bioseed"),
    otherPrestige: eligibility.isPrestigeAllowed("mad"),
    cataclysm: eligibility.isCataclysmPrestigeAvailable(),
    bioseed: eligibility.isBioseederPrestigeAvailable(),
    whitehole: eligibility.isWhiteholePrestigeAvailable(),
    apocalypse: eligibility.isApocalypsePrestigeAvailable(),
    blackholeMass: eligibility.getBlackholeMass(),
  },
  {
    anyPrestige: true,
    matchingPrestige: true,
    otherPrestige: false,
    cataclysm: true,
    bioseed: true,
    whitehole: true,
    apocalypse: true,
    blackholeMass: 12,
  },
);

baseline.settings.prestigeWaitAT = true;
baseline.game.global.settings.at = 1;
assert.equal(eligibility.isPrestigeAllowed(), false);
baseline.game.global.settings.at = 0;
baseline.settings.autoPrestige = false;
assert.equal(eligibility.isPrestigeAllowed(), false);

const geck = makeContext();
geck.isAchievementUnlocked = (id, level, universe) =>
  id === "lamentis" && level === 5 && universe === "standard";
eligibility = use(geck);
assert.equal(eligibility.isGECKNeeded(), true);
assert.equal(eligibility.isBioseederPrestigeAvailable(), false);
geck.buildings.GasSpaceDockGECK.count = 1;
assert.equal(eligibility.isGECKNeeded(), false);
assert.equal(eligibility.isBioseederPrestigeAvailable(), true);
geck.buildings.GasSpaceDockProbe.count = 24;
assert.equal(eligibility.isBioseederPrestigeAvailable(), false);

const resetTech = makeContext();
eligibility = use(resetTech);
resetTech.game.global.interstellar.stellar_engine = null;
assert.equal(eligibility.getBlackholeMass(), 0);
assert.equal(eligibility.isWhiteholePrestigeAvailable(), false);
resetTech.game.global.interstellar.stellar_engine = {
  mass: undefined,
  exotic: 2,
};
assert.equal(eligibility.getBlackholeMass(), 0);
assert.equal(eligibility.isWhiteholePrestigeAvailable(), false);
resetTech.game.global.interstellar.stellar_engine = { mass: 12, exotic: 0 };
resetTech.techIds["tech-exotic_infusion"] = tech();
assert.equal(eligibility.isWhiteholePrestigeAvailable(), false);
resetTech.techIds["tech-infusion_confirm"] = tech({ unlocked: true });
assert.equal(eligibility.isWhiteholePrestigeAvailable(), true);
resetTech.techIds["tech-protocol66"] = tech();
assert.equal(eligibility.isApocalypsePrestigeAvailable(), false);
resetTech.techIds["tech-protocol66a"] = tech({ unlocked: true });
assert.equal(eligibility.isApocalypsePrestigeAvailable(), true);

const pillar = makeContext();
eligibility = use(pillar);
assert.equal(eligibility.isPillarFinished(), false);
assert.equal(eligibility.isAscensionPrestigeAvailable(), false);
pillar.game.global.pillars.human = 3;
assert.equal(eligibility.isPillarFinished(), false);
pillar.game.global.pillars.human = 4;
assert.equal(eligibility.isPillarFinished(), true);
assert.equal(eligibility.isAscensionPrestigeAvailable(), true);
pillar.buildings.SiriusAscend.isUnlocked = () => false;
assert.equal(eligibility.isAscensionPrestigeAvailable(), false);
pillar.settings.prestigeAscensionPillar = false;
assert.equal(eligibility.isPillarFinished(), true);
pillar.settings.prestigeAscensionPillar = true;
pillar.game.global.pillars.human = 0;
pillar.game.global.race.universe = "micro";
assert.equal(eligibility.isPillarFinished(), true);

const witch = makeContext();
witch.settings.prestigeAscensionPillar = false;
eligibility = use(witch);
assert.equal(eligibility.isWitchAscensionPrestigeAvailable(), true);
assert.equal(eligibility.isWitchAscensionPrestigeAvailable(true), false);
witch.researched.set("forbidden", 5);
assert.equal(eligibility.isWitchAscensionPrestigeAvailable(true), true);
witch.game.global.race.fasting = true;
assert.equal(eligibility.isWitchAscensionPrestigeAvailable(true), false);
witch.researched.set("dish", 2);
assert.equal(eligibility.isWitchAscensionPrestigeAvailable(true), true);
witch.buildings.PitSoulCapacitor.instance.energy--;
assert.equal(eligibility.isWitchAscensionPrestigeAvailable(), false);

const demonic = makeContext();
eligibility = use(demonic);
assert.equal(eligibility.isDemonicPrestigeAvailable(), true);
demonic.settings.autoMech = true;
demonic.MechManager.mechsPotential = 0.6;
assert.equal(eligibility.isDemonicPrestigeAvailable(), false);
demonic.MechManager.mechsPotential = 0.5;
demonic.MechManager.isActive = true;
demonic.settings.prestigeDemonicPotential = 0;
assert.equal(eligibility.isDemonicPrestigeAvailable(), false);
demonic.settings.autoMech = false;
demonic.buildings.SpireTower.count = 75;
assert.equal(eligibility.isDemonicPrestigeAvailable(), true);
demonic.buildings.SpireTower.count = 76;
demonic.game.global.race.fasting = true;
demonic.techIds["tech-final_ingredient"] = tech({ unlocked: true });
assert.equal(eligibility.isDemonicPrestigeAvailable(), false);

console.log("Prestige eligibility bundled characterization tests passed");
