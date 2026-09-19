import assert from "node:assert/strict";

import { readMarketResetContext } from "../src/adapters/evolve/captured-settings-defaults.ts";
import {
  readCapturedMarketGalaxyEntries,
  readCapturedMarketSettingsEntries,
} from "../src/adapters/evolve/economy/market/captured-market-settings-catalog.ts";
import { createCapturedMarketSettingsAdapter } from "../src/adapters/evolve/economy/market/captured-market-settings.ts";
import { createCapturedMarketToggleReader } from "../src/adapters/evolve/economy/market/captured-market-toggles.ts";
import {
  ALWAYS_TRUE_OVERRIDE,
  createCapturedControls,
  createCapturedRootState,
  createRecordSettingsLifecycle,
} from "./test-support/captured-settings.mjs";

function makeCapturedGame({ smoldering = false } = {}) {
  const root = {
    race: { smoldering },
    resource: {
      Iron: { title: "Iron", tradable: true },
      Coal: { name: "Coal", tradable: true },
      Food: { title: "Food", tradable: true },
      Deuterium: { title: "Deuterium" },
      Helium_3: { title: "Helium-3" },
      Copper: { title: "Copper" },
      Lumber: { title: "Lumber" },
      Oil: { title: "Oil" },
    },
  };
  const controlsById = new Map([
    ["market-Oil", { elementId: "market-Oil", generation: 1, methods: [] }],
  ]);
  const controls = createCapturedControls(controlsById);
  const rootState = createCapturedRootState(() => root);
  return { root, controls, rootState };
}

const game = makeCapturedGame();

// The table and the lifecycle defaults share one resource list: tradable root
// records first, then captured `market-` rows the root does not flag. Galaxy
// buy ids come from the resolved offer identities.
assert.deepEqual(readMarketResetContext(game.root, game.controls), {
  tradableResourceIds: ["Iron", "Coal", "Food", "Oil"],
  galaxyOfferResourceIds: [
    "Deuterium",
    "Neutronium",
    "Adamantite",
    "Elerium",
    "Nano_Tube",
    "Graphene",
    "Stanene",
    "Bolognium",
    "Vitreloy",
  ],
});
assert.deepEqual(
  readCapturedMarketSettingsEntries(game.root, game.controls).map((entry) => [
    entry.resourceId,
    entry.elementId,
    entry.label,
  ]),
  [
    ["Iron", "market-Iron", "Iron"],
    ["Coal", "market-Coal", "Coal"],
    ["Food", "market-Food", "Food"],
    ["Oil", "market-Oil", "Oil"],
  ],
);
const galaxy = readCapturedMarketGalaxyEntries(game.root);
assert.equal(galaxy.length, 9);
assert.deepEqual(galaxy[0], {
  buyId: "Deuterium",
  buyLabel: "Deuterium",
  sellId: "Helium_3",
  sellLabel: "Helium-3",
});
// The sixth offer has no fixed sell side; the race decides it.
assert.deepEqual(
  readCapturedMarketGalaxyEntries(
    makeCapturedGame({ smoldering: true }).root,
  )[5],
  {
    buyId: "Graphene",
    buyLabel: "Graphene",
    sellId: "Chrysotile",
    sellLabel: "Chrysotile",
  },
);

const raw = {
  autoMarket: true,
  buyIron: true,
  res_buy_r_Iron: 0.7,
  sellCoal: true,
  res_trade_buy_Food: false,
  res_buy_p_Iron: 2,
  res_buy_p_Coal: 0,
  res_buy_p_Food: 1,
  res_galaxy_w_Deuterium: 3,
  overrides: {
    buyIron: ALWAYS_TRUE_OVERRIDE,
    res_trade_w_Coal: ALWAYS_TRUE_OVERRIDE,
    res_galaxy_w_Deuterium: ALWAYS_TRUE_OVERRIDE,
    job_farmer: ALWAYS_TRUE_OVERRIDE,
  },
};
const adapter = createCapturedMarketSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
});

