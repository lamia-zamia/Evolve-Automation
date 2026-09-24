import assert from "node:assert/strict";

import { createNumberFormatting } from "../src/formatting/numbers.ts";

const formatting = createNumberFormatting({
  numberSuffix: { K: 10, M: 100 },
});

assert.equal(formatting.getRealNumber("2K"), 20);
assert.equal(formatting.getRealNumber("2X"), 2);
assert.equal(formatting.getNumberString(100), "10.0K");
assert.equal(formatting.getNumberString(101), "1.0M");
assert.equal(formatting.getNiceNumber(1.005), 1);
assert.deepEqual(
  ["", "42", "1.5K", "2M", "-3K"].map(formatting.getRealNumber),
  [0, 42, 15, 200, -30],
);
assert.deepEqual([0, 10, 11, 150, -1.2].map(formatting.getNumberString), [
  0,
  10,
  "1.1K",
  "1.5M",
  -1,
]);
assert.deepEqual(
  [0.00456, 0.999, 1.234, 12.999].map(formatting.getNiceNumber),
  [0.0046, 1, 1.23, 13],
);

console.log("Number formatting module tests passed");
