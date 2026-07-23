import assert from "node:assert/strict";

import { createResourceToggleBrowserAdapter } from "../src/adapters/browser/resource-toggles.ts";
import { createResourceToggleEvolveAdapter } from "../src/adapters/evolve/economy/resources/resource-toggles.ts";

let game = {
  global: { race: {} },
  loc: (key) => `loc:${key}`,
};
const settingsRaw = {
  buyIron: true,
  res_trade_buy_Iron: true,
  res_storageIron: true,
};
const reader = createResourceToggleEvolveAdapter({
  getGame: () => game,
  getSettingsRaw: () => settingsRaw,
  getMarketManager: () => ({
    priorityList: [{ id: "Food" }, { id: "Iron" }],
  }),
  getStorageManager: () => ({ priorityList: [{ id: "Iron" }] }),
});

assert.deepEqual(reader.readMarket(), {
  noTrade: false,
  labels: {
    buy: "loc:resource_market_buy",
    sell: "loc:resource_market_sell",
    routes: "loc:resource_market_routes",
    cancelRoutes: "loc:cancel_routes",
  },
  items: [
    {
      resourceId: "Food",
      buyKey: "buyFood",
      sellKey: "sellFood",
      tradeBuyKey: "res_trade_buy_Food",
      tradeSellKey: "res_trade_sell_Food",
      buyEnabled: false,
      sellEnabled: false,
      tradeBuyEnabled: false,
      tradeSellEnabled: false,
    },
    {
      resourceId: "Iron",
      buyKey: "buyIron",
      sellKey: "sellIron",
      tradeBuyKey: "res_trade_buy_Iron",
      tradeSellKey: "res_trade_sell_Iron",
      buyEnabled: true,
      sellEnabled: false,
      tradeBuyEnabled: true,
      tradeSellEnabled: false,
    },
  ],
});
assert.deepEqual(reader.readStorage(), {
  items: [
    {
      resourceId: "Iron",
      storeKey: "res_storageIron",
      overKey: "res_storage_o_Iron",
      storeEnabled: true,
      overEnabled: false,
    },
  ],
});

const malformedReader = createResourceToggleEvolveAdapter({
  getGame: () => game,
  getSettingsRaw: () => ({}),
  getMarketManager: () => ({ priorityList: [{ id: 42 }] }),
  getStorageManager: () => ({ priorityList: [] }),
});
assert.throws(
  () => malformedReader.readMarket(),
  /MarketManager\.priorityList\[0\]\.id.*string/,
);

const trace = [];
const callbackKeys = [];
const lengths = new Map([
  ["#market-Iron", 1],
  ["#stack-Iron", 1],
  ["#market-Food", 0],
]);
function node(selector) {
  return {
    selector,
    length: lengths.get(selector) ?? 1,
    after(content) {
      trace.push({ kind: "after", selector, content });
      return this;
    },
    append(...content) {
      trace.push({ kind: "append", selector, content });
      return this;
    },
    appendTo(target) {
      trace.push({ kind: "appendTo", selector, target: target.selector });
      return this;
    },
    remove() {
      trace.push({ kind: "remove", selector });
      return this;
    },
    text(content) {
      trace.push({ kind: "text", selector, content });
      return this;
    },
    width(value) {
      trace.push({ kind: "width", selector, value });
      return this;
    },
  };
}
const jquery = (selector) => node(String(selector));
const browserAdapter = createResourceToggleBrowserAdapter({
  getJQuery: () => jquery,
  reader,
  addToggleCallbacks: (toggle, settingKey) => {
    callbackKeys.push(settingKey);
    return toggle;
  },
});

browserAdapter.createMarketToggles();
assert.deepEqual(callbackKeys, [
  "buyIron",
  "sellIron",
  "res_trade_buy_Iron",
  "res_trade_sell_Iron",
]);
assert.equal(
  trace.filter((entry) => entry.kind === "appendTo").at(-1).target,
  "#market-Iron",
);
assert.match(
  trace.find(
    (entry) => entry.kind === "after" && entry.selector === "#market-qty",
  ).content,
  /script_market_top_row/,
);

trace.length = 0;
callbackKeys.length = 0;
browserAdapter.createStorageToggles();
assert.deepEqual(callbackKeys, ["res_storageIron", "res_storage_o_Iron"]);
assert.equal(
  trace.find((entry) => entry.kind === "appendTo").target,
  "#stack-Iron",
);

trace.length = 0;
browserAdapter.removeStorageToggles();
assert.deepEqual(
  trace
    .filter((entry) => entry.kind === "remove")
    .map((entry) => entry.selector),
  ["#resStorage .ea-storage-toggle", "#script_storage_top_row"],
);

game = {
  global: { race: { no_trade: true, artifical: true } },
  loc: () => {
    throw new Error("no_trade market should not localize labels");
  },
};
const noTradeReader = createResourceToggleEvolveAdapter({
  getGame: () => game,
  getSettingsRaw: () => ({}),
  getMarketManager: () => ({ priorityList: [{ id: "Food" }, { id: "Iron" }] }),
  getStorageManager: () => ({ priorityList: [] }),
});
assert.deepEqual(
  noTradeReader.readMarket().items.map((item) => item.resourceId),
  ["Iron"],
);

console.log("Resource toggles browser and Evolve adapter tests passed");
