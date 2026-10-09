import { withControlCaptureAuthority } from "../../support/fixtures/control-capture-fixture.mjs";
import assert from "node:assert/strict";
import { startCapturedRuntime as startCapturedRuntimeFromSource } from "../../../src/bootstrap/captured-runtime-control.ts";
import { createGameDrawnActionsReader } from "../../../src/adapters/browser/game-drawn-actions.ts";
import {
  createTestDocument,
  element,
} from "../../support/fixtures/dom-fixture.mjs";
import { makeCapturedBuildingMechanics } from "../../support/fixtures/captured-building-test-fixtures.mjs";
import { withCapturedTechMechanicsFixture } from "../../support/fixtures/captured-tech-mechanics-fixture.mjs";

const capturedTestTechIds = [
  "tech-polymer-reserve",
  "tech-polymer-heavy",
  "tech-redrawn-after-storage",
];

function startCapturedRuntime(dependencies) {
  return startCapturedRuntimeFromSource({
    ...dependencies,
    pageCapture: withCapturedTechMechanicsFixture(
      dependencies.pageCapture,
      capturedTestTechIds,
    ),
  });
}

// Power reports a persistent exact-demand failure once and a changed authority once.
{
  const root = { settings: {}, race: { species: "human" } };
  const errors = [];
  let cycle;
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
        readProductionBreakdown: () => undefined,
      },
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-control" }),
        capturedElementIds: () => [],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({ masterScriptToggle: true, autoPower: true }),
    },
    logError: (message) => errors.push(message),
  });
  for (let i = 0; i < 5; i++) cycle({ periods: 4 });
  assert.deepEqual(
    errors.filter((message) => message.startsWith("autoPower:")),
    [
      "autoPower: captured-power-cycle-unavailable: exact demand unavailable: root resource state unavailable",
    ],
    JSON.stringify(errors),
  );
  root.resource = {};
  cycle({ periods: 4 });
  assert.equal(
    errors.filter((message) => message.startsWith("autoPower:")).length,
    2,
  );
  assert.notEqual(errors.at(-1), errors[0]);
  stop();
}

// The native chrysotile entry no longer blocks exact Power demand at managed-build preparation.
{
  const root = {
    settings: { civTabs: 3, spaceTabs: 0 },
    race: {},
    tech: {},
    city: {
      farm: { count: 0 },
      chrysotile: { count: 0 },
    },
    resource: {
      Money: { amount: 1000, max: 10000, display: true, diff: 0 },
      Polymer: { amount: 0, max: 1000, display: true, diff: 0 },
    },
  };
  const errors = [];
  const invoked = [];
  let chrysotileAvailabilityReads = 0;
  let cycle;
  const buildingMechanics = makeCapturedBuildingMechanics(root, {
    availability: (_liveRoot, binding) => {
      if (binding === "city-chrysotile") chrysotileAvailabilityReads++;
      return {
        kind: "value",
        value: binding === "city-farm" || binding === "city-chrysotile",
      };
    },
    overrides: new Map([
      [
        "city-chrysotile",
        {
          entryKey: "city:chrysotile",
          region: "city",
          sector: "city",
          struct: "chrysotile",
          actionId: "undefined-chrysotile",
        },
      ],
    ]),
  });
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: {
        ...buildingMechanics,
        readProductionBreakdown: () => undefined,
      },
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (elementId) =>
          elementId === "city-farm"
            ? {
                elementId,
                generation: 1,
                methods: ["action"],
                data: { act: root.city.farm },
              }
            : undefined,
        invoke: (handle, method) => {
          invoked.push(`${handle.elementId}.${method}`);
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["city-farm"],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: {
        available: false,
        withoutMounting: () => {
          throw new Error("Building preparation must not mount a panel");
        },
      },
      uninstall: () => {},
    },
    document: createTestDocument(element("div", { id: "runtime-root" })),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoStorage: true,
          autoPower: true,
          "batcity-farm": true,
        }),
    },
    logError: (message) => errors.push(message),
  });
  cycle({ periods: 1 });
  stop();

  const powerError = errors.find((message) => message.startsWith("autoPower:"));
  assert.ok(powerError, JSON.stringify(errors));
  assert.match(
    powerError,
    /exact demand unavailable: offered technology snapshot unavailable/,
  );
  assert.ok(chrysotileAvailabilityReads > 0);
  assert.equal(
    invoked.some((call) => call.includes("swapTab")),
    false,
    "the runtime uses retained mechanics without recurring Building discovery",
  );
}

function cityOfferDocument(id) {
  const root = element("div", { id: "runtime-root" });
  const city = element("div", { id: "city" });
  const row = element("div", { id });
  row.classList.add("action");
  city.appendChild(row);
  root.appendChild(city);
  return createTestDocument(root);
}

function applyResearchDrawnAttributes(node, values) {
  const attributes = Object.entries(values).map(([name, value]) => ({
    name,
    value: String(value),
  }));
  attributes.get = (name) =>
    attributes.find((attribute) => attribute.name === name)?.value;
  node.attributes = attributes;
}

function runDemandSampleScenario(
  settings,
  spaceEra = false,
  constructionCase = false,
  moneyAfterFirst,
) {
  const invoked = [];
  const phases = [];
  const root = {
    race: {},
    tech: { mad: spaceEra ? 1 : 0, trade: true },
    civic: {},
    settings: {
      civTabs: 3,
      spaceTabs: 0,
      marketTabs: 0,
      animated: false,
      showMarket: true,
      showResearch: true,
      showCity: constructionCase,
    },
    city: {
      farm: { count: 0 },
      ...(constructionCase ? { bank: { count: 0 } } : {}),
      market: { qty: 1, mtrade: 1, trade: 0 },
    },
    queue: { queue: [] },
    resource: {
      Money: { amount: 1000, max: 10000, display: true, diff: 0, value: 1 },
      Food: {
        amount: 0,
        max: 100,
        display: true,
        diff: 0,
        value: 1,
        trade: 0,
        stackable: true,
      },
      Polymer: {
        amount: constructionCase ? 0 : 100,
        max: 1000,
        display: true,
        diff: 0,
      },
    },
  };
  const market = root.city.market;
  const documentRoot = element("div", { id: "runtime-root" });
  documentRoot.appendChild(element("div", { id: "mTabResource" }));
  if (constructionCase) {
    const mainColumn = element("div", { id: "mainColumn" });
    const content = element("div");
    content.classList.add("content");
    const civilPanel = element("div", { id: "mTabCivil" });
    const cityPanel = element("div", { id: "city" });
    for (const id of ["city-farm", "city-bank"]) {
      const buildingRow = element("div", { id });
      buildingRow.classList.add("action");
      cityPanel.appendChild(buildingRow);
    }
    civilPanel.appendChild(cityPanel);
    content.appendChild(civilPanel);
    mainColumn.appendChild(content);
    documentRoot.appendChild(mainColumn);
  }
  const researchPanel = element("div", { id: "tech" });
  const row = element("div");
  row.classList.add("action");
  Object.defineProperty(row, "id", { value: "tech-polymer-reserve" });
  applyResearchDrawnAttributes(row, {
    id: "tech-polymer-reserve",
    class: "action",
  });
  const price = element("button");
  applyResearchDrawnAttributes(price, {
    class: "button res-Polymer",
    "data-polymer": 100,
  });
  row.appendChild(price);
  researchPanel.appendChild(row);
  documentRoot.appendChild(researchPanel);
  const document = createTestDocument(documentRoot);
  let researchCatalogReads = 0;
  const handles = new Map(
    [
      ["buildQueue", ["setData"]],
      ["city-farm", ["action"]],
      ["#mainColumn div.content", ["swapTab"]],
      ["mTabResource", ["swapTab"]],
      ...(constructionCase
        ? [
            ["city-bank", ["action"]],
            ["mTabCivil", ["swapTab"]],
          ]
        : []),
      ["market-qty", []],
      ["market-Food", ["autoBuy", "autoSell", "zero", "purchase", "sell"]],
      ["tech-polymer-reserve", ["action"]],
    ].map(([elementId, methods]) => [
      elementId,
      {
        elementId,
        generation: 1,
        methods,
        ...(elementId === "market-qty" ? { data: market } : {}),
      },
    ]),
  );
  const pageCapture = {
    isComplete: () => true,
    mechanics: makeCapturedBuildingMechanics(root, {
      availability: (_liveRoot, binding) => ({
        kind: "value",
        value: binding === "city-farm" || binding === "city-bank",
      }),
    }),
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: withControlCaptureAuthority({
      resolve: (id) => handles.get(id),
      invoke: (handle, method, args = []) => {
        invoked.push(`${handle.elementId}.${method}`);
        if (constructionCase) phases.push(`${handle.elementId}.${method}`);
        if (
          method === "swapTab" &&
          handle.elementId === "#mainColumn div.content"
        )
          root.settings.civTabs = args[0];
        if (method === "swapTab" && handle.elementId === "mTabCivil")
          root.settings.spaceTabs = args[0];
        if (method === "swapTab" && handle.elementId === "mTabResource") {
          root.settings.marketTabs = args[0];
          for (const id of ["market-qty", "market-Food"])
            handles.set(id, {
              ...handles.get(id),
              generation: handles.get(id).generation + 1,
            });
        }
        if (handle.elementId === "buildQueue" && method === "setData") {
          const id = root.queue.queue.at(-1)?.id;
          if (id === "tech-__ea_research_cost_probe__") {
            return {
              ok: true,
              value: { "data-Polymer": 100 },
            };
          }
          return {
            ok: true,
            value: constructionCase
              ? id === "city-farm"
                ? { "data-Polymer": 200 }
                : { "data-Money": 2000 }
              : { "data-Money": 10 },
          };
        }
        if (handle.elementId === "city-farm" && method === "action") {
          root.city.farm.count += 1;
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => [...handles.keys()],
    }),
    bindings(listener) {
      researchCatalogReads += 1;
      listener("tech-polymer-reserve", Object.freeze({}));
      return () => {};
    },
    keyState: { readPressed: () => false },
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        pageCaptureCycle = next;
        return () => {};
      },
    },
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
      withMountingEnabled: (draw) => draw(),
    },
    uninstall: () => {},
  };
  let pageCaptureCycle;
  const errors = [];
  const stop = startCapturedRuntime({
    pageCapture,
    document,
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoStorage: false,
          autoResearch: false,
          researchRequest: true,
          researchRequestSpace: false,
          ...settings,
        }),
      setItem: () => {},
    },
    diagnostics: constructionCase
      ? {
          readPerformanceEnabled: () => true,
          nowMs: () => 0,
          recordPerformance: (name) => phases.push(name),
          recordCount: () => {},
          flushPerformance: () => {},
        }
      : undefined,
    logError: (message) => errors.push(message),
  });
  const initialResearchCatalogReads = researchCatalogReads;
  pageCaptureCycle({ periods: 1 });
  if (constructionCase) {
    root.resource.Polymer.amount = 200;
    if (moneyAfterFirst !== undefined)
      root.resource.Money.amount = moneyAfterFirst;
    phases.push("between callbacks");
    pageCaptureCycle({ periods: 1 });
  }
  stop();
  return {
    invoked,
    phases,
    researchOfferReads: researchCatalogReads - initialResearchCatalogReads,
    errors,
    root,
  };
}

