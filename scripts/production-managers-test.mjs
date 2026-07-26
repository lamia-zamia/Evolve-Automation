import assert from "node:assert/strict";
import { createProductionManagers } from "../src/game/production-managers.ts";

let game;
let buildings;
let techOk = true;
let lumber = false;
const clicks = [];

// addProps is an identity stub. normalizeProperties mirrors the real helper's
// key behavior for these tests: an `unlocked` function becomes a boolean getter.
const addProps = (target) => target;
const normalizeProperties = (target) => {
  for (const key in target) {
    const entry = target[key];
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.unlocked === "function"
    ) {
      const fn = entry.unlocked;
      Object.defineProperty(entry, "unlocked", {
        get: fn,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return target;
};
class ResourceProductionCost {
  constructor(resource) {
    this.resource = resource;
  }
}

const makeRes = (id, unlocked = true) => ({ id, isUnlocked: () => unlocked });
const resources = Object.fromEntries(
  [
    "Lumber",
    "Coal",
    "Oil",
    "Adamantite",
    "Uranium",
    "Aluminium",
    "Iron",
    "Steel",
    "Iridium",
    "Infernite",
    "Money",
    "Furs",
    "Alloy",
    "Copper",
    "Polymer",
    "Nano_Tube",
    "Neutronium",
    "Stanene",
    "Food",
  ].map((id) => [id, makeRes(id)]),
);
const replicableResources = ["Lumber", "Coal"];

const industryVue = {
  avail: (r) => r !== "locked",
  setVal: (r) => clicks.push(["setVal", r]),
  addItem: (r) => clicks.push(["addItem", r]),
  subItem: (r) => clicks.push(["subItem", r]),
  addWood: () => clicks.push(["addWood"]),
  subWood: () => clicks.push(["subWood"]),
};
let vueLookup = () => industryVue;

const {
  SmelterManager,
  FactoryManager,
  ReplicatorManager,
  DroidManager,
  GrapheneManager,
} = createProductionManagers({
  getGame: () => game,
  getResources: () => resources,
  getBuildings: () => buildings,
  getVueById: (id) => vueLookup(id),
  callVueMethod: () => 0,
  getKeyManager: () => ({
    click: (count) => Array.from({ length: count }, (_, i) => i),
  }),
  haveTech: () => techOk,
  isLumberRace: () => lumber,
  addProps,
  normalizeProperties,
  replicableResources,
  ResourceProductionCost,
});

// ---------- Replicator ----------
// Productions built from replicableResources.
assert.deepEqual(Object.keys(ReplicatorManager.Productions).sort(), [
  "Coal",
  "Lumber",
]);
assert.equal(ReplicatorManager.Productions.Lumber.resource, resources.Lumber);
// normalizeProperties turns `unlocked` into a boolean getter.
assert.equal(ReplicatorManager.Productions.Lumber.unlocked, true);

techOk = false;
assert.equal(ReplicatorManager.initIndustry(), false); // no replicator tech
techOk = true;
assert.equal(ReplicatorManager.initIndustry(), true);
clicks.length = 0;
ReplicatorManager.setResource("Iron");
assert.deepEqual(clicks, [["setVal", "Iron"]]);
clicks.length = 0;
ReplicatorManager.setResource("locked"); // avail() false -> no setVal
assert.equal(clicks.length, 0);

// ---------- Droid ----------
assert.deepEqual(Object.keys(DroidManager.Productions), [
  "Adamantite",
  "Uranium",
  "Coal",
  "Aluminium",
]);
buildings = { AlphaMiningDroid: { count: 0 } };
assert.equal(DroidManager.initIndustry(), false);
buildings.AlphaMiningDroid.count = 1;
assert.equal(DroidManager.initIndustry(), true);

game = {
  global: {
    interstellar: {
      mining_droid: { adam: 1, uran: 2, coal: 3, alum: 4, on: 12 },
    },
  },
};
assert.equal(DroidManager.currentOperating(), 10); // 1+2+3+4
assert.equal(DroidManager.maxOperating(), 12);
assert.equal(DroidManager.currentProduction({ id: "coal" }), 3);
clicks.length = 0;
DroidManager.increaseProduction({ id: "adam" }, 2);
assert.deepEqual(clicks, [
  ["addItem", "adam"],
  ["addItem", "adam"],
]);
clicks.length = 0;
DroidManager.decreaseProduction({ id: "adam" }, -1); // delegates to increase
assert.deepEqual(clicks, [["addItem", "adam"]]);

// ---------- Graphene ----------
// Fuel costs carry the resource for unlock checks.
assert.equal(GrapheneManager.Fuels.Lumber.cost.resource, resources.Lumber);

// Plant selection by race variant.
game = { global: { race: {} } };
buildings = {
  AlphaGraphenePlant: { instance: { count: 0, on: 3, Lumber: 5 } },
  TitanGraphene: { instance: { count: 1 } },
  WastelandTwistedLab: { instance: { count: 1 } },
};
assert.equal(GrapheneManager.initIndustry(), false); // alpha plant count 0
buildings.AlphaGraphenePlant.instance.count = 1;
assert.equal(GrapheneManager.initIndustry(), true);
assert.equal(GrapheneManager._graphPlant, buildings.AlphaGraphenePlant);

game = { global: { race: { truepath: true } } };
GrapheneManager.initIndustry();
assert.equal(GrapheneManager._graphPlant, buildings.TitanGraphene);
game = { global: { race: { warlord: true } } };
GrapheneManager.initIndustry();
assert.equal(GrapheneManager._graphPlant, buildings.WastelandTwistedLab);

// maxOperating / fueledCount read the selected plant.
GrapheneManager._graphPlant = buildings.AlphaGraphenePlant;
assert.equal(GrapheneManager.maxOperating(), 3);
assert.equal(GrapheneManager.fueledCount({ id: "Lumber" }), 5);

// Fuel clicks gated on resource unlock.
GrapheneManager._industryVue = industryVue;
clicks.length = 0;
GrapheneManager.increaseFuel(GrapheneManager.Fuels.Lumber, 2);
assert.deepEqual(clicks, [["addWood"], ["addWood"]]);
resources.Lumber.isUnlocked = () => false;
clicks.length = 0;
assert.equal(
  GrapheneManager.increaseFuel(GrapheneManager.Fuels.Lumber, 2),
  false,
);
assert.equal(clicks.length, 0);

// ---------- Smelter ----------
// Production/fuel unlock getters resolve live.
techOk = false;
assert.equal(SmelterManager.Productions.Steel.unlocked, false); // needs tech
techOk = true;
assert.equal(SmelterManager.Productions.Steel.unlocked, true);
game = {
  global: { resource: { Oil: { display: true }, Coal: { display: false } } },
};
assert.equal(SmelterManager.Fuels.Oil.unlocked, true);
assert.equal(SmelterManager.Fuels.Coal.unlocked, false);

// initIndustry: steelen or no-smelter (without exemptions) blocks.
game = { global: { race: { steelen: true } } };
buildings = { Smelter: { count: 5 } };
assert.equal(SmelterManager.initIndustry(), false);
techOk = false; // no "isolation" exemption for the no-smelter check
game = { global: { race: {} } };
buildings = { Smelter: { count: 0 } };
assert.equal(SmelterManager.initIndustry(), false);
buildings.Smelter.count = 1;
assert.equal(SmelterManager.initIndustry(), true);

// Operating math + fueled/smelting counts honor unlock.
game = { global: { city: { smelter: { cap: 20, Star: 3, Oil: 6, Iron: 8 } } } };
assert.equal(SmelterManager.maxOperating(), 17); // cap 20 - Star 3
assert.equal(SmelterManager.extraOperating(), 3);
assert.equal(SmelterManager.fueledCount({ id: "Oil", unlocked: true }), 6);
assert.equal(SmelterManager.fueledCount({ id: "Oil", unlocked: false }), 0);
assert.equal(SmelterManager.smeltingCount({ id: "Iron", unlocked: true }), 8);

// Fuel/metal clicks (Productions[id].unlocked getter gates smelting).
SmelterManager._industryVue = {
  addFuel: (id) => clicks.push(["addFuel", id]),
  subFuel: (id) => clicks.push(["subFuel", id]),
  addMetal: (id) => clicks.push(["addMetal", id]),
  subMetal: (id) => clicks.push(["subMetal", id]),
};
clicks.length = 0;
SmelterManager.increaseFuel({ id: "Oil", unlocked: true }, 2);
assert.deepEqual(clicks, [
  ["addFuel", "Oil"],
  ["addFuel", "Oil"],
]);
clicks.length = 0;
techOk = true;
SmelterManager.increaseSmelting("Steel", 1);
assert.deepEqual(clicks, [["addMetal", "Steel"]]);

// ---------- Factory ----------
// f_rate reads the tech-indexed table.
game = {
  f_rate: { Lux: { fur: [1, 2, 3] } },
  global: { tech: { factory: 2 } },
};
assert.equal(FactoryManager.f_rate("Lux", "fur"), 3);
game.global.tech.factory = 0;
assert.equal(FactoryManager.f_rate("Lux", "fur"), 1);

// initIndustry needs at least one factory variant.
buildings = {
  Factory: { count: 0 },
  RedFactory: { count: 0 },
  TauFactory: { count: 0 },
  WastelandHellFactory: { count: 0 },
};
assert.equal(FactoryManager.initIndustry(), false);
buildings.Factory.count = 1;
assert.equal(FactoryManager.initIndustry(), true);

// maxOperating base sum when no factory production state is present.
techOk = false; // no "isolation" -> Tau factory multiplier is 3
buildings = {
  Factory: { stateOnCount: 2 },
  RedFactory: { stateOnCount: 1 },
  AlphaMegaFactory: { stateOnCount: 1 },
  TauFactory: { stateOnCount: 1 },
  WastelandHellFactory: { stateOnCount: 0 },
};
game = { global: { tech: {}, city: {} } }; // no factory object -> early return
// 2 + 1 + 1*2 + 1*3 (no isolation) + 0 = 8
assert.equal(FactoryManager.maxOperating(), 8);

// currentProduction / currentOperating read live counts.
game = { global: { city: { factory: { Lux: 4, Alloy: 5 } } } };
assert.equal(
  FactoryManager.currentProduction({ id: "Lux", unlocked: true }),
  4,
);
assert.equal(
  FactoryManager.currentProduction({ id: "Lux", unlocked: false }),
  0,
);

// increase/decrease clicks gated on production.unlocked.
FactoryManager._industryVue = {
  addItem: (id) => clicks.push(["addItem", id]),
  subItem: (id) => clicks.push(["subItem", id]),
};
clicks.length = 0;
FactoryManager.increaseProduction({ id: "Lux", unlocked: true }, 2);
assert.deepEqual(clicks, [
  ["addItem", "Lux"],
  ["addItem", "Lux"],
]);
clicks.length = 0;
assert.equal(
  FactoryManager.increaseProduction({ id: "Lux", unlocked: false }, 2),
  false,
);
assert.equal(clicks.length, 0);

console.log("Production managers module tests passed");
