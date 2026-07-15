import assert from "node:assert/strict";
import { createEconomyManagers } from "../src/game/economy-managers.ts";

let game;
let resources;
let buildings;
let techOk = true;
const clicks = [];
let domNodes = {};
let vueMap = {};
const logs = [];
let modalOpen = false;
const modalCalls = [];

const documentStub = {
  getElementById: (id) => domNodes["#" + id] ?? null,
  querySelector: (sel) => domNodes[sel] ?? null,
};

const WindowManager = {
  isOpen: () => modalOpen,
  openModalWindowWithCallback: (node, title, cb) => {
    modalCalls.push({ node, title });
    cb(); // run the callback immediately to exercise it
  },
};
const GameLog = {
  logSuccess: (kind, msg) => logs.push(msg),
};

const { GalaxyTradeManager, GovernmentManager, MarketManager, StorageManager } =
  createEconomyManagers({
    getGame: () => game,
    getResources: () => resources,
    getBuildings: () => buildings,
    getDocument: () => documentStub,
    getVueById: (id) => vueMap[id],
    getKeyManager: () => ({
      click: (count) => Array.from({ length: count }, (_, i) => i),
    }),
    getWindowManager: () => WindowManager,
    getGameLog: () => GameLog,
    haveTech: (_tech, level) => (level === undefined ? techOk : techOk),
    traitVal: () => 1,
  });

// ---------- GalaxyTrade ----------
buildings = {
  GorddonFreighter: { count: 0 },
  Alien1SuperFreighter: { count: 0 },
};
vueMap.galaxyTrade = {
  zero: (p) => clicks.push(["zero", p]),
  more: (p) => clicks.push(["more", p]),
  less: (p) => clicks.push(["less", p]),
};
assert.equal(GalaxyTradeManager.initIndustry(), false);
buildings.GorddonFreighter.count = 1;
assert.equal(GalaxyTradeManager.initIndustry(), true);
game = { global: { galaxy: { trade: { cur: 5, max: 12, fHelium: 4 } } } };
assert.equal(GalaxyTradeManager.currentOperating(), 5);
assert.equal(GalaxyTradeManager.maxOperating(), 12);
assert.equal(GalaxyTradeManager.currentProduction("Helium"), 4);
GalaxyTradeManager._industryVue = vueMap.galaxyTrade;
clicks.length = 0;
GalaxyTradeManager.increaseProduction("Helium", 2);
GalaxyTradeManager.decreaseProduction("Helium", -1); // delegates to increase
assert.deepEqual(clicks, [
  ["more", "Helium"],
  ["more", "Helium"],
  ["more", "Helium"],
]);

// ---------- Government ----------
techOk = true;
assert.equal(GovernmentManager.Types.theocracy.isUnlocked(), true);
assert.equal(GovernmentManager.Types.autocracy.isUnlocked(), true);
assert.equal(GovernmentManager.Types.anarchy.isUnlocked(), false);
techOk = false;
assert.equal(GovernmentManager.Types.republic.isUnlocked(), false);

// isUnlocked/isEnabled driven by DOM.
domNodes = {};
assert.equal(GovernmentManager.isUnlocked(), false); // no node
domNodes["#govType"] = { style: { display: "none" } };
assert.equal(GovernmentManager.isUnlocked(), false); // hidden
domNodes["#govType"] = { style: { display: "block" } };
assert.equal(GovernmentManager.isUnlocked(), true);
domNodes["#govType button"] = { getAttribute: () => "disabled" };
assert.equal(GovernmentManager.isEnabled(), false);
domNodes["#govType button"] = { getAttribute: () => null };
assert.equal(GovernmentManager.isEnabled(), true);

// setGovernment: no-op when already current or modal open.
game = { global: { civic: { govern: { type: "democracy" } } }, loc: (k) => k };
assert.equal(GovernmentManager.currentGovernment(), "democracy");
modalCalls.length = 0;
GovernmentManager.setGovernment("democracy"); // already current
assert.equal(modalCalls.length, 0);
modalOpen = true;
GovernmentManager.setGovernment("oligarchy"); // modal open
assert.equal(modalCalls.length, 0);
// Real revolution opens the modal and runs the callback.
modalOpen = false;
vueMap.govModal = { setGov: (g) => clicks.push(["setGov", g]) };
logs.length = 0;
clicks.length = 0;
GovernmentManager.setGovernment("oligarchy");
assert.equal(modalCalls.length, 1);
assert.equal(logs.length, 1);
assert.deepEqual(clicks, [["setGov", "oligarchy"]]);

