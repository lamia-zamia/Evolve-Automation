import assert from "node:assert/strict";

import { createOverrideOperandReaders } from "../src/settings/override-operand-readers.ts";

const farm = {
  cost: { Money: 10, Lumber: 0 },
  count: 3,
  stateOnCount: 2,
  stateOffCount: 1,
  isUnlocked: () => true,
  isClickable: () => false,
  isAffordable: (checkStorageCaps) => checkStorageCaps === true,
};

const context = {
  settings: { example: 7, prestigeType: "bioseed" },
  settingsRaw: { example: 3, evolutionQueue: ["a", "b"] },
  state: { queuedTargetsAll: [farm], knowledgeRequiredByTechs: 1234 },
  game: {
    global: {
      race: {
        species: "human",
        gods: "elven",
        srace: undefined,
        universe: "standard",
        kindling_kindred: 2,
        junker: 1,
        orbit_decay: 500,
      },
      city: {
        biome: "grassland",
        ptrait: ["toxic", "mellow"],
        calendar: { day: 12, year: 4 },
      },
      civic: { govern: { type: "democracy" } },
      stats: { days: 400 },
      pillars: { human: 3 },
      portal: { carport: { damaged: 2 } },
      space: { m_relay: { charged: 5000 }, shipyard: { ships: [1, 2, 3] } },
      queue: { queue: ["one"] },
      r_queue: { queue: [] },
    },
    races: { human: { name: "Human" }, entish: { name: "Entish" } },
    alevel: () => 4,
  },
  buildingIds: { "city-farm": farm },
  buildings: { SunSwarmSatellite: { cost: { Money: 42 } } },
  resources: {
    Food: {
      currentQuantity: 50,
      maxQuantity: 200,
      maxCost: 80,
      rateOfChange: 1.5,
      storageRatio: 0.25,
      usefulRatio: 0.5,
      isUnlocked: () => true,
      isDemanded: () => false,
    },
  },
  techIds: {
    "tech-mad": { isUnlocked: () => true, isResearched: () => false },
  },
  arpaIds: {
    arpalaunch_facility: {
      count: 1,
      progress: 55,
      isUnlocked: () => true,
    },
  },
  jobIds: {
    farmer: {
      count: 9,
      max: 12,
      workers: 7,
      servants: 2,
      isUnlocked: () => true,
    },
  },
  races: { human: { genus: "humanoid" } },
  smelter: { maxOperating: () => 6 },
  factory: { maxOperating: () => 8 },
  war: { workers: 20, crew: 5 },
  fastEval: (source) => `eval:${source}`,
  governor: () => "bureaucrat",
};

const read = createOverrideOperandReaders({
  readSettings: () => context.settings,
  readSettingsRaw: () => context.settingsRaw,
  readState: () => context.state,
  readGame: () => context.game,
  readBuildingIds: () => context.buildingIds,
  readBuildings: () => context.buildings,
  readResources: () => context.resources,
  readTechIds: () => context.techIds,
  readArpaIds: () => context.arpaIds,
  readJobIds: () => context.jobIds,
  readRaces: () => context.races,
  readSmelterManager: () => context.smelter,
  readFactoryManager: () => context.factory,
  readWarManager: () => context.war,
  readFastEval: () => context.fastEval,
  readGovernor: () => context.governor,
});

// Primitives are stored verbatim by the editor and returned unchanged.
assert.equal(read.String("text"), "text");
assert.equal(read.Number(12), 12);
assert.equal(read.Boolean(false), false);

// A setting the script does not define reads as undefined rather than failing the condition.
assert.equal(read.SettingDefault("example"), 3);
assert.equal(read.SettingCurrent("example"), 7);
assert.equal(read.SettingCurrent("nosuchsetting"), undefined);

// Custom expressions stay behind the injected evaluator, which is only ever handed a string.
assert.equal(read.Eval("x + 1"), "eval:x + 1");
assert.equal(read.Eval(5), "eval:5");

assert.equal(read.BuildingCost("city-farm.Money"), 10);
// A resource the building does not cost reads as zero, not undefined.
assert.equal(read.BuildingCost("city-farm.Soul_Gem"), 0);
assert.equal(read.BuildingUnlocked("city-farm"), true);
assert.equal(read.BuildingClickable("city-farm"), false);
// isAffordable is asked about storage caps, not the current stock.
assert.equal(read.BuildingAffordable("city-farm"), true);
assert.equal(read.BuildingCount("city-farm"), 3);
assert.equal(read.BuildingEnabled("city-farm"), 2);
assert.equal(read.BuildingDisabled("city-farm"), 1);
assert.equal(read.BuildingQueued("city-farm"), true);

// An argument that names nothing is a broken condition, and every keyed bag says which kind.
assert.throws(
  () => read.BuildingCount("city-nosuch"),
  /building city-nosuch not found/,
);
assert.throws(
  () => read.BuildingCost("city-nosuch.Money"),
  /building city-nosuch not found/,
);
// BuildingQueued used to answer false for a misspelled building; it now fails like its siblings.
assert.throws(
  () => read.BuildingQueued("city-nosuch"),
  /building city-nosuch not found/,
);
assert.throws(() => read.BuildingCount(7), /building 7 not found/);
assert.throws(
  () => read.ProjectCount("arpanosuch"),
  /project arpanosuch not found/,
);
assert.throws(() => read.JobCount("nosuch"), /job nosuch not found/);
assert.throws(
  () => read.ResearchComplete("tech-nosuch"),
  /research tech-nosuch not found/,
);
assert.throws(
  () => read.ResourceQuantity("Nosuch"),
  /resource Nosuch not found/,
);

