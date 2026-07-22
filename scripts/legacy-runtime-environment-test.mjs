import assert from "node:assert/strict";

import { createLegacyRuntimeEnvironment } from "../src/adapters/browser/legacy-runtime-environment.ts";

const document = { id: "document" };
const storage = { id: "storage" };
const calls = [];
const window = { document, navigator: { platform: "Win32" }, location: "game" };
const globalObject = {
  window,
  document,
  localStorage: storage,
  MutationObserver: class MutationObserver {},
  ResizeObserver: class ResizeObserver {},
  HTMLElement: class HTMLElement {},
  KeyboardEvent: class KeyboardEvent {},
  Node: class Node {},
  Sortable: class Sortable {},
  setTimeout(callback, delay) {
    calls.push(["timeout", delay]);
    callback();
  },
  setInterval(callback, delay) {
    calls.push(["interval", delay]);
    callback();
  },
  alert(message) {
    calls.push(["alert", message]);
  },
  confirm(message) {
    calls.push(["confirm", message]);
    return false;
  },
  console: {
    log(...values) {
      calls.push(["log", ...values]);
    },
    error(...values) {
      calls.push(["error", ...values]);
    },
  },
};

const environment = createLegacyRuntimeEnvironment(globalObject);
assert.equal(environment.document, document);
assert.equal(environment.window, window);
assert.equal(environment.storage, storage);
assert.equal(typeof environment.MutationObserver, "function");
assert.equal(typeof environment.ResizeObserver, "function");
assert.equal(typeof environment.HTMLElement, "function");
assert.equal(typeof environment.KeyboardEvent, "function");
assert.equal(typeof environment.Node, "function");
assert.equal(typeof environment.Sortable, "function");

environment.schedule(() => calls.push(["scheduled"]), 10);
environment.repeat(() => calls.push(["repeated"]), 20);
environment.alert("warning");
assert.equal(environment.confirm("question"), false);
environment.log("hello", 1);
environment.error("failure");
assert.deepEqual(calls, [
  ["timeout", 10],
  ["scheduled"],
  ["interval", 20],
  ["repeated"],
  ["alert", "warning"],
  ["confirm", "question"],
  ["log", "hello", 1],
  ["error", "failure"],
]);

const absent = createLegacyRuntimeEnvironment({});
assert.equal(absent.window !== undefined, true);
assert.doesNotThrow(() => absent.schedule(() => {}, 0));
assert.doesNotThrow(() => absent.repeat(() => {}, 0));
assert.equal(absent.confirm("missing"), true);

console.log("Legacy runtime browser environment adapter tests passed");
