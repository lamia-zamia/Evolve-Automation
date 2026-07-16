import assert from "node:assert/strict";

import {
  createUserscriptEnvironment,
  readAmbientUserscriptGlobals,
} from "../src/adapters/userscript/environment.ts";

const browserWindow = { name: "browser" };
const absent = createUserscriptEnvironment(browserWindow, {
  unsafeWindow: undefined,
  cloneInto: undefined,
  exportFunction: undefined,
  gmInfo: undefined,
  gm: undefined,
});
assert.equal(absent.pageWindow, browserWindow);
assert.deepEqual(absent.capabilities, {
  hasPageWindow: false,
  canCloneIntoPage: false,
  canExportToPage: false,
  needsSandboxBridge: false,
});
const original = { value: 1 };
assert.equal(absent.cloneIntoPage(original), original);
assert.equal(absent.exportToPage(original), original);
assert.equal(absent.getScriptVersion(), undefined);

const pageWindow = { name: "page" };
const bridgeTrace = [];
const sandbox = createUserscriptEnvironment(browserWindow, {
  unsafeWindow: pageWindow,
  cloneInto: (value, target, options) => {
    bridgeTrace.push(["clone", value, target, options]);
    return { cloned: value };
  },
  exportFunction: (value, target) => {
    bridgeTrace.push(["export", value, target]);
    return { exported: value };
  },
  gmInfo: { script: { version: "3.3.2-1" } },
  gm: { info: { script: { version: "fallback" } } },
});
assert.equal(sandbox.pageWindow, pageWindow);
assert.deepEqual(sandbox.capabilities, {
  hasPageWindow: true,
  canCloneIntoPage: true,
  canExportToPage: true,
  needsSandboxBridge: true,
});
assert.deepEqual(sandbox.cloneIntoPage(original, { cloneFunctions: true }), {
  cloned: original,
});
assert.deepEqual(sandbox.exportToPage(original), { exported: original });
assert.deepEqual(bridgeTrace, [
  ["clone", original, pageWindow, { cloneFunctions: true }],
  ["export", original, pageWindow],
]);
assert.equal(sandbox.getScriptVersion(), "3.3.2-1");

const sameWindow = createUserscriptEnvironment(browserWindow, {
  unsafeWindow: browserWindow,
  cloneInto: () => {
    throw new Error("same-window bridge must not run");
  },
  exportFunction: () => {
    throw new Error("same-window bridge must not run");
  },
  gmInfo: undefined,
  gm: { info: { script: { version: "4.0.0" } } },
});
assert.equal(sameWindow.capabilities.needsSandboxBridge, false);
assert.equal(sameWindow.cloneIntoPage(original), original);
assert.equal(sameWindow.getScriptVersion(), "4.0.0");

const throwingGlobals = {};
for (const name of [
  "unsafeWindow",
  "cloneInto",
  "exportFunction",
  "gmInfo",
  "gm",
]) {
  Object.defineProperty(throwingGlobals, name, {
    get() {
      throw new Error(`broken ${name}`);
    },
  });
}
const malformed = createUserscriptEnvironment(browserWindow, throwingGlobals);
assert.equal(malformed.pageWindow, browserWindow);
assert.equal(malformed.capabilities.needsSandboxBridge, false);
assert.equal(malformed.getScriptVersion(), undefined);

const ambient = readAmbientUserscriptGlobals();
assert.equal(typeof ambient, "object");
assert.equal(Object.isFrozen(ambient), true);

console.log("Userscript environment adapter tests passed");
