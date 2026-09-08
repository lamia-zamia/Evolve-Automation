import assert from "node:assert/strict";
import { createCapturedBuildPolicyReader } from "../src/adapters/evolve/progression/build/captured-build-policy.ts";

const skipped = [];
const settings = {
  "batcity-farm": true,
  "bld_w_city-farm": 37,
  "bld_m_city-farm": 12,
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
    readRoot: () => ({ city: { farm: { count: 2 }, bad: {} } }),
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: () => undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => [
      "city-farm",
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

console.log("captured-build-policy ok");
