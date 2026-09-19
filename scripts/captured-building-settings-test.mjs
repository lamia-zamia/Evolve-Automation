import assert from "node:assert/strict";

import { createCapturedBuildingSettingsAdapter } from "../src/adapters/evolve/progression/build/captured-building-settings.ts";
import { createCapturedBuildingToggleReader } from "../src/adapters/evolve/progression/build/captured-building-toggles.ts";
import { overrideComparisons } from "../src/settings/override-comparators.ts";
import {
  createCapturedControls,
  createCapturedRootState,
} from "./test-support/captured-settings.mjs";

function makeCapturedGame() {
  const root = {
    city: {
      food: { count: 2 },
      farm: { count: 4 },
      factory: { count: 3, on: 2 },
      mill: { count: 1, on: 1 },
      university: { count: 1, on: 1 },
    },
    portal: {
      transport: { count: 2, on: 1 },
      bireme: { count: 1, on: 1 },
    },
    resource: {
      Money: { title: "Money" },
      Food: { title: "Food" },
    },
  };
  const controlsById = new Map([
    ["buildQueue", { elementId: "buildQueue", generation: 1, methods: [] }],
    [
      "undefined-food",
      {
        elementId: "undefined-food",
        generation: 1,
        methods: [],
        data: { title: "Food", act: root.city.food },
      },
    ],
    [
      "city-farm",
      {
        elementId: "city-farm",
        generation: 1,
        methods: [],
        data: { title: "Farm", act: root.city.farm },
      },
    ],
    [
      "city-factory",
      {
        elementId: "city-factory",
        generation: 1,
        methods: [],
        data: { title: "Factory", act: root.city.factory },
      },
    ],
    [
      "city-mill",
      {
        elementId: "city-mill",
        generation: 1,
        methods: [],
        data: { title: "Mill", act: root.city.mill },
      },
    ],
    [
      "city-university",
      {
        elementId: "city-university",
        generation: 1,
        methods: [],
        data: { title: "University", act: root.city.university },
      },
    ],
    [
      "portal-transport",
      {
        elementId: "portal-transport",
        generation: 1,
        methods: [],
        data: { title: "Lake Transport", act: root.portal.transport },
      },
    ],
    [
      "portal-bireme",
      {
        elementId: "portal-bireme",
        generation: 1,
        methods: [],
        data: { title: "Lake Bireme", act: root.portal.bireme },
      },
    ],
  ]);
  const controls = createCapturedControls(controlsById);
  const rootState = createCapturedRootState(() => root);
  return { root, controls, rootState };
}

const game = makeCapturedGame();
let ensureCalls = 0;
const raw = {
  buildingEnabledAll: true,
  buildingStateAll: false,
  "batcity-food": false,
  "batcity-farm": true,
  "batcity-factory": false,
  "batcity-mill": true,
  "batcity-university": true,
  "batportal-transport": true,
  "batportal-bireme": false,
  "bld_s_city-factory": true,
  "bld_s_city-mill": false,
  "bld_s_city-university": true,
  "bld_s_portal-transport": true,
  "bld_s_portal-bireme": false,
  "bld_s2_city-mill": true,
  "bld_s2_portal-transport": false,
  "bld_s2_portal-bireme": false,
  "bld_p_city-factory": 0,
  "bld_p_city-mill": 1,
  "bld_p_city-farm": 2,
  "bld_p_city-food": 3,
  "bld_p_city-university": 4,
  "bld_p_portal-transport": 5,
  "bld_p_portal-bireme": 6,
  "bld_w_city-factory": 2,
  "bld_m_city-factory": 10,
  overrides: {
    "bld_s_city-factory": [{ condition: "Money>0" }],
    "bld_s2_city-mill": [{ condition: "Food>0" }],
  },
};
const adapter = createCapturedBuildingSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
  getOverrideKey: () => "ctrlKey",
  getRealNumber: (value) => Number(value),
  getComparison: (operator) => overrideComparisons[operator],
  ensureControls: () => {
    ensureCalls += 1;
  },
  costs: {
    readCost: (elementId) =>
      elementId === "city-factory"
        ? { cost: { Money: 125 }, pool: undefined }
        : { cost: {}, pool: undefined },
  },
});

