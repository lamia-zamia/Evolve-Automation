import assert from "node:assert/strict";

import { createBuildingSettingsEvolveAdapter } from "../src/adapters/evolve/progression/build/building-settings.ts";

function makeBuilding({
  id,
  name,
  tab,
  smart = false,
  switchable = false,
  values = {},
}) {
  return {
    _vueBinding: id,
    name,
    _tab: tab,
    is: { smart, knowledge: Boolean(values.knowledge) },
    autoBuildEnabled: values.autoBuild ?? false,
    autoStateEnabled: values.autoPower ?? false,
    _weighting: values.weighting ?? 1,
    _autoMax: values.max ?? 0,
    powered: values.powered ?? false,
    cost: values.cost ?? {},
    isSwitchable: () => switchable,
  };
}

const city = makeBuilding({
  id: "city",
  name: "City",
  tab: "city",
  switchable: true,
  values: { autoBuild: true, weighting: 2, max: 5, powered: 2 },
});
const transport = makeBuilding({
  id: "transport",
  name: "Lake Transport",
  tab: "space",
  smart: true,
  switchable: true,
  values: { cost: { Iron: 5 } },
});
const bireme = makeBuilding({
  id: "bireme",
  name: "Lake Bireme",
  tab: "space",
  smart: true,
});
const eden = makeBuilding({
  id: "eden",
  name: "Eden",
  tab: "eden",
  smart: true,
  values: { knowledge: true },
});
const buildings = { city, transport, bireme, eden };
const settingsRaw = {
  overrides: { bld_s_city: true },
  buildingEnabledAll: true,
  buildingStateAll: false,
};
const manager = {
  priorityList: [city, transport, bireme, eden],
  sortByPriority: () => trace.push("sort"),
};
const trace = [];
const checkCompare = {
  ">": (left, right) => left > right,
  "==": (left, right) => left === right,
};
const resources = { Iron: { title: "Iron" } };
const adapter = createBuildingSettingsEvolveAdapter({
  getBuildingManager: () => manager,
  getBuildingIds: () => buildings,
  getResources: () => resources,
  getLinkedBuildings: () => [[transport, bireme]],
  getCheckCompare: () => checkCompare,
  getOverrideKey: () => "ctrlKey",
  getRealNumber: () => (value) => Number(value),
  getInitBuildingState: () => () => trace.push("init"),
  getSettingsRaw: () => settingsRaw,
});

const model = adapter.readBuildingSettingsReadModel();
assert.equal(model.controls.length, 9);
assert.equal(model.rows.length, 4);
assert.deepEqual(
  model.rows.map((row) => [row.id, row.color]),
  [
    ["city", "has-text-info"],
    ["transport", "has-text-danger"],
    ["bireme", "has-text-danger"],
    ["eden", "has-text-advanced"],
  ],
);
assert.deepEqual(model.rows[0].stateSettingName, "bld_s_city");
assert.equal(model.rows[0].hasStateOverride, true);
assert.deepEqual(model.rows[1].smartLinkedIds, ["transport", "bireme"]);
assert.equal(model.rows[3].smartSettingName, "bld_s2_eden");
assert.equal(model.allEnabled, true);
assert.equal(model.allState, false);

assert.equal(adapter.filterBuildingSettings("POWERED>1").join(","), "city");
assert.equal(adapter.filterBuildingSettings("KNOW==TRUE").join(","), "eden");
assert.equal(adapter.filterBuildingSettings("IRON>3").join(","), "transport");
assert.equal(adapter.filterBuildingSettings("city"), undefined);

adapter.reorderBuildings(["eden", "city"]);
assert.equal(settingsRaw.bld_p_eden, 0);
assert.equal(settingsRaw.bld_p_city, 1);
assert.deepEqual(trace, ["sort"]);
adapter.resetPriorities();
assert.equal(settingsRaw.bld_p_city, 0);
assert.deepEqual(trace, ["sort", "init"]);
adapter.setAllAutoBuild(false);
assert.equal(settingsRaw.buildingEnabledAll, false);
assert.equal(settingsRaw.batcity, false);
adapter.setAllAutoPower(true);
assert.equal(settingsRaw.buildingStateAll, true);
assert.equal(settingsRaw.bld_s_city, true);
adapter.setLinkedSmartState(["transport", "bireme"], false);
assert.equal(settingsRaw.bld_s2_transport, false);
assert.equal(settingsRaw.bld_s2_bireme, false);

assert.throws(
  () =>
    createBuildingSettingsEvolveAdapter({
      getBuildingManager: () => ({ priorityList: [{}] }),
      getBuildingIds: () => buildings,
      getResources: () => resources,
      getLinkedBuildings: () => [],
      getCheckCompare: () => checkCompare,
      getOverrideKey: () => "ctrlKey",
      getRealNumber: () => (value) => Number(value),
      getInitBuildingState: () => () => {},
      getSettingsRaw: () => ({ overrides: {} }),
    }).readBuildingSettingsReadModel(),
  /_vueBinding must be a string/,
);

console.log("Building settings Evolve adapter tests passed");
