import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  Sortable: {
    get: () => ({
      options: {
        onEnd: (event) =>
          trace.push([
            "drag",
            event.oldDraggableIndex,
            event.newDraggableIndex,
          ]),
      },
    }),
  },
  cloneInto: (value) => value,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const MechManager = hooks.MechManager;
const game = {
  global: {
    portal: {
      spire: {
        count: 2,
        type: "sand",
        status: { freeze: true },
        boss: "boss",
        progress: 40,
      },
      mechbay: {
        scouts: 1,
        max: 10,
        bay: 5,
        mechs: [],
        active: 0,
      },
    },
    blood: { prepared: 2, wrath: 4 },
    stats: { achieve: { gladiator: { l: 2 } } },
    race: {},
  },
  loc: (key) => key,
};
const settings = {
  mechCollectorValue: 100,
  mechSpecial: "never",
  mechInfernalCollector: false,
  mechFillBay: true,
  mechMinSupply: 5,
  mechMaxCollectors: 0.5,
  mechScouts: 0.3,
  mechSize: "large",
  mechSizeGravity: "small",
};
const resources = {
  Supply: { storageRatio: 1, rateOfChange: 10, maxQuantity: 100 },
  Soul_Gem: { spareQuantity: 100 },
};
const poly = {
  terrainRating: (_mech, terrainFactor) => terrainFactor * 2,
  monsters: {
    boss: {
      weapon: {
        laser: 2,
        kinetic: 1,
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
  mechCost: (size, infernal = false) => ({
    s: size === "titan" ? 40 : 10,
    c: (size === "titan" ? 120 : 30) * (infernal ? 2 : 1),
  }),
};
hooks.setMechManagerTestContext({
  game,
  settings,
  resources,
  buildings: { SpireMechBay: { count: 1 } },
  poly,
  win: sandbox,
  GameLog: {
    logSuccess: (...args) => trace.push(["log", ...args]),
  },
  needSandboxBypass: false,
});

const mech = {
  id: 0,
  size: "small",
  chassis: "wheel",
  hardpoint: ["laser", "laser"],
  equip: [],
  infernal: false,
};
assert.equal(MechManager.collectorValue, 200);
assert.equal(MechManager.updateSpire(), true);
assert.equal(MechManager.updateSpire(), false);
assert.equal(MechManager.getBodyMod(mech), 0.45);
assert.equal(MechManager.getWeaponMod(mech), 4);
assert.equal(MechManager.getSizeMod(mech), 0.0025);
assert.equal(MechManager.getSizeMod({ ...mech, size: "collector" }), 0.125);
assert.ok(Math.abs(MechManager.getProgressMod() - 0.84) < 1e-12);
assert.deepEqual(JSON.parse(JSON.stringify(MechManager.getPreferredSize())), [
  "collector",
  true,
]);
settings.mechFillBay = false;
assert.deepEqual(JSON.parse(JSON.stringify(MechManager.getPreferredSize())), [
  "small",
  true,
]);
game.global.portal.mechbay.scouts = 2;
assert.deepEqual(JSON.parse(JSON.stringify(MechManager.getPreferredSize())), [
  "large",
  false,
]);

const stats = MechManager.getMechStats(mech);
assert.ok(Math.abs(stats.power - 0.0045) < 1e-12);
assert.ok(Math.abs(stats.efficiency - 0.00225) < 1e-12);
assert.ok(Math.abs(stats.gems_eff - 0.0009) < 1e-12);
assert.ok(Math.abs(stats.supply_eff - 0.000225) < 1e-12);
assert.deepEqual(
  JSON.parse(JSON.stringify(MechManager.getMechCost(mech))),
  [10, 30, 2],
);
assert.deepEqual(
  JSON.parse(JSON.stringify(MechManager.getMechRefund(mech))),
  [5, 10],
);
MechManager.mechsPower = 2;
assert.ok(Math.abs(MechManager.getTimeToClear() - 35.714285714285715) < 1e-12);

MechManager.bestMech.small = { power: stats.power };
MechManager._assemblyVue = {
  b: {},
  setSize: (value) => trace.push(["size", value]),
  setType: (value) => trace.push(["type", value]),
  setWep: (...args) => trace.push(["weapon", ...args]),
  setEquip: (...args) => trace.push(["equip", ...args]),
  build: () => trace.push(["build"]),
};
MechManager._listVue = {
  $el: {},
  scrap: (id) => trace.push(["scrap", id]),
};
MechManager.buildMech({ ...mech, ...stats });
MechManager.scrapMech(mech);
MechManager.dragMech(3, 1);

assert.deepEqual(JSON.parse(JSON.stringify(trace)), [
  ["size", "small"],
  ["type", "wheel"],
  ["weapon", "laser", 0],
  ["weapon", "laser", 1],
  ["build"],
  [
    "log",
    "mech_build",
    "portal_mech_size_small portal_mech_chassis_wheel (100%) mech has been assembled.",
    ["hell"],
  ],
  ["scrap", 0],
  ["drag", 3, 1],
]);

console.log("Mech manager bundled characterization tests passed");
