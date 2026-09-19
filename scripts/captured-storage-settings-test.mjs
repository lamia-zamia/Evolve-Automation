import assert from "node:assert/strict";

import { readStorageResetContext } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { readCapturedStorageSettingsEntries } from "../src/adapters/evolve/economy/storage/captured-storage-settings-catalog.ts";
import { createCapturedStorageSettingsAdapter } from "../src/adapters/evolve/economy/storage/captured-storage-settings.ts";
import { createCapturedStorageToggleReader } from "../src/adapters/evolve/economy/storage/captured-storage-toggles.ts";
import {
  ALWAYS_TRUE_OVERRIDE,
  createRecordSettingsLifecycle,
} from "./test-support/captured-settings.mjs";

function makeCapturedGame() {
  const root = {
    resource: {
      Iron: { title: "Iron", stackable: true },
      Coal: { name: "Coal", stackable: true },
      Food: { title: "Food", stackable: false },
      Orichalcum: { title: "Orichalcum", stackable: true },
      Copper: { title: "Copper" },
    },
  };
  const controlsById = new Map([
    ["stack-Copper", { elementId: "stack-Copper", generation: 1, methods: [] }],
  ]);
  const controls = {
    resolve: (id) => controlsById.get(id),
    invoke: () => ({ ok: false, reason: "unknown-method" }),
    capturedElementIds: () => [...controlsById.keys()],
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  return { root, controls, rootState };
}

const game = makeCapturedGame();

// The table and the lifecycle defaults share one resource list: stackable
// root records first, then captured `stack-` rows the root does not flag.
assert.deepEqual(
  readStorageResetContext(game.root, game.controls).storableResourceIds,
  ["Iron", "Coal", "Orichalcum", "Copper"],
);
assert.deepEqual(
  readCapturedStorageSettingsEntries(game.root, game.controls).map((entry) => [
    entry.resourceId,
    entry.elementId,
    entry.label,
  ]),
  [
    ["Iron", "stack-Iron", "Iron"],
    ["Coal", "stack-Coal", "Coal"],
    ["Orichalcum", "stack-Orichalcum", "Orichalcum"],
    ["Copper", "stack-Copper", "Copper"],
  ],
);

const raw = {
  autoStorage: true,
  res_storageIron: true,
  res_storageCoal: false,
  res_storage_o_Coal: true,
  res_storage_p_Iron: 2,
  res_storage_p_Coal: 0,
  res_storage_p_Orichalcum: 1,
  res_max_storeCoal: 100,
  overrides: {
    res_storageCoal: ALWAYS_TRUE_OVERRIDE,
    res_crates_m_Iron: ALWAYS_TRUE_OVERRIDE,
    job_farmer: ALWAYS_TRUE_OVERRIDE,
  },
};
const adapter = createCapturedStorageSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
});

const model = adapter.readStorageSettingsReadModel();
assert.equal(model.sectionId, "storage");
assert.equal(model.sectionName, "Storage");
assert.deepEqual(
  model.controls.map((control) => control.settingName),
  [
    "storageLimitPreMad",
    "storageSafeReassign",
    "storageAssignExtra",
    "storageAssignPart",
  ],
);
assert.deepEqual(
  model.rows.map((row) => row.id),
  ["Coal", "Orichalcum", "Iron", "Copper"],
);
const coal = model.rows.find((row) => row.id === "Coal");
assert.deepEqual(
  {
    label: coal.label,
    enabledSettingName: coal.enabledSettingName,
    overflowSettingName: coal.overflowSettingName,
    minimumSettingName: coal.minimumSettingName,
    maximumSettingName: coal.maximumSettingName,
  },
  {
    label: "Coal",
    enabledSettingName: "res_storageCoal",
    overflowSettingName: "res_storage_o_Coal",
    minimumSettingName: "res_min_storeCoal",
    maximumSettingName: "res_max_storeCoal",
  },
);

// The settings panel reads the raw persisted value. An active override is
// deliberately not allowed to turn the displayed value into the effective one.
assert.equal(raw["res_storageCoal"], false);

adapter.resetPriorities();
assert.equal(raw["res_storage_p_Iron"], 0);
assert.equal(raw["res_storage_p_Copper"], 3);
adapter.reorderResources(["Copper", "Iron", "not-captured"]);
assert.equal(raw["res_storage_p_Copper"], 0);
assert.equal(raw["res_storage_p_Iron"], 1);
assert.equal(raw["res_storage_p_not-captured"], undefined);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: game.rootState,
  controls: game.controls,
});

sectionLifecycle.resetSection("storage");
assert.deepEqual(
  {
    iron: raw["res_storageIron"],
    coal: raw["res_storageCoal"],
    coalOverflow: raw["res_storage_o_Coal"],
    orichalcumOverflow: raw["res_storage_o_Orichalcum"],
    coalMin: raw["res_min_storeCoal"],
    ironMax: raw["res_max_storeIron"],
    limitPreMad: raw["storageLimitPreMad"],
  },
  {
    iron: true,
    coal: true,
    coalOverflow: false,
    orichalcumOverflow: true,
    coalMin: 1,
    ironMax: -1,
    limitPreMad: true,
  },
);
assert.deepEqual(raw["overrides"], {
  job_farmer: ALWAYS_TRUE_OVERRIDE,
});

const toggleReader = createCapturedStorageToggleReader({
  rootState: game.rootState,
  controls: game.controls,
  getDocument: () => ({
    getElementById: (id) => (id === "stack-Iron" ? {} : null),
  }),
  getSettingsRaw: () => raw,
});
assert.deepEqual(toggleReader.readStorage(), {
  items: [
    {
      resourceId: "Iron",
      storeKey: "res_storageIron",
      overKey: "res_storage_o_Iron",
      storeEnabled: true,
      overEnabled: false,
    },
  ],
});

console.log("captured storage settings ok");
