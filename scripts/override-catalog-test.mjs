import assert from "node:assert/strict";

import { createOverrideCatalog } from "../src/settings/override-catalog.ts";

let settingsRaw = { example: 3 };
let settings = { example: 7 };
let buildingIds = {
  farm: {
    cost: { Money: 10 },
    name: "Farm",
    _vueBinding: "farm",
    count: 2,
    stateOnCount: 1,
    isUnlocked: () => true,
    isAvailable: () => true,
    isAffordable: () => true,
  },
};
const context = {
  settings,
  settingsRaw,
  state: { queuedTargetsAll: [], knowledgeRequiredByTechs: 0 },
  game: { traits: {}, races: {}, global: { race: {}, space: {} } },
  buildingIds,
  buildings: { SunSwarmSatellite: { cost: { Money: 0 } } },
  resources: {},
  techIds: {},
  arpaIds: {},
  jobIds: {},
  races: {},
  GovernmentManager: { Types: {} },
  SmelterManager: { maxOperating: () => 0 },
  FactoryManager: { maxOperating: () => 0 },
  WarManager: {},
  universes: [],
  governors: [],
  challenges: [],
  biomeList: [],
  traitList: [],
  buildSelectOptions: (items) =>
    items.map((item) => `<option>${item.label}</option>`).join(""),
  fastEval: (source) => `eval:${source}`,
  getGovernor: () => "none",
};

const catalog = createOverrideCatalog({
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
  readGovernmentManager: () => context.GovernmentManager,
  readSmelterManager: () => context.SmelterManager,
  readFactoryManager: () => context.FactoryManager,
  readWarManager: () => context.WarManager,
  readUniverses: () => context.universes,
  readGovernors: () => context.governors,
  readChallenges: () => context.challenges,
  readBiomeList: () => context.biomeList,
  readTraitList: () => context.traitList,
  readBuildSelectOptions: () => context.buildSelectOptions,
  readFastEval: () => context.fastEval,
  readGovernor: () => context.getGovernor,
});
assert.match(catalog.prestigeOptions, /Mutual Assured Destruction/);
assert.equal(catalog.checkCompare[">="](4, 3), true);
assert.equal(catalog.checkTypes.SettingDefault.fn("example"), 3);
assert.equal(catalog.checkTypes.SettingCurrent.fn("example"), 7);
assert.equal(catalog.checkTypes.BuildingCount.fn("farm"), 2);
assert.equal(catalog.checkTypes.Eval.fn("x + 1"), "eval:x + 1");
assert.ok(Number.isNaN(catalog.checkTypes.Other.fn("mrelay")));
context.game = {
  ...context.game,
  global: {
    ...context.game.global,
    space: { m_relay: { charged: 5000 } },
  },
};
assert.equal(catalog.checkTypes.Other.fn("mrelay"), 0.5);
context.game = {
  ...context.game,
  global: { ...context.game.global, civic: {} },
};
assert.equal(catalog.checkTypes.Government.fn("democracy"), false);

settingsRaw = { example: 11 };
settings = { example: 13 };
buildingIds = { ...buildingIds, farm: { ...buildingIds.farm, count: 9 } };
context.settingsRaw = settingsRaw;
context.settings = settings;
context.buildingIds = buildingIds;
assert.equal(catalog.checkTypes.SettingDefault.fn("example"), 11);
assert.equal(catalog.checkTypes.SettingCurrent.fn("example"), 13);
assert.equal(catalog.checkTypes.BuildingCount.fn("farm"), 9);
assert.ok(catalog.retBools.includes("BuildingUnlocked"));
assert.deepEqual(catalog.overrideOnlyChecks, ["String", "Number", "RaceId"]);

console.log("Override catalog module tests passed");
