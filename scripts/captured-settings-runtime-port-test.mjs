import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";
import { withControlCaptureAuthority } from "./control-capture-fixture.mjs";

function createPanelPage() {
  const pageRoot = element("div", { id: "root" });
  const resources = element("div", { id: "resources" });
  resources.appendChild(element("div", { id: "mTabResource" }));
  const settingsTab = element("div");
  settingsTab.classList.add("settings");
  pageRoot.appendChild(resources);
  pageRoot.appendChild(settingsTab);
  const document = createTestDocument(pageRoot);
  const createElement = document.createElement.bind(document);
  document.createElement = (tagName) => {
    const node = createElement(tagName);
    let className = "";
    Object.defineProperty(node, "className", {
      get: () => className,
      set: (value) => {
        className = String(value);
        for (const token of className.split(/\s+/).filter(Boolean)) {
          node.classList.add(token);
        }
      },
    });
    return node;
  };
  const pageWindow = {
    document,
    navigator: { platform: "Win32" },
    location: "https://evolve.test/",
    confirm: () => true,
    setTimeout: (callback) => callback(),
  };
  return { pageRoot, resources, settingsTab, document, pageWindow };
}

function addMechRow(list, size) {
  const row = element("div");
  row.classList.add("mechRow");
  Object.defineProperties(row, {
    childNodes: { get: () => row.children },
    firstChild: { get: () => row.children[0] ?? null },
  });
  row.appendChild(element("span", { id: `mech-${size}` }));
  list.appendChild(row);
  return row;
}

function createCapturedPage(root, handles, settings, log = () => {}) {
  const page = createPanelPage();
  const invoked = [];
  const errors = [];
  const diagnostics = [];
  const market = root.city.market;
  let cycle;
  const pageCapture = {
    isComplete: () => true,
    mechanics: { readStructures: () => undefined },
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    keyState: { readPressed: () => false },
    controls: withControlCaptureAuthority({
      resolve: (id) => handles.get(id),
      invoke: (handle, method, args = []) => {
        invoked.push(`${handle.elementId}.${method}`);
        if (
          method === "swapTab" &&
          handle.elementId === "#mainColumn div.content"
        )
          root.settings.civTabs = args[0];
        if (method === "swapTab" && handle.elementId === "mTabResource") {
          root.settings.marketTabs = args[0];
          for (const id of ["market-qty", "market-Food"])
            handles.set(id, {
              ...handles.get(id),
              generation: handles.get(id).generation + 1,
            });
        }
        const resourceId = args[0];
        if (resourceId === "Food" && method === "sell") {
          const quantity = Math.max(1, market.qty);
          root.resource.Food.amount -= quantity;
          root.resource.Money.amount += quantity * root.resource.Food.value;
        }
        if (resourceId === "Food" && method === "purchase") {
          const quantity = Math.max(1, market.qty);
          root.resource.Food.amount += quantity;
          root.resource.Money.amount -= quantity * root.resource.Food.value;
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => [...handles.keys()],
    }),
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        cycle = next;
        return () => {};
      },
    },
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
      withMountingEnabled: (draw) => draw(),
    },
    uninstall: () => {},
  };
  const timing = {
    readPerformanceEnabled: () => true,
    nowMs: () => 0,
    recordPerformance: () => {},
    recordCount: () => {},
    flushPerformance: () => {},
  };
  const stop = startCapturedRuntime({
    pageCapture,
    document: page.document,
    settingsHostWindow: page.pageWindow,
    mouseEvent: class {},
    storage: {
      getItem: () => JSON.stringify(settings),
      setItem: () => {},
    },
    diagnostics: timing,
    log: (message) => {
      diagnostics.push(message);
      log(message);
    },
    logError: (message) => errors.push(message),
  });
  return { ...page, cycle, stop, invoked, errors, diagnostics };
}

