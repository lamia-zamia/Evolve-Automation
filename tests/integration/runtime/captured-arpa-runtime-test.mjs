import assert from "node:assert/strict";

import { installPageCapture } from "../../../src/adapters/evolve/page-capture.ts";
import {
  arpaProjectIdFromElementId,
  isBuildableArpaProjectId,
} from "../../../src/adapters/evolve/progression/research/arpa-project-identity.ts";
import { startCapturedRuntime } from "../../../src/bootstrap/captured-runtime-control.ts";
import { withCapturedTechMechanicsFixture } from "../../support/fixtures/captured-tech-mechanics-fixture.mjs";
import {
  createTestDocument,
  element,
} from "../../support/fixtures/dom-fixture.mjs";

assert.equal(arpaProjectIdFromElementId("arpaSequence"), "Sequence");
assert.equal(isBuildableArpaProjectId("Sequence"), false);

class FakeWorker {
  constructor(url) {
    this.url = String(url);
    this.listeners = [];
  }

  addEventListener(type, listener) {
    this.listeners.push({ type, listener });
  }

  removeEventListener() {}

  dispatch(data) {
    for (const { type, listener } of [...this.listeners]) {
      if (type === "message") listener.call(this, { data });
    }
  }
}

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
    toRaw(value) {
      return raws.get(value) ?? value;
    },
    createApp(options) {
      return { options };
    },
  };
}

function readerAttribute(name, value) {
  return { name, value: String(value) };
}

function setReaderAttributes(node, values) {
  const domAttributes = node.attributes;
  const attributes = values.map(([name, value]) =>
    readerAttribute(name, value),
  );
  attributes.get = (name) => {
    const readerValue = attributes.find((attribute) => attribute.name === name);
    return readerValue?.value ?? domAttributes.get(name) ?? null;
  };
  node.attributes = attributes;
}

function createProjectRow({
  document,
  id,
  displayCost,
  onBuild,
  onProjectCosts,
  vue,
  bindControl,
  hoverEvents,
}) {
  const row = element("div", { id: `arpa${id}` });
  row.classList.add("arpaProject");
  const buy = element("div");
  buy.classList.add("buy");
  const button = element("button");
  button.classList.add("x1");
  button.addEventListener("mouseover", () => {
    hoverEvents.push("over");
    const popper = element("div", { id: "popper" });
    setReaderAttributes(popper, []);
    for (const [resourceId, amount] of Object.entries(displayCost)) {
      const cost = element("div");
      setReaderAttributes(cost, [[`data-${resourceId}`, amount]]);
      popper.appendChild(cost);
    }
    document.body.appendChild(popper);
    button.currentPopper = popper;
  });
  button.addEventListener("mouseout", () => {
    hoverEvents.push("out");
    button.currentPopper?.remove();
    button.currentPopper = undefined;
  });
  buy.appendChild(button);
  row.appendChild(buy);
  vue.createApp({
    el: `#arpa${id}`,
    data: { title: id },
    methods: bindControl
      ? { build: onBuild, arpaProjectSRCosts: onProjectCosts }
      : { other: () => undefined },
  });
  return row;
}

