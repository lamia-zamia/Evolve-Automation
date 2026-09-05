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
      "c4d6577aca01814958b39e12922d9d250cf39cf3ce804c4980d9c58ba7521038",
    priorityHash:
      "9479d2bd1223189f78a793551a6b08063ae84016884ad8f80c3e76505b575ab8",
    statePriorityHash:
      "12aba57ececc1478205a610995e242d5d595620ea34103caaadee6c106bd64cf",
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
