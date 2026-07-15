import assert from "node:assert/strict";

import {
  createDependencyResolver,
  liveFunction,
  liveObject,
} from "../src/ui/dependencies.ts";

const overrides = {};
let current = { value: 1 };
const resolve = createDependencyResolver(overrides, {
  object: () => current,
  fn: () => (value) => current.value + value,
});

assert.equal(resolve("object"), current);
assert.equal(resolve("missing"), undefined);
const object = liveObject(() => resolve("object"));
const fn = liveFunction(() => resolve("fn"));
assert.equal(object.value, 1);
assert.equal(fn(2), 3);

current = { value: 10 };
assert.equal(object.value, 10);
assert.equal(fn(2), 12);
overrides.object = { value: 20 };
overrides.fn = (value) => 30 + value;
assert.equal(object.value, 20);
assert.equal(fn(2), 32);

console.log("UI dependency adapter tests passed");
