import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const actions = [];
const document = { getElementById: () => null };
const jquery = () => ({ ready() {} });
const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document,
  $: jquery,
});

assert.equal(typeof hooks.autoFleetOuter, "function");
const fighter = { class: "corvette", kind: "fighter" };
const manager = {
  Regions: ["spc_red"],
  ClassCrew: { corvette: 2 },
  _explorerBlueprint: { class: "explorer", kind: "explorer" },
  initFleet: () => true,
  getWeighting: () => 1,
  getMaxDefense: () => 0.9,
  getMaxScouts: () => 0,
  isUnlocked: () => true,
  syndicate: (_region, extra) => (extra ? { s: 100 } : 0.5),
  getScoutBlueprint: () => ({ class: "corvette", kind: "scout" }),
  getFighterBlueprint: () => fighter,
  shipCount: () => 0,
  avail: () => true,
  updateNextShip: (ship) => actions.push(["next", ship?.kind ?? null]),
  getShipName: () => "Corvette",
  getLocName: () => "Red Planet",
  getMissingResource: () => null,
  build: (ship, region) => {
    actions.push(["build", ship.kind, region]);
    return true;
  },
};
Object.defineProperty(manager, "nextShipName", {
  set(value) {
    actions.push(["name", value]);
  },
  get: () => "Corvette to Red Planet",
});
const WarManager = { currentCityGarrison: 100 };
const settings = {
  fleetOuterShips: "custom",
  fleetOuterCrew: 30,
  fleetExploreTau: false,
  authorityManage: false,
  generalMinimumAuthority: 100,
};
const resources = {};
const game = {
  global: {
    race: { universe: "evil" },
    tech: { tauceti: 0, eris: 2 },
    space: { shipyard: { blueprint: fighter } },
  },
};
const GameLog = {
  logSuccess: (id, message, categories) =>
    actions.push(["log", id, message, Array.from(categories)]),
};

hooks.setFleetManagersTestContext({ game, settings, resources });
hooks.setWave1TestManagers({ WarManager, MinorTraitManager: {} });
hooks.setWave5TestManagers({
  StorageManager: {},
  FleetManagerOuter: manager,
  FleetManager: {},
  MechManager: {},
});
hooks.setForeignAffairsManagersTestContext({ GameLog });

hooks.autoFleetOuter();
assert.deepEqual(actions, [
  ["next", "fighter"],
  ["name", "Corvette to Red Planet"],
  ["build", "fighter", "spc_red"],
  [
    "log",
    "outer_fleet",
    "Corvette has been assembled, and dispatched to Red Planet.",
    ["combat"],
  ],
]);

console.log("Outer fleet bundled characterization tests passed");
