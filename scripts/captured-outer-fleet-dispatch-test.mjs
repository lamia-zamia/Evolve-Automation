/**
 * The Dwarf Shipyard's autonomous capture and its modal-free dispatch, against a faithful
 * stand-in for the game's own draw.
 *
 * `drawShipYard()`, `loadTab('mTabCivic')`, the Civic component's `swapTab`, `drawShips`,
 * `drawShipRow`, `shipyardView()`, `buildTPShip`, `pickDest`, `modalCloseButton`,
 * `shipDispatchModal` and `sendShipTo` are reproduced here from DeadSpace's `truepath.js`,
 * `ships.js` and `index.js` at the recorded tip, over the real `installVueCapture`, the real panel
 * workspace, both real captures, and the real outer-fleet composition.
 *
 * **The topology is the point of this transcription.** Upstream `drawShipYard()` binds `#shipPlans`
 * with the yard's *design* methods — `avail`, `setVal`, `powerText`, `build`, `redraw` and the rest
 * of its own — and nothing else. Upstream `drawShips()` then binds each `#shipReg${i}` separately,
 * with the ship as its data, and `pickDest` and `show` exist only there. A stand-in that folds the
 * row methods onto the yard control describes a control the game never builds, and every assertion
 * below would then be made against that fiction. So the yard methods and the row methods are two
 * different objects here, exactly as they are upstream, and the first assertion is that the yard
 * control does not carry the row's.
 *
 * `vBind` also reproduces upstream's rewrite of `data` into `Vue.reactive(original)`, which is why a
 * captured handle's data is a proxy and the capture has to ask the page's `Vue.toRaw` what it wraps.
 *
 * The reproduction exists so the bootstrap is exercised against the shape it has to survive: a draw
 * into an element that only the tab component's render would otherwise create, a `clearTabPanels`
 * that must find nothing of the player's, a build whose own `drawShips()` returns at the tab gate
 * because the player is elsewhere, two `setInterval` registrations in `pickDest`, a
 * `$buefy.modal.open()` that must build nothing, and a destination row whose click listener is
 * bound through the page's own `addEventListener`.
 *
 * The ship predicates (`shipCanLaunch`, `shipCanMakeTrip`, `planShipTrip`, `shipDestinations`,
 * `shipCrewSize`) and the yard's location-to-system map are knobs rather than formulas. What is
 * transcribed is the routing: which branch the game's draw takes, which closure it binds, which
 * mutation that closure performs, and which rows it binds — so a refusal is the game's answer
 * reaching us, never a rule restated here.
 */
import assert from "node:assert/strict";