function makeScenario({
  projectId = "lhc",
  progress = 20,
  rank = 0,
  additionalProjectIds = [],
  afterNativeBuild,
  currentTab = 2,
  initialProject = true,
  scriptSettings = {},
  money = 100000,
  moneyMaximum = 1000000,
  uninitializedMoneyMaximum = false,
  queue = [],
  bindControl = true,
  marketStorage = false,
  manualCraftLumber,
  nativePerPercentCost,
  nativeCostAdjustment = (costs) => costs,
  nativeCostDisplayText,
  extraNativeResources = [],
  nativeActualSteps,
  nativeResourceDeductions,
} = {}) {
  const pageBody = element("div", { id: "page" });
  const mainColumn = element("div", { id: "mainColumn" });
  const content = element("div");
  content.classList.add("content");
  const mainPanels = [
    "mTabCivil",
    "mTabCivic",
    "mTabResearch",
    "mTabResource",
    "mTabArpa",
    "mTabStats",
  ].map((id) => element("div", { id }));
  content.append(...mainPanels);
  mainColumn.appendChild(content);
  pageBody.appendChild(mainColumn);
  if (marketStorage) {
    pageBody.appendChild(element("div", { id: "market-qty" }));
    pageBody.appendChild(element("div", { id: "market-Food" }));
    pageBody.appendChild(element("div", { id: "createHead" }));
  }
  const document = createTestDocument(pageBody);
  if (manualCraftLumber !== undefined) {
    pageBody.appendChild(element("button", { id: "incPlywoodA" }));
  }

  const gameRoot = {
    settings: {
      expose: false,
      tabLoad: false,
      civTabs: currentTab,
      spaceTabs: 0,
      govTabs: 0,
      marketTabs: 0,
      animated: true,
      showCity: false,
      showSpace: false,
      showDeep: false,
      showGalactic: false,
      showUnderground: false,
      showSurface: false,
      showPortal: false,
      showCiv: true,
      showCivic: true,
      showResearch: true,
      showMarket: marketStorage,
      showStorage: marketStorage,
      showResources: true,
      showGenetics: true,
      arpa: { physics: true },
    },
    resource: {
      Money: {
        amount: money,
        ...(uninitializedMoneyMaximum ? {} : { max: moneyMaximum }),
        display: true,
        diff: 100,
        value: 1,
      },
      Knowledge: {
        amount: 100000,
        max: 1000000,
        display: true,
        diff: 100,
        value: 1,
      },
      Iridium: {
        amount: 100000,
        max: 1000000,
        display: true,
        diff: 100,
        value: 1,
      },
      Sheet_Metal: {
        amount: 100000,
        max: 1000000,
        display: true,
        diff: 100,
        value: 1,
      },
      Polymer: {
        amount: 100000,
        max: 1000000,
        display: true,
        diff: 100,
        value: 1,
      },
      Oil: {
        amount: 100000,
        max: 1000000,
        display: true,
        diff: 100,
        value: 1,
      },
      Mana: {
        amount: 0,
        max: 1000,
        display: false,
        diff: 0,
        value: 1,
      },
      ...(manualCraftLumber === undefined
        ? {}
        : {
            human: {
              name: "Human",
              amount: 10,
              max: 20,
              display: true,
              diff: 0,
            },
            Lumber: {
              name: "Lumber",
              amount: manualCraftLumber,
              max: 1000,
              display: true,
              diff: 100,
            },
            Plywood: {
              name: "Plywood",
              amount: 0,
              max: -1,
              display: true,
              diff: 0,
            },
          }),
    },
    race: { species: "human", iceage: true },
    genes: { engineer: 0 },
    stats: { days: 100, reset: 1, resets: 1 },
    tech: {
      mad: 1,
      high_tech: 7,
      genetics: 2,
      ...(marketStorage ? { trade: true } : {}),
    },
    city: marketStorage ? { market: { qty: 1, mtrade: 1, trade: 0 } } : {},
    civic: {},
    portal: {},
    arpa: {
      ...(initialProject ? { [projectId]: { rank, complete: progress } } : {}),
      m_type: "Monolith",
      ...Object.fromEntries(
        additionalProjectIds.map((id) => [id, { rank: 1, complete: 23 }]),
      ),
    },
    queue: { queue },
  };
  for (const resourceId of extraNativeResources) {
    gameRoot.resource[resourceId] = {
      amount: 100000,
      max: 1000000,
      display: true,
      diff: 100,
      value: 1,
    };
  }

  const page = {
    Object,
    Number,
    Worker: FakeWorker,
    document,
    location: { href: "https://evolvebeta.github.io/Evolve/" },
    navigator: { userAgent: "captured-arpa-test" },
  };
  const pageCapture = installPageCapture(page);
  const vue = makeVue();
  page.Vue = vue;
  vue.reactive(gameRoot);

  let drawnDisplayCost =
    manualCraftLumber === undefined
      ? { Money: 10, Knowledge: 3 }
      : { Lumber: 200 };
  let actualPerPercentCost =
    nativePerPercentCost ??
    (manualCraftLumber === undefined
      ? { Money: 10.2, Knowledge: 3.2 }
      : { Lumber: 200 });
  const nativeProjectDefinitions = Object.fromEntries(
    [projectId, ...additionalProjectIds].map((id) => [
      id,
      {
        reqs: {},
        grant:
          id === projectId
            ? "captured_arpa_test_grant"
            : `captured_arpa_test_grant_${id}`,
        cost: Object.fromEntries(
          Object.keys(actualPerPercentCost).map((resourceId) => [
            resourceId,
            () => actualPerPercentCost[resourceId] * 100,
          ]),
        ),
      },
    ]),
  );
  const adjustArpaCosts = (cost) =>
    Object.fromEntries(
      Object.entries(nativeCostAdjustment(cost, gameRoot)).map(
        ([resourceId, calculate]) => [resourceId, () => calculate()],
      ),
    );
  let shouldBindControl = bindControl;
  const calls = [];
  const craftCalls = [];
  const marketCalls = [];
  let storageReads = 0;
  const phases = [];
  const swaps = [];
  const draws = [];
  const hoverEvents = [];
  const nativeCostReads = [];
  let panelAvailable = true;

  if (manualCraftLumber !== undefined) {
    vue.createApp({
      el: "#resPlywood",
      methods: {
        craftCost(resourceId, volume) {
          assert.equal(resourceId, "Plywood");
          assert.equal(volume, 1);
          return "<div>Lumber 100</div>";
        },
        craft(resourceId, volume) {
          assert.equal(resourceId, "Plywood");
          craftCalls.push(volume);
          gameRoot.resource.Lumber.amount -= 100 * volume;
          gameRoot.resource.Plywood.amount += volume;
        },
      },
    });
  }

  const projectCosts = (percent, builtProjectId) => {
    const costs = adjustArpaCosts(
      nativeProjectDefinitions[builtProjectId].cost,
    );
    let description = "";
    const resources = page.Object.keys(costs);
    const perPercentCosts = {};
    resources.forEach((resourceId) => {
      const fullCost = Number(costs[resourceId]());
      perPercentCosts[resourceId] = fullCost / 100;
      const amount = +(fullCost * (Number(percent) / 100)).toFixed(0);
      description += `${resourceId}: ${amount} `;
    });
    const result = nativeCostDisplayText ?? description;
    nativeCostReads.push({
      resources: [...resources],
      perPercentCosts,
      result,
    });
    return result;
  };
  const bindProject = (drawnProjectId) => {
    const project = gameRoot.arpa[drawnProjectId];
    if (project === undefined) {
      gameRoot.arpa[drawnProjectId] = { rank: 0, complete: progress };
    }
    const build = (builtProjectId, steps) => {
      calls.push([builtProjectId, steps]);
      const state = gameRoot.arpa[builtProjectId];
      const actualSteps = nativeActualSteps ?? steps;
      const costs = adjustArpaCosts(
        nativeProjectDefinitions[builtProjectId].cost,
      );
      const amounts = Object.entries(costs).map(([resourceId, calculate]) => [
        resourceId,
        gameRoot.resource[resourceId].amount,
        (Number(calculate()) / 100) * actualSteps,
      ]);
      if (amounts.some(([, available, cost]) => available < cost)) {
        return false;
      }
      for (const [resourceId, , cost] of amounts) {
        gameRoot.resource[resourceId].amount -=
          nativeResourceDeductions?.[resourceId] ?? cost;
      }
      state.complete += actualSteps;
      if (state.complete >= 100) {
        state.rank += 1;
        state.complete = 0;
        const grant = nativeProjectDefinitions[builtProjectId].grant;
        gameRoot.tech[grant] = state.rank;
        // DeadSpace src/arpa.js at db38e2af831907d49aeb5348d678d8d8745d6c3f changes this metadata.
        if (builtProjectId === "monument") gameRoot.arpa.m_type = "Statue";
      }
      afterNativeBuild?.(gameRoot, builtProjectId);
      return true;
    };
    return createProjectRow({
      document,
      id: drawnProjectId,
      onBuild: build,
      onProjectCosts: projectCosts,
      vue,
      bindControl: shouldBindControl,
      hoverEvents,
      displayCost: drawnDisplayCost,
    });
  };

  const drawArpaPanel = () => {
    if (!panelAvailable) {
      draws.push("panel-disabled");
      return;
    }
    const parent = document.getElementById("mTabArpa");
    if (parent === null) {
      draws.push("target-missing");
      return;
    }
    parent.replaceChildren();
    const physics = element("div", { id: "arpaPhysics" });
    parent.appendChild(physics);
    for (const drawnProjectId of page.Object.keys(nativeProjectDefinitions)) {
      const eligible =
        drawnProjectId !== "surface_elevator" ||
        (gameRoot.tech.high_tech >= 7 && gameRoot.race.iceage === true);
      if (eligible) physics.appendChild(bindProject(drawnProjectId));
    }
    if (gameRoot.tech.genetics > 1) {
      vue.createApp({ el: "#arpaSequence", methods: { toggle() {} } });
    }
    draws.push({
      parentId: parent.id,
      physics: document.querySelectorAll("#arpaPhysics").length,
      rows: document.querySelectorAll("#arpaPhysics .arpaProject").length,
      controls: pageCapture.controls.capturedElementIds(),
    });
  };

  vue.createApp({
    el: "#mainColumn div.content",
    methods: {
      swapTab(index) {
        swaps.push(index);
        if (index === 5) drawArpaPanel();
        return index;
      },
    },
  });
  if (currentTab === 5) drawArpaPanel();
  if (marketStorage) {
    gameRoot.resource.Crates = { amount: 0, max: 100, display: false };
    gameRoot.resource.Containers = { amount: 0, max: 100, display: false };
    gameRoot.resource.Food = {
      amount: 0,
      max: 100,
      display: true,
      diff: 0,
      value: 1,
      trade: 0,
      stackable: true,
    };
    const marketQuantityOptions = {
      el: "#market-qty",
      data: gameRoot.city.market,
      methods: { setQty() {} },
    };
    vue.createApp(marketQuantityOptions);
    vue.createApp({
      el: "#mTabResource",
      methods: {
        swapTab(index) {
          gameRoot.settings.marketTabs = index;
          if (index === 0) {
            vue.createApp(marketQuantityOptions);
            vue.createApp(marketFoodOptions);
          }
        },
      },
    });
    vue.createApp({
      el: "#createHead",
      methods: {
        buildCrateDesc: () => {
          storageReads++;
          return "Cost 1 Capacity 10";
        },
        buildContainerDesc: () => {
          storageReads++;
          return "Cost 1 Capacity 20";
        },
      },
    });
    const marketFoodOptions = {
      el: "#market-Food",
      methods: {
        autoBuy() {},
        autoSell() {},
        zero() {},
        purchase() {
          marketCalls.push("purchase");
        },
        sell() {},
      },
    };
    vue.createApp(marketFoodOptions);
  }
  const worker = new page.Worker("evolve/evolve.js");
  worker.addEventListener("message", () => {});

  let savedSettings = JSON.stringify({
    masterScriptToggle: true,
    autoBuild: true,
    autoARPA: true,
    tickRate: 1,
    arpaStep: 5,
    arpaScaleWeighting: false,
    ...scriptSettings,
  });
  const errors = [];
  const logs = [];
  const periodsSeen = [];
  pageCapture.periods.subscribe((period) => periodsSeen.push(period.periods));
  const diagnostics = {
    readPerformanceEnabled: () => true,
    nowMs: () => 0,
    recordPerformance: (name) => phases.push(name),
    recordCount: () => {},
    flushPerformance: () => {},
  };
  const stop = startCapturedRuntime({
    pageCapture: withCapturedTechMechanicsFixture(pageCapture),
    document,
    settingsHostWindow: page,
    keyboardEvent: class {},
    mouseEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    storage: {
      getItem: () => savedSettings,
      setItem: (_key, value) => {
        savedSettings = value;
      },
    },
    diagnostics,
    log: (message) => logs.push(message),
    logError: (message) => errors.push(message),
  });

  return {
    calls,
    craftCalls,
    marketCalls,
    storageReads: () => storageReads,
    phases,
    captureComplete: pageCapture.isComplete(),
    draws,
    hoverEvents,
    nativeCostReads,
    errors,
    logs,
    periodsSeen,
    gameRoot,
    document,
    readSettings: () => JSON.parse(savedSettings),
    setPanelAvailable(value) {
      panelAvailable = value;
    },
    redrawProject({ displayCost, perPercentCost, bindControl: bind }) {
      drawnDisplayCost = displayCost;
      actualPerPercentCost = perPercentCost;
      shouldBindControl = bind;
      drawArpaPanel();
    },
    setOfferPrice(displayCost, perPercentCost) {
      drawnDisplayCost = displayCost;
      actualPerPercentCost = perPercentCost;
    },
    swaps,
    tick(periods = 1) {
      worker.dispatch({ loop: "main", periods });
    },
    workerListenerCount: worker.listeners.length,
    dispose() {
      stop();
      pageCapture.uninstall();
    },
  };
}

