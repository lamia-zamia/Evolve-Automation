import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};

function makeNode() {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return 0;
      if (property === Symbol.iterator) return function* () {};
      return () => proxy;
    },
  });
  return proxy;
}

function jquery() {
  return makeNode();
}
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  alert: () => {},
  document: {
    hidden: false,
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({}),
  },
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const classes = hooks.entityClasses;
assert.equal(Object.keys(classes).length, 32);
assert.equal(
  JSON.stringify(Object.keys(classes)),
  JSON.stringify([
    "Job",
    "BasicJob",
    "CraftingJob",
    "Resource",
    "SoulGem",
    "Troops",
    "Supply",
    "Power",
    "Support",
    "BeltSupport",
    "ElectrolysisSupport",
    "WomlingsSupport",
    "PrestigeResource",
    "Population",
    "Morale",
    "Thrall",
    "ResourceProductionCost",
    "Action",
    "CityAction",
    "Pillar",
    "ResourceAction",
    "EvolutionAction",
    "SpaceDock",
    "ModalAction",
    "Project",
    "Technology",
    "Race",
    "Trigger",
    "MinorTrait",
    "MutableTrait",
    "MajorTrait",
    "GenusTrait",
  ]),
);

assert.equal(classes.BasicJob.prototype instanceof classes.Job, true);
assert.equal(classes.CraftingJob.prototype instanceof classes.Job, true);
assert.equal(classes.SoulGem.prototype instanceof classes.Resource, true);
assert.equal(classes.CityAction.prototype instanceof classes.Action, true);
assert.equal(
  classes.GenusTrait.prototype instanceof classes.MutableTrait,
  true,
);

const job = new classes.Job("farmer", "Farmer", { basic: true });
assert.equal(job._originalId, "farmer");
assert.equal(job._originalName, "Farmer");
assert.equal(job._workerBinding, "civ-farmer");
assert.equal(job.is.basic, true);

const resource = new classes.Resource("Iron", "Iron", { trade: true });
assert.equal(resource.name, "Iron");
assert.equal(resource._id, "Iron");
assert.equal(resource.is.trade, true);
assert.equal(resource.currentQuantity, 0);
assert.equal(resource.maxQuantity, 0);

const cost = new classes.ResourceProductionCost("Iron", 4, 2);
assert.equal(cost.resource, "Iron");
assert.equal(cost.quantity, 4);
assert.equal(cost.minRateOfChange, 2);

const action = new classes.Action("Test", "city", "test", "", {
  building: true,
});
assert.equal(action.name, "Test");
assert.equal(action._tab, "city");
assert.equal(action.id, "test");
assert.equal(action.is.building, true);

const technology = new classes.Technology("mad");
assert.equal(technology._id, "mad");
assert.equal(technology._vueBinding, "tech-mad");

const trigger = new classes.Trigger(
  3,
  2,
  "building",
  "city-test",
  1,
  "build",
  "city-target",
  4,
);
assert.equal(trigger.seq, 3);
assert.equal(trigger.priority, 2);
assert.equal(trigger.requirementType, "building");
assert.equal(trigger.requirementId, "city-test");
assert.equal(trigger.actionType, "build");
assert.equal(trigger.actionCount, 4);

const trait = new classes.MinorTrait("mastery");
assert.equal(trait.traitName, "mastery");

console.log("Entity classes bundled characterization tests passed");
