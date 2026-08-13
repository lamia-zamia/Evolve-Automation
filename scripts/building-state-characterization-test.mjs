import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";
import { createHash } from "node:crypto";

const { hooks } = await loadCharacterizationBundle({
  cloneInto: (value) => value,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  unsafeWindow: {},
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.initBuildingState, "function");
assert.equal(typeof hooks.setBuildingStateTestContext, "function");

const omitted = new Set(["AlphaMission", "TauGasName4"]);
const accesses = [];
const instances = new Map();
const buildings = new Proxy(
  {},
  {
    get(_target, id) {
      assert.equal(typeof id, "string");
      accesses.push(id);
      if (omitted.has(id)) return undefined;
      if (!instances.has(id)) {
        instances.set(id, {
          id,
          isSwitchable: () => id.includes("Mission") || id.length % 2 === 0,
        });
      }
      return instances.get(id);
    },
  },
);
const BuildingManager = {};
hooks.setBuildingStateTestContext({ buildings, BuildingManager });
hooks.initBuildingState();

const priorityIds = Array.from(
  BuildingManager.priorityList,
  (building) => building.id,
);
const statePriorityIds = Array.from(
  BuildingManager.statePriorityList,
  (building) => building.id,
);
const fingerprint = (values) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");

assert.deepEqual(
  {
    accesses: accesses.length,
    priority: priorityIds.length,
    statePriority: statePriorityIds.length,
    accessHash: fingerprint(accesses),
    priorityHash: fingerprint(priorityIds),
    statePriorityHash: fingerprint(statePriorityIds),
  },
  {
    accesses: 404,
    priority: 402,
    statePriority: 209,
    accessHash:
      "39e452919040b2ae3d9c2dacd00eaa9537da2ac94add9989722c6b374c21a163",
    priorityHash:
      "9e25af472a0d8adb96f72892b4db5cdb56a66f2eb0a9be9bdc53f3b1872b7b64",
    statePriorityHash:
      "8a94a3a35faf6a00d5b609f8ae7ec850215e36d33df99ef18cce13cb7389163c",
  },
);
assert.deepEqual(priorityIds.slice(0, 8), [
  "Windmill",
  "Mill",
  "CoalPower",
  "OilPower",
  "FissionPower",
  "TauFusionGenerator",
  "TauGas2AlienSpaceStation",
  "WastelandIncinerator",
]);
assert.deepEqual(priorityIds.slice(-8), [
  "MetalRefinery",
  "Casino",
  "HellSpaceCasino",
  "RockQuarry",
  "Sawmill",
  "GasMining",
  "Mine",
  "CoalMine",
]);
assert.equal(priorityIds.includes("AlphaMission"), false);
assert.equal(priorityIds.includes("TauGasName4"), false);

console.log("Building state bundled characterization tests passed");
