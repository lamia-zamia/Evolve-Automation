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
 * with the yard's *design* methods — `avail`, `setVal`, `crewText`, `build`, `redraw` and the rest
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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX,
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
  createCapturedOuterFleetShipyard,
  hiddenHostElement,
  removeHiddenHostElement,
} from "../src/adapters/evolve/combat/captured-outer-fleet-shipyard.ts";
import { createCapturedOuterFleetDispatch } from "../src/adapters/evolve/combat/captured-outer-fleet-dispatch.ts";
import { createCapturedOuterFleetCosts } from "../src/adapters/evolve/combat/captured-outer-fleet-costs.ts";
import {
  createCapturedOuterFleetParts,
  parseShipyardPartCatalog,
} from "../src/adapters/evolve/combat/captured-outer-fleet-parts.ts";
import { createCapturedFleetDemand } from "../src/adapters/evolve/combat/captured-fleet-demand.ts";
import { OUTER_FLEET_REGIONS } from "../src/domain/combat/outer-fleet-regions.ts";
import { createCapturedSyndicateMechanics } from "../src/adapters/evolve/captured-syndicate-mechanics.ts";
import { createCapturedTabDiscovery } from "../src/adapters/evolve/captured-tab-discovery.ts";
import { probeScopedNumberToFixed } from "../src/adapters/evolve/scoped-number-to-fixed.ts";
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
 * `ships.js:shipParts` at the pinned tip, transcribed whole: the game's own part catalogue, in the
 * unlock order `drawShipYard()` walks, with `special` among the dimensions because upstream keeps it
 * in the same object. A case overrides it to stand in for a game that has changed it.
 */
