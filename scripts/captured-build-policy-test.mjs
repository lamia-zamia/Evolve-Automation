import assert from "node:assert/strict";
import { createCapturedBuildPolicyReader } from "../src/adapters/evolve/progression/build/captured-build-policy.ts";

const skipped = [];
const settings = {
  "batcity-farm": true,
  "bld_w_city-farm": 37,
  "bld_m_city-farm": 12,
  "batcity-cottage": true,
  "bld_w_city-cottage": 37,
  buildingWeightingNonOperatingCity: 0.2,
  buildingWeightingNew: 3,
  "batcity-lumber": false,
  "batcity-bad": true,
  "bld_w_city-bad": "not-a-number",
  buildingConsumptionCheck: "perResource",
  buildingBuildIfStorageFull: true,
  buildingsIgnoreZeroRate: true,
  prestigeType: "whitehole",
  prestigeWhiteholeSaveGems: true,
};
const reader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({
      city: {
        farm: { count: 2 },
        cottage: { count: 0 },
        bad: {},
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [
      "city-farm",
      "city-cottage",
      "city-lumber",
      "city-bad",
      "arpa-monument",
    ],
  },
  getSettings: () => settings,
  onSkipped: (key, reason) => skipped.push({ key, reason }),
});

assert.deepEqual(reader(), {
  buildings: [
    {
      key: "city-farm",
      elementId: "city-farm",
      region: "city",
      id: "farm",
      weighting: 37,
      maximum: 12,
      important: false,
    },
    {
      key: "city-cottage",
      elementId: "city-cottage",
      region: "city",
      id: "cottage",
      weighting: 111,
      maximum: Number.MAX_SAFE_INTEGER,
      important: false,
    },
  ],
  consumptionMode: "perResource",
  buildIfStorageFull: true,
  ignoreZeroRate: true,
  respectReservations: true,
  saveWhiteholeGems: true,
});
assert.deepEqual(skipped, [
  { key: "city-bad", reason: "configured weighting is not finite" },
]);

const neutralMissingMultiplierReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({ city: { farm: { count: 0 } } }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => ["city-farm"],
  },
  getSettings: () => ({
    "batcity-farm": true,
    "bld_w_city-farm": 7,
  }),
});
assert.equal(
  neutralMissingMultiplierReader().buildings[0].weighting,
  7,
  "an absent new-building multiplier is neutral",
);

const absentSettingsReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({ city: { farm: { count: 2 } } }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => ["city-farm"],
  },
  getSettings: () => undefined,
});
assert.deepEqual(absentSettingsReader().buildings, []);

const nonOperatingReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({
      city: {
        powered: { count: 3, on: 1 },
        mill: { count: 3, on: 1 },
        banquet: { count: 3, on: 1 },
        stable: { count: 3, on: 3 },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [
      "city-powered",
      "city-mill",
      "city-banquet",
      "city-stable",
    ],
  },
  getSettings: () => ({
    "batcity-powered": true,
    "batcity-mill": true,
    "batcity-banquet": true,
    "batcity-stable": true,
    "bld_w_city-powered": 10,
    "bld_w_city-mill": 10,
    "bld_w_city-banquet": 10,
    "bld_w_city-stable": 10,
    buildingWeightingNonOperatingCity: 0.2,
  }),
});
const nonOperating = nonOperatingReader().buildings;
assert.equal(nonOperating[0].weighting, 2);
assert.equal(nonOperating[1].weighting, 10);
assert.equal(nonOperating[2].weighting, 10);
assert.equal(nonOperating[3].weighting, 10);

const storageSettings = {
  "batcity-storage_yard": true,
  "batcity-warehouse": true,
  "batcity-shed": true,
  "bld_w_city-storage_yard": 10,
  "bld_w_city-warehouse": 10,
  "bld_w_city-shed": 10,
  buildingWeightingCrateUseless: 0.1,
  buildingWeightingNeedStorage: 2,
};
let storageRoot = {
  city: {
    storage_yard: { count: 1 },
    warehouse: { count: 1 },
    shed: { count: 1 },
  },
  resource: {
    Crates: { amount: 2, max: 10, display: true },
    Containers: { amount: 10, max: 10, display: true },
  },
};
const storageReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => storageRoot,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [
      "city-storage_yard",
      "city-warehouse",
      "city-shed",
    ],
  },
  getSettings: () => storageSettings,
});
assert.deepEqual(
  storageReader().buildings.map(({ id, weighting }) => ({ id, weighting })),
  [
    { id: "storage_yard", weighting: 1 },
    { id: "warehouse", weighting: 1 },
    { id: "shed", weighting: 10 },
  ],
  "a deficit in either storage pool makes both storage buildings useful",
);

storageRoot = {
  city: {
    storage_yard: { count: 1 },
    warehouse: { count: 1 },
    shed: { count: 1 },
  },
  resource: {
    Crates: { amount: 10, max: 10, display: true },
    Containers: { amount: 10, max: 10, display: true },
  },
};
assert.deepEqual(
  storageReader().buildings.map(({ id, weighting }) => ({ id, weighting })),
  [
    { id: "storage_yard", weighting: 10 },
    { id: "warehouse", weighting: 10 },
    { id: "shed", weighting: 20 },
  ],
  "full storage leaves storage buildings at base weight and favors the shed",
);

