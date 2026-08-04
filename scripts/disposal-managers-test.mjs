import assert from "node:assert/strict";
import { createGameIndustryControls } from "../src/adapters/browser/game-industry-controls.ts";
import { createDisposalManagers } from "../src/game/disposal-managers.ts";

let game;
let settings;
let resources;
let buildings;
let poly;
let tasks = new Set();
const vueCalls = [];
let vueLookup = (id) => ({
  addItem: (r) => vueCalls.push(["addItem", r]),
  subItem: (r) => vueCalls.push(["subItem", r]),
  supplyMore: (r) => vueCalls.push(["supplyMore", r]),
  supplyLess: (r) => vueCalls.push(["supplyLess", r]),
  ejectMore: (r) => vueCalls.push(["ejectMore", r]),
  ejectLess: (r) => vueCalls.push(["ejectLess", r]),
  _id: id,
});

const industryControls = createGameIndustryControls({
  getVueById: (id) => vueLookup(id),
  clickSteps: (count) => Array.from({ length: count }, (_, i) => i),
});

const { NaniteManager, SupplyManager, EjectManager } = createDisposalManagers({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => buildings,
  getPoly: () => poly,
  getVueById: (id) => vueLookup(id),
  getKeyManager: () => ({
    click: (count) => Array.from({ length: count }, (_, i) => i),
  }),
  haveTask: (t) => tasks.has(t),
  industryControls,
});

// ---------- Nanite ----------
game = {
  global: {
    race: { deconstructor: true },
    city: { nanite_factory: { count: 3, Iron: 8 } },
  },
};
buildings = {
  NaniteFactory: { count: 0 },
  RedNaniteFactory: { count: 0 },
  TauNaniteFactory: { count: 0 },
};
assert.equal(NaniteManager.isUnlocked(), false); // no factory
buildings.NaniteFactory.count = 1;
assert.equal(NaniteManager.isUnlocked(), true);
game.global.race.deconstructor = false;
assert.equal(NaniteManager.isUnlocked(), false); // needs deconstructor
game.global.race.deconstructor = true;

resources = { Nanite: { storageRatio: 0.5 } };
assert.equal(NaniteManager.isUseful(), true);
assert.equal(NaniteManager.isConsumable({ id: "Iron" }), true);
assert.equal(NaniteManager.isConsumable({ id: "Nonsense" }), false);
assert.equal(NaniteManager.maxConsume(), 150); // count 3 * 50
assert.equal(NaniteManager.currentConsume("Iron"), 8);

settings = { naniteMode: "mixed" };
assert.deepEqual(NaniteManager.useRatio(), [0.965, -1]);
settings = { naniteMode: "bogus" };
assert.deepEqual(NaniteManager.useRatio(), []);

resources = { Iron: { rateMods: { nanite: 0 } } };
vueCalls.length = 0;
NaniteManager.consumeMore("Iron", 2);
assert.equal(resources.Iron.rateMods.nanite, 2);
assert.deepEqual(vueCalls, [
  ["addItem", "Iron"],
  ["addItem", "Iron"],
]);

// updateResources applies per-resource nanite mods when enabled.
game = {
  global: {
    race: { deconstructor: true },
    city: { nanite_factory: { Iron: 5 } },
  },
};
buildings = {
  NaniteFactory: { count: 1 },
  RedNaniteFactory: { count: 0 },
  TauNaniteFactory: { count: 0 },
};
settings = { autoNanite: true };
const nRes = {
  id: "Iron",
  isUnlocked: () => true,
  rateMods: {},
  rateOfChange: 100,
};
NaniteManager.priorityList = [nRes];
NaniteManager.updateResources();
assert.equal(nRes.rateMods.nanite, 5);
assert.equal(nRes.rateOfChange, 105);
// Disabled: no change.
settings.autoNanite = false;
nRes.rateOfChange = 100;
NaniteManager.updateResources();
assert.equal(nRes.rateOfChange, 100);

// ---------- Supply ----------
buildings = {
  LakeTransport: { count: 0, stateOnCount: 0 },
  LakeBireme: { stateOnCount: 0 },
};
assert.equal(SupplyManager.isUnlocked(), false);
buildings.LakeTransport.count = 2;
assert.equal(SupplyManager.isUnlocked(), true);
poly = { supplyValue: { Iron: { in: 3, out: 7 } } };
assert.equal(SupplyManager.supplyIn("Iron"), 3);
assert.equal(SupplyManager.supplyOut("Iron"), 7);
assert.equal(SupplyManager.supplyOut("Unknown"), 0); // missing -> 0
assert.equal(SupplyManager.isConsumable({ id: "Iron" }), true);
assert.equal(SupplyManager.isConsumable({ id: "Copper" }), false);
game = { global: { portal: { transport: { cargo: { max: 40, Iron: 6 } } } } };
assert.equal(SupplyManager.maxConsume(), 40);
assert.equal(SupplyManager.currentConsume("Iron"), 6);
settings = { supplyMode: "full" };
assert.deepEqual(SupplyManager.useRatio(), [0.975, -1, 0.045]);

resources = { Iron: { rateMods: { supply: 0 } } };
vueCalls.length = 0;
SupplyManager.consumeMore("Iron", 2); // out=7 -> +14
assert.equal(resources.Iron.rateMods.supply, 14);
assert.deepEqual(vueCalls, [
  ["supplyMore", "Iron"],
  ["supplyMore", "Iron"],
]);
// Missing vue short-circuits.
vueLookup = () => undefined;
resources = { Iron: { rateMods: { supply: 0 } } };
assert.equal(SupplyManager.consumeLess("Iron", 1), false);
assert.equal(resources.Iron.rateMods.supply, 0);

// ---------- Eject ----------
buildings = { BlackholeMassEjector: { count: 0 } };
assert.equal(EjectManager.isUnlocked(), false);
buildings.BlackholeMassEjector.count = 1;
assert.equal(EjectManager.isUnlocked(), true);
assert.equal(EjectManager.isUseful(), true);
game = {
  atomic_mass: { Iron: 1 },
  global: { interstellar: { mass_ejector: { on: 2, Iron: 9 } } },
};
assert.equal(EjectManager.isConsumable({ id: "Iron" }), true);
assert.equal(EjectManager.maxConsume(), 2000); // on 2 * 1000
assert.equal(EjectManager.currentConsume("Iron"), 9);

// managedPriorityList excludes Food only for artifical races.
const Food = { id: "Food" };
resources = { Food };
const list = [Food, { id: "Iron" }];
EjectManager.priorityList = list;
game.global.race = {};
assert.equal(EjectManager.managedPriorityList().length, 2);
game.global.race = { artifical: true };
assert.deepEqual(
  EjectManager.managedPriorityList().map((r) => r.id),
  ["Iron"],
);

// updateResources honors autoEject OR the "trash" task.
settings = { autoEject: false };
tasks = new Set();
const eRes = {
  id: "Iron",
  isUnlocked: () => true,
  rateMods: {},
  rateOfChange: 50,
};
EjectManager.priorityList = [eRes];
game = { global: { race: {}, interstellar: { mass_ejector: { Iron: 4 } } } };
buildings = { BlackholeMassEjector: { count: 1 } };
EjectManager.updateResources();
assert.equal(eRes.rateOfChange, 50); // disabled, no trash task
tasks.add("trash");
EjectManager.updateResources();
assert.equal(eRes.rateMods.eject, 4);
assert.equal(eRes.rateOfChange, 54);

console.log("Disposal managers module tests passed");
