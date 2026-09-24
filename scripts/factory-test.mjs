import assert from "node:assert/strict";

import { createFactoryTooltipPublisher } from "../src/adapters/browser/factory-tooltips.ts";

const tooltips = {};
createFactoryTooltipPublisher(() => ({ tooltips })).publish([
  { key: "factoryIron", value: "Produces Iron" },
  { key: "factorySteel", value: "Produces Steel" },
]);
assert.deepEqual(tooltips, {
  factoryIron: "Produces Iron",
  factorySteel: "Produces Steel",
});

let stateRead = false;
createFactoryTooltipPublisher(() => {
  stateRead = true;
  return null;
}).publish([]);
assert.equal(stateRead, false);
assert.throws(
  () =>
    createFactoryTooltipPublisher(() => ({})).publish([
      { key: "x", value: "y" },
    ]),
  /state\.tooltips/,
);

console.log("Factory tooltip publisher tests passed");
