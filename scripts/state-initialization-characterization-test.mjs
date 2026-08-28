import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";
import { createHash } from "node:crypto";

const logs = [];
const sandboxConsole = {
  ...console,
  log(...values) {
    logs.push(values.map(String));
  },
};
const { hooks } = await loadCharacterizationBundle({
  cloneInto: (value) => value,
  console: sandboxConsole,
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

assert.equal(typeof hooks.initialiseState, "function");
assert.equal(typeof hooks.setStateInitializationTestContext, "function");
assert.equal(typeof hooks.getStateInitializationTestContext, "function");

function lazyCatalog(makeValue) {
  const values = new Map();
  return new Proxy(
    {},
    {
      get(_target, id) {
        if (typeof id !== "string") return undefined;
        if (!values.has(id)) values.set(id, makeValue(id));
        return values.get(id);
      },
      ownKeys: () => Array.from(values.keys()),
      getOwnPropertyDescriptor(_target, id) {
        if (!values.has(id)) return undefined;
        return {
          value: values.get(id),
          enumerable: true,
          configurable: true,
          writable: true,
        };
      },
    },
  );
}

const supportTrace = [];
const consumptionRecords = [];
const buildings = lazyCatalog((id) => ({
  id,
  name: id,
  definition: id !== "TritonLander",
  powered: id === "MoonBase" || id === "RedSpaceport" ? 2 : 0,
  _location: "loc",
  autoStateSmart: id.startsWith("TauRedWomling"),
  addSupport(resource) {
    supportTrace.push([id, resource.id]);
  },
  addResourceConsumption(resource, amount) {
    consumptionRecords.push({ building: id, resource, amount });
  },
}));
const resources = lazyCatalog((id) => ({ id, cost: {} }));
const projects = lazyCatalog((id) => ({ id }));
[
  "Windmill",
  "SunSwarmSatellite",
  "ProximaDyson",
  "ProximaDysonSphere",
  "ProximaOrichalcumSphere",
  "ProximaElysaniteSphere",
  "BlackholeStellarEngine",
  "WastelandIncinerator",
].forEach((id) => void buildings[id]);
const crafter = { Plywood: { id: "Plywood" }, Brick: { id: "Brick" } };
const JobManager = {};
const game = {
  global: {
    race: { universe: "standard" },
    stats: { achieve: { endless_hunger: { l: 4 } } },
    power: ["loc:MoonBase"],
  },
};
const preambleTrace = [];
let technologies = new Set();
const actions = {
  updateCraftCost: () => preambleTrace.push(["craft"]),
  updateTabs: (force) => preambleTrace.push(["tabs", force]),
  haveTech: (id, level) =>
    technologies.has(level === undefined ? id : `${id}:${level}`),
};
hooks.setStateInitializationTestContext({
  game,
  resources,
  JobManager,
  crafter,
  buildings,
  projects,
  actions,
});
hooks.initialiseState();

const finalContext = hooks.getStateInitializationTestContext();
const finalBuildings = finalContext.buildings;
assert.deepEqual(preambleTrace, [["craft"], ["tabs", false]]);
assert.deepEqual(Array.from(JobManager.craftingJobs), [
  crafter.Plywood,
  crafter.Brick,
]);
assert.equal(resources.Containers.cost.Steel, 125);
assert.equal(buildings.Banquet.gameMax, 4);
assert.equal(projects.LaunchFacility.gameMax, 1);
assert.equal(projects.ManaSyphon.gameMax, 80);
assert.equal("TritonLander" in finalBuildings, false);
assert.deepEqual(logs, [["TritonLander action not found."]]);
assert.equal(finalBuildings.RedSpaceport.overridePowered, 0);
assert.equal(finalBuildings.MoonBase.overridePowered, undefined);
assert.equal(finalBuildings.Windmill.overridePowered, -1);
assert.equal(finalBuildings.ProximaElysaniteSphere.overridePowered, -18);

// Evolve's own crate() picks the resource from the race traits directly; see
// domain/economy/storage/crate-cost.ts.
assert.deepEqual({ ...resources.Crates.cost }, { Plywood: 10 });
game.global.race.kindling_kindred = true;
assert.deepEqual({ ...resources.Crates.cost }, { Stone: 200 });
delete game.global.race.kindling_kindred;
game.global.race.smoldering = true;
assert.deepEqual({ ...resources.Crates.cost }, { Chrysotile: 200 });
// iron_wood overrides the resource on its own -- warlord is not part of the game's rule.
delete game.global.race.smoldering;
game.global.race.iron_wood = true;
assert.deepEqual({ ...resources.Crates.cost }, { Lumber: 200 });

function evaluateConsumptions() {
  return consumptionRecords.map(({ building, resource, amount }) => [
    building,
    typeof resource === "function" ? resource().id : resource.id,
    typeof amount === "function" ? amount() : amount,
  ]);
}

game.global.race = { universe: "standard" };
technologies = new Set();
finalBuildings.TauRedWomlingFarm.autoStateSmart = false;
finalBuildings.TauRedWomlingLab.autoStateSmart = false;
finalBuildings.TauRedWomlingMine.autoStateSmart = false;
const defaultConsumptions = evaluateConsumptions();

game.global.race = {
  universe: "magic",
  environmentalist: true,
  fasting: true,
  cataclysm: true,
  lone_survivor: true,
};
technologies = new Set(["luna:3", "womling_pop:2", "isolation"]);
finalBuildings.TauRedWomlingFarm.autoStateSmart = true;
finalBuildings.TauRedWomlingLab.autoStateSmart = true;
finalBuildings.TauRedWomlingMine.autoStateSmart = true;
const alternateConsumptions = evaluateConsumptions();

const gameMax = Object.fromEntries(
  Object.entries(finalBuildings)
    .filter(([, building]) => building.gameMax !== undefined)
    .map(([id, building]) => [id, building.gameMax]),
);
const produces = Object.fromEntries(
  Object.entries(finalBuildings)
    .filter(([, building]) => building.produces !== undefined)
    .map(([id, building]) => [
      id,
      Array.from(building.produces, (resource) => resource.id),
    ]),
);
const overridePowered = Object.fromEntries(
  Object.entries(finalBuildings)
    .filter(([, building]) => building.overridePowered !== undefined)
    .map(([id, building]) => [id, building.overridePowered]),
);
const fingerprint = createHash("sha256")
  .update(
    JSON.stringify({
      finalBuildingIds: Object.keys(finalBuildings),
      supportTrace,
      defaultConsumptions,
      alternateConsumptions,
      gameMax,
      produces,
      overridePowered,
    }),
  )
  .digest("hex");

assert.deepEqual(
  {
    buildings: Object.keys(finalBuildings).length,
    supports: supportTrace.length,
    consumptions: consumptionRecords.length,
    gameMax: Object.keys(gameMax).length,
    produces: Object.keys(produces).length,
    overrides: Object.keys(overridePowered).length,
    fingerprint,
  },
  {
    buildings: 180,
    supports: 88,
    consumptions: 78,
    gameMax: 60,
    produces: 6,
    overrides: 9,
    fingerprint:
      "e2492fe3013b67ce5ef87fe9b005bb1b129758a121580c60079fd7f970d0f186",
  },
);

console.log("State initialization bundled characterization tests passed");
