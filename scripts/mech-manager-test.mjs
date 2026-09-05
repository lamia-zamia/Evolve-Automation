import assert from "node:assert/strict";
import { createMechManager } from "../src/game/mech-manager.ts";
import { createGameMechControls } from "../src/adapters/browser/game-mech-controls.ts";
import { createGameMechListControls } from "../src/adapters/browser/game-mech-list-controls.ts";

let game;
let settings;
let resources;
let buildings;
let poly;
let GameLog = { logSuccess() {} };
let needSandboxBypass = false;
let win;
let Sortable;
let vueById = {};
let elementById = {};
let observerCallback;
const trace = [];

const { MechManager } = createMechManager({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  getBuildings: () => buildings,
  getPoly: () => poly,
  getGameLog: () => GameLog,
  getUpdateDebugData: () => () => trace.push(["debug"]),
  getCreateMechInfo: () => () => trace.push(["info"]),
  getMechControls: () =>
    createGameMechControls({
      getVueById: (id) => vueById[id],
    }),
  getMechListControls: () =>
    createGameMechListControls({
      getVueById: (id) => vueById[id],
      getDocument: () => ({ getElementById: (id) => elementById[id] }),
      getSortable: () => Sortable,
      getPageSortable: () => win.Sortable,
      isSandboxBypass: () => needSandboxBypass,
      cloneIntoPage: (value, options) => {
        trace.push(["clone", options.cloneFunctions]);
        return value;
      },
    }),
  kCombinations: (values, size) => {
    if (size === 0) return [[]];
    if (size === 1) return values.map((value) => [value]);
    return [];
  },
  createMutationObserver: (callback) => {
    observerCallback = callback;
    return { observe() {} };
  },
  randomSource: { nextUnit: () => 0 },
});

game = {
  global: {
    portal: {
      spire: {
        count: 1,
        type: "grass",
        status: {},
        boss: "boss",
        progress: 0,
      },
      mechbay: {
        scouts: 0,
        max: 10,
        bay: 2,
        active: 1,
        mechs: [
          {
            size: "small",
            chassis: "wheel",
            hardpoint: ["laser"],
            equip: [],
            infernal: false,
          },
          {
            size: "collector",
            chassis: "hover",
            hardpoint: [],
            equip: [],
            infernal: false,
          },
        ],
      },
    },
    blood: { prepared: 0, wrath: 0 },
    stats: { achieve: {} },
    race: {},
  },
  loc: (key) => key,
};
settings = {
  mechCollectorValue: 20_000,
  mechSpecial: "never",
  mechInfernalCollector: false,
  mechFillBay: false,
  mechMinSupply: 0,
  mechMaxCollectors: 0,
  mechScouts: 0,
  mechSize: "small",
  mechSizeGravity: "small",
};
resources = {
  Supply: { storageRatio: 1, rateOfChange: 1, maxQuantity: 1_000 },
  Soul_Gem: { spareQuantity: 1_000 },
};
buildings = { SpireMechBay: { count: 1 } };
poly = {
  terrainRating: (_mech, factor) => factor,
  monsters: {
    boss: {
      weapon: {
        laser: 3,
        kinetic: 2,
        shotgun: 1,
        missile: 1,
        flame: 1,
        plasma: 1,
        sonic: 1,
        tesla: 1,
      },
    },
  },
  weaponPower: (_mech, value) => value,
  mechCost: (size) => ({
    s: size === "collector" ? 0 : 10,
    c: size === "collector" ? 5 : 20,
  }),
};
win = {};
Sortable = {
  get: () => ({
    options: {
      onEnd: (event) =>
        trace.push(["drag", event.oldDraggableIndex, event.newDraggableIndex]),
    },
  }),
};

// Observer dispatch is inert until invoked, then resolves the latest callbacks.
observerCallback();
assert.deepEqual(trace.splice(0), [["debug"], ["info"]]);

// Initialization gates.
game.global.race.warlord = true;
assert.equal(MechManager.initLab(), false);
game.global.race.warlord = false;
buildings.SpireMechBay.count = 0;
assert.equal(MechManager.initLab(), false);
buildings.SpireMechBay.count = 1;
assert.equal(MechManager.initLab(), false);

vueById.mechAssembly = {};
vueById.mechList = {};
elementById.mechList = { id: "mechList" };
MechManager.updateSpire();
MechManager.bestSize = ["small"];
MechManager.bestMech.small = { size: "small", power: 1 };
assert.equal(MechManager.initLab(), true);
assert.equal(MechManager.activeMechs.length, 1);
assert.equal(MechManager.inactiveMechs.length, 1);
assert.equal(MechManager.activeMechs[0].id, 0);
assert.equal(MechManager.inactiveMechs[0].id, 1);
assert.ok(MechManager.mechsPower > 0);

// Best-body/weapon selection and random assembly inputs.
MechManager.bestWeapon = [];
MechManager.updateBestWeapon();
assert.deepEqual(MechManager.bestWeapon, ["laser"]);
MechManager.updateBestBody("small");
assert.equal(MechManager.bestBody.small.length, 1);
assert.equal(MechManager.bestBody.small[0].chassis, "wheel");
const randomMech = MechManager.getRandomMech("small");
assert.deepEqual(randomMech.hardpoint, ["laser"]);
assert.equal(randomMech.chassis, "wheel");

// Prepared-level space rules and live dependency refresh.
assert.equal(MechManager.getMechSpace({ size: "medium" }, 0), 5);
game.global.blood.prepared = 2;
assert.equal(MechManager.getMechSpace({ size: "medium" }), 4);
poly.mechCost = () => ({ s: 8, c: 15 });
assert.deepEqual(MechManager.getMechRefund({ size: "small" }), [4, 5]);

// Firefox sandbox drag path clones the synthetic Sortable event.
needSandboxBypass = true;
win = { Sortable };
MechManager.dragMech(4, 2);
assert.deepEqual(trace, [
  ["clone", true],
  ["drag", 4, 2],
]);

// Regression: the game leaves `blood` as `{}` until Prepared/Wrath boons are
// bought, so blood.prepared/wrath are undefined. The hash must still be a stable
// finite number across ticks; if it becomes NaN, `!== oldHash` is always true and
// initLab pins isActive on every tick, which freezes the "Building mechs..."
// weighting and blocks every Supply-cost spire building.
game.global.blood = {};
MechManager.updateSpire();
assert.ok(Number.isFinite(MechManager.stateHash), "hash must be finite");
assert.equal(
  MechManager.updateSpire(),
  false,
  "unchanged spire config must report no change",
);
game.global.blood.prepared = 1;
assert.equal(
  MechManager.updateSpire(),
  true,
  "buying a blood boon must register as a change",
);

console.log("Mech manager tests passed");
