import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const stored = new Map();
const document = { hidden: false, querySelector: () => null };
let listExists = true;
let jqueryTrace = [];

function normalizeHtml(html) {
  return html.replace(/\s+/g, " ").trim();
}

function jquery(selector) {
  if (selector === "#script_planner-list") {
    return {
      length: listExists ? 1 : 0,
      html(value) {
        jqueryTrace.push([selector, normalizeHtml(value)]);
      },
    };
  }
  if (selector === "#script_planner-stats-text") {
    return {
      length: 1,
      html(value) {
        jqueryTrace.push([selector, normalizeHtml(value)]);
      },
    };
  }
  return {
    ready() {},
    length: 0,
    html() {},
  };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.updateBuildPlanner, "function");
assert.equal(typeof hooks.setBuildPlannerTestContext, "function");

function resource(title, overrides = {}) {
  return {
    title,
    currentQuantity: 0,
    maxQuantity: 1_000,
    income: 1,
    isUnlocked: () => true,
    ...overrides,
  };
}

function target(title, overrides = {}) {
  return {
    title,
    cost: {},
    weighting: 10,
    count: 0,
    is: {},
    extraDescription: "",
    isAffordable: () => true,
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  const targets = overrides.targets ?? [];
  return {
    settings: {
      buildPlannerUI: true,
      stateLogEnabled: false,
      autoBuild: true,
      autoARPA: false,
      ...overrides.settings,
    },
    settingsRaw: {
      buildPlannerCollapsed: false,
      ...overrides.settingsRaw,
    },
    state: {
      plannerFreshTick: 10,
      scriptTick: 10,
      unlockedBuildings: targets,
      queuedTargets: [],
      triggerTargets: [],
      plannerStats: null,
      ...overrides.state,
    },
    game: { global: { stats: { days: 80, reset: 4 } } },
    resources: overrides.resources ?? {},
    poly: { timeFormat: (seconds) => `T${seconds}` },
  };
}

function run(context) {
  jqueryTrace = [];
  hooks.setBuildPlannerTestContext(context);
  hooks.updateBuildPlanner();
  return jqueryTrace;
}

// The feature toggle is a complete short-circuit: no sampling and no page lookup.
let context = makeContext({
  targets: [target("Ignored")],
  settings: { buildPlannerUI: false },
  state: {
    plannerStats: {
      startDay: 1,
      day: 1,
      reset: 4,
      samples: {},
      total: 0,
    },
  },
});
assert.deepEqual(run(context), []);
assert.equal(context.state.plannerStats.total, 0);

// A hidden page still samples when state logging is enabled, but never draws. The 25th sample
// persists the complete updated planner state.
document.hidden = true;
stored.delete("ea_planner_stats");
const storageTarget = target("Storage Tower", {
  cost: { Iron: 100 },
  isAffordable: () => false,
});
context = makeContext({
  targets: [storageTarget],
  settings: { stateLogEnabled: true },
  resources: { Iron: resource("Iron", { maxQuantity: 50 }) },
  state: {
    plannerStats: {
      startDay: 20,
      day: 79,
      reset: 4,
      samples: { Iron: 24 },
      total: 24,
    },
  },
});
assert.deepEqual(run(context), []);
assert.deepEqual(JSON.parse(JSON.stringify(context.state.plannerStats)), {
  startDay: 20,
  day: 80,
  reset: 4,
  samples: { Iron: 25 },
  total: 25,
});
assert.equal(
  stored.get("ea_planner_stats"),
  JSON.stringify(context.state.plannerStats),
);

// Visible rendering covers every blocker class, queue/trigger labels, count formatting,
// description cleanup, the eight-row cap, and the top-five sampling summary.
document.hidden = false;
const stalledTarget = target("Stalled Lab", {
  cost: { Crystal: 20 },
  isAffordable: () => false,
  is: { multiSegmented: true },
  count: 3,
});
const incomeTarget = target("Copper Mine", {
  cost: { Copper: 100 },
  isAffordable: () => false,
});
const readyTarget = target("Ready House");
const lockedTarget = target("Locked Resource", {
  cost: { Locked: 100 },
  isAffordable: () => false,
});
const cappedOut = target("Ninth Target");
const renderedTargets = [
  {
    ...storageTarget,
    weighting: 12,
    count: 1,
    extraDescription:
      "AutoBuild weighting: 12<br>First reason<br>Second reason<br>",
  },
  { ...stalledTarget, weighting: 8 },
  { ...incomeTarget, weighting: 7 },
  { ...readyTarget, weighting: 6 },
  target("Fifth", { weighting: 5 }),
  target("Sixth", { weighting: 4 }),
  target("Seventh", { weighting: 3 }),
  { ...lockedTarget, weighting: 2 },
  target("Eighth", { weighting: 2 }),
  cappedOut,
];
context = makeContext({
  targets: renderedTargets,
  resources: {
    Iron: resource("Iron", { maxQuantity: 50 }),
    Crystal: resource("Crystal", { income: 0 }),
    Copper: resource("Copper", { income: 2 }),
    Locked: resource("Locked", { isUnlocked: () => false }),
  },
  state: {
    queuedTargets: [renderedTargets[0]],
    triggerTargets: [renderedTargets[1]],
    plannerStats: {
      startDay: 10,
      day: 79,
      reset: 4,
      samples: {
        Iron: 39,
        Copper: 30,
        Money: 15,
        Crystal: 10,
        Stone: 5,
        Coal: 1,
      },
      total: 99,
    },
  },
});
const trace = run(context);
assert.deepEqual(trace, [
  [
    "#script_planner-list",
    '<li> <div class="planner-row"> <span class="planner-name">Storage Tower #2 <span class="has-text-special">(queued)</span></span> <span class="planner-weight has-text-advanced">12</span> <span class="planner-time has-text-danger">Iron (storage)</span> </div> <div class="planner-note">First reason · Second reason</div> </li><li> <div class="planner-row"> <span class="planner-name">Stalled Lab <span class="has-text-special">(trigger)</span></span> <span class="planner-weight has-text-advanced">8</span> <span class="planner-time has-text-danger">Crystal (no income)</span> </div> </li><li> <div class="planner-row"> <span class="planner-name">Copper Mine</span> <span class="planner-weight has-text-advanced">7</span> <span class="planner-time has-text-warning">T50 (Copper)</span> </div> </li><li> <div class="planner-row"> <span class="planner-name">Ready House</span> <span class="planner-weight has-text-advanced">6</span> <span class="planner-time has-text-success">ready</span> </div> </li><li> <div class="planner-row"> <span class="planner-name">Fifth</span> <span class="planner-weight has-text-advanced">5</span> <span class="planner-time has-text-success">ready</span> </div> </li><li> <div class="planner-row"> <span class="planner-name">Sixth</span> <span class="planner-weight has-text-advanced">4</span> <span class="planner-time has-text-success">ready</span> </div> </li><li> <div class="planner-row"> <span class="planner-name">Seventh</span> <span class="planner-weight has-text-advanced">3</span> <span class="planner-time has-text-success">ready</span> </div> </li><li> <div class="planner-row"> <span class="planner-name">Locked Resource</span> <span class="planner-weight has-text-advanced">2</span> <span class="planner-time has-text-danger">Locked (locked)</span> </div> </li>',
  ],
  [
    "#script_planner-stats-text",
    'Iron 40% · Copper 30% · Money 15% · Crystal 10% · Stone 5%<div class="planner-note">Top target blocked by, since day 10 (100 samples)</div>',
  ],
]);
assert.equal(trace[0][1].includes("Ninth Target"), false);

// The remaining list-level branches retain their exact messages.
context = makeContext({
  settings: { autoBuild: false, autoARPA: false },
});
assert.deepEqual(run(context), [
  [
    "#script_planner-list",
    '<li class="planner-note">autoBuild / autoARPA disabled</li>',
  ],
]);

context = makeContext({ state: { plannerFreshTick: 9 } });
assert.deepEqual(run(context), [
  [
    "#script_planner-list",
    '<li class="planner-note">autoBuild idle (triggers or queue processing) — list from last update</li>',
  ],
]);

context = makeContext();
assert.deepEqual(run(context), [
  ["#script_planner-list", '<li class="planner-note">Nothing to build</li>'],
]);

listExists = false;
assert.deepEqual(run(makeContext()), []);

console.log("Build planner bundled characterization tests passed");
