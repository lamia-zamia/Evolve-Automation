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

console.log("captured-build-policy ok");
