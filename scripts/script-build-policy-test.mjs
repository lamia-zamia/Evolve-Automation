import assert from "node:assert/strict";
import { createScriptBuildPolicyReader } from "../src/adapters/evolve/progression/build/script-build-policy.ts";

function makeBuilding(overrides = {}) {
  const resource = { _id: "Food" };
  return {
    catalogKey: "SpaceFarm",
    name: "Space Farm",
    _id: "farm",
    _tab: "space",
    _location: "spc_moon",
    _weighting: 4,
    weighting: 37,
    elementId: "space-farm",
    definition: { region: "space" },
    is: { knowledge: true, important: true },
    autoBuildEnabled: true,
    isUnlocked: () => true,
    isSmartManaged: () => false,
    count: 2,
    autoMax: Number.MAX_SAFE_INTEGER,
    stateOffCount: 0,
    isAffordable: () => true,
    powered: 0,
    cost: { Food: 12 },
    getMissingConsumption: () => null,
    getMissingSupport: () => null,
    getUselessSupport: () => null,
    consumption: [{ resource, rate: -1 }],
    ...overrides,
  };
}

let updates = 0;
const building = makeBuilding();
const settings = {
  buildingConsumptionCheck: "perResource",
  buildingBuildIfStorageFull: true,
  buildingsIgnoreZeroRate: true,
  prestigeType: "whitehole",
  prestigeWhiteholeSaveGems: true,
};
const reader = createScriptBuildPolicyReader({
  getBuildingManager: () => ({
    updateWeighting: () => {
      updates++;
    },
    managedPriorityList: () => [building],
  }),
  getSettings: () => settings,
});

assert.deepEqual(reader(), {
  buildings: [
    {
      key: "SpaceFarm",
      elementId: "space-farm",
      region: "space",
      id: "farm",
      weighting: 37,
      maximum: Number.MAX_SAFE_INTEGER,
      knowledge: true,
      important: true,
      consumption: [{ resourceId: "Food", nonNegativeRate: false }],
    },
  ],
  consumptionMode: "perResource",
  buildIfStorageFull: true,
  ignoreZeroRate: true,
  respectReservations: true,
  saveWhiteholeGems: true,
});
assert.equal(updates, 1);

const skipped = [];
const malformed = makeBuilding({
  catalogKey: "Broken",
  consumption: undefined,
});
const tolerant = createScriptBuildPolicyReader({
  getBuildingManager: () => ({
    updateWeighting: () => {},
    managedPriorityList: () => [malformed],
  }),
  getSettings: () => ({}),
  onSkipped: (key, reason) => skipped.push([key, reason]),
});
assert.deepEqual(tolerant().buildings, []);
assert.equal(skipped.length, 1);
assert.equal(skipped[0][0], "Broken");
assert.match(skipped[0][1], /consumption/);

console.log("script-build-policy ok");
