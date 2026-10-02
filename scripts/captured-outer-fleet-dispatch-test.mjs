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
import { createCapturedOuterFleetCosts } from "../src/adapters/evolve/combat/captured-outer-fleet-costs.ts";
import { createCapturedFleetDemand } from "../src/adapters/evolve/combat/captured-fleet-demand.ts";
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
      page.setValWrites.push([b, v]);
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
      // A design the yard cannot pay queues the order instead of building, which is the whole point
      // of the cost row's marking and why readiness has to ask the yard rather than assume.
      const pool = actionPool(shipyardPayer());
      const affordable = Object.entries(shipCosts(yard.blueprint)).every(
        ([resourceId, amount]) => poolHeld(resourceId, pool) >= amount,
      );
      page.buildCount = (page.buildCount ?? 0) + 1;
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
      return;
    }
    if (settings.civTabs === 2) loadCivicTab();
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
    initTabs,
    mainMethods,
    civicMethods,
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
  /** Ships already in the yard, so a draw during `establish` binds their rows. */
  ships = [],
  establish = false,
} = {}) {
  for (const ship of ships) root.space.shipyard.ships.push(ship);
  const page = makePage();
  page.builtShips = [];
  page.builds = [];
  page.setValWrites = [];
  page.globalSupply = false;
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
  const costs = createCapturedOuterFleetCosts({
    rootState: { readRoot: () => root },
    controls: capture.controls,
    panels,
    mountSuppression: capture.mountSuppression,
    getDocument: () => page.document,
    onCaptureError: (detail) => faults.push(detail),
  });
  if (establish) shipyard.establish();
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
    dispatch,
    costs,
    panels,
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

const integrated = makeHarness({ establish: true });
const effectiveSettings = Object.create(HARNESS_SETTINGS);
const outerControl = createCapturedOuterFleetControl({
  rootState: { readRoot: () => integrated.root },
  controls: integrated.capture.controls,
  costs: integrated.costs,
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
  integrated.costs.price(fighterDesign),
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
const explorer = integrated.costs.price({ class: "explorer", weapon: "laser" });
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
// build uses and the only order that can be priced for the ship that would actually be built.
assert.deepEqual(
  explorer,
  gameSample(integrated, {
    ...beforeExplor,
    class: "explorer",
    weapon: "laser",
    engine: "emdrive",
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
const freighter = integrated.costs.price({ class: "freighter" });
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

// A `setVal` the game throws out — or takes without applying — is its own refusal, not a capture
// fault: the probe is refused rather than pricing a design the yard never held, the blueprint is
// still the player's, and no scratch element survives it.
for (const [knob, candidate] of [
  ["setValThrows", { class: "frigate", weapon: "laser" }],
  ["setValRefuses", { class: "frigate", weapon: "laser" }],
]) {
  const stubborn = makeHarness({ establish: true });
  const before = { ...stubborn.root.space.shipyard.blueprint };
  stubborn.page[knob] = "class";
  assert.equal(
    stubborn.costs.price(candidate),
    undefined,
    `a ${knob} did not fail the probe closed`,
  );
  assert.deepEqual(stubborn.root.space.shipyard.blueprint, before);
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
    idle.costs.price(fighterDesign),
    gameSample(idle, pristineBlueprint),
  );
  assert.deepEqual(idle.root.space.shipyard.blueprint, pristineBlueprint);
  assert.equal(idle.page.refusedWrites, 1);
}

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
const ownedControl = createCapturedOuterFleetControl({
  rootState: { readRoot: () => owned.root },
  controls: owned.capture.controls,
  costs: owned.costs,
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
const preloadControl = createCapturedOuterFleetControl({
  rootState: { readRoot: () => preload.root },
  controls: preload.capture.controls,
  costs: preload.costs,
  dispatch: preload.dispatch,
  readSettings: () => preloadSettings,
});
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
    preload.costs.price({ ...preload.root.space.shipyard.blueprint }),
    gameSample(preload, preload.root.space.shipyard.blueprint),
  );
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
  const pricedDesign = drafts.costs.price({
    class: "frigate",
    power: "fusion",
    weapon: "plasma",
    armor: "alloy",
    engine: "tie",
    sensor: "lidar",
  });
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

console.log("Captured outer-fleet synthetic capture checks passed");
