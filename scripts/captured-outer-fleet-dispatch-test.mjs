/**
 * The Dwarf Shipyard's autonomous capture and its modal-free dispatch, against a faithful
 * stand-in for the game's own draw.
 *
 * `drawShipYard()`, `loadTab('mTabCivic')`, the Civic component's `swapTab`, `pickDest`,
 * `modalCloseButton`, `shipDispatchModal` and `sendShipTo` are reproduced here from DeadSpace's
 * `truepath.js` and `index.js` at the recorded tip, over the real `installVueCapture`, the real panel
 * workspace, both real captures, and the real outer-fleet composition. The reproduction exists so the
 * bootstrap is exercised against the shape it has to survive: a draw into an element that only the
 * tab component's render would otherwise create, a `clearTabPanels` that must find nothing of the
 * player's, two `setInterval` registrations in `pickDest`, a `$buefy.modal.open()` that must build
 * nothing, and a destination row whose click listener is bound through the page's own
 * `addEventListener`.
 *
 * The ship predicates (`shipCanLaunch`, `shipCanMakeTrip`, `planShipTrip`, `shipDestinations`,
 * `shipCrewSize`) are knobs rather than formulas. What is transcribed is the routing: which branch
 * the game's draw takes, which closure it binds, and which mutation that closure performs — so a
 * refusal is the game's answer reaching us, never a rule restated here.
 */
import assert from "node:assert/strict";

import {
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
  createCapturedOuterFleetShipyard,
} from "../src/adapters/evolve/combat/captured-outer-fleet-shipyard.ts";
import { createCapturedOuterFleetDispatch } from "../src/adapters/evolve/combat/captured-outer-fleet-dispatch.ts";
import { createCapturedOuterFleetControl } from "../src/bootstrap/captured-fleet-outer-control.ts";
import { createGamePanelWorkspace } from "../src/adapters/browser/game-panel-workspace.ts";
import {
  DISPOSABLE_APP_MARKER,
  installVueCapture,
} from "../src/adapters/evolve/vue-capture.ts";
import {
  TestElement,
  createTestDocument,
  element,
  parseTestMarkup,
} from "./dom-fixture.mjs";

const MAIN_TAB_CONTROL = "#mainColumn div.content";
const CREW_BY_CLASS = { corvette: 2, frigate: 3, explorer: 6 };

/** Selectors the real `Vue.createApp` was reached for, which is the other half of "was it mounted?". */
const realApps = [];
/** The page's own `addEventListener`, so a test can prove the interception went back. */
const realAddEventListener = TestElement.prototype.addEventListener;

/** Enough Vue 3 for the shipyard's own binding. */
function makeVue() {
  const proxies = new WeakMap();
  return {
    reactive(target) {
      const existing = proxies.get(target);
      if (existing !== undefined) return existing;
      const proxy = new Proxy(target, {});
      proxies.set(target, proxy);
      return proxy;
    },
    toRaw: (value) => value,
    createApp(options) {
      const app = {
        options,
        mounted: [],
        use: () => app,
        mount(target) {
          app.mounted.push(target?.id ?? target);
          return { $forceUpdate: () => {} };
        },
        unmount: () => {},
      };
      realApps.push(options.el);
      return app;
    },
  };
}

/**
 * The game's own `$`: `dom.js` builds one over `querySelectorAll` and a `<template>`, and its `.on()`
 * is a thin `addEventListener` wrapper. That wrapper is the seam the destination closure is bound
 * through, so it routes through the page's `EventTarget.prototype` rather than an instance method.
 */
