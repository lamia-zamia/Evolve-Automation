import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { createGameDrawnActionsReader } from "../src/adapters/browser/game-drawn-actions.ts";
import { createCapturedTechCatalog } from "../src/adapters/evolve/progression/research/captured-tech-catalog.ts";
import { installCapturedGameMechanics } from "../src/adapters/evolve/captured-game-mechanics.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
} from "../src/adapters/evolve/captured-tab-discovery.ts";

// --- reading what the game drew --------------------------------------------

function attributesOf(attributes) {
  return Object.entries(attributes).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}

/**
 * An element the way the game renders and the browser then reports one: the id on an outer wrapper
 * carrying Vue’s own `data-v-app` marker, and inside it a button whose classes keep each
 * resource’s real spelling while its price attributes have been lower-cased by the HTML parser.
 */
function element(id, prices = {}, extraAttributes = {}, unavailable = false) {
  const classes = ["button", "is-dark"];
  const data = {};
  for (const [resource, amount] of Object.entries(prices)) {
    classes.push(`res-${resource}`);
    data[`data-${resource.toLowerCase()}`] = String(amount);
  }
  const button = {
    attributes: attributesOf({
      class: classes.join(" "),
      ...data,
      ...extraAttributes,
    }),
  };
  return {
    id,
    attributes: attributesOf({
      class: unavailable ? "action cna cnam" : "action",
      "data-v-app": "",
    }),
    querySelectorAll: () => [button],
  };
}

function documentOf(elements, bySelector = {}) {
  return {
    querySelectorAll: (selector) => bySelector[selector] ?? elements,
  };
}

function mechanicsForActionIds(actionIds) {
  const ids = [...new Set(actionIds)];
  if (ids.length === 0) ids.push("tech-unused");
  const definitions = Object.freeze(
    ids.map((actionId) => {
      const registryKey = actionId.slice("tech-".length);
      return Object.freeze({
        registryKey,
        actionId,
        grantTechnology: registryKey,
        grantLevel: 1,
      });
    }),
  );
  return Object.freeze({
    captureTechDefinitionsDuring: (draw) => draw(),
    readTechDefinitions: () => definitions,
  });
}

{
  const reader = createGameDrawnActionsReader({
    getDocument: () =>
      documentOf([
        element("tech-mining", { Knowledge: 6600 }),
        // The browser lower-cases `data-Helium_3`, so the capitalised name has to come from the
        // class the game writes alongside it.
        element("tech-oil_well", { Knowledge: 18000, Helium_3: 500 }),
        // A prediction’s unmet requirement has no paired class and is not a price.
        element(
          "tech-theology",
          { Knowledge: 900 },
          { "data-req-primitive": "3" },
        ),
        element("tech-free", {}),
      ]),
  });
  const actions = reader.read("#tech .action");
  assert.deepEqual(
    actions.map((action) => action.id),
    ["tech-mining", "tech-oil_well", "tech-theology", "tech-free"],
  );
  assert.deepEqual(actions[1].cost, { Knowledge: 18000, Helium_3: 500 });
  assert.deepEqual(actions[2].cost, { Knowledge: 900 });
  // Vue’s own mount marker has no paired class either.
  assert.deepEqual(actions[3].cost, {});
  assert.equal(actions[3].nativeAffordable, true);
}

{
  const reader = createGameDrawnActionsReader({
    getDocument: () =>
      documentOf([
        element("tech-unification2", {}, {}, true),
        element("tech-theology", { Knowledge: 900 }),
      ]),
  });
  const actions = reader.read("#tech .action");
  assert.deepEqual(
    actions.map((action) => action.nativeAffordable),
    [false, true],
  );
}

{
  // An element with no id names nothing a caller could act on, and a class with no amount, an
  // unparseable amount, or a zero is not a price.
  const reader = createGameDrawnActionsReader({
    getDocument: () =>
      documentOf([
        element("", { Knowledge: 10 }),
        { attributes: [] },
        element("tech-x", { Knowledge: "lots", Money: 5, Food: 0 }),
      ]),
  });
  const actions = reader.read("#tech .action");
  assert.deepEqual(
    actions.map((action) => action.id),
    ["tech-x"],
  );
  assert.deepEqual(actions[0].cost, { Money: 5 });
}