assert.equal(read.ProjectUnlocked("arpalaunch_facility"), true);
assert.equal(read.ProjectCount("arpalaunch_facility"), 1);
assert.equal(read.ProjectProgress("arpalaunch_facility"), 55);

assert.equal(read.JobUnlocked("farmer"), true);
assert.equal(read.JobCount("farmer"), 9);
assert.equal(read.JobMax("farmer"), 12);
assert.equal(read.JobWorkers("farmer"), 7);
assert.equal(read.JobServants("farmer"), 2);

assert.equal(read.ResearchUnlocked("tech-mad"), true);
assert.equal(read.ResearchComplete("tech-mad"), false);

assert.equal(read.ResourceUnlocked("Food"), true);
assert.equal(read.ResourceQuantity("Food"), 50);
assert.equal(read.ResourceStorage("Food"), 200);
assert.equal(read.ResourceMaxCost("Food"), 80);
assert.equal(read.ResourceIncome("Food"), 1.5);
assert.equal(read.ResourceRatio("Food"), 0.25);
assert.equal(read.ResourceSatisfied("Food"), false);
assert.equal(read.ResourceSatisfyRatio("Food"), 0.5);
assert.equal(read.ResourceDemanded("Food"), false);

// Race arguments either name a slot on the race state or are a literal race id.
assert.equal(read.RaceId("species"), "human");
assert.equal(read.RaceId("gods"), "elven");
assert.equal(read.RaceId("old_gods"), undefined);
assert.equal(read.RaceId("srace"), "protoplasm");
assert.equal(read.RaceId("entish"), "entish");
assert.equal(read.RacePillared("species"), false);
assert.equal(read.RacePillared("old_gods"), false);
context.game.global.pillars.human = 4;
assert.equal(read.RacePillared("species"), true);
assert.equal(read.RaceGenus("humanoid"), true);
assert.equal(read.RaceGenus("plant"), false);
// The script's race list has no entry while still a protoplasm, so no genus matches.
context.game.global.race.species = "protoplasm";
assert.equal(read.RaceGenus("humanoid"), false);
context.game.global.race.species = "human";
assert.equal(read.MimicGenus("none"), true);
context.game.global.race.ss_genus = "fungi";
assert.equal(read.MimicGenus("fungi"), true);
assert.equal(read.TraitLevel("kindling_kindred"), 2);
assert.equal(read.TraitLevel("nosuchtrait"), 0);

assert.equal(read.ResetType("bioseed"), true);
assert.equal(read.ResetType("mad"), false);
// A challenge is a trait level, reported as a plain boolean.
assert.equal(read.Challenge("junker"), true);
assert.equal(read.Challenge("cataclysm"), false);
assert.equal(read.Universe("standard"), true);
assert.equal(read.Government("democracy"), true);
assert.equal(read.Governor("bureaucrat"), true);
assert.equal(read.Governor("none"), false);

assert.equal(read.Queue("queue"), 1);
assert.equal(read.Queue("r_queue"), 0);
assert.equal(read.Queue("evo"), 2);
assert.throws(() => read.Queue("nosuch"), /queue nosuch not found/);

assert.equal(read.Date("day"), 12);
assert.equal(read.Date("year"), 4);
assert.equal(read.Date("total"), 400);
// Impact counts down to the moon strike, and reports -1 when the run has no decaying orbit.
assert.equal(read.Date("impact"), 100);
context.game.global.race.orbit_decay = 0;
assert.equal(read.Date("impact"), -1);
context.game.global.race.orbit_decay = "soon";
assert.ok(Number.isNaN(read.Date("impact")));
context.game.global.race.orbit_decay = 500;

assert.equal(read.Soldiers("crew"), 5);
assert.equal(read.Soldiers("nosuchcount"), undefined);
assert.equal(read.PlanetBiome("grassland"), true);
assert.equal(read.PlanetTrait("toxic"), true);
assert.equal(read.PlanetTrait("dense"), false);

assert.equal(read.Industry("smelters"), 6);
assert.equal(read.Industry("factories"), 8);
assert.equal(read.Industry(11), 11);

assert.equal(read.Other("rname"), "Human");
assert.equal(read.Other("tpfleet"), 3);
assert.equal(read.Other("mrelay"), 0.5);
assert.equal(read.Other("satcost"), 42);
assert.equal(read.Other("bcar"), 2);
// alevel counts the standard universe as one level, so active challenges is one less.
assert.equal(read.Other("alevel"), 3);
assert.equal(read.Other("tknow"), 1234);
assert.equal(read.Other("something else"), "something else");

// While evolving, the race name is the one picked at the end of the evolution menu.
context.game.global.race.species = "protoplasm";
context.game.global.race.evoFinalMenu = "entish";
assert.equal(read.Other("rname"), "Entish");
context.game.global.race.evoFinalMenu = undefined;
assert.throws(() => read.Other("rname"), /race protoplasm not found/);
context.game.global.race.species = "human";

// The optional parts of the game state are the ones the game genuinely leaves out.
context.game.global.space = {};
assert.equal(read.Other("tpfleet"), 0);
assert.ok(Number.isNaN(read.Other("mrelay")));
context.game.global.portal = {};
assert.equal(read.Other("bcar"), 0);
context.game.global.civic = {};
assert.equal(read.Government("democracy"), false);

// Unlike the editor's `list` inputs, every reader resolves its bag on each read, so a bag the game
// replaces wholesale is still seen.
context.buildingIds = { "city-farm": { ...farm, count: 99 } };
context.settings = { ...context.settings, example: 13 };
assert.equal(read.BuildingCount("city-farm"), 99);
assert.equal(read.SettingCurrent("example"), 13);

console.log("Override operand reader tests passed");
