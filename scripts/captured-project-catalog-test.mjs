import assert from "node:assert/strict";

import { createGameDrawnProjectsReader } from "../src/adapters/browser/game-drawn-projects.ts";
import { createCapturedProjectCatalog } from "../src/adapters/evolve/progression/research/captured-project-catalog.ts";
import { createCapturedTriggers } from "../src/adapters/evolve/progression/build/captured-triggers.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
} from "../src/adapters/evolve/captured-tab-discovery.ts";

function attributesOf(attributes) {
  return Object.entries(attributes).map(([name, value]) => ({
    name,
    value: String(value),
  }));
}

function makeProjectDocument(projects, { existingPopper = false } = {}) {
  let popper = existingPopper
    ? { attributes: [], querySelectorAll: () => [] }
    : undefined;
  let events = 0;
  const rows = projects.map(({ id, cost }) => {
    const button = {
      dispatchEvent(event) {
        events++;
        if (event.type === "mouseover") {
          popper = {
            attributes: [],
            querySelectorAll: () => [
              {
                attributes: attributesOf(
                  Object.fromEntries(
                    Object.entries(cost).map(([resource, amount]) => [
                      `data-${resource.toLowerCase()}`,
                      amount,
                    ]),
                  ),
                ),
              },
            ],
          };
        } else {
          popper = undefined;
        }
        return true;
      },
    };
    return {
      id: `arpa${id}`,
      querySelector: () => button,
    };
  });
  const document = {
    querySelectorAll(selector) {
      if (selector === "#popper") return popper === undefined ? [] : [popper];
      if (selector === "#arpaPhysics .arpaProject") return rows;
      if (selector === "#arpaPhysics") return [{}];
      return [];
    },
  };
  return {
    document,
    events: () => events,
    hasPopper: () => popper !== undefined,
  };
}

const mouseEvent = (type) => ({ type });

{
  const page = makeProjectDocument([
    { id: "lhc", cost: { Money: 26250, Helium_3: 126 } },
    { id: "stock_exchange", cost: { Plywood: 265, Wrought_Iron: 106 } },
  ]);
  const reader = createGameDrawnProjectsReader({
    getDocument: () => page.document,
    createMouseEvent: mouseEvent,
  });
  assert.deepEqual(
    reader.read("#arpaPhysics .arpaProject", [
      "Money",
      "Helium_3",
      "Plywood",
      "Wrought_Iron",
    ]),
    [
      {
        elementId: "arpalhc",
        projectId: "lhc",
        cost: { Money: 26250, Helium_3: 126 },
      },
      {
        elementId: "arpastock_exchange",
        projectId: "stock_exchange",
        cost: { Plywood: 265, Wrought_Iron: 106 },
      },
    ],
  );
  assert.equal(page.events(), 4);
  assert.equal(page.hasPopper(), false);
  assert.equal(reader.exists("#arpaPhysics"), true);
}

{
  const page = makeProjectDocument([{ id: "lhc", cost: { Money: 1 } }], {
    existingPopper: true,
  });
  const reader = createGameDrawnProjectsReader({
    getDocument: () => page.document,
    createMouseEvent: mouseEvent,
  });
  assert.equal(reader.read("#arpaPhysics .arpaProject", ["Money"]), undefined);
  assert.equal(page.events(), 0, "the player's popover is not replaced");
}

{
  const page = makeProjectDocument([{ id: "lhc", cost: {} }]);
  const reader = createGameDrawnProjectsReader({
    getDocument: () => page.document,
    createMouseEvent: mouseEvent,
  });
  assert.equal(reader.read("#arpaPhysics .arpaProject", ["Money"]), undefined);
  assert.equal(
    page.hasPopper(),
    false,
    "a rejected sample still closes its popover",
  );
}

function makeCatalogPage({ projects = [], generations = {} } = {}) {
  const root = {
    settings: { civTabs: 4 },
    resource: { Money: { amount: 1 }, Knowledge: { amount: 1 } },
    arpa: Object.fromEntries(
      projects.map((project) => [
        project.projectId,
        { rank: project.rank, complete: project.progress },
      ]),
    ),
  };
  const paths = [];
  const panelChecks = [];
  const reasons = [];
  let unavailable = false;
  let failure;
  const catalog = createCapturedProjectCatalog({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover(path, options = {}) {
        paths.push(
          path.map((step) => [step.setting, step.control, step.index]),
        );
        panelChecks.push(options.isPanelDrawn?.());
        if (failure !== undefined) return { outcome: failure, discovered: [] };
        options.whileDrawn?.();
        return { outcome: { status: "succeeded" }, discovered: [] };
      },
    },
    drawnProjects: {
      exists: () => true,
      read: (_selector, resourceNames) => {
        assert.deepEqual(resourceNames, ["Money", "Knowledge"]);
        return unavailable
          ? undefined
          : projects.map((project) => ({
              elementId: project.elementId,
              projectId: project.projectId,
              cost: project.cost,
            }));
      },
    },
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
    catalog,
    paths,
    panelChecks,
    reasons,
    unavailable: () => {
      unavailable = true;
    },
    fail: (outcome) => {
      failure = outcome;
    },
  };
}

