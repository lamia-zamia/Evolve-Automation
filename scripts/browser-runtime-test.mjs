import assert from "node:assert/strict";

import { createBrowserRuntime } from "../src/browser/runtime.ts";

let element = { __vue__: { id: "first" } };
let document = {
  getElementById: () => element,
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
runtime.triggerFileDownload("data", "file.txt");
assert.equal(trace[0], "data");
assert.equal(scheduled.delay, 60_000);
scheduled.callback();
assert.equal(trace[1], "blob:module");

console.log("Browser runtime module tests passed");
