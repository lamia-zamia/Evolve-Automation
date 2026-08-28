import assert from "node:assert/strict";
import { createStateInitialization } from "../src/game/state-initialization.ts";

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

const retainedBuildingIds = [
  "Windmill",
  "SunSwarmSatellite",
  "ProximaDyson",
  "ProximaDysonSphere",
  "ProximaOrichalcumSphere",
  "ProximaElysaniteSphere",
  "BlackholeStellarEngine",
  "WastelandIncinerator",
];

function makeContext(label) {
  const consumptions = [];
  const buildings = lazyCatalog((id) => ({
    id,
    name: id,
    definition: true,
    powered: 0,
    autoStateSmart: false,
    addSupport() {},
    addResourceConsumption(resource, amount) {
      consumptions.push({ building: id, resource, amount });
    },
  }));
  retainedBuildingIds.forEach((id) => void buildings[id]);
  return {
    label,
    game: {
      global: {
        race: { universe: "standard" },
        stats: { achieve: {} },
        power: [],
      },
    },
    resources: lazyCatalog((id) => ({ id: `${label}:${id}`, cost: {} })),
    JobManager: {},
    crafter: { [`${label}Craft`]: { id: `${label}Craft` } },
    buildings,
    projects: lazyCatalog((id) => ({ id: `${label}:${id}` })),
    updateCraftCost: () => traces.push([label, "craft"]),
    updateTabs: (force) => traces.push([label, "tabs", force]),
    isLumberRace: () => false,
    haveTech: () => false,
    consumptions,
  };
}

const traces = [];
const logs = [];
let context = makeContext("first");
const { initialiseState } = createStateInitialization({
  getGame: () => context.game,
  getResources: () => context.resources,
  getJobManager: () => context.JobManager,
  getCrafter: () => context.crafter,
  getBuildings: () => context.buildings,
  setBuildings: (buildings) => (context.buildings = buildings),
  getProjects: () => context.projects,
  getUpdateCraftCost: () => context.updateCraftCost,
  getUpdateTabs: () => context.updateTabs,
  getHaveTech: () => context.haveTech,
  log: (message) => logs.push(message),
});

initialiseState();
const firstContext = context;
assert.deepEqual(traces, [
  ["first", "craft"],
  ["first", "tabs", false],
]);
assert.equal(firstContext.JobManager.craftingJobs[0].id, "firstCraft");
assert.deepEqual({ ...firstContext.resources.Crates.cost }, { Plywood: 10 });

firstContext.game.global.race = { universe: "standard", smoldering: true };
assert.deepEqual(
  { ...firstContext.resources.Crates.cost },
  { Chrysotile: 200 },
);
// iron_wood overrides the resource on its own -- warlord is not part of the game's rule.
firstContext.game.global.race = { universe: "standard", iron_wood: true };
assert.deepEqual({ ...firstContext.resources.Crates.cost }, { Lumber: 200 });

const lunaConsumption = firstContext.consumptions.find(
  ({ building, resource }) =>
    building === "SpaceNavBeacon" && resource.id.endsWith("Red_Support"),
);
assert.equal(lunaConsumption.amount(), 0);
firstContext.haveTech = (id, level) => id === "luna" && level === 3;
assert.equal(lunaConsumption.amount(), -1);

const womlingConsumption = firstContext.consumptions.find(
  ({ building }) => building === "TauRedWomlingFarm",
);
assert.equal(womlingConsumption.amount(), 0);
firstContext.buildings = {
  ...firstContext.buildings,
  TauRedWomlingFarm: {
    ...firstContext.buildings.TauRedWomlingFarm,
    autoStateSmart: true,
  },
};
assert.equal(womlingConsumption.amount(), 2);

context = makeContext("second");
initialiseState();
assert.deepEqual(traces.slice(-2), [
  ["second", "craft"],
  ["second", "tabs", false],
]);
assert.equal(context.JobManager.craftingJobs[0].id, "secondCraft");
assert.equal(context.resources.Containers.cost.Steel, 125);
assert.equal(firstContext.JobManager.craftingJobs[0].id, "firstCraft");
assert.deepEqual(logs, []);

console.log("State initialization module tests passed");