const gameRoot = {
  race: { species: "human", governor: { tasks: {} } },
  tech: { trade: true, currency: 0 },
  civic: {},
  settings: {
    showMarket: true,
    showMechLab: true,
    qKey: false,
    civTabs: 1,
    marketTabs: 0,
    animated: false,
  },
  city: { market: { qty: 1, mtrade: 1, trade: 0 } },
  portal: {
    mechbay: {
      max: 10,
      bay: 2,
      active: 2,
      scouts: 0,
      blueprint: {
        size: "small",
        chassis: "wheel",
        hardpoint: ["laser"],
        equip: ["special"],
        infernal: false,
      },
      mechs: [
        {
          size: "small",
          chassis: "wheel",
          hardpoint: ["laser"],
          equip: ["special"],
          infernal: false,
        },
        {
          size: "collector",
          chassis: "wheel",
          hardpoint: [],
          equip: ["special"],
          infernal: false,
        },
      ],
    },
    purifier: { supply: 1_000, sup_max: 10_000, count: 1, on: 1, diff: 0 },
    spire: { count: 1, type: "sand", progress: 10, status: {}, boss: "snake" },
  },
  blood: { prepared: 0, wrath: 0 },
  stats: { achieve: { gladiator: { l: 0 } } },
  resource: {
    Money: { amount: 1_000, max: 10_000, display: true, diff: 0, value: 1 },
    Food: {
      amount: 5,
      max: 100,
      display: true,
      diff: 20,
      value: 1,
      trade: 0,
      stackable: true,
    },
    Supply: { amount: 1_000, max: -1, display: true, diff: 0 },
    Soul_Gem: { amount: 12, max: 100, display: true, diff: 0 },
  },
};
const handles = new Map([
  [
    "#mainColumn div.content",
    {
      elementId: "#mainColumn div.content",
      generation: 1,
      methods: ["swapTab"],
    },
  ],
  [
    "mTabResource",
    { elementId: "mTabResource", generation: 1, methods: ["swapTab"] },
  ],
  [
    "market-qty",
    {
      elementId: "market-qty",
      generation: 1,
      methods: [],
      data: gameRoot.city.market,
    },
  ],
  [
    "market-Food",
    {
      elementId: "market-Food",
      generation: 1,
      methods: ["autoBuy", "autoSell", "zero", "purchase", "sell"],
    },
  ],
  ["mechList", { elementId: "mechList", generation: 1, methods: ["scrap"] }],
]);
const log = [];
const app = createCapturedPage(
  gameRoot,
  handles,
  {
    masterScriptToggle: false,
    tickRate: 1,
    autoMarket: false,
    sellFood: true,
    res_sell_r_Food: 0.8,
    autoMech: true,
    mechBuild: "none",
    mechCollectorValue: 2,
  },
  (message) => log.push(message),
);
const list = element("div", { id: "mechList" });
list.classList.add("mechList");
addMechRow(list, "small");
addMechRow(list, "collector");
app.pageRoot.appendChild(list);
let mutationObserver;
class TestMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    this.disconnectCount = 0;
    mutationObserver = this;
  }
  observe(target, options) {
    this.targets.push([target, options]);
  }
  disconnect() {
    this.disconnectCount += 1;
  }
  trigger() {
    this.callback();
  }
}
app.pageWindow.MutationObserver = TestMutationObserver;
app.cycle({ periods: 4 });

const notes = () => app.document.querySelectorAll("#mechList .ea-mech-info");
assert.equal(
  notes().length,
  2,
  "autoMech installs one info row per captured design",
);
assert.ok(notes().every((note) => note.innerHTML.includes("%")));
assert.equal(mutationObserver.targets.at(-1)[0], list);

list.replaceChildren(addMechRow(list, "redrawn"));
mutationObserver.trigger();
assert.equal(
  notes().length,
  1,
  "a list redraw refreshes the note without duplication",
);
const mechToggle = app.document.querySelector(".script_autoMech");
mechToggle.checked = true;
mechToggle.dispatch("change");
assert.equal(notes().length, 1, "repeated enable is idempotent");

const bulkSell = app.document.getElementById("bulk-sell");
assert.ok(bulkSell, "the real settings container renders Bulk Sell");
app.invoked.length = 0;
bulkSell.dispatch("mouseup");
assert.ok(
  app.invoked.includes("market-Food.sell"),
  JSON.stringify({ invoked: app.invoked, errors: app.errors }),
);
assert.equal(app.invoked.includes("market-Food.purchase"), false);
assert.equal(gameRoot.resource.Food.amount < 5, true);
assert.equal(
  log.some((message) =>
    message.includes("settings panel section not ported yet:"),
  ),
  false,
);
assert.deepEqual(app.errors, []);

mechToggle.checked = false;
mechToggle.dispatch("change");
assert.equal(notes().length, 0, "disabling autoMech removes the info rows");
assert.ok(mutationObserver.disconnectCount > 0);
app.stop();

// Missing captured surfaces leave panel creation safe, and a later Bulk Sell click is contained
// by the production event callback instead of escaping through the page's event dispatch.
const missingPage = createPanelPage();
const missingErrors = [];
let missingCycle;
const missingRuntime = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    mechanics: { readStructures: () => undefined },
    rootState: {
      readRoot: () => ({
        race: { species: "human", governor: { tasks: {} } },
        settings: { showMarket: true, showMechLab: true, qKey: false },
        portal: { mechbay: {} },
        resource: {},
      }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    keyState: { readPressed: () => false },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        missingCycle = next;
        return () => {};
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  },
  document: missingPage.document,
  settingsHostWindow: missingPage.pageWindow,
  mouseEvent: class {},
  storage: {
    getItem: () =>
      JSON.stringify({
        masterScriptToggle: false,
        autoMech: true,
        mechBuild: "none",
      }),
    setItem: () => {},
  },
  logError: (message) => missingErrors.push(message),
});
assert.doesNotThrow(() => missingCycle({ periods: 4 }));
assert.ok(missingPage.document.getElementById("bulk-sell"));
assert.doesNotThrow(() =>
  missingPage.document.getElementById("bulk-sell").dispatch("mouseup"),
);
assert.deepEqual(
  missingErrors,
  [],
  "missing Market board is an inert manual sell",
);
missingRuntime();

console.log("captured settings runtime ports passed");
