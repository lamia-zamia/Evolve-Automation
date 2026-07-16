import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
const observers = [];
const elements = {};
const documentStub = {
  body: { appendChild: (node) => trace.push(["append", node.src]) },
  createElement: (tag) => ({ tag }),
  getElementById: (id) => elements[id] ?? null,
  querySelector: (selector) => (selector === "body" ? documentStub.body : null),
};
const jquery = () => ({ ready() {} });
jquery._data = () => ({ events: { keydown: [{}] } });
jquery.noConflict = () => trace.push(["no-conflict"]);
jquery.ui = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  document: documentStub,
  Node: { ELEMENT_NODE: 1 },
  localStorage: { getItem: () => null },
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      observers.push({ callback: this.callback, target, options });
    }
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  structuredClone,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const { initialiseScript, mainAutoEvolveScript } = hooks.scriptBootstrap;
const actions = {
  updateStandAloneSettings: () => trace.push(["standalone"]),
  updateStateFromSettings: () => trace.push(["state-from-settings"]),
  updateSettingsFromState: () => trace.push(["settings-from-state"]),
  verifyGameActions: () => trace.push(["verify"]),
  tooltipObserverCallback: () => trace.push(["tooltip"]),
  buildFilterRegExp: () => trace.push(["filter-build"]),
  filterLog: () => trace.push(["filter-log"]),
  schedule: (callback, delay) => trace.push(["schedule", callback.name, delay]),
  repeat: (callback, delay) => trace.push(["repeat", callback.name, delay]),
  alert: (message) => trace.push(["alert", message]),
  addErrorHandler: () => trace.push(["error-handler"]),
  addScriptStyle: () => trace.push(["style"]),
  keyManagerInit: () => trace.push(["keys"]),
  initialiseState: () => trace.push(["state-init"]),
  initialiseRaces: () => trace.push(["races-init"]),
  updateOverrides: () => trace.push(["overrides"]),
  automate: () => trace.push(["automate"]),
  automateLab: () => trace.push(["lab"]),
  importSettings: () => trace.push(["import"]),
  exportSettings: () => trace.push(["export"]),
  loadStateLog: () => ({ loaded: true }),
  triggerFileDownload: (...args) => trace.push(["download", ...args]),
  displayScriptWarningNode: (...args) => trace.push(["warning", ...args]),
};
const normalMission = {
  _vueBinding: "normal",
  isMission: () => true,
};
const jumpShip = {
  _vueBinding: "jump",
  isMission: () => true,
};
const pitAssault = {
  _vueBinding: "assault",
  isMission: () => true,
};
const ordinaryBuilding = {
  _vueBinding: "ordinary",
  isMission: () => false,
};
const buildings = {
  NormalMission: normalMission,
  BlackholeJumpShip: jumpShip,
  PitAssaultForge: pitAssault,
  Ordinary: ordinaryBuilding,
};
const projects = { Project: { _vueBinding: "project" } };
const jobs = { Farmer: { _originalId: "farmer" } };
const crafter = { Craftsman: { _originalId: "craftsman" } };
const triggers = [{ complete: true }, { complete: true }];
const state = {
  missionBuildingList: [],
  warnDebug: true,
  warnPreload: true,
  gameTicked: false,
  stateLog: null,
};
const game = {
  actions: { tech: { alpha: { id: "alpha-id" } } },
  global: {
    race: {},
    settings: { tabLoad: true },
    stats: { days: 42 },
  },
  breakdown: { p: { consume: {} } },
  adjustCosts: () => "adjust",
  loc: () => "loc",
  messageQueue: (...args) => trace.push(["game-message", ...args]),
  shipCosts: () => ({}),
};
const context = {
  game,
  state,
  settings: { tickSchedule: false },
  techIds: {},
  buildingIds: {},
  arpaIds: {},
  jobIds: {},
  buildings,
  projects,
  jobs,
  crafter,
  TriggerManager: { priorityList: triggers },
  WindowManager: { openedByScript: false, checkCallbacks() {} },
  KeyManager: {},
  poly: {
    messageQueue: (...args) => trace.push(["message", ...args]),
  },
  win: sandbox,
  safeMode: false,
  checkActions: true,
  actions,
};
elements.main = { id: "main" };
elements.msgQueueLog = { id: "log" };
elements.modalBox = { id: "modal" };