function assertDemandScenarioErrors(errors) {
  // These demand fixtures provide native offers directly; unavailable unrelated features must
  // not turn a valid demand read into a failure.
  assert.deepEqual(errors, []);
}

// The captured runtime gates its cycles on the script's own `tickRate`, which defaults to four game
// periods. These fixtures therefore deliver a four-period batch per intended cycle; the gate itself
// is exercised separately at the end of this file.

let listener;
let unsubscribeCount = 0;
let storageValue = null;
const errors = [];

const stop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: withControlCaptureAuthority({
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    }),
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        listener = next;
        return () => unsubscribeCount++;
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
    mechanics: {
      readStructures: () => undefined,
      readStructureIdentities: () => undefined,
    },
  },
  document: {},
  mouseEvent: class {},
  storage: {
    getItem() {
      return storageValue;
    },
    setItem(_key, value) {
      storageValue = value;
    },
  },
  logError: (message) => errors.push(message),
});

assert.equal(typeof listener, "function");
assert.notEqual(storageValue, null);
assert.equal(JSON.parse(storageValue).autoBuild, false);
assert.equal(JSON.parse(storageValue).autoMarket, false);

// A fresh install inherits the game's defaults: the captured runtime must not start an
// automation family merely because the script settings key is absent.
listener({ periods: 4 });
assert.deepEqual(errors, []);

storageValue = JSON.stringify({
  masterScriptToggle: false,
  autoResearch: true,
});
listener({ periods: 4 });
assert.deepEqual(errors, []);

stop();
assert.equal(unsubscribeCount, 1);

// A genuinely empty profile is normalized by the production runtime before its first consumer
// runs. A second runtime then proves that the captured market row uses those persisted settings.
{
  const invoked = [];
  const root = {
    race: {},
    tech: { trade: true, currency: 0 },
    civic: {},
    settings: { showMarket: true, civTabs: 1, marketTabs: 0, animated: false },
    city: { market: { qty: 1, mtrade: 1, trade: 0 } },
    resource: {
      Money: { amount: 1000, max: 10000, display: true, diff: 0, value: 1 },
      Food: {
        amount: 0,
        max: 100,
        display: true,
        diff: 0,
        value: 1,
        trade: 0,
        stackable: true,
      },
    },
  };
  const market = root.city.market;
  const handles = new Map([
    [
      "#mainColumn div.content",
      {
        elementId: "#mainColumn div.content",
        generation: 1,
        methods: ["swapTab"],
      },
    ],
    [
      "mTabResource",
      { elementId: "mTabResource", generation: 1, methods: ["swapTab"] },
    ],
    [
      "market-qty",
      {
        elementId: "market-qty",
        generation: 1,
        methods: [],
        data: market,
      },
    ],
    [
      "market-Food",
      {
        elementId: "market-Food",
        generation: 1,
        methods: ["autoBuy", "autoSell", "zero", "purchase", "sell"],
      },
    ],
  ]);
  let cycle;
  const persisted = new Map();
  const marketDocumentRoot = element("div", { id: "runtime-root" });
  marketDocumentRoot.appendChild(element("div", { id: "mTabResource" }));
  const marketDocument = createTestDocument(marketDocumentRoot);
  const pageCapture = {
    isComplete: () => true,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: withControlCaptureAuthority({
      resolve: (id) => handles.get(id),
      invoke: (handle, method, args = []) => {
        invoked.push(`${handle.elementId}.${method}`);
        if (
          method === "swapTab" &&
          handle.elementId === "#mainColumn div.content"
        )
          root.settings.civTabs = args[0];
        if (method === "swapTab" && handle.elementId === "mTabResource") {
          root.settings.marketTabs = args[0];
          for (const id of ["market-qty", "market-Food"])
            handles.set(id, {
              ...handles.get(id),
              generation: handles.get(id).generation + 1,
            });
        }
        const resourceId = args[0];
        if (method === "purchase" && resourceId === "Food") {
          const quantity = market.qty;
          root.resource.Food.amount += quantity;
          root.resource.Money.amount -= quantity * root.resource.Food.value;
        }
        if (method === "sell" && resourceId === "Food") {
          const quantity = market.qty;
          root.resource.Food.amount -= quantity;
          root.resource.Money.amount += quantity * root.resource.Food.value;
        }
        if (method === "autoBuy" && resourceId === "Food") {
          root.city.market.trade += 1;
          root.resource.Food.trade += 1;
        }
        if (method === "autoSell" && resourceId === "Food") {
          root.city.market.trade -= 1;
          root.resource.Food.trade -= 1;
        }
        if (method === "zero" && resourceId === "Food") {
          root.city.market.trade -= root.resource.Food.trade;
          root.resource.Food.trade = 0;
        }
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => [...handles.keys()],
    }),
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        cycle = next;
        return () => {};
      },
    },
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
      withMountingEnabled: (draw) => draw(),
    },
    uninstall: () => {},
    mechanics: {
      readStructures: () => undefined,
      readStructureIdentities: () => undefined,
    },
  };
  const firstStop = startCapturedRuntime({
    pageCapture,
    document: marketDocument,
    mouseEvent: class {},
    storage: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => {
        persisted.set(key, value);
      },
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 4 });
  firstStop();
  const fresh = JSON.parse(persisted.get("settings"));
  assert.equal(fresh.res_trade_buy_Food, true);
  assert.equal(fresh.res_storageFood, true);

  persisted.set(
    "settings",
    JSON.stringify({
      ...fresh,
      autoMarket: true,
      autoBuild: false,
      buyFood: true,
    }),
  );
  const secondStop = startCapturedRuntime({
    pageCapture,
    document: marketDocument,
    mouseEvent: class {},
    storage: {
      getItem: (key) => persisted.get(key) ?? null,
      setItem: (key, value) => {
        persisted.set(key, value);
      },
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 4 });
  secondStop();
  assert.ok(invoked.includes("market-Food.purchase"));
}

// The persisted settings must reach the construction policy: a quiet trigger phase — including a
// configured trigger whose building is not captured yet — must not suppress autoBuild.
{
  const invoked = [];
  const root = {
    race: {},
    tech: {},
    city: { cottage: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    r_queue: { display: false, pause: false, queue: [] },
    settings: { civTabs: 1, spaceTabs: 0 },
    resource: {
      Money: { amount: 0, max: 100000, display: true, diff: 0, name: "$" },
    },
  };
  const handles = new Map(
    ["#mainColumn div.content", "buildQueue", "city-cottage"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: makeCapturedBuildingMechanics(root, {
        availability: (_liveRoot, binding) => ({
          kind: "value",
          value: binding === "city-cottage",
        }),
      }),
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) => handles.get(id),
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          return method === "setData"
            ? { ok: true, value: { [`${args[1]}-Money`]: 500 } }
            : { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: cityOfferDocument("city-cottage"),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          autoTrigger: true,
          triggers: [
            {
              priority: 0,
              requirementType: "BuildingCount",
              requirementId: "city-cottage",
              requirementCount: 0,
              actionType: "build",
              actionId: "city-not-yet-unlocked",
              actionCount: 1,
            },
          ],
          "batcity-cottage": true,
          "bld_w_city-cottage": 100,
        }),
    },
    logError: () => {},
  });
  cycle({ periods: 4 });
  stopCycle();
  assert.ok(
    invoked.includes("buildQueue.setData"),
    `the construction cycle never priced the managed building: ${JSON.stringify(invoked)}`,
  );
}

// A context-dependent override must be answered by the production composition before the
// period gate and then reach the effective setting used by the construction cycle.
{
  const invoked = [];
  const errors = [];
  const root = {
    race: {},
    tech: {},
    city: { cottage: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    r_queue: { display: false, pause: false, queue: [] },
    settings: { civTabs: 1, spaceTabs: 0 },
    resource: {
      Money: { amount: 0, max: 100000, display: true, diff: 0, name: "$" },
    },
  };
  const handles = new Map(
    ["#mainColumn div.content", "buildQueue", "city-cottage"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: makeCapturedBuildingMechanics(root, {
        availability: (_liveRoot, binding) => ({
          kind: "value",
          value: binding === "city-cottage",
        }),
      }),
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) => handles.get(id),
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          return method === "setData"
            ? { ok: true, value: { [`${args[1]}-Money`]: 500 } }
            : { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: cityOfferDocument("city-cottage"),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: false,
          "batcity-cottage": true,
          bld_w_city_cottage: 100,
          overrides: {
            autoBuild: [
              {
                type1: "ResourceDemanded",
                arg1: "Money",
                type2: "Boolean",
                arg2: false,
                cmp: "==",
                ret: true,
              },
            ],
            tickRate: [
              {
                type1: "BuildingCost",
                arg1: "city-cottage.Money",
                type2: "Number",
                arg2: 1,
                cmp: ">",
                ret: 1,
              },
            ],
          },
        }),
    },
    logError: (message) => errors.push(message),
  });
  cycle({ periods: 1 });
  stopCycle();
  assert.ok(
    invoked.includes("buildQueue.setData"),
    `the ResourceDemanded override did not enable construction: ${JSON.stringify(invoked)}`,
  );
  assert.deepEqual(errors, [
    "progression unavailable: temporary component mounting cannot be suppressed",
  ]);
}