function withScenario(options, run) {
  const scenario = makeScenario(options);
  try {
    run(scenario);
  } finally {
    scenario.dispose();
  }
}

// This is the reported blocker in its production composition: the actual game starts with an
// empty portal record before Mech Bay is built. Mech-first demand must not suppress the LHC build.
withScenario(
  {
    progress: 20,
    scriptSettings: {
      autoBuild: true,
      autoARPA: true,
      autoMech: true,
      prestigeMADIgnoreArpa: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
      arpaStep: 5,
      mechBuild: "random",
      buildingMechsFirst: true,
    },
  },
  (scenario) => {
    assert.deepEqual(scenario.gameRoot.portal, {});
    scenario.tick();
    assert.deepEqual(
      scenario.calls,
      [["lhc", 5]],
      `runtime did not buy LHC: ${JSON.stringify({
        errors: scenario.errors,
        draws: scenario.draws,
        hoverEvents: scenario.hoverEvents,
        swaps: scenario.swaps,
        logs: scenario.logs,
        periodsSeen: scenario.periodsSeen,
        captureComplete: scenario.captureComplete,
        workerListenerCount: scenario.workerListenerCount,
      })}`,
    );
    assert.equal(
      scenario.gameRoot.arpa.lhc.complete,
      25,
      JSON.stringify({
        calls: scenario.calls,
        state: scenario.gameRoot.arpa.lhc,
        logs: scenario.logs,
        errors: scenario.errors,
      }),
    );
    assert.equal(scenario.gameRoot.arpa.lhc.rank, 0);
    assert.equal(scenario.gameRoot.settings.civTabs, 2);
    assert.ok(scenario.swaps.includes(5), "ARPA was discovered off-tab");
  },
);

