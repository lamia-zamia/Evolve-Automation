import assert from "node:assert/strict";

import { installPageCapture } from "../src/adapters/evolve/page-capture.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

class FakeWorker {
  listeners = [];

  addEventListener(type, listener) {
    if (type === "message") this.listeners.push(listener);
  }

  removeEventListener() {}

  dispatch(data) {
    for (const listener of this.listeners) listener({ data });
  }
}

function makeVue() {
  const raws = new WeakMap();
  return {
    reactive(target) {
      const proxy = new Proxy(target, {});
      raws.set(proxy, target);
      return proxy;
    },
    toRaw(value) {
      return raws.get(value) ?? value;
    },
    createApp(options) {
      return { options };
    },
  };
}

const body = element("div", { id: "page" });
const document = createTestDocument(body);
let demandReads = 0;
let marketPriceReads = 0;
let failDemand = false;

const root = {
  race: {},
  stats: { days: 1, reset: 0 },
  tech: { trade: true, currency: 0 },
  civic: {},
  settings: { showMarket: true, showResearch: true },
  city: { market: { qty: 1, mtrade: 1, trade: 0 } },
  queue: {
    get display() {
      if (failDemand) throw new Error("demand sample failed");
      demandReads += 1;
      return true;
    },
    pause: false,
    queue: [],
  },
  resource: {
    Money: { amount: 1000, max: 10000, display: true, diff: 0, value: 1 },
    Food: {
      amount: 40,
      max: 100,
      display: true,
      diff: 0,
      get value() {
        marketPriceReads += 1;
        return 1;
      },
      trade: 0,
      stackable: true,
    },
  },
};
const page = { Worker: FakeWorker, document };
const capture = installPageCapture(page);
const vue = makeVue();
page.Vue = vue;
vue.reactive(root);

let gatherClicks = 0;
let purchases = 0;
let firstGatherDemandReads;
let gatherMutations = 0;
let priceReadsAfterGather = 0;
vue.createApp({
  el: "#city-food",
  methods: {
    action() {
      firstGatherDemandReads ??= demandReads;
      const before = root.resource.Food.amount;
      gatherClicks += 1;
      root.resource.Food.amount += 1;
      if (root.resource.Food.amount === before + 1) gatherMutations += 1;
      priceReadsAfterGather = marketPriceReads;
    },
  },
});
vue.createApp({
  el: "#market-qty",
  data: root.city.market,
  methods: { setQty() {} },
});
vue.createApp({
  el: "#market-Food",
  methods: {
    autoBuy() {},
    autoSell() {},
    zero() {},
    purchase() {
      purchases += 1;
      root.resource.Food.amount += root.city.market.qty;
      root.resource.Money.amount -= root.city.market.qty;
    },
    sell() {},
  },
});
const worker = new page.Worker("evolve/evolve.js");
worker.addEventListener("message", () => {});
assert.equal(capture.isComplete(), true);

const errors = [];
const stop = startCapturedRuntime({
  pageCapture: capture,
  document,
  settingsHostWindow: page,
  mouseEvent: class {},
  storage: {
    getItem: () =>
      JSON.stringify({
        masterScriptToggle: true,
        tickRate: 1,
        buildingAlwaysClick: true,
        buildingClickPerTick: 10,
        autoMarket: true,
        buyFood: true,
        res_buy_r_Food: 0.5,
        researchRequest: true,
      }),
    setItem: () => {},
  },
  logError: (message) => errors.push(message),
});
try {
  worker.dispatch({ loop: "main", periods: 1 });
  assert.equal(gatherClicks, 10, "captured Gather action must run");
  assert.equal(
    gatherMutations,
    10,
    "captured Gather must change the live root",
  );
  assert.ok(firstGatherDemandReads > 0, "demand must be sampled before Gather");
  assert.equal(purchases, 0, "Market must see post-Gather holdings");
  assert.ok(
    marketPriceReads > priceReadsAfterGather,
    "Market must evaluate Food after Gather",
  );
  assert.equal(root.resource.Food.amount, 50);
  assert.equal(root.resource.Money.amount, 1000);
  assert.deepEqual(errors, []);

  failDemand = true;
  worker.dispatch({ loop: "main", periods: 1 });
  assert.equal(gatherClicks, 10, "failed demand must skip Gather");
  assert.equal(root.resource.Food.amount, 50);
  assert.ok(
    errors.includes("pre-Gather demand stopped: Error: demand sample failed"),
  );
} finally {
  stop();
  capture.uninstall();
}

console.log("captured-gather-market-runtime ok");