// A returned construction rejection is surfaced by the runtime phase instead of being mistaken
// for a completed autoBuild pass.
{
  const reported = [];
  const diagnostics = {
    readPerformanceEnabled: () => true,
    nowMs: () => 0,
    recordPerformance: () => {},
    recordCount: () => {},
    flushPerformance: () => {},
  };
  const diagnosticLog = [];
  const root = {
    race: {},
    tech: {},
    city: { cottage: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: { civTabs: 1, spaceTabs: 0 },
    resource: {
      Money: { amount: 1000, max: 100000, display: true, diff: 0, name: "$" },
    },
  };
  const handles = new Map(
    ["#mainColumn div.content", "buildQueue", "city-cottage"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: makeCapturedBuildingMechanics(root, {
        availability: (_liveRoot, binding) => ({
          kind: "value",
          value: binding === "city-cottage",
        }),
      }),
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) => handles.get(id),
        invoke: (_handle, method, args = []) =>
          method === "setData"
            ? { ok: true, value: { [`${args[1]}-Money`]: 10 } }
            : { ok: false, reason: "unknown-method" },
        capturedElementIds: () => [...handles.keys()],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: cityOfferDocument("city-cottage"),
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-cottage": true,
          "bld_w_city-cottage": 100,
        }),
    },
    diagnostics,
    log: (message) => diagnosticLog.push(message),
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 4 });
  stopCycle();
  assert.deepEqual(reported, [
    "progression unavailable: temporary component mounting cannot be suppressed",
    "autoBuild: build-click-failed: unknown-method",
  ]);
  assert.ok(diagnosticLog.includes("autoBuild.candidates 1"));
  assert.ok(diagnosticLog.includes("build.execute.invokeOk false"));
  assert.ok(diagnosticLog.includes("autoBuild.outcome rejected"));
}

// A city control with no matching state record is not a positive building identity, so it is
// ignored rather than reported as a skipped building candidate.
{
  const reported = [];
  const root = {
    race: {},
    tech: {},
    city: {},
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {},
  };
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-control" }),
        capturedElementIds: () => ["city-cottage"],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoBuild: true,
          "batcity-cottage": true,
        }),
    },
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 4 });
  cycle({ periods: 4 });
  stopCycle();
  assert.deepEqual(
    reported.filter((message) => message.includes("city-cottage")),
    [],
  );
}

// What the cycle is saving for is held back from the cheaper candidates that arrive after it: the
// expensive target is unaffordable, and the cheap one must not spend the money it is accumulating.
{
  const invoked = [];
  let root = {
    race: {},
    tech: {},
    stats: { days: 12, reset: 2, tdays: 30 },
    city: { bank: { count: 0 }, farm: { count: 0 } },
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: { civTabs: 1, spaceTabs: 0 },
    resource: {
      Money: { amount: 600, max: 10000, display: true, diff: 100, name: "$" },
    },
  };
  const prices = { "city-bank": 5000, "city-farm": 500 };
  const handles = new Map(
    ["buildQueue", "city-bank", "city-farm"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: ["setData", "action"] },
    ]),
  );
  const page = element("main");
  const cityPanel = element("div", { id: "city" });
  for (const id of ["city-bank", "city-farm"]) {
    const row = element("div", { id });
    row.classList.add("action");
    cityPanel.appendChild(row);
  }
  const resourcesPanel = element("div", { id: "resources" });
  const queueAnchor = element("div", { id: "buildQueue" });
  const settingsTab = element("div");
  settingsTab.classList.add("settings");
  const saveTransfer = element("div");
  saveTransfer.classList.add("importExport");
  const saveField = element("div", { id: "importExport" });
  const importText = element("textarea");
  saveField.appendChild(importText);
  saveTransfer.appendChild(saveField);
  settingsTab.appendChild(saveTransfer);
  page.appendChild(cityPanel);
  page.appendChild(resourcesPanel);
  page.appendChild(settingsTab);
  page.appendChild(queueAnchor);
  const document = createTestDocument(page);
  const stateLogLinks = [];
  const stateLogBlobs = new Map();
  let stateLogObjectUrlId = 0;
  class StateLogBlobFixture {
    constructor(parts) {
      this.parts = parts;
    }
  }
  const createFixtureElement = document.createElement;
  document.createElement = (tag) => {
    const created = createFixtureElement(tag);
    if (tag === "a") stateLogLinks.push(created);
    return created;
  };
  const stateLogSettingsHostWindow = {
    document,
    navigator: { platform: "Win32" },
    location: "https://evolve.test/",
    confirm: () => true,
    Blob: StateLogBlobFixture,
    URL: {
      createObjectURL(blob) {
        const url = `blob:planner-state-log-${++stateLogObjectUrlId}`;
        stateLogBlobs.set(url, blob);
        return url;
      },
      revokeObjectURL() {},
    },
    setTimeout: () => 1,
  };
  const stored = new Map([
    [
      "settings",
      JSON.stringify({
        masterScriptToggle: true,
        autoBuild: true,
        activeTargetsUI: true,
        buildPlannerUI: true,
        stateLogEnabled: true,
        stateLogInterval: 1,
        "batcity-bank": true,
        "bld_w_city-bank": 300,
        "batcity-farm": true,
        "bld_w_city-farm": 100,
      }),
    ],
  ]);
  let cycle;
  const rootReplacementListeners = new Set();
  const rootReplaced = () => {
    for (const listener of rootReplacementListeners) listener();
  };
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: makeCapturedBuildingMechanics(root, {
        availability: (_liveRoot, binding) => ({
          kind: "value",
          value: binding === "city-bank" || binding === "city-farm",
        }),
      }),
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: (listener) => {
          rootReplacementListeners.add(listener);
          return () => rootReplacementListeners.delete(listener);
        },
      },
      controls: withControlCaptureAuthority({
        resolve: (id) => handles.get(id),
        invoke: (handle, method, args = []) => {
          if (method === "setData") {
            const entry = root.queue.queue[args[0]];
            return {
              ok: true,
              value: { [`${args[1]}-Money`]: prices[entry.id] },
            };
          }
          invoked.push(handle.elementId);
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => [...handles.keys()],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document,
    settingsHostWindow: stateLogSettingsHostWindow,
    mouseEvent: class {},
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
    },
    logError: () => {},
  });
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 1);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);
  const activeToggle = page.querySelectorAll(".script_activeTargetsUI")[0];
  const plannerToggle = page.querySelectorAll(".script_buildPlannerUI")[0];
  activeToggle.checked = false;
  activeToggle.dispatch("change");
  plannerToggle.checked = false;
  plannerToggle.dispatch("change");
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 0);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  // The read-only order protects the expensive target even on the first cycle.
  cycle({ periods: 4 });
  assert.deepEqual(invoked, []);
  stateLogSettingsHostWindow.eaExportStateLog();
  const noUiStateLogBlob = stateLogBlobs.get(stateLogLinks.at(-1).href);
  const noUiStateLog = JSON.parse(noUiStateLogBlob.parts[0]);
  assert.equal(noUiStateLog.samples[0].construction.cycleId, 1);
  assert.equal(noUiStateLog.samples[0].construction.detailLevel, "planner");
  assert.equal(noUiStateLog.samples[0].construction.target.blocker, "income");

  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  plannerToggle.checked = true;
  plannerToggle.dispatch("change");
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p")[0]
      .textContent,
    /Waiting for a captured construction cycle/,
  );
  assert.equal(JSON.parse(stored.get("ea_planner_stats")).total, 0);
  cycle({ periods: 4 });
  const plannerRows = page
    .querySelectorAll("#ea-script-planner")[0]
    .querySelectorAll("ol")[0]
    .children.map((row) => row.textContent);
  assert.match(
    plannerRows[0],
    /city-bank · weight 900 · Income · ETA \d+s \(Money\)/,
  );
  assert.match(plannerRows[1], /city-farm · weight 300 · Ready/);
  const plannerPanel = page.querySelectorAll("#ea-script-planner")[0];
  assert.match(
    plannerPanel.querySelectorAll("p")[0].textContent,
    /Fresh construction cycle 2/,
  );
  stateLogSettingsHostWindow.eaExportStateLog();
  const stateLogLink = stateLogLinks.at(-1);
  const stateLogBlob = stateLogBlobs.get(stateLogLink.href);
  const stateLogRecord = JSON.parse(stateLogBlob.parts[0]);
  const loggedConstruction = stateLogRecord.samples.at(-1).construction;
  assert.equal(loggedConstruction.cycleId, 2);
  assert.equal(loggedConstruction.detailLevel, "planner");
  assert.equal(loggedConstruction.target.key, "city-bank");
  assert.equal(loggedConstruction.target.blocker, "income");
  assert.match(
    plannerPanel.querySelectorAll("p").at(-1).textContent,
    /Bottleneck samples: 1/,
  );
  assert.ok(
    plannerPanel
      .querySelectorAll("li")
      .some(({ textContent }) => textContent === "income: 1"),
  );
  const resetStats = page
    .querySelectorAll("#ea-script-planner")[0]
    .querySelectorAll("button")
    .at(-1);
  assert.equal(resetStats.disabled, false);
  resetStats.dispatch("click");
  assert.equal(JSON.parse(stored.get("ea_planner_stats")).total, 0);
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p").at(-1)
      .textContent,
    /Bottleneck samples: 0/,
  );
  assert.ok(
    page
      .querySelectorAll("#ea-script-planner")[0]
      .querySelectorAll("li")
      .some(({ textContent }) => textContent === "stalled: 0"),
  );
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);

  const collapseButton = page
    .querySelectorAll("#ea-script-planner")[0]
    .querySelectorAll("button")[0];
  collapseButton.dispatch("click");
  assert.equal(JSON.parse(stored.get("settings")).buildPlannerCollapsed, true);
  page
    .querySelectorAll("#ea-script-planner")[0]
    .querySelectorAll("button")[0]
    .dispatch("click");
  assert.equal(JSON.parse(stored.get("settings")).buildPlannerCollapsed, false);

  activeToggle.checked = false;
  activeToggle.dispatch("change");
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 0);
  activeToggle.checked = true;
  activeToggle.dispatch("change");
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 1);

  plannerToggle.checked = false;
  plannerToggle.dispatch("change");
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  root.resource.Money.diff = 0;
  cycle({ periods: 4 });
  stateLogSettingsHostWindow.eaExportStateLog();
  const changedStateLogBlob = stateLogBlobs.get(stateLogLinks.at(-1).href);
  const changedStateLog = JSON.parse(changedStateLogBlob.parts[0]);
  assert.equal(changedStateLog.samples.at(-2).construction.cycleId, 2);
  assert.equal(
    changedStateLog.samples.at(-2).construction.target.blocker,
    "income",
  );
  assert.equal(changedStateLog.samples.at(-1).construction.cycleId, 3);
  assert.equal(
    changedStateLog.samples.at(-1).construction.target.blocker,
    "stalled",
  );
  root.resource.Money.diff = 100;

  const autoBuildToggle = page.querySelectorAll(".script_autoBuild")[0];
  autoBuildToggle.checked = false;
  autoBuildToggle.dispatch("change");
  cycle({ periods: 4 });
  stateLogSettingsHostWindow.eaExportStateLog();
  const skippedConstructionBlob = stateLogBlobs.get(stateLogLinks.at(-1).href);
  const skippedConstructionLog = JSON.parse(skippedConstructionBlob.parts[0]);
  assert.equal(skippedConstructionLog.samples.at(-1).construction, undefined);
  autoBuildToggle.checked = true;
  autoBuildToggle.dispatch("change");

  plannerToggle.checked = true;
  plannerToggle.dispatch("change");
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);

  root = structuredClone(root);
  rootReplaced();
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p")[0]
      .textContent,
    /Waiting for a captured construction cycle/,
  );

  page.querySelectorAll("#script_resetinterface")[0].dispatch("click");
  assert.equal(JSON.parse(stored.get("settings")).activeTargetsUI, false);
  assert.equal(JSON.parse(stored.get("settings")).buildPlannerUI, true);
  assert.equal(JSON.parse(stored.get("settings")).buildPlannerCollapsed, false);
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 0);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);

  // The bank is now the published saving target, and its cost holds the farm back.
  root.stats.reset = 3;
  root.stats.days = 0;
  cycle({ periods: 4 });
  assert.equal(JSON.parse(stored.get("ea_planner_stats")).reset, 3);
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p").at(-1)
      .textContent,
    /Bottleneck samples: 1/,
  );
  const importSettings = (settings, overrides) => {
    const next = { ...JSON.parse(stored.get("settings")), ...settings };
    if (overrides === null) delete next.overrides;
    else if (overrides !== undefined) next.overrides = overrides;
    importText.value = JSON.stringify(next);
    page.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  };
  const interfaceOverride = (ret) => [
    {
      type1: "Boolean",
      arg1: true,
      type2: "Boolean",
      arg2: true,
      cmp: "==",
      ret,
    },
  ];

  importSettings(
    { activeTargetsUI: false, buildPlannerUI: true },
    {
      activeTargetsUI: interfaceOverride(true),
      buildPlannerUI: interfaceOverride(false),
    },
  );
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 1);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  cycle({ periods: 4 });

  importSettings(
    { activeTargetsUI: true, buildPlannerUI: false },
    {
      activeTargetsUI: interfaceOverride(false),
      buildPlannerUI: interfaceOverride(true),
    },
  );
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 0);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p")[0]
      .textContent,
    /Awaiting a planner-enabled construction cycle/,
  );
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("ol")[0]
      .children[0].textContent,
    /city-bank .*Unavailable/,
  );
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p").at(-1)
      .textContent,
    /Bottleneck samples: 1/,
  );
  cycle({ periods: 4 });
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p")[0]
      .textContent,
    /Fresh construction cycle/,
  );
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("p").at(-1)
      .textContent,
    /Bottleneck samples: 2/,
  );
  assert.match(
    page.querySelectorAll("#ea-script-planner")[0].querySelectorAll("ol")[0]
      .children[0].textContent,
    /Income · ETA \d+s \(Money\)/,
  );

  importSettings({ activeTargetsUI: true, buildPlannerUI: false }, null);
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 1);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  importSettings({ activeTargetsUI: false, buildPlannerUI: false }, null);
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 0);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  importSettings({ activeTargetsUI: true, buildPlannerUI: true }, null);
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 1);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);
  importSettings({ activeTargetsUI: false, buildPlannerUI: true }, null);
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 0);
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 1);
  cycle({ periods: 4 });
  stopCycle();
  // Both construction and runtime listeners invalidate their observations on root replacement.
  assert.deepEqual(invoked, []);
}