import {
  CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX,
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
const HARNESS_SETTINGS = {
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
};

/** Selectors the real `Vue.createApp` was reached for, which is the other half of "was it mounted?". */
const realApps = [];
/** The page's own `addEventListener`, so a test can prove the interception went back. */
const realAddEventListener = TestElement.prototype.addEventListener;

/**
 * Enough Vue 3 for the yard's own binding. `reactive` is the identity to the object it wraps, which
 * is what a no-trap proxy is, and `toRaw` is the game's own answer to what such a proxy wraps — the
 * pair the capture has to agree with, since `vBind` never hands `Vue.createApp` the raw object.
 */
function makeVue() {
  const proxies = new WeakMap();
  const raws = new WeakMap();
  return {
    reactive(target) {
      const existing = proxies.get(target);
      if (existing !== undefined) return existing;
      const proxy = new Proxy(target, {});
      proxies.set(target, proxy);
      raws.set(proxy, target);
      return proxy;
    },
    toRaw: (value) =>
      typeof value === "object" && value !== null && raws.has(value)
        ? raws.get(value)
        : value,
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
 * The parts of the game the two captures have to survive, transcribed from `index.js`,
 * `truepath.js` and `ships.js` at the recorded `DeadSpace` tip.
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
  // `drawShips()` filters by the system a ship is bound to, and `shipyardSystems()` is the game's
  // own keyspace for that. A map keeps the filter's rule intact without restating the game.
  page.systems = page.systems ?? {};
  page.repairYards = page.repairYards ?? ["spc_dwarf"];
  /**
   * Overridable so a case can stand in for a draw that bound a row to the wrong ship. The default is
   * the game's own line: `data: global.space.shipyard.ships[i]`.
   */
  page.rowData = page.rowData ?? ((index) => yard.ships[index]);

  const shipPort = (ship) => ship.location?.id;
  const shipBound = (ship) => ship.location?.id ?? ship.movement?.to;
  const locSystem = (loc) => page.systems[loc] ?? loc;
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
  const systemLabel = (sys) => sys;

  /**
   * `functions.js:vBind` rewrites a component's plain `data` object into a factory returning
   * `Vue.reactive(original)` before it reaches `Vue.createApp`, so what the capture records is a
   * proxy. Reproduced here so the row-identity proof is exercised against a proxy rather than the
   * raw object the real page never hands over.
   */
  function vBind(bind, action) {
    if (action === "update") return;
    const target = page.document.querySelector(bind.el);
    if (target === null) return;
    const options = { ...bind };
    if (typeof options.data === "object" && options.data !== null) {
      const original = options.data;
      options.data = function reactiveData() {
        return page.Vue.reactive(original);
      };
    }
    const app = page.Vue.createApp(options).use({ name: "Buefy" });
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

  /**
   * `truepath.js:shipyardView` - created and backfilled on read rather than migrated, so an older
   * save picks it up the first time the yard is drawn. Held under the shipyard, so it saves with it.
   */
  function shipyardView() {
    const v = yard.view ?? (yard.view = {});
    if (typeof v.sys !== "string") v.sys = "all";
    if (typeof v.group !== "boolean") v.group = false;
    if (!v.fold || typeof v.fold !== "object") v.fold = {};
    if (!v.ffold || typeof v.ffold !== "object") v.ffold = {};
    return v;
  }

  /**
   * The collapsed summary for one location. Its own binding, like the row's: only the row's methods
   * belong on `shipReg*`, and only these belong on `shipGrp*`.
   */
  function drawShipGroup(list, group, locationName) {
    const head = $(`<div id="shipGrp${group}" class="shipGroup"></div>`);
    head.append(
      `<a class="groupFold" @click="fold()" role="button"><span class="name"></span></a>`,
    );
    list.append(head);
    vBind({
      el: `#shipGrp${group}`,
      data: { v: shipyardView() },
      methods: {
        folded() {
          return shipyardView().fold[locationName] ? true : false;
        },
        fold() {
          const fold = shipyardView().fold;
          if (fold[locationName]) delete fold[locationName];
          else fold[locationName] = true;
          drawShips();
        },
        count() {
          return yard.ships.filter((ship) => shipBound(ship) === locationName)
            .length;
        },
      },
    });
  }

  /**
   * `truepath.js:drawShipRow` - one row per ship, each bound to its own element with the ship
   * itself as the data. `pickDest` and `show` are defined here and nowhere else in the game, which
   * is why the dispatch reaches the ship through `shipReg${i}` and not through `shipPlans`.
   */
  function drawShipRow(list, i, ship) {
    const dispatch = `<button id="ship${i}loc" class="button is-info" @click="pickDest(${i})"><span></span></button>`;
    const desc = $(`<div id="shipReg${i}" class="shipRow ship${i}"></div>`);
    const row1 = $(
      `<div class="row1"><span class="name has-text-caution">${ship.name}</span></div>`,
    );
    const row3 = $(
      `<div class="row3"><span class="has-text-caution"></span></div>`,
    );
    const row4 = $(`<div class="location">${dispatch}</div>`);
    desc.append(row1);
    desc.append(row3);
    desc.append(row4);
    list.append(desc);
    page.shipRowsDrawn = (page.shipRowsDrawn ?? 0) + 1;
    vBind({
      el: `#shipReg${i}`,
      data: page.rowData(i),
      methods: {
        scrap(id) {
          const s = yard.ships[id];
          if (!s) return;
          yard.ships.splice(id, 1);
          drawShips();
          updateCosts();
        },
        copyMode() {
          return yard.copy === true;
        },
        crewText(id) {
          return shipCrewSize(yard.ships[id]);
        },
        fuelShort(id) {
          return yard.ships[id]?.fueled === false;
        },
        retShow(id) {
          return yard.ships[id]?.ret !== undefined;
        },
        pickDest(id) {
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
        // The yard's own answer to whether a ship is under way.
        show(id) {
          return yard.ships[id]?.movement !== undefined;
        },
      },
    });
  }

  /** `truepath.js:drawShips` - the whole ship list, one draw, into whatever `#shipList` resolves to. */
  function drawShips() {
    if (
      !settings.tabLoad &&
      (settings.civTabs !== 2 || settings.govTabs !== 5)
    ) {
      return;
    }
    page.drawShips = (page.drawShips ?? 0) + 1;
    clearShipDrag();
    clearElement($("#shipList"));
    // Upstream's own second gate: isolation without resettle empties the list and stops.
    if (root.tech.isolation && !root.tech.resettle) return;
    const list = $("#shipList");
    // The game's own re-sort and fleet re-clustering: same ship objects, new positions.
    if (
      page.reorderShips === true ||
      (typeof page.reorderShips === "number" &&
        page.drawShips >= page.reorderShips)
    ) {
      yard.ships = [...yard.ships].reverse();
    }
    const view = shipyardView();
    // A fleet that has since been stood down leaves its fold state behind.
    Object.keys(view.ffold).forEach((fid) => {
      if (!yard.ships.some((ship) => ship.flag && `${ship.fid}` === fid)) {
        delete view.ffold[fid];
      }
    });
    const entries = [];
    yard.ships.forEach((ship, index) => {
      const display = shipBound(ship);
      if (view.sys === "yards") {
        if (!page.repairYards.includes(display)) return;
      } else if (view.sys !== "all" && locSystem(display) !== view.sys) {
        return;
      }
      if (ship.fid && !ship.flag && view.ffold[ship.fid]) return;
      entries.push({ index, ship, display });
    });
    if (view.group) {
      const order = [];
      const byLocation = {};
      entries.forEach((entry) => {
        byLocation[entry.display] ??= [];
        byLocation[entry.display].push(entry);
        if (!order.includes(entry.display)) order.push(entry.display);
      });
      order.forEach((locationName, group) => {
        drawShipGroup(list, group, locationName);
        if (!view.fold[locationName]) {
          byLocation[locationName].forEach((entry) =>
            drawShipRow(list, entry.index, entry.ship),
          );
        }
      });
    } else {
      entries.forEach((entry) => drawShipRow(list, entry.index, entry.ship));
    }
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

  /** `ships.js:buildTPShip` - append the hull, then redraw the list the ordinary way. */
  function buildTPShip(ship) {
    yard.ships.push(ship);
    page.builtShips.push(ship);
    const rowsBefore = page.shipRowsDrawn ?? 0;
    drawShips();
    page.builds.push({
      rowsBound: (page.shipRowsDrawn ?? 0) - rowsBefore,
      drewList: page.shipListDrawn ?? 0,
    });
    updateCosts();
    yard.blueprint.name = "Nomad";
  }

  /**
   * `truepath.js:drawShipYard`'s own `#shipPlans` binding, transcribed member for member where it
   * matters: the yard's design methods, and nothing from any ship row.
   */
  const shipyardMethods = {
    yardName() {
      return "Dwarf";
    },
    parkText() {
      return "";
    },
    setYard() {},
    fleetDesignerAvailable() {
      return false;
    },
    fleetDesigner() {},
    sysLabel() {
      return systemLabel(shipyardView().sys);
    },
    setSys(sys) {
      shipyardView().sys = sys;
      drawShips();
    },
    setVal(type, part) {
      yard.blueprint[type] = part;
      updateCosts();
    },
    slotOpen() {
      return true;
    },
    avail: (_type, _index, part) => part !== "phaser",
    crewText() {
      return shipCrewSize(yard.blueprint);
    },
    powerText: () => page.powerText ?? "100kW",
    fireText() {
      return 0;
    },
    bombardVis() {
      return false;
    },
    bombardText() {
      return 0;
    },
    sensorText() {
      return "1au";
    },
    speedText() {
      return "0km/s";
    },
    fuelText() {
      return "N/A";
    },
    build() {
      page.buildCount = (page.buildCount ?? 0) + 1;
      buildTPShip({
        ...yard.blueprint,
        name: yard.blueprint.name || "Nomad",
        location: { id: "spc_dwarf" },
        damage: 0,
        fueled: true,
        manned: false,
      });
    },
    trigModal() {},
    // Upstream defines this as exactly `drawShips()`, which is the game-owned route to the ship
    // list the row capture runs.
    redraw() {
      drawShips();
    },
    lbl(label) {
      return label;
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
    plans.append(
      '<div class="assemble"><button class="button is-info" v-on:click="build()"></button></div>',
    );
    updateCosts();
    vBind({
      el: "#shipPlans",
      data: { b: yard.blueprint, s: yard, v: shipyardView() },
      methods: shipyardMethods,
    });
    panel.append($('<div id="shipList" class="sticky"></div>'));
    page.shipListDrawn = (page.shipListDrawn ?? 0) + 1;
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

  return {
    drawShipYard,
    drawShips,
    mainMethods,
    civicMethods,
    shipyardMethods,
    shipyardView,
  };
}

/**
 * One page with the game's own globals, the real Vue capture, and both captures on top. `withCivic`
 * stands for a player who has opened the Civic tab at some point, which is what binds `mTabCivic`.
 * `playerYard` stands for a player who is looking at the Dwarf Shipyard right now: the panel and its
 * own `#shipPlans`/`#shipList` rows are really in the document, drawn by the game's own draw.
 */
function makeHarness({
  root = makeRoot(),
  withCivic = false,
  playerPanel = true,
  playerYard = false,
  /** Ships already in the yard, so a draw during `establish` binds their rows. */
  ships = [],
  establish = false,
} = {}) {
  for (const ship of ships) root.space.shipyard.ships.push(ship);
  const page = makePage();
  page.builtShips = [];
  page.builds = [];
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
    getPageWindow: () => page,
    onEstablishError: (detail) => faults.push(detail),
  });
  const dispatch = createCapturedOuterFleetDispatch({
    controls: capture.controls,
    shipyard,
    synthesis: capture.synthesis,
    mountSuppression: capture.mountSuppression,
    getDocument: () => page.document,
    getPageWindow: () => page,
    onCaptureError: (detail) => faults.push(detail),
  });
  if (establish) shipyard.establish();
  if (playerYard) {
    // The player is on the Dwarf Shipyard: their tab settings say so and their own panel is really
    // in the document. The game's draw into it is left to the case, which owns the yard's contents.
    root.settings.civTabs = 2;
    root.settings.govTabs = 5;
    page.document
      .getElementById("mTabCivic")
      .append(element("div", { id: "dwarfShipYard" }));
  }
  return { page, root, game, capture, shipyard, dispatch, panels, faults };
}

function sentTo(page) {
  return page.trace.filter((record) => record.kind === "sendShipTo");
}

/** Makes the game's next `drawShips()` reorder the yard's list, and every one after it. */
function reorderNextDraw(page) {
  page.reorderShips = (page.drawShips ?? 0) + 1;
}

function rowControl(capture, index) {
  return capture.controls.resolve(
    `${CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX}${index}`,
  );
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
// Exactly the design methods this feature reaches, and every one of them present.
for (const method of ["avail", "setVal", "powerText", "build", "redraw"]) {
  assert.ok(
    yardControl.methods.includes(method),
    `shipPlans is missing ${method}`,
  );
}
// The topology assertion: `pickDest` and `show` are ship-row methods upstream, and `drawShips` is
// not a method at all - `redraw` is how the yard reaches it. A capture that treated the yard control
// as carrying them would be describing a control the game never binds.
for (const method of ["pickDest", "show", "drawShips"]) {
  assert.ok(
    !yardControl.methods.includes(method),
    `shipPlans must not carry ${method}`,
  );
}
assert.equal(yardControl.data.s, never.root.space.shipyard);
assert.equal(yardControl.data.v, never.game.shipyardView());
// The temporary panel and everything the draw put in it is gone.
assert.equal(never.page.document.getElementById("dwarfShipYard"), null);
assert.equal(never.page.document.getElementById("shipPlans"), null);
assert.equal(never.page.document.getElementById("shipList"), null);
assert.equal(rowControl(never.capture, 0), undefined);
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
// A build the player never sees, and the row the yard has to be asked for.
// ---------------------------------------------------------------------------

// The player is on Civilization, so upstream's `buildTPShip()` calls `drawShips()` and that draw
// returns at its own tab gate: the hull is appended and nothing binds a row for it.
const buildControl = never.capture.controls.resolve(
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
);
assert.equal(
  never.capture.controls.invoke(buildControl, "build").ok,
  true,
  "the yard's own build did not run",
);
assert.equal(never.root.space.shipyard.ships.length, 1);
assert.equal(never.page.shipRowsDrawn, undefined, "a row was drawn off-tab");
assert.deepEqual(never.page.builds, [{ rowsBound: 0, drewList: 1 }]);
assert.equal(rowControl(never.capture, 0), undefined);
assert.equal(
  never.capture.controls.resolve("shipReg0"),
  undefined,
  "the build bound a ship row while the player was elsewhere",
);

const viewBefore = never.game.shipyardView();
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
// The synthetic redraw bound a row, and it is that row - not `shipPlans` - that carries the trigger.
const capturedRow = rowControl(never.capture, 0);
assert.notEqual(capturedRow, undefined);
assert.ok(capturedRow.methods.includes("pickDest"));
assert.ok(capturedRow.methods.includes("show"));
assert.equal(
  never.page.Vue.toRaw(capturedRow.data),
  never.root.space.shipyard.ships[0],
);
assert.equal(never.faults.length, 0);
// The player's own saved view options are exactly as they were.
assert.deepEqual(never.game.shipyardView(), viewBefore);
// No window of any kind was produced, and nothing the player owns was touched.
assert.equal(never.page.document.querySelector(".modal.is-active"), null);
assert.equal(never.page.document.querySelector(".modal-background"), null);
assert.equal(never.page.document.getElementById("modalBox"), null);
assert.equal(never.page.document.getElementById("shipList"), null);
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
assert.equal(never.root.settings.civTabs, 1);
assert.equal(never.root.settings.govTabs, 0);

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

// ---------------------------------------------------------------------------
// The list reordering under the ship being dispatched.
// ---------------------------------------------------------------------------

// The capture's own redraw re-clusters the yard, so the ship is dispatched from where it ended up
// rather than from where the caller found it. The game is asked, and the game reads its own index.
const reordered = makeHarness({ establish: true });
reordered.root.space.shipyard.ships.push(makeShip({ name: "First" }));
reordered.root.space.shipyard.ships.push(makeShip({ name: "Second" }));
reorderNextDraw(reordered.page);
assert.deepEqual(
  reordered.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "launched" },
);
assert.deepEqual(sentTo(reordered.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
const reorderedShips = reordered.root.space.shipyard.ships;
assert.equal(
  reorderedShips[0].name,
  "Second",
  "the yard re-sorted its own list",
);
assert.equal(reorderedShips[0].movement.to, "spc_red");
assert.equal(reorderedShips[1].name, "First");
assert.equal(reorderedShips[1].movement, undefined);

// The player is on the shipyard itself, so `sendShipTo`'s own `drawShips()` runs against the yard
// they are looking at, and the real rows take the element id over from the captured ones. The
// postcondition has to be read from the row that holds the ship now, not from the one invoked.
const onTab = makeHarness({ establish: true, playerYard: true });
onTab.root.space.shipyard.ships.push(makeShip({ name: "First" }));
onTab.root.space.shipyard.ships.push(makeShip({ name: "Second" }));
// The player is looking at the yard, so the game has really drawn it.
onTab.game.drawShipYard();
const onTabRow = rowControl(onTab.capture, 1);
assert.notEqual(onTabRow, undefined, "the player's own yard bound no row");
assert.equal(
  onTab.page.Vue.toRaw(onTabRow.data),
  onTab.root.space.shipyard.ships[1],
);
// The second draw of the pass is the one `sendShipTo` triggers, and it re-clusters the list.
onTab.page.reorderShips = (onTab.page.drawShips ?? 0) + 2;
assert.deepEqual(
  onTab.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "launched" },
);
assert.deepEqual(sentTo(onTab.page), [
  { kind: "sendShipTo", id: 1, region: "spc_red", moved: true },
]);
assert.equal(onTab.root.space.shipyard.ships[1].name, "First");
assert.equal(onTab.root.space.shipyard.ships[1].movement, undefined);
assert.equal(onTab.root.space.shipyard.ships[0].name, "Second");
assert.equal(
  onTab.root.space.shipyard.ships[0].movement.to,
  "spc_red",
  "the dispatched ship moved from wherever the redraw left it",
);
// The player's yard is still theirs, and it is the game's own draw that refreshed it.
assert.notEqual(onTab.page.document.getElementById("shipList"), null);
assert.equal(
  onTab.page.document.getElementById("dwarfShipYard").children.length,
  2,
);
assert.equal(onTab.page.document.getElementById("modalBox"), null);
assert.equal(onTab.faults.length, 0);

// ---------------------------------------------------------------------------
// A saved yard view that would hide the ship.
// ---------------------------------------------------------------------------

// Filtered by system, grouped by location with that location folded, and a fleet folded away: all
// three hide rows upstream, and none of them may stop the capture from reaching this ship.
const filtered = makeHarness({ establish: true });
filtered.page.systems = { spc_dwarf: "spc_eris", spc_red: "spc_red" };
filtered.page.systems = { spc_dwarf: "spc_eris", spc_red: "spc_red" };
// Upstream writes these fields in place - `setSys` assigns `view.sys`, `fold()` and `fleetFold()`
// set and delete their own keys - so the fixture does the same rather than swapping the object.
Object.assign(filtered.game.shipyardView(), {
  sys: "spc_red",
  group: true,
  fold: { spc_eris: true },
  ffold: { 9: true },
});
filtered.root.space.shipyard.ships.push(
  makeShip({ name: "Flag", fid: 9, flag: true, location: { id: "spc_dwarf" } }),
);
filtered.root.space.shipyard.ships.push(
  makeShip({ name: "Escort", fid: 9, location: { id: "spc_dwarf" } }),
);
const savedView = structuredClone(filtered.root.space.shipyard.view);
assert.deepEqual(
  filtered.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "launched" },
);
assert.deepEqual(sentTo(filtered.page), [
  { kind: "sendShipTo", id: 1, region: "spc_red", moved: true },
]);
assert.deepEqual(
  filtered.root.space.shipyard.view,
  savedView,
  "the capture left the player's saved yard view changed",
);
assert.equal(filtered.faults.length, 0);

// ---------------------------------------------------------------------------
// A row left over from an earlier draw is never an answer.
// ---------------------------------------------------------------------------

// The same ship, the same index, and a redraw that bound nothing: the surviving control is the right
// ship at the right element id, and it is still the wrong answer, because it predates the capture.
const staleShip = makeShip({ name: "Nomad" });
const stale = makeHarness({ establish: true, ships: [staleShip] });
const staleGeneration = rowControl(stale.capture, 0).generation;
// Upstream's own isolation gate: the list is emptied and the draw stops, binding nothing at all.
stale.root.tech.isolation = 1;
stale.page.trace.length = 0;
assert.deepEqual(
  stale.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(stale.page), []);
assert.equal(staleShip.movement, undefined);
assert.equal(rowControl(stale.capture, 0).generation, staleGeneration);
assert.ok(
  stale.faults.some((detail) =>
    detail.includes("was not rebound by this capture"),
  ),
  stale.faults.join("; "),
);

// Another ship taking the index a stale control still holds: the data check refuses it too.
const takenOver = makeHarness({
  establish: true,
  ships: [makeShip({ name: "Retired" })],
});
takenOver.root.tech.isolation = 1;
takenOver.root.space.shipyard.ships.length = 0;
takenOver.root.space.shipyard.ships.push(makeShip({ name: "Nomad" }));
assert.deepEqual(
  takenOver.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.equal(
  takenOver.page.Vue.toRaw(rowControl(takenOver.capture, 0).data).name,
  "Retired",
);
assert.deepEqual(sentTo(takenOver.page), []);

// A draw that does bind the row, but to another ship: identity is the only thing that can tell.
const misbound = makeHarness({ establish: true });
misbound.page.rowData = (index) =>
  misbound.root.space.shipyard.ships[index + 1] ??
  misbound.root.space.shipyard.ships[0];
misbound.root.space.shipyard.ships.push(makeShip({ name: "First" }));
misbound.root.space.shipyard.ships.push(makeShip({ name: "Second" }));
assert.deepEqual(
  misbound.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(misbound.page), []);
assert.ok(
  misbound.faults.some((detail) => detail.includes("bound to another ship")),
  misbound.faults.join("; "),
);

// ---------------------------------------------------------------------------
// The game's own refusals.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Captures that refuse to start.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Build and dispatch in one pass, from a shipyard the save never rendered.
// ---------------------------------------------------------------------------

const integrated = makeHarness({ establish: true });
const effectiveSettings = Object.create(HARNESS_SETTINGS);
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
assert.equal(integrated.page.buildCount, 1);
assert.deepEqual(integrated.page.builds, [{ rowsBound: 0, drewList: 1 }]);
// Built and sent in the same pass, through the game's own closure, with nothing left on screen.
assert.deepEqual(sentTo(integrated.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.equal(integrated.root.space.shipyard.ships[0].movement.to, "spc_red");
assert.equal(integrated.page.document.getElementById("modalBox"), null);
assert.equal(integrated.page.document.querySelector(".modal.is-active"), null);
assert.equal(integrated.root.settings.civTabs, 1);
assert.equal(integrated.root.settings.govTabs, 0);
assert.equal(integrated.faults.length, 0);

// A window the player owns: the pass stands down before it builds, and a dispatch that runs anyway
// never touches it.
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
const ownedSettings = Object.create(HARNESS_SETTINGS);
const ownedControl = createCapturedOuterFleetControl({
  rootState: { readRoot: () => owned.root },
  controls: owned.capture.controls,
  dispatch: owned.dispatch,
  readSettings: () => ownedSettings,
});
const deferred = ownedControl.autoFleetOuter();
// The deferral is a status, not a failure, and it happens before anything is written: a pass that
// could not finish its own send must not have configured a blueprint it cannot act on.
assert.deepEqual(deferred.outcome, { status: "succeeded" });
assert.equal(deferred.shipTargetChanged, false);
assert.deepEqual(
  owned.root.space.shipyard.blueprint,
  makeRoot().space.shipyard.blueprint,
  "the deferred pass wrote to the yard's blueprint",
);
assert.equal(owned.root.space.shipyard.ships.length, 0);
assert.equal(
  owned.page.buildCount,
  undefined,
  "a build ran behind a player modal",
);
assert.deepEqual(sentTo(owned.page), []);
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
// The same ship, with the window gone, goes out through the game's own closure.
owned.page.document.querySelector(".modal-background").remove();
owned.page.document.querySelector(".modal.is-active").remove();
const resumed = ownedControl.autoFleetOuter();
assert.equal(resumed.outcome.status, "succeeded");
assert.deepEqual(sentTo(owned.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.equal(playerClose.clicked ?? 0, 0);

// ---------------------------------------------------------------------------
// The saves the game itself refuses.
// ---------------------------------------------------------------------------

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
// The same gate refuses a row capture: the yard's own ship list would not draw either.
const retainedRows = makeHarness({ establish: true });
retainedRows.root.settings.tabLoad = true;
retainedRows.root.space.shipyard.ships.push(makeShip());
assert.deepEqual(
  retainedRows.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(retainedRows.page), []);

console.log("Captured outer-fleet synthetic capture checks passed");