function makeJquery(page) {
  const { document } = page;
  const nodesOf = (value) => {
    if (value === null || value === undefined || value === false) return [];
    if (Array.isArray(value)) return value.flatMap(nodesOf);
    if (typeof value === "string") {
      const text = value.trim();
      if (text === "") return [];
      if (text.startsWith("<")) return parseTestMarkup(text);
      return document.querySelectorAll(text) ?? [];
    }
    if (typeof value === "object" && typeof value.nodeType === "number") {
      return [value];
    }
    if (typeof value === "object" && Array.isArray(value.nodes)) {
      return value.nodes;
    }
    return [];
  };
  const wrap = (nodes) => {
    const list = [...nodes];
    const api = { length: list.length, nodes: list };
    list.forEach((node, index) => {
      api[index] = node;
    });
    api.append = (...values) => {
      for (const node of list) {
        for (const value of values) node.append(...nodesOf(value));
      }
      return api;
    };
    api.appendTo = (host) => {
      for (const target of nodesOf(host)) {
        for (const node of list) target.append(node);
      }
      return api;
    };
    api.on = (events, selector, handler) => {
      const fn = typeof selector === "function" ? selector : handler;
      for (const node of list) {
        const wrapped = (event) => fn.call(node, event);
        for (const token of String(events).split(/\s+/).filter(Boolean)) {
          page.EventTarget.prototype.addEventListener.call(
            node,
            token,
            wrapped,
          );
        }
      }
      return api;
    };
    api.closest = (selector) =>
      wrap(
        list
          .map((node) => node.closest(selector))
          .filter((node) => node !== null),
      );
    api.find = (selector) =>
      wrap(list.flatMap((node) => node.querySelectorAll(selector)));
    api.children = () => wrap(list.flatMap((node) => node.children));
    api.addClass = (...names) => {
      for (const node of list) node.classList.add(...names);
      return api;
    };
    api.attr = (name, value) => {
      for (const node of list) node.setAttribute(name, value);
      return api;
    };
    api.removeAttr = (name) => {
      for (const node of list) node.attributes.delete(name);
      return api;
    };
    api.css = () => api;
    api.trigger = (type) => {
      page.trace.push({ kind: "trigger", type });
      return api;
    };
    return api;
  };
  const $ = (value) => wrap(nodesOf(value));
  $.fn = TestElement.prototype;
  return $;
}

function makePage() {
  const body = element("div", { id: "page" });
  const document = createTestDocument(body);
  const trace = [];
  const timers = new Map();
  let nextTimer = 0;
  const page = {
    body,
    binds: [],
    document,
    trace,
    timers,
    // The game resolves `$`, `Vue` and the timers off its own global, so the interception this
    // capture installs has to be visible here and only here.
    EventTarget: TestElement,
    realSetInterval(callback, delay) {
      const handle = ++nextTimer;
      timers.set(handle, { callback, delay });
      return handle;
    },
    realClearInterval(handle) {
      timers.delete(handle);
    },
  };
  page.$ = makeJquery(page);
  page.Vue = makeVue();
  page.setInterval = page.realSetInterval;
  page.clearInterval = page.realClearInterval;
  return page;
}

function makeShip(overrides = {}) {
  return {
    name: "Nomad",
    class: "corvette",
    location: { id: "spc_dwarf" },
    damage: 0,
    fueled: true,
    manned: false,
    ...overrides,
  };
}

function makeRoot() {
  return {
    race: {
      truepath: true,
      species: "human",
      grenadier: false,
      universe: "evil",
    },
    tech: { syndicate: 1, tauceti: 0, eris: 2, triton: 0, outer: 0 },
    settings: {
      civTabs: 1,
      govTabs: 0,
      tabLoad: false,
      animated: false,
      showShipYard: true,
    },
    space: {
      shipyard: {
        blueprint: {
          class: "corvette",
          armor: "steel",
          weapon: "railgun",
          engine: "ion",
          power: "diesel",
          sensor: "radar",
          special: "none",
          name: "Nomad",
        },
        ships: [],
        sort: false,
        expand: false,
      },
      syndicate: { spc_red: 600, spc_gas: 600 },
      operating_base: { on: 0 },
      sam: { on: 0 },
      fob: { on: 0 },
    },
    civic: {
      foreign: { gov3: { hstl: 50 } },
      govern: { type: "democracy" },
      garrison: { workers: 100, crew: 0 },
    },
    portal: {},
    resource: Object.assign(
      Object.fromEntries(
        [
          "Money",
          "Aluminium",
          "Adamantite",
          "Steel",
          "Alloy",
          "Neutronium",
          "Titanium",
          "Copper",
          "Iridium",
          "Iron",
          "Nano_Tube",
          "Quantium",
          "Orichalcum",
          "Tungsten",
        ].map((id) => [id, { amount: 1e12, max: 1e12 }]),
      ),
      { Authority: { amount: 100, max: 100, display: true } },
    ),
  };
}

/**
 * The parts of the game the two captures have to survive, transcribed from `index.js` and
 * `truepath.js` at the recorded `DeadSpace` tip.
 */
