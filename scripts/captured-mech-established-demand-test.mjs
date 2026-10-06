import assert from "node:assert/strict";
import { createCapturedProgressionControl } from "../src/bootstrap/captured-progression-control.ts";

const establishedMechRoot = {
  settings: { civTabs: 0, qKey: false, keyMap: { q: "q" } },
  race: {},
  blood: {},
  stats: {},
  tech: {},
  portal: {
    mechbay: {
      max: 1,
      bay: 0,
      active: 0,
      scouts: 0,
      mechs: [],
      blueprint: {
        size: "small",
        chassis: "tread",
        hardpoint: ["laser"],
        equip: ["special", "shields"],
        infernal: false,
      },
    },
    purifier: {
      supply: 1_900_000,
      sup_max: 2_000_000,
      count: 1,
      on: 1,
      diff: 0,
    },
    spire: { count: 1, type: "sand", progress: 0, status: {}, boss: "snake" },
  },
  resource: {
    Soul_Gem: { amount: 100, max: 100, stackable: false, diff: 0 },
    Supply: { amount: 1_000, max: -1, stackable: false },
    Money: { amount: 0, max: 500, stackable: false },
  },
};
const establishedMechLookups = [];
const establishedMechControl = createCapturedProgressionControl({
  rootState: {
    readRoot: () => establishedMechRoot,
    subscribeRootReplaced: () => () => {},
  },
  controls: {
    resolve: (id) => {
      establishedMechLookups.push(id);
      return id === "mechAssembly"
        ? {
            elementId: id,
            generation: 1,
            methods: ["build", "bay", "price", "soul"],
          }
        : undefined;
    },
    invoke: (_handle, method) => ({
      ok: true,
      value: { bay: 5, price: 180_000, soul: 4 }[method],
    }),
    capturedElementIds: () => ["mechAssembly"],
  },
  mountSuppression: {
    available: true,
    withoutMounting: () => {
      throw new Error("demand must not discover Building panels");
    },
  },
  panels: {
    open: () => {
      throw new Error("demand must not open panels");
    },
  },
  drawnActions: {
    read: () => {
      throw new Error("demand must not sample drawn offers");
    },
    exists: () => {
      throw new Error("demand must not discover offers");
    },
  },
  arpa: {
    ensureCaptured: () => ({ kind: "captured" }),
    readOffers: () => [],
    buildPercent: () => ({
      kind: "unavailable",
      reason: "project builds are not exercised by this test",
    }),
  },
  readSettings: () => ({
    autoMech: true,
    mechBuild: "user",
    autoBuild: true,
    mechBaysFirst: true,
    mechFillBay: false,
    mechSaveSupplyRatio: 0,
  }),
  nowMs: () => 0,
});

// A priced design larger than the bay invokes the expansion callback. Its missing established
// catalog is unavailable; demand must stand down without letting that callback discover one.
establishedMechLookups.length = 0;
assert.deepEqual(establishedMechControl.mechDemand.read().plan, {
  status: "none",
});
assert.deepEqual(establishedMechLookups, ["mechAssembly"]);
assert.equal(
  establishedMechControl.readEstablishedStorageBuildTargets(),
  undefined,
);
// The owner's accessor is still allowed to enter tab discovery, unlike the demand callback.
establishedMechControl.readCanExpandMechBay();
assert.ok(establishedMechLookups.some((id) => id !== "mechAssembly"));
console.log("captured established Mech demand: passed");