hooks.setScriptBootstrapTestContext(context);
initialiseScript();
assert.equal(context.techIds["alpha-id"].id, "alpha");
assert.deepEqual(Object.keys(context.buildingIds), [
  "normal",
  "jump",
  "assault",
  "ordinary",
]);
assert.deepEqual(state.missionBuildingList, [normalMission]);
assert.equal(context.arpaIds.project, projects.Project);
assert.equal(context.jobIds.farmer, jobs.Farmer);
assert.equal(context.jobIds.craftsman, crafter.Craftsman);
assert.deepEqual(
  triggers.map(({ complete }) => complete),
  [false, false],
);
assert.deepEqual(JSON.parse(JSON.stringify(trace.splice(0))), [
  ["standalone"],
  ["state-from-settings"],
  ["settings-from-state"],
  ["verify"],
  ["filter-build"],
]);
assert.equal(observers.length, 3);
assert.deepEqual(
  observers.map(({ target, options }) => [target, options.childList]),
  [
    [elements.main, true],
    [documentStub.body, true],
    [elements.msgQueueLog, true],
  ],
);

// Page readiness retry.
delete elements.queueColumn;
mainAutoEvolveScript();
assert.deepEqual(trace.splice(0), [["schedule", "mainAutoEvolveScript", 100]]);

// Debug-mode retry after the page exists but no game is exposed.
elements.queueColumn = {};
delete sandbox.evolve;
mainAutoEvolveScript();
assert.deepEqual(trace.splice(0), [
  ["alert", "You need to enable Debug Mode in settings for script to work"],
  ["schedule", "mainAutoEvolveScript", 100],
]);
assert.equal(state.warnDebug, false);

// Successful bootstrap, game-loop property hook, exports, and safe-mode warning.
sandbox.evolve = game;
state.missionBuildingList = [];
triggers.forEach((trigger) => (trigger.complete = true));
hooks.setScriptBootstrapTestContext({ ...context, safeMode: true, actions });
observers.length = 0;
mainAutoEvolveScript();
assert.deepEqual(JSON.parse(JSON.stringify(trace.splice(0))), [
  ["error-handler"],
  ["style"],
  ["keys"],
  ["state-init"],
  ["races-init"],
  ["standalone"],
  ["state-from-settings"],
  ["settings-from-state"],
  ["verify"],
  ["filter-build"],
  ["overrides"],
  ["repeat", "automateLab", 2500],
  [
    "warning",
    "Safe mode active",
    "Script safe mode is active to let you solve problems in your configuration.\nThe masterScriptToggle is always disabled in this mode, and your overrides don't get evaluated.\nFix the problems that required you to use this mode, then remove ?safemode from the URL to deactivate.",
    null,
  ],
  [
    "game-message",
    "Script safe mode is active to let you solve problems in your configuration.\nThe masterScriptToggle is always disabled in this mode, and your overrides don't get evaluated.\nFix the problems that required you to use this mode, then remove ?safemode from the URL to deactivate.",
    "warning",
    true,
    ["events", "major_events"],
  ],
]);
assert.equal(typeof sandbox.importAutomationSettings, "function");
assert.equal(typeof sandbox.exportAutomationSettings, "function");
assert.equal(typeof sandbox.eaExportStateLog, "function");
game.breakdown = { p: { consume: { Food: 1 } } };
assert.equal(state.gameTicked, true);
assert.deepEqual(trace.splice(0), [["automate"]]);
sandbox.eaExportStateLog();
assert.deepEqual(trace.splice(0), [
  ["download", '{"loaded":true}', "evolve-statelog-manual-d42.json"],
]);

console.log("Script bootstrap bundled characterization tests passed");