// A freshly offered DeadSpace project is unavailable to defaults before its first ARPA draw.
// That draw adds the id to game.arpa; the next runtime refresh supplies missing settings, without
// an automation-settings UI visit, and the captured action builds it.
withScenario(
  {
    projectId: "surface_elevator",
    progress: 0,
    initialProject: false,
    scriptSettings: { prestigeMADIgnoreArpa: true },
  },
  (scenario) => {
    scenario.tick();
    assert.deepEqual(scenario.calls, []);
    assert.equal(scenario.gameRoot.arpa.surface_elevator.complete, 0);
    scenario.tick();
    assert.deepEqual(scenario.calls, [["surface_elevator", 5]]);
    assert.equal(scenario.gameRoot.arpa.surface_elevator.complete, 5);
    assert.equal(scenario.readSettings().arpa_surface_elevator, true);
    assert.equal(scenario.readSettings().arpa_w_surface_elevator, 1);
  },
);

// The captured native closures survive row redraws, and their live cost functions reprice without
// another panel draw or a replacement build control.
withScenario(
  {
    progress: 20,
    scriptSettings: {
      prestigeMADIgnoreArpa: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 5]]);

    scenario.redrawProject({
      displayCost: { Money: 20, Knowledge: 6 },
      perPercentCost: { Money: 20.2, Knowledge: 6.2 },
      bindControl: false,
    });
    const drawsAfterManualRedraw = scenario.draws.length;
    scenario.tick();
    assert.deepEqual(
      scenario.calls,
      [
        ["lhc", 5],
        ["lhc", 5],
      ],
      "the retained native build remains usable after the row is redrawn",
    );
    assert.equal(scenario.draws.length, drawsAfterManualRedraw);
    assert.deepEqual(scenario.hoverEvents, []);

    scenario.redrawProject({
      displayCost: { Money: 20, Knowledge: 6 },
      perPercentCost: { Money: 20.2, Knowledge: 6.2 },
      bindControl: true,
    });
    scenario.gameRoot.resource.Money.amount = 75;
    const drawsBeforeRetry = scenario.draws.length;
    scenario.tick();
    assert.equal(scenario.draws.length, drawsBeforeRetry);
    assert.deepEqual(
      scenario.calls,
      [
        ["lhc", 5],
        ["lhc", 5],
      ],
      "the current native price must gate an unaffordable project",
    );
  },
);

