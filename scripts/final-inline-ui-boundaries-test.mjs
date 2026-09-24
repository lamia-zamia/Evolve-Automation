import assert from "node:assert/strict";

import { createMechInfoBrowserAdapter } from "../src/adapters/browser/mech-info.ts";
import { createResourceToggleBrowserAdapter } from "../src/adapters/browser/resource-toggles.ts";
import { createQueuePanels } from "../src/ui/queue-panels.ts";

const trace = [];
const handlers = new Map();
const htmlBySelector = new Map();

function makeNode(label, length = 1) {
  const node = {
    0: { label },
    length,
    show() {
      trace.push(`show:${label}`);
      return node;
    },
    hide() {
      trace.push(`hide:${label}`);
      return node;
    },
    html(value) {
      if (arguments.length === 0) return htmlBySelector.get(label);
      htmlBySelector.set(label, value);
      trace.push(`html:${label}`);
      return node;
    },
    before(value) {
      trace.push(`before:${label}:${value.includes("Detailed Queue")}`);
      return node;
    },
    after(value) {
      trace.push(`after:${label}:${value.includes("script_")}`);
      return node;
    },
    remove() {
      trace.push(`remove:${label}`);
      return node;
    },
    toggle(value) {
      trace.push(`toggle-ui:${label}:${value}`);
      return node;
    },
    on(event, callback) {
      handlers.set(`${label}:${event}`, callback);
      return node;
    },
    outerHeight() {
      return 12;
    },
    css(...args) {
      trace.push(`css:${label}:${args.join("|")}`);
      return node;
    },
    width(value) {
      trace.push(`width:${label}:${value}`);
      return node;
    },
    text(value) {
      trace.push(`text:${label}:${value}`);
      return node;
    },
    append(...values) {
      trace.push(`append:${label}:${values.length}`);
      return node;
    },
    appendTo(target) {
      trace.push(`appendTo:${label}:${target.label ?? "node"}`);
      return node;
    },
    hasClass() {
      return false;
    },
  };
  return node;
}

function jquery(value) {
  const label = String(value);
  return makeNode(label, label === "#missing" ? 0 : 1);
}
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;

const settingsRaw = { buildPlannerCollapsed: false };
const state = { plannerStats: { old: true } };
const resources = {
  Iron: {
    currentQuantity: 5,
    maxQuantity: 20,
    income: 3,
    title: "Iron",
  },
  Soul_Gem: {},
};
const technology = {
  kind: "technology",
  name: "Tech",
  id: "tech",
  cost: { Iron: 11 },
};
const panels = createQueuePanels({
  getJQuery: () => jquery,
  getGame: () => ({
    global: { resource: { Knowledge: { max: 100 } }, race: {} },
  }),
  getResources: () => resources,
  getPoly: () => ({ timeFormat: (value) => `time:${value}` }),
  getSettingsRaw: () => settingsRaw,
  getState: () => state,
  getMultiSegmentedTimeLeft: () => ({ timeLeft: "soon", resource: "Iron" }),
  isProject: (target) => target.kind === "project",
  isTechnology: (target) => target.kind === "technology",
  getResizeObserver: () => undefined,
  updateSettingsFromState: () => trace.push("persist"),
  makePlannerStats: () => ({ reset: true }),
  savePlannerStats: () => trace.push("save-planner"),
});

panels.updateActiveTargetsUI([], "research");
panels.updateActiveTargetsUI([technology], "research");
const researchHtml = htmlBySelector.get(
  "#active_targets ul.active_targets-list.research",
);
assert.match(researchHtml[0], /Tech/);
assert.match(researchHtml[0], /time:2/);
assert.match(researchHtml[0], /data-queueid="tech"/);

panels.buildActiveTargetsUI();
panels.removeActiveTargetsUI();
panels.buildBuildPlannerUI();
handlers.get("#script_planner-header:click")();
handlers.get("#script_planner-reset:click")();
panels.removeBuildPlannerUI();
assert.equal(settingsRaw.buildPlannerCollapsed, true);
assert.deepEqual(state.plannerStats, { reset: true });
assert.ok(trace.includes("persist"));
assert.ok(trace.includes("save-planner"));

const inserted = [];
const mechNode = {
  childNodes: { 0: {}, length: 1 },
  firstChild: {},
  insertBefore: (note) => inserted.push(note),
};
const mechTrace = [];
const mechInfoReader = {
  ensureLabActive: () => true,
  readItems: () => [{ text: "50%, nice:10 /s | " }],
};
const mechInfoObserver = {
  disconnect: () => mechTrace.push("disconnect"),
  observe: (...args) => mechTrace.push(`observe:${args.length}`),
};
const mechUI = createMechInfoBrowserAdapter({
  getDocument: () => ({
    createElement: () => ({}),
    getElementById: () => ({
      id: "mechList",
      children: { 0: mechNode, length: 1 },
    }),
  }),
  getJQuery: () => (value) =>
    String(value).includes("draggable")
      ? makeNode(String(value), 0)
      : makeNode(String(value)),
  reader: mechInfoReader,
  observer: mechInfoObserver,
});
mechUI.createMechInfo();
assert.equal(inserted[0].innerHTML, "50%, nice:10 /s | ");
assert.deepEqual(mechTrace, ["disconnect", "observe:2"]);
mechUI.removeMechInfo();
assert.equal(mechTrace.at(-1), "disconnect");

const toggleKeys = [];
const marketReader = {
  readMarket: () => ({
    noTrade: false,
    labels: {
      buy: "Buy",
      sell: "Sell",
      routes: "Routes",
      cancelRoutes: "Cancel",
    },
    items: [
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
  }),
};
const storageReader = {
  readStorage: () => ({
    items: [
      {
        resourceId: "Iron",
        storeKey: "res_storageIron",
        overKey: "res_storage_o_Iron",
        storeEnabled: true,
        overEnabled: false,
      },
    ],
  }),
};
const toggleUI = createResourceToggleBrowserAdapter({
  getJQuery: () => jquery,
  marketReader,
  storageReader,
  addToggleCallbacks: (node, key) => {
    toggleKeys.push(key);
    return node;
  },
});
toggleUI.createMarketToggles();
toggleUI.createStorageToggles();
assert.deepEqual(toggleKeys, [
  "buyIron",
  "sellIron",
  "res_trade_buy_Iron",
  "res_trade_sell_Iron",
  "res_storageIron",
  "res_storage_o_Iron",
]);

trace.length = 0;
const noTradeUI = createResourceToggleBrowserAdapter({
  getJQuery: () => jquery,
  marketReader: {
    readMarket: () => ({ ...marketReader.readMarket(), noTrade: true }),
  },
  storageReader,
  addToggleCallbacks: (node) => node,
});
noTradeUI.createMarketToggles();
assert.equal(
  trace.some((entry) => entry.startsWith("width:")),
  false,
);

console.log("Final inline UI boundary module tests passed");
