import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const tableSorter = {
  attach() {},
  readOrder: () => [],
};

const trace = [];
let registration;

function makeNode() {
  let proxy;
  proxy = new Proxy(function () {}, {
    apply: () => proxy,
    get(_target, property) {
      if (property === "length") return 0;
      return () => proxy;
    },
  });
  return proxy;
}

function jquery() {
  return makeNode();
}
jquery.isEmptyObject = () => true;

const document = {
  documentElement: { scrollTop: 20 },
  body: { scrollTop: 5 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document,
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

hooks.setMarketSettingsTestContext({
  settingsRaw: {},
  resources: {
    Iron: { id: "Iron", name: "Iron" },
    Coal: { id: "Coal", name: "Coal" },
  },
  MarketManager: {
    priorityList: [
      { id: "Iron", name: "Iron" },
      { id: "Coal", name: "Coal" },
    ],
    sortByPriority: () => trace.push("sort"),
  },
  poly: {
    galaxyOffers: [{ buy: { res: "Iron" }, sell: { res: "Coal" } }],
  },
  actions: {
    buildSettingsSection(...args) {
      registration = args;
      trace.push(`section:${args[0]}:${args[1]}`);
    },
    addSettingsNumber(_node, key) {
      trace.push(`number:${key}`);
    },
    addSettingsToggle(_node, key) {
      trace.push(`toggle:${key}`);
    },
    addStandardHeading(_node, label) {
      trace.push(`heading:${label}`);
    },
    addTableInput() {},
    addTableToggle() {},
    buildTableLabel() {
      return "label";
    },
    getTableSorter: () => tableSorter,
  },
  resetMarketSettings: (value) => trace.push(`reset:${value}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
  removeMarketToggles: () => trace.push("remove-toggles"),
});

const panel = hooks.marketSettings;
panel.updateMarketSettingsContent();
assert.deepEqual(trace.slice(0, 7), [
  "number:minimumMoney",
  "number:minimumMoneyPercentage",
  "number:tradeRouteMinimumMoneyPerSecond",
  "number:tradeRouteMinimumMoneyPercentage",
  "toggle:tradeRouteSellExcess",
  "heading:Galaxy Trades",
  "number:marketMinIngredients",
]);
assert.equal(document.documentElement.scrollTop, 20);
assert.equal(document.body.scrollTop, 20);

trace.length = 0;
panel.buildMarketSettings();
registration[2]();
assert.deepEqual(trace, [
  "section:market:Market",
  "reset:true",
  "persist",
  "number:minimumMoney",
  "number:minimumMoneyPercentage",
  "number:tradeRouteMinimumMoneyPerSecond",
  "number:tradeRouteMinimumMoneyPercentage",
  "toggle:tradeRouteSellExcess",
  "heading:Galaxy Trades",
  "number:marketMinIngredients",
  "checkbox:autoMarket|autoGalaxyMarket",
  "remove-toggles",
]);

console.log("Market settings bundled characterization tests passed");
