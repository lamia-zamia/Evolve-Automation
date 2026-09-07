import assert from "node:assert/strict";

import { createGameDrawnActionsReader } from "../src/adapters/browser/game-drawn-actions.ts";
import { createCapturedTechCatalog } from "../src/adapters/evolve/progression/research/captured-tech-catalog.ts";
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
function element(id, prices = {}, extraAttributes = {}) {
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
    attributes: attributesOf({ class: "action", "data-v-app": "" }),
    querySelectorAll: () => [button],
  };
}

function documentOf(elements) {
  return { querySelectorAll: () => elements };
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
function makePage({ offered = [[]], generations = {} } = {}) {
  const root = { tech: { primitive: 3 }, settings: { civTabs: 4 } };
  const passes = [];
  const panelChecks = [];
  const discards = [];
  let drawn = [];
  let failure;

  const discovery = {
    discover(path, options = {}) {
      passes.push(path.map((step) => [step.setting, step.control, step.index]));
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
  const catalog = createCapturedTechCatalog({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery,
    drawnActions: createGameDrawnActionsReader({
      getDocument: () => documentOf(drawn),
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
        element("tech-theology", { Knowledge: 900 }),
        element("tech-mining", { Knowledge: 6600 }),
      ],
      [element("tech-smelting", { Knowledge: 9000 })],
    ],
    generations: { "tech-theology": 4, "tech-mining": 1 },
  });

  const first = page.catalog.readOffered();
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
  const second = page.catalog.readOffered();
  assert.deepEqual(
    second.map((tech) => tech.elementId),
    ["tech-smelting"],
  );
  assert.equal(page.passes.length, 2);
}

{
  // The already-granted half of the panel is never read, so the pass is told to drop its container
  // the moment the game has made it — which is when it binds the component between the two.
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  page.catalog.readOffered();
  assert.deepEqual(page.discards, [
    { afterBinding: "#resContent", containers: ["oldTech"] },
  ]);
}

{
  // An action the game drew but never bound a control for is offered at generation 0, which no
  // live control can match.
  const page = makePage({
    offered: [[element("tech-a", { Knowledge: 1 })]],
    generations: {},
  });
  assert.equal(page.catalog.readOffered()[0].generation, 0);
}

{
  // The pass is given a way to tell whether the Research panel is already there, so it can skip
  // drawing one the player is looking at.
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  assert.deepEqual(page.panelChecks, []);
  page.catalog.readOffered();
  assert.deepEqual(page.panelChecks, [false]);
  // Once the panel has been drawn, the same check answers true on the next read.
  page.catalog.readOffered();
  assert.deepEqual(page.panelChecks, [false, true]);
}

{
  // A pass that failed leaves no catalog at all. Answering from the previous offer set would spend
  // on a technology the game may already have granted.
  const page = makePage({ offered: [[element("tech-a", { Knowledge: 1 })]] });
  assert.equal(page.catalog.readOffered().length, 1);
  page.fail({
    status: "rejected",
    failure: { code: "tab-control-missing", message: "no captured control" },
  });
  assert.equal(page.catalog.readOffered(), undefined);
  assert.deepEqual(page.reasons, ["no captured control"]);
}

{
  // The game drew the panel and there was nothing in it: an empty offer set is a real answer, not
  // a failure.
  const page = makePage({ offered: [[]] });
  assert.deepEqual(page.catalog.readOffered(), []);
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
  assert.equal(catalog.readOffered(), undefined);
}

console.log("captured-tech-catalog ok");