// The native closure's final adjusted record can replace project resource ids. Its opaque returned
// text and rounded display values are deliberately unusable as a price source.
withScenario(
  {
    projectId: "lhc",
    nativePerPercentCost: { Money: 10.24, Cement: 40.2 },
    nativeCostAdjustment(costs, root) {
      if (!root.race.flier) return costs;
      const { Cement, ...remaining } = costs;
      return {
        ...remaining,
        // Pinned rank-one traits.flier.vars()[0] is 5; flierAdjust rounds the substituted amount.
        Stone: () => Math.round(Cement() * 1.75 * 0.95),
      };
    },
    nativeCostDisplayText: "localized output with no resource amounts",
    extraNativeResources: ["Stone"],
    scriptSettings: {
      prestigeMADIgnoreArpa: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.gameRoot.race.flier = true;
    scenario.tick();
    const nativeRead = scenario.nativeCostReads.at(-1);
    assert.deepEqual(nativeRead.resources, ["Money", "Stone"]);
    assert.equal(Object.hasOwn(nativeRead.perPercentCosts, "Cement"), false);
    assert.deepEqual(nativeRead.perPercentCosts, {
      Money: 10.24,
      Stone: 66.83,
    });
    assert.equal(
      nativeRead.result,
      "localized output with no resource amounts",
      "the native price text is opaque to the adapter",
    );
    assert.deepEqual(scenario.calls, [["lhc", 5]]);
    assert.equal(scenario.gameRoot.resource.Stone.amount, 100000 - 66.83 * 5);
    assert.equal(scenario.draws.length, 1);
    assert.deepEqual(scenario.hoverEvents, []);
  },
);

withScenario(
  {
    projectId: "stock_exchange",
    nativePerPercentCost: { Money: 10.24, Plywood: 12.25 },
    nativeCostAdjustment(costs, root) {
      if (!root.race.smoldering) return costs;
      const { Plywood, ...remaining } = costs;
      return {
        ...Object.fromEntries(
          Object.entries(remaining).map(([resourceId, calculate]) => [
            resourceId,
            () => Math.round(calculate() * 0.9),
          ]),
        ),
        // Pinned smolderAdjust rounds twice the native Plywood cost into Chrysotile.
        Chrysotile: () => Math.round(Plywood() * 2) || 0,
      };
    },
    nativeCostDisplayText: "localized output with no resource amounts",
    extraNativeResources: ["Chrysotile"],
    scriptSettings: {
      prestigeMADIgnoreArpa: true,
      arpa_stock_exchange: true,
      arpa_p_stock_exchange: 0,
      arpa_m_stock_exchange: -1,
      arpa_w_stock_exchange: 2,
    },
  },
  (scenario) => {
    scenario.gameRoot.race.iceage = false;
    scenario.gameRoot.race.smoldering = true;
    scenario.tick();
    const nativeRead = scenario.nativeCostReads.at(-1);
    assert.deepEqual(nativeRead.resources, ["Money", "Chrysotile"]);
    assert.equal(Object.hasOwn(nativeRead.perPercentCosts, "Plywood"), false);
    assert.deepEqual(nativeRead.perPercentCosts, {
      Money: 9.22,
      Chrysotile: 24.5,
    });
    assert.equal(
      nativeRead.result,
      "localized output with no resource amounts",
      "the native price text is opaque to the adapter",
    );
    assert.deepEqual(scenario.calls, [["stock_exchange", 5]]);
    assert.equal(
      scenario.gameRoot.resource.Chrysotile.amount,
      100000 - 24.5 * 5,
    );
    assert.equal(scenario.draws.length, 1);
    assert.deepEqual(scenario.hoverEvents, []);
  },
);

// The closure's adjusted wrapper record is a current-state answer. A government or Engineer change
// must be reflected on the next read without another Physics draw.
withScenario(
  {
    projectId: "lhc",
    nativePerPercentCost: { Knowledge: 10.24 },
    nativeCostAdjustment(costs, root) {
      let adjusted = costs;
      // Pinned arpa.js::engineerAdjust creates this wrapper only when geneRank is active.
      if (root.genes.engineer > 0) {
        adjusted = Object.fromEntries(
          Object.entries(adjusted).map(([resourceId, calculate]) => [
            resourceId,
            () => calculate() * (root.genes.engineer > 0 ? 0.98 : 1),
          ]),
        );
      }
      // At fixture high_tech 7, civics.js returns an 8% Knowledge discount.
      if (root.civic.govern?.type === "technocracy") {
        adjusted = Object.fromEntries(
          Object.entries(adjusted).map(([resourceId, calculate]) => [
            resourceId,
            () =>
              resourceId === "Knowledge"
                ? Math.round(calculate() * 0.92)
                : calculate(),
          ]),
        );
      }
      return adjusted;
    },
    scriptSettings: {
      prestigeMADIgnoreArpa: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    const readCurrentNativePrice = () =>
      scenario.nativeCostReads.at(-1).perPercentCosts.Knowledge;

    scenario.tick();
    assert.equal(readCurrentNativePrice(), 10.24);
    const drawsAfterCapture = scenario.draws.length;

    scenario.gameRoot.civic.govern = { type: "technocracy" };
    scenario.tick();
    assert.equal(readCurrentNativePrice(), 9.42);
    assert.equal(scenario.draws.length, drawsAfterCapture);

    scenario.gameRoot.civic.govern.type = "democracy";
    scenario.tick();
    assert.equal(readCurrentNativePrice(), 10.24);
    assert.equal(scenario.draws.length, drawsAfterCapture);

    scenario.gameRoot.genes.engineer = 1;
    scenario.tick();
    assert.equal(readCurrentNativePrice(), 10.0352);
    assert.equal(scenario.draws.length, drawsAfterCapture);
    assert.deepEqual(scenario.hoverEvents, []);
  },
);

// An unreadable live project value invalidates the offer sample. Repairing it restores the same
// retained authority, with no panel redraw.
withScenario(
  {
    progress: 20,
    scriptSettings: {
      prestigeMADIgnoreArpa: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    scenario.gameRoot.arpa.lhc.complete = "invalid";
    const errorsBeforeFailure = scenario.errors.length;
    scenario.tick();
    assert.ok(
      scenario.errors.length > errorsBeforeFailure ||
        scenario.logs.some((message) =>
          message.includes("offered project catalog is unreadable"),
        ),
    );

    scenario.gameRoot.arpa.lhc.complete = 25;
    scenario.redrawProject({
      displayCost: { Money: 20, Knowledge: 6 },
      perPercentCost: { Money: 20.2, Knowledge: 6.2 },
      bindControl: true,
    });
    scenario.gameRoot.resource.Money.amount = 75;
    const drawsBeforeRetry = scenario.draws.length;
    scenario.tick();
    assert.equal(scenario.draws.length, drawsBeforeRetry);
    assert.deepEqual(
      scenario.calls,
      [["lhc", 5]],
      "an unaffordable fresh native price is not bought",
    );
  },
);

// On the player's selected ARPA tab, capture forces one draw to observe the native registry.
// Later price and project reads use the retained closures.
withScenario(
  {
    currentTab: 5,
    scriptSettings: {
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    assert.deepEqual(
      scenario.calls,
      [["lhc", 5]],
      JSON.stringify({
        errors: scenario.errors,
        logs: scenario.logs,
        draws: scenario.draws,
        hoverEvents: scenario.hoverEvents,
        swaps: scenario.swaps,
      }),
    );
    assert.equal(scenario.swaps.includes(5), true);
  },
);

// These project-level gates are exercised through the same composition and never invoke build.
for (const [label, options] of [
  ["disabled", { scriptSettings: { arpa_lhc: false } }],
  ["zero weighting", { scriptSettings: { arpa_w_lhc: 0 } }],
  ["maximum", { rank: 2, scriptSettings: { arpa_m_lhc: 2 } }],
  [
    "early-game suppression",
    {
      scriptSettings: { prestigeMADIgnoreArpa: true, arpa_lhc: true },
      gameTechMad: 0,
    },
  ],
  ["insufficient current resources", { money: 0 }],
  ["capacity", { moneyMaximum: 5 }],
  ["queued project", { queue: [{ id: "arpalhc" }] }],
  ["uncaptured build control", { bindControl: false }],
]) {
  const scenarioOptions = { scriptSettings: { arpa_lhc: true }, ...options };
  if (options.gameTechMad !== undefined) {
    delete scenarioOptions.gameTechMad;
  }
  withScenario(scenarioOptions, (scenario) => {
    if (options.gameTechMad !== undefined) {
      scenario.gameRoot.tech.mad = options.gameTechMad;
    }
    scenario.tick();
    assert.deepEqual(scenario.calls, [], `${label} must not invoke ARPA build`);
  });
}

// Evolve's checkCosts treats Number(undefined) for a visible resource's max as no ceiling. The
// captured path must still use the held amount and invoke the game's real build closure.
withScenario(
  {
    uninitializedMoneyMaximum: true,
    scriptSettings: {
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 5]]);
    assert.equal(scenario.gameRoot.arpa.lhc.complete, 25);
  },
);

// The game wraps progress at 100 and advances rank. The executor verifies the exact sampled price,
// including every resource and the grant, while reporting the native charge on the success path.
withScenario(
  {
    progress: 98,
    rank: 4,
    scriptSettings: {
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    const moneyBefore = scenario.gameRoot.resource.Money.amount;
    const knowledgeBefore = scenario.gameRoot.resource.Knowledge.amount;
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 2]]);
    assert.equal(scenario.gameRoot.arpa.lhc.complete, 0);
    assert.equal(scenario.gameRoot.arpa.lhc.rank, 5);
    assert.equal(scenario.gameRoot.tech.captured_arpa_test_grant, 5);
    assert.ok(
      Math.abs(moneyBefore - scenario.gameRoot.resource.Money.amount - 20.4) <
        1e-9,
    );
    assert.ok(
      Math.abs(
        knowledgeBefore - scenario.gameRoot.resource.Knowledge.amount - 6.4,
      ) < 1e-9,
    );
  },
);