function installGame(page, root) {
  const $ = page.$;
  const settings = root.settings;
  const yard = root.space.shipyard;

  // The knobs that stand in for the game's own ship predicates.
  page.launchFloor = page.launchFloor ?? 60;
  page.destinations = page.destinations ?? ["spc_red", "spc_gas"];
  page.unreachable = page.unreachable ?? [];
  page.dryFuel = page.dryFuel ?? false;

  const shipPort = (ship) => ship.location?.id;
  const shipCrewSize = (ship) => CREW_BY_CLASS[ship.class] ?? 2;
  const shipManned = (ship) => ship.manned === true;
  const shipCanLaunch = (ship) => 100 - (ship.damage ?? 0) >= page.launchFloor;
  const shipCanMakeTrip = (ship) =>
    ship.fueled !== false && page.dryFuel !== true;
  const planShipTrip = (_pace, region) =>
    page.unreachable.includes(region) ? false : { region, legs: 1 };
  const shipDestinations = () =>
    page.destinations.map((region) => ({ region }));
  // `shipFleet` answers with the whole group the ship sails with, the flagship included.
  const shipFleet = (ship) =>
    ship.fid === undefined
      ? []
      : [
          ship,
          ...yard.ships.filter(
            (other) => other.fid === ship.fid && other !== ship,
          ),
        ];
  const fleetPace = (group) => group[0];

  function vBind(bind) {
    const target = page.document.querySelector(bind.el);
    if (target === null) return;
    const app = page.Vue.createApp({ ...bind }).use({ name: "Buefy" });
    app.mount(target);
    // `DISPOSABLE_APP_MARKER` is how the capture answers "was this really mounted?", and the real
    // `Vue.createApp` reaching the game at all is how the test answers it the other way.
    page.binds.push({
      el: bind.el,
      disposable: app[DISPOSABLE_APP_MARKER] === true,
      real: realApps.includes(bind.el),
    });
  }

  function clearElement(list) {
    const node = list?.[0];
    if (node === undefined || node === null) return;
    for (const child of [...node.children]) node.removeChild(child);
  }

  // Every teardown helper `clearTabPanels` runs is a Sortable over an element found by id, so an
  // aliased or absent panel turns it into a no-op with no other effect.
  const teardown = (selector) => () => {
    const node = $(selector)[0];
    if (node !== undefined) {
      page.trace.push({ kind: "sortable-destroy", on: node.id });
    }
  };
  const clearShipDrag = teardown("#shipList");
  const clearGrids = teardown("#powerGrid");
  const clearMechDrag = teardown("#mechList");
  const clearSpyopDrag = teardown("#civic");

  function clearTabPanels(panels, incoming) {
    for (const [selector, cleanup] of Object.entries(panels)) {
      if (selector === incoming) continue;
      for (const fn of cleanup) fn();
      clearElement($(selector));
    }
  }

  function updateCosts() {
    // The game's own price row for the live blueprint. A cost the yard cannot pay queues instead of
    // appending, which the `build` below reproduces.
    page.lastCostRow = {
      class: yard.blueprint.class,
      ships: yard.ships.length,
    };
  }

  function initializeShipTrip(ship, locationName, trip) {
    ship.movement = { from: ship.location, to: locationName, legs: trip.legs };
    delete ship.location;
  }

  function sendShipTo(id, locationName) {
    const ship = yard.ships[id];
    if (!ship || shipPort(ship) === locationName) return;
    const crew = shipFleet(ship);
    const group = crew.length ? crew : [ship];
    if (group.some((member) => !shipCanLaunch(member))) {
      page.trace.push({
        kind: "sendShipTo",
        id,
        region: locationName,
        moved: false,
        why: "hull",
      });
      return false;
    }
    const need = group.reduce(
      (total, member) =>
        total + (shipManned(member) ? 0 : shipCrewSize(member)),
      0,
    );
    if (need > root.civic.garrison.workers - root.civic.garrison.crew) {
      page.trace.push({
        kind: "sendShipTo",
        id,
        region: locationName,
        moved: false,
        why: "crew",
      });
      return false;
    }
    const trip = planShipTrip(fleetPace(group), locationName);
    if (trip && group.every((member) => shipCanMakeTrip(member, trip))) {
      for (const member of group) {
        if (!shipManned(member))
          root.civic.garrison.crew += shipCrewSize(member);
        delete member.ret;
        initializeShipTrip(member, locationName, trip);
      }
    }
    page.trace.push({
      kind: "sendShipTo",
      id,
      region: locationName,
      moved: group.some((member) => member.movement !== undefined),
    });
    drawShips();
    return group.some((member) => member.movement !== undefined);
  }

  function drawShips() {
    if (
      !settings.tabLoad &&
      (settings.civTabs !== 2 || settings.govTabs !== 5)
    ) {
      return;
    }
    clearShipDrag();
    clearElement($("#shipList"));
    // The game's own re-sort and fleet re-clustering: same ship objects, new positions.
    if (page.reorderShips === true) yard.ships = [...yard.ships].reverse();
    clearElement($("#shipList"));
    yard.ships.forEach((_ship, index) => {
      $("#shipList").append(
        $(`<button id="ship${index}loc" class="button is-info"></button>`),
      );
    });
  }

  function modalCloseButton() {
    let waited = 0;
    const attach = page.setInterval(function () {
      const box = $("#modalBox");
      if (!box.length) {
        if ((waited += 50) > 3000) page.clearInterval(attach);
        return;
      }
      page.clearInterval(attach);
      const modal = box.closest(".modal");
      if (modal.find(".modalClose").length) return;
      box.css("position", "relative");
      $('<input type="button" class="modalClose" value="x" />')
        .on("click", function () {
          $(this).closest(".modal").find(".modal-close").trigger("click");
        })
        .appendTo(box);
    }, 50);
  }

  function shipDispatchModal(id, modal) {
    const ship = yard.ships[id];
    if (!ship) return;
    const crew = shipFleet(ship);
    const group = crew.length ? crew : [ship];
    $("#modalBox").append(
      $('<p id="modalBoxTitle" class="has-text-warning modalTitle"></p>'),
    );
    const list = $('<div class="shipDispatch"></div>');
    $("#modalBox").append(list);
    let dests = shipDestinations(group[0]);
    for (let i = 1; i < group.length; i += 1) {
      const reachable = new Set(
        shipDestinations(group[i]).map((d) => d.region),
      );
      dests = dests.filter((d) => reachable.has(d.region));
    }
    const crewNeed = group.reduce(
      (total, member) =>
        total + (shipManned(member) ? 0 : shipCrewSize(member)),
      0,
    );
    const crewFree = Math.max(
      0,
      root.civic.garrison.workers - root.civic.garrison.crew,
    );
    if (group.some((member) => !shipCanLaunch(member))) {
      list.append($('<span class="has-text-danger"></span>'));
    } else if (crewNeed > crewFree) {
      list.append($('<span class="has-text-danger"></span>'));
    } else if (dests.length === 0) {
      list.append($('<span class="has-text-caution"></span>'));
    } else {
      const slowest = fleetPace(group);
      dests.forEach(function (destination) {
        const trip = planShipTrip(slowest, destination.region);
        if (!trip) return;
        const fuelReady = group.every((member) =>
          shipCanMakeTrip(member, trip),
        );
        $(
          `<button class="button is-info ${destination.region}" ${fuelReady ? "" : "disabled"}><span class="dispatchName"></span></button>`,
        )
          .on("click", function () {
            if (!fuelReady) return;
            sendShipTo(id, destination.region);
            if (modal && modal.close) modal.close();
          })
          .appendTo(list);
      });
    }
  }

  const shipyardMethods = {
    avail: (_type, _index, part) => part !== "phaser",
    setVal: (type, part) => {
      yard.blueprint[type] = part;
      updateCosts();
    },
    powerText: () => page.powerText ?? "100kW",
    build: () => {
      page.builds = (page.builds ?? 0) + 1;
      yard.ships.push({
        ...yard.blueprint,
        name: "Nomad",
        location: { id: "spc_dwarf" },
        damage: 0,
        fueled: true,
        manned: false,
      });
      drawShips();
    },
    drawShips: () => drawShips(),
    // The yard's own answer to whether a ship is under way.
    show: (id) => yard.ships[id]?.movement !== undefined,
    pickDest: function (id) {
      const modal = this.$buefy.modal.open({
        hasModalCard: false,
        content: '<div id="modalBox" class="modalBox"></div>',
      });
      modalCloseButton();
      const checkExist = page.setInterval(function () {
        if ($("#modalBox").length > 0) {
          page.clearInterval(checkExist);
          shipDispatchModal(id, modal);
        }
      }, 50);
    },
  };

  function drawShipYard() {
    if (
      !settings.tabLoad &&
      (settings.civTabs !== 2 || settings.govTabs !== 5)
    ) {
      return;
    }
    clearShipDrag();
    clearElement($("#dwarfShipYard"));
    if (!Object.hasOwn(root.space, "shipyard") || !settings.showShipYard) {
      return;
    }
    const panel = $("#dwarfShipYard");
    const plans = $('<div id="shipPlans"></div>');
    panel.append(plans);
    plans.append($('<div id="shipYardCosts" class="costList"></div>'));
    updateCosts();
    vBind({
      el: "#shipPlans",
      data: { b: yard.blueprint, s: yard },
      methods: shipyardMethods,
    });
    panel.append($('<div id="shipList" class="sticky"></div>'));
    drawShips();
  }

  const civicMethods = {
    swapTab(tab) {
      if (!settings.tabLoad) {
        clearTabPanels({
          "#civic": [clearSpyopDrag],
          "#industry": [],
          "#powerGrid": [clearGrids],
          "#military": [],
          "#mechLab": [clearMechDrag],
          "#dwarfShipYard": [clearShipDrag],
          "#perkUnderground": [],
          "#psychicPowers": [],
          "#supernatural": [],
        });
        switch (tab) {
          case 5:
            if (
              root.race.truepath &&
              root.race.species !== "protoplasm" &&
              !root.race.start_cataclysm
            ) {
              drawShipYard();
            }
            break;
          default:
            break;
        }
      }
      return tab;
    },
  };

  function loadCivicTab() {
    $("#mTabCivic").append($('<b-tabs class="resTabs"></b-tabs>'));
    vBind({ el: "#mTabCivic", data: { s: settings }, methods: civicMethods });
    // `loadTab('mTabCivic')` reaches the yard itself once the tab settings select it.
    if (
      root.race.truepath &&
      root.race.species !== "protoplasm" &&
      !root.race.start_cataclysm
    ) {
      drawShipYard();
    }
  }

  const mainMethods = {
    swapTab(tab) {
      if (!settings.tabLoad) {
        clearTabPanels(
          {
            "#mTabCivil": [],
            "#mTabCivic": [
              clearGrids,
              clearMechDrag,
              clearSpyopDrag,
              clearShipDrag,
            ],
            "#mTabResearch": [],
            "#mTabResource": [],
            "#mTabArpa": [],
            "#mTabStats": [],
            "#mTabObserve": [],
          },
          tab === 2 ? "#mTabCivic" : "#mTabCivil",
        );
      }
      switch (tab) {
        case 2:
          loadCivicTab();
          break;
        default:
          break;
      }
      return tab;
    },
  };

  return { drawShipYard, mainMethods, civicMethods, shipyardMethods };
}