// --- the catalog -----------------------------------------------------------

/**
 * A stand-in for the page: a discovery pass that draws the next offer set in `offered` and records
 * how often it ran and what it was asked. The last entry repeats, so a read that skipped the draw
 * shows up as a pass that never happened.
 */
function makePage({
  offered = [[]],
  granted = [],
  generations = {},
  mechanics = undefined,
} = {}) {
  const root = { tech: { primitive: 3 }, settings: { civTabs: 4 } };
  const passes = [];
  const panelChecks = [];
  const discards = [];
  const forceDraws = [];
  let drawn = [];
  let failure;

  const discovery = {
    discover(path, options = {}) {
      passes.push(path.map((step) => [step.setting, step.control, step.index]));
      forceDraws.push(options.forceDraw === true);
      if (options.isPanelDrawn !== undefined) {
        panelChecks.push(options.isPanelDrawn());
      }
      if (options.discard !== undefined) discards.push(options.discard);
      if (failure !== undefined) {
        return { outcome: failure, discovered: [] };
      }
      drawn = offered[Math.min(passes.length - 1, offered.length - 1)] ?? [];
      if (options.whileDrawn !== undefined) options.whileDrawn();
      return { outcome: { status: "succeeded" }, discovered: [] };
    },
  };

  const reasons = [];
  const capturedMechanics =
    mechanics ??
    mechanicsForActionIds([
      ...offered.flat().map((action) => action.id),
      ...granted.map((action) => action.id),
    ]);
  const catalog = createCapturedTechCatalog({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery,
    mechanics: capturedMechanics,
    drawnActions: createGameDrawnActionsReader({
      getDocument: () =>
        documentOf(drawn, { "#oldTech .action": granted, "#tech": drawn }),
    }),
    controls: {
      resolve: (elementId) =>
        generations[elementId] === undefined
          ? undefined
          : { elementId, generation: generations[elementId], methods: [] },
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => Object.keys(generations),
    },
    onUnavailable: (reason) => reasons.push(reason),
  });

  return {
    root,
    catalog,
    passes,
    rebind: (elementId) => {
      generations[elementId] = (generations[elementId] ?? 0) + 1;
    },
    panelChecks,
    discards,
    forceDraws,
    mechanics: capturedMechanics,
    reasons,
    isDrawn: () => drawn.length > 0,
    fail(outcome) {
      failure = outcome;
    },
  };
}

{
  const page = makePage({
    offered: [
      [
        element("tech-unification2", {}, {}, true),
        element("tech-theology", { Knowledge: 900 }),
      ],
    ],
    generations: { "tech-unification2": 1, "tech-theology": 1 },
  });
  assert.deepEqual(
    page.catalog.read().offered.map((tech) => ({
      id: tech.elementId,
      cost: tech.cost,
      nativeAffordable: tech.nativeAffordable,
    })),
    [
      { id: "tech-unification2", cost: {}, nativeAffordable: false },
      { id: "tech-theology", cost: { Knowledge: 900 }, nativeAffordable: true },
    ],
  );
}

{
  const page = makePage({
    offered: [
      [
        element("tech-theology", { Knowledge: 900 }),
        element("tech-mining", { Knowledge: 6600 }),
      ],
      [element("tech-smelting", { Knowledge: 9000 })],
    ],
    generations: { "tech-theology": 4, "tech-mining": 1 },
  });

  const first = page.catalog.read().offered;
  assert.deepEqual(
    first.map((tech) => tech.elementId),
    ["tech-theology", "tech-mining"],
  );
  assert.deepEqual(first[0].cost, { Knowledge: 900 });
  // Which binding of the control each offer belongs to.
  assert.deepEqual(
    first.map((tech) => tech.generation),
    [4, 1],
  );
  // The path is the Research tab, with no sub-tab step.
  assert.deepEqual(page.passes, [[[MAIN_TAB_SETTING, MAIN_TAB_CONTROL, 3]]]);

  // Every read asks the game again. Nothing is held across cycles, so a change no signature over
  // `global.tech` could have seen — a trait change, an arbitrary `condition()`, a redrawn panel —
  // is picked up like any other.
  const second = page.catalog.read().offered;
  assert.deepEqual(
    second.map((tech) => tech.elementId),
    ["tech-smelting"],
  );
  assert.equal(page.passes.length, 2);
}

