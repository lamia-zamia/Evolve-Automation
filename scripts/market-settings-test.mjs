import assert from "node:assert/strict";

import { createMarketSettingsIntentHandler } from "../src/application/market-settings.ts";
import { createMarketSettingsBrowserAdapter } from "../src/adapters/browser/market-settings.ts";
import {
  createMarketSettingsEvolveAdapter,
  createMarketSettingsWriter,
} from "../src/adapters/evolve/economy/market/market-settings.ts";

const resources = {
  Iron: { id: "Iron", name: "Iron" },
  Coal: { id: "Coal", name: "Coal" },
  Money: { id: "Money", name: "Money" },
};
const manager = {
  priorityList: [resources.Iron, resources.Coal],
  sortByPriority() {},
};
const reader = createMarketSettingsEvolveAdapter({
  getMarketManager: () => manager,
  getResources: () => resources,
  getPoly: () => ({
    galaxyOffers: [{ buy: { res: "Iron" }, sell: { res: "Coal" } }],
  }),
});
const model = reader.read();
assert.deepEqual(
  model.rows.map(({ id, label, buySettingName, tradePrioritySettingName }) => ({
    id,
    label,
    buySettingName,
    tradePrioritySettingName,
  })),
  [
    {
      id: "Iron",
      label: "Iron",
      buySettingName: "buyIron",
      tradePrioritySettingName: "res_trade_p_Iron",
    },
    {
      id: "Coal",
      label: "Coal",
      buySettingName: "buyCoal",
      tradePrioritySettingName: "res_trade_p_Coal",
    },
  ],
);
assert.deepEqual(model.galaxyRows, [
  {
    buyId: "Iron",
    buyLabel: "Iron",
    sellLabel: "Coal",
    weightingSettingName: "res_galaxy_w_Iron",
    prioritySettingName: "res_galaxy_p_Iron",
  },
]);

let sortableOptions;
let section;
const controlTrace = [];
const tableToggles = [];
const tableInputs = [];
const labelColors = [];
const scroll = { documentElement: { scrollTop: 0 }, body: { scrollTop: 12 } };
const sharedNode = {
  empty() {
    return this;
  },
  off() {
    return this;
  },
  append() {
    return this;
  },
  next() {
    return this;
  },
  sortable(...args) {
    if (args[0] === "toArray") return ["Coal", "Iron"];
    sortableOptions = args[0];
    return this;
  },
};
const actions = {
  buildSettingsSection(...args) {
    section = args;
  },
  addSettingsNumber(_node, key) {
    controlTrace.push(`number:${key}`);
  },
  addSettingsToggle(_node, key) {
    controlTrace.push(`toggle:${key}`);
  },
  addStandardHeading(_node, label) {
    controlTrace.push(`heading:${label}`);
  },
  addTableInput(_node, key) {
    tableInputs.push(key);
  },
  addTableToggle(_node, key) {
    tableToggles.push(key);
  },
  buildTableLabel(label, title, className) {
    assert.ok(label);
    // The color is the third argument; the second is the tooltip.
    assert.equal(title ?? "", "");
    if (className)
      assert.ok(["has-text-success", "has-text-danger"].includes(className));
    labelColors.push(className);
    return label;
  },
  getSorterHelper() {
    return "helper";
  },
};
const intents = [];
const browser = createMarketSettingsBrowserAdapter({
  getDocument: () => scroll,
  getJQuery: () => () => sharedNode,
  reader,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});
browser.updateMarketSettingsContent();
assert.deepEqual(controlTrace, [
  "number:minimumMoney",
  "number:minimumMoneyPercentage",
  "number:tradeRouteMinimumMoneyPerSecond",
  "number:tradeRouteMinimumMoneyPercentage",
  "toggle:tradeRouteSellExcess",
  "heading:Galaxy Trades",
  "number:marketMinIngredients",
]);
assert.deepEqual(tableToggles, [
  "buyIron",
  "sellIron",
  "res_trade_buy_Iron",
  "res_trade_sell_Iron",
  "buyCoal",
  "sellCoal",
  "res_trade_buy_Coal",
  "res_trade_sell_Coal",
]);
assert.deepEqual(tableInputs, [
  "res_buy_r_Iron",
  "res_sell_r_Iron",
  "res_trade_w_Iron",
  "res_trade_p_Iron",
  "res_buy_r_Coal",
  "res_sell_r_Coal",
  "res_trade_w_Coal",
  "res_trade_p_Coal",
  "res_galaxy_w_Iron",
  "res_galaxy_p_Iron",
]);
// The galaxy trade labels carry their buy/sell color, and the resource rows carry none.
assert.deepEqual(labelColors, [
  undefined,
  undefined,
  "has-text-success",
  "has-text-danger",
]);
assert.equal(scroll.documentElement.scrollTop, 12);
sortableOptions.update();
assert.deepEqual(intents, [
  { type: "reorder-market-resources", resourceIds: ["Coal", "Iron"] },
]);
browser.buildMarketSettings();
assert.equal(section[0], "market");
section[2]();
assert.deepEqual(intents, [
  { type: "reorder-market-resources", resourceIds: ["Coal", "Iron"] },
  { type: "reset-market-settings" },
]);

const writerTrace = [];
const settingsRaw = {};
const writerManager = {
  sortByPriority: () => writerTrace.push("sort"),
};
createMarketSettingsWriter({
  getMarketManager: () => writerManager,
  getSettingsRaw: () => settingsRaw,
}).reorderResources(["Coal", "Iron"]);
assert.deepEqual(settingsRaw, {
  res_buy_p_Coal: 0,
  res_buy_p_Iron: 1,
});
assert.deepEqual(writerTrace, ["sort"]);

const trace = [];
const handler = createMarketSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    persist: () => trace.push("persist"),
    reorderResources: (ids) => trace.push(`reorder:${ids.join(",")}`),
  },
  renderSettingsContent: () => trace.push("render"),
  effects: {
    resetCheckboxes: () => trace.push("checkboxes"),
    removeMarketToggles: () => trace.push("remove-toggles"),
  },
});
handler.handle({ type: "reorder-market-resources", resourceIds: ["Coal"] });
handler.handle({ type: "reset-market-settings" });
assert.deepEqual(trace, [
  "reorder:Coal",
  "persist",
  "reset",
  "persist",
  "render",
  "checkboxes",
  "remove-toggles",
]);

console.log(
  "Market settings domain, Evolve, browser, and application tests passed",
);
