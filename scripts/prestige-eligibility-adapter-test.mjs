import assert from "node:assert/strict";

import {
  readAscensionEligibilityView,
  readGeckEligibilityView,
  readPillarEligibilityView,
  readPrestigeEligibilityView,
  readPrestigePermissionView,
  readWitchAscensionEligibilityView,
} from "../src/adapters/evolve/prestige-eligibility.ts";
import {
  isAscensionPrestigeAvailable,
  isDemonicPrestigeAvailable,
  isWitchAscensionPrestigeAvailable,
} from "../src/domain/prestige-eligibility.ts";

function tech(unlocked = false, affordable = false) {
  const value = {
    isUnlocked() {
      assert.equal(this, value);
      return unlocked;
    },
    isAffordable() {
      assert.equal(this, value);
      return affordable;
    },
  };
  return value;
}

function makeInput() {
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
      alevel() {
        assert.equal(this, input.game);
        return 4;
      },
      global: {
        settings: { at: 0 },
        race: { species: "human", universe: "standard" },
        pillars: { human: 4 },
        interstellar: { stellar_engine: { mass: 10, exotic: 2 } },
      },
    },
    resources: { Harmony: { currentQuantity: 1 } },
    buildings: {
      GasSpaceDock: { count: 1 },
      GasSpaceDockShipSegment: { count: 100 },
      GasSpaceDockProbe: { count: 25 },
      GasSpaceDockGECK: { count: 1 },
      SiriusAscend: { isUnlocked: () => true },
      PitAbsorptionChamber: { count: 100 },
      PitSoulCapacitor: { instance: { energy: 100_000_000 } },
      SpireTower: { count: 75 },
    },
    techIds: {
      "tech-dial_it_to_11": tech(true),
      "tech-exotic_infusion": tech(true),
      "tech-infusion_check": tech(),
      "tech-infusion_confirm": tech(),
      "tech-protocol66": tech(true),
      "tech-protocol66a": tech(),
      "tech-demonic_infusion": tech(true, true),
      "tech-final_ingredient": tech(true, true),
    },
    mech: { isActive: false, mechsPotential: 0.5 },
  };
}

let input = makeInput();
const ready = readPrestigeEligibilityView(
  input.settings,
  input.game,
  input.resources,
  input.buildings,
  input.techIds,
  input.mech,
  (id, level) => id === "forbidden" && level === 5,
  (id, level, universe) =>
    id === "lamentis" && level === 5 && universe === "standard",
);
assert.equal(ready.status, "ready");
assert.equal(ready.view.game.speciesPillarLevel, 4);
assert.equal(ready.view.game.blackholeMass, 10);
assert.equal(ready.view.buildings.spireFloor, 75);
assert.equal(ready.view.tech.forbiddenLevelFive, true);
assert.equal(ready.view.achievement.lamentisStandardFive, true);
assert.ok(Object.isFrozen(ready));
assert.ok(Object.isFrozen(ready.view));
for (const value of Object.values(ready.view))
  assert.ok(Object.isFrozen(value));

assert.deepEqual(
  readPrestigePermissionView(input.settings, {
    global: { settings: { at: 0 } },
  }),
  {
    status: "ready",
    view: {
      settings: {
        autoPrestige: true,
        waitForArpa: false,
        selectedType: "bioseed",
      },
      game: { activeArpaProjects: 0 },
    },
  },
);
assert.equal(
  readPillarEligibilityView(input.settings, input.game, input.resources).status,
  "ready",
);
assert.deepEqual(
  readGeckEligibilityView(input.settings, input.buildings, () => true),
  {
    status: "ready",
    view: {
      settings: { requiredGecks: 1 },
      buildings: { gecks: 1 },
      achievement: { lamentisStandardFive: true },
    },
  },
);

input = makeInput();
input.settings.prestigeAscensionPillar = false;
delete input.buildings.PitSoulCapacitor.instance;
const ascension = readAscensionEligibilityView(
  input.settings,
  input.game,
  input.resources,
  input.buildings,
);
assert.equal(ascension.status, "ready");
assert.equal(isAscensionPrestigeAvailable(ascension.view), true);