{
  const page = makeCatalogPage({
    projects: [
      {
        elementId: "arpalhc",
        projectId: "lhc",
        rank: 2,
        progress: 35,
        cost: { Money: 10, Knowledge: 5 },
      },
    ],
    generations: { arpalhc: 7 },
  });
  assert.deepEqual(page.catalog.readProjects(), [
    {
      elementId: "arpalhc",
      projectId: "lhc",
      rank: 2,
      progress: 35,
      cost: { Money: 10, Knowledge: 5 },
      generation: 7,
    },
  ]);
  assert.deepEqual(page.paths, [[[MAIN_TAB_SETTING, MAIN_TAB_CONTROL, 5]]]);
  assert.deepEqual(page.panelChecks, [true]);
}

{
  const page = makeCatalogPage();
  assert.deepEqual(
    page.catalog.readProjects(),
    [],
    "no available project is a valid catalog",
  );
  page.unavailable();
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.reasons, [
    "the project panel could not supply exact costs",
  ]);
  page.fail({
    status: "rejected",
    failure: { code: "tab-control-missing", message: "no captured control" },
  });
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.reasons, [
    "the project panel could not supply exact costs",
    "no captured control",
  ]);
}

{
  const reasons = [];
  const catalog = createCapturedProjectCatalog({
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: { discover: () => assert.fail("must not draw without a root") },
    drawnProjects: { read: () => [], exists: () => false },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    onUnavailable: (reason) => reasons.push(reason),
  });
  assert.equal(catalog.readProjects(), undefined);
  assert.deepEqual(reasons, ["the game root has not been captured yet"]);
}

// A `ProjectUnlocked` condition is answered by the rows this panel actually drew, through the
// real drawn-projects reader and the real catalog: panel membership is the whole answer.
{
  const page = makeProjectDocument([
    { id: "lhc", cost: { Money: 26250 } },
    { id: "stock_exchange", cost: { Money: 1500 } },
  ]);
  const root = {
    city: { mine: { count: 0 }, apartment: { count: 0 } },
    arpa: {
      lhc: { rank: 0, complete: 10 },
      stock_exchange: { rank: 1, complete: 0 },
    },
    resource: { Money: { amount: 500000, max: 1000000, display: true } },
  };
  const BUILD_COSTS = {
    "city-apartment": { Money: 875 },
    "city-mine": { Money: 60 },
  };
  const catalog = createCapturedProjectCatalog({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover(_path, options = {}) {
        options.whileDrawn?.();
        return { outcome: { status: "succeeded" }, discovered: [] };
      },
    },
    drawnProjects: createGameDrawnProjectsReader({
      getDocument: () => page.document,
      createMouseEvent: mouseEvent,
    }),
    controls: {
      resolve: (elementId) => ({ elementId, generation: 1, methods: [] }),
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
  });
  const projectTrigger = (requirementId, requirementCount, actionId) => ({
    seq: 0,
    priority: 0,
    requirementType: "ProjectUnlocked",
    requirementId,
    requirementCount,
    actionType: "build",
    actionId,
    actionCount: 1,
  });
  const triggersFor = (rows) =>
    createCapturedTriggers({
      rootState: { readRoot: () => root },
      controls: {
        resolve: (elementId) =>
          elementId in BUILD_COSTS
            ? { elementId, generation: 1, methods: [] }
            : undefined,
        invoke: () => ({ ok: true, value: undefined }),
        capturedElementIds: () => Object.keys(BUILD_COSTS),
      },
      costs: { readCost: (actionId) => BUILD_COSTS[actionId] },
      readSettings: () => ({ autoTrigger: true, triggers: rows }),
      readOfferedProjects: () => catalog.readProjects(),
    });

  // A project the panel drew is unlocked.
  assert.deepEqual(
    triggersFor([projectTrigger("arpalhc", 1, "city-apartment")]).read(),
    [
      {
        actionId: "city-apartment",
        actionType: "build",
        cost: BUILD_COSTS["city-apartment"],
      },
    ],
  );
  // One it did not draw is not, so the condition fails rather than going unanswered — which a
  // condition asking for the project to be absent proves, since an unanswered one would drop.
  assert.deepEqual(
    triggersFor([projectTrigger("arpamonument", 1, "city-mine")]).read(),
    [],
  );
  assert.deepEqual(
    triggersFor([projectTrigger("arpamonument", 0, "city-mine")]).read(),
    [
      {
        actionId: "city-mine",
        actionType: "build",
        cost: BUILD_COSTS["city-mine"],
      },
    ],
  );
  // The panel is left as it was found: every hover is undone.
  assert.equal(page.hasPopper(), false);
}

console.log("captured-project-catalog ok");