// Startup evaluates Interface overrides before its first captured panel reconciliation, without
// waiting for a period callback. Raw values deliberately disagree with both resolved values.
{
  const root = {
    race: {},
    tech: {},
    stats: { days: 1, reset: 0, tdays: 1 },
    city: {},
    space: {},
    queue: { display: true, pause: false, queue: [] },
    settings: {},
    resource: {},
  };
  const handles = new Map([
    ["buildQueue", { elementId: "buildQueue", generation: 1, methods: [] }],
  ]);
  const page = element("main");
  const queueAnchor = element("div", { id: "buildQueue" });
  page.appendChild(queueAnchor);
  const document = createTestDocument(page);
  const settings = {
    masterScriptToggle: true,
    activeTargetsUI: false,
    buildPlannerUI: true,
    overrides: {
      activeTargetsUI: [
        {
          type1: "Boolean",
          arg1: true,
          type2: "Boolean",
          arg2: true,
          cmp: "==",
          ret: true,
        },
      ],
      buildPlannerUI: [
        {
          type1: "Boolean",
          arg1: true,
          type2: "Boolean",
          arg2: true,
          cmp: "==",
          ret: false,
        },
      ],
    },
  };
  const stored = new Map([["settings", JSON.stringify(settings)]]);
  let periodListener;
  const stopRuntime = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) => handles.get(id),
        invoke: () => ({ ok: false, reason: "unknown-control" }),
        capturedElementIds: () => [...handles.keys()],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          periodListener = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document,
    settingsHostWindow: {
      document,
      navigator: { platform: "Win32" },
      location: "https://evolve.test/",
      confirm: () => true,
    },
    mouseEvent: class {},
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
    },
    logError: () => {},
  });
  assert.equal(typeof periodListener, "function");
  assert.equal(page.querySelectorAll("#ea-active-targets").length, 1);
  assert.equal(
    page.querySelectorAll("#ea-active-targets")[0].querySelectorAll("h3")[0]
      .textContent,
    "Detailed Queue",
  );
  assert.equal(page.querySelectorAll("#ea-script-planner").length, 0);
  stopRuntime();
}

// A rendered producer switch cannot authorize Power when semantic mechanics are unavailable.
{
  const root = {
    city: {
      powered: true,
      power: -1,
      mill: { count: 2, on: 0 },
    },
  };
  const invoked = [];
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
        readProductionBreakdown: () => undefined,
      },
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) =>
          id === "city-mill"
            ? { elementId: id, generation: 1, methods: ["power_on"] }
            : undefined,
        invoke: (handle, method) => {
          invoked.push(`${handle.elementId}.${method}`);
          root.city.mill.on += 1;
          root.city.power = 1;
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["city-mill"],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({ masterScriptToggle: true, autoPower: true }),
    },
    logError: () => {},
  });
  cycle({ periods: 4 });
  stopCycle();
  assert.deepEqual(invoked, []);
  assert.equal(root.city.mill.on, 0);
}

// autoJobs reaches captured ordinary civ controls without the compatibility manager.
{
  const root = {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 2,
        workers: 2,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
    },
    resource: { Population: { amount: 2, max: 10 } },
  };
  const invoked = [];
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) =>
          id === "civ-unemployed" || id === "civ-farmer"
            ? {
                elementId: id,
                generation: 1,
                methods: ["add", "sub", "setDefault"],
              }
            : undefined,
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          if (method === "setDefault") {
            root.civic.d_job = args[0];
          } else {
            const id = handle.elementId.slice("civ-".length);
            root.civic[id].workers += method === "add" ? 1 : -1;
          }
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["civ-unemployed", "civ-farmer"],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoJobs: true,
        }),
    },
    logError: () => {},
  });
  cycle({ periods: 4 });
  stopCycle();
  assert.deepEqual(invoked, [
    "civ-unemployed.sub",
    "civ-unemployed.sub",
    "civ-farmer.add",
    "civ-farmer.add",
    "civ-farmer.setDefault",
  ]);
}

// When both job families are enabled, the runtime uses one combined decision and command phase.
// The fixture includes both ordinary and skilled servants so the branch also proves that the
// runtime does not fall back to a second craftsmen-only pass after the full phase succeeds.
{
  const root = {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 4,
        workers: 4,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
      craftsman: { workers: 1, max: 2 },
    },
    city: {
      foundry: {
        Plywood: 1,
        Brick: 0,
        crafting: 1,
        cap: 2,
        rcap: { Plywood: 2, Brick: 2 },
      },
    },
    race: {
      servants: {
        jobs: { farmer: 0 },
        sjobs: { Plywood: 1 },
        max: 1,
        used: 0,
        smax: 1,
        sused: 1,
      },
    },
    resource: {
      Population: { amount: 4, max: 10 },
      Plywood: { amount: 100, max: 1000, name: "Plywood", display: true },
      Brick: { amount: 0, max: 1000, name: "Brick", display: true },
      Iron: { amount: 100, max: 1000, name: "Iron", display: true },
    },
  };
  const invoked = [];
  let cycle;
  const controlIds = [
    "civ-unemployed",
    "civ-farmer",
    "servant-farmer",
    "foundry",
    "skilledServants",
    "resPlywood",
    "resBrick",
  ];
  const controls = withControlCaptureAuthority({
    resolve: (elementId) => {
      if (!controlIds.includes(elementId)) return undefined;
      const methods = elementId.startsWith("res")
        ? ["craftCost"]
        : elementId === "foundry" ||
            elementId === "skilledServants" ||
            elementId.startsWith("servant-")
          ? ["add", "sub"]
          : ["add", "sub", "setDefault"];
      return { elementId, generation: 1, methods };
    },
    invoke: (handle, method, args = []) => {
      if (method === "craftCost")
        return { ok: true, value: "<div>Iron 1</div>" };
      invoked.push(`${handle.elementId}.${method}`);
      if (handle.elementId === "foundry") {
        const id = args[0];
        root.city.foundry[id] += method === "add" ? 1 : -1;
        root.city.foundry.crafting += method === "add" ? 1 : -1;
        root.civic.craftsman.workers += method === "add" ? 1 : -1;
        root.civic.unemployed.workers += method === "add" ? -1 : 1;
      } else if (handle.elementId === "skilledServants") {
        const id = args[0];
        root.race.servants.sjobs[id] =
          (root.race.servants.sjobs[id] ?? 0) + (method === "add" ? 1 : -1);
        root.race.servants.sused += method === "add" ? 1 : -1;
      } else if (handle.elementId === "servant-farmer") {
        root.race.servants.jobs.farmer += method === "add" ? 1 : -1;
        root.race.servants.used += method === "add" ? 1 : -1;
      } else if (method === "setDefault") {
        root.civic.d_job = args[0];
      } else {
        const id = handle.elementId.slice("civ-".length);
        root.civic[id].workers += method === "add" ? 1 : -1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => controlIds,
  });
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls,
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoJobs: true,
          autoCraftsmen: true,
          job_unemployed: true,
          job_farmer: true,
          job_b1_unemployed: 0,
          job_b2_unemployed: 0,
          job_b3_unemployed: 0,
          job_b1_farmer: -1,
          job_b2_farmer: -1,
          job_b3_farmer: -1,
          jobManageServants: true,
          productionCraftsmen: "always",
          craftPlywood: true,
          job_Plywood: true,
          foundry_w_Plywood: 1,
          craftBrick: true,
          job_Brick: true,
          foundry_w_Brick: 1,
        }),
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  cycle({ periods: 4 });
  stopCycle();
  assert.ok(invoked.some((entry) => entry.startsWith("foundry.")));
  assert.ok(invoked.some((entry) => entry.startsWith("skilledServants.")));
  assert.ok(invoked.some((entry) => entry.startsWith("servant-farmer.")));
  assert.equal(
    invoked.filter((entry) => entry.startsWith("foundry.")).length,
    1,
    "the combined branch must not run a second craftsmen-only pass",
  );
}