/**
 * One page with the game's own globals, the real Vue capture, and both captures on top. `withCivic`
 * stands for a player who has opened the Civic tab at some point, which is what binds `mTabCivic`.
 */
function makeHarness({
  root = makeRoot(),
  withCivic = false,
  playerPanel = true,
  establish = false,
} = {}) {
  const page = makePage();
  const game = installGame(page, root);
  page.body.append(element("div", { id: "mainColumn" }));
  const content = element("div", { class: "content" });
  page.document.getElementById("mainColumn").append(content);
  content.append(element("div", { id: "mTabCivil" }));
  content.append(element("div", { id: "mTabCivic" }));
  if (playerPanel) {
    page.document
      .getElementById("mTabCivil")
      .append(element("div", { id: "city" }));
  }

  const faults = [];
  const capture = installVueCapture(page);
  capture.mountSuppression.withMountingEnabled(() => {
    page.Vue.createApp({ el: MAIN_TAB_CONTROL, methods: game.mainMethods })
      .use({ name: "Buefy" })
      .mount(content);
    if (withCivic) {
      page.document
        .getElementById("mTabCivic")
        .append(element("div", { id: "civic" }));
      page.Vue.createApp({ el: "#mTabCivic", methods: game.civicMethods })
        .use({ name: "Buefy" })
        .mount(page.document.getElementById("mTabCivic"));
    }
  });

  const panels = createGamePanelWorkspace({ getDocument: () => page.document });
  const shipyard = createCapturedOuterFleetShipyard({
    rootState: { readRoot: () => root },
    controls: capture.controls,
    synthesis: capture.synthesis,
    mountSuppression: capture.mountSuppression,
    panels,
    getDocument: () => page.document,
    onEstablishError: (detail) => faults.push(detail),
  });
  const dispatch = createCapturedOuterFleetDispatch({
    controls: capture.controls,
    synthesis: capture.synthesis,
    mountSuppression: capture.mountSuppression,
    getDocument: () => page.document,
    getPageWindow: () => page,
    onCaptureError: (detail) => faults.push(detail),
  });
  if (establish) shipyard.establish();
  return { page, root, game, capture, shipyard, dispatch, panels, faults };
}