// DeadSpace db38e2af831907d49aeb5348d678d8d8745d6c3f's Monument completion changes global.arpa.m_type
// metadata alongside the registered Monument project, without changing another project record.
withScenario(
  {
    projectId: "monument",
    progress: 99,
    rank: 4,
    scriptSettings: {
      arpa_lhc: false,
      arpa_monument: true,
      arpa_p_monument: 0,
      arpa_m_monument: -1,
      arpa_w_monument: 1,
      arpaStep: 5,
    },
  },
  (scenario) => {
    const moneyBefore = scenario.gameRoot.resource.Money.amount;
    const knowledgeBefore = scenario.gameRoot.resource.Knowledge.amount;
    scenario.tick();
    assert.deepEqual(scenario.calls, [["monument", 1]]);
    assert.equal(scenario.gameRoot.arpa.monument.rank, 5);
    assert.equal(scenario.gameRoot.arpa.monument.complete, 0);
    assert.equal(scenario.gameRoot.arpa.m_type, "Statue");
    assert.equal(scenario.gameRoot.tech.captured_arpa_test_grant, 5);
    assert.ok(
      Math.abs(moneyBefore - scenario.gameRoot.resource.Money.amount - 10.2) <
        1e-9,
    );
    assert.ok(
      Math.abs(
        knowledgeBefore - scenario.gameRoot.resource.Knowledge.amount - 3.2,
      ) < 1e-9,
    );
    assert.equal(
      scenario.logs.some((message) =>
        message.includes("ARPA action failed/stale"),
      ),
      false,
      JSON.stringify(scenario.logs),
    );
  },
);

