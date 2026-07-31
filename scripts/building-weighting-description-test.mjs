import assert from "node:assert/strict";
import { createBuildingWeightingDescriber } from "../src/ui/building-weighting-description.ts";

const formatted = [];
const describer = createBuildingWeightingDescriber({
  formatNiceNumber: (value) => {
    formatted.push(value);
    return Math.round(value * 100) / 100;
  },
});

const decision = (weight, notes) =>
  Object.freeze({
    weight,
    annotations: Object.freeze(
      notes.map((note, index) => ({ ruleId: `rule${index}`, note })),
    ),
  });

// A wanted candidate leads with its weight, then the notes, one line each.
assert.equal(
  describer.describe("Barracks", decision(12.345, ["Needs power", "Queued"])),
  "AutoBuild weighting: 12.35<br>Needs power<br>Queued<br>",
);
assert.equal(
  describer.describe("Mine", decision(3, [])),
  "AutoBuild weighting: 3<br>",
);

// A candidate the rules ruled out shows only why, and is never formatted.
formatted.length = 0;
assert.equal(describer.describe("Bank", decision(0, ["Locked"])), "Locked<br>");
assert.equal(describer.describe("Shed", decision(0, [])), "");
assert.deepEqual(formatted, []);

// The weight is formatted once per candidate until it changes, and each
// candidate is cached separately.
formatted.length = 0;
describer.describe("Barracks", decision(12.345, []));
describer.describe("Barracks", decision(12.345, ["Now with a note"]));
assert.deepEqual(formatted, [], "an unchanged weight reuses its formatting");
describer.describe("Barracks", decision(99, []));
describer.describe("Mine", decision(12.345, []));
describer.describe("Barracks", decision(12.345, []));
assert.deepEqual(
  formatted,
  [99, 12.345, 12.345],
  "a changed weight is reformatted, and caching is per candidate",
);

console.log("Building weighting description tests passed");