function runCapturedJobsMatrixScenario({
  autoJobs,
  autoCraftsmen,
  jobManageServants,
  hasServants = true,
  invalidCraftsmanPool = false,
}) {
  const root = {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 4,
        workers: 4,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
      craftsman: { workers: invalidCraftsmanPool ? 0 : 1, max: 2 },
    },
    city: {
      foundry: {
        Plywood: 1,
        Brick: 0,
        crafting: 1,
        cap: 2,
        rcap: { Plywood: 2, Brick: 2 },
      },
    },
    race: hasServants
      ? {
          servants: {
            jobs: { farmer: 0 },
            sjobs: { Plywood: 1, Brick: 0 },
            max: 1,
            used: 0,
            smax: 1,
            sused: 1,
          },
        }
      : {},
    resource: {
      Population: { amount: 4, max: 10 },
      Plywood: { amount: 100, max: 1000, name: "Plywood", display: true },
      Brick: { amount: 0, max: 1000, name: "Brick", display: true },
      Iron: { amount: 100, max: 1000, name: "Iron", display: true },
    },
  };
  const invoked = [];
  const phases = [];
  let cycle;
  const controlIds = [
    "civ-unemployed",
    "civ-farmer",
    "foundry",
    "resPlywood",
    "resBrick",
    ...(hasServants ? ["servant-farmer", "skilledServants"] : []),
  ];
  const controls = withControlCaptureAuthority({
    resolve: (elementId) => {
      if (!controlIds.includes(elementId)) return undefined;
      const methods = elementId.startsWith("res")
        ? ["craftCost"]
        : elementId === "foundry" ||
            elementId === "skilledServants" ||
            elementId.startsWith("servant-")
          ? ["add", "sub"]
          : ["add", "sub", "setDefault"];
      return { elementId, generation: 1, methods };
    },
    invoke: (handle, method, args = []) => {
      if (method === "craftCost")
        return { ok: true, value: "<div>Iron 1</div>" };
      invoked.push(`${handle.elementId}.${method}`);
      if (handle.elementId === "foundry") {
        const id = args[0];
        root.city.foundry[id] += method === "add" ? 1 : -1;
        root.city.foundry.crafting += method === "add" ? 1 : -1;
        root.civic.craftsman.workers += method === "add" ? 1 : -1;
        root.civic.unemployed.workers += method === "add" ? -1 : 1;
      } else if (handle.elementId === "skilledServants") {
        const id = args[0];
        root.race.servants.sjobs[id] =
          (root.race.servants.sjobs[id] ?? 0) + (method === "add" ? 1 : -1);
        root.race.servants.sused += method === "add" ? 1 : -1;
      } else if (handle.elementId.startsWith("servant-")) {
        const id = handle.elementId.slice("servant-".length);
        root.race.servants.jobs[id] =
          (root.race.servants.jobs[id] ?? 0) + (method === "add" ? 1 : -1);
        root.race.servants.used += method === "add" ? 1 : -1;
      } else if (method === "setDefault") {
        root.civic.d_job = args[0];
      } else {
        const id = handle.elementId.slice("civ-".length);
        root.civic[id].workers += method === "add" ? 1 : -1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => controlIds,
  });
  const settings = {
    masterScriptToggle: true,
    autoJobs,
    autoCraftsmen,
    jobManageServants,
    job_unemployed: true,
    job_farmer: true,
    job_b1_unemployed: 0,
    job_b2_unemployed: 0,
    job_b3_unemployed: 0,
    job_b1_farmer: -1,
    job_b2_farmer: -1,
    job_b3_farmer: -1,
    productionCraftsmen: "always",
    craftPlywood: true,
    job_Plywood: true,
    foundry_w_Plywood: 1,
    craftBrick: true,
    job_Brick: true,
    foundry_w_Brick: 1,
  };
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls,
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {},
    mouseEvent: class {},
    storage: { getItem: () => JSON.stringify(settings) },
    diagnostics: {
      readPerformanceEnabled: () => true,
      nowMs: () => 0,
      recordPerformance: (name) => phases.push(name),
      recordCount: () => {},
      flushPerformance: () => {},
    },
    logError: (message) => {
      throw new Error(message);
    },
  });
  const servantsBefore = structuredClone(root.race.servants ?? null);
  cycle({ periods: 4 });
  stopCycle();
  return { root, invoked, servantsBefore, phases };
}

// The remaining settings combinations route to exactly one captured family and obey
// jobManageServants in both ordinary and craftsmen-only mode.
{
  const splitFallback = runCapturedJobsMatrixScenario({
    autoJobs: true,
    autoCraftsmen: true,
    jobManageServants: true,
    invalidCraftsmanPool: true,
  });
  assert.ok(
    splitFallback.phases.includes("autoJobs"),
    JSON.stringify({
      phases: splitFallback.phases,
      invoked: splitFallback.invoked,
    }),
  );
  assert.ok(splitFallback.phases.includes("autoCraftsmen"));
  assert.equal(
    splitFallback.phases.includes("autoJobs with autoCraftsmen"),
    true,
    "the unavailable combined attempt is followed by both split phases",
  );

  const combinedWithoutServants = runCapturedJobsMatrixScenario({
    autoJobs: true,
    autoCraftsmen: true,
    jobManageServants: false,
  });
  assert.equal(
    combinedWithoutServants.invoked.some(
      (entry) =>
        entry.startsWith("servant-") || entry.startsWith("skilledServants."),
    ),
    false,
  );
  assert.deepEqual(
    combinedWithoutServants.root.race.servants,
    combinedWithoutServants.servantsBefore,
  );

  const ordinaryWithServants = runCapturedJobsMatrixScenario({
    autoJobs: true,
    autoCraftsmen: false,
    jobManageServants: true,
  });
  assert.ok(
    ordinaryWithServants.invoked.some((entry) => entry.startsWith("servant-")),
  );
  assert.equal(
    ordinaryWithServants.invoked.some((entry) => entry.startsWith("foundry.")),
    false,
  );
  assert.equal(
    ordinaryWithServants.invoked.some((entry) =>
      entry.startsWith("skilledServants."),
    ),
    false,
  );

  const ordinaryWithoutServants = runCapturedJobsMatrixScenario({
    autoJobs: true,
    autoCraftsmen: false,
    jobManageServants: false,
  });
  assert.equal(
    ordinaryWithoutServants.invoked.some((entry) =>
      entry.startsWith("servant-"),
    ),
    false,
  );
  assert.deepEqual(
    ordinaryWithoutServants.root.race.servants,
    ordinaryWithoutServants.servantsBefore,
  );

  const craftOnlyWithServants = runCapturedJobsMatrixScenario({
    autoJobs: false,
    autoCraftsmen: true,
    jobManageServants: true,
  });
  assert.ok(
    craftOnlyWithServants.invoked.some((entry) =>
      entry.startsWith("skilledServants."),
    ),
  );
  assert.equal(
    craftOnlyWithServants.invoked.some((entry) => entry.startsWith("servant-")),
    false,
  );

  const craftOnlyWithoutServants = runCapturedJobsMatrixScenario({
    autoJobs: false,
    autoCraftsmen: true,
    jobManageServants: false,
  });
  assert.equal(
    craftOnlyWithoutServants.invoked.some((entry) =>
      entry.startsWith("skilledServants."),
    ),
    false,
  );
  assert.deepEqual(
    craftOnlyWithoutServants.root.race.servants,
    craftOnlyWithoutServants.servantsBefore,
  );

  const noServantRace = runCapturedJobsMatrixScenario({
    autoJobs: false,
    autoCraftsmen: true,
    jobManageServants: true,
    hasServants: false,
  });
  assert.equal(
    noServantRace.invoked.some((entry) => entry.startsWith("skilledServants.")),
    false,
  );
  assert.ok(
    noServantRace.invoked.some((entry) => entry.startsWith("foundry.")),
  );

  const neitherEnabled = runCapturedJobsMatrixScenario({
    autoJobs: false,
    autoCraftsmen: false,
    jobManageServants: true,
  });
  assert.equal(
    neitherEnabled.invoked.some(
      (entry) =>
        entry.startsWith("civ-") ||
        entry.startsWith("foundry.") ||
        entry.startsWith("servant-") ||
        entry.startsWith("skilledServants."),
    ),
    false,
  );
}

