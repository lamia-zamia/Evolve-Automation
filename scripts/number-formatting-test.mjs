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

console.log("Number formatting module tests passed");