input = makeInput();
input.settings.prestigeAscensionPillar = false;
delete input.buildings.SiriusAscend;
const witchAscension = readWitchAscensionEligibilityView(
  input.settings,
  input.game,
  input.resources,
  input.buildings,
  false,
  () => {
    throw new Error("non-demonic Witch Ascension must not query tech");
  },
);
assert.equal(witchAscension.status, "ready");
assert.equal(isWitchAscensionPrestigeAvailable(witchAscension.view), true);

// Regression: a demonic-infusion run never builds the Soul Capacitor (game
// tech reqs `forbidden:2`, witch-hunter only, while demonic_infusion is
// not_trait witch_hunter), so PitSoulCapacitor has no live instance. The
// monolithic read must still succeed — no monolith consumer reads
// soulCapacitorEnergy — so demonic eligibility can be evaluated.
input = makeInput();
input.settings.prestigeType = "demonic";
delete input.buildings.PitSoulCapacitor.instance;
const demonicNoCapacitor = readPrestigeEligibilityView(
  input.settings,
  input.game,
  input.resources,
  input.buildings,
  input.techIds,
  input.mech,
  () => false,
  () => false,
);
assert.equal(demonicNoCapacitor.status, "ready");
assert.equal(demonicNoCapacitor.view.buildings.soulCapacitorEnergy, 0);
assert.equal(isDemonicPrestigeAvailable(demonicNoCapacitor.view), true);

input = makeInput();
input.game.global.interstellar.stellar_engine = { mass: undefined, exotic: 2 };
assert.deepEqual(
  readPrestigeEligibilityView(
    input.settings,
    input.game,
    input.resources,
    input.buildings,
    input.techIds,
    input.mech,
    () => false,
    () => false,
  ),
  {
    status: "unavailable",
    reason: "invalid-game-state",
    field: "stellar_engine",
  },
);

input = makeInput();
delete input.techIds["tech-protocol66"];
assert.deepEqual(
  readPrestigeEligibilityView(
    input.settings,
    input.game,
    input.resources,
    input.buildings,
    input.techIds,
    input.mech,
    () => false,
    () => false,
  ),
  { status: "unavailable", reason: "invalid-tech", field: "tech-protocol66" },
);

input = makeInput();
input.settings.prestigeDemonicFloor = -1;
assert.deepEqual(
  readPrestigeEligibilityView(
    input.settings,
    input.game,
    input.resources,
    input.buildings,
    input.techIds,
    input.mech,
    () => false,
    () => false,
  ),
  {
    status: "unavailable",
    reason: "invalid-settings",
    field: "minimumSpireFloor",
  },
);

// External legacy queries return falsy non-booleans (haveTech gives `undefined`
// when a tech tree was never touched — a demonic-infusion run has no
// forbidden/dish techs). The reader coerces them the way legacy consumed them
// truthily instead of failing the whole read.
input = makeInput();
const coercedExternals = readPrestigeEligibilityView(
  input.settings,
  input.game,
  input.resources,
  input.buildings,
  input.techIds,
  input.mech,
  () => undefined,
  () => undefined,
);
assert.equal(coercedExternals.status, "ready");
assert.equal(coercedExternals.view.tech.forbiddenLevelFive, false);
assert.equal(coercedExternals.view.tech.dishLevelTwo, false);
assert.equal(coercedExternals.view.achievement.lamentisStandardFive, false);

input = makeInput();
const hostile = new Proxy(input.game, {
  get() {
    throw new Error("hostile game getter");
  },
});
assert.deepEqual(
  readPrestigeEligibilityView(
    input.settings,
    hostile,
    input.resources,
    input.buildings,
    input.techIds,
    input.mech,
    () => false,
    () => false,
  ),
  { status: "unavailable", reason: "inaccessible-data" },
);

console.log("Prestige eligibility Evolve adapter contract tests passed");