{
  // The already-granted half of the panel is not read unless it was asked for, so the pass is told
  // to drop its container the moment the game has made it — which is when it binds the component
  // between the two.
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  page.catalog.read();
  assert.deepEqual(page.discards, [
    { afterBinding: "#resContent", containers: ["oldTech"] },
  ]);
  // Not read is not the same as nothing granted.
  assert.equal(page.catalog.read().granted, undefined);
  assert.equal(page.catalog.read({ includeGranted: false }).granted, undefined);
  assert.equal(page.discards.length, 3);
}

{
  // A pass asked for the granted set keeps the container instead and reads the ids out of it. The
  // game renders a researched entry under its own action id with no price markup.
  const page = makePage({
    offered: [[element("tech-smelting", { Knowledge: 9000 })]],
    granted: [element("tech-mining"), element("tech-theology")],
  });
  const snapshot = page.catalog.read({ includeGranted: true });
  assert.deepEqual(
    snapshot.offered.map((tech) => tech.elementId),
    ["tech-smelting"],
  );
  assert.deepEqual([...snapshot.granted], ["tech-mining", "tech-theology"]);
  // The container the other passes drop is kept, so the game fills it.
  assert.deepEqual(page.discards, []);
}

{
  // The granted half can be empty on a fresh game, which is a real answer rather than "not read".
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  const snapshot = page.catalog.read({ includeGranted: true });
  assert.deepEqual([...snapshot.granted], []);
  assert.notEqual(snapshot.granted, undefined);
}

{
  // An action the game drew but never bound a control for is offered at generation 0, which no
  // live control can match.
  const page = makePage({
    offered: [[element("tech-a", { Knowledge: 1 })]],
    generations: {},
  });
  assert.equal(page.catalog.read().offered[0].generation, 0);
}

{
  // The pass is given a way to tell whether the Research panel is already there, so it can skip
  // drawing one the player is looking at.
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  assert.deepEqual(page.panelChecks, []);
  page.catalog.read();
  assert.deepEqual(page.panelChecks, [false]);
  // Once the panel has been drawn, the same check answers true on the next read.
  page.catalog.read();
  assert.deepEqual(page.panelChecks, [false, true]);
}

{
  // A pass that failed leaves no catalog at all. Answering from the previous offer set would spend
  // on a technology the game may already have granted.
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  assert.equal(page.catalog.read().offered.length, 1);
  page.fail({
    status: "rejected",
    failure: { code: "tab-control-missing", message: "no captured control" },
  });
  assert.equal(page.catalog.read(), undefined);
  assert.deepEqual(page.reasons, ["no captured control"]);
}

{
  // Startup can sample demand before the game creates settings. That observation is simply absent;
  // it must not turn into stale offers or an error that stops other automation.
  const page = makePage();
  page.root.settings = undefined;
  page.fail({
    status: "rejected",
    failure: {
      code: "game-state-not-captured",
      message: "the game has not created its settings yet",
    },
  });
  assert.equal(page.catalog.read(), undefined);
  assert.deepEqual(page.reasons, []);
}

{
  // Settings itself can exist before the game has initialized its selected main tab.
  const page = makePage();
  page.fail({
    status: "rejected",
    failure: {
      code: "unknown-player-tab",
      message: "the game has not recorded settings.civTabs",
    },
  });
  assert.equal(page.catalog.read(), undefined);
  assert.deepEqual(page.reasons, []);
}

