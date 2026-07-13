import assert from "node:assert/strict";

import { createPropertyHelpers } from "../src/utils/properties.ts";

let settings = { enabled_A: true };
const helpers = createPropertyHelpers({ getSettings: () => settings });

const target = {
  base: 4,
  value() {
    return this.base * 2;
  },
  child: {
    base: 3,
    value() {
      return this.base + 1;
    },
  },
};
assert.equal(helpers.normalizeProperties(target), target);
assert.equal(target.value, 8);
assert.equal(target.child.value, 4);
target.base = 5;
assert.equal(target.value, 10);

const list = { A: { id: "A" } };
assert.equal(
  helpers.addProps(list, (item) => item.id, [{ s: "enabled_", p: "enabled" }]),
  list,
);
assert.equal(list.A.enabled, true);
settings = { enabled_A: false };
assert.equal(list.A.enabled, false);

console.log("Property helper module tests passed");
