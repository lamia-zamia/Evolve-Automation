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

const shipNames = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const regionNames = [
  "gxy_gateway",
  "gxy_stargate",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
];
const defense = Object.fromEntries(
  regionNames.map((region) => [
    region,
    Object.fromEntries(shipNames.map((ship) => [ship, 0])),
  ]),
);
const root = {
  race: {},
  stats: { days: 1, reset: 0 },
  tech: { piracy: 1 },
  civic: {},
  settings: { showGalactic: true, civTabs: 1, spaceTabs: 3 },
  city: { powered: true, power: 0 },
  galaxy: {
    defense,
    scout_ship: { count: 7 },
    corvette_ship: { count: 0 },
    frigate_ship: { count: 0 },
    cruiser_ship: { count: 0 },
    dreadnought: { count: 0 },
    excavator: { count: 1, on: 1 },
    raider: { count: 620, on: 620 },
    minelayer: { count: 1, on: 1 },
  },
  queue: { display: true, pause: false, queue: [] },
  resource: {
    Knowledge: { amount: 0, max: 100, display: true, diff: 0 },
    Orichalcum: { amount: 0, max: 100, display: true, diff: 0 },
  },
};
const warning = element("div", { id: "galaxy-minelayer" });
const warningMarker = element("span");
warningMarker.classList.add("on", "warn");
warning.append(warningMarker);
const body = element("div", { id: "page" });
const mainColumn = element("div", { id: "mainColumn" });
const mainContent = element("div", { className: "content" });
mainColumn.append(mainContent);
body.append(
  mainColumn,
  element("div", { id: "mTabCivil" }),
  element("div", { id: "galaxy" }),
  warning,
);
const document = createTestDocument(body);
const page = { Worker: FakeWorker, document };
const capture = installPageCapture(page);
const vue = makeVue();
page.Vue = vue;
vue.reactive(root);

vue.createApp({ el: "#mainColumn div.content", methods: { swapTab() {} } });
vue.createApp({ el: "#mTabCivil", methods: { swapTab() {} } });

const fleetCalls = [];
vue.createApp({
  el: "#fleet",
  methods: {
    add(region, ship) {
      fleetCalls.push(["add", region, ship]);
      root.galaxy.defense[region][ship] += 1;
    },
    sub(region, ship) {
      fleetCalls.push(["sub", region, ship]);
      root.galaxy.defense[region][ship] -= 1;
    },
  },
});
vue.createApp({
  el: "#galaxy-minelayer",
  methods: {
    power_off() {
      root.galaxy.minelayer.on = 0;
    },
  },
});
const worker = new page.Worker("evolve/evolve.js");
worker.addEventListener("message", () => {});
assert.equal(capture.isComplete(), true);
assert.deepEqual(capture.controls.resolve("fleet")?.methods, ["add", "sub"]);
assert.deepEqual(capture.controls.resolve("galaxy-minelayer")?.methods, [
  "power_off",
]);

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
        autoFleet: true,
        autoPower: true,
        fleetMaxCover: true,
      }),
    setItem: () => {},
  },
  logError: (message) => errors.push(message),
});
try {
  worker.dispatch({ loop: "main", periods: 1 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^autoPower: captured-power-cycle-unavailable:/);
  assert.deepEqual(fleetCalls, [
    ["add", "gxy_stargate", "scout_ship"],
    ["add", "gxy_chthonian", "scout_ship"],
  ]);
  assert.equal(root.galaxy.defense.gxy_stargate.scout_ship, 1);
  assert.equal(root.galaxy.defense.gxy_chthonian.scout_ship, 1);
  // A DOM warning and a rendered switch cannot authorize Power without the complete
  // semantic mechanics sample. Fleet remains independent of that unavailable cycle.
  assert.equal(root.galaxy.minelayer.on, 1);
} finally {
  stop();
  capture.uninstall();
}

console.log("captured-fleet-power-runtime ok");