{
  // A discovery precondition can fail before it returns a result; that is still an unavailable
  // current catalog and must never abort demand consumers or expose a held offer.
  const reasons = [];
  const catalog = createCapturedTechCatalog({
    mechanics: mechanicsForActionIds([]),
    rootState: {
      readRoot: () => ({ tech: {}, settings: {} }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover() {
        throw new Error("the game has not recorded settings.civTabs");
      },
    },
    drawnActions: { read: () => [], exists: () => false },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    onUnavailable: (reason) => reasons.push(reason),
  });
  assert.equal(catalog.read(), undefined);
  assert.deepEqual(reasons, [
    "research offer discovery failed: Error: the game has not recorded settings.civTabs",
  ]);
}

{
  // The game drew the panel and there was nothing in it: an empty offer set is a real answer, not
  // a failure.
  const page = makePage({ offered: [[]] });
  assert.deepEqual(page.catalog.read().offered, []);
  assert.deepEqual(page.reasons, []);
}

{
  // Before the game has created its state there is nothing to draw.
  const catalog = createCapturedTechCatalog({
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover() {
        throw new Error("must not draw without a root");
      },
    },
    drawnActions: { read: () => [], exists: () => false },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
  });
  assert.equal(catalog.read(), undefined);
}

// --- restating a held snapshot ---------------------------------------------

