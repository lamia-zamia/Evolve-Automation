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
 * A stand-in for the page: a tech bag whose signature drives refreshes, and a discovery pass that
 * draws the next offer set in `offered` and counts how often it ran. The last entry repeats, so a
 * cached read that draws nothing is visible as a pass that never happened.
 */
function makePage({ tech = { primitive: 3 }, offered = [[]] } = {}) {
  const root = { tech, settings: { civTabs: 4, animated: true } };
  const passes = [];
  let drawn = [];
  let failure;

  const discovery = {
    discover(path, whileDrawn) {
      passes.push(path.map((step) => [step.setting, step.control, step.index]));
      if (failure !== undefined) {
        return { outcome: failure, discovered: [] };
      }
      drawn = offered[Math.min(passes.length - 1, offered.length - 1)] ?? [];
      if (whileDrawn !== undefined) whileDrawn();
      return { outcome: { status: "succeeded" }, discovered: [] };
    },
  };

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
    onUnavailable: (reason) => reasons.push(reason),
  });

  const reasons = [];
  return {
    root,
    catalog,
    passes,
    reasons,
    fail(outcome) {
      failure = outcome;
    },
  };
}

{
  const page = makePage({
    tech: { primitive: 3 },
    offered: [
      [
        element("tech-theology", { Knowledge: 900 }),
        element("tech-mining", { Knowledge: 6600 }),
      ],
      [element("tech-smelting", { Knowledge: 9000 })],
    ],
  });

  const first = page.catalog.readOffered();
  assert.deepEqual(
    first.map((tech) => tech.elementId),
    ["tech-theology", "tech-mining"],
  );
  assert.deepEqual(first[0].cost, { Knowledge: 900 });
  // The path is the Research tab, with no sub-tab step.
  assert.deepEqual(page.passes, [[[MAIN_TAB_SETTING, MAIN_TAB_CONTROL, 3]]]);

  // Nothing granted: the cached catalog answers and the panel is not drawn again.
  assert.equal(page.catalog.readOffered(), first);
  assert.equal(page.passes.length, 1);

  // A grant changes the offered set, so the next read draws again.
  page.root.tech.mining = 1;
  const second = page.catalog.readOffered();
  assert.deepEqual(
    second.map((tech) => tech.elementId),
    ["tech-smelting"],
  );
  assert.equal(page.passes.length, 2);
}

{
  // A level rising on a tech already held is a grant too.
  const page = makePage({
    tech: { primitive: 3 },
    offered: [
      [element("tech-a", { Knowledge: 1 })],
      [element("tech-b", { Knowledge: 2 })],
    ],
  });
  assert.equal(page.catalog.readOffered()[0].elementId, "tech-a");
  page.root.tech.primitive = 4;
  assert.equal(page.catalog.readOffered()[0].elementId, "tech-b");
  assert.equal(page.passes.length, 2);
}

{
  // A reset empties the tech bag, which the signature notices.
  const page = makePage({
    tech: { primitive: 3 },
    offered: [
      [element("tech-a", { Knowledge: 1 })],
      [element("tech-club", { Knowledge: 5 })],
    ],
  });
  assert.equal(page.catalog.readOffered()[0].elementId, "tech-a");
  delete page.root.tech.primitive;
  assert.equal(page.catalog.readOffered()[0].elementId, "tech-club");
}

{
  // A pass that failed leaves no catalog at all. Answering from the previous offer set would spend
  // on a technology the game may already have granted.
  const page = makePage({
    tech: { primitive: 3 },
    offered: [[element("tech-a", { Knowledge: 1 })]],
  });
  assert.equal(page.catalog.readOffered().length, 1);
  page.root.tech.mining = 1;
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
  const page = makePage({ tech: { primitive: 3 }, offered: [[]] });
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
    drawnActions: { read: () => [] },
  });
  assert.equal(catalog.readOffered(), undefined);
}

console.log("captured-tech-catalog ok");
