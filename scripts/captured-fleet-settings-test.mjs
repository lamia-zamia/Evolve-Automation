import assert from "node:assert/strict";

import {
  CAPTURED_ANDROMEDA_REGION_IDS,
  CAPTURED_FLEET_ANDROMEDA_CONTROLS,
  CAPTURED_FLEET_OUTER_CONTROLS,
  CAPTURED_OUTER_REGION_IDS,
  CAPTURED_SHIP_COMPONENTS,
} from "../src/adapters/evolve/combat/captured-fleet-settings-catalog.ts";
import { createCapturedFleetSettingsAdapter } from "../src/adapters/evolve/combat/captured-fleet-settings.ts";
import { createRecordSettingsLifecycle } from "./test-support/captured-settings.mjs";

// The ten syndicate regions (spc_dwarf excepted), in script order.
assert.deepEqual(
  [...CAPTURED_OUTER_REGION_IDS],
  [
    "spc_moon",
    "spc_red",
    "spc_gas",
    "spc_gas_moon",
    "spc_belt",
    "spc_titan",
    "spc_enceladus",
    "spc_triton",
    "spc_makemake",
    "spc_eris",
  ],
);

// The upstream galaxyRegions export, in order.
assert.deepEqual(
  [...CAPTURED_ANDROMEDA_REGION_IDS],
  [
    "gxy_gateway",
    "gxy_stargate",
    "gxy_gorddon",
    "gxy_alien1",
    "gxy_alien2",
    "gxy_chthonian",
  ],
);

// Shipyard unlock order per component type, mirroring upstream shipParts.
assert.deepEqual(Object.keys(CAPTURED_SHIP_COMPONENTS), [
  "class",
  "power",
  "weapon",
  "armor",
  "engine",
  "sensor",
]);
assert.deepEqual(
  CAPTURED_SHIP_COMPONENTS.class.map((option) => option.val),
  [
    "corvette",
    "frigate",
    "destroyer",
    "cruiser",
    "battlecruiser",
    "dreadnought",
    "freighter",
    "explorer",
    "supply_ship",
  ],
);
assert.deepEqual(
  CAPTURED_SHIP_COMPONENTS.power.map((option) => option.val),
  ["solar", "diesel", "fission", "fusion", "elerium", "antimatter"],
);
assert.deepEqual(
  CAPTURED_SHIP_COMPONENTS.weapon.map((option) => option.val),
  ["railgun", "laser", "p_laser", "plasma", "phaser", "disruptor", "gauss"],
);
assert.deepEqual(
  CAPTURED_SHIP_COMPONENTS.armor.map((option) => option.val),
  ["steel", "alloy", "neutronium", "aerographene"],
);
assert.deepEqual(
  CAPTURED_SHIP_COMPONENTS.engine.map((option) => option.val),
  ["ion", "tie", "pulse", "photon", "vacuum", "emdrive", "electrokinetic"],
);
assert.deepEqual(
  CAPTURED_SHIP_COMPONENTS.sensor.map((option) => option.val),
  ["visual", "radar", "lidar", "quantum"],
);
for (const options of Object.values(CAPTURED_SHIP_COMPONENTS)) {
  for (const option of options) {
    assert.notEqual(option.label, option.val);
    assert.equal(option.hint, "Preset ship component");
  }
}
assert.equal(
  CAPTURED_SHIP_COMPONENTS.weapon.find((option) => option.val === "gauss")
    .label,
  "Gauss Cannons",
);
assert.equal(
  CAPTURED_SHIP_COMPONENTS.armor.find((option) => option.val === "aerographene")
    .label,
  "Aerographene",
);

const controls = {
  resolve: (id) => {
    if (id === "space-spc_moon") return { data: { title: "Moon", act: {} } };
    if (id === "galaxy-gxy_gateway")
      return { data: { title: "Stargate", act: {} } };
    return undefined;
  },
  capturedElementIds: () => ["space-spc_moon", "galaxy-gxy_gateway"],
};

const raw = {
  fleet_pr_gxy_alien1: 0,
  fleet_pr_gxy_gateway: 5,
};
const adapter = createCapturedFleetSettingsAdapter({
  controls,
  getSettingsRaw: () => raw,
});
const model = adapter.readFleetSettingsReadModel();
assert.equal(model.sectionId, "fleet");
assert.equal(model.sectionName, "Fleet");
assert.deepEqual(model.outerControls, CAPTURED_FLEET_OUTER_CONTROLS);
assert.deepEqual(model.andromedaControls, CAPTURED_FLEET_ANDROMEDA_CONTROLS);
assert.deepEqual(
  model.outerControls.map((control) => control.settingName),
  ["fleetOuterShips", "fleetOuterCrew", "fleetExploreTau"],
);
assert.deepEqual(
  model.outerRegions.map((region) => region.id),
  [...CAPTURED_OUTER_REGION_IDS],
);
// Drawn controls answer the game's own label; undrawn regions fall back to the id.
assert.equal(
  model.outerRegions.find((region) => region.id === "spc_moon").label,
  "Moon",
);
assert.equal(
  model.outerRegions.find((region) => region.id === "spc_red").label,
  "spc_red",
);
// Andromeda regions sort by their configured priority, lowest first; ties keep
// catalog order (Array.sort is stable, matching the compat reader).
assert.deepEqual(
  model.andromedaRegions.map((region) => region.id),
  [
    "gxy_stargate",
    "gxy_gorddon",
    "gxy_alien1",
    "gxy_alien2",
    "gxy_chthonian",
    "gxy_gateway",
  ],
);
assert.equal(
  model.andromedaRegions.find((region) => region.id === "gxy_gateway").label,
  "Stargate",
);
// The override editor binds only regions with a recorded override.
assert.deepEqual(
  model.andromedaRegions
    .filter((region) => region.settingName !== undefined)
    .map((region) => region.id),
  [],
);
raw.overrides = { fleet_pr_gxy_gateway: {} };
const overridden = adapter.readFleetSettingsReadModel();
assert.equal(
  overridden.andromedaRegions.find((region) => region.id === "gxy_gateway")
    .settingName,
  "fleet_pr_gxy_gateway",
);

// Reordering writes priorities back in drag order.
adapter.reorderAndromeda(["gxy_gateway", "gxy_alien1"]);
assert.equal(raw.fleet_pr_gxy_gateway, 0);
assert.equal(raw.fleet_pr_gxy_alien1, 1);

// Reset applies the shared fleet defaults, including the default andromeda order.
const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: { readRoot: () => ({}) },
  controls,
});

sectionLifecycle.resetSection("fleet");
assert.equal(raw.fleetOuterShips, "custom");
assert.equal(raw.fleetOuterCrew, 30);
assert.equal(raw.fleetExploreTau, true);
assert.equal(raw.fleet_outer_class, "destroyer");
assert.equal(raw.fleet_scout_class, "corvette");
assert.equal(raw.fleet_pr_gxy_gateway, 4);
assert.equal(raw.fleet_pr_gxy_stargate, 0);

// A missing overrides record means no override; a missing record is a no-op.
const bare = createCapturedFleetSettingsAdapter({
  controls: { resolve: () => undefined, capturedElementIds: () => [] },
  getSettingsRaw: () => ({}),
});
assert.ok(
  bare
    .readFleetSettingsReadModel()
    .andromedaRegions.every((region) => region.settingName === undefined),
);
const missing = createCapturedFleetSettingsAdapter({
  controls: { resolve: () => undefined, capturedElementIds: () => [] },
  getSettingsRaw: () => undefined,
});
missing.reorderAndromeda(["gxy_gateway"]);

console.log("captured fleet settings ok");
