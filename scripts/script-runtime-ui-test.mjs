import assert from "node:assert/strict";

import { createScriptRuntimeUI } from "../src/ui/script-runtime.ts";

const trace = [];
let state = { forcedUpdate: false };
let game = {
  updateDebugData: () => trace.push(`update:${state.forcedUpdate}`),
};
const listeners = new Map();
const win = {
  addEventListener: (name, callback) => listeners.set(name, callback),
  Vue: { config: {} },
};
let styleText = "";
const document = {
  createElement: () => ({
    appendChild: (node) => {
      styleText = node.text;
    },
  }),
  createTextNode: (text) => ({ text }),
  getElementsByTagName: () => [{ appendChild: () => trace.push("style") }],
};
const nodes = [];
function jquery(label) {
  const node = {
    label,
    appended: [],
    handlers: new Map(),
    value: null,
    append(child) {
      node.appended.push(child);
      return node;
    },
    before(child) {
      trace.push(`before:${label}:${child.label}`);
      return node;
    },
    on(events, handler) {
      node.handlers.set(events, handler);
      return node;
    },
    remove() {
      trace.push(`remove:${label}`);
      return node;
    },
    val(value) {
      node.value = value;
      return node;
    },
  };
  nodes.push(node);
  return node;
}
const warned = [];

const runtime = createScriptRuntimeUI({
  getJQuery: () => jquery,
  getDocument: () => document,
  getState: () => state,
  getGame: () => game,
  getWin: () => win,
  getCreateOptionsModal: () => () => trace.push("modal"),
  getOpenOptionsModal: () => (title, builder) => {
    trace.push(`open:${title}`);
    const modal = jquery("modal");
    builder(modal);
    warned.push(modal.appended[0].value);
  },
  getScriptVersionExtra: () => "test",
  getScriptVersion: () => "3.3.2-test",
});

runtime.updateDebugData();
assert.deepEqual(trace, ["update:true"]);
assert.equal(state.forcedUpdate, false);
state = { forcedUpdate: false };
game = {
  updateDebugData: () => trace.push(`replacement:${state.forcedUpdate}`),
};
runtime.updateDebugData();
assert.equal(trace.at(-1), "replacement:true");

runtime.addScriptStyle();
assert.ok(styleText.length > 10_000);
assert.ok(trace.includes("style"));
runtime.addErrorHandler();
assert.equal(typeof listeners.get("error"), "function");
assert.equal(typeof win.Vue.config.errorHandler, "function");
assert.equal(runtime.checkIgnoredError("ordinary error"), false);
assert.equal(runtime.checkIgnoredError(new Error("thrown")), false);

// The warning replaces any warning already showing and attaches itself beside the version log.
trace.length = 0;
nodes.length = 0;
runtime.displayScriptWarningNode("Script Error", "boom", "at line 1");
const clickable = nodes.find((node) => node.label.includes("⚠️ Script Error"));
assert.ok(clickable);
assert.deepEqual(trace, [
  "remove:#script-script-warning",
  `before:#versionLog:${clickable.label}`,
]);

// Clicking it opens the options modal on a text area holding the message, the stack, and the version.
clickable.handlers.get("click")();
assert.deepEqual(trace.slice(2), [
  "modal",
  "open:Script Notice: Script Error",
  `remove:${clickable.label}`,
]);
assert.equal(
  warned.at(-1),
  "boom\n\nStack info:\nat line 1\n\nScript version: 3.3.2-test test\n",
);

// The message only reaches the modal when the player clicks the warning.
function openLatestWarning() {
  nodes
    .filter((node) => node.label.includes("⚠️"))
    .at(-1)
    .handlers.get("click")();
  return warned.at(-1);
}

// A window error reports where it happened; a Vue error reports its own stack.
listeners.get("error")({
  message: "bad",
  filename: "evolve.js",
  lineno: 4,
  colno: 2,
  error: { stack: "at evolve" },
});
assert.equal(
  openLatestWarning(),
  "bad in evolve.js:4:2.\n\nStack info:\nat evolve\n\nScript version: 3.3.2-test test\n",
);

const vueError = new Error("vue broke");
vueError.stack = "at vue";
win.Vue.config.errorHandler(vueError);
assert.equal(
  openLatestWarning(),
  "Vue error: Error: vue broke\n\nStack info:\nat vue\n\nScript version: 3.3.2-test test\n",
);

console.log("Script runtime UI module tests passed");
