import assert from "node:assert/strict";
import { createEntityCatalogs } from "../src/game/entity-catalogs.ts";

class GenericEntity {
  constructor(...args) {
    this.args = args;
  }
}

let publishedResources;
class TestResourceAction extends GenericEntity {
  constructor(...args) {
    super(...args);
    this.resource = publishedResources?.[args[4]];
  }
}

const classNames = [
  "Action",
  "BasicJob",
  "BeltSupport",
  "CityAction",
  "CraftingJob",
  "ElectrolysisSupport",
  "Job",
  "ModalAction",
  "Morale",
  "Pillar",
  "Population",
  "Power",
  "PrestigeResource",
  "Project",
  "Resource",
  "SoulGem",
  "SpaceDock",
  "Supply",
  "Support",
  "Thrall",
  "Troops",
  "WomlingsSupport",
];
const classes = Object.fromEntries(
  classNames.map((name) => [name, GenericEntity]),
);
classes.ResourceAction = TestResourceAction;

let haveTech = (id, level) => `first:${id}:${level}`;
const trace = [];
const catalogs = createEntityCatalogs({
  classes,
  getHaveTech: () => haveTech,
  setResources: (resources) => {
    trace.push(["resources", Object.keys(resources).length]);
    publishedResources = resources;
  },
});

assert.deepEqual(trace, [["resources", 100]]);
assert.deepEqual(
  {
    resources: Object.keys(catalogs.resources).length,
    jobs: Object.keys(catalogs.jobs).length,
    crafter: Object.keys(catalogs.crafter).length,
    buildings: Object.keys(catalogs.buildings).length,
    projects: Object.keys(catalogs.projects).length,
  },
  { resources: 100, jobs: 27, crafter: 9, buildings: 429, projects: 9 },
);
assert.equal(catalogs.buildings.Food.resource, catalogs.resources.Food);
assert.equal(
  catalogs.buildings.TauAssembly.resource,
  catalogs.resources.Population,
);
assert.equal(catalogs.linkedBuildings[0][0], catalogs.buildings.LakeTransport);
assert.equal(catalogs.linkedBuildings[0][1], catalogs.buildings.LakeBireme);

const massDriverOptions = catalogs.buildings.MassDriver.args[4];
assert.equal(massDriverOptions.knowledge(), "first:mass:2");
haveTech = (id, level) => `second:${id}:${level}`;
assert.equal(massDriverOptions.knowledge(), "second:mass:2");

console.log("Entity catalogs module tests passed");
