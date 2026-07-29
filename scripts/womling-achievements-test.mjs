import assert from "node:assert/strict";

import { createWomlingAchievements } from "../src/game/womling-achievements.ts";

let stats = {};
let universe = "m";

const { womlingStatEarned } = createWomlingAchievements({
  getGame: () => ({ global: { stats } }),
  getPoly: () => ({ universeAffix: () => universe }),
});

// Each stat is a per-universe count, so it counts as earned once it is nonzero
// in the universe this run is playing.
stats = { womling: { friend: { m: 3 }, god: { h: 1 }, lord: { m: 0 } } };
assert.equal(womlingStatEarned("friend"), true);
assert.equal(womlingStatEarned("god"), false);
assert.equal(womlingStatEarned("lord"), false);
universe = "h";
assert.equal(womlingStatEarned("friend"), false);
assert.equal(womlingStatEarned("god"), true);

// The womling stats branch does not exist until a run meets the womlings, and
// an absent branch or stat simply means nothing is earned yet.
universe = "m";
stats = { womling: { friend: { m: 1 } } };
assert.equal(womlingStatEarned("god"), false);
stats = {};
assert.equal(womlingStatEarned("friend"), false);

console.log("Womling achievement module tests passed");
