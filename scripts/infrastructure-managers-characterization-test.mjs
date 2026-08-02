import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
const elements = {};
const selectors = {};
const observers = [];
const documentStub = {
  getElementById: (id) => elements[id] ?? null,
  querySelector: (selector) => selectors[selector] ?? null,
  dispatchEvent: (event) => trace.push(["dispatch", event.type, event.key]),
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  document: documentStub,
  KeyboardEvent: class {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  },
  localStorage: { getItem: () => null },
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
    }
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  cloneInto: (value) => value,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const { KeyManager, GameLog } = hooks.infrastructureManagers;
const gameModal = hooks.gameModal;
const keyEvents = {
  keydown: [{ handler: (event) => trace.push(["down", event.key]) }],
  keyup: [{ handler: (event) => trace.push(["up", event.key]) }],
  mousemove: [{ handler: (event) => trace.push(["all", { ...event }]) }],
};
const win = {
  document: documentStub,
  $: { _data: () => ({ events: keyEvents }) },
};
const game = {
  global: {
    settings: {
      mKeys: true,
      keyMap: { x100: "Shift", x25: "Control", x10: "Alt" },
    },
  },
};
const settings = {
  logEnabled: true,
  log_special: true,
  log_attack: false,
};
hooks.setInfrastructureManagersTestContext({
  game,
  settings,
  poly: {
    messageQueue: (...args) => trace.push(["message", ...args]),
  },
  win,
  needSandboxBypass: false,
});

// The bundled modal adapter drives one whole open/act/close cycle off the page.
selectors["#factory .special"] = { click: () => trace.push(["open-click"]) };
selectors[".modal .modal-close"] = { click: () => trace.push(["close-click"]) };
assert.equal(gameModal.canOpen("#factory .special"), true);
assert.equal(gameModal.isOpen(), false);
let callbackCount = 0;
gameModal.open({
  triggerSelector: "#factory .special",
  title: "Factory",
  action: () => {
    callbackCount++;
    trace.push(["callback"]);
  },
});
assert.equal(gameModal.isOpen(), true);
assert.equal(gameModal.isAwaitingScriptModal(), true);

const modalElement = { style: { display: "" } };
gameModal.captureScriptModal(modalElement);
assert.equal(modalElement.style.display, "none");
assert.equal(observers.at(-1).target, modalElement);
assert.equal(observers.at(-1).options.childList, true);
assert.equal(observers.at(-1).options.subtree, true);

// Vue mounts the shell before its title, so the first mutation must not consume
// the pending action.
observers.at(-1).callback();
assert.equal(callbackCount, 0);
assert.equal(gameModal.isAwaitingScriptModal(), true);

elements.modalBoxTitle = { textContent: "Factory - 10/20" };
observers.at(-1).callback();
assert.equal(callbackCount, 1);
assert.equal(gameModal.isAwaitingScriptModal(), false);
delete elements.modalBoxTitle;

KeyManager.init();
KeyManager.reset();
assert.equal(KeyManager._mode, "all");
assert.deepEqual([...KeyManager.click(26_360)], [1_360, 360, 110, 10, 0]);
KeyManager.finish();

GameLog.logInfo("special", "hello", ["tag"]);
GameLog.logSuccess("attack", "hidden", ["tag"]);
GameLog.logWarning("special", "careful", ["tag"]);
GameLog.logDanger("special", "danger", ["tag"]);

assert.deepEqual(JSON.parse(JSON.stringify(trace)), [
  ["open-click"],
  ["callback"],
  ["close-click"],
  ["all", { shiftKey: true, ctrlKey: true, altKey: true }],
  ["all", { shiftKey: true, ctrlKey: false, altKey: true }],
  ["all", { shiftKey: false, ctrlKey: true, altKey: true }],
  ["all", { shiftKey: true, ctrlKey: false, altKey: false }],
  ["all", { shiftKey: false, ctrlKey: false, altKey: true }],
  ["all", { shiftKey: false, ctrlKey: false, altKey: false }],
  ["message", "hello", "info", false, ["tag"]],
  ["message", "careful", "warning", false, ["tag"]],
  ["message", "danger", "danger", false, ["tag"]],
]);

console.log("Infrastructure manager bundled characterization tests passed");