const model = adapter.readMarketSettingsReadModel();
assert.equal(model.sectionId, "market");
assert.equal(model.sectionName, "Market");
assert.deepEqual(
  model.controls.map((control) =>
    control.kind === "heading" ? "heading" : control.settingName,
  ),
  [
    "minimumMoney",
    "minimumMoneyPercentage",
    "tradeRouteMinimumMoneyPerSecond",
    "tradeRouteMinimumMoneyPercentage",
    "tradeRouteSellExcess",
    "heading",
    "marketMinIngredients",
  ],
);
assert.deepEqual(
  model.rows.map((row) => row.id),
  ["Coal", "Food", "Iron", "Oil"],
);
const iron = model.rows.find((row) => row.id === "Iron");
assert.deepEqual(
  {
    label: iron.label,
    buySettingName: iron.buySettingName,
    buyRatioSettingName: iron.buyRatioSettingName,
    sellSettingName: iron.sellSettingName,
    sellRatioSettingName: iron.sellRatioSettingName,
    tradeBuySettingName: iron.tradeBuySettingName,
    tradeSellSettingName: iron.tradeSellSettingName,
    tradeWeightingSettingName: iron.tradeWeightingSettingName,
    tradePrioritySettingName: iron.tradePrioritySettingName,
  },
  {
    label: "Iron",
    buySettingName: "buyIron",
    buyRatioSettingName: "res_buy_r_Iron",
    sellSettingName: "sellIron",
    sellRatioSettingName: "res_sell_r_Iron",
    tradeBuySettingName: "res_trade_buy_Iron",
    tradeSellSettingName: "res_trade_sell_Iron",
    tradeWeightingSettingName: "res_trade_w_Iron",
    tradePrioritySettingName: "res_trade_p_Iron",
  },
);
assert.equal(model.galaxyRows.length, 9);
assert.deepEqual(
  {
    buyId: model.galaxyRows[0].buyId,
    buyLabel: model.galaxyRows[0].buyLabel,
    sellLabel: model.galaxyRows[0].sellLabel,
    weightingSettingName: model.galaxyRows[0].weightingSettingName,
    prioritySettingName: model.galaxyRows[0].prioritySettingName,
  },
  {
    buyId: "Deuterium",
    buyLabel: "Deuterium",
    sellLabel: "Helium-3",
    weightingSettingName: "res_galaxy_w_Deuterium",
    prioritySettingName: "res_galaxy_p_Deuterium",
  },
);

// The settings panel reads the raw persisted value. An active override is
// deliberately not allowed to turn the displayed value into the effective one.
assert.equal(raw["buyIron"], true);

adapter.resetPriorities();
assert.equal(raw["res_buy_p_Iron"], 0);
assert.equal(raw["res_buy_p_Oil"], 3);
adapter.reorderResources(["Oil", "Iron", "not-captured"]);
assert.equal(raw["res_buy_p_Oil"], 0);
assert.equal(raw["res_buy_p_Iron"], 1);
assert.equal(raw["res_buy_p_not-captured"], undefined);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: game.rootState,
  controls: game.controls,
});

sectionLifecycle.resetSection("market");
assert.deepEqual(
  {
    buy: raw["buyIron"],
    buyRatio: raw["res_buy_r_Iron"],
    sell: raw["sellCoal"],
    tradeBuyFood: raw["res_trade_buy_Food"],
    tradePriorityFood: raw["res_trade_p_Food"],
    galaxyWeight: raw["res_galaxy_w_Deuterium"],
    galaxyPriority: raw["res_galaxy_p_Deuterium"],
    minimumMoney: raw["minimumMoney"],
  },
  {
    buy: false,
    buyRatio: 0.5,
    sell: false,
    tradeBuyFood: true,
    tradePriorityFood: 1,
    galaxyWeight: 1,
    galaxyPriority: 1,
    minimumMoney: 0,
  },
);
assert.deepEqual(raw["overrides"], {
  job_farmer: ALWAYS_TRUE_OVERRIDE,
});

const toggleReader = createCapturedMarketToggleReader({
  rootState: game.rootState,
  controls: game.controls,
  getDocument: () => ({
    getElementById: (id) =>
      id === "market-Iron" || id === "market-Food" ? {} : null,
  }),
  getSettingsRaw: () => raw,
});
const view = toggleReader.readMarket();
assert.equal(view.noTrade, false);
// Button labels are the game's own localized draw, which no capture carries;
// the browser adapter restores the live labels it overwrote instead.
assert.deepEqual(view.labels, {
  buy: "",
  sell: "",
  routes: "",
  cancelRoutes: "",
});
assert.deepEqual(view.items, [
  {
    resourceId: "Iron",
    buyKey: "buyIron",
    sellKey: "sellIron",
    tradeBuyKey: "res_trade_buy_Iron",
    tradeSellKey: "res_trade_sell_Iron",
    buyEnabled: false,
    sellEnabled: false,
    tradeBuyEnabled: true,
    tradeSellEnabled: true,
  },
  {
    resourceId: "Food",
    buyKey: "buyFood",
    sellKey: "sellFood",
    tradeBuyKey: "res_trade_buy_Food",
    tradeSellKey: "res_trade_sell_Food",
    buyEnabled: false,
    sellEnabled: false,
    tradeBuyEnabled: true,
    tradeSellEnabled: true,
  },
]);

// Food is skipped for races that cannot use it.
const fastingGame = makeCapturedGame();
fastingGame.root.race.fasting = true;
const fastingReader = createCapturedMarketToggleReader({
  rootState: fastingGame.rootState,
  controls: fastingGame.controls,
  getDocument: () => ({ getElementById: () => ({}) }),
  getSettingsRaw: () => ({}),
});
assert.deepEqual(
  fastingReader.readMarket().items.map((item) => item.resourceId),
  ["Iron", "Coal", "Oil"],
);

// A no-trade race still reports the flag; the panel skips its relabeling.
const noTradeGame = makeCapturedGame();
noTradeGame.root.race.no_trade = true;
const noTradeReader = createCapturedMarketToggleReader({
  rootState: noTradeGame.rootState,
  controls: noTradeGame.controls,
  getDocument: () => ({ getElementById: () => ({}) }),
  getSettingsRaw: () => ({}),
});
assert.equal(noTradeReader.readMarket().noTrade, true);

console.log("captured market settings ok");
