import assert from "node:assert/strict";

import { createStorageSettingsEvolveAdapter } from "../src/adapters/evolve/economy/storage/storage-settings.ts";

const settingsRaw = {};
const trace = [];
const storageManager = {
  priorityList: [
    { id: "Iron", name: "Iron" },
    { id: "Coal", name: "Coal" },
  ],
  sortByPriority() {
    trace.push("sortByPriority");
  },
};
const adapter = createStorageSettingsEvolveAdapter({
  getStorageManager: () => storageManager,
  getSettingsRaw: () => settingsRaw,
});

const readModel = adapter.readStorageSettingsReadModel();
assert.equal(readModel.sectionName, "Storage");
assert.deepEqual(
  readModel.controls.map(({ settingName }) => settingName),
  [
    "storageLimitPreMad",
    "storageSafeReassign",
    "storageAssignExtra",
    "storageAssignPart",
  ],
);
assert.deepEqual(readModel.rows, [
  {
    id: "Iron",
    label: "Iron",
    enabledSettingName: "res_storageIron",
    overflowSettingName: "res_storage_o_Iron",
    minimumSettingName: "res_min_storeIron",
    maximumSettingName: "res_max_storeIron",
  },
  {
    id: "Coal",
    label: "Coal",
    enabledSettingName: "res_storageCoal",
    overflowSettingName: "res_storage_o_Coal",
    minimumSettingName: "res_min_storeCoal",
    maximumSettingName: "res_max_storeCoal",
  },
]);
assert.equal(Object.isFrozen(readModel), true);
assert.equal(Object.isFrozen(readModel.controls), true);
assert.equal(Object.isFrozen(readModel.rows), true);

adapter.reorderResources(["Coal", "Iron"]);
assert.deepEqual(settingsRaw, {
  res_storage_p_Coal: 0,
  res_storage_p_Iron: 1,
});
assert.deepEqual(trace, ["sortByPriority"]);

assert.throws(
  () =>
    createStorageSettingsEvolveAdapter({
      getStorageManager: () => ({ priorityList: {} }),
      getSettingsRaw: () => ({}),
    }).readStorageSettingsReadModel(),
  /priorityList must be an array/,
);
assert.throws(
  () =>
    createStorageSettingsEvolveAdapter({
      getStorageManager: () => ({ priorityList: [{ id: "Iron", name: 1 }] }),
      getSettingsRaw: () => ({}),
    }).readStorageSettingsReadModel(),
  /priorityList\[0\]\.name must be a string/,
);
assert.throws(
  () =>
    createStorageSettingsEvolveAdapter({
      getStorageManager: () => ({
        priorityList: [],
        sortByPriority: true,
      }),
      getSettingsRaw: () => ({}),
    }).reorderResources([]),
  /sortByPriority must be a function/,
);

console.log("Storage settings Evolve adapter tests passed");