// Nanite disposal runs before Power; unavailable mechanics is an explicit Power failure.
{
  const root = {
    race: { deconstructor: true },
    resource: {
      Nanite: { amount: 0, max: 100, display: true },
      Supply: { amount: 0, max: 100, display: true },
      Copper: { amount: 100, max: 100, diff: 0, display: true },
    },
    interstellar: {
      mass_ejector: { count: 1, on: 1, Copper: 0 },
    },
    city: {
      powered: true,
      power: -1,
      nanite_factory: { count: 1, Copper: 0 },
      mill: { count: 2, on: 0 },
    },
    portal: {
      bireme: { count: 1, on: 1 },
      transport: { count: 1, on: 1, cargo: { max: 2, Copper: 0 } },
    },
  };
  const invoked = [];
  let cycle;
  const controls = withControlCaptureAuthority({
    resolve: (elementId) => {
      if (elementId === "iNFactory") {
        return {
          elementId,
          generation: 1,
          methods: ["addItem", "subItem"],
        };
      }
      if (elementId === "ejectCopper") {
        return {
          elementId,
          generation: 1,
          methods: ["ejectMore", "ejectLess"],
        };
      }
      if (elementId === "supplyCopper") {
        return {
          elementId,
          generation: 1,
          methods: ["supplyMore", "supplyLess"],
        };
      }
      if (elementId === "city-mill") {
        return { elementId, generation: 1, methods: ["power_on"] };
      }
      return undefined;
    },
    invoke: (handle, method, args = []) => {
      invoked.push(`${handle.elementId}.${method}`);
      if (handle.elementId === "iNFactory") {
        root.city.nanite_factory[args[0]] += method === "addItem" ? 1 : -1;
      } else if (handle.elementId === "ejectCopper") {
        root.interstellar.mass_ejector[args[0]] +=
          method === "ejectMore" ? 1 : -1;
      } else if (handle.elementId === "supplyCopper") {
        root.portal.transport.cargo[args[0]] +=
          method === "supplyMore" ? 1 : -1;
      } else {
        root.city.mill.on += 1;
        root.city.power = 1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => [
      "iNFactory",
      "supplyCopper",
      "ejectCopper",
      "city-mill",
    ],
  });
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
        readProductionBreakdown: () => undefined,
      },
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls,
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          autoNanite: true,
          naniteMode: "cap",
          autoSupply: true,
          supplyMode: "cap",
          autoEject: true,
          ejectMode: "cap",
          autoPower: true,
          res_naniteCopper: true,
          res_supplyCopper: true,
          res_ejectCopper: true,
        }),
    },
    logError: (message) => {
      assert.match(message, /autoPower: captured-power-cycle-unavailable:/);
    },
  });
  cycle({ periods: 4 });
  stopCycle();
  const firstPower = invoked.findIndex(
    (entry) => entry === "city-mill.power_on",
  );
  assert.equal(
    firstPower,
    -1,
    "Power fails closed without a complete mechanics snapshot",
  );
  assert.ok(
    invoked.every(
      (entry) =>
        entry === "iNFactory.addItem" ||
        entry === "supplyCopper.supplyMore" ||
        entry === "ejectCopper.ejectMore",
    ),
    JSON.stringify(invoked),
  );
  assert.ok(
    invoked.findIndex((entry) => entry === "supplyCopper.supplyMore") >
      invoked.findIndex((entry) => entry === "iNFactory.addItem"),
    JSON.stringify(invoked),
  );
  assert.ok(
    invoked.findIndex((entry) => entry === "ejectCopper.ejectMore") >
      invoked.findIndex((entry) => entry === "supplyCopper.supplyMore"),
    JSON.stringify(invoked),
  );
  assert.equal(root.city.nanite_factory.Copper, 4);
}

// The `tickRate` gate: the game wakes the script on every period, and only every `tickRate`-th
// period's worth of them completes a working cycle. One `isComplete()` call is one cycle.
{
  const countCycles = (tickRate, batches) => {
    let cycles = 0;
    let cycle;
    const stopCycle = startCapturedRuntime({
      pageCapture: {
        isComplete: () => {
          cycles++;
          return false;
        },
        rootState: {
          readRoot: () => undefined,
          isReactivitySuppressed: () => false,
          subscribeRootReplaced: () => () => {},
        },
        controls: withControlCaptureAuthority({
          resolve: () => undefined,
          invoke: () => ({ ok: false, reason: "unknown-control" }),
          capturedElementIds: () => [],
        }),
        controlUsage: { readUsage: () => [] },
        periods: {
          subscribe(next) {
            cycle = next;
            return () => {};
          },
        },
        mountSuppression: {
          available: false,
          withoutMounting: () => undefined,
        },
        uninstall: () => {},
        mechanics: {
          readStructures: () => undefined,
          readStructureIdentities: () => undefined,
        },
      },
      document: { getElementById: () => null, querySelectorAll: () => [] },
      mouseEvent: class {},
      storage: {
        getItem: () =>
          tickRate === undefined ? "{}" : JSON.stringify({ tickRate }),
      },
      logError: () => {},
    });
    for (const periods of batches) cycle({ periods });
    stopCycle();
    return cycles;
  };

  // The default rate is four periods per cycle.
  assert.equal(countCycles(undefined, [1, 1, 1]), 0);
  assert.equal(countCycles(undefined, [1, 1, 1, 1]), 1);
  assert.equal(countCycles(undefined, [1, 1, 1, 1, 1, 1, 1, 1]), 2);

  // Rate 1 works on every period; a rate the script cannot honour is floored to that.
  assert.equal(countCycles(1, [1, 1, 1]), 3);
  assert.equal(countCycles(0, [1, 1, 1]), 3);

  // A drift batch counts for every period it carries, so a throttled tab does not starve the
  // script, and the remainder rides along: the three periods left over after a six-period batch
  // mean one more period completes the next cycle rather than four.
  assert.equal(countCycles(4, [1, 6]), 1);
  assert.equal(countCycles(4, [1, 6, 1]), 2);
  assert.equal(countCycles(4, [1, 1, 1, 1, 1, 1, 1]), 1);

  // Whole cycles missed inside one batch collapse into one; the script cannot replay them.
  assert.equal(countCycles(4, [12]), 1);
}

// A feature that throws is reported once and skips only itself: every later phase still runs. Before
// the per-phase boundary a single `try` covered the whole cycle, so an unavailable control in an
// early feature silently cost every feature after it — measured against the real game at zero
// build-queue cost probes over 600 periods while the market phase threw each cycle.
{
  const root = {
    race: { deconstructor: true },
    resource: {
      Nanite: { amount: 0, max: 100, display: true },
      Supply: { amount: 0, max: 100, display: true },
      Copper: { amount: 100, max: 100, diff: 0, display: true },
    },
    interstellar: { mass_ejector: { count: 1, on: 1, Copper: 0 } },
    city: {
      powered: true,
      power: -1,
      nanite_factory: { count: 1, Copper: 0 },
      mill: { count: 2, on: 0 },
    },
    portal: {
      bireme: { count: 1, on: 1 },
      transport: { count: 1, on: 1, cargo: { max: 2, Copper: 0 } },
    },
  };
  const invoked = [];
  const reported = [];
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (elementId) => {
          // Nanite disposal runs first of these three. Its control throwing stands in for any
          // feature whose own state has gone out from under it mid-run.
          if (elementId === "iNFactory") {
            throw new Error("nanite control exploded");
          }
          if (elementId === "ejectCopper") {
            return {
              elementId,
              generation: 1,
              methods: ["ejectMore", "ejectLess"],
            };
          }
          if (elementId === "supplyCopper") {
            return {
              elementId,
              generation: 1,
              methods: ["supplyMore", "supplyLess"],
            };
          }
          return undefined;
        },
        invoke: (handle, method, args = []) => {
          invoked.push(`${handle.elementId}.${method}`);
          if (handle.elementId === "ejectCopper") {
            root.interstellar.mass_ejector[args[0]] +=
              method === "ejectMore" ? 1 : -1;
          } else if (handle.elementId === "supplyCopper") {
            root.portal.transport.cargo[args[0]] +=
              method === "supplyMore" ? 1 : -1;
          }
          return { ok: true, value: undefined };
        },
        capturedElementIds: () => ["supplyCopper", "ejectCopper"],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoNanite: true,
          naniteMode: "cap",
          autoSupply: true,
          supplyMode: "cap",
          autoEject: true,
          ejectMode: "cap",
          res_naniteCopper: true,
          res_supplyCopper: true,
          res_ejectCopper: true,
        }),
    },
    logError: (message) => reported.push(message),
  });
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  cycle({ periods: 1 });
  stopCycle();

  // The failing phase is named, and named once rather than every cycle.
  const failures = reported.filter((message) => message.includes("autoNanite"));
  assert.equal(
    failures.length,
    1,
    `expected one autoNanite failure: ${JSON.stringify(reported)}`,
  );
  assert.match(failures[0], /autoNanite stopped: .*nanite control exploded/);
  // Both later phases still ran, which is the whole point of the boundary.
  assert.ok(
    invoked.some((entry) => entry === "supplyCopper.supplyMore"),
    `autoSupply was skipped by autoNanite's throw: ${JSON.stringify(invoked)}`,
  );
  assert.ok(
    invoked.some((entry) => entry === "ejectCopper.ejectMore"),
    `autoEject was skipped by autoNanite's throw: ${JSON.stringify(invoked)}`,
  );
}

// The production captured cycle is a separate orchestration boundary from runTick. These phase
// failures make its actual order observable without relying on source-text ordering or a test-only
// expected-phase constant. The always-on building preflight consumes the first root failure, and
// the captured mercenary phase is included before the existing spy/espionage/battle sequence. The
// extra bootstrap reads are the captured settings catalogs sampled before feature phases; they
// return the root unchanged so the original phase-failure boundary remains observable. The count
// is exact: the storage reset context samples the root once, so adding or removing a bootstrap
// root read moves the failure window and this number moves with it.
{
  const phaseFailures = [];
  const observedPhases = [];
  // Startup reads the root freely; only the reads the tick itself makes are scripted below. This
  // used to be a fixed read budget, which made the case fail whenever startup changed how many
  // times it looked at the root.
  let bootstrapping = true;
  // Tuned to the tick's own read schedule: the first reads of the tick throw so the earlier
  // phases report failures, and the next four succeed so the espionage and battle phases run. The
  // espionage phase asks the Governor-ownership question before it stands down, which is one more
  // read of its own. Re-tune by sweeping this number if the tick changes how often it reads the
  // root.
  let remainingRootFailures = 14;
  let validCombatRootReads = 0;
  const root = {
    tech: { spy: 2 },
    civic: {
      foreign: {
        gov0: {
          mil: 10,
          spy: 3,
          sab: 0,
          hstl: 0,
          unrest: 0,
          eco: 1,
          occ: false,
          anx: false,
          buy: false,
        },
      },
    },
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
  };
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: [
      "vis",
      "hire",
      "hell",
      "s_max",
      "campaign",
      "next",
      "last",
      "aNext",
      "aLast",
      "rating",
    ],
  };
  const controlCalls = [];
  let mercenaryPhaseObserved = false;
  let cycle;
  const stopCycle = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => {
          if (bootstrapping) return root;
          if (remainingRootFailures > 0) {
            remainingRootFailures -= 1;
            throw new Error("phase stub");
          }
          if (validCombatRootReads < 4) {
            validCombatRootReads += 1;
            return root;
          }
          throw new Error("battle phase stub");
        },
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) => {
          if (
            id === "garrison" &&
            !mercenaryPhaseObserved &&
            observedPhases[observedPhases.length - 1] === "autoBuild"
          ) {
            mercenaryPhaseObserved = true;
            observedPhases.push("autoFight.mercenary");
          }
          return id === "foreign"
            ? foreign
            : id === "garrison"
              ? garrison
              : undefined;
        },
        invoke: (handle, method, args = []) => {
          if (
            handle === foreign &&
            method === "vis" &&
            observedPhases[observedPhases.length - 1] === "autoFight.mercenary"
          ) {
            observedPhases.push("autoFight.spy");
          } else if (
            handle === foreign &&
            method === "vis" &&
            observedPhases[observedPhases.length - 1] === "autoFight.spy"
          ) {
            observedPhases.push("autoFight.espionage");
          }
          controlCalls.push([handle.elementId, method, ...args]);
          if (handle === foreign && method === "vis") {
            return { ok: true, value: true };
          }
          if (handle === foreign && method === "gvis") {
            return { ok: true, value: args[0] === 0 };
          }
          return { ok: true, value: false };
        },
        capturedElementIds: () => ["foreign"],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoResearch: true,
          autoBuild: true,
          autoFight: true,
          autoTax: true,
          autoGovernment: true,
          foreignPolicyInferior: "Ignore",
          foreignPolicySuperior: "Ignore",
          foreignPolicyRival: "Ignore",
        }),
    },
    logError: (message) => {
      phaseFailures.push(message);
      const phase = message.slice(0, message.indexOf(" stopped: "));
      if (
        [
          "autoResearch",
          "autoBuild",
          "autoFight.spy",
          "autoFight.battle",
          "autoTax",
          "autoGovernment",
        ].includes(phase)
      ) {
        observedPhases.push(phase);
      }
    },
  });
  bootstrapping = false;
  cycle({ periods: 1 });
  stopCycle();

  assert.deepEqual(observedPhases, [
    "autoResearch",
    "autoBuild",
    "autoFight.mercenary",
    "autoFight.spy",
    "autoFight.espionage",
    "autoFight.battle",
    "autoTax",
    "autoGovernment",
  ]);
  assert.deepEqual(controlCalls[0], ["foreign", "vis"]);
  assert.deepEqual(
    phaseFailures
      .filter(
        (message) =>
          message.includes(" stopped: ") &&
          !message.startsWith("buildingAlwaysClick stopped: "),
      )
      .map((message) => message.slice(0, message.indexOf(" stopped: "))),
    [
      // The demand-prerequisites phase reads the root first, so it is the first to report
      // while the stub is still throwing.
      "demand prerequisites",
      "construction demand preparation",
      "construction saving discovery",
      "autoResearch",
      "autoBuild",
      "autoFight.mercenary",
      "autoFight.battle",
      "autoTax",
      "autoGovernment",
    ],
  );
}

