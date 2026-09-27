import assert from "node:assert/strict";

import { formatGameDuration } from "../src/formatting/game-duration.ts";

assert.equal(formatGameDuration(0), "0s");
assert.equal(formatGameDuration(59.6), "1m");
assert.equal(formatGameDuration(125), "2m 5s");
assert.equal(formatGameDuration(3600), "1h");
assert.equal(formatGameDuration(90061), "1d 1h");
assert.equal(formatGameDuration(-1), "Never");
assert.equal(formatGameDuration(Number.POSITIVE_INFINITY), "∞");
assert.equal(formatGameDuration(Number.NaN), "Unavailable");

console.log("Game duration formatting tests passed");
