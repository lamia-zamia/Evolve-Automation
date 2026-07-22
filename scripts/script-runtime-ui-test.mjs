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
function jquery(label) {
  return {
    remove: () => trace.push(`remove:${label}`),
    on: () => this,
    before: () => trace.push(`before:${label}`),
  };
}

const runtime = createScriptRuntimeUI({
  getJQuery: () => jquery,
  getDocument: () => document,
  getState: () => state,
  getGame: () => game,
  getWin: () => win,
  getCreateOptionsModal: () => () => trace.push("modal"),
  getOpenOptionsModal: () => () => trace.push("open"),
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

console.log("Script runtime UI module tests passed");
