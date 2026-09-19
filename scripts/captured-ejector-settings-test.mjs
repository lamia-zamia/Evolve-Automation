import assert from "node:assert/strict";

import { readEjector } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { readCapturedEjectorSettingsEntries } from "../src/adapters/evolve/economy/resources/captured-ejector-settings-catalog.ts";
import { createCapturedEjectorSettingsAdapter } from "../src/adapters/evolve/economy/resources/captured-ejector-settings.ts";
import { createCapturedEjectToggleReader } from "../src/adapters/evolve/economy/resources/captured-eject-toggles.ts";
import { createCapturedSupplyToggleReader } from "../src/adapters/evolve/economy/resources/captured-supply-toggles.ts";
import {
  ALWAYS_TRUE_OVERRIDE,
  createCapturedControls,
  createCapturedRootState,
  createRecordSettingsLifecycle,
} from "./test-support/captured-settings.mjs";

function makeCapturedGame() {
  const root = {
    race: {},
    city: { nanite_factory: { Copper: { count: 1 } } },
    atomic_mass: { Lumber: 12 },
    supplyValue: { Iron: { in: 1.5, out: 25000 } },
    resource: {
      Iron: { title: "Iron", tradable: true, atomicMass: 55 },
      Elerium: { title: "Elerium", tradable: true, atomicMass: 200 },
      Lumber: { title: "Lumber", atomicMass: 12 },
      Copper: { title: "Copper", is: { tradable: true } },
      Stone: { title: "Stone" },
    },
  };
  const controlsById = new Map(
    ["ejectIron", "ejectElerium", "supplyIron", "supplyLumber"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: [] },
    ]),
  );
  const controls = createCapturedControls(controlsById);
  const rootState = createCapturedRootState(() => root);
  return { root, controls, rootState };
}

const game = makeCapturedGame();

// Consumability is the captured control rows; Stone has none and is excluded.
const context = readEjector(game.root, game.controls);
assert.deepEqual(
  context.resources.map((resource) => [
    resource.id,
    resource.ejectConsumable,
    resource.supplyConsumable,
    resource.naniteConsumable,
  ]),
  [
    ["Iron", true, true, false],
    ["Elerium", true, false, false],
    ["Lumber", false, true, false],
    ["Copper", false, false, true],
    ["Stone", false, false, false],
  ],
);
assert.deepEqual(
  readCapturedEjectorSettingsEntries(game.root, game.controls).map((entry) => [
    entry.resourceId,
    entry.ejectElementId,
    entry.supplyElementId,
    entry.label,
    entry.color,
    entry.atomicMass,
    entry.supplyOut,
    entry.supplyIn,
  ]),
  [
    [
      "Iron",
      "ejectIron",
      "supplyIron",
      "Iron",
      "has-text-info",
      55,
      "25000",
      "1.5",
    ],
    [
      "Elerium",
      "ejectElerium",
      "supplyElerium",
      "Elerium",
      "has-text-caution",
      200,
      "",
      "",
    ],
    [
      "Lumber",
      "ejectLumber",
      "supplyLumber",
      "Lumber",
      "has-text-advanced",
      12,
      "0",
      "0",
    ],
    [
      "Copper",
      "ejectCopper",
      "supplyCopper",
      "Copper",
      "has-text-info",
      0,
      "",
      "",
    ],
  ],
);

const raw = {
  autoEject: true,
  res_ejectIron: false,
  res_supplyLumber: true,
  overrides: {
    res_ejectIron: ALWAYS_TRUE_OVERRIDE,
    res_naniteCopper: ALWAYS_TRUE_OVERRIDE,
    job_farmer: ALWAYS_TRUE_OVERRIDE,
  },
};
const adapter = createCapturedEjectorSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
});

const model = adapter.readEjectorSettingsReadModel();
assert.equal(model.sectionId, "ejector");
assert.equal(model.sectionName, "Ejector, Supply & Nanite");
assert.deepEqual(
  model.controls.map((control) => control.settingName),
  [
    "ejectMode",
    "supplyMode",
    "naniteMode",
    "prestigeWhiteholeStabiliseMass",
    "prestigeWhiteholeStabiliseCooldown",
  ],
);
assert.deepEqual(
  model.rows.map((row) => row.id),
  ["Iron", "Elerium", "Lumber", "Copper"],
);
const iron = model.rows.find((row) => row.id === "Iron");
assert.deepEqual(
  {
    ejectEnabled: iron.ejectEnabled,
    naniteEnabled: iron.naniteEnabled,
    supplyEnabled: iron.supplyEnabled,
    ejectSettingName: iron.ejectSettingName,
    naniteSettingName: iron.naniteSettingName,
    supplySettingName: iron.supplySettingName,
    showEject: iron.showEject,
    showNanite: iron.showNanite,
    showSupply: iron.showSupply,
  },
  {
    ejectEnabled: false,
    naniteEnabled: false,
    supplyEnabled: false,
    ejectSettingName: "res_ejectIron",
    naniteSettingName: "res_naniteIron",
    supplySettingName: "res_supplyIron",
    showEject: true,
    showNanite: false,
    showSupply: true,
  },
);

// The settings panel reads the raw persisted value. An active override is
// deliberately not allowed to turn the displayed value into the effective one.
assert.equal(raw["res_ejectIron"], false);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: game.rootState,
  controls: game.controls,
});

sectionLifecycle.resetSection("ejector");
assert.deepEqual(
  {
    ejectIron: raw["res_ejectIron"],
    ejectElerium: raw["res_ejectElerium"],
    supplyIron: raw["res_supplyIron"],
    supplyLumber: raw["res_supplyLumber"],
    naniteCopper: raw["res_naniteCopper"],
    ejectMode: raw["ejectMode"],
    autoEject: raw["autoEject"],
  },
  {
    ejectIron: true,
    ejectElerium: true,
    supplyIron: true,
    supplyLumber: false,
    naniteCopper: true,
    ejectMode: "cap",
    autoEject: false,
  },
);
assert.deepEqual(raw["overrides"], {
  job_farmer: ALWAYS_TRUE_OVERRIDE,
});

const document = {
  getElementById: (id) =>
    id === "ejectIron" || id === "ejectElerium" || id === "supplyLumber"
      ? {}
      : null,
};
const ejectReader = createCapturedEjectToggleReader({
  rootState: game.rootState,
  controls: game.controls,
  getDocument: () => document,
  getSettingsRaw: () => raw,
});
assert.deepEqual(ejectReader.readItems(), [
  {
    resourceId: "Iron",
    settingKey: "res_ejectIron",
    enabled: true,
  },
  {
    resourceId: "Elerium",
    settingKey: "res_ejectElerium",
    enabled: true,
  },
]);
const supplyReader = createCapturedSupplyToggleReader({
  rootState: game.rootState,
  controls: game.controls,
  getDocument: () => document,
  getSettingsRaw: () => raw,
});
assert.deepEqual(supplyReader.readItems(), [
  {
    resourceId: "Lumber",
    settingKey: "res_supplyLumber",
    enabled: false,
  },
]);

console.log("captured ejector settings ok");
