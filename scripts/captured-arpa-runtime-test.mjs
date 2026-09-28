import assert from "node:assert/strict";

import { installPageCapture } from "../src/adapters/evolve/page-capture.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

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
    methods: bindControl ? { build: onBuild } : { other: () => undefined },
  });
  return row;
}

function makeScenario({
  projectId = "lhc",
  progress = 20,
  rank = 0,
  currentTab = 2,
  initialProject = true,
  scriptSettings = {},
  money = 100000,
  moneyMaximum = 1000000,
  uninitializedMoneyMaximum = false,
  queue = [],
  bindControl = true,
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
  const document = createTestDocument(pageBody);

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
    },
    race: { species: "human", iceage: true },
    stats: { days: 100, reset: 1, resets: 1 },
    tech: { mad: 1, high_tech: 7 },
    city: {},
    civic: {},
    arpa: initialProject ? { [projectId]: { rank, complete: progress } } : {},
    queue: { queue },
  };

  const page = {
    Worker: FakeWorker,
    document,
    location: { href: "https://evolvebeta.github.io/Evolve/" },
    navigator: { userAgent: "captured-arpa-test" },
  };
  const pageCapture = installPageCapture(page);
  const vue = makeVue();
  page.Vue = vue;
  vue.reactive(gameRoot);

  let drawnDisplayCost = { Money: 10, Knowledge: 3 };
  let actualPerPercentCost = { Money: 10.2, Knowledge: 3.2 };
  let shouldBindControl = bindControl;
  const calls = [];
  const swaps = [];
  const draws = [];
  const hoverEvents = [];
  let panelAvailable = true;

  const bindProject = () => {
    const project = gameRoot.arpa[projectId];
    if (project === undefined) {
      gameRoot.arpa[projectId] = { rank: 0, complete: progress };
    }
    const build = (builtProjectId, steps) => {
      calls.push([builtProjectId, steps]);
      const state = gameRoot.arpa[builtProjectId];
      const amounts = Object.entries(actualPerPercentCost).map(
        ([resourceId, amount]) => [
          resourceId,
          gameRoot.resource[resourceId].amount,
          amount * steps,
        ],
      );
      if (amounts.some(([, available, cost]) => available < cost)) {
        return false;
      }
      for (const [resourceId, , cost] of amounts) {
        gameRoot.resource[resourceId].amount -= cost;
      }
      state.complete += steps;
      if (state.complete >= 100) {
        state.rank += 1;
        state.complete = 0;
      }
      return true;
    };
    return createProjectRow({
      document,
      id: projectId,
      onBuild: build,
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
    const eligible =
      projectId !== "surface_elevator" ||
      (gameRoot.tech.high_tech >= 7 && gameRoot.race.iceage === true);
    if (eligible) physics.appendChild(bindProject());
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
    recordPerformance: () => {},
    recordCount: () => {},
    flushPerformance: () => {},
  };
  const stop = startCapturedRuntime({
    pageCapture,
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
    captureComplete: pageCapture.isComplete(),
    draws,
    hoverEvents,
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

// A normal post-MAD LHC run succeeds through page capture, off-tab discovery, the real drawn
// tooltip reader, settings lifecycle, project planning, the merged construction runner, and the
// captured Vue build closure. The player's main tab is restored after discovery.
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

// When a cached offer can no longer be restated, the next cycle must draw again. Otherwise a
// rebound control could make the old price look usable after the panel's price has changed.
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
    scenario.tick();
    assert.deepEqual(
      scenario.calls,
      [["lhc", 5]],
      "an offer without a current build handle must not act",
    );

    scenario.redrawProject({
      displayCost: { Money: 20, Knowledge: 6 },
      perPercentCost: { Money: 20.2, Knowledge: 6.2 },
      bindControl: true,
    });
    scenario.gameRoot.resource.Money.amount = 75;
    const drawsBeforeRetry = scenario.draws.length;
    scenario.tick();
    assert.equal(
      scenario.draws.length,
      drawsBeforeRetry + 1,
      "a failed restatement must invalidate the held panel sample",
    );
    assert.deepEqual(
      scenario.calls,
      [["lhc", 5]],
      "the refreshed price must gate an unaffordable project before invocation",
    );
  },
);

// A malformed live project value throws during restatement. That still invalidates the held offer,
// so repairing the state cannot make a stale price usable on the following cycle.
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
    assert.ok(scenario.errors.length > errorsBeforeFailure);

    scenario.gameRoot.arpa.lhc.complete = 25;
    scenario.redrawProject({
      displayCost: { Money: 20, Knowledge: 6 },
      perPercentCost: { Money: 20.2, Knowledge: 6.2 },
      bindControl: true,
    });
    scenario.gameRoot.resource.Money.amount = 75;
    const drawsBeforeRetry = scenario.draws.length;
    scenario.tick();
    assert.equal(scenario.draws.length, drawsBeforeRetry + 1);
    assert.deepEqual(
      scenario.calls,
      [["lhc", 5]],
      "a thrown restatement must not leave a stale project price cached",
    );
  },
);

// On the player's selected ARPA tab, the project catalog observes its current draw. A separate
// research observation can use its own off-tab workspace, but it never redraws ARPA.
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
    assert.equal(scenario.swaps.includes(5), false);
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

// The game wraps progress at 100 and advances rank. The executor treats that as a verified build.
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
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 2]]);
    assert.equal(scenario.gameRoot.arpa.lhc.complete, 0);
    assert.equal(scenario.gameRoot.arpa.lhc.rank, 5);
  },
);

// A missing physics panel after a previously successful build is an unavailable catalog, not a
// valid empty list and never a reason to reuse the prior project's offer.
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
    scenario.tick();
    assert.deepEqual(scenario.calls, [["lhc", 5]]);
    assert.ok(
      scenario.errors.some((message) =>
        message.includes(
          "project panel, project rows, or captured build controls were unavailable",
        ),
      ),
    );
  },
);

console.log("captured-arpa-runtime ok");
