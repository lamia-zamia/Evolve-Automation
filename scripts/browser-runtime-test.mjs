import assert from "node:assert/strict";

import { createBrowserRuntime } from "../src/browser/runtime.ts";

let element = { __vue__: { id: "first" } };
let mainElement = { __vue_proxy__: { id: "main" } };
let document = {
  getElementById: () => element,
  querySelector: () => mainElement,
  createElement: () => ({ download: "", href: "", click() {} }),
};
const trace = [];
let scheduled;
class TestBlob {
  constructor(parts) {
    this.parts = parts;
  }
}
const runtime = createBrowserRuntime({
  getWin: () => ({ document }),
  getDocument: () => document,
  getUrlApi: () => ({
    createObjectURL: (blob) => {
      trace.push(blob.parts[0]);
      return "blob:module";
    },
    revokeObjectURL: (url) => trace.push(url),
  }),
  getBlobConstructor: () => TestBlob,
  schedule: (callback, delay) => {
    scheduled = { callback, delay };
  },
});

assert.equal(runtime.getVueById("id").id, "first");
element = { __vue__: { id: "replacement" } };
assert.equal(runtime.getVueById("id").id, "replacement");
assert.equal(runtime.getMainVue().id, "main");
element = { __vue_app__: { _instance: { proxy: { id: "app" } } } };
assert.equal(runtime.getVueById("id").id, "app");
assert.equal(
  runtime.resolveVueMethod({ value: () => "method" }, "value")(),
  "method",
);
runtime.triggerFileDownload("data", "file.txt");
assert.equal(trace[0], "data");
assert.equal(scheduled.delay, 60_000);
scheduled.callback();
assert.equal(trace[1], "blob:module");

console.log("Browser runtime module tests passed");