function sentTo(page) {
  return page.trace.filter((record) => record.kind === "sendShipTo");
}

// ---------------------------------------------------------------------------
// Establishing the yard from a save that has never rendered it.
// ---------------------------------------------------------------------------

const never = makeHarness();
assert.equal(
  never.page.document.getElementById("dwarfShipYard"),
  null,
  "the save under test has no Dwarf Shipyard panel at all",
);
assert.equal(
  never.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL),
  undefined,
);
// The player is on Civilization and stays there.
assert.equal(never.root.settings.civTabs, 1);
assert.equal(never.root.settings.govTabs, 0);
const playerPanelChildren = () =>
  never.page.document.getElementById("mTabCivil").children.length;
const playerChildrenBefore = playerPanelChildren();

const established = never.shipyard.establish();
assert.notEqual(established, undefined, never.faults.join("; "));
assert.equal(never.root.settings.civTabs, 1);
assert.equal(never.root.settings.govTabs, 0);
assert.equal(never.root.settings.animated, false);
assert.equal(playerPanelChildren(), playerChildrenBefore);
assert.ok(
  never.capture.controls.resolve("mTabCivic") !== undefined,
  "the main-tab route also bound the Civic sub-tab component",
);
const yardControl = never.capture.controls.resolve(
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
);
assert.equal(yardControl.elementId, CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
for (const method of [
  "avail",
  "setVal",
  "powerText",
  "build",
  "pickDest",
  "show",
]) {
  assert.ok(
    yardControl.methods.includes(method),
    `shipPlans is missing ${method}`,
  );
}
assert.equal(yardControl.data.s, never.root.space.shipyard);
// The temporary panel and everything the draw put in it is gone.
assert.equal(never.page.document.getElementById("dwarfShipYard"), null);
assert.equal(never.page.document.getElementById("shipPlans"), null);
assert.equal(
  never.page.document.getElementById("mTabCivic").children.length,
  0,
);
// The capture recorded the binding without building a Vue tree behind it.
assert.deepEqual(
  never.page.binds.map((bind) => [bind.el, bind.disposable, bind.real]),
  [
    ["#mTabCivic", true, false],
    ["#shipPlans", true, false],
  ],
);
assert.deepEqual(
  realApps,
  [MAIN_TAB_CONTROL],
  "a suppressed draw reached the real createApp",
);
assert.equal(never.faults.length, 0);
// Nothing was left standing in the Civic panel the player is looking at: the workspace put every
// name back and kept the player's own content.
assert.notEqual(never.page.document.getElementById("city"), null);
assert.equal(never.page.document.getElementById("ea-aside-city"), null);

// ---------------------------------------------------------------------------
// Dispatching through the game's own destination closure.
// ---------------------------------------------------------------------------

never.root.space.shipyard.ships.push(makeShip({ name: "Nomad" }));
const dispatchState = never.dispatch.dispatchShipyardShip({
  index: 0,
  region: "spc_red",
});
assert.deepEqual(dispatchState, { kind: "launched" });
assert.deepEqual(sentTo(never.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.equal(never.root.space.shipyard.ships[0].movement.to, "spc_red");
assert.equal(never.root.civic.garrison.crew, 2, "the game claimed the crew");
// No window of any kind was produced, and nothing the player owns was touched.
assert.equal(never.page.document.querySelector(".modal.is-active"), null);
assert.equal(never.page.document.querySelector(".modal-background"), null);
assert.equal(never.page.document.getElementById("modalBox"), null);
assert.equal(never.page.document.querySelector(".modal-close"), null);
assert.deepEqual(never.page.document.querySelector(".modalClose"), null);
assert.deepEqual(
  never.page.trace.filter((record) => record.kind === "trigger"),
  [],
);
// The interception and the timers went back exactly as they were.
assert.equal(
  TestElement.prototype.addEventListener,
  realAddEventListener,
  "the page's own addEventListener was not restored",
);
assert.equal(never.page.setInterval, never.page.realSetInterval);
assert.equal(never.page.clearInterval, never.page.realClearInterval);
assert.equal(never.page.timers.size, 0);

// A second ship, and a different region: the closure is bound by this draw, so nothing from the
// first dispatch can answer for it.
never.page.trace.length = 0;
never.root.space.shipyard.ships.push(makeShip({ name: "Vagrant" }));
assert.deepEqual(
  never.dispatch.dispatchShipyardShip({ index: 1, region: "spc_gas" }),
  { kind: "launched" },
);
assert.deepEqual(sentTo(never.page), [
  { kind: "sendShipTo", id: 1, region: "spc_gas", moved: true },
]);
assert.equal(never.root.space.shipyard.ships[1].movement.to, "spc_gas");
assert.equal(never.root.space.shipyard.ships[0].movement.to, "spc_red");

// A region the game's draw does not offer at all: nothing is invoked, and the capture fails closed.
never.page.trace.length = 0;
never.root.space.shipyard.ships.push(makeShip({ name: "Drifter" }));
assert.deepEqual(
  never.dispatch.dispatchShipyardShip({ index: 2, region: "spc_titan" }),
  { kind: "no-destination" },
);
assert.deepEqual(sentTo(never.page), []);
assert.equal(never.root.space.shipyard.ships[2].movement, undefined);

// The yard's list order can change under the ship that was built, so the postcondition is asked of
// the ship by identity rather than of the index it was built at. `sendShipTo` redraws the yard, and
// that redraw re-sorts and re-clusters the list — so it is asked of the ship, not of where it sat.
const reordered = makeHarness({ establish: true });
reordered.page.reorderShips = true;
// The redraw is the game's, and it only runs when the yard is the panel in front of the player.
reordered.root.settings.civTabs = 2;
reordered.root.settings.govTabs = 5;
reordered.root.space.shipyard.ships.push(makeShip({ name: "First" }));
reordered.root.space.shipyard.ships.push(makeShip({ name: "Second" }));
assert.deepEqual(
  reordered.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "launched" },
);
const reorderedShips = reordered.root.space.shipyard.ships;
assert.equal(
  reorderedShips[0].name,
  "Second",
  "the yard re-sorted its own list",
);
assert.equal(reorderedShips[0].movement.to, "spc_red");
assert.equal(reorderedShips[1].name, "First");
assert.equal(reorderedShips[1].movement, undefined);

// A hull below the launch minimum: the game's draw offers no destination row at all.
const hurt = makeHarness({ establish: true });
hurt.root.space.shipyard.ships.push(makeShip({ damage: 90 }));
assert.deepEqual(
  hurt.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "no-destination" },
);
assert.deepEqual(sentTo(hurt.page), []);

// Crew the run cannot spare: also the draw's own refusal, before any row is built.
const crewless = makeHarness({ establish: true });
crewless.root.civic.garrison.workers = 1;
crewless.root.space.shipyard.ships.push(makeShip());
assert.deepEqual(
  crewless.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "no-destination" },
);
assert.deepEqual(sentTo(crewless.page), []);