{
  // The game rebinds an action every time it redraws the research panel, and the capture records
  // that without being asked. A snapshot held across ticks therefore goes stale in its generations
  // and nowhere else: restating re-resolves them, and draws nothing.
  const page = makePage({
    offered: [[element("tech-mining", { Knowledge: 6600 })]],
    generations: { "tech-mining": 3 },
  });
  const held = page.catalog.read();
  assert.deepEqual(
    held.offered.map((tech) => tech.generation),
    [3],
  );
  const drawsBefore = page.passes.length;

  page.rebind("tech-mining");
  const restated = page.catalog.restate(held);
  assert.equal(
    page.passes.length,
    drawsBefore,
    "restating must not draw the panel",
  );
  assert.deepEqual(
    restated.offered.map((tech) => tech.generation),
    [4],
  );
  assert.deepEqual(
    restated.offered.map((tech) => tech.cost),
    held.offered.map((tech) => tech.cost),
    "the price came from the draw and is carried through untouched",
  );
  assert.equal(
    held.offered[0].generation,
    3,
    "the held snapshot is not mutated",
  );

  // A control the game has since dropped resolves to nothing, which is generation 0 — the same
  // answer a draw would have given for an action bound to no control.
  const forgotten = createCapturedTechCatalog({
    mechanics: mechanicsForActionIds([]),
    rootState: {
      readRoot: () => ({ settings: {} }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover() {
        throw new Error("must not draw while restating");
      },
    },
    drawnActions: { read: () => [], exists: () => false },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
  });
  assert.equal(forgotten.restate(held).offered[0].generation, 0);
}

{
  // The granted half is the larger one and costs the draw that kept it, so a restatement carries
  // it through rather than dropping it — and a snapshot that never had it must not gain one.
  const page = makePage({
    offered: [[element("tech-mining", { Knowledge: 6600 })]],
    granted: [element("tech-theology", { Knowledge: 900 })],
    generations: { "tech-mining": 1 },
  });
  const withGranted = page.catalog.read({ includeGranted: true });
  assert.deepEqual(
    [...page.catalog.restate(withGranted).granted],
    [...withGranted.granted],
  );
  const withoutGranted = page.catalog.read();
  assert.equal(withoutGranted.granted, undefined);
  assert.equal(
    "granted" in page.catalog.restate(withoutGranted),
    false,
    "absent means not read, and restating must not turn that into an empty set",
  );
}

{
  const page = runInNewContext(
    `({ Object, Map, Array, Function, Number, String, Math, Proxy })`,
  );
  const nativeObjectKeys = page.Object.keys;
  const nativeDefineProperty = page.Object.defineProperty;
  let interceptionInstallations = 0;
  page.Object.defineProperty = function (target, key, descriptor) {
    if (
      target === page.Object &&
      key === "keys" &&
      descriptor.value !== nativeObjectKeys
    ) {
      interceptionInstallations += 1;
    }
    return Reflect.apply(nativeDefineProperty, this, [target, key, descriptor]);
  };

  const registry = {
    alpha: { id: "tech-alpha", grant: ["alpha", 1] },
    beta: { id: "tech-beta", grant: ["beta", 1] },
  };
  const actions = { tech: registry };
  const root = { settings: { civTabs: 4 } };
  const mechanicsInstall = installCapturedGameMechanics(
    page,
    { subscribe: () => () => {} },
    { readRoot: () => root },
  );
  let drawnOffers = [];
  let drawnGranted = [];
  const offerPasses = [];
  const nativeOrders = [];
  const forceDraws = [];
  const unavailable = [];
  const offersByPass = [
    [element("tech-alpha", { Knowledge: 10 })],
    [element("tech-beta", { Knowledge: 20 })],
    [element("tech-gamma", { Knowledge: 30 })],
  ];
  let grantedByPass = [];
  const catalog = createCapturedTechCatalog({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    mechanics: mechanicsInstall.mechanics,
    discovery: {
      discover(_path, options = {}) {
        offerPasses.push(offerPasses.length + 1);
        forceDraws.push(options.forceDraw === true);
        page.Object.keys({ beforeDraw: true });
        const order = [];
        page.Object.keys(actions.tech).forEach((key) => order.push(key));
        nativeOrders.push(order);
        page.Object.keys({ afterDraw: true });
        drawnOffers =
          offersByPass[
            Math.min(offerPasses.length - 1, offersByPass.length - 1)
          ];
        drawnGranted = grantedByPass;
        options.whileDrawn?.();
        return { outcome: { status: "succeeded" }, discovered: [] };
      },
    },
    drawnActions: createGameDrawnActionsReader({
      getDocument: () =>
        documentOf(drawnOffers, { "#oldTech .action": drawnGranted }),
    }),
    controls: {
      resolve: (elementId) => ({ elementId, generation: 1, methods: [] }),
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    onUnavailable: (reason) => unavailable.push(reason),
  });

  assert.deepEqual(
    catalog.read().offered.map(({ elementId }) => elementId),
    ["tech-alpha"],
  );
  assert.deepEqual(
    catalog.read().offered.map(({ elementId }) => elementId),
    ["tech-beta"],
  );
  assert.equal(interceptionInstallations, 1);
  assert.equal(offerPasses.length, 2, "offer discovery still runs per read");
  assert.deepEqual(nativeOrders, [
    ["alpha", "beta"],
    ["alpha", "beta"],
  ]);
  assert.deepEqual(forceDraws, [true, false]);
  assert.equal(page.Object.keys, nativeObjectKeys);

  assert.equal(
    catalog.read(),
    undefined,
    "an unknown offered id rejects the full read",
  );
  assert.match(unavailable.at(-1), /tech-gamma/u);
  assert.equal(
    interceptionInstallations,
    1,
    "a retained registry is never recaptured",
  );
  assert.equal(offerPasses.length, 3);

  offersByPass.push([element("tech-alpha", { Knowledge: 10 })]);
  grantedByPass = [element("tech-beta")];
  const withGranted = catalog.read({ includeGranted: true });
  assert.deepEqual([...withGranted.granted], ["tech-beta"]);
  grantedByPass = [element("tech-gamma")];
  assert.equal(
    catalog.read({ includeGranted: true }),
    undefined,
    "an unknown granted id rejects the granted snapshot rather than becoming empty",
  );
  assert.match(unavailable.at(-1), /granted research tech-gamma/u);
  assert.equal(interceptionInstallations, 1);
  mechanicsInstall.uninstall();
}

{
  const definitions = [
    {
      registryKey: "alpha",
      actionId: "tech-alpha",
      grantTechnology: "alpha",
      grantLevel: 1,
    },
    {
      registryKey: "beta",
      actionId: "tech-alpha",
      grantTechnology: "beta",
      grantLevel: 1,
    },
  ];
  const page = makePage({
    offered: [[element("tech-alpha", { Knowledge: 1 })]],
    mechanics: Object.freeze({
      captureTechDefinitionsDuring: (draw) => draw(),
      readTechDefinitions: () => definitions,
    }),
  });
  assert.equal(
    page.catalog.read(),
    undefined,
    "duplicate native action ids make the complete authority unavailable",
  );
}

console.log("captured-tech-catalog ok");