const model = adapter.readBuildingSettingsReadModel();
assert.ok(ensureCalls > 0);
assert.deepEqual(
  model.rows.map((row) => row.id),
  [
    "city-factory",
    "city-mill",
    "city-farm",
    "city-food",
    "city-university",
    "portal-transport",
    "portal-bireme",
  ],
);
const factory = model.rows.find((row) => row.id === "city-factory");
assert.deepEqual(
  {
    label: factory.label,
    stateEnabled: factory.stateEnabled,
    hasStateOverride: factory.hasStateOverride,
    hasSmartOverride: factory.hasSmartOverride,
  },
  {
    label: "Factory",
    stateEnabled: true,
    hasStateOverride: true,
    hasSmartOverride: false,
  },
);
const mill = model.rows.find((row) => row.id === "city-mill");
assert.deepEqual(mill.smartLinkedIds, undefined);
assert.equal(mill.smartEnabled, true);
const transport = model.rows.find((row) => row.id === "portal-transport");
assert.deepEqual(transport.smartLinkedIds, [
  "portal-transport",
  "portal-bireme",
]);
assert.equal(
  model.rows.some(
    (row) => row.id === "city-university" && row.smartSettingName,
  ),
  false,
);

// The settings panel reads the raw persisted value. An active override is deliberately not
// allowed to turn the displayed value into the effective runtime value.
assert.equal(raw["bld_s_city-factory"], true);
assert.deepEqual(adapter.filterBuildingSettings("BUILD==ON"), [
  "city-farm",
  "city-mill",
  "city-university",
  "portal-transport",
]);
assert.deepEqual(adapter.filterBuildingSettings("KNOWLEDGE==ON"), [
  "city-university",
]);
assert.deepEqual(adapter.filterBuildingSettings("MONEY>100"), ["city-factory"]);

adapter.resetPriorities();
assert.equal(raw["bld_p_city-factory"], 2);
assert.equal(raw["bld_p_portal-bireme"], 6);
adapter.reorderBuildings(["portal-bireme", "city-factory", "not-captured"]);
assert.equal(raw["bld_p_portal-bireme"], 0);
assert.equal(raw["bld_p_city-factory"], 1);
assert.equal(raw["bld_p_not-captured"], undefined);

adapter.setAllAutoBuild(false);
assert.equal(raw.buildingEnabledAll, false);
assert.equal(raw["batcity-factory"], false);
adapter.setAllAutoPower(true);
assert.equal(raw.buildingStateAll, true);
assert.equal(raw["bld_s_city-factory"], true);
assert.equal(raw["bld_s_city-food"], undefined);
adapter.setLinkedSmartState(["portal-transport", "portal-bireme"], true);
assert.equal(raw["bld_s2_portal-transport"], true);
assert.equal(raw["bld_s2_portal-bireme"], true);

const visibleElements = new Set([
  "mTabCivil",
  "undefined-food",
  "city-factory",
  "portal-transport",
]);
const toggleReader = createCapturedBuildingToggleReader({
  rootState: game.rootState,
  controls: game.controls,
  getDocument: () => ({
    getElementById: (id) => (visibleElements.has(id) ? {} : null),
  }),
  getSettingsRaw: () => raw,
});
assert.equal(toggleReader.readVisible(), true);
assert.deepEqual(toggleReader.readItems(), [
  {
    binding: "city-food",
    elementId: "undefined-food",
    settingKey: "batcity-food",
    enabled: false,
  },
  {
    binding: "city-factory",
    elementId: "city-factory",
    settingKey: "batcity-factory",
    enabled: false,
  },
  {
    binding: "portal-transport",
    elementId: "portal-transport",
    settingKey: "batportal-transport",
    enabled: false,
  },
]);

console.log("captured building settings ok");
