import assert from "node:assert/strict";
import { createScriptBootstrap } from "../src/game/script-bootstrap.ts";

const trace = [];
const observers = [];
const elements = {};
const documentStub = {
  body: { appendChild: (node) => trace.push(["append", node]) },
  createElement: () => ({}),
  getElementById: (id) => elements[id] ?? null,
  querySelector: (selector) => (selector === "body" ? documentStub.body : null),
};
class Observer {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target, options) {
    observers.push({ callback: this.callback, target, options });
  }
}
class Technology {
  constructor(id) {
    this.id = id;
  }
}
const jquery = () => ({});
jquery.ui = {};
jquery._data = () => ({ events: { keydown: [{}] } });
jquery.noConflict = () => trace.push(["no-conflict"]);

const context = {
  game: null,
  techIds: {},
  Technology,
  buildings: {
    BlackholeJumpShip: { _vueBinding: "jump", isMission: () => true },
    PitAssaultForge: { _vueBinding: "assault", isMission: () => true },
  },
  buildingIds: {},
  state: {
    missionBuildingList: [],
    warnDebug: true,
    warnPreload: true,
    gameTicked: false,
  },
  projects: {},
  arpaIds: {},
  jobs: {},
  jobIds: {},
  crafter: {},
  TriggerManager: { priorityList: [] },
  checkActions: false,
  MutationObserver: Observer,
  document: documentStub,
  Node: { ELEMENT_NODE: 1 },
  WindowManager: { openedByScript: false, checkCallbacks() {} },
  $: jquery,
  window: { $: jquery, document: documentStub },
  userscriptEnvironment: {
    pageWindow: undefined,
    capabilities: {
      hasPageWindow: false,
      needsSandboxBridge: false,
    },
    exportToPage: (value) => value,
  },
  win: {},
  needSandboxBypass: false,
  poly: { messageQueue() {} },
  settings: { tickSchedule: true },
  safeMode: false,
};
const tooltip = () => trace.push(["tooltip"]);
const filterLog = () => trace.push(["filter"]);
let expectedActionContext;
const actions = {
  updateStandAloneSettings: () => trace.push(["standalone"]),
  updateStateFromSettings: () => trace.push(["state-settings"]),
  updateSettingsFromState: () => trace.push(["settings-state"]),
  verifyGameActions: () => trace.push(["verify"]),
  tooltipObserverCallback: tooltip,
  buildFilterRegExp: () => trace.push(["build-filter"]),
  filterLog,
  schedule: (callback, delay) => trace.push(["schedule", callback.name, delay]),
  repeat: (callback, delay) => trace.push(["repeat", callback.name, delay]),
  alert: (message) => trace.push(["alert", message]),
  addErrorHandler: () => {
    if (expectedActionContext) {
      assert.equal(context.win, expectedActionContext.win);
      assert.equal(context.game, expectedActionContext.game);
      assert.equal(
        context.needSandboxBypass,
        expectedActionContext.needSandboxBypass,
      );
    }
    trace.push(["errors"]);
  },
  addScriptStyle: () => trace.push(["style"]),
  keyManagerInit: () => trace.push(["keys"]),
  initialiseState: () => trace.push(["state"]),
  initialiseRaces: () => trace.push(["races"]),
  updateOverrides: () => trace.push(["overrides"]),
  automate: () => trace.push(["automate"]),
  automateLab: () => trace.push(["lab"]),
  importSettings() {},
  exportSettings() {},
  loadStateLog: () => [],
  triggerFileDownload() {},
  displayScriptWarningNode() {},
};
const { initialiseScript, mainAutoEvolveScript } = createScriptBootstrap({
  getContext: () => context,
  getActions: () => actions,
  setWin: (value) => (context.win = value),
  setGame: (value) => (context.game = value),
  setNeedSandboxBypass: (value) => (context.needSandboxBypass = value),
});

elements.main = {};
elements.msgQueueLog = {};
elements.modalBox = {};
context.game = { actions: { tech: {} } };
initialiseScript();
const bodyObserver = observers.find(
  ({ target }) => target === documentStub.body,
);
assert.ok(bodyObserver);
const scriptModal = {
  nodeType: 1,
  classList: { contains: () => true },
  style: {},
};
context.WindowManager.openedByScript = true;
bodyObserver.callback([{ addedNodes: [scriptModal] }]);
assert.equal(scriptModal.style.display, "none");
assert.equal(observers.at(-1).callback, context.WindowManager.checkCallbacks);
const userModal = {
  nodeType: 1,
  classList: { contains: () => true },
  style: {},
};
context.WindowManager.openedByScript = false;
bodyObserver.callback([{ addedNodes: [userModal] }]);
assert.equal(observers.at(-1).callback, tooltip);

elements.queueColumn = {};
const game = {
  actions: { tech: {} },
  global: { settings: { tabLoad: true }, stats: { days: 1 } },
  breakdown: { p: { consume: {} } },
};
mainAutoEvolveScript();
assert.deepEqual(trace.splice(-2), [
  ["alert", "You need to enable Debug Mode in settings for script to work"],
  ["schedule", "mainAutoEvolveScript", 100],
]);
context.window.evolve = game;
game.global.race = {};
game.global.settings.tabLoad = false;
mainAutoEvolveScript();
assert.deepEqual(trace.splice(-2), [
  [
    "alert",
    "You need to enable Preload Tab Content in settings for script to work",
  ],
  ["schedule", "mainAutoEvolveScript", 100],
]);

// Missing jQuery UI injects the dependency and preserves the wrapped callback name.
game.global.settings.tabLoad = true;
jquery.ui = undefined;
mainAutoEvolveScript();
const appended = trace.at(-1)[1];
assert.equal(trace.at(-1)[0], "append");
assert.equal(
  appended.src,
  "https://code.jquery.com/ui/1.12.1/jquery-ui.min.js",
);
assert.equal(appended.onload.name, "mainAutoEvolveScript");
appended.onerror();
assert.match(trace.at(-1)[1], /Can't load jQuery UI/);

// Successful Firefox-style sandbox bootstrap exports both breakdown callbacks.
jquery.ui = {};
const pageWindow = { evolve: game };
context.userscriptEnvironment = {
  pageWindow,
  capabilities: { hasPageWindow: true, needsSandboxBridge: true },
  exportToPage: (callback) => {
    trace.push(["export-function"]);
    return callback;
  },
};
context.poly = { messageQueue() {} };
expectedActionContext = {
  win: pageWindow,
  game,
  needSandboxBypass: true,
};
mainAutoEvolveScript();
assert.equal(context.needSandboxBypass, true);
assert.equal(context.win, pageWindow);
assert.equal(trace.filter(([name]) => name === "export-function").length, 2);
game.breakdown = { p: { consume: { Food: 1 } } };
assert.deepEqual(trace.at(-1), ["schedule", "automate", undefined]);

console.log("Script bootstrap tests passed");