const SHIP_PARTS = Object.freeze({
  class: Object.freeze([
    "corvette",
    "frigate",
    "destroyer",
    "cruiser",
    "battlecruiser",
    "dreadnought",
    "freighter",
    "explorer",
    "supply_ship",
  ]),
  power: Object.freeze([
    "solar",
    "diesel",
    "fission",
    "fusion",
    "elerium",
    "antimatter",
  ]),
  weapon: Object.freeze([
    "railgun",
    "laser",
    "p_laser",
    "plasma",
    "phaser",
    "disruptor",
    "gauss",
  ]),
  armor: Object.freeze(["steel", "alloy", "neutronium", "aerographene"]),
  engine: Object.freeze([
    "ion",
    "tie",
    "pulse",
    "photon",
    "vacuum",
    "emdrive",
    "electrokinetic",
  ]),
  sensor: Object.freeze(["visual", "radar", "lidar", "quantum"]),
  special: Object.freeze([
    "none",
    "massdriver",
    "extra_fuel",
    "extra_cargo",
    "extra_thruster",
    "mobile_storage",
    "fuel_tanker",
    "repair_ship",
  ]),
});

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
    // The page's own intrinsics, which the Syndicate probe patches for the length of one call.
    Number,
    Object,
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
    // The shipyard's own unlock ladder, which is what `shipPartAvailable` compares an option's index
    // against. A save that has reached the Dwarf Shipyard has at least these.
    tech: {
      syndicate: 1,
      tauceti: 0,
      eris: 2,
      outer: 0,
      syard_class: 6,
      syard_power: 4,
      syard_weapon: 5,
      syard_armor: 2,
      syard_engine: 5,
      syard_sensor: 3,
    },
    settings: {
      civTabs: 1,
      spaceTabs: 0,
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
   * `ships.js:shipParts` at the pinned tip, in unlock order, exactly as `drawShipYard()` iterates it.
   * A knob so a case can stand in for a game that has added a part — or moved one, which is what
   * changes the index a part owns and therefore the answer `shipPartAvailable` gives about it.
   */
  page.shipParts = page.shipParts ?? SHIP_PARTS;
  /** Parts the yard holds in its catalogue but will not offer, as `${type}:${value}`. */
  page.lockedParts = page.lockedParts ?? new Set();
  /** Every `avail()` call the control received, as `[type, index, value, liveClass]`. */
  page.availCalls = page.availCalls ?? [];
  /**
   * Overridable so a case can stand in for a draw that bound a row to the wrong ship. The default is
   * the game's own line: `data: global.space.shipyard.ships[i]`.
   */
  page.rowData = page.rowData ?? ((index) => yard.ships[index]);

  const shipPort = (ship) => ship.location?.id;
  const shipBound = (ship) => ship.location?.id ?? ship.movement?.to;
  const locSystem = (loc) => page.systems[loc] ?? loc;
  const shipCrewSize = () => page.shipCrew ?? 2;
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

  /**
   * `truepath.js:updateCosts`, transcribed to upstream's structural contract: price the live blueprint
   * with the yard's own `shipCosts`, resolve the paying pool, write it as `data-pool` on
   * `#shipYardCosts`, and append one `res-<resource>` span per cost carrying the exact amount as
   * `data-<resource>`, the class chosen by `poolHeld(resource, pool) >= cost`, and `data-ok` naming the
   * class that means "affordable".
   *
   * The figures are deliberately unlike a ship's real cost: a per-part character-code tag and a
   * per-tier multiplier, so every consumer that follows this row is provably following the row rather
   * than a formula it happens to agree with. Only the *shape* is upstream's.
   */
  function shipCosts(bp) {
    const costs = {};
    const resourceOf = {
      class: "Money",
      armor: "Steel",
      weapon: "Iron",
      engine: "Titanium",
      power: "Copper",
      sensor: "Iridium",
      special: "Quantium",
    };
    for (const [type, resourceId] of Object.entries(resourceOf)) {
      costs[resourceId] = String(bp[type] ?? "")
        .split("")
        .reduce((total, character) => total + character.charCodeAt(0), 0);
    }
    const sameTier = yard.ships.filter(
      (ship) => ship.class === bp.class && ship.special === bp.special,
    ).length;
    // An explorer hull multiplies what it carries, as upstream's does.
    return Object.fromEntries(
      Object.entries(costs).map(([resourceId, amount]) => [
        resourceId,
        bp.class === "explorer"
          ? amount * 10 * (sameTier + 1)
          : amount * (1 + sameTier),
      ]),
    );
  }

  /** `functions.js:actionPool(shipyardPayer())` — the supply zone the yard draws this cost from. */
  function shipyardPayer() {
    return { id: "tp-ship", supply: () => "tau_gas2" };
  }

  function actionPool(action) {
    if (page.globalSupply === true) return false;
    return action.supply();
  }

  /** `functions.js:poolHeld` — the regional figure for a partitioned resource, the total otherwise. */
  function poolHeld(resourceId, pool) {
    const resource = root.resource[resourceId];
    if (!resource) return 0;
    return pool === false || resource.regAmount === undefined
      ? resource.amount
      : (resource.regAmount[pool] ?? 0);
  }

  function updateCosts() {
    const costs = shipCosts(yard.blueprint);
    const row = $("#shipYardCosts");
    clearElement(row);
    const pool = actionPool(shipyardPayer());
    if (pool) {
      row.attr(`data-pool`, pool);
    } else {
      row.removeAttr(`data-pool`);
    }
    for (const [resourceId, amount] of Object.entries(costs)) {
      const color =
        poolHeld(resourceId, pool) >= amount
          ? `has-text-success`
          : `has-text-danger`;
      // A knob for a row the game drew without any prices in it, which is what a caller that cannot
      // read `#shipYardCosts` sees. The row is still the game's: this is a markup fault, not a
      // missing one.
      if (page.costsUnreadable === true) break;
      row.append(
        `<span class="res-${resourceId} ${color}" data-${resourceId}="${amount}" data-ok="has-text-success">${resourceId} ${amount}</span>`,
      );
    }
    page.costDraws = (page.costDraws ?? 0) + 1;
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
    // `Vue.capture`'s `recordApp` keeps only the callable entries of a `methods` object, so a binding
    // whose options omit one loses it from the control while the row itself still renders. That is
    // what `rowMethodsMissing` stands in for: a row the page really drew whose control cannot carry
    // the row's dispatch surface, which the proof has to refuse rather than assume.
    const omitted = new Set(page.rowMethodsMissing ?? []);
    const methods = {
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
    };
    for (const name of omitted) delete methods[name];
    vBind({
      el: `#shipReg${i}`,
      data: page.rowData(i),
      methods,
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
   * `ships.js:shipSpecialAllowed` / `shipDefaultSpecial`. Only the class rules matter here: which
   * fits a hull, and what a hull falls back to when a class change leaves its current special behind.
   */
  const supplyShipSpecials = ["mobile_storage", "fuel_tanker", "repair_ship"];
  const freighterSpecials = ["extra_fuel", "extra_cargo", "extra_thruster"];
  const massDriverHulls = ["cruiser", "battlecruiser", "dreadnought"];
  function shipSpecialAllowed(special, shipClass) {
    if (special === "mobile_storage" && page.globalSupply === true)
      return false;
    if (supplyShipSpecials.includes(special))
      return shipClass === "supply_ship";
    if (shipClass === "supply_ship") return false;
    if (special === "massdriver") return massDriverHulls.includes(shipClass);
    if (freighterSpecials.includes(special)) return shipClass === "freighter";
    return special === "none";
  }
  function shipDefaultSpecial(shipClass) {
    if (shipClass !== "supply_ship") return "none";
    return shipSpecialAllowed("mobile_storage", shipClass)
      ? "mobile_storage"
      : "fuel_tanker";
  }

  /**
   * `ships.js:shipPartAvailable(part, idx, value, shipClass)`, transcribed on upstream's structural
   * contract: which technology gates a part, and which branches read the option index as the whole
   * answer.
   *
   * One line is stricter than upstream, and deliberately so. Upstream only ever reaches this from the
   * markup it emitted itself, where the index and the value were bound together by the same
   * `forEach(function(v, idx))`, so it never has to check that they agree. A transcription that
   * skipped the check could not tell a correct index from one inferred from a stale list, because the
   * index alone is a level to compare against. Refusing a mismatched pair is what makes the option
   * index this test watches the yard's own.
   *
   * `avail()` is the yard's own method, and it receives the index as the option markup wrote it — a
   * quoted string upstream — so the comparison is made numerically here for the same reason every
   * comparison upstream is: the number is what both sides mean.
   */
  function shipPartAvailable(part, index, value, shipClass) {
    if (page.shipParts[part]?.[index] !== value) return false;
    if (page.lockedParts.has(`${part}:${value}`)) return false;
    if (part === "class") {
      if (value === "freighter") return (root.tech.shadow ?? 0) >= 5;
      if (value === "supply_ship") return root.tech.syard_supply === true;
      if (root.tech.tauceti) return value === "explorer";
      return (root.tech.syard_class ?? 0) > index;
    }
    if (part === "special") {
      if (shipClass === "supply_ship") {
        return supplyShipSpecials.includes(value);
      }
      if (shipClass === "freighter") return freighterSpecials.includes(value);
      if (!shipSpecialAllowed(value, shipClass)) return false;
      return root.tech.syard_special === true;
    }
    return (root.tech[`syard_${part}`] ?? 0) > index;
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
    /**
     * `truepath.js:drawShipYard`'s `setVal`, transcribed whole: a class change rewrites the fields
     * that hull forces, the special is dropped when it no longer fits, the part is written, and the
     * cost row is redrawn by the game's own `updateCosts`.
     *
     * This is what makes an off-tab price probe faithful — and what makes a probe that wrote the
     * blueprint directly wrong, since the rewrites below are the design.
     */
    setVal(b, v) {
      // Knobs for a draw that could not take the part: a rejected write and a throwing one.
      if (page.setValRefuses === b) {
        page.refusedWrites = (page.refusedWrites ?? 0) + 1;
        return;
      }
      if (page.setValThrows === b) throw new Error(`the yard refused the ${b}`);
      const bp = yard.blueprint;
      if (b === "class" && v === "freighter") {
        bp.weapon = "none";
        bp.special = "extra_fuel";
      } else if (b === "class" && v === "explorer") {
        bp.engine = "emdrive";
        bp.weapon = "railgun";
        if ((root.tech.syard_armor ?? 0) >= 3) bp.armor = "neutronium";
        if ((root.tech.syard_sensor ?? 0) >= 4) bp.sensor = "quantum";
        if ((root.tech.syard_power ?? 0) >= 4) bp.power = "elerium";
        // A knob standing in for a game whose Explorer hull forces something other than the four
        // fields above — a different default, or a dimension this tip has never heard of. The
        // automation is expected to follow whatever this answers with, including a field it has no
        // name for.
        Object.assign(bp, page.explorerDefaults);
      } else if (
        b === "class" &&
        v !== "freighter" &&
        bp.class === "freighter"
      ) {
        bp.weapon = "railgun";
      } else if (b === "class" && v !== "explorer" && bp.class === "explorer") {
        bp.engine = "ion";
      }
      if (b === "class" && !shipSpecialAllowed(bp.special, v)) {
        bp.special = shipDefaultSpecial(v);
      }
      if (b === "class" && v === "supply_ship") {
        bp.weapon = "none";
      } else if (
        b === "class" &&
        bp.class === "supply_ship" &&
        bp.weapon === "none"
      ) {
        bp.weapon = "railgun";
      }
      bp[b] = v;
      if (page.reorderBlueprint) {
        const armor = bp.armor;
        delete bp.armor;
        bp.armor = armor;
        bp.scratchOnly = "discard";
      }
      page.setValWrites.push([b, v]);
      updateCosts();
    },
    slotOpen() {
      return true;
    },
    avail(type, index, value) {
      page.availCalls.push([type, Number(index), value, yard.blueprint.class]);
      return shipPartAvailable(
        type,
        Number(index),
        value,
        yard.blueprint.class,
      );
    },
    crewText() {
      page.crewSamples ??= [];
      page.crewSamples.push({
        blueprint: { ...yard.blueprint },
        writes: page.setValWrites.length,
        draws: page.costDraws,
      });
      if (page.crewThrows) throw new Error("native crew unavailable");
      return Object.hasOwn(page, "designCrew")
        ? page.designCrew
        : shipCrewSize(yard.blueprint);
    },
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
      // A design the yard cannot pay queues the order instead of building, which is the whole point
      // of the cost row's marking and why readiness has to ask the yard rather than assume.
      const pool = actionPool(shipyardPayer());
      const affordable = Object.entries(shipCosts(yard.blueprint)).every(
        ([resourceId, amount]) => poolHeld(resourceId, pool) >= amount,
      );
      page.buildCount = (page.buildCount ?? 0) + 1;
      // The native power gate is a fixture verdict, never a locally reproduced formula.
      if (page.nativeBuildRefuses) return;
      if (!affordable) {
        page.queuedBuilds = (page.queuedBuilds ?? 0) + 1;
        return;
      }
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
    page.yardDraws = (page.yardDraws ?? 0) + 1;
    clearShipDrag();
    clearElement($("#dwarfShipYard"));
    if (!Object.hasOwn(root.space, "shipyard") || !settings.showShipYard) {
      return;
    }
    const panel = $("#dwarfShipYard");
    const plans = $('<div id="shipPlans"></div>');
    panel.append(plans);
    plans.append($('<div id="shipYardCosts" class="costList"></div>'));
    /**
     * `truepath.js:drawShipYard`'s own option markup, one `b-dropdown-item` per `shipParts` entry,
     * in that list's order, carrying the entry's position as its option index. Every entry is
     * emitted, locked ones included: `v-show` is what hides an option the yard will not offer, and the
     * markup is the yard's only statement of what the position of each part is.
     */
    const options = $('<div class="shipBayOptions"></div>');
    plans.append(options);
    Object.keys(page.shipParts).forEach((type) => {
      let values = "";
      page.shipParts[type].forEach((value, index) => {
        values += `<b-dropdown-item aria-role="listitem" @click="setVal('${type}','${value}')" class="${type} a${index}" data-val="${value}" v-show="avail('${type}','${index}','${value}')">{{ lbl('${value}', '${type}') }}</b-dropdown-item>`;
      });
      const slot = type === "special" || type === "weapon" ? " open" : "";
      options.append(
        `<b-dropdown aria-role="list"${slot}><template #trigger><button class="button is-info"><span>${type}</span></button></template>${values}</b-dropdown>`,
      );
    });
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

  // Synthetic native metadata and render state, deliberately independent of game gates and region topology.
  /**
   * The two numbers `syndicate(r, true)` builds, as the harness stands in for them.
   *
   * `p` is the game's own `1 - +(piracy / divisor).toFixed(4)` over the ratio the fixture's `p`
   * implies, and `s` is the sensor the display renders. Only the *rounding* is reproduced: the
   * arithmetic behind both is the real game's own, exercised against the real page, and
   * transcribing it here would be the very copy production has just deleted.
   *
   * `undefined` is the game's own "no piracy" answer: `scan` returns its localised string without
   * rounding anything at all, so a caller learns nothing and has to treat the region as unreadable.
   */
  function syndicateSample(r) {
    const sample = page.syndicateSamples?.[r];
    if (sample === undefined || sample === "unavailable") return undefined;
    return { p: 1 - +(1 - sample.p).toFixed(4), s: sample.s };
  }
  function drawSpaceRegion(zone, region) {
    const parent = $(zone === "inner" ? "#space" : "#outerSol");
    parent.append(
      $(
        `<div id="${region}" class="space"><div id="sr${region}"><h3 class="name"></h3></div></div>`,
      ),
    );
    if (page.syndicateRendered) {
      $(`#${region}`).append(
        $(`<div id="${region}synd" v-show="${region}"></div>`),
      );
      vBind({
        el: `#${region}synd`,
        data: root.space.syndicate,
        methods: {
          /** The game's own rendering: `syndicate(r,true)` and then the percentage above it. */
          scan(r) {
            if (!(
              root.space.shipyard && Array.isArray(root.space.shipyard.ships)
            )) {
              return "no piracy";
            }
            const sample = syndicateSample(r);
            if (sample === undefined) return "no piracy";
            page.syndicateScans = (page.syndicateScans ?? 0) + 1;
            return `${+((sample.s + 25) / 1.25).toFixed(1)}%`;
          },
        },
      });
    }
  }
  function drawSpace(subTab) {
    const zones = subTab === 5 ? ["outer"] : subTab === 1 ? ["inner"] : [];
    for (const zone of zones) {
      const container = zone === "inner" ? "#space" : "#outerSol";
      if ($(container).length === 0) continue;
      clearElement($(container));
      for (const [region, state] of Object.entries(page.spaceRegionStates)) {
        if (state.zone === zone) drawSpaceRegion(zone, region);
      }
    }
  }

  const spaceMethods = {
    swapTab(subTab) {
      if (!settings.tabLoad) {
        clearTabPanels(
          { "#space": [], "#outerSol": [] },
          subTab === 1 ? "#space" : subTab === 5 ? "#outerSol" : null,
        );
      }
      page.spaceDraws = (page.spaceDraws ?? 0) + 1;
      drawSpace(subTab);
      return subTab;
    },
  };

  function loadCivilizationTab() {
    const civil = $("#mTabCivil");
    for (const id of ["space", "outerSol"]) {
      if ($(`#${id}`).length === 0)
        civil.append($(`<div id="${id}" class="spacePanel"></div>`));
    }
    vBind({ el: "#mTabCivil", data: { s: settings }, methods: spaceMethods });
    if (!settings.tabLoad) return;
    drawSpace(settings.spaceTabs);
  }

  function loadCivicTab() {
    $("#mTabCivic").append($('<b-tabs class="resTabs"></b-tabs>'));
    vBind({ el: "#mTabCivic", data: { s: settings }, methods: civicMethods });
    // `loadTab('mTabCivic')` calls the yard itself, outside the sub-tab branch, so this runs under
    // `tabLoad` too - which is exactly why preload mode ends up with a real yard.
    if (
      root.race.truepath &&
      root.race.species !== "protoplasm" &&
      !root.race.start_cataclysm
    ) {
      drawShipYard();
    }
  }

  /**
   * `index.js:initTabs` - preload mode loads every main tab up front and only the loaded one
   * otherwise. The Civic tab is the only one transcribed here, because it is the only one that draws
   * the yard; the branch is the game's, not the harness's.
   */
  function initTabs() {
    if (settings.tabLoad) {
      loadCivicTab();
      loadCivilizationTab();
      return;
    }
    if (settings.civTabs === 2) loadCivicTab();
    if (settings.civTabs === 1) loadCivilizationTab();
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
        case 1:
          loadCivilizationTab();
          break;
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
    drawSpace,
    loadCivilizationTab,
    initTabs,
    mainMethods,
    civicMethods,
    spaceMethods,
    shipyardMethods,
    shipyardView,
    shipCosts,
    shipyardPayer,
  };
}

/**
 * One page with the game's own globals, the real Vue capture, and both captures on top. `withCivic`
 * stands for a player who has opened the Civic tab at some point, which is what binds `mTabCivic`.
 * `playerYard` stands for a player who is looking at the Dwarf Shipyard right now, and `preload` for
 * one whose settings retain every tab: both leave a real `#dwarfShipYard` in the document with the
 * game's own `#shipPlans`, `#shipList` and `#shipReg*` bindings. In both cases the draw that fills it
 * is left to the case, which owns the yard's contents.
 */
function makeHarness({
  root = makeRoot(),
  withCivic = false,
  playerPanel = true,
  playerYard = false,
  preload = false,
  /** A different `ships.js:shipParts`, for a case standing in for a game that changed it. */
  shipParts = undefined,
  /** Parts the yard catalogues but will not offer, as `${type}:${value}`. */
  lockedParts = undefined,
  /** Ships already in the yard, so a draw during `establish` binds their rows. */
  ships = [],
  establish = false,
  /** Systems the game's own destination closure will accept, when a case needs a narrower set. */
  destinations = undefined,
  /** A focused restoration fault, after the real workspace has released its panels. */
  workspaceIntact = () => true,
  /**
   * The running game's own Syndicate answer per region, as `{ p, s }`. Distinctive on purpose: no
   * arithmetic over this save's piracy, caps, rival or ships reproduces them, so a pass that reaches
   * a target is provably following the game's answer rather than a table that happens to agree.
   */
  syndicateRendered = true,
  syndicateSamples = {
    spc_home: { p: 0.7319, s: 47 },
    spc_moon: { p: 0.6417, s: 31 },
    spc_red: { p: 0.7319, s: 47 },
    spc_belt: { p: 0.8123, s: 12 },
    spc_gas: { p: 0.5284, s: 63 },
    spc_gas_moon: { p: 0.4431, s: 88 },
    spc_titan: { p: 0.2976, s: 105 },
    spc_enceladus: { p: 0.3382, s: 120 },
    spc_triton: { p: 0.2145, s: 140 },
    spc_makemake: { p: 0.1763, s: 155 },
    spc_eris: { p: 0.0947, s: 12 },
  },
} = {}) {
  for (const ship of ships) root.space.shipyard.ships.push(ship);
  const page = makePage();
  if (destinations !== undefined) page.destinations = destinations;
  page.syndicateSamples = syndicateSamples;
  page.syndicateRendered = syndicateRendered;
  page.spaceRegionStates = Object.fromEntries(
    OUTER_FLEET_REGIONS.map((region, index) => [
      region,
      {
        zone: index % 2 === 0 ? "inner" : "outer",
        reachable: true,
        syndicateEnabled: true,
      },
    ]),
  );
  page.syndicateSensor = Object.fromEntries(
    Object.entries(syndicateSamples).map(([region, sample]) => [
      region,
      sample === "unavailable" ? 0 : sample.s,
    ]),
  );
  page.builtShips = [];
  page.builds = [];
  page.setValWrites = [];
  page.globalSupply = false;
  page.explorerDefaults = page.explorerDefaults ?? {};
  if (shipParts !== undefined) page.shipParts = shipParts;
  if (lockedParts !== undefined) page.lockedParts = lockedParts;
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

  const realPanels = createGamePanelWorkspace({
    getDocument: () => page.document,
  });
  const panels = {
    open(request) {
      const workspace = realPanels.open(request);
      if (workspace === undefined) return undefined;
      return {
        release() {
          page.releasedControls = capture.controls
            .capturedElementIds()
            .map((id) => capture.controls.resolve(id))
            .filter(Boolean);
          workspace.release();
          page.workspaceReleases = (page.workspaceReleases ?? 0) + 1;
        },
        isIntact: () =>
          workspace.isIntact() &&
          workspaceIntact() &&
          page.workspaceBroken !== true,
      };
    },
  };
  // The yard's own part catalogue, over the markup that yard's draws produce. Wired before the yard
  // exists and called only through it, which is the only route either of them has to the other.
  const partCapture = createCapturedOuterFleetParts({
    getDocument: () => page.document,
    yard: {
      control: () => shipyard.control(),
      established: (control) => shipyard.established(control),
      establish: () => shipyard.establish(),
    },
    onCaptureError: (detail) => faults.push(detail),
  });
  const parts = {
    catalog: () => partCapture.catalog(),
    stageFrom(plans) {
      const candidate = partCapture.stageFrom(plans);
      if (candidate === undefined) return undefined;
      page.catalogStages = (page.catalogStages ?? 0) + 1;
      return {
        commit() {
          page.catalogCommits = (page.catalogCommits ?? 0) + 1;
          candidate.commit();
        },
      };
    },
  };
  const shipyard = createCapturedOuterFleetShipyard({
    rootState: { readRoot: () => root },
    controls: capture.controls,
    synthesis: capture.synthesis,
    mountSuppression: capture.mountSuppression,
    panels,
    getDocument: () => page.document,
    getPageWindow: () => page,
    parts,
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
  const costs = createCapturedOuterFleetCosts({
    rootState: { readRoot: () => root },
    controls: capture.controls,
    panels,
    mountSuppression: capture.mountSuppression,
    getDocument: () => page.document,
    onCaptureError: (detail) => faults.push(detail),
  });
  if (establish) shipyard.establish();
  const rootState = { readRoot: () => root };
  const discovery = createCapturedTabDiscovery({
    rootState,
    controls: capture.controls,
    mountSuppression: capture.mountSuppression,
    panels,
  });
  const syndicate = createCapturedSyndicateMechanics({
    document: page.document,
    regions: {
      read: (region) =>
        page.spaceRegionStates[region] === undefined
          ? { kind: "invalid" }
          : { kind: "value", value: page.spaceRegionStates[region] },
    },
    controls: capture.controls,
    discovery,
    mechanics: {
      readRoundedValues: (read) => {
        const seen = probeScopedNumberToFixed(page, () => {
          read();
        });
        return seen === undefined
          ? { kind: "invalid" }
          : { kind: "value", value: seen };
      },
    },
  });
  if (playerYard || preload) {
    // `#dwarfShipYard` is a `b-tab-item` the Civic tab's own render creates, so it is stood here in
    // the one panel the game's Civic markup lives in, exactly where upstream's `b-tabs` would put it.
    if (playerYard) {
      // The player is on the Dwarf Shipyard, so their own saved sub-tab says so.
      root.settings.civTabs = 2;
      root.settings.govTabs = 5;
    } else {
      root.settings.tabLoad = true;
    }
    page.document
      .getElementById("mTabCivic")
      .append(element("div", { id: "dwarfShipYard" }));
  }
  return {
    page,
    root,
    game,
    capture,
    shipyard,
    parts,
    dispatch,
    costs,
    panels,
    discovery,
    syndicate,
    faults,
  };
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

/**
 * Every production source file, as text. A list of what the yard offers belongs to the game's own
 * markup, so this is how a second copy of it is kept from being written: a test that only checks
 * behaviour cannot see one that happens to agree with the save it was run against.
 */
function productionSources() {
  const root = fileURLToPath(new URL("../src", import.meta.url));
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|js)$/.test(entry.name))
    .map((entry) => {
      const path = join(entry.parentPath ?? root, entry.name);
      return { path, text: readFileSync(path, "utf8") };
    });
}

// Ship power is private native build mechanics. Neither presentation reads nor a replacement
// formula/table may become an automation authority, including in compatibility JavaScript.
for (const source of productionSources()) {
  assert.doesNotMatch(
    source.text,
    /\b(?:hasShipPower|powerText|shipPower)\b/,
    source.path,
  );
  assert.doesNotMatch(
    source.text,
    /\b(?:solar|diesel|fission|fusion|antimatter|elerium)\s*:\s*\d/,
    `a local reactor-output table appeared in ${source.path}`,
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
for (const method of ["avail", "setVal", "crewText", "build", "redraw"]) {
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
  never.page.binds.map((bind) => bind.el),
  ["#mTabCivic", "#shipPlans"],
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

// The player is on the shipyard itself, so the game has already drawn its rows and
// `buildTPShip()`'s own `drawShips()` keeps them current. The capture therefore uses the row the
// page really rendered rather than drawing a second, hidden list, and only `sendShipTo`'s own redraw
// reorders and rebinds the yard while the dispatch runs.
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
// The next draw of the pass is the one `sendShipTo` triggers, and it re-clusters the list.
const onTabDraws = onTab.page.drawShips;
onTab.page.reorderShips = onTabDraws + 1;
assert.deepEqual(
  onTab.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "launched" },
);
assert.deepEqual(sentTo(onTab.page), [
  { kind: "sendShipTo", id: 1, region: "spc_red", moved: true },
]);
assert.equal(
  onTab.page.drawShips,
  onTabDraws + 1,
  "the dispatch drew the ship list again instead of using the rendered row",
);
assert.equal(rowControl(onTab.capture, 1).generation, onTabRow.generation + 1);
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

/**
 * The outer-fleet composition over one harness, with the yard's own part catalogue among its
 * dependencies: the yard's cost row prices a candidate, the yard's option markup says what the yard
 * offers, and the dispatch closure sends what was built.
 */
function dispatchHarnessRegions() {
  return {
    read() {
      return {
        kind: "value",
        value: { zone: "inner", reachable: true, syndicateEnabled: true },
      };
    },
  };
}

function outerFleetControl(harness, readSettings) {
  return createCapturedOuterFleetControl({
    rootState: { readRoot: () => harness.root },
    controls: harness.capture.controls,
    costs: harness.costs,
    parts: harness.parts,
    dispatch: harness.dispatch,
    syndicate: harness.syndicate,
    regionMechanics: dispatchHarnessRegions(),
    readSettings,
  });
}

const integrated = makeHarness({ establish: true });
const effectiveSettings = Object.create(HARNESS_SETTINGS);
const outerControl = outerFleetControl(integrated, () => effectiveSettings);
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

// ---------------------------------------------------------------------------
// The yard's own price, off-tab: the cost authority against this transcription.
// ---------------------------------------------------------------------------

const pristineBlueprint = makeRoot().space.shipyard.blueprint;
/** Everything the pass itself bound, so a probe can be shown to bind nothing further. */
const bindsAfterPass = integrated.page.binds.map((bind) => bind.el);
const appsAfterPass = [...realApps];

/**
 * What the yard's own `shipCosts()` says, as a cost sample. This is the answer the automation has to
 * reproduce, and it is deliberately unlike any ship cost formula — so a consumer that agreed with it
 * by coincidence would have agreed with the wrong figure.
 */
function gameSample(harness, blueprint) {
  const costs = harness.game.shipCosts(blueprint);
  return {
    pool: harness.game.shipyardPayer().supply(),
    amounts: Object.keys(costs)
      .sort()
      .map((resourceId) => ({
        resourceId,
        amount: costs[resourceId],
        affordable: true,
      })),
  };
}

// The fighter the pass priced is the yard's own design, so the price is the yard's own answer to it.
const fighterDesign = {
  class: "corvette",
  power: "diesel",
  weapon: "railgun",
  armor: "steel",
  engine: "ion",
  sensor: "radar",
};
assert.deepEqual(
  integrated.costs.quote(fighterDesign)?.costs,
  gameSample(integrated, { ...pristineBlueprint, ...fighterDesign }),
  "an off-tab candidate was not priced by the game",
);
assert.deepEqual(
  integrated.costs.current(),
  gameSample(integrated, pristineBlueprint),
);
assert.deepEqual(
  integrated.root.space.shipyard.blueprint,
  pristineBlueprint,
  "a price probe left the player's blueprint changed",
);

// The probe is the game's own class transitions, in the shared order, and it left nothing standing.
// The candidate names only the hull and a mount the hull does not keep, so every other field of the
// priced design was decided by the game's `setVal`, not by this script.
const beforeExplor = integrated.root.space.shipyard.blueprint;
const drawBeforeExplor = integrated.page.costDraws;
const explorer = integrated.costs.quote({
  class: "explorer",
  weapon: "laser",
})?.costs;
assert.deepEqual(
  integrated.page.setValWrites.slice(-2).map(([type, part]) => [type, part]),
  [
    ["class", "explorer"],
    ["weapon", "laser"],
  ],
  "the probe did not apply the design in the build's own order",
);
// An explorer hull takes the emdrive, and the railgun the hull forces goes back to the laser the
// candidate asked for — because the mount is written *after* the hull, which is the order a real
// build uses and the only order that can be priced for the ship that would actually be built. The
// reactor is the hull's own rewrite too, and this save has reached the shipyard power technology
// that grants it.
assert.deepEqual(
  explorer,
  gameSample(integrated, {
    ...beforeExplor,
    class: "explorer",
    weapon: "laser",
    engine: "emdrive",
    power: "elerium",
  }),
);
assert.deepEqual(integrated.root.space.shipyard.blueprint, beforeExplor);
assert.equal(
  integrated.page.costDraws - drawBeforeExplor,
  2,
  "every setVal must run its own updateCosts",
);

// A freighter has no mount at all and takes `extra_fuel` with it, so the design the price belongs to
// is one the candidate never named.
const beforeFreighter = integrated.root.space.shipyard.blueprint;
const freighter = integrated.costs.quote({ class: "freighter" })?.costs;
assert.deepEqual(
  freighter,
  gameSample(integrated, {
    ...beforeFreighter,
    class: "freighter",
    weapon: "none",
    special: "extra_fuel",
  }),
);
assert.deepEqual(integrated.root.space.shipyard.blueprint, beforeFreighter);

// Off-tab, the probe borrows the document and gives all of it back: no scratch element, no panel left
// aliased, no new Vue app, no timer installed, nothing of the player's touched.
assert.equal(integrated.page.document.getElementById("shipYardCosts"), null);
assert.equal(integrated.page.document.getElementById("shipPlans"), null);
assert.equal(integrated.page.document.getElementById("dwarfShipYard"), null);
assert.deepEqual(
  integrated.page.document
    .querySelectorAll("[id]")
    .filter((node) => node.id.startsWith("ea-aside-"))
    .map((node) => node.id),
  [],
  "the workspace left an aliased name behind",
);
assert.deepEqual(
  integrated.page.binds.map((bind) => bind.el),
  bindsAfterPass,
  "a price probe bound a component",
);
assert.deepEqual(realApps, appsAfterPass, "a price probe mounted a Vue app");
assert.equal(
  integrated.page.document.getElementById("mTabCivil").querySelectorAll("#city")
    .length,
  1,
  "the player's own panel is still there",
);
assert.equal(integrated.page.setInterval, integrated.page.realSetInterval);
assert.equal(integrated.page.clearInterval, integrated.page.realClearInterval);
assert.equal(TestElement.prototype.addEventListener, realAddEventListener);
assert.equal(integrated.page.document.querySelector(".modal.is-active"), null);
assert.equal(integrated.root.settings.animated, false);
assert.deepEqual(integrated.root.settings, {
  ...makeRoot().settings,
  showShipYard: true,
});

// A quote crews and prices the normalized candidate in one protected application.
{
  const quoted = makeHarness({ preload: true });
  quoted.game.initTabs();
  const live = quoted.root.space.shipyard.blueprint;
  const original = Object.entries(live);
  const row = quoted.page.document.getElementById("shipYardCosts");
  const markup = row.innerHTML;
  quoted.page.designCrew = 37;
  quoted.root.race.grenadier = 1;
  quoted.root.race.high_pop = 9;
  quoted.page.reorderBlueprint = true;
  const writes = quoted.page.setValWrites.length;
  const draws = quoted.page.costDraws;
  const releases = quoted.page.workspaceReleases ?? 0;
  const answer = quoted.costs.quote({ class: "explorer", weapon: "laser" });
  const normalized = {
    ...Object.fromEntries(original),
    class: "explorer",
    weapon: "laser",
    engine: "emdrive",
    power: "elerium",
    scratchOnly: "discard",
  };
  assert.equal(
    answer.crew,
    37,
    "native crew must override any hull/race inference",
  );
  assert.deepEqual(answer.costs, gameSample(quoted, normalized));
  assert.deepEqual(quoted.page.crewSamples, [
    { blueprint: normalized, writes: writes + 2, draws: draws + 2 },
  ]);
  assert.equal(
    quoted.page.setValWrites.length,
    writes + 2,
    "candidate was applied twice",
  );
  assert.equal(
    quoted.page.workspaceReleases,
    releases + 1,
    "candidate used more than one workspace",
  );
  assert.deepEqual(
    Object.entries(live),
    original,
    "blueprint values and key order must be restored",
  );
  assert.equal(row.innerHTML, markup, "player's cost row was changed");
  assert.equal(quoted.page.document.getElementById("shipYardCosts"), row);
  assert.deepEqual(quoted.page.builtShips, []);
  assert.deepEqual(sentTo(quoted.page), []);
}

// Unreadable crew never falls back to a local answer or causes permanent effects.
for (const crew of [
  undefined,
  null,
  "37",
  "bad",
  NaN,
  Infinity,
  -Infinity,
  0,
  -3,
  {},
  "throws",
]) {
  const unavailable = makeHarness({ establish: true });
  const live = unavailable.root.space.shipyard.blueprint;
  const original = Object.entries(live);
  unavailable.page.designCrew = crew;
  unavailable.page.crewThrows = crew === "throws";
  unavailable.page.reorderBlueprint = true;
  unavailable.root.space.shipyard.blueprint.weapon = "laser";
  original.find(([key]) => key === "weapon")[1] = "laser";
  const writes = unavailable.page.setValWrites.length;
  const result = outerFleetControl(
    unavailable,
    () => HARNESS_SETTINGS,
  ).autoFleetOuter();
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(result.shipTargetChanged, false);
  assert.equal(unavailable.page.crewSamples.length, 1);
  assert.equal(
    unavailable.page.setValWrites.length - writes,
    6,
    "failed candidate was applied again",
  );
  assert.deepEqual(Object.entries(live), original);
  assert.deepEqual(unavailable.page.builtShips, []);
  assert.deepEqual(sentTo(unavailable.page), []);
  assert.equal(unavailable.page.document.getElementById("shipYardCosts"), null);
  assert.equal(
    unavailable.page.document
      .querySelectorAll("[id]")
      .some((node) => node.id.startsWith("ea-aside-")),
    false,
  );
}

// A binding without callable crewText is incomplete authority even if every other method exists.
for (const absentCrew of [undefined, 37]) {
  const incomplete = makeHarness();
  incomplete.game.shipyardMethods.crewText = absentCrew;
  assert.equal(incomplete.shipyard.establish(), undefined);
  assert.equal(incomplete.shipyard.control(), undefined);
  assert.equal(incomplete.costs.quote(fighterDesign), undefined);
  assert.deepEqual(incomplete.page.setValWrites, []);
  assert.deepEqual(incomplete.page.builtShips, []);
  assert.deepEqual(sentTo(incomplete.page), []);
}

// A `setVal` the game throws out — or takes without applying — is its own refusal, not a capture
// fault: the probe is refused rather than pricing a design the yard never held, the blueprint is
// still the player's, and no scratch element survives it.
for (const [knob, candidate] of [
  ["setValThrows", { class: "frigate", weapon: "laser" }],
  ["setValRefuses", { class: "frigate", weapon: "laser" }],
]) {
  const stubborn = makeHarness({ establish: true });
  const before = { ...stubborn.root.space.shipyard.blueprint };
  stubborn.page[knob] = "weapon";
  assert.equal(
    stubborn.costs.quote(candidate)?.costs,
    undefined,
    `a ${knob} did not fail the probe closed`,
  );
  assert.deepEqual(stubborn.root.space.shipyard.blueprint, before);
  assert.deepEqual(
    Object.keys(stubborn.root.space.shipyard.blueprint),
    Object.keys(before),
  );
  assert.equal(stubborn.page.document.getElementById("shipYardCosts"), null);
  assert.equal(stubborn.page.document.getElementById("shipPlans"), null);
  assert.deepEqual(stubborn.faults, []);
}

// Refusing a write whose value the yard already holds is not a refusal at all: the design asked for
// is the design the yard is holding, and the price still comes from the game.
{
  const idle = makeHarness({ establish: true });
  idle.page.setValRefuses = "weapon";
  assert.deepEqual(
    idle.costs.quote(fighterDesign)?.costs,
    gameSample(idle, pristineBlueprint),
  );
  assert.deepEqual(idle.root.space.shipyard.blueprint, pristineBlueprint);
  assert.equal(idle.page.refusedWrites, 1);
}

// ---------------------------------------------------------------------------
// The Explorer design is whatever the running game's own class change makes of it.
// ---------------------------------------------------------------------------

/**
 * A save that has reached Tau Ceti, at the component technology the Explorer hull's forced parts
 * need.
 *
 * `ships.js:shipPartAvailable` answers a hull question off `tech.tauceti` and every other hull off
 * the class ladder, so a Tau save is one where the Explorer is the only hull the yard offers. The
 * component levels are what that hull's own rewrites have to be offered at, because the option index
 * `avail()` is called with *is* the unlock level: `emdrive` is the sixth engine, `neutronium` the
 * third armour, `quantum` the fourth sensor and `elerium` the fifth reactor.
 */
function makeTauRoot(tech = {}) {
  const root = makeRoot();
  Object.assign(
    root.tech,
    {
      tauceti: 1,
      syard_special: true,
      syard_power: 5,
      syard_armor: 3,
      syard_sensor: 4,
      syard_engine: 6,
    },
    tech,
  );
  return root;
}

/**
 * The design such a save is wearing, chosen so the class change has real work to do: four components
 * no Explorer carries, and a `special` that cannot follow the hull, so the class default replaces it.
 *
 * A mass-driver cruiser rather than a freighter or a supply ship on purpose. `avail('special', …)`
 * is upstream `shipPartAvailable(…, shipClass)` with the *live* class, so a yard wearing a hull whose
 * special slot is its own cannot be asked about `none` — which is exactly the case the next section
 * characterizes, and not one the usable-design cases should rest on.
 */
function massdriverDesign(root) {
  Object.assign(root.space.shipyard.blueprint, {
    class: "cruiser",
    armor: "alloy",
    weapon: "gauss",
    engine: "tie",
    power: "fusion",
    sensor: "lidar",
    special: "massdriver",
    name: "Nomad",
  });
}

/** What `setVal('class', 'explorer')` writes into this transcription, at the levels above. */
function nativeExplorerDesign(overrides = {}) {
  return {
    class: "explorer",
    armor: "neutronium",
    weapon: "railgun",
    engine: "emdrive",
    power: "elerium",
    sensor: "quantum",
    // The cruiser's `massdriver` is not an Explorer fit, so the class default replaced it.
    special: "none",
    name: "Nomad",
    ...overrides,
  };
}

/**
 * A Tau-exploring pass over an established yard, and its control.
 *
 * The settings view is this harness's own, so a case that changes what the yard's Explorer is does
 * not disturb any other.
 */
function explorerHarness(options = {}) {
  const root = options.root ?? makeTauRoot(options.tech);
  (options.design ?? massdriverDesign)(root);
  const harness = makeHarness({
    establish: true,
    root,
    // The game's own destination closure offers what this save's routes reach, and Tau Ceti is the
    // one the Explorer sails for.
    destinations: ["tauceti"],
    ...options.harness,
  });
  const settings = Object.create(HARNESS_SETTINGS);
  settings.fleetExploreTau = true;
  return {
    harness,
    settings,
    control: outerFleetControl(harness, () => settings),
  };
}

/**
 * What a built hull was, read over the dimensions the yard's own option markup offered.
 *
 * Over the catalogue rather than over the hull's own keys, because a dispatch rewrites the route in
 * place and the design is what the comparison is about. A dimension the yard offers and the hull is
 * missing therefore shows up here as `undefined`, which is the failure worth seeing.
 */
function builtDesign(harness, ship = harness.page.builtShips[0]) {
  return Object.fromEntries(
    harness.parts.catalog().types.map((type) => [type, ship[type]]),
  );
}

/** `nativeExplorerDesign()` without the ship's name, which is a registry field rather than a part. */
function nativeExplorerParts(overrides) {
  const parts = { ...nativeExplorerDesign(overrides) };
  delete parts.name;
  return parts;
}

// The design is the game's, asked for and read back: the yard's own `setVal` rewrote five unrelated
// fields and normalized the class-forced `special`, none of which this script named, and the hull the
// pass built is that answer field for field.
{
  const { harness, control } = explorerHarness();
  const writesBefore = harness.page.setValWrites.length;
  const pass = control.autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded");
  // Normalization is a single native class change, applied before anything else is asked.
  assert.deepEqual(
    harness.page.setValWrites.slice(writesBefore, writesBefore + 1),
    [["class", "explorer"]],
    "the Explorer was not normalized by a single native class change",
  );
  assert.equal(harness.page.builtShips.length, 1);
  assert.deepEqual(builtDesign(harness), nativeExplorerParts());
  assert.equal(harness.page.builtShips[0].name, "Nomad");
  assert.deepEqual(sentTo(harness.page), [
    { kind: "sendShipTo", id: 0, region: "tauceti", moved: true },
  ]);
  assert.deepEqual(harness.faults, []);
}

// The same answer through the authority itself, and the player's own design back afterwards — the
// temporary design is normalized by the game, priced by the game, and then gone.
{
  const { harness } = explorerHarness();
  const live = harness.root.space.shipyard.blueprint;
  const before = Object.entries(live);
  const bindsBefore = harness.page.binds.length;
  const appsBefore = realApps.length;
  const releases = harness.page.workspaceReleases;
  const draws = harness.page.costDraws;
  assert.deepEqual(
    harness.costs.normalize({ class: "explorer" }),
    nativeExplorerDesign(),
    "the normalized design is not the game's own class change",
  );
  assert.deepEqual(
    Object.entries(live),
    before,
    "normalization left the design behind",
  );
  assert.equal(
    harness.page.costDraws - draws,
    1,
    "the class change did not run once",
  );
  // One protected pass and nothing else: no extra yard draw for a catalogue the yard already holds.
  assert.equal(harness.page.workspaceReleases, releases + 1);
  assert.equal(harness.page.binds.length, bindsBefore);
  assert.equal(realApps.length, appsBefore);
  assert.equal(harness.page.document.getElementById("shipYardCosts"), null);
  assert.equal(harness.page.document.getElementById("shipPlans"), null);
  assert.deepEqual(harness.faults, []);
}

// Normalization stands on its own: neither the price nor the crew answer is part of it, so a design
// is still validly normalized when neither can be read.
for (const [unreadable, breakIt] of [
  ["crew", (harness) => (harness.page.crewThrows = true)],
  ["the cost row", (harness) => (harness.page.costsUnreadable = true)],
]) {
  const { harness } = explorerHarness();
  const live = harness.root.space.shipyard.blueprint;
  const before = Object.entries(live);
  breakIt(harness);
  assert.deepEqual(
    harness.costs.normalize({ class: "explorer" }),
    nativeExplorerDesign(),
    `normalization depended on ${unreadable}`,
  );
  assert.deepEqual(Object.entries(live), before);
  // The quote over the same yard is refused, which is what makes the two answers separate ones.
  assert.equal(
    harness.costs.quote({ class: "explorer" }),
    undefined,
    unreadable,
  );
}

// A game whose Explorer is not this transcription's. Only the game's own class change moves, and the
// hull the pass builds follows it — with no production change, and with no local name for the field
// it chose: `booster` is a dimension this tip's `shipParts` has never heard of, and the catalogue
// carries it, so the design that fills it is one the yard demonstrably offers.
{
  const root = makeTauRoot({ syard_power: 6, syard_booster: 2 });
  massdriverDesign(root);
  const harness = makeHarness({
    establish: true,
    root,
    destinations: ["tauceti"],
    shipParts: { ...SHIP_PARTS, booster: ["none", "warp_core"] },
  });
  Object.assign(harness.page.explorerDefaults, {
    power: "antimatter",
    engine: "tie",
    booster: "warp_core",
  });
  const settings = Object.create(HARNESS_SETTINGS);
  settings.fleetExploreTau = true;
  const pass = outerFleetControl(harness, () => settings).autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded");
  assert.equal(harness.page.builtShips.length, 1);
  assert.deepEqual(
    builtDesign(harness),
    nativeExplorerParts({
      power: "antimatter",
      engine: "tie",
      booster: "warp_core",
    }),
    "a changed Explorer default, or a dimension nobody named, did not reach the built hull",
  );
  assert.ok(
    harness.parts.catalog().types.includes("booster"),
    "the invented dimension is not part of what the yard offers",
  );
  assert.deepEqual(harness.faults, []);
}

// The availability boundary is asked of the yard as it is, and `avail()` carries the *live* hull —
// upstream `shipPartAvailable(part, idx, value, shipClass)` is bound with
// `global.space.shipyard.blueprint.class`. So an Explorer normalized out of a yard wearing a hull whose
// special slot is its own carries a `special` the live yard would not offer as a fresh choice, and the
// design is refused. Characterized rather than worked around: this is what the boundary answers, and
// the pass falls through to its ordinary target instead of building a design it cannot justify.
{
  const { harness, control } = explorerHarness({
    design: (root) =>
      Object.assign(root.space.shipyard.blueprint, {
        class: "freighter",
        armor: "alloy",
        weapon: "none",
        engine: "tie",
        power: "fusion",
        sensor: "lidar",
        special: "extra_fuel",
        name: "Nomad",
      }),
  });
  assert.deepEqual(
    harness.costs.normalize({ class: "explorer" }),
    nativeExplorerDesign(),
    "the normalized design is not the game's own class change",
  );
  assert.equal(control.autoFleetOuter().outcome.status, "succeeded");
  assert.equal(
    harness.page.builtShips.some((ship) => ship.class === "explorer"),
    false,
    "an Explorer was built from a design the yard would not offer",
  );
  assert.ok(
    harness.page.availCalls.some(
      ([type, , value, liveClass]) =>
        type === "special" && value === "none" && liveClass === "freighter",
    ),
    "the availability question was not asked of the live hull",
  );
}

// A yard that cannot say what the Explorer is has no Explorer authority at all: no design is stored,
// nothing is counted against one, no Explorer hull is built and nothing is sent to Tau Ceti. The pass
// falls through to its ordinary target, which is the honest answer when the yard cannot normalize.
for (const [refusal, breakIt] of [
  [
    "a write the yard refuses",
    (harness) => (harness.page.setValRefuses = "class"),
  ],
  [
    "a write the yard throws out of",
    (harness) => (harness.page.setValThrows = "class"),
  ],
  [
    "a workspace it cannot put back",
    (harness) => (harness.page.workspaceBroken = true),
  ],
]) {
  const { harness, control } = explorerHarness();
  const live = harness.root.space.shipyard.blueprint;
  const before = Object.entries(live);
  breakIt(harness);
  const pass = control.autoFleetOuter();
  assert.equal(pass.outcome.status, "succeeded", refusal);
  assert.equal(
    harness.page.builtShips.some((ship) => ship.class === "explorer"),
    false,
    `an Explorer was built despite ${refusal}`,
  );
  assert.deepEqual(
    sentTo(harness.page).filter((record) => record.region === "tauceti"),
    [],
    `a ship was sent to Tau Ceti despite ${refusal}`,
  );
  for (const [key, value] of before) {
    if (key === "class") continue;
    assert.deepEqual(
      [key, live[key]],
      [key, value],
      `${refusal}: the design was left changed`,
    );
  }
}

// ---------------------------------------------------------------------------

// Fleet demand reads the same authority, so a save that never opened the shipyard still knows what
// its next ship costs — and it says so through the pool the game wrote for the cost.
{
  const demand = createCapturedFleetDemand({
    rootState: { readRoot: () => integrated.root },
    costs: integrated.costs,
    shipyard: integrated.shipyard,
    readSettings: () => ({
      autoFleet: true,
      prioritizeOuterFleet: "req",
    }),
  });
  assert.deepEqual(demand.read(), {
    nextShipAffordable: true,
    nextShipExpandable: true,
    nextShipCost: gameSample(
      integrated,
      integrated.root.space.shipyard.blueprint,
    ).amounts.map(({ resourceId, amount }) => ({
      resourceId,
      amount,
      pool: "tau_gas2",
    })),
  });
  assert.deepEqual(integrated.root.space.shipyard.blueprint, pristineBlueprint);
}

// The same save with the fleet automation off: the yard is never established merely to price a cost
// nothing keeps.
{
  const untouched = makeHarness();
  const requested = [];
  const demand = createCapturedFleetDemand({
    rootState: { readRoot: () => untouched.root },
    costs: untouched.costs,
    shipyard: {
      ...untouched.shipyard,
      establish: () => {
        requested.push(true);
        return undefined;
      },
    },
    readSettings: () => ({ autoFleet: false, prioritizeOuterFleet: "req" }),
  });
  assert.equal(demand.read(), undefined);
  assert.deepEqual(requested, []);
  assert.equal(
    untouched.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL),
    undefined,
    "the shipyard was established to price a cost nothing keeps",
  );
  assert.equal(untouched.page.document.getElementById("dwarfShipYard"), null);
}

// And with it on, the demand establishes the yard itself rather than waiting for a visit.
{
  const visiting = makeHarness();
  const demand = createCapturedFleetDemand({
    rootState: { readRoot: () => visiting.root },
    costs: visiting.costs,
    shipyard: visiting.shipyard,
    readSettings: () => ({ autoFleet: true, prioritizeOuterFleet: "req" }),
  });
  assert.deepEqual(demand.read(), {
    nextShipAffordable: true,
    nextShipExpandable: true,
    nextShipCost: gameSample(
      visiting,
      visiting.root.space.shipyard.blueprint,
    ).amounts.map(({ resourceId, amount }) => ({
      resourceId,
      amount,
      pool: "tau_gas2",
    })),
  });
  assert.equal(
    visiting.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL) !==
      undefined,
    true,
    "the yard was not established for its own cost",
  );
  assert.equal(visiting.page.document.getElementById("dwarfShipYard"), null);
  assert.deepEqual(visiting.root.space.shipyard.blueprint, pristineBlueprint);
}

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
const ownedControl = outerFleetControl(owned, () => ownedSettings);
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

// Preload mode draws every tab itself, so there is no yard left for the scratch route to establish.
const retained = makeHarness();
retained.root.settings.tabLoad = true;
assert.equal(retained.shipyard.establish(), undefined);
assert.ok(
  retained.faults.some((detail) =>
    detail.includes("preload mode draws every tab"),
  ),
  retained.faults.join("; "),
);

// ---------------------------------------------------------------------------
// Preload mode: the game's own row, and the scratch route never running.
// ---------------------------------------------------------------------------

// `initTabs()` loads every main tab up front and `loadTab('mTabCivic')` calls `drawShipYard()` itself,
// so the real panel, `#shipPlans` and `#shipList` exist before the automation does anything, and
// `buildTPShip()`'s own `drawShips()` - whose tab gate is skipped entirely under preload - refreshes
// the rows after a build.
const preload = makeHarness({ preload: true });
preload.game.initTabs();
assert.notEqual(
  preload.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL),
  undefined,
  "preload mode did not capture the yard's own control",
);
assert.notEqual(preload.page.document.getElementById("shipList"), null);
assert.equal(preload.page.shipRowsDrawn, undefined, "an empty yard drew a row");
const preloadSettings = Object.create(HARNESS_SETTINGS);
const preloadControl = outerFleetControl(preload, () => preloadSettings);
const preloadPass = preloadControl.autoFleetOuter();
assert.equal(preloadPass.outcome.status, "succeeded");
assert.equal(preloadPass.shipTargetChanged, true);
assert.equal(preload.root.space.shipyard.ships.length, 1);
// The game's own build drew the row, into the player's own list.
assert.deepEqual(preload.page.builds, [{ rowsBound: 1, drewList: 1 }]);
const preloadRow = rowControl(preload.capture, 0);
assert.notEqual(preloadRow, undefined);
assert.ok(preloadRow.methods.includes("pickDest"));
assert.ok(preloadRow.methods.includes("show"));
assert.equal(
  preload.page.Vue.toRaw(preloadRow.data),
  preload.root.space.shipyard.ships[0],
);
assert.equal(
  preload.page.document
    .getElementById("shipList")
    .contains(preload.page.document.getElementById("shipReg0")),
  true,
  "the row is not inside the game's own ship list",
);
assert.deepEqual(sentTo(preload.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.equal(preload.root.space.shipyard.ships[0].movement.to, "spc_red");
assert.equal(preload.root.civic.garrison.crew, 2);
// One list, the player's own, and nothing of the scratch route anywhere.
assert.equal(
  preload.page.document.querySelectorAll("#shipList").length,
  1,
  "the dispatch stood a second ship list",
);
assert.equal(
  preload.page.document.getElementById("shipList").parentElement.id,
  "dwarfShipYard",
);
assert.equal(preload.page.document.getElementById("modalBox"), null);
assert.equal(preload.page.document.querySelector(".modal.is-active"), null);
assert.equal(preload.page.document.querySelector(".modal-background"), null);
assert.equal(preload.root.settings.tabLoad, true);
assert.equal(preload.root.settings.civTabs, 1);
assert.equal(preload.root.settings.govTabs, 0);
assert.equal(preload.page.setInterval, preload.page.realSetInterval);
assert.equal(preload.page.clearInterval, preload.page.realClearInterval);
assert.equal(
  TestElement.prototype.addEventListener,
  realAddEventListener,
  "the page's own addEventListener was not restored",
);
assert.deepEqual(preload.faults, []);

// A row the page really drew, but bound to another ship: the identity proof refuses it and preload
// mode leaves no scratch route to fall back on.
const preloadWrong = makeHarness({ preload: true });
preloadWrong.root.space.shipyard.ships.push(makeShip({ name: "First" }));
preloadWrong.root.space.shipyard.ships.push(makeShip({ name: "Second" }));
preloadWrong.page.rowData = (index) =>
  preloadWrong.root.space.shipyard.ships[(index + 1) % 2];
preloadWrong.game.initTabs();
assert.notEqual(preloadWrong.page.document.getElementById("shipReg0"), null);
assert.deepEqual(
  preloadWrong.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(preloadWrong.page), []);
assert.ok(
  preloadWrong.faults.some((detail) =>
    detail.includes("bound to another ship"),
  ),
  preloadWrong.faults.join("; "),
);

// The same, for a row whose binding lost one of the two methods the dispatch needs.
for (const omitted of ["pickDest", "show"]) {
  const preloadPartial = makeHarness({ preload: true });
  preloadPartial.root.space.shipyard.ships.push(makeShip());
  preloadPartial.page.rowMethodsMissing = [omitted];
  preloadPartial.game.initTabs();
  assert.notEqual(
    preloadPartial.page.document.getElementById("shipReg0"),
    null,
  );
  assert.deepEqual(
    preloadPartial.dispatch.dispatchShipyardShip({
      index: 0,
      region: "spc_red",
    }),
    { kind: "unreachable" },
  );
  assert.deepEqual(sentTo(preloadPartial.page), []);
  assert.ok(
    preloadPartial.faults.some((detail) => detail.includes(omitted)),
    preloadPartial.faults.join("; "),
  );
}

// A registry-only row left by an earlier scratch capture: same id, still this ship's object, element
// long gone. Preload mode has not drawn a row, so it must not answer.
const orphan = makeHarness({ establish: true });
const orphanShip = makeShip({ name: "Nomad" });
orphan.root.space.shipyard.ships.push(orphanShip);
assert.deepEqual(
  orphan.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
  { kind: "launched" },
);
assert.equal(orphan.page.document.getElementById("shipReg0"), null);
assert.equal(orphan.page.document.getElementById("shipList"), null);
const orphanGeneration = rowControl(orphan.capture, 0).generation;
orphan.root.settings.tabLoad = true;
orphan.page.document
  .getElementById("mTabCivic")
  .append(element("div", { id: "dwarfShipYard" }));
const orphanSecond = makeShip({ name: "Vagrant" });
orphan.root.space.shipyard.ships.push(orphanSecond);
assert.deepEqual(
  orphan.dispatch.dispatchShipyardShip({ index: 1, region: "spc_red" }),
  { kind: "unreachable" },
);
assert.deepEqual(sentTo(orphan.page).slice(-1), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.equal(rowControl(orphan.capture, 0).generation, orphanGeneration);
assert.equal(orphanSecond.movement, undefined);
assert.ok(
  orphan.faults.some((detail) =>
    detail.includes("should already be bound and rendered"),
  ),
  orphan.faults.join("; "),
);

// ---------------------------------------------------------------------------
// Preload mode: the game's own cost row, read without ever probing.
// ---------------------------------------------------------------------------

// `updateCosts()` runs inside every `setVal`, so the row the preload panel holds is already this
// save's own answer. Reading it must be completely passive: no `setVal`, no new draw, no scratch.
{
  const drawsBefore = preload.page.costDraws;
  const writesBefore = preload.page.setValWrites.length;
  assert.deepEqual(
    preload.costs.current(),
    gameSample(preload, preload.root.space.shipyard.blueprint),
  );
  assert.deepEqual(
    preload.costs.quote({ ...preload.root.space.shipyard.blueprint })?.costs,
    gameSample(preload, preload.root.space.shipyard.blueprint),
  );
  preload.page.designCrew = 41;
  const releases = preload.page.workspaceReleases;
  const crewReads = preload.page.crewSamples?.length ?? 0;
  assert.deepEqual(
    preload.costs.quote({ ...preload.root.space.shipyard.blueprint }),
    {
      crew: 41,
      // Nothing was applied in this route, so the design the row prices is the one the yard already
      // holds — which is what a normalized answer is, read with no second pass.
      normalizedBlueprint: preload.root.space.shipyard.blueprint,
      costs: gameSample(preload, preload.root.space.shipyard.blueprint),
    },
  );
  assert.equal(preload.page.crewSamples.length, crewReads + 1);
  assert.equal(
    preload.page.workspaceReleases,
    releases,
    "current design unnecessarily protected/redrawn",
  );
  delete preload.page.designCrew;
  assert.equal(
    preload.page.costDraws,
    drawsBefore,
    "a rendered row was redrawn",
  );
  assert.equal(
    preload.page.setValWrites.length,
    writesBefore,
    "a rendered row was probed",
  );
  assert.deepEqual(preload.faults, []);
}

// A design the yard is not holding has no rendered row to read, so it is priced the off-tab way —
// and the player's own row is neither read nor rewritten.
{
  const drafts = makeHarness({ preload: true });
  drafts.game.initTabs();
  const realRow = drafts.page.document.getElementById("shipYardCosts");
  assert.notEqual(realRow, null);
  const renderedBefore = realRow.innerHTML;
  const writesBefore = drafts.page.setValWrites.length;
  const pricedDesign = drafts.costs.quote({
    class: "frigate",
    power: "fusion",
    weapon: "plasma",
    armor: "alloy",
    engine: "tie",
    sensor: "lidar",
  })?.costs;
  assert.deepEqual(
    pricedDesign,
    gameSample(drafts, {
      ...drafts.root.space.shipyard.blueprint,
      class: "frigate",
      power: "fusion",
      weapon: "plasma",
      armor: "alloy",
      engine: "tie",
      sensor: "lidar",
    }),
  );
  assert.deepEqual(
    drafts.root.space.shipyard.blueprint,
    makeRoot().space.shipyard.blueprint,
  );
  assert.equal(drafts.page.setValWrites.length, writesBefore + 6);
  // The probe ran against a scratch row, so the player's row kept exactly the markup it had.
  assert.equal(realRow.innerHTML, renderedBefore);
  assert.equal(
    drafts.page.document.getElementById("shipYardCosts"),
    realRow,
    "the player's own cost row was replaced",
  );
  assert.deepEqual(drafts.faults, []);
}

// Markup the game does not emit is no answer. Each of these is refused rather than read, because a
// caller that received one would be reading a question the yard was never asked.
for (const [broken, why] of [
  [
    (row) =>
      row
        .querySelectorAll("span")
        .forEach((span) => span.attributes.delete("data-money")),
    "a resource with no amount",
  ],
  [
    (row) =>
      row.append(
        ...parseTestMarkup(
          '<span class="res-Iron" data-iron="5" data-ok="has-text-success">Iron 5</span>',
        ),
      ),
    "a second element for a resource already priced",
  ],
  [
    (row) => row.querySelectorAll("span").forEach((span) => span.remove()),
    "no resource at all",
  ],
  [
    (row) =>
      row
        .querySelectorAll("span")[0]
        .setAttribute("data-money", "not a number"),
    "an amount that is not a number",
  ],
  [
    (row) => row.querySelectorAll("span")[0].attributes.delete("data-ok"),
    "a resource with no success marking",
  ],
]) {
  const damaged = makeHarness({ preload: true });
  damaged.game.initTabs();
  broken(damaged.page.document.getElementById("shipYardCosts"));
  const sample = damaged.costs.current();
  assert.ok(
    sample === undefined ||
      sample.amounts.some((entry) => entry.affordable === false),
    `${why} was read as a payable cost`,
  );
  if (sample === undefined) {
    assert.ok(
      damaged.faults.some((detail) =>
        detail.includes("rendered shipYardCosts could not be read"),
      ),
      `${why} was not reported: ${damaged.faults.join("; ")}`,
    );
    // And it is not quietly answered by pricing off-tab instead: the yard already drew a price, so
    // the answer belongs to the yard.
    assert.equal(
      damaged.page.setValWrites.length,
      0,
      `${why} was priced off-tab`,
    );
  }
}

// A resource the game did not mark is not one the yard can pay, however much stock the save holds.
{
  const unmarked = makeHarness({ preload: true });
  unmarked.game.initTabs();
  unmarked.page.document
    .getElementById("shipYardCosts")
    .querySelectorAll("span")
    .forEach((span) => span.attributes.delete("data-ok"));
  const sample = unmarked.costs.current();
  assert.notEqual(sample, undefined);
  assert.deepEqual(
    sample.amounts.map((entry) => entry.affordable),
    sample.amounts.map(() => false),
  );
  assert.deepEqual(
    sample.amounts.every(
      (entry) => unmarked.root.resource[entry.resourceId].amount > entry.amount,
    ),
    true,
    "the save was not stocked, so this could be the resource amounts",
  );
}

// ---------------------------------------------------------------------------
// Which parts the yard offers, and which option position each one owns.
//
// Every hull, every component and the special slot come out of `ships.js:shipParts` through the
// markup `drawShipYard()` emitted, and the option index that reaches `avail()` is the one written
// into that markup. Nothing in the script keeps a second copy, so what follows is a set of designs
// the local copy this used to be could not express at all.
// ---------------------------------------------------------------------------

/** A preset as the settings layer hands one over, with named fields dropped rather than inherited. */
function presetSettings(overrides = {}, dropped = []) {
  const settings = { ...HARNESS_SETTINGS, ...overrides };
  for (const key of dropped) delete settings[key];
  return settings;
}

/** A save whose shipyard technology has reached the levels the newer parts need. */
function shipyardTech(levels) {
  const root = makeRoot();
  Object.assign(root.tech, levels);
  return root;
}

/** A save whose Syndicate has reached Eris, which is what its own region gate requires. */
function erisSyndicateTech(levels) {
  const root = shipyardTech(levels);
  root.tech.eris = 1;
  root.space.syndicate.spc_eris = 600;
  return root;
}

/** Every part the yard was asked about, as `type=index:value`, in the order it was asked. */
function askedFor(harness) {
  return harness.page.availCalls.map(
    ([type, index, value]) => `${type}=${index}:${value}`,
  );
}

// The yard's own catalogue, off the very markup that drew it.
assert.deepEqual(integrated.parts.catalog().types, [
  "class",
  "power",
  "weapon",
  "armor",
  "engine",
  "sensor",
  "special",
]);
assert.deepEqual(integrated.parts.catalog().optionFor("class", "supply_ship"), {
  type: "class",
  value: "supply_ship",
  index: 8,
});
assert.deepEqual(
  integrated.parts.catalog().optionFor("special", "repair_ship"),
  {
    type: "special",
    value: "repair_ship",
    index: 7,
  },
);
assert.equal(
  integrated.parts.catalog().optionFor("weapon", "not_a_mount"),
  undefined,
  "a part the yard never offered was answered",
);

// ---------------------------------------------------------------------------
// Current Design: the yard's own blueprint, normalized by the yard.
// ---------------------------------------------------------------------------

// Presentation methods are optional and never consulted for buildability. The native build and
// the intended ship's synchronous appearance decide whether this pass may dispatch.
for (const presentation of ["absent", "throws", "arbitrary", "danger"]) {
  const native = makeHarness();
  let presentationCalls = 0;
  if (presentation === "absent") delete native.game.shipyardMethods.powerText;
  else
    native.game.shipyardMethods.powerText = () => {
      presentationCalls += 1;
      if (presentation === "throws")
        throw new Error("presentation unavailable");
      return presentation === "danger"
        ? '<span class="danger">-50kW</span>'
        : "<div>unrelated presentation</div>";
    };
  assert.notEqual(native.shipyard.establish(), undefined, presentation);
  const settings = presetSettings();
  const pass = outerFleetControl(native, () => settings).autoFleetOuter();
  assert.equal(
    pass.outcome.status,
    "succeeded",
    JSON.stringify({ presentation, outcome: pass.outcome }),
  );
  assert.equal(native.page.buildCount, 1, presentation);
  assert.equal(native.root.space.shipyard.ships.length, 1, presentation);
  assert.deepEqual(sentTo(native.page), [
    { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
  ]);
  assert.equal(presentationCalls, 0, presentation);
  assert.deepEqual(native.faults, [], presentation);
}

// The same affordable quote can lead to a native refusal or a queued order as live state changes.
// Both outcomes append nothing. Only the native method decides, and no dispatch follows either.
for (const nativeOutcome of [
  "underpowered",
  "queued",
  "throws",
  "unavailable",
  "stale",
]) {
  const native = makeHarness();
  native.root.space.shipyard.blueprint.weapon = "laser";
  const build = native.game.shipyardMethods.build;
  if (nativeOutcome === "underpowered") native.page.nativeBuildRefuses = true;
  if (nativeOutcome === "queued")
    native.game.shipyardMethods.build = () => {
      // Readiness saw the native affordable cost row; payment changes only at invocation.
      for (const resource of Object.values(native.root.resource)) {
        resource.amount = 0;
        if (resource.regAmount)
          for (const pool of Object.keys(resource.regAmount))
            resource.regAmount[pool] = 0;
      }
      return build();
    };
  if (nativeOutcome === "throws")
    native.game.shipyardMethods.build = () => {
      native.page.buildCount = (native.page.buildCount ?? 0) + 1;
      throw new Error("native build unavailable");
    };
  assert.notEqual(native.shipyard.establish(), undefined);
  let executionHarness = native;
  if (nativeOutcome === "unavailable" || nativeOutcome === "stale") {
    const invoke = native.capture.controls.invoke;
    const failBuild = (handle, method, args) =>
      method === "build"
        ? invoke(
            nativeOutcome === "stale"
              ? { ...handle, generation: handle.generation - 1 }
              : handle,
            nativeOutcome === "unavailable" ? "missingBuild" : method,
            args,
          )
        : invoke(handle, method, args);
    executionHarness = {
      ...native,
      capture: {
        ...native.capture,
        controls: { ...native.capture.controls, invoke: failBuild },
      },
    };
  }
  const settings = presetSettings();
  const result = outerFleetControl(
    executionHarness,
    () => settings,
  ).autoFleetOuter();
  const noAppend =
    nativeOutcome === "underpowered" || nativeOutcome === "queued";
  assert.equal(
    result.outcome.status,
    noAppend ? "stale" : "rejected",
    nativeOutcome,
  );
  assert.equal(
    result.outcome.failure?.code,
    noAppend
      ? "captured-outer-fleet-build-postcondition-failed"
      : "captured-outer-fleet-build-not-invoked",
    nativeOutcome,
  );
  assert.doesNotMatch(result.outcome.failure?.message ?? "", /power/i);
  assert.equal(
    native.page.buildCount ?? 0,
    noAppend || nativeOutcome === "throws" ? 1 : 0,
  );
  assert.equal(
    native.page.queuedBuilds ?? 0,
    nativeOutcome === "queued" ? 1 : 0,
  );
  assert.equal(native.root.space.shipyard.ships.length, 0, nativeOutcome);
  assert.deepEqual(sentTo(native.page), [], nativeOutcome);
  assert.equal(native.root.space.shipyard.blueprint.weapon, "railgun");
  assert.equal(result.shipTargetChanged, true, nativeOutcome);
}

// `drawShipYard()` normalizes a `special` into every blueprint whether or not the special-slot
// selector was ever researched, so a save that never unlocked it still holds a design with one.
// Building that design must not begin by asking the yard whether it offers the special its own
// blueprint already carries.
const designed = makeHarness({ establish: true });
assert.equal(designed.root.space.shipyard.blueprint.special, "none");
assert.equal(
  designed.root.tech.syard_special,
  undefined,
  "the special slot was never researched",
);
const designedSettings = presetSettings({ fleetOuterShips: "user" });
const designedBlueprint = makeRoot().space.shipyard.blueprint;
const designedPass = outerFleetControl(
  designed,
  () => designedSettings,
).autoFleetOuter();
assert.equal(designedPass.outcome.status, "succeeded");
assert.deepEqual(askedFor(designed), [], "an unchanged field was asked about");
// The three passes the price probe makes on its way through — the readiness price and the two target
// observations — and nothing else. A build that rewrote even one field of the design it was given
// would be a fourth pass, and the yard's blueprint is unchanged afterwards in any case.
const priceProbePass = Object.entries(designedBlueprint)
  .filter(([type]) => type !== "name")
  .map(([type, part]) => [type, part]);
assert.deepEqual(designed.page.setValWrites, [
  ...priceProbePass,
  ...priceProbePass,
  ...priceProbePass,
]);
assert.deepEqual(
  designed.root.space.shipyard.blueprint,
  designedBlueprint,
  "the yard's own design was written back into it",
);
assert.equal(designed.page.buildCount, 1);
assert.equal(designed.root.space.shipyard.ships.length, 1);
assert.deepEqual(sentTo(designed.page), [
  { kind: "sendShipTo", id: 0, region: "spc_red", moved: true },
]);
assert.deepEqual(designed.root.space.shipyard.ships[0].special, "none");
assert.deepEqual(designed.faults, []);

// ---------------------------------------------------------------------------
// Parts the local copy did not have: a preset naming all four of them builds.
// ---------------------------------------------------------------------------

const modern = makeHarness({
  establish: true,
  root: shipyardTech({
    syard_power: 6,
    syard_weapon: 7,
    syard_armor: 4,
    syard_engine: 7,
  }),
});
const modernSettings = presetSettings({
  fleet_outer_power: "antimatter",
  fleet_outer_weapon: "gauss",
  fleet_outer_armor: "aerographene",
  fleet_outer_engine: "electrokinetic",
});
assert.equal(
  outerFleetControl(modern, () => modernSettings).autoFleetOuter().outcome
    .status,
  "succeeded",
);
assert.equal(modern.root.space.shipyard.ships.length, 1);
const modernShip = modern.root.space.shipyard.ships[0];
assert.deepEqual(
  {
    power: modernShip.power,
    weapon: modernShip.weapon,
    armor: modernShip.armor,
    engine: modernShip.engine,
  },
  {
    power: "antimatter",
    weapon: "gauss",
    armor: "aerographene",
    engine: "electrokinetic",
  },
);
// Each was reached through the position the yard's own markup gave it, not through a list here.
assert.deepEqual(askedFor(modern), [
  "power=5:antimatter",
  "weapon=6:gauss",
  "armor=3:aerographene",
  "engine=6:electrokinetic",
]);
assert.deepEqual(modern.faults, []);

// The same four, with the yard refusing one of them. The entry is in the catalogue and the design is
// refused whole: no write, no build, nothing sent.
const locked = makeHarness({
  establish: true,
  root: shipyardTech({ syard_power: 6, syard_weapon: 7, syard_armor: 4 }),
  lockedParts: new Set(["weapon:gauss"]),
});
const lockedResult = outerFleetControl(
  locked,
  () => modernSettings,
).autoFleetOuter();
assert.equal(lockedResult.outcome.status, "succeeded");
assert.deepEqual(askedFor(locked), ["power=5:antimatter", "weapon=6:gauss"]);
assert.deepEqual(locked.page.setValWrites, [], "a locked part was written");
assert.equal(locked.page.buildCount, undefined, "a locked part built a ship");
assert.equal(locked.root.space.shipyard.ships.length, 0);
assert.deepEqual(sentTo(locked.page), []);

// ---------------------------------------------------------------------------
// A hull that rewrites the design: the postcondition is the yard's own result.
// ---------------------------------------------------------------------------

// A freighter has no mount and takes a fuel tank with it, and a Supply Ship has no mount either and
// whose special slot is never empty. Neither preset names a weapon or a special, so every field of
// the ship that was built is one the game's own `setVal` decided.
//
// The fixture independently marks the freighter scenario inactive; both hulls use the Eris gate.
for (const [hull, technology, forced] of [
  ["freighter", { shadow: 5 }, { weapon: "none", special: "extra_fuel" }],
  [
    "supply_ship",
    { syard_supply: true },
    { weapon: "none", special: "mobile_storage" },
  ],
]) {
  const cargo = makeHarness({
    establish: true,
    root: erisSyndicateTech(technology),
    syndicateRendered: hull !== "freighter",
    destinations: ["spc_eris"],
  });
  const cargoSettings = presetSettings(
    { fleet_outer_class: hull, fleet_outer_pr_spc_eris: 1 },
    ["fleet_outer_weapon"],
  );
  const result = outerFleetControl(cargo, () => cargoSettings).autoFleetOuter();
  assert.equal(result.outcome.status, "succeeded", `${hull} did not build`);
  const built = cargo.root.space.shipyard.ships[0];
  assert.deepEqual(
    { weapon: built.weapon, special: built.special },
    forced,
    `${hull} was built from something other than the design the game normalized`,
  );
  // And the design the build was judged against is that one: the hull was the only field the yard was
  // asked about, and no request for a weapon or a special was ever made of it. A postcondition read
  // off the preset instead would name a railgun the hull cannot carry, and the build would have
  // appended nothing this could accept.
  assert.deepEqual(askedFor(cargo), [
    `class=${hull === "freighter" ? 6 : 8}:${hull}`,
  ]);
  assert.deepEqual(cargo.faults, []);
}

// ---------------------------------------------------------------------------
// The option index is the yard's, and the yard's is the only one that works.
// ---------------------------------------------------------------------------

// Upstream inserts a part, so `laser` is no longer the second weapon in the list. A position inferred
// from any list this script used to keep would still be 1, and `shipPartAvailable` compares the index
// as the unlock level — so the wrong index is a different answer, not a near miss.
const shifted = {
  ...SHIP_PARTS,
  weapon: [
    "auto_turret",
    "railgun",
    "laser",
    "p_laser",
    "plasma",
    "phaser",
    "disruptor",
    "gauss",
  ],
};
const reindexed = makeHarness({
  establish: true,
  shipParts: shifted,
  root: shipyardTech({ syard_weapon: 3 }),
});
const reindexedSettings = presetSettings({ fleet_outer_weapon: "laser" });
const reindexedResult = outerFleetControl(
  reindexed,
  () => reindexedSettings,
).autoFleetOuter();
assert.equal(reindexedResult.outcome.status, "succeeded");
assert.deepEqual(askedFor(reindexed), ["weapon=2:laser"]);
assert.equal(reindexed.root.space.shipyard.ships[0].weapon, "laser");

// ---------------------------------------------------------------------------
// Upstream adds a part this script has never heard of.
// ---------------------------------------------------------------------------

const extended = {
  ...SHIP_PARTS,
  weapon: [...shifted.weapon, "railcannon"],
};
const futuristic = makeHarness({
  establish: true,
  shipParts: extended,
  root: shipyardTech({ syard_weapon: 9 }),
});
const futuristicSettings = presetSettings({ fleet_outer_weapon: "railcannon" });
const futuristicResult = outerFleetControl(
  futuristic,
  () => futuristicSettings,
).autoFleetOuter();
assert.equal(futuristicResult.outcome.status, "succeeded");
assert.deepEqual(askedFor(futuristic), ["weapon=8:railcannon"]);
assert.equal(futuristic.root.space.shipyard.ships[0].weapon, "railcannon");
assert.deepEqual(futuristic.faults, []);

// ---------------------------------------------------------------------------
// Markup that is not a catalogue is no catalogue.
// ---------------------------------------------------------------------------

for (const [markup, why] of [
  [
    '<b-dropdown-item class="weapon a0" data-val="laser"></b-dropdown-item><b-dropdown-item class="weapon a1" data-val="laser"></b-dropdown-item>',
    "one part at two positions",
  ],
  [
    '<b-dropdown-item class="weapon a0" data-val="laser"></b-dropdown-item><b-dropdown-item class="weapon a0" data-val="phaser"></b-dropdown-item>',
    "two parts at one position",
  ],
  [
    '<b-dropdown-item class="weapon a1" data-val="laser"></b-dropdown-item>',
    "a position the dimension skipped",
  ],
  [
    '<b-dropdown-item class="weapon a0"></b-dropdown-item>',
    "an option with no part",
  ],
  [
    '<b-dropdown-item class="weapon a0" data-val=""></b-dropdown-item>',
    "an option with an empty part",
  ],
  [
    '<b-dropdown-item class="weapon a0" data-val="two words"></b-dropdown-item>',
    "a part that is not one name",
  ],
  [
    '<b-dropdown-item class="a0" data-val="laser"></b-dropdown-item>',
    "an option with no dimension",
  ],
  [
    '<b-dropdown-item class="a0 a1" data-val="laser"></b-dropdown-item>',
    "an option claiming two positions",
  ],
  [
    '<b-dropdown-item class="weapon a0" data-val="laser"></b-dropdown-item>',
    "",
  ],
]) {
  const host = element("div", { id: "shipPlans" });
  host.append(...parseTestMarkup(markup));
  const catalog = parseShipyardPartCatalog(host);
  if (why === "") {
    assert.deepEqual(catalog?.parts, [
      { type: "weapon", value: "laser", index: 0 },
    ]);
    continue;
  }
  assert.equal(catalog, undefined, `${why} was read as a catalogue`);
}

// The same refusal end to end: a yard whose own options cannot be read has no catalogue, and preload
// mode leaves no scratch draw to fall back on.
{
  const damaged = makeHarness({ preload: true });
  damaged.game.initTabs();
  damaged.page.document
    .getElementById("shipPlans")
    .querySelectorAll("*")
    .filter((node) => node.getAttribute("data-val") === "gauss")
    .forEach((node) => node.attributes.delete("data-val"));
  assert.equal(damaged.parts.catalog(), undefined);
  assert.ok(
    damaged.faults.some((detail) =>
      detail.includes("part options could not be read"),
    ),
    damaged.faults.join("; "),
  );
}

// ---------------------------------------------------------------------------
// A yard whose options cannot be read is not a yard with nothing to offer.
// ---------------------------------------------------------------------------

/**
 * A preload yard whose own option markup has been damaged beyond reading: one weapon option has lost
 * the part it names, so the catalogue refuses rather than answering with fewer parts than the game's.
 *
 * Preload mode is the hard case, because the markup is the only catalogue this page has — the yard is
 * on screen, so there is no scratch draw to buy another one with.
 */
function damagedCatalogHarness({ root = makeRoot(), ships = [] } = {}) {
  const harness = makeHarness({ root, preload: true, ships });
  harness.game.initTabs();
  harness.page.document
    .getElementById("shipPlans")
    .querySelectorAll("*")
    .filter((node) => node.getAttribute("data-val") === "gauss")
    .forEach((node) => node.attributes.delete("data-val"));
  assert.equal(
    harness.parts.catalog(),
    undefined,
    "damaged markup was read as a catalogue",
  );
  return harness;
}

/**
 * The composition with the build control stubbed, and every price question counted.
 *
 * The stub appends a hull nothing asked for and counts itself, which is what makes the execution's
 * own defence observable rather than asserted: the postcondition is the design the yard holds over the
 * game's own part dimensions, and a dreadnought cannot satisfy a corvette. A postcondition built over
 * no dimensions at all is an empty record, which satisfies *every* hull — so that build would run, be
 * accepted as the intended ship, and be dispatched. A postcondition built over a catalogue missing
 * `class` is worse in exactly the same way, and that is the case this stub is here for.
 */
function outerFleetControlOverWrongHull(harness, readSettings) {
  const registry = harness.capture.controls;
  const prices = [];
  return {
    prices,
    control: createCapturedOuterFleetControl({
      rootState: { readRoot: () => harness.root },
      controls: {
        resolve: (elementId) => registry.resolve(elementId),
        invoke: (handle, method, args) => {
          if (method !== "build") return registry.invoke(handle, method, args);
          harness.page.buildCount = (harness.page.buildCount ?? 0) + 1;
          harness.root.space.shipyard.ships.push({
            ...harness.root.space.shipyard.blueprint,
            name: "Wrong Hull",
            class: "dreadnought",
            location: { id: "spc_dwarf" },
          });
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => registry.capturedElementIds(),
      },
      costs: {
        current: () => harness.costs.current(),
        quote: (blueprint) => {
          prices.push(blueprint);
          return harness.costs.quote(blueprint);
        },
      },
      parts: harness.parts,
      dispatch: harness.dispatch,
      syndicate: harness.syndicate,
      regionMechanics: dispatchHarnessRegions(),
      readSettings,
    }),
  };
}

/** The one fault a damaged yard's catalogue reports, once, however many questions it is asked. */
const UNREADABLE_CATALOG_FAULT = [
  "the shipyard's own part options could not be read",
];

// Current Design. The yard's own design needs no `avail()` call — a field it already holds cannot be
// asked about — but the postcondition that judges the build is still the yard's design described over
// the game's part dimensions, and without them that design cannot be described at all. Answering
// "available" anyway would build the player's design against an empty postcondition, which every hull
// the yard could append would satisfy.
{
  const unreadableDesign = damagedCatalogHarness();
  const designBefore = { ...unreadableDesign.root.space.shipyard.blueprint };
  const currentDesignSettings = presetSettings({ fleetOuterShips: "user" });
  const { control, prices } = outerFleetControlOverWrongHull(
    unreadableDesign,
    () => currentDesignSettings,
  );
  assert.equal(control.autoFleetOuter().outcome.status, "succeeded");
  assert.deepEqual(prices, [], "Current Design was priced without a catalogue");
  assert.deepEqual(
    askedFor(unreadableDesign),
    [],
    "the yard was asked about a part its own markup cannot show it offers",
  );
  assert.deepEqual(
    unreadableDesign.page.setValWrites,
    [],
    "Current Design wrote the blueprint without a catalogue",
  );
  assert.equal(
    unreadableDesign.page.buildCount,
    undefined,
    "Current Design built without a catalogue",
  );
  assert.equal(unreadableDesign.root.space.shipyard.ships.length, 0);
  assert.deepEqual(sentTo(unreadableDesign.page), []);
  assert.deepEqual(
    unreadableDesign.root.space.shipyard.blueprint,
    designBefore,
    "the yard's own design was left changed",
  );
  assert.deepEqual(unreadableDesign.faults, UNREADABLE_CATALOG_FAULT);
}

// The forced Explorer, with an unreadable catalogue. `setVal(type, value)` has no availability gate
// upstream, so a design written without the catalogue is a hull the player may never have unlocked —
// and the Explorer is the one blueprint this script writes itself rather than configuring out of the
// settings, so nothing else would ever have caught it. Nothing here is Explorer-specific: every
// catalogue-dependent question answers no without authority, and so does every route that could have
// asked one.
for (const [why, tauShips] of [
  ["nothing is parked at Tau Ceti", []],
  [
    // The form the adapter's own region comparison reads. A ship here matches the Explorer's region
    // and nothing else about it, which is exactly the ship a zero-dimensional comparison counts as an
    // Explorer: the loop over no dimensions examines no field of it.
    "an unrelated ship at Tau Ceti is not an Explorer",
    [makeShip({ name: "Vagrant", location: "tauceti" })],
  ],
]) {
  const explorerRoot = makeRoot();
  explorerRoot.tech.tauceti = 1;
  const unreadableExplorer = damagedCatalogHarness({
    root: explorerRoot,
    ships: tauShips,
  });
  const parked = unreadableExplorer.root.space.shipyard.ships.length;
  const exploreSettings = presetSettings({ fleetExploreTau: true });
  const { control, prices } = outerFleetControlOverWrongHull(
    unreadableExplorer,
    () => exploreSettings,
  );
  assert.equal(control.autoFleetOuter().outcome.status, "succeeded");
  assert.deepEqual(prices, [], `${why}: an Explorer was priced`);
  assert.deepEqual(
    askedFor(unreadableExplorer),
    [],
    `${why}: an Explorer part was asked about`,
  );
  assert.deepEqual(
    unreadableExplorer.page.setValWrites,
    [],
    `${why}: an Explorer part was written`,
  );
  assert.equal(
    unreadableExplorer.page.buildCount,
    undefined,
    `${why}: an Explorer was built`,
  );
  assert.equal(
    unreadableExplorer.root.space.shipyard.ships.length,
    parked,
    `${why}: a ship was appended`,
  );
  assert.deepEqual(sentTo(unreadableExplorer.page), []);
  assert.deepEqual(unreadableExplorer.faults, UNREADABLE_CATALOG_FAULT);
}

// ---------------------------------------------------------------------------
// A catalogue that reads is not yet a whole one.
//
// Markup that has lost every option of one dimension still parses. What remains runs `0 … n-1` per
// dimension, nothing is duplicated and nothing is skipped, so the parser has every reason to call it a
// catalogue — and it is one, as far as anything inside the markup can tell. What it is not is the
// Dwarf Shipyard: `drawShipYard()` emits one `b-dropdown` per `Object.keys(shipParts)` entry, and the
// design it normalizes beside them carries a string field for each. So the yard's own blueprint is
// the only thing on the page that can say how many dimensions a complete catalogue has, and a
// catalogue that cannot place every field of it is not an authority over this yard.
// ---------------------------------------------------------------------------

/**
 * A preload yard whose option markup is readable throughout and missing one whole dimension.
 *
 * Every option of that dimension is taken out of the document and nothing else is touched, so this is
 * not the damaged markup above: the catalogue is built, it is non-empty, and every remaining dimension
 * in it is internally valid. The assertions that follow are what proves the yard is nonetheless refused.
 */
function incompleteCatalogHarness(dimension, options = {}) {
  const harness = makeHarness({ preload: true, ...options });
  harness.game.initTabs();
  for (const node of [
    ...harness.page.document.getElementById("shipPlans").querySelectorAll("*"),
  ]) {
    if (node.classList.contains(dimension)) node.remove();
  }
  const catalog = harness.parts.catalog();
  assert.notEqual(
    catalog,
    undefined,
    `${dimension}: the markup stopped being readable instead of incomplete`,
  );
  assert.ok(
    !catalog.types.includes(dimension),
    `${dimension}: a dimension nothing offers was catalogued`,
  );
  assert.deepEqual(
    harness.faults,
    [],
    `${dimension}: readable but incomplete markup reported a read fault`,
  );
  // Without the yard's own control the cycle would never be initialized and every assertion below
  // would hold vacuously, which is the same silent acceptance this section exists to prevent.
  assert.notEqual(
    harness.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL),
    undefined,
    `${dimension}: the yard was never captured, so nothing below was proven`,
  );
  return harness;
}

// Current Design with the whole hull dimension gone. Its fields are never asked about through
// `avail()` — the yard already holds them — so a catalogue without `class` answers this design
// completely, and the postcondition it builds names no hull. That is the regression the wrong-hull
// stub is for: without the design itself as the check, the dreadnought below satisfies an empty post
// condition, and the pass builds and dispatches a hull nobody asked for.
{
  const hullLess = incompleteCatalogHarness("class");
  const designBefore = { ...hullLess.root.space.shipyard.blueprint };
  const hullLessSettings = presetSettings({ fleetOuterShips: "user" });
  const { control, prices } = outerFleetControlOverWrongHull(
    hullLess,
    () => hullLessSettings,
  );
  assert.equal(control.autoFleetOuter().outcome.status, "succeeded");
  assert.deepEqual(
    prices,
    [],
    "a design was priced without a hull in the catalogue",
  );
  assert.deepEqual(askedFor(hullLess), [], "the yard was asked about anything");
  assert.deepEqual(hullLess.page.setValWrites, [], "the blueprint was written");
  assert.equal(
    hullLess.page.buildCount,
    undefined,
    "a postcondition without a hull built a ship",
  );
  assert.equal(hullLess.root.space.shipyard.ships.length, 0);
  assert.deepEqual(
    sentTo(hullLess.page),
    [],
    "a hull nobody asked for was dispatched",
  );
  assert.deepEqual(
    hullLess.root.space.shipyard.blueprint,
    designBefore,
    "the yard's own design was left changed",
  );
}

// The forced Explorer with the whole mount dimension gone. Upstream `setVal(type, value)` has no
// availability gate, so a missing dimension here is not a quieter answer — it is the one route that
// reaches `setVal("weapon", "railgun")` without the yard ever being asked whether an Explorer may
// carry it. This blueprint is written by this script rather than iterated out of the catalogue's
// dimensions, which is exactly why nothing else would have caught it.
{
  const explorerRoot = makeRoot();
  explorerRoot.tech.tauceti = 1;
  const mountLess = incompleteCatalogHarness("weapon", { root: explorerRoot });
  const mountLessSettings = presetSettings({ fleetExploreTau: true });
  const { control, prices } = outerFleetControlOverWrongHull(
    mountLess,
    () => mountLessSettings,
  );
  assert.equal(control.autoFleetOuter().outcome.status, "succeeded");
  assert.deepEqual(
    prices,
    [],
    "an Explorer was priced in a yard that offers no mount",
  );
  assert.deepEqual(
    askedFor(mountLess),
    [],
    "the yard was asked about an Explorer part it cannot be shown to offer",
  );
  assert.deepEqual(
    mountLess.page.setValWrites,
    [],
    "an Explorer part was written without the catalogue naming its dimension",
  );
  assert.equal(
    mountLess.page.buildCount,
    undefined,
    "an Explorer was built in a yard that offers no mount",
  );
  assert.equal(mountLess.root.space.shipyard.ships.length, 0);
  assert.deepEqual(sentTo(mountLess.page), []);
}

// ---------------------------------------------------------------------------
// The three routes to a catalogue, and what each one costs the player.
// ---------------------------------------------------------------------------

// A yard the player visited and then left: the control is still captured, the markup is gone, and
// nothing has drawn a yard since. Exactly one protected draw buys the catalogue back.
const visited = makeHarness({ playerYard: true });
visited.game.drawShipYard();
assert.notEqual(
  visited.capture.controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL),
  undefined,
  "the player's own visit did not capture the yard",
);
// The player switches away, and the game's own tab clear empties the Civic panel.
const civicPanel = visited.page.document.getElementById("mTabCivic");
for (const child of [...civicPanel.children]) civicPanel.removeChild(child);
assert.equal(visited.page.document.getElementById("shipPlans"), null);
assert.equal(visited.page.document.getElementById("dwarfShipYard"), null);
const drawsBeforeOffTab = visited.page.yardDraws;
const offTabCatalog = visited.parts.catalog();
assert.notEqual(
  offTabCatalog,
  undefined,
  "no catalogue for a yard the player left",
);
assert.equal(
  visited.page.yardDraws - drawsBeforeOffTab,
  1,
  "the catalogue cost something other than one protected draw",
);
assert.deepEqual(offTabCatalog.types, integrated.parts.catalog().types);
assert.equal(visited.parts.catalog(), offTabCatalog);
assert.equal(
  visited.page.yardDraws,
  drawsBeforeOffTab + 1,
  "a proven catalogue was bought again",
);
// The player is on their own shipyard, the workspace put every name back, and the draw is gone.
assert.equal(
  visited.root.settings.civTabs,
  2,
  "the player's own Civic sub-tab",
);
assert.equal(visited.root.settings.govTabs, 5);
assert.notEqual(visited.page.document.getElementById("mTabCivic"), null);
assert.deepEqual(
  visited.page.document
    .querySelectorAll("[id]")
    .filter((node) => node.id.startsWith("ea-aside-"))
    .map((node) => node.id),
  [],
  "the workspace left an aliased name behind",
);
assert.equal(visited.page.document.getElementById("dwarfShipYard"), null);
assert.deepEqual(visited.faults, []);

// A yard the page is really rendering is read where it lies: no draw, and nothing borrowed.
{
  const renderedYard = makeHarness({ preload: true });
  renderedYard.game.initTabs();
  const drawsBefore = renderedYard.page.yardDraws;
  const passive = renderedYard.parts.catalog();
  assert.notEqual(passive, undefined);
  assert.deepEqual(passive.types, integrated.parts.catalog().types);
  assert.deepEqual(passive.optionFor("engine", "electrokinetic"), {
    type: "engine",
    value: "electrokinetic",
    index: 6,
  });
  assert.equal(
    renderedYard.page.yardDraws,
    drawsBefore,
    "a rendered yard was redrawn for its catalogue",
  );
  assert.deepEqual(renderedYard.faults, []);
}

// ---------------------------------------------------------------------------
// Which parts the yard offers is not a question this script answers from a list.
// ---------------------------------------------------------------------------

for (const { path, text } of productionSources()) {
  assert.ok(
    !text.includes("CAPTURED_OUTER_FLEET_PARTS"),
    `${path} brought the outer-fleet part list back`,
  );
}

// Failed protection cannot grant controls or a copied catalogue from its scratch draw.
{
  const root = element("div");
  const body = element("div");
  const elsewhere = element("div");
  root.append(body, elsewhere);
  const document = createTestDocument(root);
  document.body = body;
  const host = hiddenHostElement(document, "reparentedScratch");
  const removeChild = body.removeChild.bind(body);
  body.removeChild = (node) => {
    removeChild(node);
    elsewhere.append(node);
    return node;
  };
  assert.equal(
    removeHiddenHostElement(host),
    false,
    "a connected reparented scratch host counted as removed",
  );
  elsewhere.removeChild(host.element);
  assert.equal(removeHiddenHostElement(host), true);
}

{
  const failedYard = makeHarness({ workspaceIntact: () => false });
  failedYard.capture.mountSuppression.withoutMounting(() => {
    failedYard.page.Vue.createApp({
      el: "#unchangedYardSibling",
      methods: { ping: () => 7 },
    });
  });
  const unchanged = failedYard.capture.controls.resolve("unchangedYardSibling");
  assert.equal(
    failedYard.shipyard.establish(),
    undefined,
    "a broken workspace established the yard",
  );
  assert.equal(failedYard.page.workspaceReleases, 1);
  assert.equal(failedYard.page.yardDraws, 1);
  assert.equal(
    failedYard.page.catalogStages,
    1,
    "valid options were not staged during the scratch draw",
  );
  assert.equal(
    failedYard.page.catalogCommits,
    undefined,
    "a failed pass committed its staged options",
  );
  for (const id of ["shipPlans", "mTabCivic"]) {
    const retained = failedYard.page.releasedControls.find(
      (handle) => handle.elementId === id,
    );
    assert.notEqual(retained, undefined, `the scratch draw did not bind ${id}`);
    assert.equal(failedYard.capture.controls.resolve(id), undefined);
    const method = id === "shipPlans" ? "crewText" : "swapTab";
    assert.equal(
      failedYard.capture.controls.invoke(retained, method, [0]).ok,
      false,
    );
    assert.equal(
      failedYard.capture.synthesis.invoke({ elementId: id, method, args: [0] })
        .ok,
      false,
    );
  }
  assert.equal(
    failedYard.parts.catalog(),
    undefined,
    "a failed draw committed its catalogue",
  );
  assert.equal(
    failedYard.page.yardDraws,
    1,
    "a failed catalogue bought another scratch draw",
  );
  assert.deepEqual(failedYard.capture.controls.invoke(unchanged, "ping"), {
    ok: true,
    value: 7,
  });
  // A genuine later visit rebinds both controls and offers a passive catalogue normally.
  failedYard.root.settings.civTabs = 2;
  failedYard.root.settings.govTabs = 5;
  failedYard.page.document
    .getElementById("mTabCivic")
    .append(element("div", { id: "dwarfShipYard" }));
  failedYard.page.Vue.createApp({
    el: "#mTabCivic",
    methods: failedYard.game.civicMethods,
  });
  failedYard.game.drawShipYard();
  for (const id of ["shipPlans", "mTabCivic"]) {
    const old = failedYard.page.releasedControls.find(
      (handle) => handle.elementId === id,
    );
    assert.ok(
      failedYard.capture.controls.resolve(id).generation > old.generation,
    );
  }
  assert.equal(
    failedYard.capture.controls.invoke(
      failedYard.shipyard.control(),
      "crewText",
    ).ok,
    true,
  );
  assert.equal(
    failedYard.capture.synthesis.invoke({
      elementId: "mTabCivic",
      method: "swapTab",
      args: [5],
    }).ok,
    true,
  );
  assert.notEqual(
    failedYard.parts.catalog(),
    undefined,
    "the real rendered catalogue could not recover",
  );
}

// A scratch host whose removal fails still cannot masquerade as a passive player-rendered yard.
{
  const strandedYard = makeHarness();
  const removeChild = strandedYard.page.body.removeChild;
  strandedYard.page.body.removeChild = function (child) {
    return child.id === "dwarfShipYard" ? child : removeChild.call(this, child);
  };
  assert.equal(strandedYard.shipyard.establish(), undefined);
  const strandedHost =
    strandedYard.page.document.getElementById("dwarfShipYard");
  const strandedPlans = strandedYard.page.document.getElementById("shipPlans");
  assert.notEqual(
    strandedHost,
    null,
    "the failed removal did not leave the scratch host",
  );
  assert.notEqual(
    parseShipyardPartCatalog(strandedPlans),
    undefined,
    "the scratch catalogue was not readable",
  );
  assert.equal(strandedYard.page.catalogStages, 1);
  assert.equal(strandedYard.page.catalogCommits, undefined);
  assert.equal(strandedYard.capture.controls.resolve("shipPlans"), undefined);
  assert.equal(
    strandedYard.parts.catalog(),
    undefined,
    "stranded scratch markup became passive authority",
  );
  assert.equal(
    strandedYard.costs.current(),
    undefined,
    "a cost nested inside stranded scratch markup became passive authority",
  );
  assert.equal(strandedYard.page.yardDraws, 1);

  strandedYard.page.body.removeChild = removeChild;
  strandedYard.page.body.removeChild(strandedHost);
  strandedYard.root.settings.civTabs = 2;
  strandedYard.root.settings.govTabs = 5;
  strandedYard.page.document
    .getElementById("mTabCivic")
    .append(element("div", { id: "dwarfShipYard" }));
  strandedYard.game.drawShipYard();
  assert.notEqual(
    strandedYard.parts.catalog(),
    undefined,
    "a real rendered yard did not recover",
  );
}

// A rejected drawShips pass rejects the entire newly-bound list, including siblings.
{
  let intact = true;
  const first = makeShip({ name: "Failed row" });
  const sibling = makeShip({ name: "Failed sibling" });
  const failedRows = makeHarness({
    establish: true,
    workspaceIntact: () => intact,
  });
  failedRows.root.space.shipyard.ships.push(first, sibling);
  intact = false;
  const settingsBefore = { ...failedRows.root.settings };
  const viewBeforeFailure = structuredClone(failedRows.game.shipyardView());
  assert.equal(
    failedRows.shipyard.captureRow(first),
    undefined,
    "a broken workspace returned a row",
  );
  for (const id of ["shipReg0", "shipReg1"]) {
    const retained = failedRows.page.releasedControls.find(
      (handle) => handle.elementId === id,
    );
    assert.notEqual(retained, undefined);
    assert.equal(failedRows.capture.controls.resolve(id), undefined);
    assert.equal(
      failedRows.capture.controls.invoke(retained, "show", [0]).ok,
      false,
    );
    assert.equal(
      failedRows.capture.synthesis.invoke({
        elementId: id,
        method: "show",
        args: [0],
      }).ok,
      false,
    );
  }
  assert.equal(failedRows.shipyard.rowFor(first), undefined);
  assert.equal(failedRows.shipyard.rowFor(sibling), undefined);
  assert.notDeepEqual(
    failedRows.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
    { kind: "launched" },
  );
  assert.deepEqual(sentTo(failedRows.page), []);
  assert.deepEqual(failedRows.root.settings, settingsBefore);
  assert.deepEqual(failedRows.game.shipyardView(), viewBeforeFailure);
  assert.equal(failedRows.page.document.getElementById("shipList"), null);
  // The player later draws the real list, whose newer generations are authoritative.
  intact = true;
  failedRows.root.settings.civTabs = 2;
  failedRows.root.settings.govTabs = 5;
  failedRows.page.document
    .getElementById("mTabCivic")
    .append(element("div", { id: "dwarfShipYard" }));
  failedRows.game.drawShipYard();
  assert.notEqual(failedRows.capture.controls.resolve("shipReg0"), undefined);
  assert.notEqual(failedRows.capture.controls.resolve("shipReg1"), undefined);
  assert.deepEqual(
    failedRows.dispatch.dispatchShipyardShip({ index: 0, region: "spc_red" }),
    { kind: "launched" },
  );
}

// Repository-owned DOM + real discovery/workspace preserve the player's view for active and inactive reads.
for (const syndicateRendered of [true, false]) {
  const protectedSyndicate = makeHarness({ syndicateRendered });
  const { page, root, syndicate } = protectedSyndicate;
  const playerNode = page.document.getElementById("mTabCivil");
  const playerMarkup = playerNode.innerHTML;
  const playerTabs = { ...root.settings };
  const result = syndicate.read("spc_red");
  assert.equal(result.kind, "value");
  if (!syndicateRendered) assert.deepEqual(result.value, { p: 1, s: 0 });
  assert.equal(page.document.getElementById("mTabCivil"), playerNode);
  assert.equal(playerNode.innerHTML, playerMarkup);
  assert.deepEqual(root.settings, playerTabs);
  assert.equal(page.document.getElementById("spc_red"), null);
  assert.equal(page.document.getElementById("spc_redsynd"), null);
  assert.equal(page.document.getElementById("ea-aside-mTabCivil"), null);
  assert.equal(page.document.getElementById("ea-aside-city"), null);
}

console.log("Captured outer-fleet synthetic capture checks passed");
