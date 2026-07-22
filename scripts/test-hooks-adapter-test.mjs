import assert from "node:assert/strict";

import { readTestHooks } from "../src/adapters/userscript/test-hooks.ts";

const hooks = {};
const browserGlobal = { __EA_TEST_HOOKS__: hooks };
assert.equal(readTestHooks(browserGlobal), hooks);

assert.equal(readTestHooks({}), undefined);
assert.equal(readTestHooks(undefined), undefined);
assert.equal(readTestHooks(null), undefined);
assert.equal(readTestHooks({ __EA_TEST_HOOKS__: null }), undefined);
assert.equal(readTestHooks({ __EA_TEST_HOOKS__: [] }), undefined);
assert.equal(readTestHooks({ __EA_TEST_HOOKS__: "hooks" }), undefined);

const getterGlobal = {};
Object.defineProperty(getterGlobal, "__EA_TEST_HOOKS__", {
  get() {
    throw new Error("broken test hooks");
  },
});
assert.equal(readTestHooks(getterGlobal), undefined);

console.log("Test hooks adapter tests passed");