function runCombatRuntime(autoFight) {
  const calls = [];
  const activities = [];
  const errors = [];
  const root = {
    race: {},
    tech: { mercs: 1 },
    civic: {
      garrison: {
        display: true,
        mercs: true,
        workers: 0,
        max: 1,
        crew: 0,
        m_use: 0,
      },
      foreign: {},
    },
    space: {},
    portal: {},
    eden: {},
    stats: { achieve: {} },
    resource: {
      Money: { amount: 100, max: 1_000, diff: 100, display: true },
    },
    settings: {},
  };
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: ["vis", "hire", "hell", "s_max"],
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
  };
  let cycle;
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: withControlCaptureAuthority({
        resolve: (id) =>
          id === "garrison" ? garrison : id === "foreign" ? foreign : undefined,
        invoke: (handle, method) => {
          calls.push(`${handle.elementId}.${method}`);
          if (handle === garrison && method === "vis") {
            return { ok: true, value: true };
          }
          if (handle === garrison && method === "hell") {
            return { ok: true, value: root.civic.garrison.workers };
          }
          if (handle === garrison && method === "s_max") {
            return { ok: true, value: root.civic.garrison.max };
          }
          if (handle === garrison && method === "hire") {
            root.resource.Money.amount -= 25;
            root.civic.garrison.workers += 1;
            root.civic.garrison.m_use += 1;
            return { ok: true, value: undefined };
          }
          if (handle === foreign && method === "vis") {
            return { ok: true, value: false };
          }
          return { ok: true, value: false };
        },
        capturedElementIds: () => ["garrison", "foreign"],
      }),
      controlUsage: { readUsage: () => [] },
      keyState: { readPressed: () => false },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {},
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoFight,
          foreignTrainSpy: true,
          foreignSpyMax: 10,
          foreignHireMercDeadSoldiers: 0,
          foreignHireMercCostLowerThanIncome: 1,
          foreignHireMercMoneyStoragePercent: 0,
          storageAssignExtra: false,
        }),
    },
    onActivity: (activity) => activities.push(activity),
    logError: (message) => errors.push(message),
  });
  cycle({ periods: 1 });
  stop();
  return { calls, activities, errors, root };
}

{
  const disabled = runCombatRuntime(false);
  assert.equal(disabled.calls.includes("garrison.hire"), false);
  assert.deepEqual(disabled.activities, []);

  const enabled = runCombatRuntime(true);
  assert.equal(enabled.root.civic.garrison.workers, 1);
  assert.equal(
    enabled.calls.filter((call) => call === "garrison.hire").length,
    1,
  );
  assert.ok(
    enabled.calls.indexOf("garrison.hire") <
      enabled.calls.indexOf("foreign.vis"),
    `mercenary action did not precede the rest of autoFight: ${JSON.stringify(enabled.calls)}`,
  );
  assert.equal(enabled.activities.length, 1);
}

// Mech-first construction priority also changes the budget used by the actual Mech transaction.
// Cycle one establishes an unaffordable Factory saving target while Mech is unavailable; cycle
// two makes the same target and Mech affordable, then the construction phase must yield and the
// later production autoMech phase must spend the formerly reserved Supply.
{
  const invoked = [];
  const errors = [];
  const root = {
    race: { species: "human", warlord: true },
    blood: {},
    stats: { achieve: {} },
    tech: {},
    city: { factory: { count: 0, on: 0 } },
    space: {},
    civic: {},
    portal: {
      mechbay: {
        max: 25,
        bay: 0,
        active: 0,
        scouts: 0,
        mechs: [],
        blueprint: {
          size: "small",
          chassis: "tread",
          hardpoint: ["laser"],
          equip: ["special", "shields"],
          infernal: false,
        },
      },
      purifier: {
        supply: 25_000,
        sup_max: 2_000_000,
        count: 1,
        on: 1,
        diff: 0,
      },
      spire: { count: 1, type: "sand", progress: 0, status: {}, boss: "snake" },
    },
    resource: {
      Supply: { amount: 25_000, max: -1, stackable: false, display: true },
      Soul_Gem: {
        amount: 4,
        max: 100,
        stackable: false,
        diff: 0,
        display: true,
      },
      Money: { amount: 0, max: 10_000, stackable: false, display: true },
    },
    queue: { display: true, pause: false, queue: [] },
    settings: { qKey: false, qAny: false, showMechLab: true },
  };
  const handles = new Map([
    [
      "buildQueue",
      { elementId: "buildQueue", generation: 1, methods: ["setData"] },
    ],
    [
      "city-factory",
      {
        elementId: "city-factory",
        generation: 1,
        methods: ["action"],
        data: { act: { name: "Factory" } },
      },
    ],
    [
      "mechAssembly",
      {
        elementId: "mechAssembly",
        generation: 1,
        methods: ["build", "bay", "price", "soul"],
      },
    ],
  ]);
  let cycle;
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      keyState: { readPressed: () => false },
      controls: withControlCaptureAuthority({
        resolve: (elementId) => handles.get(elementId),
        invoke: (handle, method) => {
          invoked.push(`${handle.elementId}.${method}`);
          if (handle.elementId === "buildQueue") {
            return { ok: true, value: { "data-Supply": 50_000 } };
          }
          if (handle.elementId === "city-factory") {
            root.city.factory.count += 1;
            return { ok: true, value: undefined };
          }
          if (method === "bay") return { ok: true, value: 5 };
          if (method === "price") return { ok: true, value: 180_000 };
          if (method === "soul") return { ok: true, value: 4 };
          if (method === "build") {
            const blueprint = root.portal.mechbay.blueprint;
            root.portal.mechbay.mechs.push({
              size: blueprint.size,
              chassis: blueprint.chassis,
              hardpoint: [...blueprint.hardpoint],
              equip: [...blueprint.equip],
              infernal: blueprint.infernal,
            });
            root.portal.mechbay.bay += 5;
            root.portal.mechbay.active += 1;
            root.portal.purifier.supply -= 180_000;
            root.resource.Supply.amount -= 180_000;
            root.resource.Soul_Gem.amount -= 4;
            return { ok: true, value: undefined };
          }
          return { ok: false, reason: "unknown-method" };
        },
        capturedElementIds: () => [...handles.keys()],
      }),
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: { available: false, withoutMounting: () => undefined },
      uninstall: () => {},
      mechanics: {
        readStructures: () => undefined,
        readStructureIdentities: () => undefined,
      },
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoBuild: true,
          autoMech: true,
          mechBuild: "user",
          mechScrap: "none",
          buildingMechsFirst: true,
          "batcity-factory": true,
          "bld_w_city-factory": 100,
          "bld_m_city-factory": 1,
        }),
      setItem: () => {},
    },
    logError: (message) => errors.push(message),
  });

  cycle({ periods: 1 });
  assert.equal(root.city.factory.count, 0);
  assert.equal(root.portal.mechbay.mechs.length, 0);

  root.race.warlord = false;
  root.portal.purifier.supply = 180_000;
  root.resource.Supply.amount = 180_000;
  cycle({ periods: 1 });
  stop();

  assert.deepEqual(
    errors.filter((message) => message.startsWith("auto")),
    [],
  );
  assert.equal(root.city.factory.count, 0);
  assert.equal(
    invoked.filter((entry) => entry === "city-factory.action").length,
    0,
    `construction spent the Mech-priority Supply: ${JSON.stringify(invoked)}`,
  );
  assert.equal(
    invoked.filter((entry) => entry === "mechAssembly.build").length,
    1,
    `actual autoMech did not use the priority budget: ${JSON.stringify(invoked)}`,
  );
  assert.equal(root.portal.mechbay.mechs.length, 1);
  assert.equal(root.portal.purifier.supply, 0);
  assert.equal(root.resource.Soul_Gem.amount, 0);
}