// Fuel the run cannot make: the row is built and bound but disabled, so the game's own closure is
// the one that declines, before it ever reaches `sendShipTo`.
const dry = makeHarness({ establish: true });
dry.page.dryFuel = true;
dry.root.space.shipyard.ships.push(makeShip());
assert.deepEqual(
  dry.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "refused" },
);
assert.deepEqual(sentTo(dry.page), []);
assert.equal(dry.root.space.shipyard.ships[0].movement, undefined);

// A ship already at the requested region: the closure runs and the checks inside `sendShipTo` are
// what decline it. Nothing here decides that — the game's own guard does.
const alreadyThere = makeHarness({ establish: true });
alreadyThere.root.space.shipyard.ships.push(
  makeShip({ location: { id: "spc_red" } }),
);
assert.deepEqual(
  alreadyThere.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "refused" },
);
assert.deepEqual(sentTo(alreadyThere.page), []);
assert.equal(alreadyThere.root.space.shipyard.ships[0].movement, undefined);

// A fleet sails as one body: the same closure moves every member and claims their crew.
const fleet = makeHarness({ establish: true });
fleet.root.space.shipyard.ships.push(
  makeShip({ name: "Flag", fid: 7, flag: true }),
);
fleet.root.space.shipyard.ships.push(makeShip({ name: "Escort", fid: 7 }));
assert.deepEqual(
  fleet.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "launched" },
);
assert.equal(fleet.root.space.shipyard.ships[0].movement.to, "spc_red");
assert.equal(fleet.root.space.shipyard.ships[1].movement.to, "spc_red");
assert.equal(fleet.root.civic.garrison.crew, 4);