// The same bracket still rejects a mutation to a second project in the captured registry.
withScenario(
  {
    projectId: "monument",
    additionalProjectIds: ["lhc"],
    progress: 99,
    rank: 4,
    afterNativeBuild(gameRoot, builtProjectId) {
      if (builtProjectId === "monument") gameRoot.arpa.lhc.complete += 1;
    },
    scriptSettings: {
      arpa_lhc: false,
      arpa_monument: true,
      arpa_p_monument: 0,
      arpa_m_monument: -1,
      arpa_w_monument: 1,
      arpaStep: 5,
    },
  },
  (scenario) => {
    scenario.tick();
    assert.deepEqual(scenario.calls, [["monument", 1]]);
    assert.equal(scenario.gameRoot.arpa.monument.rank, 5);
    assert.equal(scenario.gameRoot.arpa.lhc.complete, 24);
    assert.ok(
      scenario.logs.some(
        (message) =>
          message ===
          "ARPA action failed/stale: monument the native build changed an unrelated project record",
      ),
      JSON.stringify(scenario.logs),
    );
  },
);

// A verified command must execute every percentage point it priced. Partial, empty, and excess
// native mutations are all stale even when the native closure returns normally.
for (const actualSteps of [2, 0, 6]) {
  withScenario(
    {
      progress: 20,
      nativeActualSteps: actualSteps,
      scriptSettings: {
        arpa_lhc: true,
        arpa_p_lhc: 0,
        arpa_m_lhc: -1,
        arpa_w_lhc: 2,
      },
    },
    (scenario) => {
      scenario.tick();
      assert.deepEqual(scenario.calls, [["lhc", 5]]);
      assert.equal(scenario.gameRoot.arpa.lhc.complete, 20 + actualSteps);
      assert.ok(
        scenario.logs.some(
          (message) =>
            message ===
            `ARPA action failed/stale: lhc the native build moved ${actualSteps} of 5 points`,
        ),
        JSON.stringify(scenario.logs),
      );
    },
  );
}

// Rank and grant completion do not excuse an incorrect deduction from any sampled resource.
withScenario(
  {
    progress: 98,
    rank: 4,
    nativeResourceDeductions: { Knowledge: 0 },
    scriptSettings: {
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    const knowledgeBefore = scenario.gameRoot.resource.Knowledge.amount;
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 2]]);
    assert.equal(scenario.gameRoot.arpa.lhc.complete, 0);
    assert.equal(scenario.gameRoot.arpa.lhc.rank, 5);
    assert.equal(scenario.gameRoot.tech.captured_arpa_test_grant, 5);
    assert.equal(scenario.gameRoot.resource.Knowledge.amount, knowledgeBefore);
    assert.ok(
      scenario.logs.some(
        (message) =>
          message ===
          "ARPA action failed/stale: lhc the native build spent an unexpected Knowledge amount",
      ),
      JSON.stringify(scenario.logs),
    );
  },
);

