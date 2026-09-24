import assert from "node:assert/strict";

import { createCapturedRuntimeBrowserEnvironment } from "../src/adapters/browser/captured-runtime-browser-environment.ts";

const document = { id: "document" };
const storage = { id: "storage" };
const calls = [];
const keyboardEvent = class KeyboardEvent {};
const mouseEvent = class MouseEvent {};
const consoleObject = {
  log(...values) {
    assert.equal(this, consoleObject);
    calls.push(["log", ...values]);
  },
  error(...values) {
    assert.equal(this, consoleObject);
    calls.push(["error", ...values]);
  },
};

const environment = createCapturedRuntimeBrowserEnvironment({
  document,
  localStorage: storage,
  KeyboardEvent: keyboardEvent,
  MouseEvent: mouseEvent,
  console: consoleObject,
});
assert.equal(environment.document, document);
assert.equal(environment.storage, storage);
assert.equal(environment.keyboardEvent, keyboardEvent);
assert.equal(environment.mouseEvent, mouseEvent);
environment.log("ready", 1);
environment.logError("failure");
assert.deepEqual(calls, [
  ["log", "ready", 1],
  ["error", "failure"],
]);

const absent = createCapturedRuntimeBrowserEnvironment({});
assert.equal(absent.document, undefined);
assert.equal(absent.storage, undefined);
assert.equal(absent.keyboardEvent, undefined);
assert.equal(absent.mouseEvent, undefined);
assert.doesNotThrow(() => absent.log("missing"));
assert.doesNotThrow(() => absent.logError("missing"));

console.log("Captured runtime browser environment adapter tests passed");
