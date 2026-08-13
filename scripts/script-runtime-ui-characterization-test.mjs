import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
let styleText = "";

function makeNode(label) {
  return {
    length: 1,
    on(event) {
      trace.push(`on:${label}:${event}`);
      return this;
    },
    remove() {
      trace.push(`remove:${label}`);
      return this;
    },
    before() {
      trace.push(`before:${label}`);
      return this;
    },
    val() {
      return this;
    },
    ready() {
      return this;
    },
  };
}
function jquery(value) {
  return makeNode(String(value));
}
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;

const document = {
  hidden: false,
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: (tag) => ({
    tag,
    appendChild(node) {
      styleText = node.textContent;
    },
  }),
  createTextNode: (text) => ({ textContent: text }),
  head: { appendChild: (node) => trace.push(`head:${node.tag}`) },
};
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  alert: () => {},
  document,
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

assert.deepEqual(Object.keys(hooks.scriptRuntimeUI), [
  "updateDebugData",
  "addScriptStyle",
  "checkIgnoredError",
  "displayScriptWarningNode",
  "addErrorHandler",
]);
const state = { forcedUpdate: false };
let forcedDuringUpdate = false;
const listeners = new Map();
const win = {
  addEventListener: (name, callback) => listeners.set(name, callback),
  Vue: { config: {} },
};
hooks.setScriptRuntimeUITestContext({
  state,
  game: {
    updateDebugData: () => {
      forcedDuringUpdate = state.forcedUpdate;
    },
  },
  win,
});

hooks.scriptRuntimeUI.updateDebugData();
assert.equal(forcedDuringUpdate, true);
assert.equal(state.forcedUpdate, false);
assert.equal(hooks.scriptRuntimeUI.checkIgnoredError(new Error("x")), false);

hooks.scriptRuntimeUI.addScriptStyle();
assert.ok(styleText.length > 10_000);
assert.match(styleText, /script-collapsible/);
assert.match(styleText, /html\.dark/);
assert.ok(trace.includes("head:style"));

trace.length = 0;
hooks.scriptRuntimeUI.displayScriptWarningNode("Warning", "Message", "stack");
assert.ok(trace.includes("remove:#script-script-warning"));
assert.ok(trace.some((entry) => entry.endsWith(":click")));
assert.ok(trace.includes("before:#versionLog"));

hooks.scriptRuntimeUI.addErrorHandler();
assert.equal(typeof listeners.get("error"), "function");
assert.equal(typeof win.Vue.config.errorHandler, "function");

console.log("Script runtime UI bundled characterization tests passed");