storageRoot.resource.Crates = { amount: 0, max: 0, display: false };
assert.equal(
  storageReader().buildings[0].weighting,
  1,
  "a valid zero-cap storage pool deliberately counts as unused",
);

storageRoot.resource.Crates = { amount: "2", max: 10, display: true };
assert.equal(
  storageReader().buildings[0].weighting,
  10,
  "malformed storage data is neutral rather than guessed",
);

storageRoot = {
  city: {
    storage_yard: { count: 1 },
    warehouse: { count: 1 },
    shed: { count: 1 },
  },
  resource: {
    Crates: { amount: 10, max: 10, display: true },
    Containers: { amount: 10, max: 10, display: true },
  },
};
assert.equal(
  storageReader().buildings.find(({ id }) => id === "shed")?.weighting,
  20,
  "fully assigned storage makes the city shed useful",
);

storageRoot.resource.Containers = { amount: 10, max: 10, display: false };
assert.equal(
  storageReader().buildings.find(({ id }) => id === "shed")?.weighting,
  10,
  "a hidden storage pool does not trigger storage expansion",
);

const malformedStorageSettingReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({
      city: { storage_yard: { count: 1 } },
      resource: {
        Crates: { amount: 2, max: 10 },
        Containers: { amount: 10, max: 10 },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => ["city-storage_yard"],
  },
  getSettings: () => ({
    "batcity-storage_yard": true,
    "bld_w_city-storage_yard": 10,
    buildingWeightingCrateUseless: "bad",
  }),
});
assert.deepEqual(
  malformedStorageSettingReader().buildings,
  [],
  "malformed storage weighting is rejected like other configured weights",
);

const housingReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({
      city: {
        basic_housing: { count: 1 },
        cottage: { count: 1 },
        unrelated: { count: 1 },
      },
      resource: {
        Crates: { amount: 10, max: 10, display: true },
        Containers: { amount: 10, max: 10, display: true },
        Population: { amount: 20, max: 100, display: true },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [
      "city-basic_housing",
      "city-cottage",
      "city-unrelated",
    ],
  },
  getSettings: () => ({
    "batcity-basic_housing": true,
    "batcity-cottage": true,
    "batcity-unrelated": true,
    "bld_w_city-basic_housing": 10,
    "bld_w_city-cottage": 10,
    "bld_w_city-unrelated": 10,
    buildingWeightingUselessHousing: 0.1,
  }),
});
assert.deepEqual(
  housingReader().buildings.map(({ id, weighting }) => ({ id, weighting })),
  [
    { id: "basic_housing", weighting: 1 },
    { id: "cottage", weighting: 1 },
    { id: "unrelated", weighting: 10 },
  ],
  "underused population makes current housing candidates less useful",
);

const fullPopulationRoot = {
  city: { basic_housing: { count: 1 } },
  resource: {
    Crates: { amount: 10, max: 10, display: true },
    Containers: { amount: 10, max: 10, display: true },
    Population: { amount: 90, max: 100, display: true },
  },
};
const fullPopulationReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => fullPopulationRoot,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => ["city-basic_housing"],
  },
  getSettings: () => ({
    "batcity-basic_housing": true,
    "bld_w_city-basic_housing": 10,
    buildingWeightingUselessHousing: 0.1,
  }),
});
assert.equal(
  fullPopulationReader().buildings[0].weighting,
  10,
  "population at ninety percent capacity keeps housing neutral",
);

const meditationReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({
      race: { calm: true },
      city: { meditation: { count: 1 }, farm: { count: 1 } },
      resource: {
        Crates: { amount: 10, max: 10, display: true },
        Containers: { amount: 10, max: 10, display: true },
        Zen: { amount: 2, max: 10, display: true },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => ["city-meditation", "city-farm"],
  },
  getSettings: () => ({
    "batcity-meditation": true,
    "batcity-farm": true,
    "bld_w_city-meditation": 10,
    "bld_w_city-farm": 10,
    buildingWeightingZenUseless: 0.1,
  }),
});
assert.deepEqual(
  meditationReader().buildings.map(({ id, weighting }) => ({ id, weighting })),
  [
    { id: "meditation", weighting: 1 },
    { id: "farm", weighting: 10 },
  ],
  "calm races with room below the Zen cap deprioritize meditation",
);

const vacuumReader = createCapturedBuildPolicyReader({
  rootState: {
    readRoot: () => ({
      city: { pylon: { count: 1 }, farm: { count: 1 } },
      resource: {
        Crates: { amount: 10, max: 10, display: true },
        Containers: { amount: 10, max: 10, display: true },
      },
    }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => ["city-pylon", "city-farm"],
  },
  getSettings: () => ({
    "batcity-pylon": true,
    "batcity-farm": true,
    "bld_w_city-pylon": 10,
    "bld_w_city-farm": 10,
    prestigeType: "vacuum",
    buildingWeightingVacuumCollapse: 0.1,
  }),
});
assert.deepEqual(
  vacuumReader().buildings.map(({ id, weighting }) => ({ id, weighting })),
  [
    { id: "pylon", weighting: 1 },
    { id: "farm", weighting: 10 },
  ],
  "vacuum-collapse weighting deprioritizes the captured city pylon",
);

console.log("captured-build-policy ok");
