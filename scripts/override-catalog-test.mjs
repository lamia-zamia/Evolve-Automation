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

const catalog = createOverrideCatalog({ getContext: () => context });
assert.match(catalog.prestigeOptions, /Mutual Assured Destruction/);
assert.equal(catalog.checkCompare[">="](4, 3), true);
assert.equal(catalog.checkTypes.SettingDefault.fn("example"), 3);
assert.equal(catalog.checkTypes.SettingCurrent.fn("example"), 7);
assert.equal(catalog.checkTypes.BuildingCount.fn("farm"), 2);
assert.equal(catalog.checkTypes.Eval.fn("x + 1"), "eval:x + 1");

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