// ---------- Market ----------
techOk = true;
assert.equal(MarketManager.isUnlocked(), true);
game = { global: { city: { market: { qty: 250 } } } };
MarketManager.updateData();
assert.equal(MarketManager.multiplier, 250);

// Priority sort.
MarketManager.priorityList = [
  { marketPriority: 2, id: "b" },
  { marketPriority: 1, id: "a" },
];
MarketManager.sortByPriority();
assert.deepEqual(
  MarketManager.priorityList.map((r) => r.id),
  ["a", "b"],
);

// Multiplier clamps to [1, max].
vueMap["market-qty"] = { qty: 0, limit: () => 100 };
MarketManager.setMultiplier(500);
assert.equal(MarketManager.multiplier, 100);
MarketManager.setMultiplier(0);
assert.equal(MarketManager.multiplier, 1);

// Unit prices (traitVal stubbed to 1 -> buy=value, sell=value/4).
game = { global: { resource: { Iron: { value: 40 } } } };
assert.equal(MarketManager.getUnitBuyPrice({ id: "Iron" }), 40);
assert.equal(MarketManager.getUnitSellPrice({ id: "Iron" }), 10);

// Route caps by tech tier and banana.
game = { global: { race: {} } };
techOk = true; // haveTech true for all -> highest tier
assert.equal(MarketManager.getImportRouteCap(), 1000000);
assert.equal(MarketManager.getExportRouteCap(), 1000000); // non-banana mirrors import
game.global.race.banana = true;
assert.equal(MarketManager.getExportRouteCap(), 1000000);

// buy: blocked when money too low, succeeds otherwise.
MarketManager.multiplier = 2;
resources = { Money: { currentQuantity: 50 } };
game = { global: { resource: { Iron: { value: 40 } } } };
vueMap.ironMarket = { purchase: (id) => clicks.push(["purchase", id]) };
const iron = {
  id: "Iron",
  _marketVueBinding: "ironMarket",
  currentQuantity: 0,
};
clicks.length = 0;
assert.equal(MarketManager.buy(iron), false); // 2*40=80 > 50
resources.Money.currentQuantity = 200;
MarketManager.buy(iron);
assert.equal(resources.Money.currentQuantity, 120); // 200 - 2*40
assert.equal(iron.currentQuantity, 2);
assert.deepEqual(clicks, [["purchase", "Iron"]]);

// getMaxTradeRoutes subtracts unmanaged routes.
game = { global: { city: { market: { mtrade: 10 } } } };
MarketManager.priorityList = [
  { autoTradeBuyEnabled: false, autoTradeSellEnabled: false, tradeRoutes: -3 },
  { autoTradeBuyEnabled: true, autoTradeSellEnabled: false, tradeRoutes: 5 },
];
assert.deepEqual(MarketManager.getMaxTradeRoutes(), [7, -3]); // 10 - |−3|, unmanaged −3

// add/removeTradeRoutes gated by resource unlock.
vueMap.ironMarket = {
  autoBuy: (id) => clicks.push(["autoBuy", id]),
  autoSell: (id) => clicks.push(["autoSell", id]),
};
clicks.length = 0;
assert.equal(
  MarketManager.addTradeRoutes(
    { isUnlocked: () => false, _marketVueBinding: "ironMarket", id: "Iron" },
    2,
  ),
  false,
);
assert.equal(clicks.length, 0);
MarketManager.addTradeRoutes(
  { isUnlocked: () => true, _marketVueBinding: "ironMarket", id: "Iron" },
  2,
);
assert.deepEqual(clicks, [
  ["autoBuy", "Iron"],
  ["autoBuy", "Iron"],
]);

// ---------- Storage ----------
techOk = true;
assert.equal(StorageManager.isUnlocked(), true);
StorageManager._storageVue = {
  crate: () => clicks.push(["crate"]),
  container: () => clicks.push(["container"]),
};
clicks.length = 0;
StorageManager.constructCrate(0); // guard
StorageManager.constructCrate(2);
assert.deepEqual(clicks, [["crate"], ["crate"]]);

vueMap.ironStack = {
  addCrate: (id) => clicks.push(["addCrate", id]),
  subCon: (id) => clicks.push(["subCon", id]),
};
const stackRes = { id: "Iron", _stackVueBinding: "ironStack" };
clicks.length = 0;
StorageManager.assignCrate(stackRes, 1);
StorageManager.unassignContainer(stackRes, 1);
assert.deepEqual(clicks, [
  ["addCrate", "Iron"],
  ["subCon", "Iron"],
]);
// Missing stack vue short-circuits.
assert.equal(
  StorageManager.assignCrate({ id: "X", _stackVueBinding: "missing" }, 1),
  false,
);

console.log("Economy managers module tests passed");
