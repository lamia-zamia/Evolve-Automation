import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
const toggles = [];
const selectorLengths = new Map([
  ["#market-Iron", 1],
  ["#market-Food", 0],
  ["#stack-Iron", 1],
]);

function makeNode(label) {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return selectorLengths.get(label) ?? 1;
      if (property === "__label") return label;
      if (property === Symbol.iterator) return function* () {};
      if (property === "after") {
        return (content) => {
          trace.push({ kind: "after", label, content });
          return proxy;
        };
      }
      if (property === "append") {
        return (...content) => {
          trace.push({ kind: "append", label, content });
          return proxy;
        };
      }
      if (property === "appendTo") {
        return (targetNode) => {
          trace.push({
            kind: "appendTo",
            label,
            target: targetNode.__label,
          });
          return proxy;
        };
      }
      if (property === "remove") {
        return () => {
          trace.push({ kind: "remove", label });
          return proxy;
        };
      }
      if (property === "text") {
        return (content) => {
          trace.push({ kind: "text", label, content });
          return proxy;
        };
      }
      if (property === "width") {
        return (value) => {
          trace.push({ kind: "width", label, value });
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

function jquery(value) {
  return makeNode(String(value));
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const storageValues = new Map();
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeNode("created-element"),
    getElementById: () => null,
  },
  localStorage: {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
  },
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

assert.equal(typeof hooks.setResourceTogglesTestContext, "function");
assert.deepEqual(Object.keys(hooks.resourceToggles), [
  "createMarketToggles",
  "removeMarketToggles",
  "createStorageToggles",
  "removeStorageToggles",
]);

hooks.setResourceTogglesTestContext({
  game: {
    global: { race: {} },
    loc: (key) => `loc:${key}`,
  },
  settingsRaw: {
    buyIron: true,
    res_trade_buy_Iron: true,
    res_storageIron: true,
  },
  MarketManager: { priorityList: [{ id: "Food" }, { id: "Iron" }] },
  StorageManager: { priorityList: [{ id: "Iron" }] },
  addToggleCallbacks: (node, settingKey) => {
    toggles.push({ label: node.__label, settingKey });
    return node;
  },
});

trace.length = 0;
toggles.length = 0;
hooks.resourceToggles.createMarketToggles();
assert.deepEqual(
  toggles.map((toggle) => toggle.settingKey),
  ["buyIron", "sellIron", "res_trade_buy_Iron", "res_trade_sell_Iron"],
);
assert.match(toggles[0].label, /script_buyIron/);
assert.match(toggles[0].label, /type="checkbox" checked/);
assert.ok(
  trace.some(
    (entry) =>
      entry.kind === "after" &&
      entry.label === "#market-qty" &&
      String(entry.content).includes("script_market_top_row"),
  ),
);
assert.ok(
  trace.some(
    (entry) => entry.kind === "appendTo" && entry.target === "#market-Iron",
  ),
);

trace.length = 0;
toggles.length = 0;
hooks.resourceToggles.createStorageToggles();
assert.deepEqual(
  toggles.map((toggle) => toggle.settingKey),
  ["res_storageIron", "res_storage_o_Iron"],
);
assert.ok(
  trace.some(
    (entry) =>
      entry.kind === "after" &&
      entry.label === "#createHead" &&
      String(entry.content).includes("script_storage_top_row"),
  ),
);

trace.length = 0;
hooks.resourceToggles.removeMarketToggles();
assert.deepEqual(
  trace.filter((entry) => entry.kind === "remove").map((entry) => entry.label),
  ["#market .ea-market-toggle", "#script_market_top_row"],
);

hooks.setResourceTogglesTestContext({
  game: {
    global: { race: { no_trade: true, artifical: true } },
    loc: () => {
      throw new Error("no_trade market should not localize labels");
    },
  },
  settingsRaw: {},
  MarketManager: { priorityList: [{ id: "Food" }, { id: "Iron" }] },
  StorageManager: { priorityList: [] },
  addToggleCallbacks: () => {
    throw new Error("no_trade market should not add buy/sell toggles");
  },
});
hooks.resourceToggles.removeMarketToggles();

console.log("Resource toggles bundled characterization tests passed");