// A capture that cannot start performs no dispatch at all.
const occupied = makeHarness({ establish: true });
occupied.root.space.shipyard.ships.push(makeShip());
occupied.page.body.append(element("div", { id: "modalBox" }));
assert.deepEqual(
  occupied.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(occupied.page), []);

const noShip = makeHarness({ establish: true });
assert.deepEqual(
  noShip.dispatch.dispatchShipyardShip({ index: 3, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(noShip.page), []);

const unbound = makeHarness({ establish: true });
unbound.capture.uninstall();
unbound.root.space.shipyard.ships.push(makeShip());
assert.deepEqual(
  unbound.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(unbound.page), []);

// A window the player owns: the capture reports the block, and a dispatch never touches it.
const owned = makeHarness({ establish: true });
const playerModal = element("div");
playerModal.classList.add("modal", "is-active");
const playerClose = element("button");
playerClose.classList.add("modal-close");
playerModal.append(playerClose);
owned.page.body.append(playerModal);
const playerBackground = element("div");
playerBackground.classList.add("modal-background");
owned.page.body.append(playerBackground);
assert.equal(owned.dispatch.blockedByPlayerModal(), true);
assert.equal(never.dispatch.blockedByPlayerModal(), false);
owned.root.space.shipyard.ships.push(makeShip());
assert.deepEqual(
  owned.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "launched" },
);
assert.equal(
  playerClose.clicked ?? 0,
  0,
  "the player's close button was clicked",
);
assert.equal(playerModal.children.length, 1);
assert.equal(
  owned.page.document.querySelectorAll(".modal.is-active").length,
  1,
  "the player's window is still theirs",
);

// ---------------------------------------------------------------------------
// Build and dispatch in one pass, from a shipyard the save never rendered.
// ---------------------------------------------------------------------------

const integrated = makeHarness({ establish: true });
const effectiveSettings = Object.create({
  fleetOuterShips: "custom",
  fleetOuterCrew: 4,
  fleetExploreTau: false,
  fleet_outer_pr_spc_red: 1,
  fleet_outer_def_spc_red: 0.9,
  fleet_outer_sc_spc_red: 0,
  fleet_outer_class: "corvette",
  fleet_outer_power: "diesel",
  fleet_outer_weapon: "railgun",
  fleet_outer_armor: "steel",
  fleet_outer_engine: "ion",
  fleet_outer_sensor: "radar",
  fleet_scout_class: "corvette",
  fleet_scout_power: "diesel",
  fleet_scout_weapon: "railgun",
  fleet_scout_armor: "steel",
  fleet_scout_engine: "ion",
  fleet_scout_sensor: "radar",
  authorityManage: false,
  generalMinimumAuthority: 100,
});
const outerControl = createCapturedOuterFleetControl({
  rootState: { readRoot: () => integrated.root },
  controls: integrated.capture.controls,
  dispatch: integrated.dispatch,
  readSettings: () => effectiveSettings,
});
const pass = outerControl.autoFleetOuter();
assert.equal(pass.outcome.status, "succeeded");
assert.equal(pass.shipTargetChanged, true);
assert.equal(integrated.root.space.shipyard.ships.length, 1);
assert.equal(integrated.page.builds, 1);
// Built and sent in the same pass, through the game's own closure, with nothing left on screen.
assert.deepEqual(sentTo(integrated.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.equal(integrated.root.space.shipyard.ships[0].movement.to, "spc_red");
assert.equal(integrated.page.document.getElementById("modalBox"), null);
assert.equal(integrated.page.document.querySelector(".modal.is-active"), null);
assert.equal(integrated.root.settings.civTabs, 1);
assert.equal(integrated.root.settings.govTabs, 0);

// A save whose yard is not on yet is not worth a draw: `drawShipYard()` returns before it binds.
const dark = makeHarness();
dark.root.settings.showShipYard = false;
assert.equal(dark.shipyard.establish(), undefined);
assert.equal(
  dark.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL),
  undefined,
);
assert.equal(dark.page.document.getElementById("dwarfShipYard"), null);

// A game that retains every tab makes both routes no-ops, so the capture refuses rather than
// clearing panels its workspace does not cover.
const retained = makeHarness();
retained.root.settings.tabLoad = true;
assert.equal(retained.shipyard.establish(), undefined);
assert.ok(
  retained.faults.some((detail) => detail.includes("retains every tab")),
  retained.faults.join("; "),
);

console.log("Captured outer-fleet synthetic capture checks passed");
