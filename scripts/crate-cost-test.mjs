import assert from "node:assert/strict";

import { crateCost } from "../src/domain/economy/storage/crate-cost.ts";

// Transcribed from Evolve's `crate()`. `iron_wood` is an unconditional override of the resource,
// and the price is 200 whenever any of the three traits is present.
const cases = [
  [
    { smoldering: false, kindlingKindred: false, ironWood: false },
    { Plywood: 10 },
  ],
  [
    { smoldering: true, kindlingKindred: false, ironWood: false },
    { Chrysotile: 200 },
  ],
  [
    { smoldering: false, kindlingKindred: true, ironWood: false },
    { Stone: 200 },
  ],
  // iron_wood alone, with no warlord and no other trait: Lumber at 200, not Plywood at 10.
  [
    { smoldering: false, kindlingKindred: false, ironWood: true },
    { Lumber: 200 },
  ],
  [
    { smoldering: true, kindlingKindred: false, ironWood: true },
    { Lumber: 200 },
  ],
  [
    { smoldering: false, kindlingKindred: true, ironWood: true },
    { Lumber: 200 },
  ],
];

for (const [race, expected] of cases) {
  assert.deepEqual(
    crateCost(race),
    expected,
    `crateCost(${JSON.stringify(race)})`,
  );
}

console.log("Crate cost tests passed");