// The production entry path samples current offers before Storage. A Storage action then changes
// the visible offer row, but the later Research phase must keep using that one cycle's snapshot.
{
  const documentRoot = element("div", { id: "runtime-root" });
  const researchPanel = element("div", { id: "tech" });
  const researchRow = (id, amount) => {
    const row = element("div");
    row.classList.add("action");
    Object.defineProperty(row, "id", { value: id });
    applyResearchDrawnAttributes(row, { id, class: "action" });
    const price = element("button");
    Object.defineProperty(price, "id", { value: "" });
    applyResearchDrawnAttributes(price, {
      class: "button res-Polymer",
      "data-polymer": amount,
    });
    row.appendChild(price);
    return row;
  };
  researchPanel.appendChild(researchRow("tech-polymer-heavy", 700));
  documentRoot.appendChild(researchPanel);
  const document = createTestDocument(documentRoot);
  let researchCatalogReads = 0;
  assert.deepEqual(
    createGameDrawnActionsReader({ getDocument: () => document }).read(
      "#tech .action",
    )[0]?.cost,
    { Polymer: 700 },
  );
  const root = {
    settings: { civTabs: 3, showStorage: true },
    queue: { queue: [] },
    race: {},
    tech: { "polymer-heavy": 0 },
    civic: {},
    resource: {
      Crates: { amount: 5, max: 5, display: true, stackable: false },
      Containers: { amount: 0, max: 5, display: true, stackable: false },
      Plywood: { amount: 100, max: 1000, display: true, stackable: false },
      Steel: { amount: 100, max: 1000, display: true, stackable: false },
      Knowledge: { amount: 100, max: 100, display: true, stackable: false },
      Polymer: {
        amount: 0,
        max: 100,
        display: true,
        stackable: true,
        crates: 0,
        containers: 0,
      },
    },
  };
  const storageCalls = [];
  const researchActions = [];
  const errors = [];
  let nativeResearchBindings = ["tech-polymer-heavy"];
  const handles = new Map([
    [
      "#mainColumn div.content",
      {
        elementId: "#mainColumn div.content",
        generation: 1,
        methods: ["swapTab"],
      },
    ],
    [
      "createHead",
      {
        elementId: "createHead",
        generation: 1,
        methods: ["buildCrateDesc", "buildContainerDesc", "crate", "container"],
      },
    ],
    [
      "buildQueue",
      {
        elementId: "buildQueue",
        generation: 1,
        methods: ["setData"],
      },
    ],
    [
      "stack-Polymer",
      {
        elementId: "stack-Polymer",
        generation: 1,
        methods: ["addCrate", "subCrate", "addCon", "subCon"],
      },
    ],
    [
      "tech-polymer-heavy",
      {
        elementId: "tech-polymer-heavy",
        generation: 1,
        methods: ["action"],
      },
    ],
  ]);
  const controls = withControlCaptureAuthority({
    resolve: (id) => handles.get(id),
    invoke: (handle, method) => {
      storageCalls.push([handle.elementId, method]);
      if (handle.elementId === "buildQueue" && method === "setData") {
        const probeId = root.queue.queue.at(-1)?.id;
        const amount =
          probeId === "tech-__ea_research_cost_probe__"
            ? nativeResearchBindings[0] === "tech-polymer-heavy"
              ? 700
              : 900
            : 0;
        return {
          ok: true,
          value: amount > 0 ? { "data-Polymer": amount } : {},
        };
      }
      if (method === "buildCrateDesc") {
        return { ok: true, value: "Build 1 Plywood crate for 350 storage" };
      }
      if (method === "buildContainerDesc") {
        return { ok: true, value: "Build 125 Steel container for 800 storage" };
      }
      if (handle.elementId === "stack-Polymer" && method === "addCrate") {
        root.resource.Crates.amount -= 1;
        root.resource.Polymer.crates += 1;
        root.resource.Polymer.max += 350;
        if (root.resource.Polymer.max >= 700) {
          root.resource.Polymer.amount = 700;
        }
        researchPanel.replaceChildren(
          researchRow("tech-redrawn-after-storage", 900),
        );
        nativeResearchBindings = ["tech-redrawn-after-storage"];
        handles.set("tech-redrawn-after-storage", {
          elementId: "tech-redrawn-after-storage",
          generation: 1,
          methods: ["action"],
        });
        return { ok: true, value: undefined };
      }
      if (handle.elementId === "tech-polymer-heavy" && method === "action") {
        researchActions.push(handle.elementId);
        root.tech["polymer-heavy"] = 1;
        return { ok: true, value: undefined };
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => [...handles.keys()],
  });
  let cycle;
  const stop = startCapturedRuntime({
    pageCapture: withCapturedTechMechanicsFixture(
      {
        isComplete: () => true,
        rootState: {
          readRoot: () => root,
          isReactivitySuppressed: () => false,
          subscribeRootReplaced: () => () => {},
        },
        controls,
        bindings(listener) {
          researchCatalogReads += 1;
          for (const elementId of nativeResearchBindings) {
            listener(elementId, Object.freeze({}));
          }
          return () => {};
        },
        keyState: { readPressed: () => false },
        controlUsage: { readUsage: () => [] },
        periods: {
          subscribe(next) {
            cycle = next;
            return () => {};
          },
        },
        mountSuppression: {
          available: true,
          withoutMounting: (draw) => draw(),
          withMountingEnabled: (draw) => draw(),
        },
        uninstall: () => {},
        mechanics: {
          readStructures: () => undefined,
          readStructureIdentities: () => undefined,
        },
      },
      ["tech-polymer-heavy", "tech-redrawn-after-storage"],
    ),
    document,
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoStorage: true,
          autoResearch: true,
          storageAssignExtra: false,
          res_storagePolymer: true,
          res_storage_p_Polymer: 0,
          res_min_storePolymer: 1,
          res_max_storePolymer: -1,
        }),
      setItem: () => {},
    },
    logError: (message) => errors.push(message),
  });
  const offerReadsPerCycle = [];
  for (let index = 0; index < 3; index += 1) {
    const readsBefore = researchCatalogReads;
    cycle({ periods: 1 });
    offerReadsPerCycle.push(researchCatalogReads - readsBefore);
  }
  stop();

  assert.deepEqual(offerReadsPerCycle, [1, 1, 1]);
  assert.deepEqual(errors, []);
  assert.ok(
    storageCalls.some(
      ([elementId, method]) =>
        elementId === "stack-Polymer" && method === "addCrate",
    ),
    `Storage did not allocate Polymer capacity from the current offer: ${JSON.stringify(storageCalls)}`,
  );
  assert.deepEqual(researchActions, ["tech-polymer-heavy"]);
}

{
  const market = runDemandSampleScenario({ autoMarket: true, buyFood: true });
  assert.equal(
    market.researchOfferReads,
    1,
    `a Market demand sample must include the current affordable Polymer technology: ${JSON.stringify(market)}`,
  );
  assertDemandScenarioErrors(market.errors);
}

{
  const trigger = runDemandSampleScenario({
    autoTrigger: true,
    triggers: [
      {
        priority: 0,
        requirementType: "ResourceMaxCost",
        requirementId: "Polymer",
        requirementCount: 100,
        actionType: "build",
        actionId: "city-farm",
        actionCount: 1,
      },
    ],
  });
  assert.equal(
    trigger.researchOfferReads,
    2,
    "a successful trigger click refreshes its dependent offer reservation",
  );
  assert.ok(
    trigger.invoked.includes("city-farm.action"),
    "a demand-based build trigger must see the current research reservation without a tech operand",
  );
  assertDemandScenarioErrors(trigger.errors);
}

{
  const combined = runDemandSampleScenario({
    autoMarket: true,
    buyFood: true,
    autoTrigger: true,
    triggers: [
      {
        priority: 0,
        requirementType: "ResourceMaxCost",
        requirementId: "Polymer",
        requirementCount: 100,
        actionType: "build",
        actionId: "city-farm",
        actionCount: 1,
      },
    ],
  });
  assert.equal(
    combined.researchOfferReads,
    2,
    "the trigger re-reads its dependent offer reservation after a successful click",
  );
  assert.ok(combined.invoked.includes("city-farm.action"));
  assertDemandScenarioErrors(combined.errors);
}

{
  const spaceMarket = runDemandSampleScenario(
    {
      autoMarket: true,
      buyFood: true,
      researchRequest: false,
      researchRequestSpace: true,
    },
    true,
  );
  assert.equal(spaceMarket.researchOfferReads, 1);
  assertDemandScenarioErrors(spaceMarket.errors);
}

{
  const saving = runDemandSampleScenario(
    {
      autoMarket: true,
      autoStorage: true,
      autoBuild: true,
      buyFood: true,
      res_buy_r_Food: 0.9,
      "batcity-farm": true,
      "batcity-bank": true,
      "bld_w_city-farm": 200,
      "bld_w_city-bank": 100,
    },
    false,
    true,
  );
  for (const phase of [
    "settingsPanel.ensurePanel",
    "settings.refreshEffective",
    "planningPanels.refresh",
  ]) {
    assert.ok(saving.phases.includes(phase), `${phase} must be profiled`);
  }
  assert.ok(
    saving.phases.includes("autoBuild.beginCycle"),
    JSON.stringify(saving),
  );
  assert.equal(
    saving.phases.filter((phase) => phase === "autoBuild.beginCycle").length,
    2,
    JSON.stringify(saving),
  );
  const nextCallback = saving.phases.indexOf("between callbacks");
  const nextMarket = saving.phases.indexOf("autoMarket.readSell", nextCallback);
  const nextBuild = saving.phases.indexOf("autoBuild.beginCycle", nextCallback);
  assert.ok(
    nextCallback < nextMarket && nextMarket < nextBuild,
    JSON.stringify(saving),
  );
  assert.equal(
    saving.phases
      .slice(nextCallback, nextMarket)
      .includes("autoBuild.sampleCandidate"),
    false,
  );
  assert.equal(
    saving.invoked.includes("market-Food.purchase"),
    true,
    JSON.stringify(saving),
  );
  assert.deepEqual(saving.errors, []);
  const affordable = runDemandSampleScenario(
    {
      autoMarket: true,
      autoStorage: true,
      autoBuild: true,
      buyFood: true,
      res_buy_r_Food: 0.9,
      "batcity-farm": true,
      "batcity-bank": true,
      "bld_w_city-farm": 200,
      "bld_w_city-bank": 100,
    },
    false,
    true,
    2000,
  );
  assert.ok(
    affordable.invoked.includes("market-Food.purchase"),
    JSON.stringify(affordable),
  );
  const noConstruction = runDemandSampleScenario({
    autoMarket: true,
    buyFood: true,
    res_buy_r_Food: 0.9,
  });
  assert.ok(
    noConstruction.invoked.includes("market-Food.purchase"),
    JSON.stringify(noConstruction),
  );
}

console.log("captured-runtime-control ok");