// Once captured, native project mechanics remain usable without a mounted Physics panel.
withScenario(
  {
    progress: 95,
    scriptSettings: {
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    assert.equal(scenario.gameRoot.arpa.lhc.complete, 0);
    assert.equal(scenario.gameRoot.arpa.lhc.rank, 1);
    scenario.setPanelAvailable(false);
    const drawsBeforeNextCycle = scenario.draws.length;
    scenario.tick();
    assert.deepEqual(scenario.calls, [
      ["lhc", 5],
      ["lhc", 5],
    ]);
    assert.equal(scenario.draws.length, drawsBeforeNextCycle);
    assert.deepEqual(scenario.errors, []);
  },
);

// A Building-only pass keeps the established ARPA price while rank and tech are unchanged.
withScenario(
  {
    progress: 95,
    rank: 1,
    money: 0,
    scriptSettings: {
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    const drawsAtRankOne = scenario.draws.length;
    scenario.gameRoot.arpa.lhc.complete = 98;
    scenario.tick();
    assert.equal(scenario.draws.length, drawsAtRankOne);
    assert.deepEqual(scenario.calls, []);
  },
);

withScenario(
  {
    progress: 95,
    rank: 1,
    marketStorage: true,
    scriptSettings: {
      autoMarket: true,
      autoStorage: true,
      autoARPA: true,
      buyFood: true,
      res_buy_r_Food: 0.9,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    assert.equal(scenario.gameRoot.arpa.lhc.rank, 2);
    const marketCallsBefore = scenario.marketCalls.length;
    const drawsBefore = scenario.draws.length;
    const phasesBefore = scenario.phases.length;
    const storageReadsBefore = scenario.storageReads();
    const errorsBefore = scenario.errors.length;
    scenario.setOfferPrice(
      { Money: 25, Knowledge: 9 },
      { Money: 25.2, Knowledge: 9.2 },
    );
    scenario.gameRoot.resource.Money.amount = 75;
    scenario.tick();
    const nextPhases = scenario.phases.slice(phasesBefore);
    assert.equal(scenario.draws.length, drawsBefore);
    assert.ok(
      nextPhases.indexOf("autoMarket.adjustTradeRoutes") <
        nextPhases.indexOf("autoBuild.beginCycle"),
      JSON.stringify(nextPhases),
    );
    assert.ok(
      nextPhases.includes("autoMarket.readSell"),
      JSON.stringify({ nextPhases, errors: scenario.errors }),
    );
    assert.ok(
      nextPhases.includes("autoStorage.read"),
      JSON.stringify(nextPhases),
    );
    assert.ok(
      nextPhases.indexOf("autoStorage.read") <
        nextPhases.indexOf("autoBuild.beginCycle"),
      JSON.stringify(nextPhases),
    );
    assert.ok(
      nextPhases.indexOf("autoBuild.beginCycle") <
        nextPhases.indexOf("autoBuild.sampleCandidate"),
      JSON.stringify(nextPhases),
    );
    assert.ok(scenario.storageReads() > storageReadsBefore);
    assert.ok(
      scenario.errors
        .slice(errorsBefore)
        .every((message) => !message.startsWith("autoStorage stopped")),
      JSON.stringify(scenario.errors),
    );
    assert.equal(
      nextPhases
        .slice(0, nextPhases.indexOf("autoMarket.adjustTradeRoutes"))
        .includes("autoBuild.sampleCandidate"),
      false,
      JSON.stringify(nextPhases),
    );
    assert.equal(
      scenario.errors.some((message) =>
        message.includes("construction saving cost unavailable"),
      ),
      false,
      JSON.stringify(scenario.errors),
    );
    assert.equal(scenario.marketCalls.length, marketCallsBefore);
  },
);

withScenario(
  {
    progress: 95,
    rank: 1,
    marketStorage: true,
    scriptSettings: {
      autoMarket: true,
      autoStorage: true,
      autoARPA: true,
      buyFood: true,
      res_buy_r_Food: 0.9,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    },
  },
  (scenario) => {
    scenario.tick();
    scenario.setOfferPrice(
      { Money: 5, Knowledge: 1 },
      { Money: 5.2, Knowledge: 1.2 },
    );
    scenario.gameRoot.resource.Money.amount = 75;
    scenario.tick();
    assert.deepEqual(
      scenario.marketCalls,
      ["purchase", "purchase"],
      JSON.stringify(scenario.errors),
    );
  },
);

// Progression owns an exactly-affordable Lumber holding before the captured Craft row can spend it.
withScenario(
  {
    progress: 20,
    manualCraftLumber: 900,
    scriptSettings: {
      autoBuild: true,
      autoARPA: true,
      autoCraft: true,
      craftPlywood: true,
      prestigeMADIgnoreArpa: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
      arpaStep: 5,
    },
  },
  (scenario) => {
    const initialProgress = scenario.gameRoot.arpa.lhc.complete;
    scenario.tick();
    assert.equal(scenario.gameRoot.arpa.lhc.complete, initialProgress);
    assert.equal(scenario.gameRoot.resource.Lumber.amount, 900);
    assert.deepEqual(scenario.craftCalls, []);

    scenario.gameRoot.resource.Lumber.amount = 1000;
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 5]]);
    assert.equal(scenario.gameRoot.arpa.lhc.complete, initialProgress + 5);
    assert.equal(scenario.gameRoot.resource.Lumber.amount, 0);
    assert.deepEqual(
      scenario.craftCalls,
      [],
      "captured Plywood craft must not spend the Lumber before the LHC action",
    );
  },
);

console.log("captured-arpa-runtime ok");
